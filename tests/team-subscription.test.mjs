import test from 'node:test';
import assert from 'node:assert/strict';
import { applySubscriptionAccounting, validateSubscriptionUnit } from '../scripts/team-subscription.mjs';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';
const at='2026-10-02T12:00:00.000Z',now=Date.parse(at),hash='a'.repeat(64),account='b'.repeat(64);
const unit={provider:'fixture',origin:'https://example.org',account,sku:'subscription-test',counter_schema:'cumulative-native-total-v1'};
const route={...unit,mode:'subscription',paid_fallback:false},model={provider:'fixture',model_id:'requested-alias',reasoning:'default'};
const H={owner:(s,c)=>{if(c.actor!=='owner:fixture')throw new Error('owner-required');}};
function fixture(){
 const s={owner_hash:'fixture',collectors:{},teams:{}},make=team=>{
  const collector='collector-'+team,p={id:'participant-'+team,incarnation:'incarnation-'+team,availability:'ready',model:{resolved:false},native_binding:{collector_id:collector,descriptor_digest:hash}};
  const t={id:team,epoch:1,quota_revision:0,participants:{[p.id]:p},work:{},leader:null,review_floor:null};
  s.teams[team]=t;s.collectors[collector]={id:collector,team,purposes:['runtime','usage'],revoked:false};return {t,p,actor:'collector:'+collector};
 };
 const first=make('first');
 const send=(t,type,data={},actor='owner:fixture')=>applySubscriptionAccounting(s,t,{type,actor,at,...data},now,H);
 const enable=x=>send(x.t,'subscription-accounting-enable-v1',{policy:{bootstrap:true},revision:1});
 const allocate=(x,max='100',revision=1)=>send(x.t,'subscription-allocation-update-v1',{unit_scope:unit,max_tokens:max,revision});
 const capture=(x,changes={})=>send(x.t,'subscription-context-capture-v1',{participant_id:x.p.id,context:{id:'context-'+x.t.id,native_id:'native-'+x.t.id,descriptor_digest:hash,incarnation:x.p.incarnation,unit_scope:unit,route,observed_model:null,observed_at:at,expires_at:'2026-10-02T12:02:00.000Z',read_only:true,owned:true,...changes}},x.actor);
 const reserve=(x,id='call-1',estimate='40',changes={})=>send(x.t,'subscription-reserve-v1',{reservation:{id,participant:x.p.id,incarnation:x.p.incarnation,context_id:'context-'+x.t.id,purpose:'identity',requested_model:model,nonce:'nonce-'+id,suite_digest:hash,max_calls:1,timeout_ms:1000,estimate_tokens:estimate,epoch:x.t.epoch,quota_revision:x.t.quota_revision,mode_revision:x.t.accounting.revision,allocation_revision:s.subscription_allocations[routingDigest(unit)].revision,...changes}});
 const consume=(x,id='call-1')=>send(x.t,'subscription-consume-v1',{invocation_id:id,nonce:'nonce-'+id},x.actor);
 const usage=(x,id='call-1',changes={})=>send(x.t,'subscription-usage-v1',{invocation_id:id,nonce:'nonce-'+id,receipt:{nonce:'nonce-'+id,context_id:'context-'+x.t.id,native_id:'native-'+x.t.id,incarnation:x.p.incarnation,unit_scope:unit,route_before:route,route_after:route,observed_model:{...model,model_id:'actually-observed-model'},coverage:'complete',before:'0',after:'30',actual_tokens:'30',...changes}},x.actor);
 const ready=(x=first)=>{enable(x);if(!s.subscription_allocations)allocate(x);capture(x);};
 return {s,...first,first,make,send,enable,allocate,capture,reserve,consume,usage,ready};
}
test('bootstrap accounting binds unknown identity without promoting protected roles or legacy model state',()=>{
 const f=fixture();f.ready();const before=structuredClone({model:f.p.model,leader:f.t.leader,floor:f.t.review_floor});
 assert.equal(f.reserve(f.first).result.bootstrap_only,true);assert.equal(f.consume(f.first).result.bootstrap_only,true);
 assert.equal(f.usage(f.first).result.actual_tokens,'30');
 assert.deepEqual({model:f.p.model,leader:f.t.leader,floor:f.t.review_floor},before);
 assert.equal(f.t.routing.protocol,3);assert.equal(f.t.routing.required,true);assert.equal(f.t.routing.accounting_mode,'subscription-tokens');
 assert.equal(applySubscriptionAccounting(f.s,f.t,{type:'unrelated'},now,H),null);
});
test('owner opt-in cannot reinterpret unfinished strict work, runtime or reviews',()=>{
 for(const prepare of [f=>f.s.invocations={old:{team:f.t.id,state:'dispatching'}},f=>f.t.work={old:{status:'blocked'}},f=>f.t.review_requests={old:{consumed:true}},f=>f.t.runtime_requests={old:{consumed:true}},f=>f.t.deliveries={old:{state:'uncertain'}}]) {
  const f=fixture();prepare(f);const before=structuredClone(f.t);
  assert.throws(()=>f.enable(f.first),/unfinished/);assert.deepEqual(f.t,before);
 }
 const f=fixture();f.s.invocations={old:{team:f.t.id,state:'settled',actual_units:'7',currency:'USD-micro'}};f.enable(f.first);
 assert.equal(f.s.invocations.old.actual_units,'7');
 assert.throws(()=>f.send(f.t,'subscription-accounting-enable-v1',{policy:{bootstrap:true},revision:2},f.actor),/owner/);
});
test('shared account allocation counts concurrent reservations across teams once',()=>{
 const f=fixture(),second=f.make('second');f.ready();f.enable(second);f.capture(second);
 f.reserve(f.first,'call-1','70');assert.throws(()=>f.reserve(second,'call-2','31'),/allocation-exceeded/);
 f.reserve(second,'call-2','30');assert.equal(Object.keys(f.s.subscription_invocations).length,2);
 f.consume(f.first);assert.throws(()=>f.consume(f.first),/already-consumed/);
 f.usage(f.first);f.reserve(second,'call-3','40');
 assert.equal(Object.keys(f.s.subscription_allocations).length,1);
});
test('terminal usage survives stale epoch, budget revision and exhausted quota while old admission cannot dispatch',()=>{
 const f=fixture();f.ready();f.reserve(f.first);f.consume(f.first);f.t.epoch++;f.t.quota_revision++;
 f.allocate(f.first,'200',2);f.p.quota_observation={status:'exhausted'};
 assert.equal(f.usage(f.first).result.settled,'call-1');
 assert.throws(()=>f.reserve(f.first,'call-2'),/quota-exhausted/);
 const other=fixture();other.ready();other.reserve(other.first);other.allocate(other.first,'200',2);
 assert.throws(()=>other.consume(other.first),/stale-admission/);
});
test('partial or absent usage retains reservation and blocks new calls without charging zero',()=>{
 for(const coverage of ['partial','absent']) {
  const f=fixture();f.ready();f.reserve(f.first);f.consume(f.first);
  assert.equal(f.usage(f.first,'call-1',{coverage,before:undefined,after:undefined,actual_tokens:undefined}).result.reservation_retained,true);
  assert.equal(f.s.subscription_invocations['call-1'].state,'uncertain');
  assert.equal(f.s.subscription_invocations['call-1'].charged_tokens,undefined);
  assert.throws(()=>f.reserve(f.first,'call-2'),/uncertain-usage/);
  assert.equal(f.usage(f.first).result.actual_tokens,'30');
 }
});
test('genuine overshoot is persisted and blocks future admission until explicit owner allocation increase',()=>{
 const f=fixture();f.ready();f.reserve(f.first);f.consume(f.first);
 const result=f.usage(f.first,'call-1',{after:'130',actual_tokens:'130'}).result;
 assert.equal(result.overshoot,true);assert.equal(result.allocation_blocked,true);assert.equal(f.s.subscription_invocations['call-1'].charged_tokens,'130');
 assert.throws(()=>f.reserve(f.first,'call-2'),/overshoot/);
 assert.throws(()=>f.allocate(f.first,'200',1),/increase-required/);
 assert.throws(()=>f.allocate(f.first,'100',2),/increase-required/);
 f.allocate(f.first,'200',2);f.reserve(f.first,'call-2');
});
test('duplicate settled receipt is idempotent, overlapping or duplicate native spans do not charge twice',()=>{
 const f=fixture();f.ready();f.reserve(f.first);f.consume(f.first);f.usage(f.first);
 assert.equal(f.usage(f.first).result.unchanged,true);
 f.reserve(f.first,'call-2');f.consume(f.first,'call-2');
 for(const changes of [{},{before:'20',after:'50',actual_tokens:'30'}])assert.throws(()=>f.usage(f.first,'call-2',changes),/span-already-accounted/);
 assert.equal(f.s.subscription_invocations['call-2'].state,'consumed');
 assert.equal(f.usage(f.first,'call-2',{before:'30',after:'50',actual_tokens:'20'}).result.actual_tokens,'20');
});
test('malformed or mismatched receipts preserve consumed state and budget reservation',()=>{
 for(const change of [{native_id:'foreign-native'},{context_id:'foreign-context'},{incarnation:'wrong'},{unit_scope:{...unit,account:'c'.repeat(64)}},{route_after:{...route,paid_fallback:true}},{actual_tokens:'29'},{before:'31'},{after:'-1'},{actual_tokens:30}]) {
  const f=fixture();f.ready();f.reserve(f.first);f.consume(f.first);const before=structuredClone(f.s.subscription_invocations['call-1']);
  assert.throws(()=>f.usage(f.first,'call-1',change));assert.deepEqual(f.s.subscription_invocations['call-1'],before);
 }
});
test('context capture and consumption require same registered runtime and usage collector incarnation',()=>{
 const f=fixture();f.enable(f.first);f.allocate(f.first);
 assert.throws(()=>f.send(f.t,'subscription-context-capture-v1',{participant_id:f.p.id,context:{}},'owner:fixture'),/collector/);
 assert.throws(()=>f.capture(f.first,{route:{...route,mode:'api'}}),/route/);
 assert.throws(()=>f.capture(f.first,{descriptor_digest:'c'.repeat(64)}),/binding/);
 f.capture(f.first);f.reserve(f.first);f.p.incarnation='replacement';
 assert.throws(()=>f.consume(f.first),/binding/);
 const g=fixture();g.ready();g.reserve(g.first);g.s.collectors['collector-first'].purposes=['runtime'];
 assert.throws(()=>g.consume(g.first),/collector/);
});
test('bootstrap bounds forbid worker or review purposes, unbounded calls and nondecimal estimates',()=>{
 for(const changes of [{purpose:'worker'},{purpose:'review'},{max_calls:2},{timeout_ms:300001},{estimate_tokens:'1.5'},{estimate_tokens:'01'},{estimate_tokens:'1000000000000000000'},{suite_digest:'not-a-digest'},{epoch:0}]) {
  const f=fixture();f.ready();assert.throws(()=>f.reserve(f.first,'call-1','40',changes));assert.equal(f.s.subscription_invocations,undefined);
 }
 assert.throws(()=>validateSubscriptionUnit({...unit,origin:'http://example.org'}));
 assert.throws(()=>validateSubscriptionUnit({...unit,account:'raw-account-secret'}));
});
test('abort releases only prepared undispatched operation; consumed uncertainty retains all budget',()=>{
 const f=fixture();f.ready();f.reserve(f.first);
 f.send(f.t,'subscription-abort-v1',{invocation_id:'call-1',nonce:'nonce-call-1'});f.reserve(f.first,'call-2','100');f.consume(f.first,'call-2');
 assert.throws(()=>f.send(f.t,'subscription-abort-v1',{invocation_id:'call-2',nonce:'nonce-call-2'}),/undispatched/);
 f.send(f.t,'subscription-uncertain-v1',{invocation_id:'call-2',nonce:'nonce-call-2'},f.actor);
 assert.throws(()=>f.send(f.t,'subscription-accounting-enable-v1',{policy:{bootstrap:true},revision:2}),/unfinished/);
 assert.throws(()=>f.reserve(f.first,'call-3','1'),/uncertain/);
});
test('actual team reducer enforces owner opt-in, routing migration and outstanding subscription close gate',()=>{
 const f=fixture();f.t.status='paused';f.s.task_bindings={task:'first'};f.t.task='task';
 let state=reduceTeamEvent(f.s,{type:'subscription-accounting-enable-v1',team:f.t.id,actor:'owner:fixture',at,policy:{bootstrap:true},revision:1}).state;
 assert.equal(state.teams.first.routing.required,true);
 const response=reduceTeamEvent(f.s,{type:'subscription-accounting-enable-v1',team:f.t.id,actor:'owner:fixture',at,policy:{bootstrap:true},revision:1}).result;
 assert.equal(response.mode,'subscription-tokens');assert.equal(response.handled,undefined);
 assert.throws(()=>reduceTeamEvent(state,{type:'assign',team:'first',actor:f.p.id,incarnation:f.p.incarnation,at,epoch:1,work:{}}),/routed-assignment-required/);
 assert.throws(()=>reduceTeamEvent(state,{type:'routing-enable-v2',team:'first',actor:'owner:fixture',at}),/subscription/);
 state.subscription_invocations={pending:{id:'pending',team:'first',state:'uncertain'}};
 for(const type of ['close','close-v1'])assert.throws(()=>reduceTeamEvent(state,{type,team:'first',actor:'owner:fixture',at}),/subscription|unresolved/);
 assert.equal(state.subscription_invocations.pending.state,'uncertain');
});
test('unknown observed reasoning is accounted honestly without resolving or promoting model identity',()=>{
 for(const reasoning of ['unknown',null]) {
  const f=fixture();f.ready();f.reserve(f.first);f.consume(f.first);
  const observed={provider:'fixture',model_id:'actually-observed-model',reasoning};
  assert.equal(f.usage(f.first,'call-1',{observed_model:observed}).result.actual_tokens,'30');
  assert.deepEqual(f.s.subscription_invocations['call-1'].receipt.observed_model,observed);
  assert.deepEqual(f.p.model,{resolved:false});assert.equal(f.t.leader,null);assert.equal(f.t.review_floor,null);
 }
});

