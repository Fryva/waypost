import './env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,writeFileSync,readFileSync,rmSync,statSync,chmodSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {routingDigest} from '../scripts/model-routing.mjs';
import {createPacket} from '../scripts/handoff.mjs';
import {createParticipantHostBinding} from '../scripts/team-host-registry.mjs';
import {createHandoffRoute,validateHandoffRoute,readHandoffRoute,writeHandoffRoute,writePreparedHandoffRoute,handoffAdmissionReadiness,collectHandoffNativePreflight,assertOwnedReadOnlyDescriptor,preflightCurrentPacket} from '../scripts/handoff-prepare.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),now=Date.parse('2026-11-03T00:00:00Z');
function fixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'wp-handoff-prepare-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const owner=join(root,'owner.json'),sender=join(root,'sender.json'),receiver=join(root,'receiver.json'),endpoint=join(root,'endpoint.json'),collector=join(root,'collector.json'),host=join(root,'host.json');
 const descriptor={managed:true,harness:'claude',cwd:root,mode:'read-only'},p={id:'receiver',incarnation:'inc',availability:'ready',credential_hash:sha('r'.repeat(64))};
 p.native_binding={endpoint_file:endpoint,collector_file:collector,collector_id:'collector',descriptor_digest:routingDigest(descriptor)};
 const manifest={protocol:1,team:'team',participant:p.id,incarnation:p.incarnation,authority_root:root,project_root:root,vault_path:root,participant_credential_file:receiver,endpoint_file:endpoint,collector_file:collector,descriptor_digest:routingDigest(descriptor)};
 const json=(path,data)=>writeFileSync(path,JSON.stringify(data),{mode:0o600});
 for(const [path,value]of [[owner,{protocol:1,role:'owner',token:'o'.repeat(64)}],[sender,{protocol:1,role:'participant',participant:'sender',incarnation:'sender-inc',token:'s'.repeat(64)}],[receiver,{protocol:1,role:'participant',participant:'receiver',incarnation:'inc',token:'r'.repeat(64)}],[endpoint,{team:'team',participant:'receiver',descriptor}],[collector,{protocol:1,role:'collector',collector:'collector',token:'c'.repeat(64)}],[host,manifest]])json(path,value);
 p.host_binding=createParticipantHostBinding({hostFile:host,manifest,participant:p});
 const unit={scope:'team-native-counter',team:'team',counter_schema:'claude-native-first-turn-total-v1'},unitDigest=routingDigest(unit);
 const team={id:'team',epoch:0,participants:{receiver:p,sender:{id:'sender',incarnation:'sender-inc',credential_hash:sha('s'.repeat(64))}},accounting:{protocol:2,billing_policy:'inherited-native'},policy:{protocol:2,expires_at:new Date(now+600000).toISOString()},native_delivery_policy:{revision:1,max_calls:2,max_estimate_tokens:'40',timeout_ms:60000,expires_at:new Date(now+300000).toISOString(),unit_allocations:[{unit_digest:unitDigest,max_tokens:'80'}]}};
 const state={owner_hash:sha('o'.repeat(64)),teams:{team},collectors:{collector:{id:'collector',team:'team',credential_hash:sha('c'.repeat(64)),purposes:['runtime','usage']}},subscription_allocations:{[unitDigest]:{protocol:2,unit_scope:unit,max_tokens:'100',revision:1}}};
 const context={state,authorityRoot:root,projectRoot:root,vaultPath:root},input={...context,team:'team',sender:'sender',receiver:'receiver',senderCredential:sender,ownerCredential:owner},check=()=>handoffAdmissionReadiness({state,team:'team',participant:'receiver',descriptor,estimateTokens:'30',now});
 return {root,state,team,p,descriptor,unitDigest,owner,sender,receiver,endpoint,collector,host,context,input,json,check};
}
test('route contains registered references only and publishes an exclusive private file without new state',t=>{
 const f=fixture(t),before=structuredClone(f.state),route=createHandoffRoute(f.input),output=join(f.root,'route.json');
 assert.deepEqual(Object.keys(route).sort(),['collector_credential','endpoint','owner_credential','receiver','receiver_credential','sender','sender_credential','team']);
 writeHandoffRoute(output,route);assert.deepEqual(readHandoffRoute(output,f.context),route);assert.deepEqual(f.state,before);
 assert.equal(readFileSync(output,'utf8').includes('r'.repeat(64)),false);assert.throws(()=>writeHandoffRoute(output,route),/EEXIST/);
 if(process.platform!=='win32')assert.equal(statSync(output).mode&0o777,0o600);
});
test('route rejects foreign credentials, mismatched registered paths and revoked receiver',t=>{
 const f=fixture(t),route=createHandoffRoute(f.input);
 assert.throws(()=>validateHandoffRoute({...route,receiver_credential:f.sender},f.context),/registered-route-mismatch/);
 assert.throws(()=>createHandoffRoute({...f.input,sender:'receiver'}),/distinct-participants/);
 f.json(f.owner,{protocol:1,role:'owner',token:'z'.repeat(64)});assert.throws(()=>createHandoffRoute(f.input),/invalid-participant-credential|route-credential-binding/);
 f.json(f.owner,{protocol:1,role:'owner',token:'o'.repeat(64)});f.p.revoked=true;assert.throws(()=>createHandoffRoute(f.input),/participant-binding-mismatch/);
});
test('private credential references reject public mode and symlinks',t=>{
 const f=fixture(t);if(process.platform!=='win32'){chmodSync(f.sender,0o644);assert.throws(()=>createHandoffRoute(f.input),/private-file-required/);chmodSync(f.sender,0o600);}
 const alias=join(f.root,'alias.json');symlinkSync(f.sender,alias);assert.throws(()=>createHandoffRoute({...f.input,senderCredential:alias}),/private-file-required/);
});
test('static readiness checks allocation, calls, expiry and uncertainty without mutating admission',t=>{
 const f=fixture(t),before=structuredClone(f.state);assert.equal(f.check().ready,true);assert.deepEqual(f.state,before);
 f.state.subscription_invocations={old:{team:'team',unit_digest:f.unitDigest,purpose:'delivery',delivery_policy_revision:1,state:'settled',charged_tokens:'60'},pending:{team:'team',unit_digest:f.unitDigest,purpose:'delivery',delivery_policy_revision:1,state:'uncertain',estimate_tokens:'30'}};
 const bad=f.check();for(const code of ['handoff-preflight-uncertain-usage','handoff-preflight-allocation-exceeded','delivery-owner-call-ceiling-exceeded','delivery-owner-token-ceiling-exceeded'])assert.ok(bad.blockers.includes(code));
 f.team.native_delivery_policy.expires_at=new Date(now-1).toISOString();assert.ok(f.check().blockers.includes('native-delivery-owner-ceiling-required'));
});
test('unknown historical charges block readiness and never become zero spend',t=>{
 const f=fixture(t);f.state.subscription_invocations={lost:{unit_digest:f.unitDigest,state:'settled'}};assert.ok(f.check().blockers.includes('handoff-preflight-accounting-unknown'));assert.equal(f.check().allocation.actual_tokens,null);
});
test('absolute Claude executable requires supported version while existing named routes remain valid',()=>{
 const d={harness:'claude',mode:'read-only',executable:join(realpathSync(tmpdir()),'claude')};let calls=0;
 assertOwnedReadOnlyDescriptor(d,()=>{calls++;return {verified:true};});assert.equal(calls,1);
 assert.throws(()=>assertOwnedReadOnlyDescriptor(d,()=>({verified:false})),/native-claude-preflight-version-unverified/);
 assert.throws(()=>assertOwnedReadOnlyDescriptor({...d,harness:'opencode'},()=>({verified:true})),/verified-read-only-adapter/);
 assert.throws(()=>assertOwnedReadOnlyDescriptor({...d,mode:'workspace-write'},()=>({verified:true})),/verified-read-only-adapter/);
 assertOwnedReadOnlyDescriptor({harness:'claude',mode:'read-only'});
});
function nativeFixture(change={}){
 const calls=[],endpoint={owns_process:true,usage_counter_schema:'claude-native-first-turn-total-v1',native_id:'native',async inspectContext(){calls.push('inspect');return {verified:true};},async captureAccountingMetadata(){calls.push('metadata');return {consistent:true,mode:'unknown',paid_fallback:'unknown',auth_method:null};},async send(){throw new Error('MODEL CALL FORBIDDEN');},async stopAndWait(){calls.push('stop');return {stopped:true};},...change};
 return {calls,endpoint,options:{descriptor:{harness:'claude'},create:async()=>{calls.push('create');return endpoint;},versionStatus:()=>({version:'2.1.296',verified:true,blocker:null})}};
}
test('metadata preflight makes zero sends, closes before publication and never grants reusable proof',async()=>{
 const f=nativeFixture(),result=await collectHandoffNativePreflight(f.options);assert.deepEqual(f.calls,['create','inspect','metadata','stop']);assert.equal(result.ready,true);assert.equal(result.native.authentication,'unknown');assert.equal(result.native.billing_mode,'unknown');assert.equal(result.native.closed,true);assert.equal(result.proof_reusable,false);assert.equal(result.model_requests,0);
});
test('missing login/isolation, observation failure and unconfirmed closure remain explicit blockers',async()=>{
 for(const change of [{inspectContext:async()=>({verified:false,blocker:'native-claude-first-party-subscription-route-unverified'})},{captureAccountingMetadata:async()=>{throw new Error('PRIVATE secret');}},{stopAndWait:async()=>({stopped:false})}]){
  const f=nativeFixture(change),result=await collectHandoffNativePreflight(f.options);assert.equal(result.ready,false);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(result.model_requests,0);
 }
 const f=nativeFixture(),result=await collectHandoffNativePreflight({...f.options,versionStatus:()=>({version:'999.0.0',verified:false,blocker:'native-claude-preflight-version-unverified'})});assert.ok(result.blockers.includes('native-claude-preflight-version-unverified'));
});


