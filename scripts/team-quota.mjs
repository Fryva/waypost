// Quota is account availability, not model capability. Only host-owned provider
// collectors mint observations; persisted records are authenticated by the log.
import { rankParticipant, validatePolicy } from './team.mjs';
import { routingDigest } from './model-routing.mjs';

const minted = new WeakMap();
const key = model => JSON.stringify([model?.provider,model?.model_id,model?.reasoning]);
function fail(code) { throw new Error('quota-'+code); }
function text(v,max=256) { return typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v); }
function ms(raw=Date.now()) { const value=typeof raw==='object'&&raw!==null?raw.now:raw; if (!Number.isFinite(value)) fail('clock-required'); return value; }
function freeze(v) { if (v&&typeof v==='object') { for(const x of Object.values(v))freeze(x);Object.freeze(v); }return v; }
function https(value) { let u;try{u=new URL(value);}catch{fail('provider-source-required');}if(!text(value,2048)||u.protocol!=='https:'||u.username||u.password||u.search||u.hash)fail('provider-source-required');return u; }

// Validation does not confer collector authority or mint a serializable proof.
// `requireFresh:false` is only for previously admitted exhaustion, never recovery.
export function validateQuotaObservation(raw,{participant,now=Date.now(),requireFresh=true}={}) {
 const clock=ms(now);
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Buffer.byteLength(JSON.stringify(raw))>16384)fail('observation-budget');
 const allowed=['protocol','participant','incarnation','model_revision','model','route','status','available_calls','provider_confirmed','evidence_kind','reason','scope','observation_id','source','observed_at','expires_at','reset_at'];
 if(Object.keys(raw).some(k=>!allowed.includes(k)))fail('unknown-observation-field');
 if(raw.protocol!==1||!text(raw.participant,128)||!text(raw.incarnation,128)||!Number.isSafeInteger(raw.model_revision)||raw.model_revision<1||!raw.model||![raw.model.provider,raw.model.model_id,raw.model.reasoning].every(v=>text(v)))fail('execution-identity-required');
 if(participant&&(raw.participant!==participant.id||raw.incarnation!==participant.incarnation||raw.model_revision!==participant.model?.model_revision||key(raw.model)!==key(participant.model)))fail('execution-identity-mismatch');
 if(Object.keys(raw.model).some(k=>!['provider','model_id','reasoning'].includes(k)))fail('unknown-model-field');
 const route=raw.route;
 if(!route||typeof route!=='object'||Array.isArray(route)||!['endpoint','account','sku','mode','pool'].every(k=>text(route[k],1024))||!['api','subscription','free'].includes(route.mode)||key(route.model)!==key(raw.model))fail('billing-route-required');
 if(Object.keys(route).some(k=>!['endpoint','account','sku','mode','pool','model'].includes(k))||Object.keys(route.model).some(k=>!['provider','model_id','reasoning'].includes(k)))fail('unknown-billing-route-field');
 const origin=https(route.endpoint),source=https(raw.source);
 if(origin.origin!==source.origin)fail('provider-source-route-mismatch');
 if(raw.provider_confirmed!==true||!['provider-quota','structured-native-refusal'].includes(raw.evidence_kind))fail('provider-confirmation-required');
 if(!text(raw.observation_id,256)||!['provider-account-model','provider-account','provider-quota-pool'].includes(raw.scope)||raw.reason!==(raw.status==='exhausted'?'provider-quota-exhausted':'provider-quota-available'))fail('provider-quota-scope-or-reason-required');
 if(!['available','exhausted'].includes(raw.status)||!Number.isSafeInteger(raw.available_calls)||raw.available_calls<0||(raw.status==='exhausted')!==(raw.available_calls===0)||(raw.evidence_kind==='structured-native-refusal'&&raw.status!=='exhausted'))fail('confirmed-quota-status-required');
 const observed=Date.parse(raw.observed_at),expires=Date.parse(raw.expires_at);
 if(typeof raw.observed_at!=='string'||typeof raw.expires_at!=='string'||!Number.isFinite(observed)||!Number.isFinite(expires)||observed>clock||expires<=observed||expires-observed>60000||(requireFresh&&(clock-observed>30000||expires<=clock)))fail('observation-stale-or-future');
 if(raw.reset_at!==undefined&&(typeof raw.reset_at!=='string'||!Number.isFinite(Date.parse(raw.reset_at))))fail('invalid-reset-time');
 return structuredClone(raw);
}

