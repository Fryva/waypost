// Versioned local subscription token accounting. No native adapter or privilege is minted here.
import { routingDigest } from './model-routing.mjs';
const fail = code => { throw new Error(code); };
const clone = value => structuredClone(value);
const same = (a,b) => routingDigest(a) === routingDigest(b);
const digest = value => { if(typeof value !== 'string'||! /^[a-f0-9]{64}$/.test(value))fail('subscription-digest-required'); return value; };
const id = value => { if(typeof value !== 'string'||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value))fail('subscription-id-required'); return value; };
const decimal = value => { if(typeof value !== 'string'||! /^(0|[1-9][0-9]{0,17})$/.test(value))fail('subscription-token-integer-required'); return BigInt(value); };
const revision = value => { if(!Number.isSafeInteger(value)||value<1)fail('subscription-revision-required'); return value; };
const bounded = value => { if(!value||typeof value!=='object'||Array.isArray(value)||Buffer.byteLength(JSON.stringify(value))>16384)fail('subscription-evidence-limit'); return clone(value); };
function fields(value,allowed) { if(Object.keys(value).some(key=>!allowed.includes(key)))fail('subscription-unknown-evidence-field'); }
function tuple(value,allowUnknown=false) {
 const x=bounded(value);fields(x,['provider','model_id','reasoning']);
 for(const key of ['provider','model_id','reasoning'])if(!(allowUnknown&&x[key]===null)&&(typeof x[key]!=='string'||!x[key]||x[key].length>256||/[\x00-\x1f\x7f]/.test(x[key])))fail('subscription-model-tuple-required');
 return x;
}
export function validateSubscriptionUnit(raw) {
 const unit=bounded(raw);fields(unit,['provider','origin','account','sku','counter_schema']);
 if(typeof unit.provider!=='string'||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(unit.provider))fail('subscription-unit-provider-required');
 digest(unit.account);
 for(const key of ['sku','counter_schema'])if(typeof unit[key]!=='string'||!unit[key]||unit[key].length>256||/[\x00-\x1f\x7f]/.test(unit[key]))fail('subscription-unit-required');
 let url;try{url=new URL(unit.origin);}catch{fail('subscription-origin-required');}
 if(url.protocol!=='https:'||url.origin!==unit.origin||url.username||url.password)fail('subscription-origin-required');
 return unit;
}
function route(raw,unit) {
 const x=bounded(raw);fields(x,['provider','origin','account','sku','counter_schema','mode','paid_fallback']);
 if(!same(validateSubscriptionUnit(Object.fromEntries(Object.keys(unit).map(key=>[key,x[key]]))),unit)||!['subscription','free'].includes(x.mode)||x.paid_fallback!==false)fail('subscription-authenticated-route-required');
 return x;
}
function participant(t,participantId) {
 const p=t.participants?.[participantId];if(!p||p.revoked||p.availability==='left'||!p.native_binding)fail('subscription-bound-participant-required');return p;
}
function collector(s,t,c,p) {
 const key=typeof c.actor==='string'&&c.actor.startsWith('collector:')?c.actor.slice(10):null,x=key&&s.collectors?.[key];
 if(!x||x.revoked||x.team!==t.id||!['runtime','usage'].every(purpose=>x.purposes?.includes(purpose))||p.native_binding.collector_id!==key)fail('subscription-bound-collector-required');return c.actor;
}
function enabled(t) { if(t.accounting?.protocol!==1||t.accounting.mode!=='subscription-tokens'||t.routing?.protocol!==3||!t.routing.required)fail('subscription-accounting-mode-required'); }
function unfinished(s,t) {
 return Object.values(t.invocations||{}).some(x=>!['settled','aborted'].includes(x.state))||Object.values(s.invocations||{}).some(x=>x.team===t.id&&!['settled','aborted'].includes(x.state))||Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&!['settled','aborted'].includes(x.state))||Object.values(t.work||{}).some(x=>!['integrated','cancelled'].includes(x.status))||Object.values(t.review_requests||{}).some(x=>!x.output_digest&&!x.reconciled_stopped)||Object.values(t.runtime_requests||{}).some(x=>x.consumed&&!x.captured&&!x.reconciled_stopped)||Object.values(t.deliveries||{}).some(x=>['dispatching','uncertain'].includes(x.state))||s.publication_fence?.team===t.id;
}
function freshContext(context,now) { if(!Number.isFinite(Date.parse(context.observed_at))||!Number.isFinite(Date.parse(context.expires_at))||Date.parse(context.observed_at)>now||Date.parse(context.expires_at)<=now||Date.parse(context.expires_at)-Date.parse(context.observed_at)>300000)fail('subscription-current-context-required'); }
function exhausted(p) { if(p.quota_observation?.status==='exhausted')fail('subscription-quota-exhausted'); }
function totals(s,unitDigest) {
 let actual=0n,reserved=0n,uncertain=false,overshoot=false;
 for(const x of Object.values(s.subscription_invocations||{}).filter(x=>x.unit_digest===unitDigest&&x.state!=='aborted')) {
  if(x.state==='settled'){actual+=decimal(x.charged_tokens);overshoot ||= x.overshoot_allocation_revision!==undefined&&(s.subscription_allocations?.[unitDigest]?.revision||0)<=x.overshoot_allocation_revision;}
  else {reserved+=decimal(x.estimate_tokens);uncertain ||= x.state==='uncertain';}
 }
 return {actual,reserved,uncertain,overshoot};
}
function invocation(s,t,c) {
 const x=s.subscription_invocations?.[c.invocation_id];if(!x||x.team!==t.id||x.nonce!==c.nonce)fail('subscription-stored-invocation-required');
 const p=participant(t,x.participant);collector(s,t,c,p);
 if(c.actor!==x.collector||p.incarnation!==x.incarnation||p.native_binding.descriptor_digest!==x.descriptor_digest)fail('subscription-invocation-binding-mismatch');return {x,p};
}
function admissionCurrent(t,x,p,allocation,now) {
 if(x.epoch!==t.epoch||x.quota_revision!==(t.quota_revision||0)||x.mode_revision!==t.accounting.revision||x.allocation_revision!==allocation?.revision||x.incarnation!==p.incarnation)fail('subscription-stale-admission');
 freshContext(x.context,now);exhausted(p);
}
export function applySubscriptionAccounting(s,t,c,now,H) {
 if (typeof c.type==='string' && c.type.endsWith('-v2')) {const advanced=applyInheritedNativeAccounting(s,t,c,now,H);if(advanced)return advanced;}
 if(!['subscription-accounting-enable-v1','subscription-allocation-update-v1','subscription-context-capture-v1','subscription-reserve-v1','subscription-consume-v1','subscription-usage-v1','subscription-uncertain-v1','subscription-abort-v1'].includes(c.type))return null;
 bounded(c);let result;
 if(c.type==='subscription-accounting-enable-v1') {
  H.owner(s,c);const policy=bounded(c.policy);fields(policy,['bootstrap']);if(policy.bootstrap!==true)fail('subscription-bootstrap-owner-policy-required');
  const next=revision(c.revision);if(next<=(t.accounting?.revision||0))fail('subscription-mode-revision-increase-required');
  if(unfinished(s,t))fail('subscription-unfinished-operations-require-reconciliation');
  t.accounting={protocol:1,mode:'subscription-tokens',revision:next,policy,enabled_at:c.at};t.routing={protocol:3,required:true,accounting_mode:'subscription-tokens'};
  result={mode:'subscription-tokens',revision:next,dispatch:'bootstrap-only-native-collector-required'};
 } else {
  enabled(t);
  if(c.type==='subscription-allocation-update-v1') {
   H.owner(s,c);const unit=validateSubscriptionUnit(c.unit_scope),key=routingDigest(unit),maximum=decimal(c.max_tokens),next=revision(c.revision),previous=s.subscription_allocations?.[key];
   if(previous&&(next<=previous.revision||maximum<=decimal(previous.max_tokens)))fail('subscription-allocation-increase-required');
   s.subscription_allocations||={};s.subscription_allocations[key]={protocol:1,unit_scope:unit,unit_digest:key,max_tokens:c.max_tokens,revision:next};
   result={unit_digest:key,revision:next};
  } else if(c.type==='subscription-context-capture-v1') {
   const p=participant(t,c.participant_id),actor=collector(s,t,c,p),context=bounded(c.context);
   fields(context,['id','native_id','descriptor_digest','incarnation','route','unit_scope','observed_model','observed_at','expires_at','read_only','owned']);
   id(context.id);id(context.native_id);digest(context.descriptor_digest);
   if(context.incarnation!==p.incarnation||context.descriptor_digest!==p.native_binding.descriptor_digest||context.read_only!==true||context.owned!==true)fail('subscription-owned-context-binding-required');
   const unit=validateSubscriptionUnit(context.unit_scope);route(context.route,unit);if(context.observed_model!==null)tuple(context.observed_model,true);freshContext(context,now);
   const value={...context,participant:p.id,collector:actor,unit_digest:routingDigest(unit)},old=t.subscription_contexts?.[context.id];
   if(old&&!same(old,value))fail('subscription-context-immutable');
   t.subscription_contexts||={};t.subscription_contexts[context.id]=value;result={context:context.id};
  } else if(c.type==='subscription-reserve-v1') {
   H.owner(s,c);const r=bounded(c.reservation);
   fields(r,['id','participant','incarnation','context_id','purpose','requested_model','nonce','suite_digest','max_calls','timeout_ms','estimate_tokens','epoch','quota_revision','mode_revision','allocation_revision']);
   id(r.id);id(r.nonce);digest(r.suite_digest);tuple(r.requested_model);decimal(r.estimate_tokens);
   if(!['identity','calibration'].includes(r.purpose)||r.max_calls!==1||!Number.isInteger(r.timeout_ms)||r.timeout_ms<100||r.timeout_ms>300000)fail('subscription-bounded-bootstrap-required');
   const p=participant(t,r.participant),context=t.subscription_contexts?.[r.context_id],allocation=context&&s.subscription_allocations?.[context.unit_digest];
   if(!context||!allocation||context.participant!==p.id||context.incarnation!==p.incarnation||context.descriptor_digest!==p.native_binding.descriptor_digest||context.collector!=='collector:'+p.native_binding.collector_id)fail('subscription-authenticated-context-required');
   const stored={...r,context:clone(context),team:t.id,collector:context.collector,descriptor_digest:context.descriptor_digest,unit_digest:context.unit_digest,state:'prepared'};
   admissionCurrent(t,stored,p,allocation,now);
   const registered=s.collectors?.[p.native_binding.collector_id];if(!registered||registered.revoked||registered.team!==t.id||!['runtime','usage'].every(purpose=>registered.purposes?.includes(purpose)))fail('subscription-bound-collector-required');
   if(s.subscription_invocations?.[r.id]||Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&x.nonce===r.nonce))fail('subscription-invocation-already-reserved');
   const used=totals(s,context.unit_digest);if(used.overshoot)fail('subscription-unreconciled-token-overshoot');if(used.uncertain)fail('subscription-uncertain-usage-blocks-admission');
   if(used.actual+used.reserved+decimal(r.estimate_tokens)>decimal(allocation.max_tokens))fail('subscription-token-allocation-exceeded');
   s.subscription_invocations||={};s.subscription_invocations[r.id]=stored;result={reserved:r.id,bootstrap_only:true};
  } else if(c.type==='subscription-abort-v1') {
   H.owner(s,c);const x=s.subscription_invocations?.[c.invocation_id];
   if(!x||x.team!==t.id||x.state!=='prepared'||x.nonce!==c.nonce)fail('subscription-undispatched-prepared-required');
   x.state='aborted';result={aborted:x.id};
  } else {
   const {x,p}=invocation(s,t,c);
   if(c.type==='subscription-consume-v1') {
    if(x.state!=='prepared')fail('subscription-invocation-already-consumed');
    admissionCurrent(t,x,p,s.subscription_allocations?.[x.unit_digest],now);
    const used=totals(s,x.unit_digest),allocation=s.subscription_allocations[x.unit_digest];
    if(used.overshoot)fail('subscription-unreconciled-token-overshoot');
    if(used.uncertain||used.actual+used.reserved>decimal(allocation.max_tokens))fail('subscription-token-allocation-exceeded');
    x.state='consumed';x.consumed_at=c.at;result={consumed:x.id,bootstrap_only:true};
   } else if(c.type==='subscription-uncertain-v1') {
    if(!['consumed','uncertain'].includes(x.state))fail('subscription-consumed-invocation-required');
    x.state='uncertain';result={uncertain:x.id,reservation_retained:true};
   } else {
    if(!['consumed','uncertain','settled'].includes(x.state))fail('subscription-consumed-invocation-required');
    const receipt=bounded(c.receipt);fields(receipt,['nonce','context_id','native_id','incarnation','unit_scope','route_before','route_after','observed_model','coverage','before','after','actual_tokens']);
    if(receipt.nonce!==x.nonce||receipt.context_id!==x.context.id||receipt.native_id!==x.context.native_id||receipt.incarnation!==x.incarnation||!same(validateSubscriptionUnit(receipt.unit_scope),x.context.unit_scope)||!same(route(receipt.route_before,x.context.unit_scope),x.context.route)||!same(route(receipt.route_after,x.context.unit_scope),x.context.route))fail('subscription-terminal-route-binding-mismatch');
    tuple(receipt.observed_model,true);if(x.context.observed_model!==null&&!same(receipt.observed_model,x.context.observed_model))fail('subscription-observed-model-mismatch');
    if(!['complete','partial','absent'].includes(receipt.coverage))fail('subscription-usage-coverage-required');
    if(x.state==='settled') {if(!same(receipt,x.receipt))fail('subscription-terminal-receipt-conflict');return {handled:true,result:{settled:x.id,unchanged:true}};}
    if(receipt.coverage!=='complete') {x.state='uncertain';x.partial_receipt=receipt;result={uncertain:x.id,reservation_retained:true};}
    else {
     const before=decimal(receipt.before),after=decimal(receipt.after),actual=decimal(receipt.actual_tokens);
     if(after<before||after-before!==actual)fail('subscription-native-counter-delta-mismatch');
     for(const other of Object.values(s.subscription_invocations||{})) {
      if(other.id===x.id||other.state!=='settled'||other.unit_digest!==x.unit_digest||other.descriptor_digest!==x.descriptor_digest||other.context.native_id!==x.context.native_id)continue;
      const lower=decimal(other.receipt.before),upper=decimal(other.receipt.after);
      if(before<upper&&after>lower||before===lower&&after===upper)fail('subscription-native-span-already-accounted');
     }
     x.state='settled';x.receipt=receipt;x.charged_tokens=receipt.actual_tokens;x.settled_at=c.at;
     if(actual>decimal(x.estimate_tokens))x.overshoot_allocation_revision=s.subscription_allocations[x.unit_digest].revision;
     const used=totals(s,x.unit_digest),allocation=s.subscription_allocations[x.unit_digest];
     result={settled:x.id,actual_tokens:x.charged_tokens,overshoot:actual>decimal(x.estimate_tokens),allocation_blocked:used.overshoot||used.actual+used.reserved>decimal(allocation.max_tokens)};
    }
   }
  }
 }
 return {handled:true,result};
}

