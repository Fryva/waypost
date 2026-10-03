// Authenticated finite-trial ledger foundation. No inference, native-profile
// importer, policy activation or execution/review privilege is installed here.
import { routingDigest } from './model-routing.mjs';
import { createProtocolRoleSuite,formatProtocolTrial,gradeProtocolTrial,summarizeProtocolRole } from './team-role-suite.mjs';
const fail=code=>{throw new Error('calibration-'+code);};
const same=(a,b)=>a===undefined||b===undefined?a===b:routingDigest(a)===routingDigest(b);
const id=v=>{if(typeof v!=='string'||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(v))fail('id-required');return v;};
const digest=v=>{if(typeof v!=='string'||! /^[a-f0-9]{64}$/.test(v))fail('digest-required');return v;};
const integer=v=>{if(typeof v!=='string'||! /^(0|[1-9][0-9]{0,17})$/.test(v))fail('token-integer-required');return BigInt(v);};
function object(v,allowed,max=32768){if(!v||typeof v!=='object'||Array.isArray(v)||Buffer.byteLength(JSON.stringify(v))>max||Object.keys(v).some(k=>!allowed.includes(k)))fail('bounded-fields-required');return structuredClone(v);}
function memberParticipant(t,m){const p=t.participants?.[m.participant];if(!p||p.revoked||p.availability==='left'||p.incarnation!==m.incarnation||p.model?.model_revision!==m.model_revision||p.native_binding?.descriptor_digest!==m.descriptor_digest)fail('member-binding-required');return p;}
const measurementFields=['kind','cohort_id','role','case_id','profile_id','suite_digest','criteria_digest','prompt_digest'];
function bundleFor(cohort){const bundle=createProtocolRoleSuite({seed:cohort.seed,cohort:cohort.id,profiles:cohort.members.map(m=>m.profile_id)});if(bundle.suite_digest!==cohort.suite_digest||bundle.grading_digest!==cohort.criteria_digest)fail('installed-suite-binding');return bundle;}
function locate(t,measurement){const cohort=Object.hasOwn(t.native_calibration_cohorts||{},measurement.cohort_id)?t.native_calibration_cohorts[measurement.cohort_id]:null;if(!cohort)fail('opened-cohort-required');const member=cohort.members.find(m=>m.profile_id===measurement.profile_id);if(!member)fail('cohort-profile-required');return {cohort,member,bundle:bundleFor(cohort)};}
const slotKey=m=>routingDigest({profile:m.profile_id,role:m.role,case:m.case_id});
function freshNativeContext(s,context,excluding=null){
 if(Object.values(s.subscription_invocations||{}).some(x=>x.id!==excluding&&['consumed','uncertain','settled'].includes(x.state)&&x.collector===context.collector&&x.context?.native_id===context.native_id))fail('single-call-fresh-native-context-required');
}
function budget(s,cohort,unitDigest,additional=0n,excluding=null){const limit=cohort.unit_allocations.find(u=>u.unit_digest===unitDigest);if(!limit)fail('cohort-unit-allocation-required');let used=additional;for(const x of Object.values(s.subscription_invocations||{})){if(x.id===excluding||x.measurement?.cohort_id!==cohort.id||x.unit_digest!==unitDigest||x.state==='aborted')continue;used+=integer(x.state==='settled'?x.charged_tokens:x.estimate_tokens);}if(used>integer(limit.max_tokens))fail('cohort-token-allocation-exceeded');}

