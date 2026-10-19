// Children spawned from this file never move a developer's real machine state.
import "./env.mjs";
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { authorityFixture, now as fxNow, at as nowAt } from './helpers/native-calibration.mjs';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
import { rolesListing, ownerAssignFields, participantBinary } from '../scripts/team-cli.mjs';
const cli = fileURLToPath(new URL('../bin/waypost', import.meta.url));
const tmp = [];
after(() => tmp.forEach(p => rmSync(p, { recursive: true, force: true })));
function fixture({ storyStatus } = {}) {
 const root = realpathSync(mkdtempSync(join(tmpdir(), 'waypost-team-cli-'))); tmp.push(root);
 mkdirSync(join(root, '.waypost')); mkdirSync(join(root, 'vault'));
 writeFileSync(join(root, '.waypost/projectstore.json'), JSON.stringify({ vault_path: 'vault', language: 'en', layout: 'engineering' }));
 const task = storyStatus ? 'epics/FX/stories/story-fixture.md' : 'task.md';
 const taskPath = join(root, 'vault', task);
 mkdirSync(dirname(taskPath), { recursive: true });
 writeFileSync(taskPath, storyStatus
  ? `---\ntype: story\nid: story-fixture\nepic: FX\ntitle: Fixture story\nstatus: ${storyStatus}\n---\n`
  : '---\ntype: epic\nid: fixture-task\ntitle: Fixture task\nstatus: planned\n---\n');
 const at = new Date().toISOString();
 const policy = { protocol: 1, mode: 'manual', revision: 1, domain: 'fixture', approved_by: 'fixture', approved_at: at, profiles: [{ provider: 'fixture', model_id: 'fixture-model', reasoning: 'fixture', priorities: { coordinate: 1, implement: 1, review: 1 }, source: 'fixture', date: at.slice(0,10) }] };
 writeFileSync(join(root, 'policy.json'), JSON.stringify(policy));
 writeFileSync(join(root, 'model.json'), JSON.stringify({ provider: 'fixture', model_id: 'fixture-model', reasoning: 'fixture', model_revision: 1, resolved: true, evidence: { kind: 'adapter-observed', source: 'fixture', observed_at: at } }));
 function runCli(...args) { return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, WAYPOST_PROJECT_DIR: root, WAYPOST_NO_BEAT: '1', WAYPOST_SESSION_ID: 'inherited-test-session' } }); }
 function run(...args) { return runCli('team', ...args); }
 function ok(...args) { const r = run(...args); assert.equal(r.status, 0, r.stderr || r.stdout); return JSON.parse(r.stdout); }
 if (storyStatus==='in-progress') {
  const claim=runCli('sessions','--claim',taskPath);
  assert.equal(claim.status,0,claim.stderr);
  assert.match(claim.stdout,/claimed/, 'seed the claim before team binding forbids legacy claims');
 }
 ok('create',join('vault',task),'--','--id','fixture-team','--policy','policy.json','--confirm-local');
 return { root, run, runCli, ok, taskPath };
}

