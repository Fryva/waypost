// Integration regression: real immutable authority, real Git, only native I/O mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readAuthority, mutateAuthority, recoverLock } from '../scripts/team-store.mjs';
import { reduceTeamEvent, authorizeActor } from '../scripts/team-state.mjs';
import { createTeamHost } from '../scripts/team-host.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';
import { collectRuntimeEvidence, collectTaskQualification, collectBillingEvidence, assembleRoutingEvidence, createRoutingGrant, createControlGrant, TASK_CLASS_SUITE, TASK_CLASS_CRITERIA_DIGEST } from '../scripts/team-evidence.mjs';
import { publishCandidate } from '../scripts/team-integration.mjs';
import { coordinationDirs } from '../scripts/presence.mjs';
import { withTeamArtifactGate, withTeamCommitGate } from '../scripts/team-legacy.mjs';
const cli=fileURLToPath(new URL('../bin/waypost',import.meta.url));
const commitCli=fileURLToPath(new URL('../scripts/commit.mjs',import.meta.url));
function legacyCommit(root,...args){return spawnSync(process.execPath,[commitCli,'-m','Legacy fixture commit','--no-reconcile',...args],{cwd:root,encoding:'utf8',env:{...process.env,WAYPOST_PROJECT_DIR:root,WAYPOST_NO_BEAT:'1'}});}
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
function git(root,...args){const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
async function fixture(t,{publicationFault}={}) {
 const root=realpathSync(mkdtempSync(join(tmpdir(),'wp-team-e2e-'))),vault=join(root,'vault');
 const previous=process.env.WAYPOST_PROJECT_DIR;process.env.WAYPOST_PROJECT_DIR=root;
 t.after(()=>{if(previous===undefined)delete process.env.WAYPOST_PROJECT_DIR;else process.env.WAYPOST_PROJECT_DIR=previous;rmSync(root,{recursive:true,force:true});});
 mkdirSync(vault);mkdirSync(join(root,'.waypost'));
 writeFileSync(join(root,'.waypost','projectstore.json'),JSON.stringify({vault_path:'vault',language:'en',layout:'engineering'}));
 writeFileSync(join(root,'.gitignore'),'/.waypost/\n/vault/.projectstore/\n');
 writeFileSync(join(vault,'task.md'),'---\ntype: epic\nid: fixture-task\ntitle: End-to-end fixture\nstatus: planned\n---\n');
 writeFileSync(join(root,'a.txt'),'base\n');writeFileSync(join(root,'other.txt'),'base\n');
 const reconciled=spawnSync(process.execPath,[cli,'reconcile','--write'],{cwd:root,encoding:'utf8',env:{...process.env,WAYPOST_NO_BEAT:'1'}});assert.equal(reconciled.status,0,reconciled.stderr||reconciled.stdout);
 git(root,'init','-q');git(root,'config','user.name','Fixture');git(root,'config','user.email','fixture@example.com');git(root,'add','.');git(root,'commit','-qm','base');
 const base=git(root,'rev-parse','HEAD'),authorityRoot=join(coordinationDirs(vault).primary,'teams','authority');
 const owner={protocol:1,role:'owner',token:'o'.repeat(64)};owner.token_hash=hash(owner.token);const ownerPath=join(root,'.waypost','owner.json');writeFileSync(ownerPath,JSON.stringify(owner),{mode:0o600});
 const load=()=>readAuthority(authorityRoot,reduceTeamEvent);
 const command=(type,extra={},cred=owner,key=randomUUID())=>{
  const v=load(),team=v.state?.teams.team,actor=authorizeActor(v.state,'team',cred);
  const c={...extra,type,team:'team',actor,incarnation:cred.incarnation||null,epoch:team?.epoch||0,request_key:key,at:new Date().toISOString()};
  return mutateAuthority(authorityRoot,{key,actor,expected_revision:v.revision,command:c},reduceTeamEvent,{confirmedLocal:true,authorize:s=>assert.equal(authorizeActor(s,'team',cred),actor)});
 };
 const now=new Date().toISOString(),policy={protocol:1,mode:'manual',revision:1,domain:'coding',approved_by:'fixture',approved_at:now,profiles:[['strong',3],['weak',1]].map(([model_id,n])=>({provider:'fixture',model_id,reasoning:'none',priorities:{coordinate:n,implement:n,review:n},source:'fixture',date:now.slice(0,10)}))};
 command('create',{owner_hash:owner.token_hash,task:'task.md',policy});
 const credentials={},paths={};
 for(const name of ['leader','worker','reviewer']){
  const token=name.padEnd(64,'x'),credential={protocol:1,role:'participant',token,token_hash:hash(token),participant:name,incarnation:name+'-inc'};credentials[name]=credential;paths[name]=join(root,'.waypost',name+'.json');writeFileSync(paths[name],JSON.stringify(credential),{mode:0o600});
  command('join',{participant:{id:name,incarnation:name+'-inc',session:'session-'+name,harness:'codex',root,availability:'ready',credential_hash:credential.token_hash,model:{provider:'fixture',model_id:name==='worker'?'weak':'strong',reasoning:'none',model_revision:1,resolved:true,evidence:{kind:'adapter-observed',source:'native-fixture',observed_at:now}}}});
 }
 command('leader-ack',{},credentials.leader);
 let verdict='changes-requested',nativeCalls=[];
 const createNativeEndpoint=async descriptor=>{
  const native_id='native-'+randomUUID(),model_id=descriptor.model_id;
  return {native_id,async send(prompt,invocation){
   // Native boundary observes the already accepted consume transition.
   const state=load().state.teams.team;
   if(invocation.purpose==='runtime-inspection')assert.equal(state.runtime_requests[invocation.id].consumed,true);
   else if(invocation.purpose==='independent-review')assert.equal(state.review_requests[invocation.id].consumed,true);
   nativeCalls.push({purpose:invocation.purpose,native_id});
   const output=invocation.purpose==='runtime-inspection'?invocation.id:JSON.stringify({verdict,findings:verdict==='approve'?[]:[{path:'a.txt',message:'Replace rejected candidate with accepted content.'}]});
   return {native_id,output,text:output,actualModel:{provider:'fixture',model_id,reasoning:'none'},context_manifest:{id:native_id,native_id,fresh:true,read_only:true,author_history_inherited:false,author_contexts:[],tools:[],provenance:'adapter-isolated',fresh_review_verified:true,initial_instructions_digest:hash('fixture isolated instructions')}};
  },close(){}};
 };
 const collectorPath=join(root,'.waypost','collector.json'),endpointPaths={leader:join(root,'.waypost','endpoint-leader.json'),worker:join(root,'.waypost','endpoint-worker.json'),reviewer:join(root,'.waypost','endpoint-reviewer.json')};
 const host=(name,extraDependencies={})=>createTeamHost({authorityRoot,projectRoot:root,vaultPath:vault,team:'team',ownerCredential:ownerPath,collectorPath,endpointPath:endpointPaths[name],participant:name,participantCredential:paths.leader,leaderEndpointPath:endpointPaths.leader,dispatcher:cli},{createNativeEndpoint,...extraDependencies});
 for(const name of ['leader','worker','reviewer'])await host(name).bootstrap({participant:name,descriptor:{managed:true,harness:'codex',cwd:root,mode:'read-only',model_id:name==='worker'?'weak':'strong'}});
 const protectedCommand=async(type,extra={},name='leader')=>{
  const key=randomUUID(),team=load().state.teams.team,p=team.participants[name];
  await host(name).inspect({action:[type,'team',name,p.incarnation,p.model.model_revision,team.policy.revision,key].join(':')});
  return command(type,extra,credentials[name],key);
 };
 const workPaths=['a.txt',...git(root,'ls-files','vault').split('\n').filter(Boolean)];
 async function assign(){await protectedCommand('assign',{work:{id:'work',worker:'worker',base,paths:workPaths,goal:'Replace a bounded text fixture',criteria:['a.txt contains accepted'],criteria_digest:hash(['a.txt contains accepted']),dependencies:[]}});command('work-ack',{work_id:'work'},credentials.worker);}
 async function supervise(){const target_digest=load().state.teams.team.work.work.result.target_digest;await protectedCommand('supervise',{work_id:'work',target_digest,findings:[]});}
 return {root,vault,base,authorityRoot,load,command,host,assign,supervise,protectedCommand,credentials,paths,ownerPath,collectorPath,endpointPaths,nativeCalls,setVerdict:v=>{verdict=v;},publicationFault};
}
async function reviewedFixture(t,options={}) {
 const f=await fixture(t,options);await f.assign();const checkout=f.host('leader').checkout({workId:'work'});
 writeFileSync(join(checkout.path,'a.txt'),'rejected\n');f.host('leader').candidate({workId:'work'});await f.supervise();
 await f.host('reviewer').review({workId:'work',nonce:'negative-review'});
 assert.equal(f.load().state.teams.team.work.work.status,'changes-requested');
 await f.protectedCommand('revise-work-v1',{work_id:'work',findings_resolution:[{finding:'negative-review',resolution:'Replace content'}]});
 f.command('work-ack',{work_id:'work'},f.credentials.worker);
 writeFileSync(join(checkout.path,'a.txt'),'accepted\n');f.host('leader').candidate({workId:'work'});await f.supervise();
 f.setVerdict('approve');await f.host('reviewer').review({workId:'work',nonce:'positive-review'});
 assert.equal(f.load().state.teams.team.work.work.status,'reviewed');assert.equal(f.load().state.teams.team.work.work.generation,2);
 return {...f,checkout};
}
test('negative review cannot be erased by collector recapture without explicit generation revision',async t=>{
 const f=await fixture(t);await f.assign();const checkout=f.host('leader').checkout({workId:'work'});
 writeFileSync(join(checkout.path,'a.txt'),'rejected\n');f.host('leader').candidate({workId:'work'});await f.supervise();
 await f.host('reviewer').review({workId:'work',nonce:'retained-negative'});
 const before=f.load(),work=before.state.teams.team.work.work;assert.equal(work.status,'changes-requested');
 const collector=JSON.parse(readFileSync(f.collectorPath,'utf8'));collector.token_hash=hash(collector.token);
 assert.throws(()=>f.command('material-capture-v1',{work_id:'work',generation:work.generation,evidence:work.result},collector),/invalid-material-capture/);
 const after=f.load();assert.equal(after.revision,before.revision);assert.deepEqual(after.state.teams.team.work.work,work);
 assert.equal(after.state.teams.team.work.work.reviews[0].nonce,'retained-negative');
 await f.protectedCommand('revise-work-v1',{work_id:'work',findings_resolution:[{finding:'retained-negative',resolution:'Replace content'}]});
 const revised=f.load().state.teams.team.work.work;assert.equal(revised.generation,work.generation+1);assert.equal(revised.status,'assigned');
});
const publishArgs={workId:'work',message:'Integrate independently reviewed fixture',trailers:{Harness:'codex',Session:'session-leader',Provider:'fixture',Story:'fixture/story',Contributors:'worker,leader,reviewer'},commitIdentity:{name:'Fixture',email:'fixture@example.com',date:'1790812800 +0000'}};

test('real authority and Git carry negative review through revised generation to recovered publication and legacy close',async t=>{
 const f=await reviewedFixture(t);
 assert.throws(()=>withTeamArtifactGate(f.vault,join(f.vault,'task.md'),'close',()=>true),/team-bound-artifact/);
 writeFileSync(join(f.root,'other.txt'),'unrelated staged content\n');git(f.root,'add','other.txt');const originalIndex=git(f.root,'write-tree');
 let committed;
 const publishing=f.host('leader',{integration:{publishCandidate:args=>publishCandidate({...args,fault:(stage,commit)=>{if(stage==='after-ref'){committed=commit;throw new Error('crash after publication');}}})}});
 await assert.rejects(publishing.publish(publishArgs),/crash after publication/);
 assert.equal(f.load().state.publication_fence.team,'team');assert.equal(f.load().state.teams.team.work.work.status,'reviewed');
 const blockedLegacy=legacyCommit(f.root,'--force');assert.notEqual(blockedLegacy.status,0);assert.match(blockedLegacy.stderr,/team-publication-fence-blocks-legacy-commit/);assert.equal(git(f.root,'write-tree'),originalIndex);
 assert.throws(()=>f.host('leader').recoverPublication(),/child-stop-proof/);
 const recovered=f.host('leader').recoverPublication({gitChildStopped:true});assert.equal(recovered.result.commit,committed);
 assert.equal(f.load().state.publication_fence,undefined);assert.equal(f.load().state.teams.team.work.work.status,'integrated');
 assert.equal(git(f.root,'rev-parse','HEAD'),f.base);assert.equal(git(f.root,'write-tree'),originalIndex);assert.equal(git(f.checkout.path,'show',committed+':a.txt'),'accepted');
 assert.equal(git(f.checkout.path,'diff','--cached','--name-only'),'');
 assert.match(git(f.checkout.path,'show','-s','--format=%B',committed),/Waypost-Review: positive-review/);
 assert.equal(f.command('close-v1').result.closed,'team');assert.equal(withTeamArtifactGate(f.vault,join(f.vault,'task.md'),'close',()=>true),true);
 const replay=f.load();assert.equal(replay.state.teams.team.status,'closed');assert.ok(replay.revision>40);assert.equal(replay.state.teams.team.work.work.integrated_evidence.review,'positive-review');
});

test('unchanged publication ref requires stopped proof and aborts fence without duplicate Git publication',async t=>{
 const f=await reviewedFixture(t);let proposed;
 const publishing=f.host('leader',{integration:{publishCandidate:args=>publishCandidate({...args,fault:(stage,commit)=>{if(stage==='before-ref'){proposed=commit;throw new Error('crash before ref');}}})}});
 await assert.rejects(publishing.publish(publishArgs),/crash before ref/);
 assert.equal(git(f.checkout.path,'rev-parse','HEAD'),f.base);assert.throws(()=>f.host('leader').recoverPublication(),/child-stop-proof/);
 const recovered=f.host('leader').recoverPublication({gitChildStopped:true});assert.ok(recovered.result.aborted);assert.equal(f.load().state.publication_fence,undefined);
 assert.equal(f.load().state.teams.team.work.work.status,'reviewed');assert.equal(f.load().state.teams.team.integration.state,'aborted');
 assert.equal(git(f.checkout.path,'cat-file','-t',proposed),'commit');assert.equal(git(f.root,'rev-parse','HEAD'),f.base);
});


test('legacy no-story commit permits unrelated files but cannot force team-owned scope or bound artifact',async t=>{
 const f=await fixture(t);await f.assign();const owned=f.host('leader').checkout({workId:'work'});
 const ownedHead=git(owned.path,'rev-parse','HEAD'),ownedIndex=git(owned.path,'write-tree');
 writeFileSync(join(f.root,'other.txt'),'legitimate unrelated change\n');git(f.root,'add','other.txt');
 const permitted=legacyCommit(f.root);assert.equal(permitted.status,0,permitted.stderr||permitted.stdout);
 const permittedHead=git(f.root,'rev-parse','HEAD');assert.notEqual(permittedHead,f.base);
 assert.equal(git(f.root,'show','HEAD:other.txt'),'legitimate unrelated change');
 assert.equal(git(owned.path,'rev-parse','HEAD'),ownedHead);assert.equal(git(owned.path,'write-tree'),ownedIndex);
 writeFileSync(join(f.root,'a.txt'),'unreviewed overlapping change\n');git(f.root,'add','a.txt');const stagedIntent=git(f.root,'write-tree');
 const rejected=legacyCommit(f.root,'--force');assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/team-work-scope-use-protected-integration/);
 assert.equal(git(f.root,'rev-parse','HEAD'),permittedHead);assert.equal(git(f.root,'write-tree'),stagedIntent);
 let invoked=false;
 assert.throws(()=>withTeamCommitGate(f.vault,['vault/task.md'],()=>{invoked=true;}),/team-bound-artifact-use-team-workflow/);assert.equal(invoked,false);
 assert.throws(()=>withTeamCommitGate(f.vault,['../outside'],()=>{invoked=true;}),/team-commit-path-outside-project/);assert.equal(invoked,false);
});