export function validateProtocolMeasurement(s,t,reservation,participant,context,now){
 if(reservation.measurement===undefined)return null;
 const m=object(reservation.measurement,measurementFields,8192);if(m.kind!=='objective-role-trial'||reservation.purpose!=='calibration')fail('typed-trial-required');
 for(const key of ['cohort_id','case_id','profile_id'])id(m[key]);for(const key of ['suite_digest','criteria_digest','prompt_digest'])digest(m[key]);
 const {cohort,member,bundle}=locate(t,m);memberParticipant(t,member);
 if(member.participant!==participant.id||member.incarnation!==reservation.incarnation||member.descriptor_digest!==context.descriptor_digest||!cohort.roles.includes(m.role)||m.suite_digest!==cohort.suite_digest||reservation.suite_digest!==cohort.suite_digest||m.criteria_digest!==cohort.criteria_digest)fail('trial-member-or-suite-binding');
 const trial=bundle.trials.find(x=>x.id===m.case_id&&x.role===m.role);if(!trial||m.prompt_digest!==routingDigest(formatProtocolTrial(bundle,trial.id)))fail('installed-prompt-binding');
 if(Date.parse(cohort.expires_at)<=now)fail('current-cohort-required');
 if(cohort.slots?.[slotKey(m)]||Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&x.state!=='aborted'&&x.measurement&&x.measurement.cohort_id===m.cohort_id&&slotKey(x.measurement)===slotKey(m)))fail('trial-slot-already-reserved-or-consumed');
 freshNativeContext(s,context);
 budget(s,cohort,context.unit_digest,integer(reservation.estimate_tokens));return m;
}
export function consumeProtocolMeasurement(s,t,invocation,now,command){
 if(!invocation.measurement)return;
 const m=invocation.measurement,{cohort,member}=locate(t,m);memberParticipant(t,member);
 if(command?.prompt_digest!==m.prompt_digest)fail('consumed-installed-prompt-required');
 if(cohort.slots?.[slotKey(m)]||Date.parse(cohort.expires_at)<=now)fail('trial-slot-consumed-or-expired');
 freshNativeContext(s,invocation.context,invocation.id);
 budget(s,cohort,invocation.unit_digest,integer(invocation.estimate_tokens),invocation.id);
 cohort.slots||={};cohort.slots[slotKey(m)]={invocation_id:invocation.id,nonce:invocation.nonce,consumed_at:new Date(now).toISOString()};
}
export function sealProtocolMeasurement(t,invocation,receipt,now){
 if(receipt.measurement===undefined)return null;
 if(!invocation.measurement)fail('typed-trial-admission-required');
 const seal=object(receipt.measurement,[...measurementFields,'observed_at','original_output','output_digest','native_receipt_digest','native_receipt','outcome'],49152);
 const immutable=Object.fromEntries(measurementFields.map(k=>[k,seal[k]]));
 if(!same(immutable,invocation.measurement)||typeof seal.original_output!=='string'||Buffer.byteLength(seal.original_output)>8192||routingDigest(seal.original_output)!==digest(seal.output_digest)||!['completed','failed'].includes(seal.outcome))fail('terminal-measurement-binding');
 const native=object(seal.native_receipt,['invocation_id','native_id','usage_span','actualModel','context_manifest','output'],32768);
 if(routingDigest(native)!==digest(seal.native_receipt_digest)||native.invocation_id!==invocation.nonce||native.native_id!==invocation.context.native_id||native.output!==seal.original_output||native.context_manifest?.native_id!==native.native_id||!same({provider:native.actualModel?.provider??null,model_id:native.actualModel?.model_id??null,reasoning:native.actualModel?.reasoning??null},receipt.observed_model)||native.usage_span?.native_id!==native.native_id||native.usage_span?.turn_id!==receipt.turn_id||native.usage_span?.schema!==receipt.counter_schema)fail('native-receipt-projection-binding');
 if(receipt.coverage!=='complete')return null;
 if(native.usage_span.coverage!=='complete'||['before','after','actual_tokens'].some(k=>native.usage_span[k]!==receipt[k]))fail('native-receipt-counter-binding');
 const measured=Date.parse(seal.observed_at);
 if(!Number.isFinite(measured)||measured>now||now-measured>30000||Date.parse(native.actualModel?.observed_at)!==measured)fail('terminal-observation-clock');

 const {cohort}=locate(t,invocation.measurement),slot=cohort.slots?.[slotKey(invocation.measurement)];
 if(slot?.invocation_id!==invocation.id||slot.nonce!==invocation.nonce)fail('consumed-trial-slot-required');
 return {...seal,context_snapshot_digest:routingDigest(native.context_manifest),sealed_at:new Date(now).toISOString(),turn_id:receipt.turn_id,context_id:invocation.context.id,native_id:invocation.context.native_id,incarnation:invocation.incarnation};
}

