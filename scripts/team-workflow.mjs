// Versioned protected workflow extensions. Old transitions retain their replay.
import { validateParticipantHostBinding } from './team-host-registry.mjs';
import { validateQuotaObservation, quotaEligible } from './team-quota.mjs';
import { createHash } from 'node:crypto';
import { rankParticipant, validateDescriptor } from './team.mjs';
import { routingDigest, validateManifest, proposeModelRoute } from './model-routing.mjs';
import { applySubscriptionAccounting } from './team-subscription.mjs';
const hash = v => typeof v==='string' ? createHash('sha256').update(v).digest('hex') : routingDigest(v);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const terminal = w => ['integrated','cancelled'].includes(w.status);
function fail(s) { throw new Error(s); }
function bounded(v,n=65536) { if (v === undefined || Buffer.byteLength(JSON.stringify(v))>n) fail('workflow-evidence-limit'); return structuredClone(v); }
function digest(v) { if (!/^[a-f0-9]{64}$/.test(v || '')) fail('immutable-digest-required'); return v; }
function portable(v) { if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v || '')) fail('workflow-id-required'); return v; }
function collector(s,t,c,purpose) {
 const x=s.collectors?.[c.actor?.replace(/^collector:/,'')];
 if (!c.actor?.startsWith('collector:') || !x || x.revoked || x.team!==t.id || !x.purposes.includes(purpose)) fail('bound-collector-required');
 return x;
}
function quotaCurrent(t,x){return !t.quota_policy?.automatic_redistribution || (x?.quota_revision??0)===(t.quota_revision??0);}
function quotaReady(t,p,now){return !t.quota_policy?.automatic_redistribution || quotaEligible(p,now);}
function controlInvocation(s,t,c,purpose,participant,nonce,action) {
 const x=s.invocations?.[c.invocation_id],e=x&&t.routing_evidence?.[x.evidence_digest],g=e?.grant;
 if(!x || x.kind!=='control' || x.state!=='dispatching' || x.team!==t.id || x.collector!==c.actor || g?.kind!=='control' || g.purpose!==purpose || g.participant!==participant || g.nonce!==nonce || (action!==undefined&&g.action!==action) || x.control_bound || !quotaCurrent(t,g) || !quotaReady(t,t.participants[participant],Date.parse(c.at)))fail('budgeted-'+(purpose==='review'?'review':'control')+'-invocation-required');
 if(purpose==='review'){const r=t.review_requests?.[nonce],w=r&&t.work[r.work],p=t.participants[participant],rank=rankParticipant(p,t.policy,'review',{now:Date.parse(c.at)});if(!r||!w||g.work_id!==r.work||g.generation!==w.generation||g.target_digest!==r.target_digest||g.criteria_digest!==r.criteria_digest||g.tests_digest!==r.tests_digest||g.native_id!==r.manifest.native_id||g.context_id!==r.manifest.context_id||rank===null||t.review_floor===null||rank<t.review_floor||t.review_blocker||!p||p.revoked||p.availability!=='ready'||r.manifest.fresh!==true||r.manifest.read_only!==true)fail('budgeted-review-context-binding-required');}
 x.control_bound=true;
 return x;
}
function currentReview(t,w,now) {
 if(!w || !['reviewed','integrated'].includes(w.status))return undefined;
 const latest=w.reviews?.at(-1);if(latest?.verdict!=='approve' || w.reviews?.some(r=>r.generation===w.generation&&['blocked','changes-requested'].includes(r.verdict)))return undefined;
 if(Object.values(t.review_requests||{}).some(r=>r.work===w.id&&r.generation===w.generation&&!r.output_digest&&!r.reconciled_stopped))return undefined;
 const eligible=r=>{const p=t.participants[r.reviewer];return p&&quotaCurrent(t,r)&&quotaReady(t,p,now)&&!p.revoked&&!['left','unavailable'].includes(p.availability);};
 return w.reviews?.find(r=>eligible(r) && r.verdict==='approve' && r.epoch===t.epoch && r.generation===w.generation && r.policy_revision===t.policy.revision && r.target_digest===w.result?.target_digest && r.tests_digest===w.result?.tests_digest && r.criteria_digest===w.criteria_digest && t.review_floor!==null && r.rank>=t.review_floor && !t.review_blocker && t.participants[r.reviewer]?.model.model_revision===r.model_revision && rankParticipant(t.participants[r.reviewer],t.policy,'review',{now})!==null && rankParticipant(t.participants[r.reviewer],t.policy,'review',{now})>=t.review_floor);
}
export function applyWorkflow(s,t,c,now,H) {
 const subscription=applySubscriptionAccounting(s,t,c,now,H);
 if(subscription!==null)return subscription;
 if(t.accounting?.mode==='subscription-tokens' && ['routing-enable-v2','control-grant-capture-v1','control-invocation-reserve-v1','routing-grant-capture-v1','assign-routed-v2','invocation-reserve-v1'].includes(c.type))fail('subscription-mode-migration-required');
 let result;
 const work=()=> {const w=t.work[c.work_id];if(!w)fail('work-not-found');return w;};
 if(c.type==='quota-policy-enable-v1') {
  H.owner(s,c);if(t.quota_policy?.automatic_redistribution)fail('quota-policy-already-enabled');
  if(Object.values(t.work).some(w=>!terminal(w)))fail('outstanding-work-requires-quota-migration');
  t.quota_policy={protocol:1,automatic_redistribution:true};t.quota_revision=1;t.review_admissions={};
  H.floor(t,c.at);H.propose(t,c.at);result={quota_revision:t.quota_revision};
 }else if(c.type==='quota-capture-v1') {
  collector(s,t,c,'usage');if(!t.quota_policy?.automatic_redistribution)fail('quota-policy-required');
  const p=H.participant(t,c.participant_id),observation=validateQuotaObservation(c.observation,{participant:p,now});
  const old=p.quota_observation;
  if(old){const before=Date.parse(old.observed_at),after=Date.parse(observation.observed_at);
   if(after<before || after===before&&!same(old,observation) || old.observation_id===observation.observation_id&&!same(old,observation))fail('quota-observation-order-conflict');
   if(same(old,observation)){result={quota_revision:t.quota_revision,unchanged:true};return {handled:true,result};}
  }
  const previousEligible=quotaReady(t,p,now),previousFloor=t.review_floor,previousBlocker=t.review_blocker,previousRevision=t.quota_revision;
  p.quota_observation=observation;H.floor(t,c.at);
  if(previousEligible!==quotaReady(t,p,now) || previousFloor!==t.review_floor || previousBlocker!==t.review_blocker || old&&(!same(old.model,observation.model)||old.incarnation!==observation.incarnation||old.model_revision!==observation.model_revision||!same(old.route,observation.route)||old.scope!==observation.scope)){
   if(t.quota_revision===previousRevision)t.quota_revision=(t.quota_revision||0)+1;
   for(const w of Object.values(t.work)){if(terminal(w))continue;w.reviews=(w.reviews||[]).filter(r=>r.verdict!=='approve');if(w.status==='reviewed')w.status='review-pending';}
  }
  H.propose(t,c.at);result={participant:p.id,status:observation.status,quota_revision:t.quota_revision,candidate:t.candidate};
 }else if(c.type==='collector-register-v1') {
  H.owner(s,c);const x=bounded(c.collector,4096);portable(x.id);
  if(!/^[a-f0-9]{64}$/.test(x.credential_hash||'') || !Array.isArray(x.purposes) || !x.purposes.length || x.purposes.some(p=>!['runtime','material','review','usage','dispatch'].includes(p)))fail('invalid-collector-registration');
  s.collectors ||= {};if(s.collectors[x.id])fail('collector-already-registered');
  s.collectors[x.id]={...x,team:t.id,revoked:false};result={collector:x.id};
 }else if(c.type==='collector-revoke-v1') {
  H.owner(s,c);const x=s.collectors?.[c.collector_id];if(!x || x.team!==t.id)fail('bound-collector-required');x.revoked=true;result={revoked:x.id};
 }else if(c.type==='delivery-consume-v1') {
  collector(s,t,c,'dispatch');const m=t.messages.find(x=>x.id===c.message_id),p=m&&H.participant(t,m.recipient);portable(c.nonce);
  if(!quotaReady(t,p,now) || !m || m.epoch!==t.epoch || c.epoch!==t.epoch || m.incarnation!==p.incarnation || c.participant_id!==p.id || !c.native_id)fail('addressed-current-message-required');
  if(t.routing?.required)controlInvocation(s,t,c,'delivery',p.id,c.nonce,m.id);
  t.deliveries ||= {};if(t.deliveries[c.nonce] || Object.values(t.deliveries).some(x=>x.message_id===m.id&&!['rejected'].includes(x.state)))fail('native-message-already-consumed');
  t.deliveries[c.nonce]={nonce:c.nonce,message_id:m.id,participant:p.id,incarnation:p.incarnation,epoch:t.epoch,native_id:c.native_id,collector:c.actor,state:'dispatching'};result={consumed:c.nonce};
 }else if(c.type==='delivery-capture-v1') {
  collector(s,t,c,'dispatch');const r=t.deliveries?.[c.nonce];if(!r || r.collector!==c.actor || r.state!=='dispatching')fail('bound-native-delivery-required');
  if(c.outcome==='uncertain'){r.state='uncertain';result={uncertain:r.nonce};}
  else {
   const p=H.participant(t,r.participant);if(r.epoch!==t.epoch || r.incarnation!==p.incarnation || c.native_id!==r.native_id || typeof c.output!=='string' || Buffer.byteLength(c.output)>65536 || hash(c.output)!==c.output_digest)fail('native-delivery-receipt-mismatch');
   r.state='received';r.received_at=c.at;r.output_digest=c.output_digest;r.output=c.output;r.actual_model=bounded(c.actual_model,4096);result={received:r.message_id,native_id:r.native_id};
  }
 }else if(c.type==='native-operation-reconcile-v1') {
  collector(s,t,c,'dispatch');if(c.stopped!==true)fail('explicit-native-stopped-proof-required');digest(c.evidence_digest);
  const records={runtime:t.runtime_requests,review:t.review_requests,delivery:t.deliveries},r=records[c.operation]?.[c.nonce];
  if(!r || r.collector!==c.actor || (c.operation==='delivery'?!['dispatching','uncertain'].includes(r.state):!r.consumed||r.captured||r.output_digest))fail('uncertain-native-operation-required');
  r.reconciled_stopped=true;r.stop_evidence_digest=c.evidence_digest;if(c.operation==='delivery')r.state='stopped';result={stopped:c.nonce};
 }else if(c.type==='participant-host-register-v1') {
  H.owner(s,c);const p=H.participant(t,c.participant_id),binding=validateParticipantHostBinding(bounded(c.binding,8192),{participant:p});
  if(p.host_binding && !same(p.host_binding,binding))fail('host-registry-change-requires-new-participant');
  p.host_binding=binding;result={registered:p.id};
 }else if(c.type==='native-binding-v1') {
  H.owner(s,c);const p=H.participant(t,c.participant_id),b=bounded(c.binding,8192);
  if(typeof b.endpoint_file!=='string' || !/^(\/|[A-Za-z]:[\\/])/.test(b.endpoint_file) || typeof b.collector_file!=='string' || !/^(\/|[A-Za-z]:[\\/])/.test(b.collector_file) || !s.collectors?.[b.collector_id] || s.collectors[b.collector_id].team!==t.id)fail('host-native-binding-required');
  digest(b.descriptor_digest);if(p.native_binding && !same(p.native_binding,b))fail('native-binding-change-requires-new-participant');
  p.native_binding=b;result={bound:p.id};
 }else if(c.type==='runtime-request-v1') {
  H.owner(s,c);const p=H.participant(t,c.participant_id);portable(c.nonce);if(typeof c.action!=='string'||!c.action||c.action.length>1024)fail('runtime-action-required');t.runtime_requests ||= {};
  if(t.runtime_requests[c.nonce])fail('runtime-nonce-already-used');
  t.runtime_requests[c.nonce]={participant:p.id,incarnation:p.incarnation,nonce:c.nonce,action:c.action,epoch:t.epoch,consumed:false};result={nonce:c.nonce};
 }else if(c.type==='runtime-consume-v1') {
  if(t.routing?.required && !c.invocation_id)fail('budgeted-control-invocation-required');
  collector(s,t,c,'runtime');const r=t.runtime_requests?.[c.nonce];if(!r || r.consumed || !quotaReady(t,t.participants[r.participant],now))fail('invalid-runtime-invocation');r.consumed=true;r.collector=c.actor;result={consumed:r.nonce};
  if(t.routing?.required)controlInvocation(s,t,c,'runtime',r.participant,r.nonce,r.action);
 }else if(c.type==='runtime-capture-v1') {
  collector(s,t,c,'runtime');const r=t.runtime_requests?.[c.nonce],p=r&&H.participant(t,r.participant);
  if(!r || !r.consumed || r.collector!==c.actor || r.captured || p.incarnation!==r.incarnation || r.epoch!==t.epoch)fail('runtime-receipt-binding-mismatch');
  const model=validateDescriptor(c.model);if(model.evidence.kind!=='adapter-observed' || model.evidence.action!==r.action || Math.abs(now-Date.parse(model.evidence.observed_at))>30000 || !c.native_id || !c.output_digest)fail('fresh-runtime-evidence-required');
  digest(c.output_digest);const changed=['provider','model_id','reasoning'].some(k=>model[k]!==p.model[k]);
  if(model.model_revision<p.model.model_revision || changed&&model.model_revision<=p.model.model_revision)fail('runtime-model-revision-required');
  p.model=model;p.native_id=c.native_id;p.identity_checked_at=c.at;r.captured=true;r.output_digest=c.output_digest;
  if(changed){if(t.leader===p.id)t.status='handover';for(const w of Object.values(t.work)){w.reviews=[];if(w.worker===p.id&&!terminal(w))w.status='uncertain';}}
  H.floor(t,c.at);H.propose(t,c.at);result={participant:p.id,model_revision:model.model_revision};
 }else if(c.type==='begin-handover-v1') {
  H.owner(s,c);if(t.status!=='handover' || !t.candidate)fail('no-handover-candidate');
  if(t.handover)fail('handover-already-started');
  t.handover={old_epoch:t.epoch,old_leader:t.leader,candidate:t.candidate,candidate_incarnation:t.participants[t.candidate].incarnation,candidate_model_revision:t.participants[t.candidate].model.model_revision,policy_revision:t.policy.revision,target_epoch:t.epoch+1,acks:{},adoptions:{}};
  for(const p of new Set([t.leader,...Object.values(t.work).filter(w=>!terminal(w)).map(w=>w.worker)]))if(p && !t.participants[p].revoked && t.participants[p].availability!=='left')H.envelope(t,{...c,message_id:hash([c.request_key,p])},t.candidate,'quiesce',p,{epoch:t.epoch,next_epoch:t.epoch+1});
  result={epoch:t.epoch,next_epoch:t.epoch+1};
 }else if(c.type==='quiesce-capture-v1') {
  collector(s,t,c,'dispatch');const p=t.participants[c.participant_id];if(!p || !t.handover || p.incarnation!==c.participant_incarnation || c.epoch!==t.handover.old_epoch || c.stopped!==true)fail('bound-stopped-process-receipt-required');
  digest(c.evidence_digest);t.handover.acks[p.id]={at:c.at,evidence_digest:c.evidence_digest,stopped:true,collector:c.actor};result={quiesced:p.id};
 }else if(c.type==='quiesce-ack-v1') {
  const p=H.member(t,c);if(!t.handover || c.epoch!==t.handover.old_epoch)fail('handover-epoch-mismatch');
  if(c.stopped!==true || !c.evidence_digest)fail('explicit-stopped-evidence-required');
  digest(c.evidence_digest);t.handover.acks[p.id]={at:c.at,evidence_digest:c.evidence_digest,stopped:true};result={quiesced:p.id};
 }else if(c.type==='adopt-work-v1') {
  const p=H.member(t,c),w=work();if(!t.handover || p.id!==t.candidate || c.epoch!==t.epoch)fail('handover-candidate-required');
  H.qualified(t,p,'coordinate',c);
  if(terminal(w) || w.status==='adoption-pending' || !t.handover.acks[w.worker]?.stopped || c.base!==w.base || !same(c.paths,w.paths) || c.target_digest!==(w.result?.target_digest||null))fail('stopped-retained-work-required');
  w.retained_status=w.status;w.generation++;w.epoch=t.handover.target_epoch;w.policy_revision=t.policy.revision;w.model_revision=t.participants[w.worker].model.model_revision;w.reviews=[];w.supervision=null;w.status='adoption-pending';
  t.handover.adoptions[w.id]={generation:w.generation,candidate:p.id,incarnation:p.incarnation,model_revision:p.model.model_revision,policy_revision:t.policy.revision,ack:false};result={work:w.id,generation:w.generation,epoch:w.epoch};
 }else if(c.type==='adoption-ack-v1') {
  const p=H.member(t,c),w=work();if(!t.handover || w.worker!==p.id || w.status!=='adoption-pending' || c.generation!==w.generation || c.epoch!==w.epoch)fail('invalid-adoption-ack');
  t.handover.adoptions[w.id].ack=true;result={adopted:w.id};
 }else if(c.type==='handover-accept-v1') {
  const p=H.member(t,c);if(!t.handover || p.id!==t.candidate || c.epoch!==t.epoch || !t.handover.acks[t.handover.old_leader]?.stopped)fail('quiesced-old-leader-required');
  const best=H.selectCoordinator(Object.values(t.participants),t.policy,t.leader,{now});if(best?.id!==p.id)fail('strongest-candidate-required');
  H.qualified(t,p,'coordinate',c);
  for(const w of Object.values(t.work).filter(w=>!terminal(w)))if(!t.handover.adoptions[w.id]?.ack || t.handover.adoptions[w.id].candidate!==p.id || t.handover.adoptions[w.id].incarnation!==p.incarnation || t.handover.adoptions[w.id].model_revision!==p.model.model_revision || t.handover.adoptions[w.id].policy_revision!==t.policy.revision)fail('outstanding-work-requires-adoption');
  t.epoch=t.handover.target_epoch;t.leader=p.id;t.candidate=null;t.status='active';
  for(const w of Object.values(t.work).filter(w=>w.status==='adoption-pending')){w.status=['submitted','review-pending','reviewed'].includes(w.retained_status)?'submitted':'assigned';delete w.retained_status;}
  t.last_handover=bounded(t.handover);delete t.handover;result={leader:p.id,epoch:t.epoch};
 }else if(c.type==='work-dispatch-ack-v1') {
  const p=H.member(t,c),w=work(),x=s.invocations?.[c.invocation_id];
  if(!w || w.status!=='assigned' || w.worker!==p.id || w.epoch!==t.epoch || c.epoch!==t.epoch || !w.routing || !x || x.team!==t.id || x.state!=='dispatching' || x.work_id!==w.id || x.grant_digest!==w.routing.grant_digest || x.epoch!==t.epoch || x.policy_revision!==t.policy.revision || w.model_revision!==p.model.model_revision)fail('bound-consumed-work-invocation-required');
  w.status='running';w.invocation_id=x.id;result={running:w.id,invocation:x.id};
 }else if(c.type==='material-capture-v1') {
  collector(s,t,c,'material');const w=work();if(w.epoch!==t.epoch || w.generation!==c.generation || c.epoch!==t.epoch || !['running','submitted'].includes(w.status))fail('invalid-material-capture');
  const e=bounded(c.evidence);if(e.base!==w.base || !Array.isArray(e.paths) || e.paths.some(p=>!w.paths.includes(p)) || !e.tree || !e.tests_digest)fail('candidate-scope-mismatch');
  digest(e.target_digest);digest(e.tests_digest);w.result=e;w.supervision=null;w.author_contexts=[...new Set([...(w.author_contexts||[]),...(Array.isArray(e.author_contexts)?e.author_contexts:[]),t.participants[w.worker].native_id].filter(Boolean))];w.reviews=[];w.status='submitted';result={work:w.id,target_digest:e.target_digest};
 }else if(c.type==='review-context-v1') {
  collector(s,t,c,'review');const p=H.participant(t,c.participant_id),m=bounded(c.manifest,16384);
  if(m.fresh_review_verified!==true || m.provenance!=='adapter-isolated' || m.fresh!==true || m.read_only!==true || m.inherited_author_context!==false || !m.native_id || m.native_id!==c.native_id || !m.context_id || !Array.isArray(m.tools) || !Array.isArray(m.author_contexts) || m.author_contexts.length)fail('verified-native-review-manifest-required');
  digest(m.initial_context_digest);t.review_contexts ||= {};if(t.review_contexts[m.context_id])fail('review-context-already-admitted');
  t.review_contexts[m.context_id]={participant:p.id,incarnation:p.incarnation,model_revision:p.model.model_revision,manifest_digest:hash(m),collector:c.actor};result={context:m.context_id};
 }else if(c.type==='review-request-v1') {
  const leader=H.leader(t,c);H.qualified(t,leader,'coordinate',c);const w=work(),p=H.participant(t,c.reviewer);
  if(!quotaReady(t,p,now) || w.status!=='review-pending' || !w.result || t.review_blocker || t.review_floor===null || rankParticipant(p,t.policy,'review',{now})<t.review_floor || rankParticipant(p,t.policy,'review',{now})===null)fail('strongest-independent-review-unavailable');
  const m=bounded(c.manifest,16384);portable(c.nonce);digest(m.initial_context_digest);
  const verified=t.review_contexts?.[m.context_id];if(!verified || verified.participant!==p.id || verified.incarnation!==p.incarnation || verified.model_revision!==p.model.model_revision || verified.manifest_digest!==hash(m))fail('collector-verified-review-context-required');
  if(m.fresh!==true || m.read_only!==true || m.inherited_author_context!==false || !m.context_id || [w.worker,t.leader].includes(p.id) || m.target_digest!==w.result.target_digest || m.criteria_digest!==w.criteria_digest || (w.author_contexts||[]).some(x=>x===m.context_id||x===m.native_id) || [t.participants[w.worker]?.native_id,t.participants[t.leader]?.native_id].filter(Boolean).includes(m.native_id))fail('fresh-independent-review-manifest-required');
  t.review_requests ||= {};if(t.review_requests[c.nonce])fail('review-nonce-already-used');
  t.review_requests[c.nonce]={nonce:c.nonce,work:w.id,reviewer:p.id,manifest:m,epoch:t.epoch,generation:w.generation,model_revision:p.model.model_revision,policy_revision:t.policy.revision,target_digest:w.result.target_digest,criteria_digest:w.criteria_digest,tests_digest:w.result.tests_digest,...(t.quota_policy?.automatic_redistribution?{quota_revision:t.quota_revision,incarnation:p.incarnation}:{}),consumed:false};
  result={nonce:c.nonce,reviewer:p.id};
 }else if(c.type==='review-consume-v1') {
  if(t.routing?.required && !c.invocation_id)fail('budgeted-review-invocation-required');
  collector(s,t,c,'review');const r=t.review_requests?.[c.nonce];if(!r || r.consumed || r.epoch!==t.epoch || r.policy_revision!==t.policy.revision || !quotaCurrent(t,r) || !quotaReady(t,t.participants[r.reviewer],now))fail('invalid-review-invocation');
  if(t.quota_policy?.automatic_redistribution){const p=t.participants[r.reviewer],rank=rankParticipant(p,t.policy,'review',{now});if(!p || p.revoked || ['left','unavailable'].includes(p.availability) || p.incarnation!==r.incarnation || p.model.model_revision!==r.model_revision || rank===null || t.review_floor===null || rank<t.review_floor || t.review_blocker)fail('review-eligibility-changed-before-dispatch');}
  if(t.routing?.required)controlInvocation(s,t,c,'review',r.reviewer,r.nonce,'independent-review');
  r.consumed=true;r.collector=c.actor;r.dispatch_at=c.at;result={nonce:r.nonce,consumed:true};
 }else if(c.type==='review-capture-v1') {
  collector(s,t,c,'review');const r=t.review_requests?.[c.nonce],w=r&&t.work[r.work],p=r&&t.participants[r.reviewer];
  if(!r || !w || r.collector!==c.actor || !r.consumed || r.output_digest || r.reconciled_stopped || r.epoch!==t.epoch || r.policy_revision!==t.policy.revision || r.generation!==w.generation || r.target_digest!==w.result?.target_digest || r.tests_digest!==w.result?.tests_digest || r.model_revision!==p?.model.model_revision || !quotaCurrent(t,r) || !quotaReady(t,p,now))fail('stale-review-receipt');
  if(c.context_id!==r.manifest.context_id || !same(c.actual_model,{provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning}) || typeof c.output!=='string' || Buffer.byteLength(c.output)>65536 || hash(c.output)!==c.output_digest)fail('review-collector-binding-mismatch');
  let v;try{v=JSON.parse(c.output);}catch{fail('structured-review-required');}
  if(!['approve','changes-requested','blocked'].includes(v.verdict) || !Array.isArray(v.findings) || (v.verdict!=='approve' && !v.findings.length))fail('invalid-review-verdict');
  const rank=rankParticipant(p,t.policy,'review',{now});if(!p || p.revoked || ['left','unavailable'].includes(p.availability) || rank===null || rank<t.review_floor || t.review_blocker)fail('strongest-review-floor-required');
  r.output_digest=c.output_digest;r.output=c.output;
  const review={...r,verdict:v.verdict,findings:bounded(v.findings),rank,context:r.manifest.context_id};w.reviews.push(review);const negative=w.reviews.filter(r=>r.generation===w.generation&&['blocked','changes-requested'].includes(r.verdict));w.status=negative.some(r=>r.verdict==='blocked')?'blocked':negative.length?'changes-requested':'reviewed';result={work:w.id,verdict:v.verdict,review:c.nonce};
 }else if(c.type==='revise-work-v1') {
  const p=H.leader(t,c),w=work();H.qualified(t,p,'coordinate',c);if(!['changes-requested','blocked'].includes(w.status) || !c.findings_resolution)fail('review-findings-resolution-required');
  w.generation++;w.reviews=[];w.findings_resolution=bounded(c.findings_resolution);w.status='assigned';result={work:w.id,generation:w.generation};
 }else if(c.type==='integration-prepare-v1') {
  const p=H.leader(t,c),w=work();H.qualified(t,p,'coordinate',c);const review=currentReview(t,w,now);
  if(w.status!=='reviewed' || !review || !w.supervision || w.supervision.target_digest!==w.result.target_digest)fail('current-supervised-strongest-review-required');
  const x=bounded(c.reservation,16384);portable(x.id);if(x.candidate_digest!==w.result.target_digest || x.tree!==w.result.tree || x.expected_head!==w.base || !same(x.paths,w.result.paths) || !x.checkout || !x.commit_message_digest || !same(x.parents,[w.base]) || !same(x.reviews,[review.nonce]))fail('integration-reservation-mismatch');
  if(t.integration && !['acknowledged','aborted'].includes(t.integration.state))fail('integration-already-reserved');
  t.integration={...x,state:'prepared',work:w.id,epoch:t.epoch,generation:w.generation,model_revision:p.model.model_revision,policy_revision:t.policy.revision,...(t.quota_policy?.automatic_redistribution?{quota_revision:t.quota_revision}:{}),review:review.nonce};result={reservation:x.id};
 }else if(c.type==='integration-abort-v1') {
  H.owner(s,c);const x=t.integration;if(!x || x.id!==c.reservation_id || x.state!=='prepared')fail('publication-reconciliation-required');
  x.state='aborted';result={aborted:x.id};
 }else if(c.type==='integration-reconcile-v1') {
  collector(s,t,c,'material');const x=t.integration;if(!x || x.state!=='publishing' || x.id!==c.reservation_id || c.git_child_stopped!==true || c.reference_unchanged!==true || c.expected_head!==x.expected_head)fail('stopped-unchanged-publication-proof-required');
  digest(c.evidence_digest);x.state='aborted';x.recovery_digest=c.evidence_digest;delete s.publication_fence;result={aborted:x.id};
 }else if(c.type==='integration-start-v1') {
  const p=H.leader(t,c),x=t.integration,w=x&&t.work[x.work];H.qualified(t,p,'coordinate',c);
  if(!x || x.state!=='prepared' || x.id!==c.reservation_id || x.epoch!==t.epoch || x.generation!==w.generation || x.candidate_digest!==w.result?.target_digest || x.tree!==w.result?.tree || x.policy_revision!==t.policy.revision || x.model_revision!==p.model.model_revision || !quotaCurrent(t,x) || !currentReview(t,w,now) || x.review!==currentReview(t,w,now).nonce)fail('publication-approval-changed');
  if(s.publication_fence)fail('project-publication-in-progress');
  x.state='publishing';x.started_at=c.at;s.publication_fence={team:t.id,reservation:x.id,work:w.id};result={publishing:x.id};
 }else if(c.type==='integration-ack-v1') {
  collector(s,t,c,'material');const x=t.integration,w=x&&t.work[x.work];
  if(!x || x.state!=='publishing' || x.id!==c.reservation_id || s.publication_fence?.reservation!==x.id || c.tree!==x.tree || !same(c.parents,x.parents) || c.commit_message_digest!==x.commit_message_digest || !/^[a-f0-9]{40,64}$/.test(c.commit||''))fail('publication-receipt-mismatch');
  x.state='acknowledged';x.commit=c.commit;w.status='integrated';w.commit=c.commit;w.integrated_evidence={reservation:x.id,review:x.review,review_receipt:structuredClone(w.reviews.find(r=>r.nonce===x.review)),epoch:x.epoch,generation:x.generation,policy_revision:x.policy_revision,target_digest:w.result.target_digest,criteria_digest:w.criteria_digest,tests_digest:w.result.tests_digest,tree:x.tree,commit:c.commit,commit_message_digest:x.commit_message_digest,accepted_at:c.at};delete s.publication_fence;result={integrated:w.id,commit:c.commit,pending_deferred:(s.deferred_commands||[]).length};
 }else if(c.type==='control-grant-capture-v1') {
  collector(s,t,c,'usage');const payload=bounded(c.payload,65536),g=payload.grant,e=payload.evidence,envelope=payload.manifest,control=envelope?.control;
  const {control:ignored,...rawManifest}=envelope||{},m=validateManifest(rawManifest),p=g&&H.participant(t,g.participant);
  const controlKeys=['purpose','action','nonce','participant','incarnation','model_revision','model','native_id','context_id','epoch','policy_revision','quota_revision','work_id','generation','target_digest','criteria_digest','tests_digest','review_floor','excluded_contexts','author_participants'];
  if(!t.routing?.required || !g || !e || g.kind!=='control' || !['runtime','review','delivery'].includes(g.purpose) || !control || !p || Object.keys(control).some(k=>!controlKeys.includes(k)) || !same(control,Object.fromEntries(Object.keys(control).map(k=>[k,g[k]]))) || g.native_id!==e.context?.native_id || g.context_id!==e.context?.id)fail('bound-control-envelope-required');
  portable(g.nonce);if(typeof g.action!=='string'||!g.action||g.action.length>1024)fail('bound-control-action-required');
  if(!quotaCurrent(t,g) || !quotaReady(t,p,now) || g.incarnation!==p.incarnation || g.model_revision!==p.model.model_revision || g.epoch!==t.epoch || g.policy_revision!==t.policy.revision || !same(g.model,{provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning}) || Object.values(g.model).includes('unknown') || g.manifest_digest!==hash(envelope) || g.route_digest!==hash(e.route) || g.quote_id!==e.liability?.quote_id || g.allocation_id!==e.quota?.allocation_id || g.attempts!==1 || g.task_max_units!==m.budget.max_units || g.reserved_control_units!==m.budget.reserved_control_units)fail('control-grant-identity-mismatch');
  if(e.strict_bounded!==true || !/^[0-9]{1,18}$/.test(e.max_units_per_attempt||'') || !/^[0-9]{1,18}$/.test(e.pool_allocation||'') || e.liability?.all_charges_bounded!==true || e.liability?.enforced_by_provider!==true || e.liability?.inflight_charges_bounded!==true || e.liability?.manifest_digest!==g.manifest_digest || e.liability?.max_units_per_attempt!==e.max_units_per_attempt || e.quota?.exclusive_allocation!==true || e.quota?.scope!=='project-authority' || e.quota?.pool_allocation!==e.pool_allocation || !Number.isSafeInteger(e.quota.available_calls) || !Number.isFinite(Date.parse(e.expires_at)) || Date.parse(e.expires_at)<=now || Date.parse(e.expires_at)>now+60000 || g.expires_at!==e.expires_at)fail('bounded-control-liability-required');
  if(g.purpose==='review'){const w=t.work[g.work_id],rank=rankParticipant(p,t.policy,'review',{now});if(!w || w.generation!==g.generation || g.target_digest!==w.result?.target_digest || g.criteria_digest!==w.criteria_digest || g.tests_digest!==w.result?.tests_digest || rank===null || t.review_floor===null || rank<t.review_floor || g.review_floor<t.review_floor || t.review_blocker || [w.worker,t.leader].includes(p.id) || (w.author_contexts||[]).some(x=>[g.native_id,g.context_id].includes(x)))fail('strongest-independent-control-review-required');}
  const evidence={...e,grant:g},evidence_digest=hash(evidence),grant_digest=hash(g);
  t.routing_evidence ||= {};t.routing_grants ||= {};t.routing_evidence[evidence_digest]=evidence;t.routing_grants[grant_digest]={grant:g,evidence_digest,manifest:envelope,expires_at:e.expires_at,collector:c.actor};result={grant_digest,evidence_digest};
 }else if(c.type==='control-invocation-reserve-v1') {
  H.owner(s,c);const x=bounded(c.invocation,16384);portable(x.id);const saved=t.routing_grants?.[x.grant_digest],e=saved&&t.routing_evidence?.[saved.evidence_digest],g=e?.grant,p=g&&H.participant(t,g.participant);
  if(!t.routing?.required || !saved || !quotaCurrent(t,g) || !quotaReady(t,p,now) || g.kind!=='control' || x.evidence_digest!==saved.evidence_digest || Date.parse(e.expires_at)<=now || g.epoch!==t.epoch || g.policy_revision!==t.policy.revision || !p || p.incarnation!==g.incarnation || p.model.model_revision!==g.model_revision || !same(g.model,{provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning}) || x.max_units!==e.max_units_per_attempt || x.pool!==e.pool || x.currency!==e.currency || x.pool_allocation!==e.pool_allocation || x.attempt!==1)fail('installed-current-control-grant-required');
  if(g.purpose==='review'){const w=t.work[g.work_id],rank=rankParticipant(p,t.policy,'review',{now});if(!w||w.generation!==g.generation||rank===null||rank<t.review_floor||t.review_blocker)fail('control-review-floor-changed');}
  s.invocations ||= {};if(s.invocations[x.id] || Object.values(s.invocations).some(i=>i.team===t.id&&i.grant_digest===x.grant_digest))fail('control-invocation-already-reserved');
  const entries=Object.values(s.invocations).filter(i=>i.state!=='aborted'),cost=i=>BigInt(i.state==='settled'?i.actual_units:i.max_units);
  if(entries.filter(i=>i.pool===x.pool&&i.currency===x.currency).reduce((n,i)=>n+cost(i),0n)+BigInt(x.max_units)>BigInt(x.pool_allocation))fail('shared-pool-reservation-exhausted');
  if(entries.filter(i=>i.pool===x.pool&&i.quota_allocation_id===e.quota.allocation_id).length>=e.quota.available_calls)fail('shared-call-allocation-exhausted');
  const budget=t.task_budget||{currency:x.currency,max_units:g.task_max_units,reserved_control_units:g.reserved_control_units},teamEntries=entries.filter(i=>i.team===t.id);
  const spent=teamEntries.reduce((n,i)=>n+cost(i),0n),controlSpent=teamEntries.filter(i=>i.kind==='control').reduce((n,i)=>n+cost(i),0n);
  if(budget.currency!==x.currency||budget.max_units!==g.task_max_units||budget.reserved_control_units!==g.reserved_control_units||spent+BigInt(x.max_units)>BigInt(budget.max_units)||controlSpent+BigInt(x.max_units)>BigInt(budget.reserved_control_units))fail('control-task-budget-exhausted');
  t.task_budget=budget;s.invocations[x.id]={...x,kind:'control',purpose:g.purpose,team:t.id,quota_allocation_id:e.quota.allocation_id,state:'prepared',epoch:t.epoch,policy_revision:t.policy.revision};result={reserved:x.id};
 }else if(c.type==='routing-enable-v2') {
  H.owner(s,c);if(t.routing?.protocol===2)fail('routing-already-required');
  if(Object.values(t.work).some(w=>!terminal(w)))fail('outstanding-work-requires-routing-migration');
  t.routing={protocol:2,required:true,enabled_at:c.at};result={routing_required:true,protocol:2};
 }else if(c.type==='routing-grant-capture-v1') {
  collector(s,t,c,'usage');const payload=bounded(c.payload,196608),m=validateManifest(payload.manifest);
  if(!Array.isArray(payload.records) || !payload.records.length || payload.records.length>32)fail('collector-routing-records-required');
  const proposal=proposeModelRoute({manifest:m,participants:Object.values(t.participants).filter(p=>quotaReady(t,p,now)),policy:t.policy,verifiedEvidence:new Map(payload.records),now});
  const g=payload.grant,e=payload.evidence,p=g&&t.participants[g.participant];
  if(!quotaCurrent(t,g) || !quotaReady(t,p,now) || !proposal.choice || !g || !e || !p || g.participant!==proposal.choice.participant || g.incarnation!==p.incarnation || g.model_revision!==p.model.model_revision || !same(g.model,{provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning}) || g.epoch!==t.epoch || g.policy_revision!==t.policy.revision || g.route_digest!==proposal.choice.route_digest || g.manifest_digest!==routingDigest(m) || g.attempts!==m.attempts || g.task_max_units!==m.budget.max_units || g.reserved_control_units!==m.budget.reserved_control_units)fail('collector-routing-grant-mismatch');
  if(e.strict_bounded!==true || e.currency!==m.budget.currency || !e.pool || !/^[0-9]{1,18}$/.test(e.pool_allocation||'') || !/^[0-9]{1,18}$/.test(e.max_units_per_attempt||'') || !Number.isFinite(Date.parse(e.expires_at)) || Date.parse(e.expires_at)<=now || Date.parse(e.expires_at)>now+60000)fail('collector-routing-budget-proof-required');
  const chosen=new Map(payload.records).get(p.id);
  const grading=chosen.qualification?.review,reviewer=grading&&t.participants[grading.participant];
  if(!reviewer || !quotaReady(t,reviewer,now) || reviewer.revoked || reviewer.incarnation!==grading.incarnation || !same(grading.model,{provider:reviewer.model.provider,model_id:reviewer.model.model_id,reasoning:reviewer.model.reasoning}) || grading.policy_revision!==t.policy.revision || t.review_blocker || t.review_floor===null || (rankParticipant(reviewer,t.policy,'review',{now})??-1)<t.review_floor)fail('routing-qualification-review-floor-changed');
  if(e.pool!==chosen.route.pool || e.max_units_per_attempt!==chosen.liability.max_units_per_attempt || e.pool_allocation!==chosen.quota.pool_allocation || chosen.quota.exclusive_allocation!==true || chosen.quota.scope!=='project-authority' || chosen.liability.enforced_by_provider!==true || chosen.liability.inflight_charges_bounded!==true || chosen.liability.manifest_digest!==routingDigest(m))fail('collector-routing-liability-binding-required');
  const evidence={...e,grant:g},evidence_digest=hash(evidence),grant_digest=hash(g);
  t.routing_evidence ||= {};t.routing_grants ||= {};t.routing_evidence[evidence_digest]=evidence;t.routing_grants[grant_digest]={grant:g,evidence_digest,manifest:m,classification:proposal.classification,expires_at:e.expires_at,collector:c.actor};
  result={grant_digest,evidence_digest,participant:p.id};
 }else if(c.type==='assign-routed-v2') {
  const p=H.leader(t,c);H.qualified(t,p,'coordinate',c);const saved=t.routing_grants?.[c.grant_digest],w=bounded(c.work,32768);
  if(!t.routing?.required || !saved || !quotaCurrent(t,saved.grant) || saved.grant.epoch!==t.epoch || saved.grant.policy_revision!==t.policy.revision || Date.parse(saved.expires_at)<=now)fail('current-collector-routing-grant-required');
  portable(w.id);if(t.work[w.id])fail('work-already-assigned');const worker=H.participant(t,saved.grant.participant),m=saved.manifest;
  if(!quotaReady(t,worker,now) || worker.model.model_revision!==saved.grant.model_revision || worker.incarnation!==saved.grant.incarnation || w.worker!==worker.id || w.base!==m.base || w.goal!==m.goal || w.criteria_digest!==m.criteria_digest || !same(w.paths,m.paths) || !w.criteria || hash(w.criteria)!==w.criteria_digest)fail('routed-assignment-scope-mismatch');
  w.dependencies ||= [];if(!Array.isArray(w.dependencies) || w.dependencies.some(x=>t.work[x]?.status!=='integrated'))fail('unresolved-work-dependency');
  for(const other of Object.values(t.work))if(!terminal(other)&&other.paths.some(x=>w.paths.includes(x)))fail('edit-scope-conflict');
  Object.assign(w,{generation:1,epoch:t.epoch,model_revision:worker.model.model_revision,policy_revision:t.policy.revision,status:'assigned',reviews:[],routing:{grant_digest:c.grant_digest,evidence_digest:saved.evidence_digest}});
  t.work[w.id]=w;result=H.envelope(t,c,p.id,'assignment',worker.id,w,w.id);
 }else if(c.type==='routing-evidence-v1') {
  collector(s,t,c,'usage');const e=bounded(c.evidence,65536);digest(c.evidence_digest);
  if(hash(e)!==c.evidence_digest || !e.pool || !e.currency || e.strict_bounded!==true || !/^[0-9]{1,18}$/.test(e.max_units_per_attempt||'') || !/^[0-9]{1,18}$/.test(e.pool_allocation||'') || !Number.isFinite(Date.parse(e.expires_at)) || Date.parse(e.expires_at)<=now || Date.parse(e.expires_at)>now+60000)fail('invalid-bounded-routing-evidence');
  t.routing_evidence ||= {};t.routing_evidence[c.evidence_digest]=e;result={evidence:c.evidence_digest};
 }else if(c.type==='invocation-reserve-v1') {
  const p=H.leader(t,c);H.qualified(t,p,'coordinate',c);const x=bounded(c.invocation,16384);portable(x.id);
  if(!t.routing?.required || !x.grant_digest || !x.evidence_digest || x.strict_bounded!==true || !/^[0-9]{1,18}$/.test(x.max_units||'') || !/^[0-9]{1,18}$/.test(x.pool_allocation||'') || !x.pool || !x.currency)fail('verified-bounded-invocation-required');
  // A reservation may only reference collector-admitted evidence, never JSON flags.
  const e=t.routing_evidence?.[x.evidence_digest];if(!e || Date.parse(e.expires_at)<=now || e.pool!==x.pool || e.currency!==x.currency || e.pool_allocation!==x.pool_allocation || BigInt(x.max_units)!==BigInt(e.max_units_per_attempt))fail('trusted-routing-evidence-required');
  if(t.routing.protocol===2 && (!t.routing_grants?.[x.grant_digest] || t.routing_grants[x.grant_digest].evidence_digest!==x.evidence_digest))fail('installed-collector-routing-grant-required');
  const g=e.grant,pw=g&&t.participants[g.participant];
  if(g?.kind==='control')fail('control-owner-reservation-required');
  if(!quotaCurrent(t,g) || !quotaReady(t,pw,now) || !g || hash(g)!==x.grant_digest || g.epoch!==t.epoch || g.policy_revision!==t.policy.revision || !pw || pw.revoked || pw.incarnation!==g.incarnation || pw.model.model_revision!==g.model_revision || !same(g.model,{provider:pw.model.provider,model_id:pw.model.model_id,reasoning:pw.model.reasoning}) || !g.route_digest || !g.manifest_digest || !Number.isSafeInteger(g.attempts) || g.attempts<1 || !/^[0-9]{1,18}$/.test(g.task_max_units||'') || !/^[0-9]{1,18}$/.test(g.reserved_control_units||''))fail('bound-routing-grant-required');
  digest(g.route_digest);digest(g.manifest_digest);
  if(x.work_id){const w=t.work[x.work_id];if(!w || w.routing?.grant_digest!==x.grant_digest || w.worker!==g.participant || w.status!=='assigned')fail('routing-work-binding-required');}
  if(!Number.isSafeInteger(x.attempt) || x.attempt<1 || x.attempt>g.attempts || Object.values(s.invocations||{}).some(i=>i.team===t.id&&i.grant_digest===x.grant_digest&&i.attempt===x.attempt))fail('routing-attempt-already-used-or-out-of-range');
  if(t.routing.protocol===2){const q=e.quota;
   if(!q || q.exclusive_allocation!==true || q.scope!=='project-authority' || !q.allocation_id || !Number.isSafeInteger(q.available_calls))fail('provider-call-allocation-required');
   const used=Object.values(s.invocations||{}).filter(i=>i.pool===x.pool&&i.quota_allocation_id===q.allocation_id&&i.state!=='aborted').length;
   if(used>=q.available_calls)fail('shared-call-allocation-exhausted');
   x.quota_allocation_id=q.allocation_id;
  }
  s.invocations ||= {};if(s.invocations[x.id])fail('invocation-already-reserved');
  const held=Object.values(s.invocations).filter(i=>i.pool===x.pool&&i.currency===x.currency&&i.state!=='aborted').reduce((n,i)=>n+BigInt(i.state==='settled'?i.actual_units:i.max_units),0n);
  if(held+BigInt(x.max_units)>BigInt(x.pool_allocation))fail('shared-pool-reservation-exhausted');
  const spent=Object.values(s.invocations).filter(i=>i.team===t.id&&i.state!=='aborted').reduce((n,i)=>n+BigInt(i.state==='settled'?i.actual_units:i.max_units),0n);
  const budget=t.task_budget || {currency:x.currency,max_units:g.task_max_units,reserved_control_units:g.reserved_control_units};
  const controlSpent=Object.values(s.invocations).filter(i=>i.team===t.id&&i.kind==='control'&&i.state!=='aborted').reduce((n,i)=>n+BigInt(i.state==='settled'?i.actual_units:i.max_units),0n);
  const controlRemaining=BigInt(budget.reserved_control_units)-controlSpent;
  if(controlRemaining<0n || budget.currency!==x.currency || budget.max_units!==g.task_max_units || budget.reserved_control_units!==g.reserved_control_units || spent+BigInt(x.max_units)+controlRemaining>BigInt(budget.max_units))fail('task-budget-reservation-exhausted');
  t.task_budget=budget;
  s.invocations[x.id]={...x,team:t.id,state:'prepared',epoch:t.epoch,policy_revision:t.policy.revision};result={reserved:x.id};
 }else if(c.type==='invocation-consume-v1') {
  collector(s,t,c,'dispatch');const x=s.invocations?.[c.invocation_id];if(!x || x.team!==t.id || x.state!=='prepared' || x.epoch!==t.epoch || x.policy_revision!==t.policy.revision)fail('invalid-invocation-consumption');
  const e=t.routing_evidence?.[x.evidence_digest];if(!e || Date.parse(e.expires_at)<=now)fail('routing-evidence-expired-before-dispatch');
  const g=e.grant,p=g&&t.participants[g.participant];if(!quotaCurrent(t,g) || !quotaReady(t,p,now) || !g || hash(g)!==x.grant_digest || !p || p.revoked || p.availability==='left' || p.incarnation!==g.incarnation || p.model.model_revision!==g.model_revision || !same(g.model,{provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning}))fail('routing-identity-changed-before-dispatch');
  x.state='dispatching';x.collector=c.actor;x.dispatch_at=c.at;result={consumed:x.id};
 }else if(c.type==='invocation-settle-v1') {
  collector(s,t,c,'usage');const x=s.invocations?.[c.invocation_id];if(!x || x.team!==t.id || x.collector!==c.actor || !['dispatching','running','uncertain'].includes(x.state))fail('invocation-collector-mismatch');
  if(c.outcome==='uncertain'){x.state='uncertain';result={uncertain:x.id};}
  else{if(!/^[0-9]{1,18}$/.test(c.actual_units||'') || BigInt(c.actual_units)>BigInt(x.max_units) || !c.provider_invocation_id)fail('bounded-usage-receipt-required');x.state='settled';x.actual_units=c.actual_units;x.provider_invocation_id=c.provider_invocation_id;result={settled:x.id};}
 }else if(c.type==='invocation-abort-v1') {
  const x=s.invocations?.[c.invocation_id];
  if(x?.kind==='control')H.owner(s,c);else{const p=H.leader(t,c);H.qualified(t,p,'coordinate',c);}
  if(!x || x.team!==t.id || x.state!=='prepared')fail('consumed-invocation-cannot-be-aborted');
  x.state='aborted';result={aborted:x.id};
 }else if(c.type==='close-v1') {
  H.owner(s,c);
  if(Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&!['settled','aborted','reconciled'].includes(x.state)))fail('unresolved-subscription-invocations');
  if(Object.values(t.deliveries||{}).some(r=>['dispatching','uncertain'].includes(r.state)) || Object.values(t.runtime_requests||{}).some(r=>r.consumed&&!r.captured&&!r.reconciled_stopped) || Object.values(t.review_requests||{}).some(r=>r.consumed&&!r.output_digest&&!r.reconciled_stopped))fail('unresolved-native-operations');
  if(t.handover || s.publication_fence?.team===t.id || s.deferred_commands?.some(x=>x.command.team===t.id) || Object.values(s.invocations||{}).some(x=>x.team===t.id&&!['settled','aborted'].includes(x.state)))fail('unresolved-team-operations');
  if(Object.values(t.work).some(w=>!terminal(w) || w.status==='integrated'&&(!w.commit || !w.integrated_evidence || w.integrated_evidence.commit!==w.commit || w.integrated_evidence.tree!==w.result?.tree || w.integrated_evidence.target_digest!==w.result?.target_digest || w.integrated_evidence.criteria_digest!==w.criteria_digest || w.integrated_evidence.tests_digest!==w.result?.tests_digest || w.integrated_evidence.review_receipt?.nonce!==w.integrated_evidence.review || w.integrated_evidence.review_receipt?.verdict!=='approve')))fail('unfinished-reviewed-team-work');
  t.status='closed';delete s.task_bindings[t.task];result={closed:t.id};
 }else return {handled:false};
 return {handled:true,result};
}
export { currentReview, hash as workflowDigest };