test('legacy rename cannot move an active team path outside its guarded scope',async t=>{
 const f=await fixture(t);await f.assign();git(f.root,'mv','a.txt','renamed.txt');const intent=git(f.root,'write-tree');
 const rejected=legacyCommit(f.root,'--force');assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/team-work-scope-use-protected-integration/);
 assert.equal(git(f.root,'rev-parse','HEAD'),f.base);assert.equal(git(f.root,'write-tree'),intent);
});

async function strictFixture(t) {
 const f=await fixture(t),criteria=['a.txt contains accepted'],manifest={protocol:1,goal:'Replace bounded text',base:f.base,domain:'coding',task_class:TASK_CLASS_SUITE.task_class,criteria_digest:routingDigest(criteria),paths:['a.txt'],tools:[],isolation:'read-only',input_tokens:1000,output_tokens:1000,attempts:2,budget:{currency:'fixture-micro',max_units:'820',reserved_control_units:'800'},capability:{benchmark:TASK_CLASS_SUITE.benchmark,revision:TASK_CLASS_SUITE.revision,criteria_digest:TASK_CLASS_CRITERIA_DIGEST,min_passes:8},safety:{bounded:true,reversible:true,architecture:false,security:false,migration:false,publication:false,data_loss:false}};
 let negative=true,admissionMismatch=false,unknownInvoice=false,nextLaunchParticipant=null,authorityFault=null;
 const queues={leader:[],worker:[],reviewer:[]},active={},calls=[];
 function receipt(p,id,output){return {text:output,output,native_id:id,actualModel:{provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning},context_manifest:{id:id,native_id:id,fresh:true,read_only:true,tools:[],isolation:'read-only',author_contexts:[],provenance:'adapter-isolated',fresh_review_verified:true,author_history_inherited:false,initial_instructions_digest:routingDigest('mock default developer instructions')},usage:{input_tokens:1,output_tokens:1}};}
 function calibrationNative(p,id){return {async send(prompt,invocation){let output;
  if(invocation.purpose==='identity-inspection')output=prompt.slice('Return exactly this token: '.length);
  else if(invocation.purpose.startsWith('task-class-trial:'))output=JSON.stringify({code:TASK_CLASS_SUITE.cases.find(c=>invocation.purpose.endsWith(c.id)).expected});
  else output=JSON.stringify({accepted:true,target_digest:/"target_digest":"([a-f0-9]+)"/.exec(prompt)[1]});
  return receipt(p,id,output);
 }};}
 const initial=f.load().state.teams.team,participants=Object.values(initial.participants);
 // Bootstrap evidence is genuinely collector-minted before strict operation starts.
 for(const name of ['leader','reviewer'])for(let i=0;i<(name==='leader'?20:2);i++){
  const p=initial.participants[name],id='prepared-'+name+'-'+i,native=calibrationNative(p,id),runtime=await collectRuntimeEvidence({participant:p,native});queues[name].push({p,id,runtime});
 }
 const worker=initial.participants.worker,workerNative=calibrationNative(worker,'prepared-worker'),workerRuntime=await collectRuntimeEvidence({participant:worker,native:workerNative});queues.worker.push({p:worker,id:workerRuntime.native_id,runtime:workerRuntime});
 const secondWorkerNative=calibrationNative(worker,'prepared-worker-2'),secondWorkerRuntime=await collectRuntimeEvidence({participant:worker,native:secondWorkerNative});queues.worker.push({p:worker,id:secondWorkerRuntime.native_id,runtime:secondWorkerRuntime});
 const qualification=await collectTaskQualification({runtime:workerRuntime,native:workerNative,reviewNative:calibrationNative(initial.participants.reviewer,'qualification-critic'),reviewer:initial.participants.reviewer,participants,policy:initial.policy,reviewFloor:initial.review_floor});
 function billing(cost){const stamp=ttl=>{const ms=Date.now();return {source:'mock-provider',observed_at:new Date(ms).toISOString(),expires_at:new Date(ms+ttl).toISOString()};};return {
  async inspectRoute({model}){return {endpoint:'https://fixture.invalid/native',account:'fixture-account',sku:'fixture-sku',mode:'api',pool:'fixture-pool',model};},
  async collectPrice({route_digest}){return {...stamp(86400000),route_digest,currency:manifest.budget.currency,input_units_per_million:'0',output_units_per_million:'0',tool_max_units:'0'};},
  async collectQuota({route}){return {...stamp(60000),pool:route.pool,currency:manifest.budget.currency,pool_allocation:'1000',available_calls:100,scope:'project-authority',exclusive_allocation:true,allocation_id:'exclusive-allocation'};},
  async quoteLiability({route_digest,manifest:quoted}){return {...stamp(60000),route_digest,manifest_digest:routingDigest(quoted),currency:quoted.budget.currency,all_charges_bounded:true,inflight_charges_bounded:true,enforced_by_provider:true,quote_id:'quote-'+randomUUID(),max_units_per_attempt:String(cost)};}
 };}
 const billingEvidence=await collectBillingEvidence({runtime:workerRuntime,billing:billing(10),manifest});
 const verifiedEvidence=assembleRoutingEvidence({runtime:workerRuntime,qualification,billing:billingEvidence}).verifiedEvidence;
 // Exercise the actual mint rather than supplying handwritten grant flags.
 const minted=createRoutingGrant({manifest,participants,policy:initial.policy,verifiedEvidence,epoch:initial.epoch,reviewFloor:initial.review_floor});assert.equal(minted.grant.participant,'worker');
 const deps={
  mutate(root,request,reducer,options){return mutateAuthority(root,request,reducer,{...options,fault:stage=>{if(authorityFault&&request.command.type===authorityFault.type&&stage===authorityFault.stage){authorityFault=null;throw new Error('simulated authority interruption');}}});},
  async prepareControlGrant({team,participant,purpose,action,nonce,work}){
   const slot=purpose==='review'?active[participant.id]:queues[participant.id][0];assert.ok(slot,'preverified native context available');
   if(purpose!=='review')nextLaunchParticipant=participant.id;
   return createControlGrant({runtime:slot.runtime,billing:billing(10),manifest,participants:Object.values(team.participants),policy:team.policy,epoch:team.epoch,purpose,action,nonce,...(work?{work_id:work.id,generation:work.generation,target_digest:work.result.target_digest,criteria_digest:work.criteria_digest,tests_digest:work.result.tests_digest}:{}),reviewFloor:team.review_floor,authorParticipants:work?[work.worker,team.leader]:[],excludedContexts:work?work.author_contexts||[]:[]});
  },
  async admitBoundedDispatch({descriptor,invocation,grant}){
   if(grant.kind!=='control')nextLaunchParticipant=grant.participant;
   return {provider_enforced:true,invocation_id:invocation.id,descriptor_digest:admissionMismatch?'f'.repeat(64):routingDigest(descriptor),route_digest:grant.route_digest,quote_id:grant.quote_id,allocation_id:grant.allocation_id,max_units:invocation.max_units};
  },
  async collectBoundedUsage({invocation,grant}){
   if(unknownInvoice)throw new Error('provider invoice unavailable');
   return {actual_units:'2',provider_invocation_id:'invoice-'+invocation.id,invocation_id:invocation.id,route_digest:grant.route_digest,quote_id:grant.quote_id,allocation_id:grant.allocation_id};
  },
  async createNativeEndpoint(){
   const name=nextLaunchParticipant;assert.ok(name);const slot=queues[name].shift();assert.ok(slot);active[name]=slot;
   return {native_id:slot.id,async send(prompt,invocation){
    const s=f.load().state,team=s.teams.team;
    if(invocation.purpose==='runtime-inspection'){const r=team.runtime_requests[invocation.id];assert.equal(r.consumed,true);assert.ok(Object.values(s.invocations).some(x=>x.state==='dispatching'&&x.control_bound&&team.routing_evidence[x.evidence_digest].grant.nonce===invocation.id));}
    else if(invocation.purpose==='independent-review'){assert.equal(team.review_requests[invocation.id].consumed,true);assert.ok(Object.values(s.invocations).some(x=>x.state==='dispatching'&&x.control_bound&&team.routing_evidence[x.evidence_digest].grant.nonce===invocation.id));}
    else assert.equal(s.invocations[invocation.id].state,'dispatching');
    calls.push({purpose:invocation.purpose,native_id:slot.id});
    const output=invocation.purpose==='runtime-inspection'?invocation.id:invocation.purpose==='bounded-routed-edit'?JSON.stringify({files:[{path:'a.txt',content:negative?'rejected\n':'accepted\n'}]}):JSON.stringify({verdict:negative?'changes-requested':'approve',findings:negative?[{path:'a.txt',message:'Use accepted content'}]:[]});
    return receipt(slot.p,slot.id,output);
   },close(){}};
  }
 };
 const host=name=>createTeamHost({authorityRoot:f.authorityRoot,projectRoot:f.root,vaultPath:f.vault,team:'team',ownerCredential:f.ownerPath,collectorPath:f.collectorPath,endpointPath:f.endpointPaths[name],participant:name,participantCredential:name==='worker'?f.paths.worker:f.paths.leader,leaderCredential:f.paths.leader,leaderEndpointPath:f.endpointPaths.leader,dispatcher:cli},deps);
 f.command('routing-enable-v2');const installed=host('leader').installRoutingGrant({manifest,verifiedEvidence});
 async function protectedCommand(type,extra={}){const key=randomUUID(),team=f.load().state.teams.team,p=team.participants.leader;await host('leader').inspect({action:[type,'team',p.id,p.incarnation,p.model.model_revision,team.policy.revision,key].join(':')});return f.command(type,extra,f.credentials.leader,key);}
 async function assign(){return protectedCommand('assign-routed-v2',{grant_digest:installed.result.grant_digest,work:{id:'work',worker:'worker',base:f.base,paths:manifest.paths,goal:manifest.goal,criteria,criteria_digest:manifest.criteria_digest,dependencies:[]}});}
 function attestReserve(key){const team=f.load().state.teams.team,p=team.participants.leader;f.command('attest',{participant_id:p.id,model:{...p.model,evidence:{kind:'owner-attested',source:'fixture-owner',observed_at:new Date().toISOString(),action:['invocation-reserve-v1','team',p.id,p.incarnation,p.model.model_revision,team.policy.revision,key].join(':')}}});}
 async function dispatch(attempt=1){const key=randomUUID();attestReserve(key);return host('worker').dispatchRouted({workId:'work',attempt,invocationId:'worker-invocation-'+attempt,reserveKey:key});}
 async function supervise(){const target_digest=f.load().state.teams.team.work.work.result.target_digest;return protectedCommand('supervise',{work_id:'work',target_digest,findings:[]});}
 return {...f,host,manifest,assign,dispatch,protectedCommand,supervise,calls,setNegative:v=>negative=v,setMismatch:v=>admissionMismatch=v,setUnknownInvoice:v=>unknownInvoice=v,setAuthorityFault:(type,stage)=>authorityFault={type,stage}};
}