// V2 opts into inherited native billing, while the budget is only a team counter.
export function validateNativeCounterUnit(raw,team) {
 const unit=bounded(raw);fields(unit,['scope','team','counter_schema']);
 if(unit.scope!=='team-native-counter'||unit.team!==team)fail('subscription-team-counter-scope-required');
 id(unit.team);id(unit.counter_schema);return unit;
}
export function validateBillingObservation(raw) {
 const observation=bounded(raw);fields(observation,['provider','origin','account','sku','mode','paid_fallback','provenance','auth_method','credit_availability','observed_at','account_generation','consistent']);
 if(!['native-runtime','unavailable'].includes(observation.provenance))fail('subscription-billing-observation-provenance-required');
 for(const key of ['provider','origin','account','sku']) {
  const value=observation[key];if(value!==null&&(typeof value!=='string'||!value||value.length>256||/[\x00-\x1f\x7f]/.test(value)))fail('subscription-billing-observation-required');
 }
 if(observation.account!==null&&observation.account!=='unknown')digest(observation.account);
 if(observation.origin!==null&&observation.origin!=='unknown') {
  let url;try{url=new URL(observation.origin);}catch{fail('subscription-origin-required');}
  if(url.protocol!=='https:'||url.origin!==observation.origin||url.username||url.password)fail('subscription-origin-required');
 }
 if(![null,'unknown','subscription','free','api'].includes(observation.mode)||![null,'unknown',true,false].includes(observation.paid_fallback))fail('subscription-billing-observation-required');
 if(observation.auth_method!==null&&(typeof observation.auth_method!=='string'||!observation.auth_method||observation.auth_method.length>128||/[\x00-\x1f\x7f]/.test(observation.auth_method)))fail('subscription-billing-observation-required');
 if(!['unknown','available','unavailable'].includes(observation.credit_availability)||typeof observation.observed_at!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(observation.observed_at)||!Number.isFinite(Date.parse(observation.observed_at))||!Number.isSafeInteger(observation.account_generation)||observation.account_generation<0||typeof observation.consistent!=='boolean')fail('subscription-billing-observation-required');
 if(observation.provenance==='unavailable'&&(observation.auth_method!==null&&observation.auth_method!=='unknown'||observation.credit_availability!=='unknown'))fail('subscription-unavailable-billing-must-remain-unknown');
 if(observation.provenance==='unavailable'&&['provider','origin','account','sku','mode','paid_fallback'].some(key=>observation[key]!==null&&observation[key]!=='unknown'))fail('subscription-unavailable-billing-must-remain-unknown');
 return observation;
}
function sameBilling(a,b) {const {observed_at:beforeTime,...before}=a,{observed_at:afterTime,...after}=b;return same(before,after);}
function nativeEnabled(t) {
 if(t.accounting?.protocol!==2||t.accounting.mode!=='subscription-tokens'||t.accounting.billing_policy!=='inherited-native'||t.routing?.protocol!==4||!t.routing.required)fail('subscription-inherited-native-mode-required');
}
const retiredKey = (actor,nativeId,descriptorDigest) => routingDigest({collector:actor,native_id:nativeId,descriptor_digest:descriptorDigest});
function notRetired(t,actor,nativeId,descriptorDigest) {
 if(t.subscription_retired_native?.[retiredKey(actor,nativeId,descriptorDigest)])fail('subscription-native-context-retired');
}
const knownModelField = value => typeof value==='string' && value!=='unknown';
function conflictsKnownModel(expected,observed) {return ['provider','model_id','reasoning'].some(key=>knownModelField(expected?.[key]) && expected[key]!==observed?.[key]);}
function nativeContextUsable(t,context,p,now) {
 if(context?.protocol!==2||context.participant!==p.id||context.incarnation!==p.incarnation||context.descriptor_digest!==p.native_binding.descriptor_digest||context.collector!=='collector:'+p.native_binding.collector_id)fail('subscription-owned-context-binding-required');
 notRetired(t,context.collector,context.native_id,context.descriptor_digest);
 if(Object.values(t.subscription_contexts||{}).some(other=>other.protocol===2&&other.native_id===context.native_id&&other.collector===context.collector&&other.quarantined))fail('subscription-native-context-quarantined');
 freshContext(context,now);
}
function nativeAdmissionCurrent(t,x,p,allocation,now) {
 if(x.epoch!==t.epoch||x.quota_revision!==(t.quota_revision||0)||x.mode_revision!==t.accounting.revision||x.allocation_revision!==allocation?.revision||x.incarnation!==p.incarnation)fail('subscription-stale-admission');
 nativeContextUsable(t,t.subscription_contexts?.[x.context.id],p,now);exhausted(p);
}
function applyInheritedNativeAccounting(s,t,c,now,H) {
 const kinds=['subscription-accounting-enable-v2','subscription-allocation-update-v2','subscription-context-capture-v2','subscription-context-retire-v2','subscription-reserve-v2','subscription-consume-v2','subscription-usage-v2','subscription-uncertain-v2','subscription-abort-v2'];
 if(!kinds.includes(c.type))return null;
 bounded(c);let result;
 if(c.type==='subscription-accounting-enable-v2') {
  H.owner(s,c);const policy=bounded(c.policy);fields(policy,['bootstrap','billing_policy']);
  if(policy.bootstrap!==true||policy.billing_policy!=='inherited-native')fail('subscription-inherited-native-owner-policy-required');
  const next=revision(c.revision);if(next<=(t.accounting?.revision||0))fail('subscription-mode-revision-increase-required');
  if(unfinished(s,t)||s.deferred_commands?.some(entry=>entry.command.team===t.id))fail('subscription-unfinished-operations-require-reconciliation');
  t.accounting={protocol:2,mode:'subscription-tokens',billing_policy:'inherited-native',revision:next,policy,enabled_at:c.at};
  t.routing={protocol:4,required:true,accounting_mode:'subscription-tokens',billing_policy:'inherited-native'};
  result={mode:'subscription-tokens',billing_policy:'inherited-native',revision:next,dispatch:'bootstrap-only-native-collector-required'};
 } else if(c.type==='subscription-context-retire-v2') {
   const p=participant(t,c.participant_id),actor=collector(s,t,c,p);id(c.native_id);digest(c.descriptor_digest);
   if(c.participant_incarnation!==p.incarnation||c.descriptor_digest!==p.native_binding.descriptor_digest)fail('subscription-owned-context-binding-required');
   const key=retiredKey(actor,c.native_id,c.descriptor_digest);
   t.subscription_retired_native||={};t.subscription_retired_native[key]={collector:actor,native_id:c.native_id,descriptor_digest:c.descriptor_digest,incarnation:c.participant_incarnation,participant:p.id,retired_at:c.at};
   result={retired:c.native_id,admission_withdrawn:true};
 } else {
  nativeEnabled(t);
  if(c.type==='subscription-allocation-update-v2') {
   H.owner(s,c);const unit=validateNativeCounterUnit(c.unit_scope,t.id),key=routingDigest(unit),maximum=decimal(c.max_tokens),next=revision(c.revision),old=s.subscription_allocations?.[key];
   if(old&&(next<=old.revision||maximum<=decimal(old.max_tokens)))fail('subscription-allocation-increase-required');
   s.subscription_allocations||={};s.subscription_allocations[key]={protocol:2,unit_scope:unit,unit_digest:key,max_tokens:c.max_tokens,revision:next};result={unit_digest:key,revision:next};
  } else if(c.type==='subscription-context-capture-v2') {
   const p=participant(t,c.participant_id),actor=collector(s,t,c,p),context=bounded(c.context);
   fields(context,['id','native_id','descriptor_digest','incarnation','unit_scope','billing_observation','observed_model','observed_at','expires_at','read_only','owned']);
   id(context.id);id(context.native_id);digest(context.descriptor_digest);
   if(context.incarnation!==p.incarnation||context.descriptor_digest!==p.native_binding.descriptor_digest||context.read_only!==true||context.owned!==true)fail('subscription-owned-context-binding-required');
   notRetired(t,actor,context.native_id,context.descriptor_digest);
   const unit=validateNativeCounterUnit(context.unit_scope,t.id);validateBillingObservation(context.billing_observation);
   if(context.observed_model!==null)tuple(context.observed_model,true);freshContext(context,now);
   const value={...context,protocol:2,participant:p.id,collector:actor,unit_digest:routingDigest(unit)},old=t.subscription_contexts?.[context.id];
   if(old&&!same(old,value))fail('subscription-context-immutable');
   if(Object.values(t.subscription_contexts||{}).some(other=>other.protocol===2&&other.native_id===context.native_id&&other.collector===actor&&other.quarantined))fail('subscription-native-context-quarantined');
   t.subscription_contexts||={};t.subscription_contexts[context.id]=value;result={context:context.id,billing_policy:'inherited-native'};
  } else if(c.type==='subscription-reserve-v2') {
   H.owner(s,c);const r=bounded(c.reservation);
   fields(r,['id','participant','incarnation','context_id','purpose','requested_model','nonce','suite_digest','max_calls','timeout_ms','estimate_tokens','epoch','quota_revision','mode_revision','allocation_revision']);
   id(r.id);id(r.nonce);digest(r.suite_digest);tuple(r.requested_model);decimal(r.estimate_tokens);
   if(!['identity','calibration'].includes(r.purpose)||r.max_calls!==1||!Number.isInteger(r.timeout_ms)||r.timeout_ms<100||r.timeout_ms>300000)fail('subscription-bounded-bootstrap-required');
   const p=participant(t,r.participant),context=t.subscription_contexts?.[r.context_id],allocation=context&&s.subscription_allocations?.[context.unit_digest];
   nativeContextUsable(t,context,p,now);if(allocation?.protocol!==2)fail('subscription-team-counter-allocation-required');
   const stored={...r,protocol:2,context:clone(context),team:t.id,collector:context.collector,descriptor_digest:context.descriptor_digest,unit_digest:context.unit_digest,state:'prepared'};
   nativeAdmissionCurrent(t,stored,p,allocation,now);
   const registered=s.collectors?.[p.native_binding.collector_id];if(!registered||registered.revoked||registered.team!==t.id||!['runtime','usage'].every(purpose=>registered.purposes?.includes(purpose)))fail('subscription-bound-collector-required');
   if(s.subscription_invocations?.[r.id]||Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&x.nonce===r.nonce))fail('subscription-invocation-already-reserved');
   const used=totals(s,context.unit_digest);if(used.overshoot)fail('subscription-unreconciled-token-overshoot');if(used.uncertain)fail('subscription-uncertain-usage-blocks-admission');
   if(used.actual+used.reserved+decimal(r.estimate_tokens)>decimal(allocation.max_tokens))fail('subscription-token-allocation-exceeded');
   s.subscription_invocations||={};s.subscription_invocations[r.id]=stored;result={reserved:r.id,bootstrap_only:true};
  } else if(c.type==='subscription-abort-v2') {
   H.owner(s,c);const x=s.subscription_invocations?.[c.invocation_id];
   if(x?.protocol!==2||x.team!==t.id||x.state!=='prepared'||x.nonce!==c.nonce)fail('subscription-undispatched-prepared-required');
   x.state='aborted';result={aborted:x.id};
  } else {
   const {x,p}=invocation(s,t,c);if(x.protocol!==2)fail('subscription-versioned-invocation-required');
   if(c.type==='subscription-consume-v2') {
    if(x.state!=='prepared')fail('subscription-invocation-already-consumed');
    nativeAdmissionCurrent(t,x,p,s.subscription_allocations?.[x.unit_digest],now);
    const used=totals(s,x.unit_digest),allocation=s.subscription_allocations[x.unit_digest];
    if(used.overshoot)fail('subscription-unreconciled-token-overshoot');
    if(used.uncertain||used.actual+used.reserved>decimal(allocation.max_tokens))fail('subscription-token-allocation-exceeded');
    x.state='consumed';x.consumed_at=c.at;result={consumed:x.id,bootstrap_only:true};
   } else if(c.type==='subscription-uncertain-v2') {
    if(!['consumed','uncertain'].includes(x.state))fail('subscription-consumed-invocation-required');x.state='uncertain';result={uncertain:x.id,reservation_retained:true};
   } else {
    if(!['consumed','uncertain','settled'].includes(x.state))fail('subscription-consumed-invocation-required');
    const receipt=bounded(c.receipt);
    fields(receipt,['nonce','context_id','native_id','incarnation','unit_scope','counter_schema','turn_id','billing_before','billing_after','observed_model','coverage','before','after','actual_tokens','isolation_verified']);
    if(receipt.nonce!==x.nonce||receipt.context_id!==x.context.id||receipt.native_id!==x.context.native_id||receipt.incarnation!==x.incarnation||!same(validateNativeCounterUnit(receipt.unit_scope,t.id),x.context.unit_scope)||receipt.counter_schema!==x.context.unit_scope.counter_schema)fail('subscription-terminal-native-binding-mismatch');
    if(receipt.turn_id!==null)id(receipt.turn_id);const beforeBilling=validateBillingObservation(receipt.billing_before),afterBilling=validateBillingObservation(receipt.billing_after);
    if(receipt.observed_model!==null)tuple(receipt.observed_model,true);
    if(typeof receipt.isolation_verified!=='boolean')fail('subscription-isolation-observation-required');
    if(!['complete','partial','absent'].includes(receipt.coverage))fail('subscription-usage-coverage-required');
    if(x.state==='settled'){if(!same(receipt,x.receipt))fail('subscription-terminal-receipt-conflict');return {handled:true,result:{settled:x.id,unchanged:true}};}
    const identityKey=retiredKey(x.collector,x.context.native_id,x.descriptor_digest),derived=t.subscription_native_identity?.[identityKey];
    const binding_changes={billing_before:!sameBilling(beforeBilling,x.context.billing_observation)||!beforeBilling.consistent,billing_after:!sameBilling(afterBilling,x.context.billing_observation)||!afterBilling.consistent,observed_model:conflictsKnownModel(x.context.observed_model,receipt.observed_model)||conflictsKnownModel(derived,receipt.observed_model),isolation:!receipt.isolation_verified};
    for(const key of Object.keys(binding_changes))binding_changes[key] ||= x.binding_changes?.[key]===true;
    const changed=Object.values(binding_changes).some(Boolean);
    let actual;
    if(receipt.coverage==='complete') {
     id(receipt.turn_id);
     const lower=decimal(receipt.before),upper=decimal(receipt.after);actual=decimal(receipt.actual_tokens);
     if(upper<lower||upper-lower!==actual)fail('subscription-native-counter-delta-mismatch');
     for(const other of Object.values(s.subscription_invocations||{})) {
      if(other.id===x.id||other.state!=='settled'||other.unit_digest!==x.unit_digest||other.descriptor_digest!==x.descriptor_digest||other.context.native_id!==x.context.native_id)continue;
      const previousLower=decimal(other.receipt.before),previousUpper=decimal(other.receipt.after);
      if(lower<previousUpper&&upper>previousLower||lower===previousLower&&upper===previousUpper)fail('subscription-native-span-already-accounted');
     }
    }
    // Validate the whole receipt before mutation; genuine billing changes remain usage.
    if(receipt.coverage==='complete'&&!changed) {
     const refined={...derived};for(const key of ['provider','model_id','reasoning'])if(knownModelField(receipt.observed_model?.[key]))refined[key]=receipt.observed_model[key];
     t.subscription_native_identity||={};t.subscription_native_identity[identityKey]=refined;
    }
    x.binding_changes=binding_changes;
    if(changed)for(const context of Object.values(t.subscription_contexts||{}))if(context.protocol===2&&context.native_id===x.context.native_id&&context.collector===x.collector)context.quarantined=true;
    if(receipt.coverage!=='complete') {x.state='uncertain';x.partial_receipt=receipt;result={uncertain:x.id,reservation_retained:true,binding_changes,context_quarantined:changed};}
    else {
     x.state='settled';x.receipt=receipt;x.charged_tokens=receipt.actual_tokens;x.settled_at=c.at;
     if(actual>decimal(x.estimate_tokens))x.overshoot_allocation_revision=s.subscription_allocations[x.unit_digest].revision;
     const used=totals(s,x.unit_digest),allocation=s.subscription_allocations[x.unit_digest];
     result={settled:x.id,actual_tokens:x.charged_tokens,overshoot:actual>decimal(x.estimate_tokens),allocation_blocked:used.overshoot||used.actual+used.reserved>decimal(allocation.max_tokens),binding_changes,context_quarantined:changed};
    }
   }
  }
 }
 return {handled:true,result};
}