test('real CLI refuses team-bound story writes before lifecycle, authority, claims or views change', () => {
 // No Git fixture: all coordination, including authority and claims, is under
 // this vault. Compare file bytes, not mtimes or the transient authority mutex.
 const snapshot = (dir) => {
  const files = {};
  const walk = (path, prefix = '') => {
   for (const entry of readdirSync(path, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) walk(join(path, entry.name), name + '/');
    else files[name] = readFileSync(join(path, entry.name)).toString('base64');
   }
  };
  walk(dir); return files;
 };
 for (const [operation, storyStatus] of [['plan','planned'],['close','in-progress']]) {
  const f=fixture({storyStatus}),vault=join(f.root,'vault');
  // Existing bytes make an accidental reconciliation observable, rather than
  // merely checking an artifact after it was refused.
  for (const name of ['kanban.md','graph.md','code-map.md']) writeFileSync(join(vault,name),'retained '+name+'\n');
  const before=snapshot(vault);
  const preview=f.runCli('story',operation,f.taskPath);
  assert.equal(preview.status,0,preview.stderr);
  assert.match(preview.stdout,/"changed": true/, 'exercise a real transition, not the no-op early return');
  assert.deepEqual(snapshot(vault),before,'preview does not mutate the vault');
  const refused=f.runCli('story',operation,f.taskPath,'--write');
  assert.equal(refused.status,1,refused.stderr);
  assert.match(refused.stderr,new RegExp('team-bound-artifact-use-team-workflow:fixture-team:'+operation));
  assert.deepEqual(snapshot(vault),before,'refusal precedes every vault/coordination write');

  const unbound=join(dirname(f.taskPath),'story-unbound.md');
  writeFileSync(unbound,readFileSync(f.taskPath,'utf8').replace('id: story-fixture','id: story-unbound').replace('status: in-progress','status: planned'));
  for (const mode of ['plan','close']) {
   const result=f.runCli('story',mode,unbound,'--write');
   assert.equal(result.status,0,result.stderr);
   assert.match(readFileSync(unbound,'utf8'),new RegExp('status: '+(mode==='plan'?'in-progress':'done')));
   assert.match(readFileSync(unbound,'utf8'),new RegExp((mode==='plan'?'started_at':'closed_at')+': "?\\d{4}-'));
   assert.match(result.stdout,mode==='plan'?/claimed/:/released/);
  }
 }
});
test('real CLI creates one task owner and independent parent/child inboxes', () => {
 const f=fixture();
 const a=f.ok('join','fixture-team','--model','model.json','--credential','a.json');
 const b=f.ok('join','fixture-team','--model','model.json','--credential','b.json');
 assert.notEqual(a.result.participant,b.result.participant);
 const status=f.ok('status','fixture-team');
 assert.equal(status.teams[0].participants[a.result.participant].session,status.teams[0].participants[b.result.participant].session);
 assert.equal(f.run('create','vault/task.md','--id','other-team','--policy','policy.json').status,1);
 const candidate=f.ok('status','fixture-team').teams[0].candidate;
 const leaderFile=candidate===a.result.participant?'a.json':'b.json';
 f.ok('leader-ack','fixture-team','--credential',leaderFile);
 writeFileSync(join(f.root,'message.json'),JSON.stringify({payload:{question:'fixture nonce'},request_key:'fixture-message'}));
 const sent=f.ok('send','fixture-team','--credential','a.json','--to',b.result.participant,'--kind','question','--request-file','message.json');
 const own=f.ok('poll','fixture-team','--credential','a.json'); assert.equal(own.messages.length,0);
 const inbox=f.ok('poll','fixture-team','--credential','b.json'); assert.equal(inbox.messages.length,1); assert.equal(inbox.messages[0].payload.question,'fixture nonce');
 assert.equal(f.run('ack','fixture-team','--credential','a.json','--message',sent.result.id).status,1);
 f.ok('ack','fixture-team','--credential','b.json','--message',sent.result.id);
 assert.equal(f.run('poll','fixture-team','--credential','a.json','--cursor',inbox.cursor).status,1);
 f.ok('revoke','fixture-team','--participant',b.result.participant);
 assert.equal(f.run('poll','fixture-team','--credential','b.json').status,1);
});
test('join retries preserve participant and credential without duplicate enrollment', () => {
 const f=fixture();
 const a=f.ok('join','fixture-team','--model','model.json','--credential','a.json');
 const b=f.ok('join','fixture-team','--model','model.json','--credential','a.json');
 assert.equal(b.replayed,true); assert.equal(a.result.participant,b.result.participant);
 assert.equal(Object.keys(f.ok('status','fixture-team').teams[0].participants).length,1);
 const credential=JSON.parse(readFileSync(join(f.root,'a.json'),'utf8')); credential.token='wrong-credential-'.repeat(4);
 writeFileSync(join(f.root,'bad.json'),JSON.stringify(credential));
 assert.equal(f.run('leader-ack','fixture-team','--credential','bad.json').status,1);
});
test('CLI awaits owned checkout and candidate failures and registers private participant hosts',()=>{
 const f=fixture(),joined=f.ok('join','fixture-team','--model','model.json','--credential','a.json'),id=joined.result.participant;
 writeFileSync(join(f.root,'native.json'),JSON.stringify({managed:true,harness:'codex',cwd:f.root,mode:'read-only'}));
 const args=['host','fixture-team','--participant',id,'--credential','a.json'];
 f.ok(...args,'--operation','bootstrap','--descriptor-file','native.json');
 f.ok(...args,'--operation','register-participant-host');
 assert.ok(f.ok('status','fixture-team').teams[0].participants[id].host_binding);
 for(const operation of ['checkout','candidate']){
  const result=f.run(...args,'--operation',operation,'--work','missing');assert.equal(result.status,1);assert.notEqual(result.stdout.trim(),'{}');assert.match(result.stderr,/work|candidate|scope/);
 }
});
test('routing CLI preview grants no authority and enabled routing cannot use legacy assignment',()=>{
 const f=fixture();const joined=f.ok('join','fixture-team','--model','model.json','--credential','a.json');
 f.ok('leader-ack','fixture-team','--credential','a.json');
 const manifest={protocol:1,goal:'Bounded fixture edit',base:'fixture-base',domain:'fixture',task_class:'fixture-class',criteria_digest:'a'.repeat(64),paths:['a.mjs'],tools:[],isolation:'worktree',input_tokens:1,output_tokens:1,attempts:1,budget:{currency:'USD-micro',max_units:'100',reserved_control_units:'10'},capability:{benchmark:'fixture-suite',revision:'1',criteria_digest:'b'.repeat(64),min_passes:1},safety:{bounded:true,reversible:true,architecture:false,security:false,migration:false,publication:false,data_loss:false}};
 writeFileSync(join(f.root,'manifest.json'),JSON.stringify({...manifest,trusted:true,verifiedEvidence:{trusted:true}}));
 const before=f.ok('status','fixture-team');const preview=f.ok('route','fixture-team','--request-file','manifest.json');
 assert.equal(preview.choice,null);assert.equal(preview.proposal_only,true);assert.equal(preview.revision,before.revision);
 assert.equal(f.run('routing-enable','fixture-team','--owner-credential','a.json').status,1);
 f.ok('routing-enable','fixture-team');
 assert.match(f.run('assign','fixture-team','--credential','a.json').stderr,/routed-assignment-required/);
 const credential=JSON.parse(readFileSync(join(f.root,'a.json'),'utf8'));
 const model=JSON.parse(readFileSync(join(f.root,'model.json'),'utf8'));
 model.evidence.action=['assign-routed-v1','fixture-team',joined.result.participant,credential.incarnation,1,1,'fixture-route'].join(':');
 writeFileSync(join(f.root,'bound.json'),JSON.stringify(model));
 f.ok('attest','fixture-team','--participant',joined.result.participant,'--model','bound.json');
 writeFileSync(join(f.root,'route-request.json'),JSON.stringify({manifest,request_key:'fixture-route',trusted:true,verifiedEvidence:{trusted:true}}));
 const current=f.ok('status','fixture-team');
 const refused=f.run('assign-routed-v1','fixture-team','--credential','a.json','--request-file','route-request.json');
 assert.equal(refused.status,1);assert.match(refused.stderr,/trusted-routing-collectors-unavailable/);
 assert.deepEqual(f.ok('status','fixture-team'),current);
});

