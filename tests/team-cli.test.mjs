import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../bin/waypost', import.meta.url));
const tmp = [];
after(() => tmp.forEach(p => rmSync(p, { recursive: true, force: true })));
function fixture() {
 const root = realpathSync(mkdtempSync(join(tmpdir(), 'waypost-team-cli-'))); tmp.push(root);
 mkdirSync(join(root, '.waypost')); mkdirSync(join(root, 'vault'));
 writeFileSync(join(root, '.waypost/projectstore.json'), JSON.stringify({ vault_path: 'vault', language: 'en', layout: 'engineering' }));
 writeFileSync(join(root, 'vault/task.md'), '---\ntype: epic\nid: fixture-task\ntitle: Fixture task\nstatus: planned\n---\n');
 const at = new Date().toISOString();
 const policy = { protocol: 1, mode: 'manual', revision: 1, domain: 'fixture', approved_by: 'fixture', approved_at: at, profiles: [{ provider: 'fixture', model_id: 'fixture-model', reasoning: 'fixture', priorities: { coordinate: 1, implement: 1, review: 1 }, source: 'fixture', date: at.slice(0,10) }] };
 writeFileSync(join(root, 'policy.json'), JSON.stringify(policy));
 writeFileSync(join(root, 'model.json'), JSON.stringify({ provider: 'fixture', model_id: 'fixture-model', reasoning: 'fixture', model_revision: 1, resolved: true, evidence: { kind: 'adapter-observed', source: 'fixture', observed_at: at } }));
 function run(...args) { return spawnSync(process.execPath, [cli, 'team', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, WAYPOST_PROJECT_DIR: root, WAYPOST_NO_BEAT: '1', WAYPOST_SESSION_ID: 'inherited-test-session' } }); }
 function ok(...args) { const r = run(...args); assert.equal(r.status, 0, r.stderr || r.stdout); return JSON.parse(r.stdout); }
 ok('create','vault/task.md','--id','fixture-team','--policy','policy.json','--confirm-local');
 return { root, run, ok };
}
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
