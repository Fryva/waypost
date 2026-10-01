import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTask, proposeModelRoute, routingDigest } from '../scripts/model-routing.mjs';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
const now = Date.parse('2026-10-01T12:00:00Z');
const observed_at = new Date(now-1000).toISOString(), expires_at = new Date(now+10000).toISOString();
const stamp = { source: 'synthetic-collector', observed_at, expires_at };
const manifest = { protocol: 1, goal: 'Bounded edit', base: 'fixture-base', domain: 'coding', task_class: 'bounded-edit', criteria_digest: 'a'.repeat(64), paths: ['src/a.mjs'], tools: ['edit'], isolation: 'worktree', input_tokens: 1, output_tokens: 1, attempts: 2, budget: { currency: 'USD-micro', max_units: '1000', reserved_control_units: '100' }, capability: { benchmark: 'fixture-suite', revision: 'fixture-v1', criteria_digest: 'b'.repeat(64), min_passes: 8 }, safety: { bounded: true, reversible: true, architecture: false, security: false, migration: false, publication: false, data_loss: false } };
const participants = ['strong', 'cheap', 'free'].map(id => ({ id, incarnation: id+'-inc', availability: 'ready', revoked: false, model: { provider: 'fixture', model_id: id, reasoning: 'none', model_revision: 1, resolved: true, evidence: { kind: 'adapter-observed', source: 'fixture', observed_at } } }));
const policy = { protocol: 1, mode: 'manual', revision: 1, domain: 'coding', approved_by: 'fixture', approved_at: observed_at, profiles: participants.map(p => ({ ...p.model, priorities: { coordinate: p.id==='strong'?3:1, implement: p.id==='strong'?3:1, review: p.id==='strong'?3:1 }, source: 'fixture', date: '2026-10-01' })).map(({model_revision,resolved,evidence,...p})=>p) };
function evidence(p, cost) { const route = { endpoint: 'https://example.org/fixture', account: 'fixture-account', sku: 'fixture-sku', mode: 'api', pool: 'shared-fixture-pool', model: { provider: p.model.provider, model_id: p.model.model_id, reasoning: p.model.reasoning } }; return { participant: p.id, incarnation: p.incarnation, model_revision: 1, model: route.model, route, tools: ['edit'], isolation: 'worktree', identity: {...stamp}, qualification: {...stamp, task_class: manifest.task_class, domain: 'coding', benchmark: 'fixture-suite', revision: 'fixture-v1', criteria_digest: 'b'.repeat(64), passes: 9, total_trials: 10 }, price: {...stamp, currency: 'USD-micro', route_digest: routingDigest(route), input_units_per_million: cost==='0'?'0':'1', output_units_per_million: cost==='0'?'0':'1', tool_max_units: '0'}, quota: {...stamp, pool: route.pool, available_calls: 2}, liability: {...stamp, route_digest: routingDigest(route), all_charges_bounded: true, max_units_per_attempt: cost } }; }
function fixtures() { return new Map(participants.map((p,i)=>[p.id,evidence(p,['100','10','0'][i])])); }
function propose(m=manifest, e=fixtures()) { return proposeModelRoute({manifest:m, participants, policy, verifiedEvidence:e, now}); }
test('routine route prefers qualified free execution and complex route retains strongest model',()=>{
 const routine=propose();assert.equal(routine.choice.participant,'free');assert.equal(routine.choice.total,'100');assert.equal(routine.proposal_only,true);assert.ok(routine.dispatch_blocker);
 const complex=propose({...manifest,safety:{...manifest.safety,architecture:true}});assert.equal(complex.choice.participant,'strong');assert.equal(complex.choice.total,'300');
});
test('missing risk information is complex and cache binds rules, criteria, floor and scope',()=>{
 const m=structuredClone(manifest);delete m.safety.security;assert.equal(classifyTask(m).complexity,'complex');
 const a=classifyTask(manifest);assert.notEqual(a.cache_key,classifyTask(manifest,{policy_revision:2}).cache_key);
 assert.notEqual(a.cache_key,classifyTask({...manifest,capability:{...manifest.capability,revision:'fixture-v2'}}).cache_key);
 assert.notEqual(a.manifest_digest,classifyTask({...manifest,paths:['src/b.mjs']}).manifest_digest);
});
test('missing collectors never accept hand-written trusted flags or choose zero unknown price',()=>{
 const r=proposeModelRoute({manifest:{...manifest,trusted:true,qualification:{trusted:true}},participants,policy,now});assert.equal(r.choice,null);assert.ok(r.blockers.every(b=>b.reasons.includes('trusted-collectors-unavailable')));
});
test('exact identity, task-class proof, currency, billing route and shared quota are admission gates',()=>{
 for(const mutate of [e=>e.model_revision++,e=>e.incarnation='other',e=>e.qualification.revision='other',e=>e.qualification.criteria_digest='c'.repeat(64),e=>e.qualification.total_trials=8,e=>e.price.currency='EUR',e=>e.route.account='different-account',e=>e.quota.available_calls=1,e=>e.liability.all_charges_bounded=false,e=>e.identity.observed_at=new Date(now+1000).toISOString(),e=>e.price.expires_at=new Date(now).toISOString()]){
  const es=fixtures();mutate(es.get('free'));const out=propose(manifest,es);assert.notEqual(out.choice?.participant,'free');assert.ok(out.blockers.some(b=>b.participant==='free'));
 }
});
test('complex work never substitutes weaker model because top price or budget is unavailable',()=>{
 const m={...manifest,safety:{...manifest.safety,architecture:true},budget:{...manifest.budget,max_units:'150'}};assert.equal(propose(m).choice,null);
 const es=fixtures();es.get('strong').price.expires_at=new Date(now).toISOString();assert.equal(propose({...m,budget:manifest.budget},es).choice,null);
});
test('integer costs round each rate upward and preserve reserved control/review costs',()=>{
 const es=fixtures();es.delete('free');const r=propose(manifest,es);assert.equal(r.choice.total,'120');
 es.get('cheap').liability.max_units_per_attempt='1';assert.equal(propose(manifest,es).choice.participant,'strong');
 assert.throws(()=>propose({...manifest,budget:{...manifest.budget,max_units:1000}}),/integer-money/);
});
test('routing enable is owner-only, blocks legacy assignment and preserves old event results',()=>{
 const create={type:'create',actor:'owner:fixture',owner_hash:'fixture',team:'fixture',task:'fixture.md',policy,at:observed_at};
 const old=reduceTeamEvent(null,create);assert.equal(old.state.teams.fixture.routing,undefined);
 assert.deepEqual(reduceTeamEvent(null,create),old);
 assert.throws(()=>reduceTeamEvent(old.state,{type:'routing-enable',actor:'worker',team:'fixture',at:observed_at}),/owner-required/);
 const state=reduceTeamEvent(old.state,{type:'routing-enable',actor:'owner:fixture',team:'fixture',at:observed_at}).state;
 assert.throws(()=>reduceTeamEvent(state,{type:'assign',team:'fixture',at:observed_at}),/routed-assignment-required/);
 assert.equal(old.state.teams.fixture.routing,undefined);
 const pending=structuredClone(old.state);pending.teams.fixture.work.w={status:'running'};
 assert.throws(()=>reduceTeamEvent(pending,{type:'routing-enable',actor:'owner:fixture',team:'fixture',at:observed_at}),/routing-migration/);
});
test('legacy arbitrary routing metadata does not change pre-routing assign and ack replay',()=>{
 const actor=structuredClone(participants[0]);actor.model.evidence.action='assign:fixture:strong:strong-inc:1:1:legacy-assign';
 const state=reduceTeamEvent(null,{type:'create',actor:'owner:fixture',owner_hash:'fixture',team:'fixture',task:'fixture.md',policy,at:observed_at}).state;
 const t=state.teams.fixture;t.participants.strong=actor;t.leader='strong';t.epoch=1;t.status='active';
 const cmd={type:'assign',actor:'strong',incarnation:'strong-inc',epoch:1,request_key:'legacy-assign',team:'fixture',at:observed_at,work:{id:'legacy',worker:'strong',base:'fixture',goal:'fixture',paths:['a.mjs'],criteria:['fixture'],criteria_digest:'a'.repeat(64),routing:true}};
 const assigned=reduceTeamEvent(state,cmd);assert.equal(assigned.state.teams.fixture.work.legacy.routing,true);
 const ack={type:'work-ack',actor:'strong',incarnation:'strong-inc',epoch:1,team:'fixture',at:observed_at,work_id:'legacy'};
 assert.equal(reduceTeamEvent(assigned.state,ack).result.status,'running');
 assert.deepEqual(reduceTeamEvent(state,cmd),assigned);
});
test('malformed collector records block one participant and evidence changes invalidate proposal cache',()=>{
 const base=propose();const es=fixtures();es.get('free').tools='credit';const rejected=propose(manifest,es);assert.notEqual(rejected.choice?.participant,'free');
 assert.notEqual(base.classification.cache_key,rejected.classification.cache_key);
 es.set('free',{model_revision:1,price:{...stamp},quota:{...stamp},qualification:{...stamp},identity:{...stamp}});assert.notEqual(propose(manifest,es).choice?.participant,'free');
 const renewal=fixtures();renewal.get('cheap').qualification.expires_at=new Date(now+20000).toISOString();assert.notEqual(base.classification.cache_key,propose(manifest,renewal).classification.cache_key);
 assert.ok(Date.parse(base.classification.evidence_expires_at)<=now+10000);
});