export async function collectQuotaObservation({participant,observe,now=Date.now()}={}) {
 if(typeof observe!=='function')fail('trusted-observer-required');
 if(!participant||!text(participant.id,128)||!text(participant.incarnation,128)||!participant.model)fail('participant-required');
 // The callback must inspect a provider quota endpoint or documented structured
 // native refusal. UI percentages, self reports and generic 429 are not proof.
 const raw=await observe({participant:participant.id,incarnation:participant.incarnation,model_revision:participant.model.model_revision,model:{provider:participant.model.provider,model_id:participant.model.model_id,reasoning:participant.model.reasoning}});
 const value=validateQuotaObservation(raw,{participant,now:typeof now==='function'?now():now});
 freeze(value);minted.set(value,routingDigest(value));return value;
}
export function serializeQuotaObservation(record) {
 const proof=minted.get(record);
 if(!proof||proof!==routingDigest(record))fail('collector-provenance-required');
 return structuredClone(record);
}
function confirmed(p,now) { try{return validateQuotaObservation(p.quota_observation,{participant:p,now,requireFresh:false});}catch{return null;} }
export function quotaEligible(participant,now=Date.now()) {
 const clock=ms(now);
 if(!participant?.quota_observation)return true;
 const record=confirmed(participant,clock);
 if(!record||record.status==='exhausted')return false;
 // Old positive quota is not a fresh permission to spend. An expired negative
 // observation or reset time can never become a positive observation by age.
 return Date.parse(record.expires_at)>clock&&record.available_calls>0;
}

export function effectiveReviewFloor(team,now=Date.now()) {
 const clock=ms(now),result={floor:team.review_floor??null,blocked:team.review_blocker??null,exhausted_identities:[],preserved_identities:[]};
 const required=Array.isArray(team.required_review_models)?structuredClone(team.required_review_models):[];
 result.preserved_identities=required;
 if(team.quota_policy?.protocol!==1||team.quota_policy.automatic_redistribution!==true)return result;
 let policy;try{policy=validatePolicy(team.policy);}catch{return {...result,floor:null,blocked:'model-policy-invalid'};}
 if(policy.mode==='automatic'&&(Date.parse(policy.generated_at)>clock||Date.parse(policy.expires_at)<=clock))return {...result,floor:null,blocked:'model-policy-expired'};
 const participants=Object.values(team.participants||{}),identities=new Map();
 for(const identity of required) {
  if(!Array.isArray(identity)||identity.length!==3||identity.some(x=>!text(x)))return {...result,floor:null,blocked:'historical-review-identity-invalid'};
  identities.set(JSON.stringify(identity),identity);
 }
 // Include currently classified identities when finding the strongest remaining
 // cohort. No availability/revocation flag substitutes for provider exhaustion.
 for(const p of participants)if(rankParticipant(p,policy,'review',{now:clock})!==null)identities.set(key(p.model),[p.model.provider,p.model.model_id,p.model.reasoning]);
 const remaining=[],exhausted=[],missingAdmissions=[];
 for(const [modelKey,identity]of identities) {
  const matching=participants.filter(p=>key(p.model)===modelKey),live=matching.filter(p=>!p.revoked&&p.availability!=='left');
  // Stable admission is separate from current membership. Switching model or
  // reincarnating cannot erase the previous strongest model's constraint.
  const admissions=team.review_admissions?.[modelKey];
  const haveAdmissions=Array.isArray(admissions)&&admissions.length>0&&admissions.length<=1024;
  const admittedExhausted=haveAdmissions&&admissions.every(a=>{
   if(!a||key(a.model)!==modelKey||!text(a.participant,128)||!text(a.incarnation,128)||!Number.isSafeInteger(a.model_revision)||a.model_revision<1)return false;
   const p=team.participants?.[a.participant];
   return p&&!p.revoked&&p.availability!=='left'&&p.incarnation===a.incarnation&&p.model?.model_revision===a.model_revision&&key(p.model)===modelKey&&confirmed(p,clock)?.status==='exhausted';
  });
  // A healthy newer peer also retains the floor; empty sets are never proof.
  const currentExhausted=live.length>0&&matching.length>0&&matching.every(p=>!p.revoked&&p.availability!=='left'&&confirmed(p,clock)?.status==='exhausted');
  const quotaOnly=admittedExhausted&&currentExhausted;
  if(currentExhausted&&!haveAdmissions)missingAdmissions.push(identity);
  (quotaOnly?exhausted:remaining).push(identity);
 }
 result.exhausted_identities=exhausted;result.preserved_identities=remaining;
 const profiles=remaining.map(identity=>policy.profiles.find(p=>key(p)===JSON.stringify(identity)));
 if(profiles.some(p=>!p))return {...result,floor:null,blocked:'previous-review-model-unclassified'};
 if(!profiles.length)return {...result,floor:null,blocked:exhausted.length?'all-qualified-review-models-quota-exhausted':'no-qualified-review-model'};
 result.floor=Math.max(...profiles.map(p=>p.priorities.review));result.blocked=missingAdmissions.length?'quota-review-admissions-missing':null;return result;
}