test('strict routed edit and controls preserve real budget through negative/positive review and Git publication',async t=>{
 const f=await strictFixture(t);await f.assign();await f.dispatch();
 const owned=f.host('leader').checkout({workId:'work'});assert.equal(readFileSync(join(owned.path,'a.txt'),'utf8'),'rejected\n');
 f.host('leader').candidate({workId:'work'});await f.supervise();await f.host('reviewer').review({workId:'work',nonce:'strict-negative'});
 assert.equal(f.load().state.teams.team.work.work.status,'changes-requested');
 await f.protectedCommand('revise-work-v1',{work_id:'work',findings_resolution:[{resolution:'Replace content'}]});
 const workerInvocation=f.load().state.invocations['worker-invocation-1'];assert.equal(workerInvocation.state,'settled');
 assert.throws(()=>f.command('work-ack',{work_id:'work'},f.credentials.worker),/trusted-invocation-grant|required/);
 // Real spent control money reduces the untouched reserve. Charging the full
 // original 800 again here would incorrectly reject 14 + 10 + 800 > 820.
 const beforeSecond=Object.values(f.load().state.invocations).reduce((sum,x)=>sum+BigInt(x.actual_units),0n);assert.ok(beforeSecond+10n+800n>820n);
 f.setNegative(false);await f.dispatch(2);assert.equal(readFileSync(join(owned.path,'a.txt'),'utf8'),'accepted\n');
 f.host('leader').candidate({workId:'work'});await f.supervise();
 await f.host('reviewer').review({workId:'work',nonce:'strict-positive'});
 await f.host('leader').publish(publishArgs);
 const s=f.load().state,work=s.teams.team.work.work;assert.equal(work.status,'integrated');assert.equal(git(f.root,'rev-parse','HEAD'),f.base);
 const entries=Object.values(s.invocations),total=entries.reduce((sum,x)=>sum+BigInt(x.actual_units),0n),controls=entries.filter(x=>x.kind==='control');
 assert.ok(controls.length>=10);assert.equal(total,BigInt(entries.length)*2n);assert.ok(total<BigInt(f.manifest.budget.max_units));
 assert.equal(s.teams.team.task_budget.reserved_control_units,'800');assert.equal(f.command('close-v1').result.closed,'team');
});