test('forming protocol-1 policy bootstrap keeps existing delivery readiness under accounting protocol 2',t=>{
 const f=fixture(t);f.team.policy.protocol=1;f.team.status='forming';f.team.native_policy_bootstrap=true;
 assert.equal(f.check().ready,true);assert.equal(f.state.subscription_invocations,undefined);
});
test('descriptor timeout including the native 60000 default must fit owner delivery policy',t=>{
 const f=fixture(t);f.team.native_delivery_policy.timeout_ms=59999;
 assert.ok(f.check().blockers.includes('handoff-preflight-timeout-exceeds-owner-ceiling'));
 f.descriptor.timeout_ms=1000;assert.equal(f.check().ready,true);
 f.descriptor.timeout_ms=60001;assert.ok(f.check().blockers.includes('handoff-preflight-timeout-exceeds-owner-ceiling'));
});
test('metadata preflight retries one inconsistent initialization observation without inference',async()=>{
 let reads=0;const f=nativeFixture({captureAccountingMetadata:async()=>({consistent:++reads>1,mode:'unknown'})}),result=await collectHandoffNativePreflight(f.options);
 assert.equal(reads,2);assert.equal(result.ready,true);assert.equal(result.model_requests,0);assert.equal(result.native.closed,true);
 reads=0;const g=nativeFixture({captureAccountingMetadata:async()=>{reads++;return {consistent:false};}}),bad=await collectHandoffNativePreflight(g.options);
 assert.equal(reads,2);assert.equal(bad.ready,false);assert.ok(bad.blockers.includes('handoff-preflight-billing-observation-inconsistent'));assert.equal(bad.native.closed,true);
});
test('stale or unchecked packets never invoke receiver preflight or launch native processes',()=>{
 let launches=0;for(const snapshot_matches of [false,null]){const result=preflightCurrentPacket({snapshot_matches},()=>{launches++;assert.fail('stale packet launched receiver');});assert.equal(result.ready,false);assert.equal(result.skipped,'packet-not-current');assert.equal(result.model_requests,0);}
 assert.equal(launches,0);const marker={ready:true};assert.equal(preflightCurrentPacket({snapshot_matches:true},()=>{launches++;return marker;}),marker);assert.equal(launches,1);
});


