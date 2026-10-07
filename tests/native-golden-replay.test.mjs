import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,readFileSync,writeFileSync,readdirSync,realpathSync,rmSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {replayAuthorityUncached} from '../scripts/team-store.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';

// Authority logs recorded with the slice 1 reducer (6299a18) and with the slice 2
// revision loop (7c263f7): every later reducer must replay them to the same state
// and result digests, event by event.
for(const [slice,name,status,generation] of [['slice1','published','integrated',1],['slice1','rejected-cancelled','cancelled',1],['slice2','revised-published','integrated',2]])test(`the ${slice} ${name} authority log replays unchanged`,t=>{
 const fixtures=join(import.meta.dirname,'fixtures','native-'+slice+'-authority');
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'waypost-golden-'))),root=join(dir,'authority');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 cpSync(join(fixtures,name,'authority'),root,{recursive:true});
 const identityFile=join(root,'identity.json'),identity=JSON.parse(readFileSync(identityFile,'utf8'));
 writeFileSync(identityFile,JSON.stringify({...identity,root:realpathSync(root)}));
 const seed=JSON.parse(gunzipSync(readFileSync(join(fixtures,name,'seed.json.gz'))).toString('utf8'));
 const reducer=(s,c,a)=>c.type==='fixture-initialize'?{state:structuredClone(seed),result:{fixture:true}}:reduceTeamEvent(s,c,a);
 const v=replayAuthorityUncached(root,reducer);
 assert.equal(v.revision,readdirSync(join(root,'events')).length);
 assert.equal(v.state.teams.team.work['fix-sum'].status,status);assert.equal(v.state.teams.team.work['fix-sum'].generation,generation);
});
