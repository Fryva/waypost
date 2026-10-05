import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkTeamAuthority, teamOrientation, subscriptionCallWarnings } from '../scripts/team-diagnostics.mjs';
import { coordinationDirs } from '../scripts/presence.mjs';
test('a vault without a team authority has no team findings or orientation errors',t=>{
 const root=mkdtempSync(join(tmpdir(),'wp-team-diagnostics-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 assert.deepEqual(checkTeamAuthority(root),[]);
 assert.deepEqual(teamOrientation(root),{facts:[],text:''});
});
test('a dangling authority symlink remains a verification error', {skip:process.platform==='win32'},t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'wp-team-diagnostics-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const authority=join(coordinationDirs(root).primary,'teams','authority');mkdirSync(dirname(authority),{recursive:true});
 symlinkSync(join(root,'missing-authority'),authority);
 assert.ok(checkTeamAuthority(root).some(f=>f.level==='issue'&&/authority-symlink/.test(f.message)));
 assert.ok(teamOrientation(root).error);
});
test('unsettled and unaccepted reconciled subscription calls are named with the step that clears them',()=>{
 const state={subscription_invocations:{a:{id:'a',team:'t',state:'uncertain',purpose:'protocol-control',action:{operation_id:'op'}},b:{id:'b',team:'t',state:'consumed',purpose:'calibration'},i:{id:'i',team:'t',state:'uncertain',purpose:'identity',operation_id:'op'},c:{id:'c',team:'t',state:'reconciled',unknown_usage_accepted:false,estimate_tokens:'40'},d:{id:'d',team:'t',state:'reconciled',unknown_usage_accepted:true},e:{id:'e',team:'t',state:'settled'}}};
 const out=subscriptionCallWarnings(state);assert.equal(out.length,4);assert.ok(out.some(m=>/native-control-reconcile --invocation i/.test(m)));
 assert.match(out[0],/no terminal receipt.*native-control-reconcile --invocation a/);assert.match(subscriptionCallWarnings({subscription_invocations:{p:{id:'p',team:'t',state:'uncertain',purpose:'protocol-control',partial_receipt:{}}}})[0],/only a partial receipt.*no ledger-bound operation/);assert.match(out[1],/no ledger-bound operation/);assert.match(out[3],/unknown-usage-accept --invocation c --charged-tokens <at least 40>/);
 assert.deepEqual(subscriptionCallWarnings({}),[]);
});
