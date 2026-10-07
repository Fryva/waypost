import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,readFileSync,writeFileSync,readdirSync,realpathSync,rmSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {replayAuthorityUncached} from '../scripts/team-store.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';

// Authority logs recorded with the slice 1 reducer (6299a18): every later reducer
// must replay them to the same state and result digests, event by event.
const fixtures=join(import.meta.dirname,'fixtures','native-slice1-authority');
for(const [name,status] of [['published','integrated'],['rejected-cancelled','cancelled']])test(`the slice 1 ${name} authority log replays unchanged`,t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'waypost-golden-'))),root=join(dir,'authority');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 cpSync(join(fixtures,name,'authority'),root,{recursive:true});
 const identityFile=join(root,'identity.json'),identity=JSON.parse(readFileSync(identityFile,'utf8'));
 writeFileSync(identityFile,JSON.stringify({...identity,root:realpathSync(root)}));
 const seed=JSON.parse(gunzipSync(readFileSync(join(fixtures,name,'seed.json.gz'))).toString('utf8'));
 const reducer=(s,c,a)=>c.type==='fixture-initialize'?{state:structuredClone(seed),result:{fixture:true}}:reduceTeamEvent(s,c,a);
 const v=replayAuthorityUncached(root,reducer);
 assert.equal(v.revision,readdirSync(join(root,'events')).length);
 assert.equal(v.state.teams.team.work['fix-sum'].status,status);
});
