// Explicit route references and nonbillable preparation. No authority is minted.
import {createHash} from 'node:crypto';
import {openSync,closeSync,writeFileSync,readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,isAbsolute,dirname,basename,join} from 'node:path';
import {authorizeActor} from './team-state.mjs';
import {readParticipantHost} from './team-host-registry.mjs';
import {routingDigest} from './model-routing.mjs';
import {nativeVersionStatus} from './team-transport.mjs';
import {CODEX_SURFACE_R1} from './codex-surface.mjs';
import {CODEX_EVALUATION_SURFACE} from './codex-evaluation-surface.mjs';
import {nativeQuotaEligible} from './team-native-quota.mjs';
import {assertDeliveryDestination} from './handoff-delivery.mjs';
const fail=code=>{throw new Error(code);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const decimal=value=>{if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,17})$/.test(value))fail('handoff-preflight-token-count');return BigInt(value);};
const routeFields=['team','sender','receiver','sender_credential','receiver_credential','owner_credential','collector_credential','endpoint'];
function privateJSON(path){
 path=resolve(path);const st=lstatSync(path);
 if(!st.isFile()||st.size>16384||realpathSync(path)!==path||process.platform!=='win32'&&(st.mode&0o077))fail('handoff-prepare-private-file-required');
 let value;try{value=JSON.parse(readFileSync(path,'utf8'));}catch{fail('handoff-prepare-json');}return value;
}
function credential(path,role){const c=privateJSON(path);if(c?.protocol!==1||c.role!==role||typeof c.token!=='string'||c.token.length<32||c.token.length>1024)fail('handoff-prepare-credential-required');return {...c,token_hash:sha(c.token)};}
export function createHandoffRoute({state,team,sender,receiver,senderCredential,ownerCredential,authorityRoot,projectRoot,vaultPath}){
 if(sender===receiver)fail('handoff-prepare-distinct-participants-required');
 const owner=credential(ownerCredential,'owner'),from=credential(senderCredential,'participant');
 if(authorizeActor(state,team,owner)!=='owner:'+state.owner_hash||authorizeActor(state,team,from)!==sender)fail('handoff-prepare-route-credential-binding');
 const {manifest:m}=readParticipantHost({state,teamId:team,participantId:receiver,authorityRoot,projectRoot,vaultPath});
 return {team,sender,receiver,sender_credential:resolve(senderCredential),receiver_credential:m.participant_credential_file,owner_credential:resolve(ownerCredential),collector_credential:m.collector_file,endpoint:m.endpoint_file};
}
export function validateHandoffRoute(value,context){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==routeFields.length||routeFields.some(k=>typeof value[k]!=='string'||!value[k]||value[k].length>4096||/[\x00-\x1f\x7f]/.test(value[k])))fail('handoff-prepare-route');
 const actual=createHandoffRoute({...context,team:value.team,sender:value.sender,receiver:value.receiver,senderCredential:value.sender_credential,ownerCredential:value.owner_credential});
 if(routeFields.some(k=>value[k]!==actual[k]))fail('handoff-prepare-registered-route-mismatch');return actual;
}
export function readHandoffRoute(path,context){return validateHandoffRoute(privateJSON(path),context);}
export function writeHandoffRoute(path,route){const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,JSON.stringify(route,null,2)+'\n');}finally{closeSync(fd);}}
export function writePreparedHandoffRoute(path,route,prepared){
 const absolute=resolve(path),output=join(realpathSync(dirname(absolute)),basename(absolute));
 assertDeliveryDestination(prepared,output);writeHandoffRoute(output,route);return output;
}