test('renaming a captured context cannot charge the same native counter span again',()=>{
 const f=fixture();f.ready();f.reserve(f.first);f.consume(f.first);f.usage(f.first);
 f.capture(f.first,{id:'renamed-context'});f.reserve(f.first,'call-2','40',{context_id:'renamed-context'});f.consume(f.first,'call-2');
 assert.throws(()=>f.usage(f.first,'call-2',{context_id:'renamed-context'}),/span-already-accounted/);
 assert.equal(f.s.subscription_invocations['call-2'].state,'consumed');
});

test('any observed overshoot blocks pending and future calls until a subsequent owner increase',()=>{
 const f=fixture();f.ready();f.reserve(f.first);f.reserve(f.first,'call-2','40');f.consume(f.first);
 f.allocate(f.first,'200',2);
 assert.equal(f.usage(f.first,'call-1',{after:'50',actual_tokens:'50'}).result.allocation_blocked,true);
 assert.throws(()=>f.reserve(f.first,'call-3','1'),/overshoot/);
 assert.throws(()=>f.consume(f.first,'call-2'),/stale-admission/);
 f.allocate(f.first,'300',3);f.reserve(f.first,'call-3','1');
 const g=fixture();g.ready();g.reserve(g.first);g.reserve(g.first,'call-2','40');g.consume(g.first);
 g.usage(g.first,'call-1',{after:'50',actual_tokens:'50'});
 assert.throws(()=>g.consume(g.first,'call-2'),/overshoot/);
});
