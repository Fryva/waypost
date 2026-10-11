import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityFixture,now,at,expiry} from './helpers/native-calibration.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {readWorkPlan,checkWorkPlan,workPlanShape,settleWorkPlans,workPlanProposalDigest,workPlanListing,createProtocolWorkPlanRequest,formatWorkPlan,workPlanPromptDigest,workPlanSlot} from '../scripts/team-native-work-plan.mjs';

// Contract 28, slice 7 (owner, 2026-10-11): the leader's decomposition of an owner goal. The reducer side: the owner's request,
// the strict answer, the whole-plan checks and the all-or-nothing install. The Host flow is in native-work-plan-host.test.mjs.
const legacy={protocol:1,revision:1,domain:'coding',mode:'automatic',generated_at:at,expires_at:expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],evidence_floor:['adapter-observed'],profiles:[]};
const until=new Date(now+86400000).toISOString(),clone=structuredClone,base='a'.repeat(40);
let shared,sharedCalibrated;
async function team(executors=['peer-d']){
 shared??=authorityFixture({identityOnly:{}});const f=await shared,s=clone(f.state);
 Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});Object.assign(s.teams.team,{task:'task',policy:legacy,messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 const state=reduceTeamEvent(s,{type:'native-policy-assign-v2',team:'team',actor:'owner:fixture',at,request_key:'assign',expected_policy_revision:1,coordinator:['peer-a'],reviewers:['peer-b','peer-c'],executors,reason:'the owner chose these roles',expires_at:until,issued_by:{harness:'claude',session:'session-1'}}).state,t=state.teams.team;
 t.leader=t.candidate;t.candidate=null;t.status='active';
 return {state,unit:Object.keys(state.subscription_allocations)[0]};
}
const send=(state,type,fields={},actor='owner:fixture')=>reduceTeamEvent(state,{type,team:'team',actor,at,request_key:type+'-'+Math.random(),epoch:state.teams.team.epoch,...fields});
const workPolicy=(unit,state,ceilings={})=>({kind:'protocol-work',executor:'owner-assigned',allow_unknown_quota:true,max_attempts:2,timeout_ms:60000,expires_at:until,ceilings:{execution:{max_calls:4,max_estimate_tokens:'8000'},review:{max_calls:4,max_estimate_tokens:'8000'},...ceilings},unit_allocations:[{unit_digest:unit,max_tokens:'50000',allocation_revision:state.subscription_allocations[unit].revision}]});
const plan={max_calls:2,max_estimate_tokens:'8000'};
async function enabled(ceilings={plan},executors){const {state,unit}=await team(executors);return {state:send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state,ceilings)}).state,unit};}
const request=(over={})=>({plan_id:'p1',goal:'Make the sum and the product correct',base,scope:['src/a.js','src/b.js','src/c.js'],forbidden_actions:['network'],max_works:3,inputs_digest:'b'.repeat(64),...over});
const ask=(state,over)=>send(state,'native-work-plan-request-v2',request(over));
// A stored proposal as a captured answer leaves it (the capture itself runs through a real call in the Host test).
function proposed(state,works=[{goal:'Fix sum',criteria:['sum adds'],paths:[0]},{goal:'Fix product',criteria:['product multiplies','no side effects'],paths:[1,2]}]){
 const s=clone(state),t=s.teams.team,p=t.work_plans.p1;
 p.state='proposed';p.proposal={invocation_id:'i1',participant:'peer-a',incarnation:'x',leader:t.leader,epoch:t.epoch,output_digest:'c'.repeat(64),captured_at:at,digest:workPlanProposalDigest(p,works),works:works.map(w=>({...w,resolved_paths:w.paths.map(i=>p.scope[i])})),checks:{ok:true,codes:[]}};
 return s;
}
const install=(state,over={})=>send(state,'native-work-plan-install-v2',{plan_id:'p1',digest:state.teams.team.work_plans.p1.proposal.digest,reason:'reviewed the exact plan',...over});

