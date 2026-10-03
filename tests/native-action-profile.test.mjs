import test from 'node:test';
import assert from 'node:assert/strict';
import {collectNativeModelProfile,collectNativeActionProfile,verifyNativeModelProfile,serializeNativeModelProfile} from '../scripts/native-model-profile.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
const now=Date.parse('2026-10-03T12:00:00Z'),at=new Date(now).toISOString();
function fixture(){
 const participant={id:'peer',incarnation:'inc',model:{model_revision:1},native_binding:{descriptor_digest:routingDigest('descriptor')}},native_id='own-native',nonce='action-nonce';
 const context_manifest={id:'own-manifest',native_id,harness:'opencode',cwd:'/fixture',version:'1.18.33',version_provenance:'native-health',read_only:true,fresh:true,fresh_review_verified:true,author_history_inherited:false,tools:[],author_contexts:[],isolation:'read-only',provenance:'adapter-isolated',model_provider_is_billing_route:true};
 const actualModel={provider:'route',model_id:'model',reasoning:'variant',observed_at:at},correlation={participant:'peer',incarnation:'inc',model_revision:1,native_id,context_id:'own-manifest',invocation_id:nonce,nonce};
 const options={participant,adapter_revision:'native-profile-v1',requested_configuration:{model_id:'model'},execution_environment:{platform:'fixture'},now};
 const request={protocol:2,kind:'protocol-leader-ack',action_id:'action-one',team:'team',participant:'peer',incarnation:'inc',descriptor_digest:participant.native_binding.descriptor_digest,current_epoch:1,target_epoch:2,policy_revision:2};
 const action={kind:'protocol-leader-ack',action_id:'action-one',request_digest:routingDigest(request)};
 const output=JSON.stringify({ack:true,action_id:action.action_id,request_digest:action.request_digest});
 const result={native_id,invocation_id:nonce,output,actualModel,context_manifest,correlation,observed_at:at,usage_span:{protocol:1,schema:'native-test-counter',native_id,turn_id:'own-turn',coverage:'complete',before:'0',after:'30',actual_tokens:'30'}};
 return {options,request,action,result};
}
function seal(f){
 const {result:r,action:a}=f;
 r.admission={purpose:'protocol-control',state:'settled',context_quarantined:false,billing_policy:'inherited-native',nonce:r.invocation_id,invocation_id:'subscription-'+r.invocation_id,participant:'peer',incarnation:'inc',model_revision:1,native_id:r.native_id,action:structuredClone(a),request_digest:a.request_digest,original_output:r.output,output_digest:routingDigest(r.output),native_receipt_digest:routingDigest({invocation_id:r.invocation_id,native_id:r.native_id,usage_span:r.usage_span,actualModel:r.actualModel,context_manifest:r.context_manifest,output:r.output}),actual_tokens:r.usage_span.actual_tokens,observed_at:r.observed_at};
}
async function ready(){
 const f=fixture(),identity=await collectNativeModelProfile({...f.options,observe:async()=>({...f.result,output:f.result.correlation.nonce})});
 f.request.profile={kind:'native-configuration',profile_id:identity.profile_id,profile_digest:identity.profile_digest,profile_revision:1};f.action.request=structuredClone(f.request);f.action.request_digest=routingDigest(f.request);f.result.output=JSON.stringify({ack:true,action_id:f.action.action_id,request_digest:f.action.request_digest});seal(f);return {...f,identity};
}
const collect=f=>collectNativeActionProfile({...f.options,action:f.action,request:f.request,observe:async()=>f.result});
test('settled protocol ACK mints a separate observation with the same configuration digest and original clocks',async()=>{
 const f=await ready(),observed=await collect(f);assert.equal(observed.profile_id,f.identity.profile_id);assert.deepEqual(observed.profile,f.identity.profile);assert.equal(observed.provenance,'trusted-host-settled-protocol-control');assert.equal(observed.admission_id,'subscription-action-nonce');assert.equal(observed.request_digest,f.action.request_digest);assert.deepEqual(observed.roles,[]);assert.equal(observed.rank_eligible,false);
 assert.equal(verifyNativeModelProfile(observed,{now:now+1000}),true);assert.equal(serializeNativeModelProfile(observed,{now:now+1000}).observed_at,at);assert.equal(observed.expires_at,new Date(now+900000).toISOString());
 for(const copy of [{...observed},structuredClone(observed),JSON.parse(JSON.stringify(observed))])assert.throws(()=>verifyNativeModelProfile(copy,{now}),/collector-provenance/);
});
test('ACK refuses extras, duplicate decoded keys, false acknowledgement and replaced identifiers even when sealed',async()=>{
 const outputs=[f=>JSON.stringify({ack:true,action_id:f.action.action_id,request_digest:f.action.request_digest,extra:1}),f=>' {"ack":true,"a\\u0063k":true,"action_id":"'+f.action.action_id+'","request_digest":"'+f.action.request_digest+'"}',f=>JSON.stringify({ack:false,action_id:f.action.action_id,request_digest:f.action.request_digest}),f=>JSON.stringify({ack:true,action_id:'foreign',request_digest:f.action.request_digest})];
 for(const output of outputs){const f=await ready();f.result.output=output(f);seal(f);await assert.rejects(collect(f));}
});
test('accounting, source, context and action binding all fail closed without a generic grant',async()=>{
 const mutations=[f=>f.result.admission.purpose='calibration',f=>f.result.admission.state='consumed',f=>f.result.admission.context_quarantined=true,f=>f.result.admission.original_output+=' ',f=>f.result.admission.request_digest=routingDigest('foreign'),f=>f.result.admission.native_receipt_digest=routingDigest('foreign'),f=>f.result.admission.incarnation='foreign',f=>f.result.usage_span.coverage='partial',f=>f.result.context_manifest.tools=['tool'],f=>f.result.actualModel.model_id='changed',f=>f.request.candidate='foreign',f=>f.result.correlation.context_id='foreign',f=>f.result.observed_at=new Date(now+1).toISOString()];
 for(const mutate of mutations){const f=await ready();mutate(f);await assert.rejects(collect(f));}
});
test('sealed complete counter deltas and original observation clock cannot be renewed or fabricated',async()=>{
 for(const mutate of [f=>f.result.usage_span.after='31',f=>f.result.usage_span.actual_tokens='0',f=>f.result.usage_span.before='unknown',f=>{f.result.observed_at=new Date(now-30001).toISOString();f.result.actualModel.observed_at=f.result.observed_at;}]){const f=await ready();mutate(f);seal(f);await assert.rejects(collect(f));}
 const f=await ready();f.options.now=now+30001;await assert.rejects(collect(f),/stale-or-clock/);
});

test('truthfully charged but changed native configuration cannot reuse the calibrated action identity',async()=>{
 const f=await ready();f.result.actualModel.model_id='other-native-model';seal(f);await assert.rejects(collect(f),/action-observed-profile-changed/);
});
