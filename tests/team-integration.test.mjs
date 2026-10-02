import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createIntegrationCheckout, collectCandidate, publishCandidate, reconcilePublication, publicationMessageDigest } from '../scripts/team-integration.mjs';
function git(root, ...args) { const r = spawnSync('git', ['-C',root,...args], {encoding:'utf8'}); assert.equal(r.status,0,r.stderr); return r.stdout.trim(); }
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(),'wp-integration-'))); t.after(()=>rmSync(root,{recursive:true,force:true}));
  const project = join(root,'project'); mkdirSync(project);
  git(project,'init','-q'); git(project,'config','user.name','Fixture'); git(project,'config','user.email','fixture@example.com');
  writeFileSync(join(project,'a.txt'),'base\n'); writeFileSync(join(project,'other.txt'),'base\n'); git(project,'add','.'); git(project,'commit','-qm','base');
  const base = git(project,'rev-parse','HEAD');
  const checkout = createIntegrationCheckout({projectRoot:project,authorityDir:join(root,'authority'),teamId:'team',workId:'work',base});
  writeFileSync(join(checkout.path,'a.txt'),'candidate\n');
  const candidate = collectCandidate({checkout,scope:['a.txt'],testDigests:['a'.repeat(64)]});
  const reservation = {state:'publishing',id:'reservation1',candidate_digest:candidate.digest,expected_head:base,tree:candidate.tree,parents:[base],reviews:['review1'],commit_identity:{name:'Fixture',email:'fixture@example.com',date:'1790812800 +0000'}};
  const trailers={Harness:'codex',Session:'session',Provider:'openai',Story:'WP-20/story',Contributors:'worker1'};
  reservation.commit_message_digest = publicationMessageDigest({checkout,reservation,message:'Integrate candidate',trailers});
  return {root,project,base,checkout,candidate,reservation,trailers,message:'Integrate candidate'};
}
test('owned integration excludes main staging and preserves main HEAD and staged intent',t=>{
  const f=fixture(t); writeFileSync(join(f.project,'other.txt'),'foreign staging\n'); git(f.project,'add','other.txt');
  const index=git(f.project,'write-tree'); const result=publishCandidate(f);
  assert.equal(git(f.project,'rev-parse','HEAD'),f.base); assert.equal(git(f.project,'write-tree'),index);
  assert.equal(git(f.checkout.path,'rev-parse','HEAD'),result.commit); assert.equal(git(f.checkout.path,'diff','--cached','--name-only'),'');
  assert.equal(git(f.project,'show',result.commit+':a.txt'),'candidate');
  assert.equal(git(f.project,'show',result.commit+':other.txt'),'base');
});
test('candidate rejects extra paths, staged intent and symlink escapes',t=>{
  const f=fixture(t); writeFileSync(join(f.checkout.path,'other.txt'),'extra');
  assert.throws(()=>collectCandidate({checkout:f.checkout,scope:['a.txt']}),{code:'integration-outside-scope'});
  git(f.checkout.path,'add','other.txt'); assert.throws(()=>collectCandidate({checkout:f.checkout,scope:['a.txt','other.txt']}),{code:'integration-unrelated-staged'});
  assert.throws(()=>collectCandidate({checkout:f.checkout,scope:['../escape']}),{code:'integration-invalid-path'});
  const copy={...f.checkout,capability:'0'.repeat(64)}; assert.throws(()=>collectCandidate({checkout:copy,scope:['a.txt']}),{code:'integration-ownership-mismatch'});
});
test('publication refuses changed candidate, changed ref and forged reservation',t=>{
  const f=fixture(t); writeFileSync(join(f.checkout.path,'a.txt'),'changed\n');
  assert.throws(()=>publishCandidate(f),{code:'integration-tree-changed'});
  assert.throws(()=>publishCandidate({...f,reservation:{...f.reservation,tree:f.base}}),{code:'integration-reservation-mismatch'});
  assert.throws(()=>publishCandidate({...f,candidate:{...f.candidate,tree:f.base}}),{code:'integration-candidate-mismatch'});
});
test('commit-before-ack recovery retains fence until explicit child stop and finds same commit',t=>{
  const f=fixture(t); let committed;
  assert.throws(()=>publishCandidate({...f,fault:(stage,c)=>{if(stage==='after-ref'){committed=c;throw new Error('crash');}}}),/crash/);
  assert.throws(()=>reconcilePublication(f),{code:'integration-child-stop-proof-required'});
  const result=reconcilePublication({...f,gitChildStopped:true}); assert.equal(result.commit,committed);
  assert.equal(reconcilePublication({...f,gitChildStopped:true}).commit,committed);
  assert.equal(git(f.checkout.path,'diff','--cached','--name-only'),'');
  assert.throws(()=>publishCandidate(f),{code:'integration-head-changed'});
});
test('pre-ref interruption retries deterministic commit without duplicate history',t=>{
  const f=fixture(t); let prepared;
  assert.throws(()=>publishCandidate({...f,fault:(stage,c)=>{if(stage==='before-ref'){prepared=c;throw new Error('crash');}}}),/crash/);
  assert.equal(reconcilePublication({...f,gitChildStopped:true}).state,'not-published');
  assert.equal(publishCandidate(f).commit,prepared);
});
test('derived reconcile is pinned before review and publication cannot amend reviewed bytes',t=>{
  const f=fixture(t); const candidate=collectCandidate({checkout:f.checkout,scope:['a.txt','derived.md'],reconcile:root=>{writeFileSync(join(root,'derived.md'),'derived\n');return {ok:true};}});
  assert.deepEqual(candidate.paths,['a.txt','derived.md']);
  const reservation={...f.reservation,candidate_digest:candidate.digest,tree:candidate.tree};
  const result=publishCandidate({...f,candidate,reservation}); assert.equal(result.tree,candidate.tree);
  assert.equal(readFileSync(join(f.checkout.path,'derived.md'),'utf8'),'derived\n');
});
test('recovery refuses a foreign commit even when ref has moved',t=>{
  const f=fixture(t); git(f.checkout.path,'add','a.txt'); git(f.checkout.path,'commit','-qm','unreviewed foreign commit');
  assert.throws(()=>reconcilePublication({...f,gitChildStopped:true}),{code:'integration-publication-message-conflict'});
});