test('a plan request is an owner event stored whole, and a team that never asks gains no field',async()=>{
 const {state}=await enabled();assert.equal(state.teams.team.work_plans,undefined);
 const r=ask(state),p=r.state.teams.team.work_plans.p1;
 assert.equal(r.result.protected_actions_granted,false);assert.equal(p.state,'requested');assert.equal(p.goal,request().goal);assert.deepEqual(p.scope,request().scope);assert.equal(p.max_works,3);assert.equal(p.request_digest,r.result.request_digest);
 assert.equal(JSON.stringify(Object.keys(p)),JSON.stringify(['protocol','id','plan_id','goal','base','scope','forbidden_actions','max_works','inputs_digest','request_digest','state','requested_at']));
 assert.throws(()=>ask(r.state),/native-work-plan-already-exists/);
 assert.throws(()=>send(state,'native-work-plan-request-v2',request(),'collector:x'),/owner|actor|collector/i,'owner only');
});
test('the request is checked field by field',async()=>{
 const {state}=await enabled();
 for(const [over,code] of [[{plan_id:'-bad'},/invalid-id/],[{plan_id:'x'.repeat(65)},/invalid-id/],[{goal:' '},/bounded-text/],[{goal:'x'.repeat(4001)},/bounded-text/],[{base:'abc'},/base-commit/],[{scope:[]},/scope-required/],[{scope:Array.from({length:17},(_,i)=>'f'+i)},/scope-required/],[{scope:['b.js','a.js']},/scope-normalised/],[{scope:['../x']},/invalid-path/],[{max_works:0},/max-works/],[{max_works:5},/max-works/],[{max_works:'2'},/max-works/],[{forbidden_actions:'network'},/forbidden-actions/],[{forbidden_actions:['x'.repeat(501)]},/bounded-text/],[{inputs_digest:'zz'},/inputs-digest/],[{forbidden_actions:Array.from({length:32},()=>'y'.repeat(500)),goal:'z'.repeat(4000),scope:Array.from({length:16},(_,i)=>String(i).padStart(2,'0')+'/'+'p'.repeat(1000))},/request-too-large/]])assert.throws(()=>ask(state,over),code,JSON.stringify(over).slice(0,60));
 assert.throws(()=>send(state,'native-work-plan-request-v2',{...request(),extra:1}),/command-fields/);
});
test('a calibrated team refuses plans, and a plan ceiling is not accepted there',async()=>{
 sharedCalibrated??=authorityFixture();const f=await sharedCalibrated,s=clone(f.state);
 Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});Object.assign(s.teams.team,{task:'task',policy:legacy,messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 const c=reduceTeamEvent(s,{type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:f.revision}).state,cu=Object.keys(c.subscription_allocations)[0];
 c.teams.team.leader=c.teams.team.candidate;c.teams.team.candidate=null;c.teams.team.status='active';
 assert.throws(()=>send(c,'native-work-plan-request-v2',request()),/native-work-plan-owner-assigned-only/);
 assert.throws(()=>send(c,'native-work-plan-install-v2',{plan_id:'p1',digest:'d'.repeat(64),reason:'x'}),/native-work-plan-owner-assigned-only/);
 assert.throws(()=>send(c,'native-work-enable-v2',{revision:1,policy:{...workPolicy(cu,c,{plan}),executor:'calibrated-bounded-edit',expires_at:expiry}}),/native-work-plan-owner-assigned-only/);
 assert.throws(()=>createProtocolWorkPlanRequest(c,c.teams.team,{actionId:'a1',planId:'p1',now}),/native-work-plan-owner-assigned-only/);
});
test('the plan ceiling is optional and bounded; without it no plan opens',async()=>{
 const {state,unit}=await team();
 const without=send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state)}).state;
 assert.equal(JSON.stringify(Object.keys(without.teams.team.native_work_policy.ceilings)),'["execution","review"]');
 assert.throws(()=>ask(without),/native-work-plan-ceiling-required/);
 for(const bad of [{max_calls:0,max_estimate_tokens:'8'},{max_calls:65,max_estimate_tokens:'8'},{max_calls:1,max_estimate_tokens:'0'},{max_calls:1},{max_calls:1,max_estimate_tokens:'8',extra:1}])assert.throws(()=>send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state,{plan:bad})}),/bounded-owner-work-ceiling|exact-object/);
 assert.throws(()=>send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state,{other:plan})}),/exact-object/);
});
test('a plan request waits for an active leader, and stands aside for a pending handover, a quota freeze or a negative audit',async()=>{
 const {state}=await enabled();
 const idle=clone(state);idle.teams.team.status='forming';assert.throws(()=>ask(idle),/native-work-active-leader-required/);
 const frozen=clone(state);frozen.teams.team.native_quota_freeze={};assert.throws(()=>ask(frozen),/native-work-quota-handover-pending/);
 const handover=clone(state);handover.teams.team.handover={};assert.throws(()=>ask(handover),/native-work-quota-handover-pending/);
 const fenced=clone(state);fenced.publication_fence={team:'team'};
 assert.equal(ask(fenced).result.deferred,true,'a publication fence defers the owner event');
});
test('the strict answer: works with indexes or refusals, nothing else',()=>{
 const action={request:{scope:['a','b'],max_works:2}};
 const good={works:[{goal:'g',criteria:['c'],paths:[1,0]}]};
 assert.deepEqual(readWorkPlan(JSON.stringify(good),action),{works:[{goal:'g',criteria:['c'],paths:[0,1]}]});
 assert.deepEqual(readWorkPlan('{"refusals":["too broad"]}',action),{refusals:['too broad']});
 const bad=[
  'not json','[]','{}','{"works":[],"refusals":["x"]}','{"works":[]}','{"refusals":[]}','{"refusals":["a","b","c","d","e"]}','{"refusals":[1]}',
  JSON.stringify({works:[good.works[0],good.works[0],good.works[0],good.works[0],good.works[0]]}),
  JSON.stringify({works:[{...good.works[0],id:'x'}]}),JSON.stringify({works:[{goal:'g',criteria:['c']}]}),
  JSON.stringify({works:[{...good.works[0],base:'a'.repeat(40)}]}),JSON.stringify({works:[{...good.works[0],depends_on:['w']}]}),JSON.stringify({works:[{...good.works[0],depends_on:[]}]}),JSON.stringify({works:[{...good.works[0],depends_on:[0]}]}),JSON.stringify({works:[{...good.works[0],depends_on:[-1]}]}),JSON.stringify({works:[{...good.works[0],depends_on:[1.5]}]}),
  JSON.stringify({works:[{...good.works[0],criteria:[]}]}),JSON.stringify({works:[{...good.works[0],criteria:['1','2','3','4','5']}]}),JSON.stringify({works:[{...good.works[0],criteria:['x'.repeat(201)]}]}),
  JSON.stringify({works:[{...good.works[0],goal:'x'.repeat(601)}]}),JSON.stringify({works:[{...good.works[0],goal:' '}]}),
  JSON.stringify({works:[{...good.works[0],paths:[]}]}),JSON.stringify({works:[{...good.works[0],paths:[0,0]}]}),JSON.stringify({works:[{...good.works[0],paths:['a']}]}),JSON.stringify({works:[{...good.works[0],paths:[-1]}]}),JSON.stringify({works:[{...good.works[0],paths:[1.5]}]}),
 ];
 for(const raw of bad)assert.throws(()=>readWorkPlan(raw,action),/work-plan/,raw.slice(0,70));
});
test('bidirectional, invisible and control characters are refused in goals, criteria and refusals',()=>{
 const action={request:{scope:['a'],max_works:1}};
 const hidden=[0x202a,0x202e,0x2066,0x2069,0x200b,0x200f,0x2060,0x2064,0xfeff,0x0085,0x009f,0x007f,0x0001,0x2028].map(c=>String.fromCharCode(c));
 for(const c of hidden){
  assert.throws(()=>readWorkPlan(JSON.stringify({works:[{goal:'fix'+c+'sum',criteria:['c'],paths:[0]}]}),action),/exact-work-plan-required/,'goal '+c.charCodeAt(0).toString(16));
  assert.throws(()=>readWorkPlan(JSON.stringify({works:[{goal:'g',criteria:['ok'+c],paths:[0]}]}),action),/exact-work-plan-required/,'criterion '+c.charCodeAt(0).toString(16));
  assert.throws(()=>readWorkPlan(JSON.stringify({refusals:['no'+c]}),action),/exact-work-plan-required/,'refusal '+c.charCodeAt(0).toString(16));
 }
 assert.equal(readWorkPlan(JSON.stringify({works:[{goal:'line one\nline two\tend',criteria:['c'],paths:[0]}]}),action).works.length,1,'tab and line feed are text');
});
test('a plan is checked whole: scope, overlap inside and with open work, count and ceilings, each under its name',async()=>{
 const {state}=await enabled();const s=ask(state).state,t=s.teams.team,p=t.work_plans.p1;
 const w=(goal,paths)=>({goal,criteria:['c'],paths});
 assert.deepEqual(checkWorkPlan(s,t,p,[w('a',[0]),w('b',[1,2])]).codes,[]);
 assert.deepEqual(checkWorkPlan(s,t,p,[w('a',[0]),w('b',[9])]).codes,['native-work-plan-path-outside-scope']);
 assert.deepEqual(checkWorkPlan(s,t,p,[w('a',[0,1]),w('b',[1])]).codes,['native-work-plan-path-overlap']);
 const wide={...p,scope:['src','src/b.js','x.js'],max_works:3};
 assert.deepEqual(checkWorkPlan(s,t,wide,[w('a',[0]),w('b',[1])]).codes,['native-work-plan-path-overlap'],'a directory and a file inside it overlap');
 assert.deepEqual(checkWorkPlan(s,t,{...p,max_works:1},[w('a',[0]),w('b',[1])]).codes,['native-work-plan-too-many-works']);
 const open=clone(s);open.teams.team.work={o1:{protocol:2,id:'o1',status:'candidate',paths:['src/b.js']}};
 assert.deepEqual(checkWorkPlan(open,open.teams.team,p,[w('a',[0]),w('b',[1])]).codes,['native-work-plan-path-overlap-unfinished']);
 open.teams.team.work.o1.status='integrated';assert.deepEqual(checkWorkPlan(open,open.teams.team,p,[w('a',[0]),w('b',[1])]).codes,[],'finished work no longer blocks');
 const tight=clone(s);tight.teams.team.native_work_policy.ceilings.execution.max_calls=1;
 assert.deepEqual(checkWorkPlan(tight,tight.teams.team,p,[w('a',[0]),w('b',[1])]).codes,['native-work-plan-ceiling-exhausted'],'one execution call cannot serve two works');
 assert.deepEqual(checkWorkPlan(tight,tight.teams.team,p,[w('a',[0])]).codes,[]);
 const spent=clone(s);spent.subscription_invocations={i1:{team:'team',state:'settled',purpose:'protocol-control',action:{kind:'protocol-work-review'},control_policy_revision:1}};spent.teams.team.native_work_policy.ceilings.review.max_calls=2;
 assert.deepEqual(checkWorkPlan(spent,spent.teams.team,p,[w('a',[0]),w('b',[1])]).codes,['native-work-plan-ceiling-exhausted'],'spent review calls count');
 assert.deepEqual(checkWorkPlan(s,t,{...p,max_works:1},[w('a',[0,9]),w('b',[0])]).codes,['native-work-plan-path-outside-scope','native-work-plan-path-overlap','native-work-plan-too-many-works'].sort());
});
test('install puts every work of the exact proposal in place, in the owner order, built by the authority',async()=>{
 const {state}=await enabled(),s=proposed(ask(state).state),t0=s.teams.team,p0=t0.work_plans.p1;
 const r=install(s),t=r.state.teams.team;
 assert.equal(r.result.protected_actions_granted,false);assert.deepEqual(r.result.installed.map(x=>x.work),['p1-1','p1-2']);
 assert.equal(t.work_plans.p1.state,'installed');assert.deepEqual(t.work_plans.p1.installed.works,['p1-1','p1-2']);assert.equal(t.work_plans.p1.installed.reason,'reviewed the exact plan');
 const [a,b]=[t.work['p1-1'],t.work['p1-2']];
 assert.deepEqual(a.manifest,{protocol:2,goal:'Fix sum',criteria:['sum adds'],criteria_digest:routingDigest(['sum adds']),paths:['src/a.js'],base,forbidden_actions:['network']});
 assert.deepEqual(b.manifest.paths,['src/b.js','src/c.js']);assert.equal(b.manifest.criteria_digest,routingDigest(['product multiplies','no side effects']));
 for(const w of [a,b]){assert.equal(w.status,'manifest');assert.equal(w.worker,'peer-d');assert.equal(w.label,'owner-assigned-unmeasured');assert.deepEqual(w.plan,{plan_id:'p1',proposal_digest:p0.proposal.digest});assert.equal(w.manifest.executor_participant,undefined);assert.equal(w.assignment.mode,'owner-order');}
 assert.equal(JSON.stringify(Object.keys(t.work['p1-1'].manifest)),JSON.stringify(['protocol','goal','criteria','criteria_digest','paths','base','forbidden_actions']));
 assert.throws(()=>install(r.state),/native-work-plan-proposal-required/,'installed once');
});
test('install is all or nothing: one work the ordinary checks refuse refuses the whole plan',async()=>{
 const {state}=await enabled(),s=proposed(ask(state).state);
 const busy=clone(s);busy.teams.team.work={o1:{protocol:2,id:'o1',status:'candidate',paths:['src/c.js']}};
 const before=JSON.stringify(busy);
 assert.throws(()=>install(busy),/native-work-path-overlap/);assert.equal(JSON.stringify(busy),before,'the state it was given is untouched');
 busy.teams.team.work.o1.status='cancelled';assert.deepEqual(install(busy).result.installed.map(x=>x.work),['p1-1','p1-2'],'the same plan installs once the path is free');
 const taken=clone(s);taken.teams.team.work={'p1-2':{protocol:2,id:'p1-2',status:'integrated',paths:['z.js']}};
 assert.throws(()=>install(taken),/native-work-already-exists/);
 const noExecutor=clone(s);noExecutor.teams.team.participants['peer-d'].availability='busy';
 assert.throws(()=>install(noExecutor),/native-work-no-eligible-executor/);
 const expired=clone(s);expired.teams.team.native_work_policy.expires_at=new Date(now-1000).toISOString();
 assert.throws(()=>install(expired),/native-work-owner-ceiling-required/);
});
test('install takes only the exact proposal digest, a reason, and only from the owner',async()=>{
 const {state}=await enabled(),asked=ask(state).state,s=proposed(asked);
 assert.throws(()=>install(s,{digest:'d'.repeat(64)}),/native-work-plan-digest-mismatch/);
 assert.throws(()=>install(s,{reason:' '}),/bounded-text/);
 assert.throws(()=>install(s,{extra:1}),/command-fields/);
 assert.throws(()=>send(s,'native-work-plan-install-v2',{plan_id:'p1',digest:s.teams.team.work_plans.p1.proposal.digest,reason:'x'},'collector:x'),/owner|actor|collector/i);
 assert.throws(()=>send(asked,'native-work-plan-install-v2',{plan_id:'p1',digest:'d'.repeat(64),reason:'x'}),/native-work-plan-proposal-required/,'a requested plan has no proposal');
 for(const st of ['rejected','refused']){const x=clone(s);x.teams.team.work_plans.p1.state=st;assert.throws(()=>install(x),/native-work-plan-proposal-required/,st);}
 assert.throws(()=>send(s,'native-work-plan-install-v2',{plan_id:'nope',digest:'d'.repeat(64),reason:'x'}),/native-work-plan-proposal-required/);
});
test('a lost leader or a new epoch between the capture and the install voids the proposal',async()=>{
 const {state}=await enabled(),s=proposed(ask(state).state);
 const epoch=clone(s);epoch.teams.team.epoch++;assert.throws(()=>install(epoch),/native-work-plan-leader-changed/);
 const other=clone(s);other.teams.team.leader='peer-b';assert.throws(()=>install(other),/native-work-plan-leader-changed/);
 const paused=clone(s);paused.teams.team.status='paused';assert.throws(()=>install(paused),/native-work-plan-leader-changed/);
 assert.equal(workPlanListing(s.teams.team)[0].voided,undefined);
 assert.equal(workPlanListing(epoch.teams.team)[0].voided,'native-work-plan-leader-changed','the owner is shown that it is void');
 assert.equal(install(s).result.installed.length,2);
});
test('the leader call is built from authority state only, pinned to the current leader, and asked once per plan',async()=>{
 const {state}=await enabled(),s=ask(state).state,t=s.teams.team;
 const a=createProtocolWorkPlanRequest(s,t,{actionId:'a1',planId:'p1',now}),r=a.request;
 assert.equal(a.kind,'protocol-work-plan');assert.equal(r.participant,t.leader);assert.equal(r.current_epoch,t.epoch);assert.equal(r.max_works,3);assert.equal(r.inputs_digest,request().inputs_digest);assert.equal(r.plan_request_digest,t.work_plans.p1.request_digest);assert.ok(r.assignment_digest);assert.equal(r.calibration_digest,undefined);
 assert.equal(JSON.stringify(createProtocolWorkPlanRequest(s,t,{actionId:'a1',planId:'p1',now:now+1000})),JSON.stringify(a),'no volatile fact: the same request at another time');
 assert.equal(workPlanSlot(a),routingDigest({team:'team',kind:'protocol-work-plan',epoch:t.epoch,plan_id:'p1'}));
 assert.match(formatWorkPlan(a),/^Decompose one owner goal/);assert.ok(formatWorkPlan(a).includes('"index":2,"path":"src/c.js"'));assert.match(formatWorkPlan(a),/depends_on/);assert.doesNotMatch(formatWorkPlan(a),/criteria_digest/);
 assert.equal(workPlanPromptDigest(a),routingDigest({template:2,head:formatWorkPlan(a),suffix:'newline-json-base-files',inputs_digest:request().inputs_digest}));
 assert.throws(()=>createProtocolWorkPlanRequest(s,t,{actionId:'a1',planId:'nope',now}),/native-work-plan-request-required/);
 assert.throws(()=>createProtocolWorkPlanRequest(s,t,{actionId:'bad id',planId:'p1',now}),/action-id/);
 assert.throws(()=>createProtocolWorkPlanRequest(proposed(s),proposed(s).teams.team,{actionId:'a1',planId:'p1',now}),/native-work-plan-request-required/,'a captured plan is not asked again');
 for(const [name,mutate,code] of [['no leader',x=>{x.leader=null;},/active-team-required/],['handover',x=>{x.handover={};},/active-team-required/],['freeze',x=>{x.native_quota_freeze={};},/quota-handover-pending/],['expired',x=>{x.policy.expires_at=new Date(now-1).toISOString();},/active-team-required/],['no plan ceiling',x=>{delete x.native_work_policy.ceilings.plan;},/ceiling-required/]]){
  const x=clone(s);mutate(x.teams.team);assert.throws(()=>createProtocolWorkPlanRequest(x,x.teams.team,{actionId:'a1',planId:'p1',now}),code,name);
 }
});