test('subscription opt-in is owner-only, replayable and reports actual unavailable native capabilities',()=>{
 const f=fixture();f.ok('join','fixture-team','--model','model.json','--credential','a.json');
 const request={policy:{bootstrap:true},revision:1,at:new Date().toISOString()};
 writeFileSync(join(f.root,'subscription.json'),JSON.stringify(request));
 const args=['subscription-accounting-enable-v1','fixture-team','--request-file','subscription.json','--request-key','subscription-mode'];
 const refused=f.run(...args,'--owner-credential','a.json');assert.equal(refused.status,1);assert.match(refused.stderr,/owner/);
 const enabled=f.ok(...args);assert.equal(enabled.result.mode,'subscription-tokens');
 assert.equal(f.ok(...args).replayed,true);
 const status=f.ok('status','fixture-team').teams[0];
 assert.equal(status.accounting_capabilities.native_dispatch,'blocked');
 assert.equal(status.accounting_capabilities.provider_enforced_spend,false);
 assert.equal(status.accounting_capabilities.exclusive_provider_quota,false);
 assert.match(f.run('routing-enable-v2','fixture-team').stderr,/subscription-mode-migration-required/);
});

test('owner selects inherited-native v2 with local token telemetry capability and no paid fallback guarantee',()=>{
 const f=fixture();f.ok('join','fixture-team','--model','model.json','--credential','a.json');
 writeFileSync(join(f.root,'native-accounting.json'),JSON.stringify({policy:{bootstrap:true,billing_policy:'inherited-native'},revision:1,at:new Date().toISOString()}));
 const result=f.ok('subscription-accounting-enable-v2','fixture-team','--request-file','native-accounting.json','--request-key','native-mode');
 assert.equal(result.result.billing_policy,'inherited-native');const status=f.ok('status','fixture-team').teams[0];
 assert.equal(status.accounting_capabilities.calibration_policy_activation,false);
 assert.match(f.run('host','fixture-team','--operation','calibration-summary','--cohort','missing').stderr,/opened-cohort-required/);
 assert.equal(status.accounting.protocol,2);assert.equal(status.accounting_capabilities.native_dispatch,'bounded-codex-claude-opencode-identity-and-fixed-trials');
 assert.equal(status.accounting_capabilities.provider_enforced_spend,false);assert.equal(status.accounting_capabilities.exclusive_provider_quota,false);
 assert.match(f.run('routing-enable','fixture-team').stderr,/subscription-mode-migration-required/);
});
// Owner-assigned roles (ADR owner-assigned-team-roles, slice 2).
const dayMs = 86400000, legacyPolicy = { protocol: 1, revision: 1, domain: 'coding', mode: 'automatic', generated_at: nowAt, expires_at: new Date(fxNow + 600000).toISOString(), sources: [{ id: 'fixture', url: 'https://example.org/fixture', retrieved_at: nowAt }], evidence_floor: ['adapter-observed'], profiles: [] };
async function identityFixture() {
 const f = await authorityFixture({ identityOnly: {} }), s = structuredClone(f.state);
 Object.assign(s, { protocol: 1, owner_hash: 'fixture', task_bindings: { task: 'team' } });
 Object.assign(s.teams.team, { task: 'task', policy: legacyPolicy, messages: [], work: {}, status: 'forming', leader: null, candidate: null, required_review_models: [], native_policy_bootstrap: true });
 return s;
}
const issuer = { harness: 'claude', session: 'cli-test' };
const assignEvent = fields => ({ type: 'native-policy-assign-v2', team: 'team', actor: 'owner:fixture', at: nowAt, request_key: 'cli', ...fields });
test('team roles lists participants without identities and refuses to assign without consent or identities', () => {
 const f = fixture(), a = f.ok('join', 'fixture-team', '--model', 'model.json', '--credential', 'a.json');
 const out = f.ok('roles', 'fixture-team', '--json');
 assert.equal(out.participants.length, 1); assert.equal(out.participants[0].participant, a.result.participant); assert.equal(out.participants[0].identity, null); assert.equal(out.policy.mode, 'manual');
 assert.match(f.run('roles', 'fixture-team').stdout, /identity none observed/);
 const base = ['roles', 'fixture-team', '--assign', '--coordinator', a.result.participant, '--reviewers', a.result.participant];
 assert.match(f.run(...base).stderr, /owner-consent-required/);
 assert.match(f.run(...base, '--yes').stderr, /owner-consent-required/);
 assert.match(f.run(...base, '--yes', '--reason', 'because').stderr, /identity-observation-required:/);
 // A participant credential is not the owner's.
 const notOwner = f.run(...base, '--yes', '--reason', 'because', '--owner-credential', 'a.json', '--expires-at', new Date(Date.now() + dayMs).toISOString());
 assert.notEqual(notOwner.status, 0); assert.doesNotMatch(notOwner.stderr, /consent/);
});
test('team roles reads the latest identity into the listing and builds a command the reducer accepts', async () => {
 const s = await identityFixture(), t = s.teams.team;
 const out = rolesListing(s, t); assert.equal(out.participants.length, 4);
 const a = out.participants.find(p => p.participant === 'peer-a');
 assert.match(a.identity.profile_id, /^native-profile-/); assert.equal(a.identity.native_model, 'model-a'); assert.equal(a.identity.expires_at, new Date(fxNow + 900000).toISOString());
 assert.equal(out.participants.every(p => p.calibration_hint === undefined), true); assert.equal(rolesListing(s, t, {}).participants[0].calibration_hint, null);
 const fields = ownerAssignFields(s, t, { coordinator: 'peer-a', reviewers: 'peer-b, peer-c', executors: 'peer-d', reason: 'chosen', issuedBy: issuer, now: Date.parse(nowAt) });
 assert.deepEqual([fields.coordinator, fields.reviewers, fields.executors], [['peer-a'], ['peer-b', 'peer-c'], ['peer-d']]);
 assert.equal(fields.expires_at, new Date(Date.parse(nowAt) + 7 * dayMs).toISOString()); assert.equal(fields.expected_policy_revision, 1);
 assert.throws(() => ownerAssignFields(s, t, { coordinator: 'peer-z', reviewers: 'peer-b', reason: 'x', issuedBy: issuer, now: Date.parse(nowAt) }), /unknown-participant:peer-z/);
 const next = reduceTeamEvent(s, assignEvent(fields)).state;
 assert.equal(next.teams.team.policy.mode, 'owner-assigned'); assert.equal(next.teams.team.candidate, 'peer-a'); assert.ok(next.teams.team.review_candidate);
 const assigned = JSON.parse(JSON.stringify(rolesListing(next, next.teams.team)));
 assert.deepEqual(assigned.policy.assignment.reviewers, ['peer-b', 'peer-c']); assert.equal(assigned.policy.assignment.issued_by.session, 'cli-test'); assert.equal(assigned.policy.mode, 'owner-assigned');
});
test('the default assign expiry is bounded by the earliest listed identity', async () => {
 const s = await identityFixture(), t = s.teams.team;
 for (const x of Object.values(s.subscription_invocations)) if (x.participant === 'peer-b') x.identity_observation.observed_at = new Date(Date.parse(nowAt) - dayMs).toISOString();
 const f = ownerAssignFields(s, t, { coordinator: 'peer-a', reviewers: 'peer-b', reason: 'x', issuedBy: issuer, now: Date.parse(nowAt) });
 assert.equal(f.expires_at, new Date(Date.parse(nowAt) - dayMs + 7 * dayMs).toISOString());
 for (const x of Object.values(s.subscription_invocations)) if (x.participant === 'peer-d') delete x.identity_observation;
 assert.throws(() => ownerAssignFields(s, t, { coordinator: 'peer-a', reviewers: 'peer-d', reason: 'x', issuedBy: issuer, now: Date.parse(nowAt) }), /identity-observation-required:peer-d/);
 for (const x of Object.values(s.subscription_invocations)) if (x.participant === 'peer-c') x.identity_observation.expires_at = nowAt;
 assert.throws(() => ownerAssignFields(s, t, { coordinator: 'peer-a', reviewers: 'peer-c', reason: 'x', issuedBy: issuer, now: Date.parse(nowAt) }), /identity-observation-expired:peer-c/);
});