test('strict endpoint admission mismatch rejects before native send or cost reservation',async t=>{
 const f=await strictFixture(t);f.setMismatch(true);const before=f.calls.length;
 await assert.rejects(f.host('leader').inspect({action:'verify-endpoint',nonce:'admission-mismatch'}),/dispatch-admission/);
 assert.equal(f.calls.length,before);assert.equal(Object.keys(f.load().state.invocations||{}).length,0);
 assert.equal(f.load().state.teams.team.runtime_requests['admission-mismatch'].consumed,false);
});

test('unknown strict provider invoice retains uncertain liability and prevents a free replay',async t=>{
 const f=await strictFixture(t);f.setUnknownInvoice(true);
 await assert.rejects(f.host('leader').inspect({action:'verify-invoice',nonce:'unknown-invoice'}),/invoice unavailable/);
 const state=f.load().state,entry=Object.values(state.invocations)[0];assert.equal(entry.state,'uncertain');assert.equal(entry.max_units,'10');
 const count=f.calls.length;await assert.rejects(f.host('leader').inspect({action:'verify-invoice',nonce:'unknown-invoice'}),/uncertain-no-retry/);assert.equal(f.calls.length,count);
 assert.throws(()=>f.command('close-v1'),/unresolved-(team|native)-operations/);
});


