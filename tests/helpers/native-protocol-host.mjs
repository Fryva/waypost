import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {authorityFixture} from './native-calibration.mjs';
import {reduceTeamEvent} from '../../scripts/team-state.mjs';
import {mutateAuthority,readAuthority} from '../../scripts/team-store.mjs';
import {createTeamHost} from '../../scripts/team-host.mjs';
import {routingDigest} from '../../scripts/model-routing.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
export async function protocolHostFixture(t,options={}){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'waypost-protocol-host-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const descriptors=Object.fromEntries(['a','b','c','d'].map(name=>[name,{managed:true,harness:'opencode',cwd:root,mode:'read-only',spawn_server:true,timeout_ms:1000,provider_id:'route',model_id:'model-'+name,reasoning:'unknown'}]));
 const schema='opencode-native-normalized-step-total-v1',clock=Date.now();
 const f=await authorityFixture({now:clock,counter_schema:schema,adapter_revision:'waypost-native-profile-1',descriptor_digest:name=>routingDigest(descriptors[name]),manifest:()=>({cwd:root}),requested_configuration:(_name,model)=>({model_id:model.model_id,provider_id:'route',reasoning:'unknown',mode:'read-only',initial_instructions_digest:null,rules_digest:null}),execution_environment:{platform:process.platform,architecture:process.arch}});
 const ownerToken='fixture-owner-token-'.repeat(4),ownerHash=sha(ownerToken);Object.assign(f.state,{protocol:1,owner_hash:ownerHash,task_bindings:{task:'team'}});
 Object.assign(f.state.teams.team,{task:'task',policy:{protocol:1,revision:1,mode:'automatic',domain:'coding',generated_at:f.at,expires_at:f.expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:f.at}],profiles:[],evidence_floor:['adapter-observed']},messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 const state=reduceTeamEvent(f.state,{type:'native-policy-install-v2',team:'team',actor:'owner:'+ownerHash,at:f.at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:f.revision}).state;
 const participant=state.teams.team.candidate,p=state.teams.team.participants[participant],name=participant.slice(-1),descriptor=descriptors[name],owner=join(root,'owner.json'),collector=join(root,'collector.json'),endpoint=join(root,'endpoint.json'),hostDir=join(root,'host');
 writeFileSync(owner,JSON.stringify({protocol:1,role:'owner',token:ownerToken}),{mode:0o600});
 const configs={};
 for(const member of Object.values(state.teams.team.participants)){
  const memberName=member.id.slice(-1),memberCollector=member.id===participant?collector:join(root,'collector-'+memberName+'.json'),memberEndpoint=member.id===participant?endpoint:join(root,'endpoint-'+memberName+'.json');
  const collectorToken=('fixture-collector-token-'+memberName+'-').repeat(4);writeFileSync(memberCollector,JSON.stringify({protocol:1,role:'collector',collector:member.native_binding.collector_id,team:'team',token:collectorToken}),{mode:0o600});state.collectors[member.native_binding.collector_id].credential_hash=sha(collectorToken);
  Object.assign(member.native_binding,{endpoint_file:memberEndpoint,collector_file:memberCollector});writeFileSync(memberEndpoint,JSON.stringify({protocol:1,team:'team',participant:member.id,descriptor:descriptors[memberName]}),{mode:0o600});
  configs[member.id]={authorityRoot:join(root,'authority'),projectRoot:root,team:'team',hostDir:member.id===participant?hostDir:join(root,'host-'+memberName),ownerCredential:owner,collectorPath:memberCollector,endpointPath:memberEndpoint,participant:member.id};
 }
 const authority=join(root,'authority'),seed=structuredClone(state),reducer=(s,c,a)=>c.type==='fixture-initialize'?{state:structuredClone(seed),result:{fixture:true}}:reduceTeamEvent(s,c,a);
 mutateAuthority(authority,{actor:'owner:'+ownerHash,key:'fixture',expected_revision:0,command:{type:'fixture-initialize'}},reducer,{confirmedLocal:true});
 const calls=[];let created=0,interrupt=options.interruptAck,interruptProfile=options.interruptProfile,interruptReview=options.interruptReview,interruptReviewProfile=options.interruptReviewProfile;
 const dependencies={load:()=>readAuthority(authority,reducer),mutate:(path,request,_reducer,hooks)=>{calls.push(request.command.type);if(interruptReview&&request.command.type==='native-protocol-review-capture-v2'){interruptReview=false;throw Error('fixture interrupted review capture');}if(interruptReviewProfile&&request.command.type==='native-action-profile-capture-v2'&&dependencies.load().state.subscription_invocations[request.command.invocation_id]?.action?.kind==='protocol-leadership-audit'){interruptReviewProfile=false;throw Error('fixture interrupted review profile capture');}if(interruptProfile&&request.command.type==='native-action-profile-capture-v2'){interruptProfile=false;throw Error('fixture interrupted profile capture');}if(interrupt&&request.command.type==='native-leader-ack-capture-v2'){interrupt=false;throw Error('fixture interrupted ACK application');}return mutateAuthority(path,request,reducer,hooks);},createNativeEndpoint:async nativeDescriptor=>{
  created++;const native_id='native-control-'+created,peer=f.peers.find(row=>routingDigest(descriptors[row.p.id.slice(-1)])===routingDigest(nativeDescriptor)),manifest=peer.manifest('host-control-'+created);manifest.native_id=native_id;calls.push('native-create');
  return {native_id,owns_process:true,usage_counter_schema:schema,async inspectContext(){return {verified:true};},async captureAccountingMetadata(){return {provider:null,origin:null,account:null,sku:null,mode:'unknown',paid_fallback:'unknown',provenance:'unavailable',auth_method:null,credit_availability:'unknown',observed_at:new Date().toISOString(),account_generation:0,consistent:true};},async send(prompt,invocation){calls.push('native-send');assert.equal(invocation.purpose,'protocol-control');const action=Object.values(dependencies.load().state.subscription_invocations).find(x=>x.context?.native_id===native_id&&x.state==='consumed').action,audit=action.kind==='protocol-leadership-audit';const response=audit?{verdict:options.auditVerdict||'approve',action_id:action.action_id,request_digest:action.request_digest,target_digest:action.request.target_digest,findings:options.auditFindings||[]}:JSON.parse(prompt.split('\n').at(-1)).response;return {invocation_id:invocation.id,native_id,output:(audit?options.auditMalformed:options.malformed)?'{}':JSON.stringify(response),actualModel:{...peer.model,observed_at:new Date().toISOString()},context_manifest:manifest,usage_span:{schema,native_id,turn_id:'native-turn-'+created,coverage:(audit?options.auditPartial:options.partial)?'partial':'complete',before:'0',after:'30',actual_tokens:'30'}};},async stopAndWait(){calls.push('native-stop');return {stopped:true,owned_processes:1,process_group_closed:true};}};
 }};
 const config={authorityRoot:authority,projectRoot:root,team:'team',hostDir,ownerCredential:owner,collectorPath:collector,endpointPath:endpoint,participant};
 const host=createTeamHost(config,dependencies),unit={scope:'team-native-counter',team:'team',counter_schema:schema},allocation=state.subscription_allocations[routingDigest(unit)];
 host.enableProtocolControl({revision:1,policy:{kind:'protocol-leader-ack',allow_unknown_quota:true,max_calls:2,max_estimate_tokens:'40',timeout_ms:1000,expires_at:f.expiry,unit_allocations:[{unit_digest:routingDigest(unit),max_tokens:'80',allocation_revision:allocation.revision}]}});
 return {root,host,config,dependencies,calls,load:dependencies.load,participant,hostDir,expiry:f.expiry,unit,allocation,options,hostFor:id=>createTeamHost(configs[id],dependencies),configFor:id=>configs[id]};
}