test('team roles names each bound binary as verified, unverified or not pinned', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waypost-roles-binary-')); after(() => rmSync(dir, { recursive: true, force: true }));
  const endpoint = join(dir, 'endpoint.json'); writeFileSync(endpoint, JSON.stringify({ protocol: 1, descriptor: { harness: 'claude', managed: true } }));
  const seen = [], status = d => { seen.push(d.harness); return { version: '2.1.300', verified: false, blocker: 'native-claude-preflight-version-unverified' }; };
  assert.equal(participantBinary({ native_binding: null }, status), null);
  assert.deepEqual(participantBinary({ native_binding: { endpoint_file: endpoint } }, status), { version: '2.1.300', verified: false, blocker: 'native-claude-preflight-version-unverified' });
  assert.equal(participantBinary({ native_binding: { endpoint_file: join(dir, 'missing.json') } }, status).blocker, 'endpoint-file-unreadable');
  assert.deepEqual(seen, ['claude']);
  const s = await identityFixture(), t = s.teams.team, listed = rolesListing(s, t, null, p => p.id === 'peer-a' ? { version: '2.1.300', verified: false, blocker: 'x' } : null);
  assert.equal(listed.participants.find(p => p.participant === 'peer-a').binary.verified, false); assert.equal(listed.participants.find(p => p.participant === 'peer-b').binary, null);
});