test('strict runtime consume publication survives lost reply and never reaches native send',async t=>{
 const f=await strictFixture(t);f.setAuthorityFault('runtime-consume-v1','after-publication');
 await assert.rejects(f.host('leader').inspect({action:'verify-consume-fence',nonce:'consume-interrupted'}),/simulated authority interruption/);
 assert.equal(f.calls.length,0);
 const accepted=f.load().state;assert.equal(accepted.teams.team.runtime_requests['consume-interrupted'].consumed,true);
 const entry=Object.values(accepted.invocations)[0];assert.equal(entry.state,'dispatching');assert.equal(entry.max_units,'10');
 recoverLock(f.authorityRoot,{ownerConfirmedStopped:true});
 assert.equal(f.load().state.teams.team.runtime_requests['consume-interrupted'].consumed,true);
 await assert.rejects(f.host('leader').inspect({action:'verify-consume-fence',nonce:'consume-interrupted'}),/uncertain-no-retry/);
 assert.equal(f.calls.length,0);assert.throws(()=>f.command('close-v1'),/unresolved-(team|native)-operations/);
});

test('strict invoice settlement published before lost reply survives journal replay without another send',async t=>{
 const f=await strictFixture(t);f.setAuthorityFault('invocation-settle-v1','after-publication');
 await assert.rejects(f.host('leader').inspect({action:'verify-settlement-fence',nonce:'settlement-interrupted'}),/simulated authority interruption/);
 assert.equal(f.calls.length,1);
 const entry=Object.values(f.load().state.invocations)[0];assert.equal(entry.state,'settled');assert.equal(entry.actual_units,'2');
 recoverLock(f.authorityRoot,{ownerConfirmedStopped:true});
 const replay=Object.values(f.load().state.invocations)[0];assert.equal(replay.state,'settled');assert.equal(replay.actual_units,'2');
 await assert.rejects(f.host('leader').inspect({action:'verify-settlement-fence',nonce:'settlement-interrupted'}),/uncertain-no-retry/);
 assert.equal(f.calls.length,1);
});