// ---- Step 8 (owner, 2026-10-11): dependent works of a plan are installed by the authority when their dependencies are integrated.
const w3=(goal,paths,depends_on)=>({goal,criteria:['c'],paths,...(depends_on?{depends_on}:{})});
test('the reader takes an optional depends_on of other works of the answer and keeps it sorted',()=>{
 const action={request:{scope:['a','b'],max_works:3}};
 const r=readWorkPlan(JSON.stringify({works:[w3('g',[0]),w3('h',[0],[0]),w3('i',[1],[1,0])]}),action);
 assert.equal(Object.hasOwn(r.works[0],'depends_on'),false);assert.deepEqual(r.works[1].depends_on,[0]);assert.deepEqual(r.works[2].depends_on,[0,1]);
 assert.throws(()=>readWorkPlan(JSON.stringify({works:[w3('g',[0]),w3('h',[0],[0,0])]}),action),/exact-work-plan-required/,'duplicates');
 assert.throws(()=>readWorkPlan(JSON.stringify({works:[w3('g',[0]),w3('h',[0],[2])]}),action),/exact-work-plan-required/,'outside the answer');
});
test('the plan graph is checked whole: cycles, sisters, bad indexes, overlap between independent works only',async()=>{
 const {state}=await enabled();const s=ask(state,{max_works:4}).state,t=s.teams.team,p=t.work_plans.p1;
 const codes=works=>checkWorkPlan(s,t,p,works).codes;
 assert.deepEqual(codes([w3('a',[0]),w3('b',[0],[0])]),[],'a dependent work may touch the paths of its dependency');
 assert.deepEqual(codes([w3('a',[0]),w3('b',[0],[0]),w3('c',[0],[1])]),[],'and of a dependency further back');
 assert.deepEqual(codes([w3('a',[0],[1]),w3('b',[1],[0])]),['native-work-plan-dependency-cycle']);
 assert.deepEqual(codes([w3('a',[0],[0])]),['native-work-plan-dependency-invalid']);assert.deepEqual(codes([w3('a',[0],[5])]),['native-work-plan-dependency-invalid']);
 assert.deepEqual(codes([w3('a',[0]),w3('b',[1]),w3('c',[2],[0,1])]),['native-work-plan-dependency-chain-required'],'sisters have no commit that holds both');
 assert.deepEqual(codes([w3('a',[0]),w3('b',[1],[0]),w3('c',[2],[0,1])]),[],'a chain: a is behind b, b is the tip of c');
 assert.deepEqual(codes([w3('a',[0]),w3('b',[1],[0]),w3('c',[2],[0]),w3('d',[2],[1,2])]),['native-work-plan-dependency-chain-required'],'b and c are sisters (c and d share a path but d is behind c)');
 assert.deepEqual(codes([w3('a',[0]),w3('b',[0],[0]),w3('c',[0],[0])]),['native-work-plan-path-overlap'],'two works built on the same one still share paths');
 assert.deepEqual(codes([w3('a',[0]),w3('b',[1],[0]),w3('c',[1])]),['native-work-plan-path-overlap'],'c is independent of b');
 const open=clone(s);open.teams.team.work={o1:{protocol:2,id:'o1',status:'candidate',paths:['src/a.js']}};
 assert.deepEqual(checkWorkPlan(open,open.teams.team,p,[w3('a',[1]),w3('b',[0],[0])]).codes,['native-work-plan-path-overlap-unfinished'],'dependent works are checked against unfinished team work too');
 assert.deepEqual(workPlanShape([w3('a',[0]),w3('b',[0],[0]),w3('c',[0],[0,1])]).tip.slice(1),[0,1]);
});
test('the digest covers the dependencies, and a plan without them keeps the old digest form',async()=>{
 const {state}=await enabled();const p=ask(state).state.teams.team.work_plans.p1;
 const a=[w3('a',[0]),w3('b',[1])],b=[w3('a',[0]),w3('b',[1],[0])];
 assert.notEqual(workPlanProposalDigest(p,a),workPlanProposalDigest(p,b));
 assert.equal(workPlanProposalDigest(p,a),routingDigest({revision:1,plan_id:p.id,plan_request_digest:p.request_digest,works:a.map(w=>({goal:w.goal,criteria:w.criteria,paths:w.paths}))}));
});
// A plan with a (p1-1) and b (p1-2) depending on a, installed; helpers to integrate a and send any later event.
async function chained(works=[w3('Fix sum',[0]),w3('Fix product',[0,1],[0])]){
 const {state}=await enabled();return install(proposed(ask(state).state,works));
}
const integrate=(state,id,commit)=>{const x=clone(state),w=x.teams.team.work[id];w.status='integrated';w.commit=commit;w.integrated_evidence={protocol:2,commit};return x;};
const tick=state=>send(state,'native-work-plan-request-v2',request({plan_id:'tick'+Math.random().toString(36).slice(2,8)})).state;
const c1='e'.repeat(40);
// The settle step called directly, for a state whose epoch moved (owner events need the current epoch).
const settle=s=>{const x=clone(s);settleWorkPlans(x,x.teams.team,at,now);return x;};
test('install puts only the independent works in place; the dependent ones are pending in the plan',async()=>{
 const r=await chained(),t=r.state.teams.team,p=t.work_plans.p1;
 assert.deepEqual(r.result.installed.map(x=>x.work),['p1-1']);assert.deepEqual(r.result.pending,['p1-2']);
 assert.deepEqual(Object.keys(t.work),['p1-1']);assert.deepEqual(p.pending,{'p1-2':{depends_on:['p1-1'],tip:'p1-1'}});assert.deepEqual(p.installed.works,['p1-1']);
 assert.equal(p.pending_refusals,undefined);assert.equal(p.abandoned,undefined);
 const flat=install(proposed(ask((await enabled()).state).state)).state.teams.team.work_plans.p1;
 assert.equal(Object.hasOwn(flat,'pending'),false,'a plan without dependencies gains no field');
 assert.equal(JSON.stringify(Object.keys(flat.installed)),'["works","reason","installed_at"]');
});
test('a dependent work is installed by the authority when its dependency is integrated: base is the commit, depends_on the work, provenance auto',async()=>{
 const r=await chained(),s=integrate(r.state,'p1-1',c1);
 assert.equal(s.teams.team.work['p1-2'],undefined,'nothing installs without an event');
 const after=tick(s).teams.team,w=after.work['p1-2'],p=after.work_plans.p1;
 assert.deepEqual(w.manifest,{protocol:2,goal:'Fix product',criteria:['c'],criteria_digest:routingDigest(['c']),paths:['src/a.js','src/b.js'],base:c1,forbidden_actions:['network'],depends_on:['p1-1']});
 assert.deepEqual(w.plan,{plan_id:'p1',proposal_digest:p.proposal.digest,auto:true});assert.equal(w.status,'manifest');assert.equal(w.worker,'peer-d');
 assert.equal(p.pending,undefined);assert.equal(p.pending_refusals,undefined);assert.equal(p.abandoned,undefined);
 assert.equal(JSON.stringify(tick(tick(s)).teams.team.work['p1-2']),JSON.stringify(w),'idempotent: later events change nothing');
 const nothing=settle(r.state);assert.equal(JSON.stringify(nothing),JSON.stringify(r.state),'nothing integrated, nothing changes');
});
test('a chain of three: the tip of the dependencies is the base, and the middle work waits for the first',async()=>{
 const r=await chained([w3('a',[0]),w3('b',[0],[0]),w3('c',[0],[0,1])]);let s=r.state;
 assert.deepEqual(Object.keys(s.teams.team.work_plans.p1.pending),['p1-2','p1-3']);
 s=tick(integrate(s,'p1-1',c1));assert.ok(s.teams.team.work['p1-2']);assert.equal(s.teams.team.work['p1-3'],undefined,'c waits for b');assert.deepEqual(Object.keys(s.teams.team.work_plans.p1.pending),['p1-3']);
 const c2='f'.repeat(40);s=tick(integrate(s,'p1-2',c2));
 assert.equal(s.teams.team.work['p1-3'].manifest.base,c2,'the base is the commit of the tip');assert.deepEqual(s.teams.team.work['p1-3'].manifest.depends_on,['p1-1','p1-2']);assert.equal(s.teams.team.work_plans.p1.pending,undefined);
});
test('a refusal tied to a passing state is kept in the plan and retried on the next event',async()=>{
 const r=await chained(),s=integrate(r.state,'p1-1',c1);
 const busy=clone(s);busy.teams.team.work.o1={protocol:2,id:'o1',worker:'peer-d',status:'candidate',paths:['src/b.js']};
 const once=tick(busy),t1=once.teams.team,p1=t1.work_plans.p1;
 assert.equal(t1.work['p1-2'],undefined);assert.equal(p1.pending_refusals['p1-2'].code,'native-work-path-overlap');assert.ok(p1.pending['p1-2'],'still pending');assert.equal(p1.abandoned,undefined);
 const again=tick(once);assert.deepEqual(again.teams.team.work_plans.p1.pending_refusals,p1.pending_refusals,'an unchanged refusal is not rewritten');
 const freed=clone(again);freed.teams.team.work.o1.status='cancelled';
 const t2=tick(freed).teams.team;assert.ok(t2.work['p1-2'],'installed once the path is free');assert.equal(t2.work_plans.p1.pending,undefined);assert.equal(t2.work_plans.p1.pending_refusals,undefined,'the refusal is cleared');
 const noExec=clone(s);noExec.teams.team.participants['peer-d'].availability='busy';
 assert.equal(settle(noExec).teams.team.work_plans.p1.pending_refusals['p1-2'].code,'native-work-no-eligible-executor');
});
test('a refusal that cannot pass is final: the work is abandoned with the code and never retried',async()=>{
 const r=await chained(),s=integrate(r.state,'p1-1',c1);
 const expired=clone(s);expired.teams.team.native_work_policy.expires_at=new Date(now-1000).toISOString();
 const p=settle(expired).teams.team.work_plans.p1;
 assert.deepEqual(p.abandoned['p1-2'],{code:'native-work-owner-ceiling-required',at});assert.equal(p.pending,undefined);assert.equal(p.pending_refusals,undefined);
 const renewed=settle(expired);renewed.teams.team.native_work_policy.expires_at=until;assert.equal(settle(renewed).teams.team.work['p1-2'],undefined,'not retried');
 const leader=clone(s);leader.teams.team.epoch++;
 assert.equal(settle(leader).teams.team.work_plans.p1.abandoned['p1-2'].code,'native-work-plan-leader-changed');
});
test('a cancelled dependency abandons the dependent work, and so on down the chain',async()=>{
 const r=await chained([w3('a',[0]),w3('b',[0],[0]),w3('c',[0],[1])]);
 const t=send(r.state,'native-work-cancel-v2',{work_id:'p1-1',reason:'not needed'}).state.teams.team,p=t.work_plans.p1;
 assert.equal(t.work['p1-1'].status,'cancelled');
 assert.deepEqual(Object.keys(p.abandoned).sort(),['p1-2','p1-3']);assert.equal(p.abandoned['p1-2'].code,'native-work-plan-dependency-cancelled');assert.equal(p.abandoned['p1-3'].code,'native-work-plan-dependency-abandoned');assert.equal(p.pending,undefined);
 assert.equal(Object.keys(t.work).length,1);
});
test('a team without plans, a plan with nothing pending and a publication fence are not touched by the hook',async()=>{
 const {state}=await enabled();assert.equal(JSON.stringify(settle(state)),JSON.stringify(state));
 const r=await chained(),x=tick(integrate(r.state,'p1-1',c1));
 assert.equal(JSON.stringify(settle(x).teams.team.work_plans.p1),JSON.stringify(x.teams.team.work_plans.p1));
 const fenced=integrate(r.state,'p1-1',c1);fenced.publication_fence={team:'team'};assert.equal(settle(fenced).teams.team.work['p1-2'],undefined,'not under a publication fence');
});
test('the listing shows pending, abandoned and refusals of a plan as stored',async()=>{
 const r=await chained(),busy=integrate(r.state,'p1-1',c1);busy.teams.team.work.o1={protocol:2,id:'o1',worker:'peer-d',status:'candidate',paths:['src/b.js']};
 const [l]=workPlanListing(tick(busy).teams.team);assert.deepEqual(Object.keys(l.pending),['p1-2']);assert.equal(l.pending_refusals['p1-2'].code,'native-work-path-overlap');
});