test('route publication canonicalizes parent aliases before missing-reference collision checks and writes nothing on refusal',t=>{
 const f=fixture(t),alias=join(f.root,'alias');symlinkSync(f.root,alias,process.platform==='win32'?'junction':'dir');
 const packet=createPacket(f.root,{goal:'Continue',next_step:'Read evidence',files:['missing','future/child']});f.json(join(f.root,'packet.json'),packet);
 const route=createHandoffRoute(f.input),prepared={root:f.root,packetPath:'packet.json'};
 for(const name of ['missing','future']){
  assert.throws(()=>writePreparedHandoffRoute(join(alias,name),route,prepared),/state-collision/);
  assert.equal(existsSync(join(f.root,name)),false);
 }
 const output=writePreparedHandoffRoute(join(alias,'route.json'),route,prepared);
 assert.equal(output,join(f.root,'route.json'));assert.deepEqual(readHandoffRoute(output,f.context),route);
});
test('ordinary temporary-directory aliases publish canonical private route paths',t=>{
 const f=fixture(t),packet=createPacket(f.root,{goal:'Continue',next_step:'Read',files:['uncreated']});f.json(join(f.root,'packet.json'),packet);
 const path=join(tmpdir(),f.root.split(/[\\/]/).at(-1),'route.json'),output=writePreparedHandoffRoute(path,createHandoffRoute(f.input),{root:f.root,packetPath:'packet.json'});
 assert.equal(output,join(f.root,'route.json'));assert.deepEqual(readHandoffRoute(output,f.context),createHandoffRoute(f.input));
 if(process.platform!=='win32')assert.equal(statSync(output).mode&0o777,0o600);
});