test('real cached relay forwards an old receipt with fresh authority action time and no native invocation',async t=>{
 const f=await fixture(t);const collector=JSON.parse(readFileSync(f.collectorPath,'utf8'));collector.token_hash=hash(collector.token);
 f.command('send',{to:'leader',kind:'question',payload:{text:'Previously answered peer request'}},f.credentials.worker);
 const message=f.load().state.teams.team.messages.at(-1),nonce='old-captured-delivery',native_id='owned-captured-context',output='Durable bounded answer';
 f.command('delivery-consume-v1',{message_id:message.id,participant_id:'leader',nonce,native_id},collector);
 f.command('delivery-capture-v1',{nonce,native_id,output,output_digest:hash(output),actual_model:{provider:'fixture',model_id:'strong',reasoning:'none'}},collector);
 const received_at=f.load().state.teams.team.deliveries[nonce].received_at,calls=f.nativeCalls.length,NativeDate=globalThis.Date;
 // Move the wall clock, not the accepted journal. The old receipt remains an
 // actual reducer/store event while new authority writes use the fresh time.
 globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[NativeDate.now()+60000]));}static now(){return NativeDate.now()+60000;}};
 try{
  assert.ok(Date.now()-Date.parse(received_at)>30000);
  const result=await f.host('leader').relay({limit:1,maxPolls:1,pollMs:0});assert.equal(result.recovered,1);assert.equal(result.native_id,null);assert.equal(f.nativeCalls.length,calls);
  const view=f.load(),answers=view.state.teams.team.messages.filter(m=>m.reply_to===message.id);assert.equal(answers.length,1);assert.equal(answers[0].payload.text,output);
  assert.ok(view.state.teams.team.messages.find(m=>m.id===message.id).ack);
  assert.ok(view.requests.some(r=>r.key==='relay-answer-'+nonce));assert.ok(view.requests.some(r=>r.key==='relay-ack-'+nonce));
 }finally{globalThis.Date=NativeDate;}
});