// Preserve existing Codex surfaces and OpenCode ownership checks. An absolute
// Claude path additionally proves the installed pinned version before launch.
export function assertOwnedReadOnlyDescriptor(d,status=nativeVersionStatus){
 const named=!d.executable||['codex','claude','opencode'].includes(d.executable),surface=[CODEX_SURFACE_R1.id,CODEX_EVALUATION_SURFACE.id].includes(d.tool_surface);
 if(d.mode==='workspace-write')fail('host-owned-supervision-verified-read-only-adapter-required');
 if(named||surface)return;
 if(d.harness==='claude'&&isAbsolute(d.executable)){if(status(d).verified===true)return;fail('native-claude-preflight-version-unverified');}
 fail('host-owned-supervision-verified-read-only-adapter-required');
}
export function handoffAdmissionReadiness({state,team,participant,descriptor,estimateTokens='16000',now=Date.now()}){
 const t=state.teams?.[team],p=t?.participants?.[participant],blockers=[];
 const missing=(condition,code)=>{if(!condition)blockers.push(code);};
 const estimate=decimal(estimateTokens);missing(estimate>0n,'handoff-preflight-positive-estimate-required');
 missing(t?.accounting?.protocol===2&&t.accounting.billing_policy==='inherited-native','subscription-v2-inherited-native-required');
 missing(p&&!p.revoked&&p.availability!=='left','handoff-preflight-current-receiver-required');
 missing(p?.quota_observation?.status!=='exhausted','subscription-quota-exhausted');
 const collector=p&&state.collectors?.[p.native_binding?.collector_id];missing(collector&&!collector.revoked&&collector.team===team&&['runtime','usage'].every(purpose=>collector.purposes?.includes(purpose)),'subscription-bound-collector-required');
 missing(Date.parse(t?.policy?.expires_at)>now,'handoff-preflight-current-team-policy-required');
 missing(descriptor.mode==='read-only'&&(descriptor.harness!=='codex'||descriptor.tool_surface===CODEX_SURFACE_R1.id)&&(descriptor.harness!=='opencode'||descriptor.spawn_server===true),'host-delivery-owned-no-tools-context-required');
 const policy=t?.native_delivery_policy;missing(policy&&Date.parse(policy.expires_at)>now&&Date.parse(policy.expires_at)<=Date.parse(t?.policy?.expires_at),'native-delivery-owner-ceiling-required');
 if(policy)missing(Number.isSafeInteger(policy.timeout_ms)&&(descriptor.timeout_ms??60000)<=policy.timeout_ms,'handoff-preflight-timeout-exceeds-owner-ceiling');
 const schemas={codex:'codex-thread-cumulative-total-v1',claude:'claude-native-first-turn-total-v1',opencode:'opencode-native-normalized-step-total-v1'},unitDigest=routingDigest({scope:'team-native-counter',team,counter_schema:schemas[descriptor.harness]??'unknown'}),allocation=state.subscription_allocations?.[unitDigest];
 missing(allocation?.protocol===2,'handoff-preflight-allocation-required');
 let actual=0n,reserved=0n,calls=0,deliveryTokens=0n,accountingKnown=true;
 try{
  for(const x of Object.values(state.subscription_invocations||{})){
   if(x.unit_digest===unitDigest&&x.state!=='aborted'){
    if(['settled','reconciled'].includes(x.state))actual+=decimal(x.charged_tokens);else reserved+=decimal(x.estimate_tokens);
    missing(!['consumed','uncertain'].includes(x.state)&&!(x.state==='reconciled'&&x.unknown_usage_accepted!==true),'handoff-preflight-uncertain-usage');
    missing(x.overshoot_allocation_revision===undefined||(allocation?.revision??0)>x.overshoot_allocation_revision,'handoff-preflight-allocation-overshoot');
   }
   if(x.team===team&&x.purpose==='delivery'&&x.delivery_policy_revision===policy?.revision&&x.state!=='aborted'){
    calls++;if(x.unit_digest===unitDigest)deliveryTokens+=decimal(['settled','reconciled'].includes(x.state)?x.charged_tokens:x.estimate_tokens);
   }
  }
  if(allocation)missing(actual+reserved+estimate<=decimal(allocation.max_tokens),'handoff-preflight-allocation-exceeded');
  if(policy){
   missing(Number.isSafeInteger(policy.max_calls)&&calls<policy.max_calls,'delivery-owner-call-ceiling-exceeded');
   missing(estimate<=decimal(policy.max_estimate_tokens),'handoff-preflight-estimate-exceeds-owner-ceiling');
   const limit=policy.unit_allocations?.find(u=>u.unit_digest===unitDigest);missing(Boolean(limit),'delivery-unit-allocation-required');
   if(limit)missing(deliveryTokens+estimate<=decimal(limit.max_tokens),'delivery-owner-token-ceiling-exceeded');
  }
 }catch{accountingKnown=false;blockers.push('handoff-preflight-accounting-unknown');}
 if(t&&p)missing(nativeQuotaEligible(t,p,now),'delivery-quota-ineligible');
 return {ready:blockers.length===0,blockers:[...new Set(blockers)],unit_digest:unitDigest,estimate_tokens:estimateTokens,allocation:allocation?{max_tokens:allocation.max_tokens,actual_tokens:accountingKnown?String(actual):null,reserved_tokens:accountingKnown?String(reserved):null}:null,owner_ceiling:policy?{max_calls:policy.max_calls,used_calls:calls,max_estimate_tokens:policy.max_estimate_tokens,expires_at:policy.expires_at}:null};
}
// The transport is launched by the Host's owned runtime. Never calls send().
// Inspection evidence is descriptive and is never retained as a launch permit.
export async function collectHandoffNativePreflight({descriptor,create,versionStatus=nativeVersionStatus}){
 const blockers=[];let transport,inspection=null,metadata=null,closure=null,version=versionStatus(descriptor);
 try{
  transport=await create(descriptor);
  if(transport.owns_process!==true||typeof transport.stopAndWait!=='function')fail('handoff-preflight-owned-closure-required');
  const schema={claude:'claude-native-first-turn-total-v1',codex:'codex-thread-cumulative-total-v1',opencode:'opencode-native-normalized-step-total-v1'}[descriptor.harness];
  if(transport.usage_counter_schema!==schema)blockers.push('host-subscription-bootstrap-counter-adapter-unsupported');
  inspection=await transport.inspectContext();
  if(inspection?.verified!==true)blockers.push(inspection?.blocker||'handoff-preflight-isolation-unverified');
  metadata=await transport.captureAccountingMetadata();
  if(metadata?.consistent===false)metadata=await transport.captureAccountingMetadata();
  if(metadata?.consistent!==true)blockers.push('handoff-preflight-billing-observation-inconsistent');
 }catch(error){blockers.push(/^[a-z][a-z0-9-]{1,127}$/.test(error.code||error.message||'')?(error.code||error.message):'handoff-preflight-native-observation-failed');}
 finally{
  if(transport)try{if(typeof transport.stopAndWait!=='function')fail('handoff-preflight-owned-closure-required');closure=await transport.stopAndWait();if(closure?.stopped!==true)fail('handoff-preflight-native-stop-unconfirmed');}catch{blockers.push('handoff-preflight-native-stop-unconfirmed');}
 }
 if(descriptor.harness==='claude'&&version.verified!==true)blockers.push(version.blocker||'native-claude-preflight-version-unverified');
 return {ready:blockers.length===0,blockers:[...new Set(blockers)],native:{harness:descriptor.harness,version:version.version,version_verified:version.verified,isolation_verified:inspection?.verified===true,authentication:metadata?.auth_method??'unknown',billing_mode:metadata?.mode??'unknown',paid_fallback:metadata?.paid_fallback??'unknown',closed:closure?.stopped===true},proof_reusable:false,model_requests:0};
}

// A stale snapshot cannot benefit from inspecting or launching its receiver.
export function preflightCurrentPacket(inspection,inspectNative){
 return inspection.snapshot_matches===true?inspectNative():{ready:false,blockers:['handoff-delivery-stale'],native:null,skipped:'packet-not-current',proof_reusable:false,model_requests:0};
}
