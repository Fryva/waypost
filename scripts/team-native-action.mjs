// Fixed protocol-control requests. No imported request grants execution authority.
import {assertNativeHandoverReady,nativeQuotaEligible} from './team-native-quota.mjs';
import { routingDigest } from './model-routing.mjs';
import { selectCoordinator, selectProtocolReviewerCandidate, policyRow, listedReviewer } from './team.mjs';
import { buildProtocolLeadershipAuditTarget, formatProtocolLeadershipAudit, readProtocolLeadershipAudit } from './team-protocol-review.mjs';
import { parseProtocolJSON } from './team-role-suite.mjs';
import { WORK_REVIEW_KIND, roleDigest, workReviewPolicy, createProtocolWorkReviewRequest, workReviewSlot, formatWorkReview, workReviewPromptDigest, readWorkReview } from './team-native-work-review.mjs';
import { WORK_PLAN_KIND, workPlanPolicy, createProtocolWorkPlanRequest, workPlanSlot, formatWorkPlan, workPlanPromptDigest, readWorkPlan, recordWorkPlan, WORK_PLAN_REVIEW_KIND, createProtocolWorkPlanReviewRequest, workPlanReviewSlot, formatWorkPlanReview, workPlanReviewPromptDigest, readWorkPlanReview, recordWorkPlanReview } from './team-native-work-plan.mjs';
const fail=code=>{throw Object.assign(new Error('native-action-'+code),{code:'native-action-'+code});};
function id(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value))fail('bounded-action-id-required');return value;}
// A profile's binary version comes from native health (OpenCode) or, for Claude,
// from get_binary_version of the same preflighted peer bound into the manifest.
export function nativeProfileVersion(ctx){
 const known=value=>typeof value==='string'&&value.length>0&&value.length<=128&&value!=='unknown'&&!/[\x00-\x1f\x7f]/.test(value);
 if(ctx?.harness==='opencode'&&ctx.version_provenance==='native-health'&&known(ctx.version))return {version:ctx.version,version_provenance:'native-health'};
 const p=ctx?.preflight;
 if(ctx?.harness==='claude'&&p?.source==='native-get-context-usage-summary'&&p.native_id===ctx.native_id&&typeof p.version==='string'&&/^[0-9]+\.[0-9]+\.[0-9]+$/.test(p.version))return {version:p.version,version_provenance:'native-binary-version'};
 return {version:'unknown',version_provenance:'unknown'};
}
export function createProtocolLeaderAckRequest(team,{actionId,now=Date.now()}={}){
 if(team?.policy?.protocol!==2||team.leader||team.status!=='forming'||team.handover||Object.values(team.work||{}).some(w=>!['integrated','cancelled'].includes(w.status)))fail('idle-native-candidate-required');
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(team.epoch)||team.epoch<0||team.epoch>=Number.MAX_SAFE_INTEGER)fail('clock-or-epoch-required');
 const best=selectCoordinator(Object.values(team.participants),team.policy,null,{now,coverage:'waypost-protocol-coordinate'});
 if(!best||team.candidate!==best.id)fail('strongest-current-candidate-required');
 const critic=selectProtocolReviewerCandidate(Object.values(team.participants),team.policy,team.review_floor,{coordinator:best.id,now});
 if(team.review_blocker||!critic||team.review_candidate!==critic.id)fail('strongest-independent-critic-required');
 const profile=policyRow(team.policy,best),review=policyRow(team.policy,critic);
 const request={protocol:2,kind:'protocol-leader-ack',team:team.id,action_id:id(actionId),participant:best.id,incarnation:best.incarnation,descriptor_digest:best.native_binding.descriptor_digest,current_epoch:team.epoch,target_epoch:team.epoch+1,policy_revision:team.policy.revision,policy_digest:routingDigest(team.policy),profile:structuredClone(profile.identity),...roleDigest(team,best,'coordinate'),review_candidate:{participant:critic.id,incarnation:critic.incarnation,descriptor_digest:critic.native_binding.descriptor_digest,profile:structuredClone(review.identity),...roleDigest(team,critic,'review')}};
 return {kind:request.kind,action_id:request.action_id,request_digest:routingDigest(request),request};
}
export function createProtocolLeadershipAuditRequest(s,t,{actionId,sourceInvocationId,now=Date.now()}={}){
 if(t?.policy?.protocol!==2||t.status!=='active'||!t.leader||t.handover||t.review_blocker||!Number.isSafeInteger(now))fail('active-independent-audit-required');
 const target=buildProtocolLeadershipAuditTarget(s,t,sourceInvocationId);
 const owned=t.policy.mode==='owner-assigned';
 const reviewer=owned?listedReviewer(Object.values(t.participants),t.policy,{excluded:[...new Set([t.leader,target.source_participant])],now}).reviewer:selectProtocolReviewerCandidate(Object.values(t.participants).filter(p=>p.id!==target.source_participant),t.policy,t.review_floor,{coordinator:t.leader,now});
 if(!reviewer)fail('strongest-independent-audit-reviewer-required');
 const profile=owned?policyRow(t.policy,reviewer):t.policy.profiles.find(p=>p.identity.profile_id===reviewer.native_admission.identity.profile_id);
 const request={protocol:2,kind:'protocol-leadership-audit',team:t.id,action_id:id(actionId),participant:reviewer.id,incarnation:reviewer.incarnation,descriptor_digest:reviewer.native_binding.descriptor_digest,current_epoch:t.epoch,policy_revision:t.policy.revision,policy_digest:routingDigest(t.policy),profile:structuredClone(profile.identity),...roleDigest(t,reviewer,'review'),current_leader:t.leader,source_invocation_id:sourceInvocationId,target_digest:routingDigest(target),target};
 return {kind:request.kind,action_id:request.action_id,request_digest:routingDigest(request),request};
}
export function createProtocolHandoverAckRequest(s,t,{actionId,now=Date.now(),excluding=null}={}){
 const {handover:h}=assertNativeHandoverReady(s,t,now,{excluding});const p=t.participants[h.candidate],critic=t.participants[h.reviewer];
 const profile=policyRow(t.policy,p),review=policyRow(t.policy,critic);
 const request={protocol:2,kind:'protocol-handover-ack',team:t.id,action_id:id(actionId),participant:p.id,incarnation:p.incarnation,descriptor_digest:p.native_binding.descriptor_digest,current_epoch:t.epoch,target_epoch:h.target_epoch,runtime_epoch:h.target_epoch,policy_revision:t.policy.revision,policy_digest:routingDigest(t.policy),quota_revision:t.native_quota_revision,handover_id:h.id,handover_digest:routingDigest(h),profile:structuredClone(profile.identity),...roleDigest(t,p,'coordinate'),review_candidate:{participant:critic.id,incarnation:critic.incarnation,descriptor_digest:critic.native_binding.descriptor_digest,profile:structuredClone(review.identity),...roleDigest(t,critic,'review')}};
 if(h.reactivation)request.reactivation_digest=routingDigest(h.reactivation);
 return {kind:request.kind,action_id:request.action_id,request_digest:routingDigest(request),request};
}
function formatProtocolHandoverAck(action){protocolActionSlot(action);return 'Bounded protocol-only quota handover. Acknowledge this exact stopped-old-epoch coordinator transition. No generic work or protected permission is granted. Return only one JSON object with exactly ack:true, action_id and request_digest as shown. Do not call tools.\n'+JSON.stringify({request:action.request,response:{ack:true,action_id:action.action_id,request_digest:action.request_digest}});}
export function formatProtocolAction(action){if(action?.kind===WORK_PLAN_REVIEW_KIND)return formatWorkPlanReview(action);if(action?.kind===WORK_REVIEW_KIND)return formatWorkReview(action);if(action?.kind===WORK_PLAN_KIND)return formatWorkPlan(action);if(action?.kind==='protocol-leader-ack')return formatProtocolLeaderAck(action);if(action?.kind==='protocol-leadership-audit')return formatProtocolLeadershipAudit(action);if(action?.kind==='protocol-handover-ack')return formatProtocolHandoverAck(action);fail('fixed-action-kind-required');}
export function readProtocolActionResponse(raw,action){if(action?.kind===WORK_PLAN_REVIEW_KIND)return readWorkPlanReview(raw,action);if(action?.kind===WORK_REVIEW_KIND)return readWorkReview(raw,action);if(action?.kind===WORK_PLAN_KIND)return readWorkPlan(raw,action);if(action?.kind==='protocol-leader-ack')return readProtocolAck(raw,action);if(action?.kind==='protocol-leadership-audit')return readProtocolLeadershipAudit(raw,action);if(action?.kind==='protocol-handover-ack'){protocolActionSlot(action);return readProtocolAck(raw,{...action,kind:'protocol-leader-ack'});}fail('fixed-action-kind-required');}
// The digest a control call's prompt must carry; a work review binds its diff by digest.
export function actionPromptDigest(action){return action?.kind===WORK_PLAN_REVIEW_KIND?workPlanReviewPromptDigest(action):action?.kind===WORK_REVIEW_KIND?workReviewPromptDigest(action):action?.kind===WORK_PLAN_KIND?workPlanPromptDigest(action):routingDigest(formatProtocolAction(action));}
export function protocolActionSlot(action){
 if(action?.kind===WORK_REVIEW_KIND)return workReviewSlot(action);
 if(action?.kind===WORK_PLAN_KIND)return workPlanSlot(action);
 if(action?.kind===WORK_PLAN_REVIEW_KIND)return workPlanReviewSlot(action);
 if(action?.kind==='protocol-leader-ack')return protocolLeaderAckSlot(action);
 if(action?.kind==='protocol-handover-ack'){const r=action.request;if(r?.kind!==action.kind||r.action_id!==action.action_id||action.request_digest!==routingDigest(r))fail('fixed-request-binding-required');return routingDigest({team:r.team,kind:r.kind,current_epoch:r.current_epoch,target_epoch:r.target_epoch,participant:r.participant,incarnation:r.incarnation,});}
 const r=action?.request;if(action?.kind!=='protocol-leadership-audit'||r?.kind!==action.kind||action.action_id!==r.action_id||action.request_digest!==routingDigest(r)||r.target_digest!==routingDigest(r.target))fail('fixed-request-binding-required');
 return routingDigest({team:r.team,kind:r.kind,target_digest:r.target_digest,current_epoch:r.current_epoch,policy_revision:r.policy_revision,participant:r.participant,incarnation:r.incarnation});
}
export function protocolLeaderAckSlot(action){
 const r=action?.request;if(!r||r.kind!=='protocol-leader-ack'||action.kind!==r.kind||action.action_id!==r.action_id||action.request_digest!==routingDigest(r))fail('fixed-request-binding-required');
 return routingDigest({team:r.team,kind:r.kind,current_epoch:r.current_epoch,target_epoch:r.target_epoch,participant:r.participant,incarnation:r.incarnation,descriptor_digest:r.descriptor_digest,policy_revision:r.policy_revision});
}
export function formatProtocolLeaderAck(action){
 protocolLeaderAckSlot(action);
 return 'Bounded protocol control. Acknowledge only this exact coordinator election request. Return one JSON object with exactly ack:true, action_id and request_digest as shown. Do not call tools.\n'+JSON.stringify({request:action.request,response:{ack:true,action_id:action.action_id,request_digest:action.request_digest}});
}
export function readProtocolAck(raw,action){
 if(!action||action.kind!=='protocol-leader-ack')fail('ack-action-required');
 let value;try{value=parseProtocolJSON(raw);}catch{fail('strict-ack-json-required');}
 if(!value||Array.isArray(value)||Object.keys(value).length!==3||!['ack','action_id','request_digest'].every(k=>Object.hasOwn(value,k))||value.ack!==true||value.action_id!==action.action_id||value.request_digest!==action.request_digest)fail('exact-ack-binding-required');
 return {ack:true,action_id:value.action_id,request_digest:value.request_digest};
}