export function applyProtocolCalibration(s,t,c,now,H){
 if(!['native-calibration-cohort-open-v2','subscription-measurement-capture-v2'].includes(c.type))return null;
 let result;
 if(c.type==='native-calibration-cohort-open-v2'){
  H.owner(s,c);
  if(t.accounting?.protocol!==2||t.accounting.billing_policy!=='inherited-native')fail('inherited-native-mode-required');
  const cohort=object(c.cohort,['id','seed','members','roles','unit_allocations','suite_digest','criteria_digest','expires_at']);id(cohort.id);id(cohort.seed);digest(cohort.suite_digest);digest(cohort.criteria_digest);
  if(!Array.isArray(cohort.members)||!cohort.members.length||cohort.members.length>128||!Array.isArray(cohort.roles)||!cohort.roles.length||new Set(cohort.roles).size!==cohort.roles.length||cohort.roles.some(r=>!['coordinate','review'].includes(r)))fail('fixed-membership-required');
  for(const m of cohort.members){object(m,['participant','incarnation','model_revision','descriptor_digest','profile_id']);id(m.participant);id(m.incarnation);id(m.profile_id);digest(m.descriptor_digest);if(!Number.isSafeInteger(m.model_revision)||m.model_revision<1)fail('member-revision-required');memberParticipant(t,m);}
  if(new Set(cohort.members.map(m=>m.profile_id)).size!==cohort.members.length)fail('unique-profiles-required');
  if(!Array.isArray(cohort.unit_allocations)||!cohort.unit_allocations.length||cohort.unit_allocations.length>128||new Set(cohort.unit_allocations.map(u=>u.unit_digest)).size!==cohort.unit_allocations.length)fail('unit-allocations-required');
  for(const u of cohort.unit_allocations){object(u,['unit_digest','max_tokens','allocation_revision']);digest(u.unit_digest);const allocation=s.subscription_allocations?.[u.unit_digest];if(allocation?.protocol!==2||allocation.unit_scope.team!==t.id||u.allocation_revision!==allocation.revision||integer(u.max_tokens)>integer(allocation.max_tokens))fail('existing-unit-allocation-required');}
  if(!Number.isFinite(Date.parse(cohort.expires_at))||Date.parse(cohort.expires_at)<=now||Date.parse(cohort.expires_at)-now>900000)fail('cohort-expiry-required');bundleFor(cohort);
  const old=Object.hasOwn(t.native_calibration_cohorts||{},cohort.id)?t.native_calibration_cohorts[cohort.id]:null;if(old){if(!same(old.configuration,cohort))fail('cohort-immutable');return {handled:true,result:{cohort:cohort.id,unchanged:true}};}
  t.native_calibration_cohorts||={};t.native_calibration_cohorts[cohort.id]={...cohort,configuration:structuredClone(cohort),opened_at:c.at,slots:{},captures:{}};result={cohort:cohort.id,roles_granted:false};
 }else{
  const x=s.subscription_invocations?.[c.invocation_id];if(x?.protocol!==2||x.team!==t.id||x.nonce!==c.nonce||!x.measurement||x.state!=='settled'||x.receipt?.coverage!=='complete'||!x.measurement_seal||integer(x.charged_tokens)<=0n)fail('complete-sealed-trial-required');
  const {cohort,member,bundle}=locate(t,x.measurement),p=memberParticipant(t,member),key=p.native_binding.collector_id,registered=s.collectors?.[key];
  if(c.actor!=='collector:'+key||c.actor!==x.collector||registered?.revoked||registered?.team!==t.id||!['runtime','usage'].every(k=>registered?.purposes?.includes(k))||x.incarnation!==p.incarnation||x.descriptor_digest!==p.native_binding.descriptor_digest)fail('bound-measurement-collector-required');
  if(Object.values(x.binding_changes||{}).some(Boolean)||Object.values(t.subscription_contexts||{}).some(ctx=>ctx.native_id===x.context.native_id&&ctx.collector===x.collector&&ctx.quarantined))fail('nonquarantined-measurement-required');
  const capture=object(c.capture,['measurement','original_output','output_digest','native_receipt_digest','native_id','context_id','turn_id','incarnation','descriptor_digest','observed_at','expires_at','observation_id','profile_digest','profile_snapshot_digest','context_snapshot_digest','native_profile']);
  const seal=x.measurement_seal;
  if(!same(capture.measurement,x.measurement)||capture.original_output!==seal.original_output||capture.output_digest!==seal.output_digest||capture.native_receipt_digest!==seal.native_receipt_digest||capture.native_id!==seal.native_id||capture.context_id!==seal.context_id||capture.turn_id!==seal.turn_id||capture.incarnation!==x.incarnation||capture.descriptor_digest!==x.descriptor_digest||capture.observed_at!==seal.observed_at||capture.context_snapshot_digest!==seal.context_snapshot_digest||seal.outcome!=='completed')fail('sealed-capture-binding-required');
  const profile=object(capture.native_profile,['protocol','identity_kind','profile_id','profile_digest','profile','observation_id','participant','incarnation','model_revision','native_id','context_id','invocation_id','nonce','observed_at','expires_at','receipt_digest','provenance','roles','rank_eligible','limitations','measurement','admission_id','admission_digest','sealed_native_receipt_digest'],32768);
  const native=seal.native_receipt,ctx=native.context_manifest;
  if(profile.provenance!=='trusted-host-settled-objective-measurement'||profile.admission_id!==x.id||profile.sealed_native_receipt_digest!==seal.native_receipt_digest||!same(profile.measurement,x.measurement)||profile.nonce!==x.nonce||profile.rank_eligible!==false||!Array.isArray(profile.roles)||profile.roles.length||profile.receipt_digest!==routingDigest({invocation_id:x.nonce,output:seal.original_output,actualModel:native.actualModel,context_manifest:ctx}))fail('settled-profile-provenance-required');
  const {observation_id:observationId,...observationBody}=profile;if(observationId!=='native-observation-'+routingDigest(observationBody))fail('immutable-observation-required');
  if(profile.protocol!==2||profile.identity_kind!=='native-configuration'||profile.profile_id!==x.measurement.profile_id||profile.profile_id!=='native-profile-'+digest(profile.profile_digest)||profile.profile_digest!==routingDigest(profile.profile)||capture.profile_digest!==profile.profile_digest||capture.profile_snapshot_digest!==routingDigest(profile.profile)||capture.observation_id!==profile.observation_id||profile.participant!==x.participant||profile.incarnation!==x.incarnation||profile.model_revision!==member.model_revision||profile.native_id!==x.context.native_id||profile.context_id!==ctx.id||profile.invocation_id!==x.nonce||profile.observed_at!==seal.observed_at||profile.profile?.native_routing_id!==native.actualModel?.provider||profile.profile?.native_model_id!==native.actualModel?.model_id||profile.profile?.execution_scope?.cwd!==ctx.cwd||profile.profile?.execution_scope?.read_only!==true||!Array.isArray(profile.profile?.execution_scope?.tools)||profile.profile.execution_scope.tools.length||ctx.read_only!==true||ctx.fresh!==true||ctx.fresh_review_verified!==true||ctx.provenance!=='adapter-isolated'||ctx.author_history_inherited!==false||ctx.author_contexts?.length!==0||ctx.tools?.length!==0)fail('actual-profile-snapshot-binding');
  id(profile.observation_id);const measured=Date.parse(profile.observed_at),expiry=Date.parse(profile.expires_at);
  if(!Number.isFinite(expiry)||expiry<=measured||expiry-measured>900000||Date.parse(capture.expires_at)!==Math.min(expiry,Date.parse(cohort.expires_at)))fail('original-profile-clock-required');
  const slot=cohort.slots[slotKey(x.measurement)];if(slot?.invocation_id!==x.id)fail('consumed-trial-slot-required');
  const stored={...capture,invocation_id:x.id,nonce:x.nonce,collector:x.collector,settled_at:x.settled_at,grade:gradeProtocolTrial(bundle,x.measurement.case_id,capture.original_output)};
  const old=cohort.captures[slotKey(x.measurement)];if(old){if(!same(old,stored))fail('capture-immutable');return {handled:true,result:{captured:x.id,unchanged:true}};}
  cohort.captures[slotKey(x.measurement)]=stored;result={captured:x.id,pass:stored.grade.pass,roles_granted:false};
 }
 return {handled:true,result};
}

