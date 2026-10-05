// Explicit protocol-only native quota policy. Provider availability is not model strength.
import {routingDigest} from './model-routing.mjs';
import {selectCoordinator,selectProtocolReviewerCandidate} from './team.mjs';
const minted=new WeakMap(),same=(a,b)=>routingDigest(a)===routingDigest(b);
const fail=code=>{throw Object.assign(new Error('native-quota-'+code),{code:'native-quota-'+code});};
const clone=structuredClone;
function quotaMeaning(observation){const {observation_id,observed_at,expires_at,...proof}=observation.proof;return {...observation,proof};}
function accountProofMeaning(observation){const {observation_id,observed_at,expires_at,billing_digest,...proof}=observation.proof;return {quota_policy_revision:observation.quota_policy_revision,proof};}
function accountKey(b){if(!b||b.provenance!=='native-runtime'||b.consistent!==true||!['provider','origin','account'].every(k=>typeof b[k]==='string'&&b[k]&&b[k]!=='unknown')||!/^[a-f0-9]{64}$/.test(b.account))return null;try{const u=new URL(b.origin);if(u.protocol!=='https:'||u.origin!==b.origin)return null;}catch{return null;}return routingDigest({provider:b.provider,origin:b.origin,account:b.account});}
export function assertNativeBillingQuotaEligible(t,billing,now=Date.now()){const key=accountKey(billing),proof=key&&t.native_account_quotas?.[key]?.proof;if(proof?.status==='exhausted')fail('provider-account-exhausted');if(proof?.status==='available'&&!(Date.parse(proof.expires_at)>now))fail('provider-account-availability-expired');}
function participantAccountKeys(s,t,p){if(!p.native_admission||!p.native_binding)return [];const keys=new Set();for(const x of Object.values(s.subscription_invocations||{})){if(x.protocol!==2||x.team!==t.id||x.participant!==p.id||x.incarnation!==p.incarnation||x.descriptor_digest!==p.native_binding.descriptor_digest||x.collector!=='collector:'+p.native_binding.collector_id||x.state!=='settled'||x.receipt?.coverage!=='complete'||x.action_blocker||Object.values(x.binding_changes||{}).some(Boolean))continue;if(!x.action_observation&&x.id!==p.native_admission.source_invocation)continue;const profileId=x.action_observation?.profile_id??x.measurement?.profile_id;if(profileId!==p.native_admission.identity.profile_id||x.action&&x.model_revision!==p.model.model_revision)continue;const before=accountKey(x.receipt.billing_before),after=accountKey(x.receipt.billing_after);if(before&&before===after)keys.add(before);}return [...keys].sort();}
function updateAccountExclusions(s,t){for(const p of Object.values(t.participants)){const keys=participantAccountKeys(s,t,p).filter(key=>t.native_account_quotas?.[key]?.proof.status==='exhausted');const available=Object.fromEntries(participantAccountKeys(s,t,p).filter(key=>t.native_account_quotas?.[key]?.proof.status==='available').map(key=>[key,t.native_account_quotas[key].proof.expires_at]));p.native_account_exclusions={keys,available,incarnation:p.incarnation,model_revision:p.model?.model_revision,descriptor_digest:p.native_binding?.descriptor_digest,profile:p.native_admission?.identity??null};}}
function exact(x,keys,max=16384){if(!x||typeof x!=='object'||Array.isArray(x)||Buffer.byteLength(JSON.stringify(x))>max||Object.keys(x).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(x,k)))fail('bounded-exact-fields-required');return x;}
function text(v,max=256){if(typeof v!=='string'||!v||v.trim()!==v||v.length>max||/[\x00-\x1f\x7f]/.test(v))fail('bounded-string-required');return v;}
function hash(v){if(!/^[a-f0-9]{64}$/.test(v||''))fail('digest-required');return v;}
function clock(v){if(!Number.isSafeInteger(v)||v<0)fail('clock-required');return v;}
function https(v){text(v,2048);let u;try{u=new URL(v);}catch{fail('provider-source-required');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)fail('provider-source-required');return u;}
function nativeMode(t){if(t.policy?.protocol!==2||t.accounting?.protocol!==2||t.accounting.billing_policy!=='inherited-native')fail('native-protocol-mode-required');}
export function nativeQuotaSource(s,t,p,id){
 const x=s.subscription_invocations?.[id],profile=x?.action_observation,admission=p?.native_admission;
 if(!p||p.revoked||p.availability==='left'||!admission||!x||x.team!==t.id||x.protocol!==2||x.participant!==p.id||x.incarnation!==p.incarnation||x.model_revision!==p.model.model_revision||x.descriptor_digest!==p.native_binding?.descriptor_digest||x.collector!=='collector:'+p.native_binding.collector_id||x.state!=='settled'||x.receipt?.coverage!=='complete'||!profile||profile.admission_id!==x.id||profile.participant!==p.id||profile.incarnation!==p.incarnation||profile.model_revision!==p.model.model_revision||!same({kind:'native-configuration',profile_id:profile.profile_id,profile_digest:profile.profile_digest,profile_revision:profile.profile?.revision},admission.identity)||x.action_blocker||Object.values(x.binding_changes||{}).some(Boolean))fail('own-settled-admitted-profile-required');
 if(profile.profile_digest!==routingDigest(profile.profile)||profile.sealed_native_receipt_digest!==x.action_seal?.native_receipt_digest||x.action_seal?.native_receipt_digest!==routingDigest(x.action_seal.native_receipt))fail('own-sealed-profile-required');
 const before=x.receipt.billing_before,after=x.receipt.billing_after;
 const billingKeys=['provider','origin','account','sku','mode','paid_fallback','auth_method','credit_availability','account_generation'];
 for(const b of [before,after])if(!b||b.provenance!=='native-runtime'||b.consistent!==true||['provider','origin','account','sku','auth_method'].some(k=>typeof b[k]!=='string'||!b[k]||b[k]==='unknown')||!['subscription','free','api'].includes(b.mode)||b.paid_fallback!==false||b.credit_availability!=='unavailable'||!Number.isSafeInteger(b.account_generation))fail('known-unambiguous-billing-required');
 hash(before.account);https(before.origin);if(https(before.origin).origin!==before.origin)fail('provider-origin-required');
 const billing=Object.fromEntries(billingKeys.map(k=>[k,before[k]]));
 if(!same(billing,Object.fromEntries(billingKeys.map(k=>[k,after[k]])))||!same(billing,Object.fromEntries(billingKeys.map(k=>[k,x.context?.billing_observation?.[k]??null]))))fail('same-billing-source-required');
 return {source_invocation_id:x.id,participant:p.id,incarnation:p.incarnation,model_revision:p.model.model_revision,descriptor_digest:x.descriptor_digest,collector_id:p.native_binding.collector_id,profile:clone(admission.identity),native_admission_digest:routingDigest(admission),source_profile_observation_id:profile.observation_id,source_profile_digest:routingDigest(profile),unit_digest:x.unit_digest,billing,source_settled_at:x.settled_at};
}
function policy(t,now){nativeMode(t);const p=t.native_quota_policy;if(p?.protocol!==2||p.automatic_handover!==true||!Number.isFinite(Date.parse(p.enabled_at))||!Number.isFinite(Date.parse(p.expires_at))||Date.parse(p.enabled_at)>now||Date.parse(p.expires_at)<=now)fail('current-owner-policy-required');return p;}
const RULE_KEYS=['collector_id','source','method','evidence_kind','provider_code','scope','status','documentation'];
const PROOF_KEYS=['protocol','observation_id','status','reason','source','method','evidence_kind','provider_code','scope','documentation','provider_confirmed','billing_digest','observed_at','expires_at'];
function validateObservation(s,t,observation,now,{fresh=true}={}){
 exact(observation,['protocol','binding','proof','quota_policy_revision']);if(observation.protocol!==2)fail('protocol-required');
 const p=t.participants[observation.binding?.participant],binding=nativeQuotaSource(s,t,p,observation.binding?.source_invocation_id);
 if(!same(binding,observation.binding))fail('source-binding-changed');const proof=exact(observation.proof,PROOF_KEYS),pol=policy(t,now);
 if(observation.quota_policy_revision!==pol.revision||proof.protocol!==2||!['available','exhausted'].includes(proof.status)||proof.reason!=='provider-quota-'+proof.status||proof.provider_confirmed!==true||!['provider-quota','structured-native-refusal'].includes(proof.evidence_kind)||proof.evidence_kind==='structured-native-refusal'&&proof.status!=='exhausted'||proof.billing_digest!==routingDigest(binding.billing))fail('structured-provider-proof-required');
 const rule=pol.source_rules.find(r=>r.collector_id===binding.collector_id&&RULE_KEYS.filter(k=>k!=='collector_id').every(k=>r[k]===proof[k]));if(!rule)fail('installed-provider-source-rule-required');
 if(https(proof.source).origin!==binding.billing.origin)fail('provider-source-billing-origin-required');text(proof.observation_id,128);
 const observed=Date.parse(proof.observed_at),expires=Date.parse(proof.expires_at);
 if(!Number.isFinite(observed)||!Number.isFinite(expires)||observed<Date.parse(binding.source_settled_at)||observed>now||expires<=observed||expires-observed>60000||fresh&&(now-observed>30000||expires<=now))fail('original-provider-clock-required');
 return observation;
}
export async function collectNativeProtocolQuota({state,team,participant,sourceInvocationId,observe,now=Date.now()}={}){
 if(typeof observe!=='function')fail('installed-provider-observer-unsupported');const time=()=>clock(typeof now==='function'?now():now),t=typeof team==='string'?state.teams[team]:team,binding=nativeQuotaSource(state,t,participant,sourceInvocationId),pol=policy(t,time());
 const proof=await observe(Object.freeze(clone(binding))),record={protocol:2,binding,proof:clone(proof),quota_policy_revision:pol.revision};validateObservation(state,t,record,time());
 function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}}freeze(record);minted.set(record,routingDigest(record));return record;
}
export function serializeNativeProtocolQuota(record){if(minted.get(record)!==routingDigest(record))fail('collector-provenance-required');return clone(record);}
export function nativeParticipantQuotaEligible(p,now=Date.now()){
 if(p?.native_account_exclusions?.keys?.length||Object.values(p?.native_account_exclusions?.available||{}).some(expiry=>!(Date.parse(expiry)>now)))return false;
 const r=p?.native_protocol_quota;if(!r)return true;
 const b=r.binding;
 if(!p||!p.native_admission?.identity||b.incarnation!==p.incarnation||b.model_revision!==p.model?.model_revision||b.descriptor_digest!==p.native_binding?.descriptor_digest||!same(b.profile,p.native_admission?.identity))return false;
 if(r.proof.status==='exhausted'){const key=accountKey({...b.billing,provenance:'native-runtime',consistent:true});return Date.parse(p.native_account_exclusions?.available?.[key])>now;}
 return Date.parse(r.proof.expires_at)>now;
}
export function nativeQuotaEligible(t,p,now=Date.now()){return !t.native_quota_policy||nativeParticipantQuotaEligible(p,now);}
export function selectNativeQuotaFrontier(t,now=Date.now()){
 const ps=Object.values(t.participants).filter(p=>nativeQuotaEligible(t,p,now));
 const candidate=selectCoordinator(ps,t.policy,t.leader,{coverage:'waypost-protocol-coordinate',now});
 const reviewer=!t.review_blocker&&candidate?selectProtocolReviewerCandidate(ps,t.policy,t.review_floor,{coordinator:candidate.id,now}):null;
 return {candidate:candidate?.id??null,reviewer:reviewer?.id??null,blocker:!candidate?'native-quota-no-qualified-coordinator':!reviewer?'native-quota-retained-review-floor-unavailable':null};
}
function idleWork(s,t,excluding=null){if(t.handover||Object.values(s.invocations||{}).some(x=>x.team===t.id&&!['settled','aborted'].includes(x.state))||Object.values(t.runtime_requests||{}).some(x=>!x.captured&&!x.reconciled_stopped)||Object.values(t.review_requests||{}).some(x=>!x.output_digest&&!x.reconciled_stopped)||Object.values(t.deliveries||{}).some(x=>['dispatching','uncertain'].includes(x.state)))fail('idle-reconciled-protocol-only-required');if(Object.values(t.work||{}).some(w=>!['integrated','cancelled'].includes(w.status))||Object.values(s.subscription_invocations||{}).some(x=>x.id!==excluding&&x.team===t.id&&!['settled','aborted','reconciled'].includes(x.state))||Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&x.overshoot_allocation_revision!==undefined&&(s.subscription_allocations?.[x.unit_digest]?.revision??0)<=x.overshoot_allocation_revision))fail('idle-reconciled-protocol-only-required');}
function reactivation(s,t,now){
 const basis=t.native_quota_freeze?.reactivation_basis,old=t.participants[t.leader];
 if(t.native_quota_policy?.same_leader_reactivation!==true||!basis)fail('reactivation-original-opt-in-basis-required');
 if(!old?.native_admission||old.id!==basis.participant||old.incarnation!==basis.incarnation||old.model.model_revision!==basis.model_revision||old.native_binding?.descriptor_digest!==basis.descriptor_digest||routingDigest(old.native_admission)!==basis.native_admission_digest||!same(old.native_admission.identity,basis.identity)||!participantAccountKeys(s,t,old).includes(basis.account_key))fail('reactivation-old-leader-binding-changed');
 const positive=t.native_account_quotas?.[basis.account_key];if(positive?.proof.status!=='available'||Date.parse(positive.proof.observed_at)<=Date.parse(basis.negative_observed_at))fail('reactivation-ordered-positive-required');validateObservation(s,t,positive,now);
 return {basis:clone(basis),basis_digest:routingDigest(basis),positive_observation_digest:routingDigest(positive)};
}
export function assertNativeHandoverConsumedLatch(s,t,{excluding=null}={}){
 if(t.native_quota_policy?.same_leader_reactivation!==true&&!t.native_quota_freeze?.reactivation_basis)return;
 if(Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&x.epoch===t.epoch&&x.action?.kind==='protocol-handover-ack'&&x.consumed_at&&!(x.state==='reconciled'&&x.slot_released===true)&&x.id!==excluding))fail('old-epoch-handover-already-consumed');
}
export function assertNativeHandoverReady(s,t,now,{excluding=null}={}){
 policy(t,now);assertNativeHandoverConsumedLatch(s,t,{excluding});idleWork(s,t,excluding);const h=t.native_protocol_handover;
 if(!h||h.state!=='prepared'||t.status!=='handover'||h.old_leader!==t.leader||h.old_epoch!==t.epoch||h.target_epoch!==t.epoch+1||h.quota_revision!==t.native_quota_revision||h.policy_revision!==t.policy.revision||h.policy_digest!==routingDigest(t.policy)||!t.native_quota_freeze||h.trigger_digest!==t.native_quota_freeze.trigger_digest||!same(h.stop_set,t.native_quota_freeze.stop_scopes))fail('current-prepared-handover-required');
 const frontier=selectNativeQuotaFrontier(t,now);if(h.roster_digest!==routingDigest(Object.values(t.participants).map(p=>[p.id,p.incarnation,p.model?.model_revision,p.native_binding?.descriptor_digest,p.native_admission?.identity,p.availability,p.revoked,p.native_protocol_quota??null,p.native_account_exclusions??null])))fail('handover-roster-changed');
 if(h.reactivation&&!same(h.reactivation,reactivation(s,t,now)))fail('reactivation-original-positive-changed');
 if(frontier.blocker||frontier.candidate!==h.candidate||frontier.reviewer!==h.reviewer||frontier.candidate===t.leader&&(!h.reactivation||!same(h.reactivation,reactivation(s,t,now))))fail('current-strongest-handover-frontier-required');return {handover:h,frontier};
}
// Renews an unexpired positive lease with the same meaning in place. It changes
// no revision, election or review state, so it is refused whenever anything else
// would change: a freeze or unapplied handover, another status or meaning, a
// reused observation id, an exhausted account, an older observation or any
// participant's exclusions or eligibility. The Host runs it on a copy to route.
export function renewNativeQuotaLease(s,t,observation,now){
 if(t.native_quota_freeze||t.native_protocol_handover&&t.native_protocol_handover.state!=='applied')fail('renewal-outside-handover-required');
 const p=t.participants[observation.binding.participant],old=p?.native_protocol_quota,proof=observation.proof,key=accountKey({...observation.binding.billing,provenance:'native-runtime',consistent:true}),account=t.native_account_quotas?.[key];
 if(proof.status!=='available'||old?.proof.status!=='available'||!(Date.parse(old.proof.expires_at)>now)||!same(quotaMeaning(old),quotaMeaning(observation)))fail('unexpired-same-meaning-available-lease-required');
 if(account?.proof.status!=='available')fail('available-account-record-required');
 const stored=[old,t.native_quota_observations?.[p.id],account,t.native_account_quota_observations?.[key]].filter(Boolean);
 if(stored.some(x=>x.proof.observation_id===proof.observation_id))fail('renewal-observation-id-reused');
 if(!(Date.parse(proof.observed_at)>Math.max(...stored.map(x=>Date.parse(x.proof.observed_at)))))fail('renewal-observation-order-required');
 const eligibility=()=>routingDigest(Object.values(t.participants).map(x=>[x.id,[...(x.native_account_exclusions?.keys||[])].sort(),Object.keys(x.native_account_exclusions?.available||{}).sort(),nativeQuotaEligible(t,x,now)]));
 const before=eligibility();
 p.native_protocol_quota=clone(observation);t.native_quota_observations[p.id]=clone(observation);t.native_account_quotas[key]=clone(observation);t.native_account_quota_observations[key]=clone(observation);updateAccountExclusions(s,t);
 if(eligibility()!==before)fail('renewal-eligibility-changed');
}
export function applyNativeProtocolQuota(s,t,c,now,H){
 if(!['native-protocol-quota-enable-v2','native-protocol-quota-capture-v2','native-protocol-quota-renew-v2','native-protocol-handover-stop-capture-v2','native-protocol-handover-prepare-v2'].includes(c.type))return null;
 nativeMode(t);let result;
 if(c.type==='native-protocol-quota-enable-v2'){
  H.owner(s,c);exact(c.policy,['automatic_handover','expires_at','source_rules',...(Object.hasOwn(c.policy,'same_leader_reactivation')?['same_leader_reactivation']:[])]);if(Object.hasOwn(c.policy,'same_leader_reactivation')&&typeof c.policy.same_leader_reactivation!=='boolean')fail('reactivation-boolean-required');text(c.policy.expires_at,64);if(!Number.isFinite(Date.parse(c.policy.expires_at)))fail('finite-policy-expiry-required');if(c.policy.automatic_handover!==true||!Number.isSafeInteger(c.revision)||c.revision<1||c.revision<=(t.native_quota_policy?.revision??0)||Date.parse(c.policy.expires_at)<=now||Date.parse(c.policy.expires_at)>Date.parse(t.policy.expires_at)||!Array.isArray(c.policy.source_rules)||!c.policy.source_rules.length||c.policy.source_rules.length>64)fail('bounded-owner-policy-required');
  idleWork(s,t);const meanings=new Map();for(const r of c.policy.source_rules){exact(r,RULE_KEYS);const collector=s.collectors?.[r.collector_id];if(!collector||collector.team!==t.id||collector.revoked||!['runtime','usage'].every(x=>collector.purposes?.includes(x)))fail('installed-bound-provider-collector-required');https(r.source);https(r.documentation);if(!['available','exhausted'].includes(r.status)||r.evidence_kind==='structured-native-refusal'&&r.status!=='exhausted')fail('documented-provider-status-required');text(r.method,128);text(r.provider_code,128);if(r.scope!=='provider-account'||!['provider-quota','structured-native-refusal'].includes(r.evidence_kind)||['429','busy','rate-limited','timeout','budget-exhausted','http-429'].includes(r.provider_code))fail('documented-provider-proof-required');const semantic=routingDigest([r.collector_id,r.source,r.method,r.evidence_kind,r.provider_code,r.scope]);if(meanings.has(semantic)&&meanings.get(semantic)!==r.status)fail('provider-status-rule-conflict');meanings.set(semantic,r.status);}
  t.native_quota_policy={...clone(c.policy),protocol:2,revision:c.revision,enabled_at:c.at};t.native_quota_revision=(t.native_quota_revision||0)+1;t.quota_revision=(t.quota_revision||0)+1;if(t.native_quota_freeze?.reactivation_basis&&t.native_quota_policy.same_leader_reactivation!==true){t.status='paused';t.native_quota_blocker='native-quota-reactivation-opt-in-disabled';}result={enabled:true,quota_revision:t.native_quota_revision,protected_actions_granted:false};
 }else if(c.type==='native-protocol-quota-capture-v2'){
  const observation=validateObservation(s,t,c.observation,now),p=t.participants[observation.binding.participant],collector=s.collectors?.[p.native_binding.collector_id];
  if(c.actor!=='collector:'+collector?.id||collector.revoked||collector.team!==t.id||!['runtime','usage'].every(x=>collector.purposes?.includes(x)))fail('bound-provider-collector-required');
  const old=t.native_quota_observations?.[p.id],proof=observation.proof,key=accountKey({...observation.binding.billing,provenance:'native-runtime',consistent:true}),accountOld=t.native_account_quota_observations?.[key];
  if(accountOld&&(Date.parse(proof.observed_at)<Date.parse(accountOld.proof.observed_at)||proof.observed_at===accountOld.proof.observed_at&&!same(accountOld,observation)||proof.observation_id===accountOld.proof.observation_id&&!same(accountOld,observation)))fail('account-observation-order-conflict');
  if(old){if(Date.parse(proof.observed_at)<Date.parse(old.proof.observed_at)||proof.observation_id===old.proof.observation_id&&!same(old,observation)||proof.observed_at===old.proof.observed_at&&!same(old,observation))fail('observation-order-conflict');if(same(old,observation))return {handled:true,result:{unchanged:true,protected_actions_granted:false}};}
  // A prepared election pins its original quota sample. A same-meaning
  // exhaustion refresh updates freshness history without laundering its ACK slot.
  const sampled=p.native_protocol_quota;
  const pinnedAccount=t.native_account_quotas?.[key],positiveRefresh=proof.status==='available'&&t.native_protocol_handover?.reactivation&&pinnedAccount&&t.native_quota_policy.same_leader_reactivation===true&&routingDigest(pinnedAccount)===t.native_protocol_handover.reactivation.positive_observation_digest&&same(accountProofMeaning(pinnedAccount),accountProofMeaning(observation));
  if(t.native_protocol_handover?.state==='prepared'&&(!t.native_protocol_handover.reactivation&&proof.status==='exhausted'&&sampled&&same(quotaMeaning(sampled),quotaMeaning(observation))&&(!(t.native_quota_policy.same_leader_reactivation===true||t.native_quota_freeze?.reactivation_basis)||pinnedAccount?.proof.status==='exhausted'&&same(accountProofMeaning(pinnedAccount),accountProofMeaning(observation)))||positiveRefresh)){t.native_quota_observations[p.id]=clone(observation);t.native_account_quota_observations[key]=clone(observation);return {handled:true,result:{refreshed:true,participant:p.id,status:proof.status,quota_revision:t.native_quota_revision,protected_actions_granted:false}};}
  t.native_quota_observations||={};t.native_quota_observations[p.id]=clone(observation);p.native_protocol_quota=clone(observation);t.native_account_quotas||={};t.native_account_quota_observations||={};t.native_account_quotas[key]=clone(observation);t.native_account_quota_observations[key]=clone(observation);updateAccountExclusions(s,t);t.native_quota_revision=(t.native_quota_revision||0)+1;t.quota_revision=(t.quota_revision||0)+1;
  H.floor(t,c.at);const frontier=selectNativeQuotaFrontier(t,now);t.candidate=frontier.candidate===t.leader?null:frontier.candidate;t.review_candidate=frontier.reviewer;t.native_quota_blocker=frontier.blocker;
  if(t.candidate||!nativeQuotaEligible(t,t.participants[t.leader],now)){t.status=frontier.blocker?'paused':'handover';const previousFreeze=t.native_quota_freeze;t.native_quota_freeze={old_leader:t.leader,old_epoch:t.epoch,quota_revision:t.native_quota_revision,trigger_digest:routingDigest(observation),stop_scopes:Object.values(t.participants).filter(p=>p.native_binding).map(p=>({participant:p.id,incarnation:p.incarnation,descriptor_digest:p.native_binding.descriptor_digest,epoch:t.epoch})).sort((a,b)=>a.participant.localeCompare(b.participant))};if(previousFreeze&&(t.native_quota_policy.same_leader_reactivation===true||previousFreeze.reactivation_basis))t.native_quota_freeze=previousFreeze;else if(!previousFreeze&&t.native_quota_policy.same_leader_reactivation===true&&proof.status==='exhausted'){const oldLeader=t.participants[t.leader];if(oldLeader?.native_admission&&participantAccountKeys(s,t,oldLeader).includes(key))t.native_quota_freeze.reactivation_basis={participant:oldLeader.id,incarnation:oldLeader.incarnation,model_revision:oldLeader.model.model_revision,descriptor_digest:oldLeader.native_binding.descriptor_digest,native_admission_digest:routingDigest(oldLeader.native_admission),identity:clone(oldLeader.native_admission.identity),account_key:key,negative_observation_digest:routingDigest(observation),negative_observed_at:proof.observed_at};}}
  if(t.native_quota_freeze&&frontier.candidate===t.leader&&nativeQuotaEligible(t,t.participants[t.leader],now)){t.status='paused';t.native_quota_blocker='native-quota-old-leader-reactivation-unsupported';if(t.native_quota_policy.same_leader_reactivation===true||t.native_quota_freeze.reactivation_basis){try{reactivation(s,t,now);assertNativeHandoverConsumedLatch(s,t);if(!frontier.blocker){t.status='handover';t.candidate=t.leader;t.native_quota_blocker=null;}}catch(e){t.native_quota_blocker=e.code||'native-quota-reactivation-unavailable';}}}
  if(t.native_quota_freeze&&(t.native_quota_policy.same_leader_reactivation===true||t.native_quota_freeze.reactivation_basis)){try{assertNativeHandoverConsumedLatch(s,t);}catch(e){t.status='paused';t.native_quota_blocker=e.code;}}
  if(t.native_quota_freeze){const freeze=t.native_quota_freeze;t.native_protocol_handover={protocol:2,id:'native-handover-'+routingDigest(freeze),state:t.native_quota_blocker?'blocked':'fenced',old_leader:freeze.old_leader,old_epoch:freeze.old_epoch,target_epoch:freeze.old_epoch+1,stop_set:clone(freeze.stop_scopes)};}
  result={participant:p.id,status:proof.status,candidate:t.candidate,quota_revision:t.native_quota_revision,blocker:t.native_quota_blocker,protected_actions_granted:false};
 }else if(c.type==='native-protocol-quota-renew-v2'){
  const observation=validateObservation(s,t,c.observation,now),p=t.participants[observation.binding.participant],collector=s.collectors?.[p.native_binding.collector_id];
  if(c.actor!=='collector:'+collector?.id||collector.revoked||collector.team!==t.id||!['runtime','usage'].every(x=>collector.purposes?.includes(x)))fail('bound-provider-collector-required');
  renewNativeQuotaLease(s,t,observation,now);
  result={renewed:true,participant:p.id,expires_at:observation.proof.expires_at,quota_revision:t.native_quota_revision,protected_actions_granted:false};
 }else if(c.type==='native-protocol-handover-stop-capture-v2'){
  policy(t,now);if(!t.native_quota_freeze||t.native_quota_freeze.old_epoch!==t.epoch)fail('frozen-old-epoch-required');
  const proof=exact(c.stop_proof,['protocol','purpose','team','participant','incarnation','epoch','descriptor_digest','callback_drained','epoch_barrier','required_operations','operations','evidence_digest']),p=t.participants[proof.participant],collector=s.collectors?.[p?.native_binding?.collector_id];
  if(!p||collector?.revoked||collector?.team!==t.id||c.actor!=='collector:'+collector?.id||!['runtime','usage'].every(x=>collector?.purposes?.includes(x)))fail('own-stop-collector-required');
  if(proof.protocol!==2||proof.purpose!=='protocol-quota-handover-stop'||proof.team!==t.id||proof.incarnation!==p.incarnation||proof.epoch!==t.epoch||proof.descriptor_digest!==p.native_binding.descriptor_digest||proof.callback_drained!==true||proof.epoch_barrier!==true)fail('whole-old-epoch-runtime-stop-required');hash(proof.evidence_digest);
  for(const list of [proof.operations,proof.required_operations])if(!Array.isArray(list)||list.length>1024||new Set(list).size!==list.length||list.some(x=>typeof x!=='string'||!x||x.length>128))fail('bounded-stop-operation-coverage-required');
  const required=Object.values(s.subscription_invocations||{}).filter(x=>x.team===t.id&&x.participant===p.id&&x.incarnation===p.incarnation&&x.epoch===t.epoch&&!['prepared','aborted'].includes(x.state));
  if(required.some(x=>!proof.required_operations.includes(x.id)||x.action?.operation_id&&!proof.operations.includes(x.action.operation_id)))fail('whole-old-epoch-operation-coverage-required');
  t.native_protocol_stops||={};const key=routingDigest([p.id,p.incarnation,t.epoch,p.native_binding.descriptor_digest]),previous=t.native_protocol_stops[key];if(previous&&!same(previous,proof))fail('stop-proof-immutable');t.native_protocol_stops[key]=clone(proof);
  result={stopped:p.id,epoch:t.epoch,protected_actions_granted:false};
 }else{
  H.owner(s,c);policy(t,now);assertNativeHandoverConsumedLatch(s,t);idleWork(s,t);if(Object.keys(c).some(k=>!['type','team','actor','at','request_key','incarnation','epoch'].includes(k)))fail('handover-prepare-selectors-only');
  const old=t.participants[t.leader];if(!old||!t.native_quota_freeze||t.native_quota_freeze.old_epoch!==t.epoch||t.native_quota_freeze.old_leader!==old.id)fail('frozen-old-leader-required');
  const scopes=Object.values(t.participants).filter(p=>p.native_binding).map(p=>({participant:p.id,incarnation:p.incarnation,descriptor_digest:p.native_binding.descriptor_digest,epoch:t.epoch})).sort((a,b)=>a.participant.localeCompare(b.participant));if(!same(scopes,t.native_quota_freeze.stop_scopes))fail('frozen-stop-scopes-changed');
  const requiredParticipants=new Set(scopes.map(p=>p.participant)),stops=[];
  for(const id of requiredParticipants){const p=t.participants[id];if(!p)fail('old-epoch-participant-missing');const key=routingDigest([id,p.incarnation,t.epoch,p.native_binding?.descriptor_digest]),proof=t.native_protocol_stops?.[key];if(!proof)fail('all-old-epoch-owned-stops-required');stops.push(clone(proof));}
  H.floor(t,c.at);const frontier=selectNativeQuotaFrontier(t,now),recovery=frontier.candidate===old.id&&(t.native_quota_policy.same_leader_reactivation===true||t.native_quota_freeze.reactivation_basis)?reactivation(s,t,now):null;if(frontier.blocker||frontier.candidate===old.id&&!recovery)fail('strongest-surviving-independent-frontier-required');
  const h={protocol:2,id:t.native_protocol_handover.id,stop_set:clone(t.native_quota_freeze.stop_scopes),state:'prepared',old_leader:old.id,old_incarnation:old.incarnation,old_epoch:t.epoch,target_epoch:t.epoch+1,candidate:frontier.candidate,reviewer:frontier.reviewer,quota_revision:t.native_quota_revision,policy_revision:t.policy.revision,policy_digest:routingDigest(t.policy),trigger_digest:t.native_quota_freeze.trigger_digest,roster_digest:routingDigest(Object.values(t.participants).map(p=>[p.id,p.incarnation,p.model?.model_revision,p.native_binding?.descriptor_digest,p.native_admission?.identity,p.availability,p.revoked,p.native_protocol_quota??null,p.native_account_exclusions??null])),stop_proofs:stops.sort((a,b)=>a.participant.localeCompare(b.participant)),prepared_at:c.at};
  if(recovery)h.reactivation=recovery;
  if(t.native_protocol_handover?.state==='prepared'&&!same(t.native_protocol_handover,h))fail('prepared-handover-immutable');t.native_protocol_handover=h;t.status='handover';t.candidate=frontier.candidate;t.review_candidate=frontier.reviewer;
  for(const context of Object.values(t.subscription_contexts||{}))if(requiredParticipants.has(context.participant))context.quarantined=true;
  result={prepared:true,candidate:frontier.candidate,target_epoch:h.target_epoch,protected_actions_granted:false};
 }

 return {handled:true,result};
}