for(const interruption of [null,'after-lock','after-publication'])test('real quota driver preserves retained work across worker acknowledgement '+(interruption||'success'),async t=>{
 const f=await fixture(t);f.command('quota-policy-enable-v1');await f.assign();
 const checkout=f.host('leader').checkout({workId:'work'});writeFileSync(join(checkout.path,'a.txt'),'retained candidate\n');f.host('leader').candidate({workId:'work'});
 const before=f.load().state.teams.team.work.work,beforeEpoch=f.load().state.teams.team.epoch,stops=[];let armed=interruption;
 const participantHost=name=>createTeamHost({authorityRoot:f.authorityRoot,projectRoot:f.root,vaultPath:f.vault,team:'team',ownerCredential:f.ownerPath,collectorPath:f.collectorPath,endpointPath:f.endpointPaths[name],participant:name,participantCredential:f.paths[name],leaderEndpointPath:f.endpointPaths.leader,dispatcher:cli},{mutate(root,request,reducer,options){return mutateAuthority(root,request,reducer,{...options,fault:stage=>{if(name==='worker'&&request.command.type==='adoption-ack-v1'&&armed===stage){armed=null;throw new Error('simulated worker acknowledgement interruption');}}});},createNativeEndpoint:async descriptor=>{
  const native_id='handover-native-'+randomUUID();return {native_id,async send(_prompt,invocation){
   const team=f.load().state.teams.team;assert.equal(team.runtime_requests[invocation.id].participant,'reviewer');assert.equal(team.runtime_requests[invocation.id].consumed,true);
   return {native_id,output:invocation.id,actualModel:{provider:'fixture',model_id:descriptor.model_id,reasoning:'none'},context_manifest:{id:native_id}};
  },close(){}};
 }});
 const driver=f.host('leader',{
  async observeProviderQuota({participant,incarnation,model_revision,model}){const ms=Date.now();return {protocol:1,participant,incarnation,model_revision,model,route:{endpoint:'https://fixture.invalid/quota',account:'fixture-account',sku:'fixture-sku',mode:'api',pool:'fixture-pool',model},status:'exhausted',available_calls:0,provider_confirmed:true,evidence_kind:'provider-quota',reason:'provider-quota-exhausted',scope:'provider-account-model',observation_id:'leader-exhausted',source:'https://fixture.invalid/quota',observed_at:new Date(ms).toISOString(),expires_at:new Date(ms+60000).toISOString()};},
  async stopOwnedParticipant({participant,epoch}){stops.push(participant.id);return {stopped:true,participant:participant.id,incarnation:participant.incarnation,epoch,evidence_digest:hash(['stopped',participant.id,epoch])};},
  resolveParticipantHost:participantHost
 });
 const calls=f.nativeCalls.length,observed=await driver.observeQuota();
 if(interruption){
  assert.equal(observed.redistribution_blocker,'simulated worker acknowledgement interruption');
  const held=f.load().state.teams.team;assert.equal(held.work.work.status,'adoption-pending');assert.equal(held.work.work.retained_status,'submitted');assert.equal(held.work.work.generation,before.generation+1);
  assert.equal(held.handover.adoptions.work.ack,interruption==='after-publication');
  assert.equal(Object.values(held.runtime_requests).filter(r=>r.action.startsWith('adopt-work-v1:')).length,1);
  recoverLock(f.authorityRoot,{ownerConfirmedStopped:true});
  const restarted=f.host('leader',{resolveParticipantHost:participantHost,stopOwnedParticipant:async()=>{throw new Error('accepted stop proofs must not be repeated');}});
  assert.equal((await restarted.driveQuotaHandover()).redistributed,true);
 }else assert.equal(observed.redistribution.redistributed,true);
 assert.deepEqual(stops,['leader','worker']);assert.equal(f.nativeCalls.length,calls);
 const replay=f.load().state.teams.team;assert.equal(replay.leader,'reviewer');assert.equal(replay.status,'active');assert.equal(replay.epoch,beforeEpoch+1);
 assert.equal(replay.work.work.status,'submitted');assert.equal(replay.work.work.generation,before.generation+1);assert.deepEqual(replay.work.work.result,before.result);
 assert.equal(replay.last_handover.acks.leader.stopped,true);assert.equal(replay.last_handover.acks.worker.stopped,true);assert.equal(replay.last_handover.adoptions.work.ack,true);
 const candidateObservations=Object.values(replay.runtime_requests).filter(r=>r.action.startsWith('adopt-work-v1:')||r.action.startsWith('handover-accept-v1:'));assert.equal(candidateObservations.length,2);assert.ok(candidateObservations.every(r=>r.participant==='reviewer'&&r.captured));
});
