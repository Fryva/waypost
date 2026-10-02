import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkTeamAuthority, teamOrientation } from '../scripts/team-diagnostics.mjs';
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