// Only the installed host supplies this authority reader. Detached summaries
// cannot re-enter the compiler as authenticated evidence.
const authenticatedSummaries=new WeakMap();
function immutable(value){if(value&&typeof value==='object'){for(const v of Object.values(value))immutable(v);Object.freeze(value);}return value;}
function summaryClock(now){const value=typeof now==='function'?now():now;if(!Number.isSafeInteger(value)||value<0)fail('summary-clock-required');return value;}
export async function collectAuthenticatedCalibrationSummary({teamId,cohortId,readAuthority,now=Date.now}={}){
 id(teamId);id(cohortId);if(typeof readAuthority!=='function')fail('trusted-authority-reader-required');
 const at=summaryClock(now),loaded=await readAuthority();
 if(!Number.isSafeInteger(loaded?.revision)||loaded.revision<0||!loaded.state||Buffer.byteLength(JSON.stringify(loaded.state))>33554432)fail('bounded-authority-snapshot-required');
 const s=structuredClone(loaded.state),t=s.teams?.[teamId],cohort=t&&Object.hasOwn(t.native_calibration_cohorts||{},cohortId)?t.native_calibration_cohorts[cohortId]:null;
 if(!cohort||t.accounting?.protocol!==2||t.accounting.billing_policy!=='inherited-native')fail('opened-native-cohort-required');
 const bundle=bundleFor(cohort),captures=Object.entries(cohort.captures||{}).sort(([a],[b])=>a.localeCompare(b));
 const captureFields=['measurement','original_output','output_digest','native_receipt_digest','native_id','context_id','turn_id','incarnation','descriptor_digest','observed_at','expires_at','observation_id','profile_digest','profile_snapshot_digest','context_snapshot_digest','native_profile'];
 const profiles=cohort.members.map(member=>{
  const p=t.participants[member.participant],registered=s.collectors?.[p?.native_binding?.collector_id];
  const current=!!(p&&!p.revoked&&p.availability!=='left'&&p.incarnation===member.incarnation&&p.model?.model_revision===member.model_revision&&p.native_binding?.descriptor_digest===member.descriptor_digest&&registered&&!registered.revoked&&registered.team===teamId);
  const rows=captures.filter(([,c])=>c.measurement?.profile_id===member.profile_id);
  for(const [slot,c] of rows){
   const x=s.subscription_invocations?.[c.invocation_id];
   if(slot!==slotKey(c.measurement)||x?.team!==teamId||x.state!=='settled'||x.measurement_seal?.outcome!=='completed'||x.charged_tokens==='0'||!same(x.measurement,c.measurement)||x.measurement_seal.original_output!==c.original_output||routingDigest(c.original_output)!==c.output_digest||x.measurement_seal.native_receipt_digest!==c.native_receipt_digest||!same(gradeProtocolTrial(bundle,c.measurement.case_id,c.original_output),c.grade))fail('authenticated-capture-snapshot-required');
   const sealedAt=Date.parse(x.measurement_seal.sealed_at),receipt=x.receipt;
   if(!Number.isFinite(sealedAt)||sealedAt>at||Date.parse(x.settled_at)!==sealedAt||c.settled_at!==x.settled_at||receipt?.coverage!=='complete'||x.charged_tokens!==receipt.actual_tokens||integer(receipt.after)-integer(receipt.before)!==integer(x.charged_tokens)||integer(x.charged_tokens)<=0n)fail('original-settled-accounting-required');
   // Replay at the recorded settlement clock, never at a fabricated fresh one.
   // This rehashes the original native projection instead of trusting caches.
   if(!same(sealProtocolMeasurement(t,x,receipt,sealedAt),x.measurement_seal))fail('original-native-seal-required');
   if(current){
    // Reuse the exact capture gate and immutable replay check; this clone never
    // writes to authority and cannot extend the original capture timestamps.
    applyProtocolCalibration(s,t,{type:'subscription-measurement-capture-v2',actor:c.collector,invocation_id:c.invocation_id,nonce:c.nonce,capture:Object.fromEntries(captureFields.map(k=>[k,c[k]]))},at,{});
   }
  }
  const roles=cohort.roles.map(role=>{
   const completed=rows.map(([,c])=>c).filter(c=>c.measurement.role===role),verdict=summarizeProtocolRole(bundle,role,completed.map(c=>({trial_id:c.measurement.case_id,raw_answer:c.original_output})));
   const observed=completed.length?Math.min(...completed.map(c=>Date.parse(c.observed_at))):Date.parse(cohort.opened_at);
   const expiry=Math.min(Date.parse(cohort.expires_at),...completed.map(c=>Date.parse(c.expires_at)));
   if(!Number.isFinite(observed)||!Number.isFinite(expiry)||observed>at||expiry<=observed)fail('original-calibration-clock-required');
   const fresh=current&&at<expiry;
   return {...verdict,current:fresh,qualification_candidate:fresh&&verdict.qualified,observed_at:new Date(observed).toISOString(),expires_at:new Date(expiry).toISOString()};
  });
  const profileDigest=member.profile_id.startsWith('native-profile-')?member.profile_id.slice('native-profile-'.length):null;digest(profileDigest);
  return {identity:{kind:'native-configuration',profile_id:member.profile_id,profile_digest:profileDigest,profile_revision:1},participant:member.participant,incarnation:member.incarnation,model_revision:member.model_revision,descriptor_digest:member.descriptor_digest,roles};
 });
 const expires=Math.min(Date.parse(cohort.expires_at),...profiles.flatMap(p=>p.roles.map(r=>Date.parse(r.expires_at))));
 const summary=immutable({protocol:2,team:teamId,cohort:cohortId,authority_revision:loaded.revision,suite_digest:cohort.suite_digest,criteria_digest:cohort.criteria_digest,captures_digest:routingDigest(captures),generated_at:new Date(at).toISOString(),expires_at:new Date(expires).toISOString(),profiles,authority_granted:false});
 authenticatedSummaries.set(summary,{digest:routingDigest(summary),expires});return summary;
}
export function verifyAuthenticatedCalibrationSummary(summary,{now=Date.now}={}){
 const proof=authenticatedSummaries.get(summary),at=summaryClock(now);
 if(!proof||proof.digest!==routingDigest(summary))fail('authenticated-summary-provenance-required');
 if(at<Date.parse(summary.generated_at)||at>=proof.expires)fail('current-summary-required');
 return summary;
}