// Authority-side control accounting. Public ACK helpers above remain pure and
// do not grant admission; these gates operate on the authenticated shared ledger.
const same=(a,b)=>a===undefined||b===undefined?a===b:routingDigest(a)===routingDigest(b);
const integer=v=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,17})$/.test(v))fail('token-integer-required');return BigInt(v);};
function object(v,allowed,max=32768){if(!v||typeof v!=='object'||Array.isArray(v)||Buffer.byteLength(JSON.stringify(v))>max||Object.keys(v).some(k=>!allowed.includes(k)))fail('bounded-fields-required');return structuredClone(v);}
const coreAction=a=>({kind:a.kind,action_id:a.action_id,request_digest:a.request_digest,request:a.request});
function mode(t){if(t.accounting?.protocol!==2||t.accounting.billing_policy!=='inherited-native'||t.policy?.protocol!==2)fail('native-calibrated-accounting-required');}
// Step 9 (owner, 2026-10-11): the critic of a plan is a work-ceiling call of the plan part: it shares the plan call count and the per-unit work cap.
const workKind=k=>k===WORK_REVIEW_KIND||k===WORK_PLAN_KIND||k===WORK_PLAN_REVIEW_KIND;
function currentPolicy(t,now,kind='protocol-leader-ack'){mode(t);if(workKind(kind)){const p=kind===WORK_REVIEW_KIND?workReviewPolicy(t):workPlanPolicy(t);if(!p||Date.parse(p.expires_at)<=now||Date.parse(p.enabled_at)>now)fail('current-owner-control-policy-required');return p;}if(!['protocol-leader-ack','protocol-leadership-audit','protocol-handover-ack'].includes(kind))fail('fixed-action-kind-required');const p=kind==='protocol-leader-ack'?t.native_control_policy:kind==='protocol-leadership-audit'?t.native_review_policy:t.native_handover_policy;if(!p||p.protocol!==2||p.kind!==kind||p.allow_unknown_quota!==true||Date.parse(p.expires_at)<=now||Date.parse(p.enabled_at)>now)fail('current-owner-control-policy-required');return p;}
function controlBudget(s,t,unitDigest,now,additional=0n,excluding=null,addCall=0,kind='protocol-leader-ack'){
 const policy=currentPolicy(t,now,kind),limit=policy.unit_allocations.find(u=>u.unit_digest===unitDigest),allocation=s.subscription_allocations?.[unitDigest];
 if(!limit||allocation?.protocol!==2||allocation.unit_scope.team!==t.id||!workKind(kind)&&allocation.revision!==limit.allocation_revision)fail('existing-control-unit-allocation-required');
 let tokens=additional,calls=addCall;const callKinds=kind===WORK_PLAN_KIND||kind===WORK_PLAN_REVIEW_KIND?[WORK_PLAN_KIND,WORK_PLAN_REVIEW_KIND]:[kind];
 // Work execution, work review and the plan call share the owner's one per-unit work cap.
 if(workKind(kind))for(const x of Object.values(s.subscription_invocations||{}))if(x.team===t.id&&x.purpose==='work'&&x.work_policy_revision===policy.revision&&x.state!=='aborted'&&x.unit_digest===unitDigest)tokens+=integer(['settled','reconciled'].includes(x.state)?x.charged_tokens:x.estimate_tokens);
 for(const x of Object.values(s.subscription_invocations||{}))if(x.id!==excluding&&x.team===t.id&&x.purpose==='protocol-control'&&callKinds.includes(x.control_policy_kind??'protocol-leader-ack')&&x.control_policy_revision===policy.revision&&x.state!=='aborted'){
  calls++;if(x.unit_digest===unitDigest)tokens+=integer(['settled','reconciled'].includes(x.state)?x.charged_tokens:x.estimate_tokens);
 }
 const siblings=workKind(kind)?[WORK_REVIEW_KIND,WORK_PLAN_KIND,WORK_PLAN_REVIEW_KIND].filter(k=>!callKinds.includes(k)):[];
 if(siblings.length)for(const x of Object.values(s.subscription_invocations||{}))if(x.id!==excluding&&x.team===t.id&&x.purpose==='protocol-control'&&siblings.includes(x.control_policy_kind)&&x.control_policy_revision===policy.revision&&x.state!=='aborted'&&x.unit_digest===unitDigest)tokens+=integer(['settled','reconciled'].includes(x.state)?x.charged_tokens:x.estimate_tokens);
 if(calls>policy.max_calls||tokens>integer(limit.max_tokens))fail('control-ceiling-exceeded');return policy;
}
function freshContext(s,context,excluding=null){if(Object.values(s.subscription_invocations||{}).some(x=>x.id!==excluding&&['consumed','uncertain','settled','reconciled'].includes(x.state)&&x.collector===context.collector&&x.context.native_id===context.native_id))fail('fresh-single-call-action-context-required');}
function boundCollector(s,t,c,x){
 const p=t.participants[x.participant],key=p?.native_binding?.collector_id,registered=s.collectors?.[key];
 if(!p||p.revoked||p.availability==='left'||p.incarnation!==x.incarnation||p.model?.model_revision!==x.model_revision||p.native_binding?.descriptor_digest!==x.descriptor_digest||c.actor!=='collector:'+key||c.actor!==x.collector||registered?.revoked||registered?.team!==t.id||!['runtime','usage'].every(k=>registered?.purposes?.includes(k)))fail('bound-action-collector-required');return p;
}
function nonquarantined(t,x){if(Object.values(x.binding_changes||{}).some(Boolean)||Object.values(t.subscription_contexts||{}).some(ctx=>ctx.native_id===x.context.native_id&&ctx.collector===x.collector&&ctx.quarantined))fail('nonquarantined-action-required');}
function fixedAction(s,t,action,now,excluding=null){const fixed=action.kind==='protocol-leader-ack'?createProtocolLeaderAckRequest(t,{actionId:action.action_id,now}):action.kind==='protocol-leadership-audit'?createProtocolLeadershipAuditRequest(s,t,{actionId:action.action_id,sourceInvocationId:action.request?.source_invocation_id,now}):action.kind==='protocol-handover-ack'?createProtocolHandoverAckRequest(s,t,{actionId:action.action_id,now,excluding}):action.kind===WORK_REVIEW_KIND?createProtocolWorkReviewRequest(s,t,{actionId:action.action_id,workId:action.request?.target?.work_id,now}):action.kind===WORK_PLAN_KIND?createProtocolWorkPlanRequest(s,t,{actionId:action.action_id,planId:action.request?.plan_id,now}):action.kind===WORK_PLAN_REVIEW_KIND?createProtocolWorkPlanReviewRequest(s,t,{actionId:action.action_id,planId:action.request?.plan_id,now}):null;if(!fixed)fail('fixed-action-kind-required');if(!same(fixed,coreAction(action)))fail('current-fixed-action-required');return fixed;}
export function validateProtocolAction(s,t,reservation,participant,context,now){
 if(reservation.purpose!=='protocol-control'){if(reservation.action!==undefined)fail('protocol-control-purpose-required');return null;}
 const action=object(reservation.action,['kind','action_id','request_digest','request','prompt_digest','operation_id'],24576),policy=currentPolicy(t,now,action.kind);
 fixedAction(s,t,action,now);
 if(action.request.participant!==participant.id||action.request.incarnation!==reservation.incarnation||action.request.descriptor_digest!==context.descriptor_digest||reservation.measurement!==undefined||reservation.max_calls!==1||integer(reservation.estimate_tokens)<=0n||integer(reservation.estimate_tokens)>integer(policy.max_estimate_tokens)||reservation.timeout_ms>policy.timeout_ms||action.prompt_digest!==actionPromptDigest(coreAction(action))||reservation.suite_digest!==action.prompt_digest||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(action.operation_id||''))fail('fixed-bounded-action-reservation-required');
 const slot=protocolActionSlot(action);
 if(t.native_control_slots?.[slot]||Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&x.purpose==='protocol-control'&&x.state!=='aborted'&&!(x.state==='reconciled'&&x.slot_released===true)&&protocolActionSlot(x.action)===slot))fail('action-slot-already-reserved-or-consumed');
 if(action.kind==='protocol-leadership-audit'){const source=action.request.target.source_context;if(context.native_id===source.native_id||[source.reservation_context_id,source.receipt_context_id].includes(context.id))fail('independent-audit-context-required');}
 if((action.kind===WORK_REVIEW_KIND||action.kind===WORK_PLAN_REVIEW_KIND)&&action.request.author_contexts.some(a=>a.native_id===context.native_id||a.context_id===context.id))fail('independent-review-context-required');
 // One review of a target at a time: a pending verdict, negative or not, is
 // recorded (or released by reconcile) before another critic may start.
 if(action.kind===WORK_REVIEW_KIND&&Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&x.purpose==='protocol-control'&&x.action?.kind===WORK_REVIEW_KIND&&x.action.request.target_digest===action.request.target_digest&&x.state!=='aborted'&&!(x.state==='reconciled'&&x.slot_released===true)&&!x.work_review))fail('native-work-review-pending-for-target');
 freshContext(s,context);controlBudget(s,t,context.unit_digest,now,integer(reservation.estimate_tokens),null,1,action.kind);return action;
}
export function consumeProtocolAction(s,t,x,now,command){
 if(!x.action)return;
 const policy=currentPolicy(t,now,x.action.kind);if((x.control_policy_kind??'protocol-leader-ack')!==x.action.kind||x.control_policy_revision!==policy.revision||command.prompt_digest!==x.action.prompt_digest)fail('current-fixed-action-consume-required');fixedAction(s,t,x.action,now,x.id);
 const slot=protocolActionSlot(x.action);if(t.native_control_slots?.[slot])fail('action-slot-already-consumed');freshContext(s,x.context,x.id);controlBudget(s,t,x.unit_digest,now,integer(x.estimate_tokens),x.id,1,x.action.kind);
 t.native_control_slots||={};t.native_control_slots[slot]={invocation_id:x.id,nonce:x.nonce,operation_id:x.action.operation_id,consumed_at:new Date(now).toISOString(),applied:false};
}
export function sealProtocolAction(t,x,receipt,now){
 if(receipt.action_seal===undefined)return null;
 if(!x.action||x.purpose!=='protocol-control')fail('stored-action-admission-required');
 const seal=object(receipt.action_seal,['action','original_output','output_digest','native_receipt','native_receipt_digest','observed_at','outcome'],49152);
 if(!same(seal.action,x.action)||typeof seal.original_output!=='string'||Buffer.byteLength(seal.original_output)>8192||seal.output_digest!==routingDigest(seal.original_output)||!['completed','failed'].includes(seal.outcome))fail('original-action-output-binding-required');
 const native=object(seal.native_receipt,['invocation_id','native_id','usage_span','actualModel','context_manifest','output'],32768);
 if(seal.native_receipt_digest!==routingDigest(native)||native.invocation_id!==x.nonce||native.native_id!==x.context.native_id||native.output!==seal.original_output||native.context_manifest?.native_id!==native.native_id||native.usage_span?.native_id!==native.native_id||native.usage_span?.turn_id!==receipt.turn_id||native.usage_span?.schema!==receipt.counter_schema||!same({provider:native.actualModel?.provider??null,model_id:native.actualModel?.model_id??null,reasoning:native.actualModel?.reasoning??null},receipt.observed_model))fail('native-action-receipt-binding-required');
 if(receipt.coverage!=='complete')return null;
 if(native.usage_span.coverage!=='complete'||['before','after','actual_tokens'].some(k=>native.usage_span[k]!==receipt[k]))fail('native-action-counter-binding-required');
 const observed=Date.parse(seal.observed_at);if(!Number.isFinite(observed)||observed>now||now-observed>30000||Date.parse(native.actualModel?.observed_at)!==observed)fail('original-action-clock-required');
 const slot=t.native_control_slots?.[protocolActionSlot(x.action)];if(slot?.invocation_id!==x.id||slot.nonce!==x.nonce)fail('consumed-action-slot-required');
 return {...seal,original_prompt:formatProtocolAction(coreAction(x.action)),sealed_at:new Date(now).toISOString(),context_id:x.context.id,native_id:x.context.native_id,turn_id:receipt.turn_id};
}
function source(t,x){
 if(x?.purpose!=='protocol-control'||x.state!=='settled'||x.receipt?.coverage!=='complete'||integer(x.charged_tokens)<=0n||!x.action_seal||x.action_seal.outcome!=='completed'||x.action_blocker)fail('complete-sealed-action-required');
 nonquarantined(t,x);
 if(!same(sealProtocolAction(t,x,x.receipt,Date.parse(x.action_seal.sealed_at)),x.action_seal)||x.charged_tokens!==x.receipt.actual_tokens||integer(x.receipt.after)-integer(x.receipt.before)!==integer(x.charged_tokens))fail('original-sealed-action-required');
 readProtocolActionResponse(x.action_seal.original_output,x.action);return x.action_seal;
}
function profileCapture(t,x,raw,p){
 const profile=object(raw,['protocol','identity_kind','profile_id','profile_digest','profile','observation_id','participant','incarnation','model_revision','native_id','context_id','invocation_id','nonce','observed_at','expires_at','receipt_digest','provenance','roles','rank_eligible','limitations','action','request_digest','admission_id','admission_digest','sealed_native_receipt_digest'],32768),seal=source(t,x),native=seal.native_receipt,ctx=native.context_manifest,target=x.action.request.profile;
 const admission={purpose:'protocol-control',state:'settled',context_quarantined:false,billing_policy:'inherited-native',nonce:x.nonce,invocation_id:x.id,participant:x.participant,incarnation:x.incarnation,model_revision:p.model.model_revision,native_id:x.context.native_id,actual_tokens:x.charged_tokens,action:x.action,request_digest:x.action.request_digest,original_output:seal.original_output,output_digest:seal.output_digest,native_receipt_digest:seal.native_receipt_digest,observed_at:seal.observed_at};
 const {observation_id,...body}=profile;
 if(profile.protocol!==2||profile.identity_kind!=='native-configuration'||profile.provenance!=='trusted-host-settled-protocol-control'||profile.admission_id!==x.id||profile.admission_digest!==routingDigest(admission)||profile.sealed_native_receipt_digest!==seal.native_receipt_digest||!same(profile.action,x.action)||profile.request_digest!==x.action.request_digest||profile.receipt_digest!==routingDigest({invocation_id:x.nonce,output:seal.original_output,actualModel:native.actualModel,context_manifest:ctx})||profile.observation_id!=='native-observation-'+routingDigest(body)||profile.profile_digest!==routingDigest(profile.profile)||profile.profile_id!==target.profile_id||profile.profile_digest!==target.profile_digest||target.profile_revision!==profile.profile?.revision||profile.participant!==x.participant||profile.incarnation!==x.incarnation||profile.model_revision!==p.model.model_revision||profile.native_id!==x.context.native_id||profile.context_id!==ctx.id||profile.invocation_id!==x.nonce||profile.nonce!==x.nonce||profile.observed_at!==seal.observed_at||Date.parse(profile.expires_at)!==Date.parse(profile.observed_at)+900000||profile.rank_eligible!==false||!Array.isArray(profile.roles)||profile.roles.length)fail('original-action-profile-binding-required');
 if(t.policy.mode==='owner-assigned'){if(!same(target,p.native_admission?.identity))fail('own-admitted-profile-required');}
 else{
  const calibrated=Object.values(t.native_calibration_cohorts||{}).flatMap(cohort=>Object.values(cohort.captures||{})).find(capture=>capture.measurement?.profile_id===target.profile_id&&capture.native_profile?.profile_digest===target.profile_digest);
  if(!calibrated||!same(profile.profile,calibrated.native_profile.profile))fail('own-calibrated-profile-required');
 }
 if(x.action.kind==='protocol-leadership-audit'){const source=x.action.request.target.source_context;if(ctx.native_id===source.native_id||[source.reservation_context_id,source.receipt_context_id].includes(ctx.id))fail('independent-audit-context-required');}
 if((x.action.kind===WORK_REVIEW_KIND||x.action.kind===WORK_PLAN_REVIEW_KIND)&&x.action.request.author_contexts.some(a=>a.native_id===ctx.native_id||a.context_id===ctx.id))fail('independent-review-context-required');
 profileScope(profile,native,ctx);
 return profile;
}
// The observed profile's scope and the isolated context must match the sealed native receipt.
function profileScope(profile,native,ctx){
 const actualProfile=profile.profile,scope=actualProfile.execution_scope,routeOnly=ctx.model_provider_is_billing_route===true||native.actualModel.provider_kind==='billing-route';
 const known=value=>typeof value==='string'&&value.length>0&&value!=='unknown';
 const observed=nativeProfileVersion(ctx);
 const observedReasoning=!routeOnly&&known(native.actualModel.reasoning)?native.actualModel.reasoning:'unknown';
 const observedVariant=routeOnly&&known(native.actualModel.reasoning)?native.actualModel.reasoning:'unknown';
 const validDigest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 if(actualProfile.harness!==ctx.harness||actualProfile.version!==observed.version||actualProfile.version_provenance!==observed.version_provenance||actualProfile.observed?.effective_reasoning!==observedReasoning||actualProfile.observed?.native_variant!==observedVariant||scope?.isolation!==ctx.isolation||scope.permissions?.rules_digest!==(validDigest(ctx.rules_digest)?ctx.rules_digest:null)||scope.context?.initial_instructions_digest!==(validDigest(ctx.initial_instructions_digest)?ctx.initial_instructions_digest:null))fail('native-action-profile-scope-changed');
 if(ctx.provenance!=='adapter-isolated'||ctx.read_only!==true||ctx.fresh!==true||ctx.fresh_review_verified!==true||ctx.author_history_inherited!==false||ctx.tools?.length!==0||ctx.author_contexts?.length!==0||profile.profile.native_routing_id!==native.actualModel.provider||profile.profile.native_model_id!==native.actualModel.model_id||profile.profile.execution_scope?.cwd!==ctx.cwd)fail('isolated-action-profile-required');
}
// Owner-assigned identity (ADR owner-assigned-team-roles): one identity-purpose call with
// no measurement. The Host seals the receipt; this is the same seal as an action's, minus the
// action. No slot: an identity call has none.
export function sealIdentityReceipt(t,x,receipt,now){
 if(receipt.identity_seal===undefined)return null;
 if(x.purpose!=='identity')fail('stored-identity-admission-required');
 const seal=object(receipt.identity_seal,['original_output','output_digest','native_receipt','native_receipt_digest','observed_at','outcome'],49152);
 if(typeof seal.original_output!=='string'||Buffer.byteLength(seal.original_output)>8192||seal.output_digest!==routingDigest(seal.original_output)||!['completed','failed'].includes(seal.outcome))fail('original-identity-output-binding-required');
 const native=object(seal.native_receipt,['invocation_id','native_id','usage_span','actualModel','context_manifest','output'],32768);
 if(seal.native_receipt_digest!==routingDigest(native)||native.invocation_id!==x.nonce||native.native_id!==x.context.native_id||native.output!==seal.original_output||native.context_manifest?.native_id!==native.native_id||native.usage_span?.native_id!==native.native_id||native.usage_span?.turn_id!==receipt.turn_id||native.usage_span?.schema!==receipt.counter_schema||!same({provider:native.actualModel?.provider??null,model_id:native.actualModel?.model_id??null,reasoning:native.actualModel?.reasoning??null},receipt.observed_model))fail('native-identity-receipt-binding-required');
 if(receipt.coverage!=='complete')return null;
 if(native.usage_span.coverage!=='complete'||['before','after','actual_tokens'].some(k=>native.usage_span[k]!==receipt[k]))fail('native-identity-counter-binding-required');
 const observed=Date.parse(seal.observed_at);if(!Number.isFinite(observed)||observed>now||now-observed>30000||Date.parse(native.actualModel?.observed_at)!==observed)fail('original-identity-clock-required');
 return {...seal,sealed_at:new Date(now).toISOString(),context_id:x.context.id,native_id:x.context.native_id,turn_id:receipt.turn_id};
}
// The collector's capture of a settled identity call: the authority's only record of a
// participant's native configuration in a team that runs no calibration. Immutable.
export function applyNativeIdentity(s,t,c,now){
 if(c.type!=='native-identity-capture-v2')return null;
 object(c,['type','team','actor','at','request_key','incarnation','epoch','invocation_id','nonce','profile'],65536);
 const x=s.subscription_invocations?.[c.invocation_id];
 if(x?.protocol!==2||x.team!==t.id||x.nonce!==c.nonce||x.purpose!=='identity'||x.state!=='settled'||x.receipt?.coverage!=='complete'||!x.identity_seal||x.identity_seal.outcome!=='completed'||integer(x.charged_tokens)<=0n)fail('complete-sealed-identity-required');
 const p=t.participants[x.participant],key=p?.native_binding?.collector_id,registered=s.collectors?.[key];
 if(!p||p.revoked||p.availability==='left'||p.incarnation!==x.incarnation||p.native_binding.descriptor_digest!==x.descriptor_digest||c.actor!=='collector:'+key||c.actor!==x.collector||registered?.revoked||registered?.team!==t.id||!['runtime','usage'].every(k=>registered?.purposes?.includes(k)))fail('bound-identity-collector-required');
 nonquarantined(t,x);
 const seal=x.identity_seal,native=seal.native_receipt,ctx=native.context_manifest,token='WAYPOST_PROBE_'+x.nonce;
 if(!same(sealIdentityReceipt(t,x,x.receipt,Date.parse(seal.sealed_at)),seal)||x.charged_tokens!==x.receipt.actual_tokens||integer(x.receipt.after)-integer(x.receipt.before)!==integer(x.charged_tokens))fail('original-sealed-identity-required');
 const profile=object(c.profile,['protocol','identity_kind','profile_id','profile_digest','profile','observation_id','participant','incarnation','model_revision','native_id','context_id','invocation_id','nonce','observed_at','expires_at','receipt_digest','provenance','roles','rank_eligible','limitations'],32768);
 const {observation_id,...body}=profile;
 if(seal.original_output.trim()!==token||profile.nonce!==token||profile.protocol!==2||profile.identity_kind!=='native-configuration'||profile.provenance!=='trusted-host-budgeted-native-receipt'||profile.rank_eligible!==false||!Array.isArray(profile.roles)||profile.roles.length||profile.receipt_digest!==routingDigest({invocation_id:x.nonce,output:seal.original_output,actualModel:native.actualModel,context_manifest:ctx})||observation_id!=='native-observation-'+routingDigest(body)||profile.profile_digest!==routingDigest(profile.profile)||profile.profile_id!=='native-profile-'+profile.profile_digest||profile.participant!==x.participant||profile.incarnation!==x.incarnation||profile.model_revision!==p.model.model_revision||profile.native_id!==x.context.native_id||profile.context_id!==ctx.id||profile.invocation_id!==x.nonce||profile.observed_at!==seal.observed_at||Date.parse(profile.expires_at)!==Date.parse(profile.observed_at)+900000||profile.profile?.revision!==1||profile.profile?.execution_scope?.read_only!==true||!Array.isArray(profile.profile.execution_scope.tools)||profile.profile.execution_scope.tools.length)fail('original-identity-profile-binding-required');
 profileScope(profile,native,ctx);
 if(Date.parse(profile.observed_at)>now||!x.identity_observation&&now>=Date.parse(profile.expires_at))fail('identity-observation-expired');
 const record={identity:{kind:'native-configuration',profile_id:profile.profile_id,profile_digest:profile.profile_digest,profile_revision:profile.profile.revision},observation_id,participant:x.participant,incarnation:x.incarnation,model_revision:p.model.model_revision,descriptor_digest:x.descriptor_digest,collector:key,source_invocation:x.id,profile_snapshot_digest:routingDigest(profile.profile),observed_at:profile.observed_at,expires_at:profile.expires_at};
 if(x.identity_observation){if(!same(x.identity_observation,record))fail('identity-observation-immutable');return {handled:true,result:{captured:x.id,unchanged:true,protected_actions_granted:false}};}
 x.identity_observation=record;
 return {handled:true,result:{captured:x.id,identity:record.identity,protected_actions_granted:false}};
}
// A consumed control call without a terminal receipt becomes terminal from the
// owned runtime closure of its ledger-bound operation. Its usage is unknown: the
// reservation is charged and latched until the owner accepts a charge. Its slot
// is freed only when no answer reached the authority (no partial receipt); an
// answered call keeps its slot, so a recorded answer cannot be asked again. It
// grants nothing.
export function reconcileProtocolControl(s,t,c,now){
 object(c,['type','team','actor','at','request_key','incarnation','epoch','invocation_id','nonce','completion'],16384);
 const x=s.subscription_invocations?.[c.invocation_id];
 const control=x?.purpose==='protocol-control';
 if(x?.protocol!==2||x.team!==t.id||x.nonce!==c.nonce||!(control?x.action?.operation_id:['identity','calibration','delivery','work','evaluation'].includes(x.purpose)&&x.operation_id))fail('consumed-control-invocation-required');
 const registered=s.collectors?.[x.collector?.replace(/^collector:/,'')];
 if(c.actor!==x.collector||!registered||registered.revoked||registered.team!==t.id)fail('bound-invocation-collector-required');
 const completion=control?closedCompletion(t,x,c.completion):closedCompletion(t,x,c.completion,{operation:x.operation_id,kind:{identity:'subscription-bootstrap',calibration:'calibration-trial',delivery:'delivery',work:'protocol-work-execute',evaluation:'evaluation'}[x.purpose],epoch:x.epoch});
 if(!(Date.parse(completion.closed_at)>=Date.parse(x.consumed_at))||Date.parse(completion.closed_at)>now)fail('exact-owned-operation-completion-required');
 if(x.state==='reconciled'){if(x.reconcile_evidence_digest!==completion.evidence_digest)fail('subscription-reconcile-conflict');return {unchanged:true,reconciled:x.id};}
 if(!['consumed','uncertain'].includes(x.state))fail('consumed-control-invocation-required');
 // Identity calls have no slot; a calibration trial keeps its measurement slot.
 x.state='reconciled';x.charged_tokens=x.estimate_tokens;x.usage='unknown';x.unknown_usage_accepted=false;x.reconciled_at=c.at;x.reconcile_evidence_digest=completion.evidence_digest;x.slot_released=control&&x.partial_receipt===undefined;
 // A reconciled delivery is stopped: its question is never sent again.
 // A reconciled work attempt is stopped and its slot stays consumed; the owner may retry or cancel.
 const work=x.purpose==='work'&&t.work?.[x.work?.work_id],dispatch=work?.dispatches?.[x.nonce];if(dispatch?.invocation_id===x.id&&['dispatching','uncertain'].includes(dispatch.state)){dispatch.state='stopped';if(['executing','uncertain'].includes(work.status))work.status='attempt-failed';}
 const delivery=x.purpose==='delivery'&&t.deliveries?.[x.nonce];if(delivery?.invocation_id===x.id&&['dispatching','uncertain'].includes(delivery.state))delivery.state='stopped';
 if(control){const slot=protocolActionSlot(x.action);if(x.slot_released&&t.native_control_slots?.[slot]?.invocation_id===x.id)delete t.native_control_slots[slot];}
 return {reconciled:x.id,charged_tokens:x.charged_tokens,usage:'unknown',slot_released:x.slot_released,protected_actions_granted:false};
}
// An identity or calibration call binds its own operation id and the Host wrapper's kind.
export function closedCompletion(t,x,completion,{operation=x.action?.operation_id,kind=x.action?.kind,epoch=x.action?.kind==='protocol-handover-ack'?x.action.request.runtime_epoch:x.epoch}={}){
 const c=object(completion,['protocol','scope','operation','kind','invocation_id','nonce','native_id','consume_type','created_at','closed_at','stopped','callback_drained','evidence_digest'],8192),scope={team:t.id,participant:x.participant,incarnation:x.incarnation,epoch,descriptor_digest:x.descriptor_digest};
 if(c.protocol!==1||!same(c.scope,scope)||!operation||c.operation!==operation||c.kind!==kind||c.invocation_id!==x.id||c.nonce!==x.nonce||c.native_id!==x.context.native_id||c.consume_type!=='subscription-consume-v2'||c.stopped!==true||c.callback_drained!==true||!/^[a-f0-9]{64}$/.test(c.evidence_digest||'')||!Number.isFinite(Date.parse(c.created_at))||Date.parse(c.created_at)>Date.parse(x.consumed_at)||!Number.isFinite(Date.parse(c.closed_at))||Date.parse(c.closed_at)<Date.parse(x.settled_at))fail('exact-owned-operation-completion-required');return c;
}
export function applyNativeProtocolControl(s,t,c,now,H){
 if(!['native-protocol-control-enable-v2','native-protocol-review-enable-v2','native-action-profile-capture-v2','native-leader-ack-capture-v2','native-protocol-review-capture-v2','native-protocol-handover-enable-v2','native-protocol-handover-ack-capture-v2','native-work-review-capture-v2','native-work-plan-capture-v2','native-work-plan-review-capture-v2'].includes(c.type))return null;
 object(c,['type','team','actor','at','request_key','incarnation','epoch',...(['native-protocol-control-enable-v2','native-protocol-review-enable-v2','native-protocol-handover-enable-v2'].includes(c.type)?['revision','policy']:c.type==='native-action-profile-capture-v2'?['invocation_id','nonce','profile']:['invocation_id','nonce','completion'])],65536);
 let result;
 if(['native-protocol-control-enable-v2','native-protocol-review-enable-v2','native-protocol-handover-enable-v2'].includes(c.type)){
  const kind=c.type==='native-protocol-control-enable-v2'?'protocol-leader-ack':c.type==='native-protocol-review-enable-v2'?'protocol-leadership-audit':'protocol-handover-ack',policyKey=kind==='protocol-leader-ack'?'native_control_policy':kind==='protocol-leadership-audit'?'native_review_policy':'native_handover_policy';
  H.owner(s,c);mode(t);const policy=object(c.policy,['kind','allow_unknown_quota','max_calls','max_estimate_tokens','timeout_ms','expires_at','unit_allocations']);
  if(policy.kind!==kind||policy.allow_unknown_quota!==true||!Number.isSafeInteger(c.revision)||c.revision<1||c.revision<=(t[policyKey]?.revision||0)||!Number.isSafeInteger(policy.max_calls)||policy.max_calls<1||policy.max_calls>128||integer(policy.max_estimate_tokens)<=0n||!Number.isSafeInteger(policy.timeout_ms)||policy.timeout_ms<100||policy.timeout_ms>300000||!Number.isFinite(Date.parse(policy.expires_at))||Date.parse(policy.expires_at)<=now||Date.parse(policy.expires_at)>Date.parse(t.policy.expires_at)||!Array.isArray(policy.unit_allocations)||!policy.unit_allocations.length||policy.unit_allocations.length>128||new Set(policy.unit_allocations.map(u=>u.unit_digest)).size!==policy.unit_allocations.length)fail('bounded-owner-control-policy-required');
  if(kind==='protocol-leader-ack')createProtocolLeaderAckRequest(t,{actionId:'enable-check',now});else if(kind==='protocol-leadership-audit'&&(t.status!=='active'||!t.leader))fail('active-independent-audit-required');else if(kind==='protocol-handover-ack'&&!t.native_quota_policy)fail('owner-native-quota-policy-required');
  if(Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&x.purpose==='protocol-control'&&(x.control_policy_kind??'protocol-leader-ack')===kind&&!['settled','aborted','reconciled'].includes(x.state)))fail('unfinished-control-policy-migration');
  for(const unit of policy.unit_allocations){object(unit,['unit_digest','max_tokens','allocation_revision']);const allocation=s.subscription_allocations?.[unit.unit_digest];if(allocation?.protocol!==2||allocation.unit_scope.team!==t.id||unit.allocation_revision!==allocation.revision||integer(unit.max_tokens)<=0n||integer(unit.max_tokens)>integer(allocation.max_tokens))fail('existing-control-unit-allocation-required');}
  t[policyKey]={...policy,protocol:2,revision:c.revision,enabled_at:c.at};result={enabled:true,revision:c.revision,purpose:'protocol-control',allocation_expanded:false};
 }else{
  const x=s.subscription_invocations?.[c.invocation_id];if(!x||x.team!==t.id||x.nonce!==c.nonce||!x.action)fail('stored-action-required');const p=boundCollector(s,t,c,x);
  if(c.type==='native-action-profile-capture-v2'){
   const profile=profileCapture(t,x,c.profile,p);
   if(x.action_observation&&!same(x.action_observation,profile))fail('action-observation-immutable');x.action_observation=profile;result={captured:x.id,ack_applied:false};
  }else{
   const audit=c.type==='native-protocol-review-capture-v2',handover=c.type==='native-protocol-handover-ack-capture-v2',workReview=c.type==='native-work-review-capture-v2',workPlan=c.type==='native-work-plan-capture-v2',workPlanReview=c.type==='native-work-plan-review-capture-v2';if(x.action.kind!==(workPlanReview?WORK_PLAN_REVIEW_KIND:workPlan?WORK_PLAN_KIND:workReview?WORK_REVIEW_KIND:audit?'protocol-leadership-audit':handover?'protocol-handover-ack':'protocol-leader-ack'))fail('capture-action-kind-required');
   if(c.profile!==undefined||c.output!==undefined||c.policy!==undefined)fail('own-action-source-only');const completion=closedCompletion(t,x,c.completion);
   if(workReview&&x.work_review){if(!same(x.work_review.completion,completion))fail('work-review-immutable');return {handled:true,result:{captured:x.id,unchanged:true,verdict:x.work_review.verdict,protected_actions_granted:false}};}
   if(workPlanReview&&x.work_plan_review){if(!same(x.work_plan_review.completion,completion))fail('work-plan-review-immutable');return {handled:true,result:{captured:x.id,unchanged:true,verdict:x.work_plan_review.verdict,state:x.work_plan_review.state,protected_actions_granted:false}};}
   if(workPlan&&x.work_plan){if(!same(x.work_plan.completion,completion))fail('work-plan-immutable');return {handled:true,result:{captured:x.id,unchanged:true,state:x.work_plan.state,protected_actions_granted:false}};}
   if(audit&&x.protocol_review){if(!same(x.protocol_review.completion,completion))fail('protocol-review-immutable');return {handled:true,result:{captured:x.id,unchanged:true,verdict:x.protocol_review.verdict,protected_actions_granted:false}};}
   if(handover&&x.protocol_handover_ack){if(!same(x.protocol_handover_ack.completion,completion))fail('handover-ack-immutable');return {handled:true,result:{applied:true,unchanged:true,leader:x.protocol_handover_ack.leader,epoch:x.protocol_handover_ack.epoch,protected_actions_granted:false}};}
   if(x.action_ack){if(!same(x.action_ack.completion,completion))fail('action-ack-immutable');return {handled:true,result:{applied:true,unchanged:true,leader:x.action_ack.leader,epoch:x.action_ack.epoch}};}
   source(t,x);if(!x.action_observation)fail('own-action-observation-required');profileCapture(t,x,x.action_observation,p);
   const policy=currentPolicy(t,now,x.action.kind);if((x.control_policy_kind??'protocol-leader-ack')!==x.action.kind||x.control_policy_revision!==policy.revision||Date.parse(x.action_observation.expires_at)<=now||Date.parse(x.action_observation.observed_at)>now||x.epoch!==t.epoch||x.quota_revision!==(t.quota_revision||0)||x.mode_revision!==t.accounting.revision||x.overshoot_allocation_revision!==undefined||p.quota_observation?.status==='exhausted'||!nativeQuotaEligible(t,p,now))fail('current-action-ack-admission-required');
   fixedAction(s,t,x.action,now,x.id);controlBudget(s,t,x.unit_digest,now,0n,null,0,x.action.kind);
   const allocation=s.subscription_allocations?.[x.unit_digest];let used=0n;
   for(const invocation of Object.values(s.subscription_invocations||{}).filter(y=>y.unit_digest===x.unit_digest&&y.state!=='aborted')){if(invocation.state==='uncertain'||invocation.state==='reconciled'&&invocation.unknown_usage_accepted!==true||invocation.overshoot_allocation_revision!==undefined&&allocation.revision<=invocation.overshoot_allocation_revision)fail('unreconciled-action-unit');used+=integer(['settled','reconciled'].includes(invocation.state)?invocation.charged_tokens:invocation.estimate_tokens);}
   if(used>integer(allocation.max_tokens)||x.allocation_revision!==allocation.revision||Date.parse(completion.closed_at)>now)fail('current-action-allocation-required');
   const slot=t.native_control_slots?.[protocolActionSlot(x.action)];if(slot?.invocation_id!==x.id||slot.applied)fail('consumed-own-action-slot-required');
   if(workPlanReview){
    // The critic's verdict is stored with the plan and grants nothing; a negative one is final for this proposal.
    const plan=t.work_plans?.[x.action.request.plan_id];if(plan?.state!=='proposed')fail('native-work-plan-review-proposal-required');
    const recorded=recordWorkPlanReview(s,t,plan,x,c);
    x.work_plan_review={protocol:1,label:x.action.request.label,plan_id:plan.id,state:recorded.state,verdict:recorded.verdict,proposal_digest:plan.proposal.digest,invocation_id:x.id,output_digest:x.action_seal.output_digest,completion,captured_at:c.at,protected_actions_granted:false};slot.applied=true;
    result={captured:x.id,plan:plan.id,state:recorded.state,verdict:recorded.verdict,protected_actions_granted:false};
   }else if(workPlan){
    // The proposal is stored for the owner and grants nothing; a refusal or a rejected plan is recorded the same way.
    const plan=t.work_plans?.[x.action.request.plan_id];if(plan?.state!=='requested')fail('native-work-plan-request-required');
    const recorded=recordWorkPlan(s,t,plan,x,c);
    x.work_plan={protocol:1,label:x.action.request.label,plan_id:plan.id,state:recorded.state,...(recorded.digest?{digest:recorded.digest}:{}),invocation_id:x.id,output_digest:x.action_seal.output_digest,completion,captured_at:c.at,protected_actions_granted:false};slot.applied=true;
    result={captured:x.id,plan:plan.id,state:recorded.state,...(recorded.digest?{digest:recorded.digest}:{}),...(recorded.codes?.length?{codes:recorded.codes}:{}),protected_actions_granted:false};
   }else if(workReview){
    // A negative verdict stays with its target for good; an approval counts only
    // while no negative exists for that exact target.
    const verdict=readWorkReview(x.action_seal.original_output,x.action),r=x.action.request,w=t.work?.[r.target.work_id];
    if(!w||w.protocol!==2||w.status!=='candidate'||routingDigest(w.result)!==routingDigest({base:r.target.base,tree:r.target.tree,paths:r.target.paths,candidate_digest:r.target.candidate_digest,diff_digest:r.target.diff_digest,patch_digest:r.target.patch_digest,patch_ref:r.target.patch_ref,tests_digest:r.target.tests_digest,tests_status:r.target.tests_status}))fail('native-work-review-current-candidate-required');
    const record={protocol:1,label:r.label,verdict:verdict.verdict,findings:verdict.findings,target_digest:r.target_digest,work_id:w.id,generation:w.generation,invocation_id:x.id,participant:x.participant,incarnation:x.incarnation,model_revision:x.model_revision,descriptor_digest:x.descriptor_digest,epoch:t.epoch,policy_revision:t.policy.revision,review_floor:r.review_floor,profile:structuredClone(r.profile),...(r.assignment_digest!==undefined?{assignment_digest:r.assignment_digest}:{calibration_digest:r.calibration_digest}),output_digest:x.action_seal.output_digest,observed_at:x.action_observation.observed_at,completion,captured_at:c.at,protected_actions_granted:false};
    t.native_work_reviews||={};const aggregate=t.native_work_reviews[r.target_digest]||{records:[],unresolved_negative:false};
    aggregate.records.push(record);aggregate.unresolved_negative ||= verdict.verdict!=='approve';t.native_work_reviews[r.target_digest]=aggregate;
    w.reviews=[...(w.reviews||[]),{invocation_id:x.id,verdict:verdict.verdict,target_digest:r.target_digest}];
    w.status=aggregate.unresolved_negative?(verdict.verdict==='blocked'?'blocked':'changes-requested'):'approved';
    x.work_review=structuredClone(record);slot.applied=true;result={captured:x.id,verdict:verdict.verdict,work_status:w.status,target_digest:r.target_digest,unresolved_negative:aggregate.unresolved_negative,label:r.label,protected_actions_granted:false};
   }else if(audit){
    const verdict=readProtocolActionResponse(x.action_seal.original_output,x.action),record={protocol:1,scope:'stored-ack-binding-accounting-closure',protected_actions_granted:false,source_invocation_id:x.action.request.source_invocation_id,limitations:['Historical strongest election, architecture and project work are outside this audit.'],...verdict,invocation_id:x.id,participant:x.participant,incarnation:x.incarnation,model_revision:x.model_revision,descriptor_digest:x.descriptor_digest,epoch:x.epoch,policy_revision:x.action.request.policy_revision,policy_digest:x.action.request.policy_digest,profile:structuredClone(x.action.request.profile),...(x.action.request.assignment_digest!==undefined?{assignment_digest:x.action.request.assignment_digest}:{calibration_digest:x.action.request.calibration_digest}),output_digest:x.action_seal.output_digest,observed_at:x.action_observation.observed_at,completion,captured_at:c.at};
    t.native_protocol_reviews||={};const aggregate=t.native_protocol_reviews[verdict.target_digest]||{records:[],unresolved_negative:false};
    aggregate.records.push(record);aggregate.unresolved_negative ||= verdict.verdict!=='approve';t.native_protocol_reviews[verdict.target_digest]=aggregate;x.protocol_review=structuredClone(record);slot.applied=true;result={captured:x.id,verdict:verdict.verdict,target_digest:verdict.target_digest,unresolved_negative:aggregate.unresolved_negative,scope:'stored-ack-binding-accounting-closure',protected_actions_granted:false};
   }else{
   if(handover){assertNativeHandoverReady(s,t,now,{excluding:x.id});t.native_protocol_handover.state='applied';t.native_protocol_handover.applied_invocation_id=x.id;t.native_protocol_handover.applied_at=c.at;delete t.native_quota_freeze;}
   t.leader=x.participant;t.candidate=null;t.epoch=x.action.request.target_epoch;t.status='active';slot.applied=true;
   if(handover)x.protocol_handover_ack={leader:t.leader,epoch:t.epoch,applied_at:c.at,completion,handover_id:t.native_protocol_handover.id};else x.action_ack={leader:t.leader,epoch:t.epoch,applied_at:c.at,completion};result={applied:true,leader:t.leader,epoch:t.epoch,scope:'waypost-protocol',protected_actions_granted:false};
   }
  }
 }
 return {handled:true,result};
}
