import assert from 'node:assert/strict';
import http from 'node:http';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const packageDir=path.resolve(process.argv[2]);
const {startServer}=await import(pathToFileURL(path.join(packageDir,'server.mjs')));
assert.equal(typeof startServer,'function');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'local-notes-acceptance-'));
const dataDir=path.join(root,'data');
const token='0123456789abcdef'.repeat(4);
const results=[];
let app;
async function test(name,fn){try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:String(e.stack)});}}
function req(method,target,body,override={}) {
  const url=new URL(app.url);
  const bytes=body===undefined?null:Buffer.isBuffer(body)?body:typeof body==='string'?Buffer.from(body):Buffer.from(JSON.stringify(body));
  const headers={Host:url.host,'X-Local-Token':token,...(method==='GET'?{}:{Origin:app.url}),...(bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{}),...override};
  for(const key of Object.keys(headers))if(headers[key]===undefined)delete headers[key];
  return new Promise((resolve,reject)=>{const request=http.request({hostname:'127.0.0.1',port:url.port,method,path:target,headers},response=>{const chunks=[];response.on('data',x=>chunks.push(x));response.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');let json;try{json=JSON.parse(text);}catch{}resolve({status:response.statusCode,headers:response.headers,text,json});});});request.setTimeout(4000,()=>request.destroy(new Error('HTTP timeout')));request.on('error',reject);request.end(bytes);});
}
function status(r,n){assert.equal(r.status,n,r.text);}
function error(r,n){status(r,n);assert.equal(typeof r.json?.error,'string');assert(r.json.error.length);assert(!r.text.includes(token));assert(!r.text.includes(dataDir));assert(!r.text.includes('Error:'));assert.match(r.headers['content-type'],/application\/json/);}
async function snapshot(){const r=await req('GET','/api/export');status(r,200);return r.json;}
async function reset(notes=[]){status(await req('POST','/api/import',{version:1,notes}),200);}
const stamp='2026-01-01T00:00:00.000Z';
const id=i=>'00000000-0000-4000-8000-'+i.toString(16).padStart(12,'0');
const note=(i,extra={})=>({id:id(i),title:'note '+i,body:'body '+i,createdAt:stamp,updatedAt:stamp,...extra});
async function rejectsStart(options){let other;try{other=await startServer(options);}catch{return;}await other.close();assert.fail('Startup should reject invalid storage/configuration');}
try {
 app=await startServer({dataDir,port:0,token});
 await test('library/loopback/actual port',async()=>{assert.match(app.url,/^http:\/\/127\.0\.0\.1:\d+$/);assert.equal(typeof app.close,'function');});
 await test('package release entrypoints',async()=>{const p=JSON.parse(await fs.readFile(path.join(packageDir,'package.json'),'utf8'));assert.equal(p.type,'module');assert.equal(p.scripts.start,'node server.mjs');assert.equal(p.scripts.test,'node test.mjs');assert.equal(Object.keys(p.dependencies||{}).length,0);});
 for(const [url,mime]of [['/','text/html'],['/app.js','javascript'],['/style.css','text/css']])await test('static '+url,async()=>{const r=await req('GET',url);status(r,200);assert(r.headers['content-type'].includes(mime));assert.equal(r.headers['x-content-type-options'],'nosniff');assert.equal(r.headers['referrer-policy'],'no-referrer');const csp=r.headers['content-security-policy'];assert(csp&&!csp.includes('unsafe-inline'));for(const part of ['script-src','object-src','frame-ancestors','base-uri'])assert(csp.includes(part));assert(!r.text.includes(token));});
 for(const target of ['/server.mjs','/README.md','/.git/config','/../server.mjs','/%2e%2e/server.mjs','/%2f..%2fserver.mjs','/public/app.js'])await test('no file disclosure '+target,async()=>status(await req('GET',target),404));
 for(const value of [undefined,'x','f'.repeat(64),''])await test('authentication '+String(value),async()=>error(await req('GET','/api/notes',undefined,{'X-Local-Token':value}),401));
 await test('query token does not authenticate',async()=>error(await req('GET','/api/notes?token='+token,undefined,{'X-Local-Token':undefined}),401));
 await test('external Host',async()=>status(await req('GET','/',undefined,{Host:'evil.example'}),403));
 for(const origin of ['https://evil.example','null','http://localhost:'+new URL(app.url).port])await test('cross-origin '+origin,async()=>error(await req('POST','/api/notes',{title:'bad',body:''},{Origin:origin}),403));
 await test('missing Origin on mutation',async()=>error(await req('POST','/api/notes',{title:'bad',body:''},{Origin:undefined}),403));
 await test('foreign Origin on read/no CORS',async()=>{const r=await req('GET','/api/notes',undefined,{Origin:'https://evil.example'});error(r,403);assert.equal(r.headers['access-control-allow-origin'],undefined);});
 await test('empty state and no-store',async()=>{const r=await req('GET','/api/notes');status(r,200);assert.deepEqual(r.json,{notes:[],total:0});assert.equal(r.headers['cache-control'],'no-store');});
 let first;
 await test('create complete canonical note',async()=>{const r=await req('POST','/api/notes',{title:'  Alpha  ',body:'first body'});status(r,201);first=r.json.note;assert.deepEqual(Object.keys(first).sort(),['body','createdAt','id','title','updatedAt']);assert.match(first.id,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.equal(first.title,'Alpha');assert.equal(first.body,'first body');assert.equal(new Date(first.createdAt).toISOString(),first.createdAt);assert.equal(first.updatedAt,first.createdAt);});
 await test('get/select/edit preserves identity',async()=>{const r=await req('PATCH','/api/notes/'+first.id,{body:'changed body'});status(r,200);assert.equal(r.json.note.id,first.id);assert.equal(r.json.note.createdAt,first.createdAt);assert.equal(r.json.note.body,'changed body');assert(r.json.note.updatedAt>=first.updatedAt);status(await req('GET','/api/notes/'+first.id),200);});
 for(const body of [{title:' ',body:''},{title:'x'.repeat(121),body:''},{title:1,body:''},{title:'x',body:null},{title:'x',body:'x'.repeat(4001)},{title:'x',body:'',admin:true},{title:'x'},{body:''},null,[]])await test('create input '+JSON.stringify(body).slice(0,70),async()=>error(await req('POST','/api/notes',body),400));
 for(const body of [{},{id:id(9)},{title:null},{body:3},{title:''},{body:'x'.repeat(4001)}])await test('patch validation '+JSON.stringify(body).slice(0,70),async()=>error(await req('PATCH','/api/notes/'+first.id,body),400));
 await test('missing note',async()=>error(await req('GET','/api/notes/'+id(999)),404));
 await test('missing delete',async()=>error(await req('DELETE','/api/notes/'+id(999)),404));
 await test('unsupported method',async()=>error(await req('PUT','/api/notes',{}),405));
 await test('unknown API',async()=>error(await req('GET','/api/unknown'),404));
 for(const query of ['?unknown=x','?q=x&q=y','?q='+'x'.repeat(201)])await test('query validation '+query.slice(0,40),async()=>error(await req('GET','/api/notes'+query),400));
 await test('search title case insensitive',async()=>{const r=await req('GET','/api/notes?q=ALPHA');status(r,200);assert.equal(r.json.total,1);assert.equal(r.json.notes[0].id,first.id);});
 await test('search body and empty results',async()=>{assert.equal((await req('GET','/api/notes?q=CHANGED')).json.total,1);assert.deepEqual((await req('GET','/api/notes?q=no-such-value')).json,{notes:[],total:0});});
 await test('malformed JSON',async()=>error(await req('POST','/api/notes','{'),400));
 await test('malformed UTF-8',async()=>error(await req('POST','/api/notes',Buffer.concat([Buffer.from('{"title":"'),Buffer.from([0xff]),Buffer.from('","body":""}')])),400));
 await test('wrong content type',async()=>error(await req('POST','/api/notes',{title:'x',body:''},{'Content-Type':'text/plain'}),415));
 await test('missing content type',async()=>error(await req('POST','/api/notes',{title:'x',body:''},{'Content-Type':undefined}),415));
 await test('streaming size limit delivers response',async()=>error(await req('POST','/api/notes','x'.repeat(262145)),413));
 await test('import/sort/full records',async()=>{await reset([note(2),note(1),note(3,{updatedAt:'2026-02-01T00:00:00.000Z'})]);const r=await req('GET','/api/notes');assert.deepEqual(r.json.notes.map(n=>n.id),[id(3),id(1),id(2)]);assert.equal(r.json.total,3);});
 const invalidBackups=[{},null,[],{version:2,notes:[]},{version:1,notes:'bad'},{version:1,notes:[],extra:true},{version:1,notes:[note(1),note(1)]},{version:1,notes:[note(1,{id:'../outside'})]},{version:1,notes:[note(1,{title:''})]},{version:1,notes:[note(1,{createdAt:'yesterday'})]},{version:1,notes:[note(1,{updatedAt:'2025-01-01T00:00:00.000Z'})]},{version:1,notes:[{...note(1),extra:1}]},{version:1,notes:[note(1),note(2,{body:17})]}];
 for(let i=0;i<invalidBackups.length;i++)await test('all-or-nothing invalid import '+i,async()=>{const before=await snapshot();error(await req('POST','/api/import',invalidBackups[i]),400);assert.deepEqual(await snapshot(),before);});
 await test('prototype import field rejected',async()=>error(await req('POST','/api/import','{"version":1,"notes":[],"__proto__":{"polluted":true}}'),400));
 await test('export/restore exact content',async()=>{const backup=await snapshot();await reset();const r=await req('POST','/api/import',backup);status(r,200);assert.equal(r.json.imported,3);assert.deepEqual(await snapshot(),backup);});
 await test('note count cap import',async()=>{const before=await snapshot();error(await req('POST','/api/import',{version:1,notes:Array.from({length:101},(_,i)=>note(i))}),413);assert.deepEqual(await snapshot(),before);});
 await test('note count cap create',async()=>{await reset(Array.from({length:100},(_,i)=>note(i)));error(await req('POST','/api/notes',{title:'overflow',body:''}),413);assert.equal((await snapshot()).notes.length,100);});
 await test('serialized state cap',async()=>{const before=await snapshot();error(await req('POST','/api/import',{version:1,notes:Array.from({length:60},(_,i)=>note(i,{body:'😀'.repeat(2000)}))}),413);assert.deepEqual(await snapshot(),before);});
 await test('accumulated store cap rejects create and patch without disk/memory change',async()=>{
  const notes=[note(0,{body:''})],filler=note(999,{body:''});let i=1;
  while(Buffer.byteLength(JSON.stringify({version:1,notes:[...notes,note(i,{body:'x'.repeat(4000)}),filler]}))<=262000){notes.push(note(i++,{body:'x'.repeat(4000)}));}
  let padding=262000-Buffer.byteLength(JSON.stringify({version:1,notes:[...notes,filler]}));
  for(const n of notes){if(padding<=4000)break;const grow=Math.min(120-n.title.length,padding-4000);n.title+='t'.repeat(grow);padding-=grow;}
  assert(padding>=0&&padding<=4000);filler.body='x'.repeat(padding);notes.push(filler);
  const backup={version:1,notes};assert.equal(Buffer.byteLength(JSON.stringify(backup)),262000);await reset(notes);const before=await snapshot(),disk=await fs.readFile(path.join(dataDir,'notes.json'),'utf8');
  error(await req('POST','/api/notes',{title:'overflow',body:'x'.repeat(4000)}),413);assert.deepEqual(await snapshot(),before);assert.equal(await fs.readFile(path.join(dataDir,'notes.json'),'utf8'),disk);
  error(await req('PATCH','/api/notes/'+id(0),{body:'x'.repeat(4000)}),413);assert.deepEqual(await snapshot(),before);assert.equal(await fs.readFile(path.join(dataDir,'notes.json'),'utf8'),disk);
 });
 await test('concurrent writes lose no updates',async()=>{await reset();const replies=await Promise.all(Array.from({length:12},(_,i)=>req('POST','/api/notes',{title:'Parallel '+i,body:'value '+i})));replies.forEach(r=>status(r,201));const value=await snapshot();assert.equal(value.notes.length,12);assert.equal(new Set(value.notes.map(n=>n.title)).size,12);const disk=JSON.parse(await fs.readFile(path.join(dataDir,'notes.json'),'utf8'));assert.equal(disk.notes.length,12);});
 await test('write-time symlink rejected/old memory preserved',async()=>{const before=await snapshot();const target=path.join(dataDir,'notes.json'),held=path.join(root,'held.json'),outside=path.join(root,'outside.json');await fs.writeFile(outside,'DO NOT TOUCH');await fs.rename(target,held);await fs.symlink(outside,target);try{error(await req('POST','/api/notes',{title:'must fail',body:''}),500);assert.deepEqual(await snapshot(),before);assert.equal(await fs.readFile(outside,'utf8'),'DO NOT TOUCH');}finally{await fs.unlink(target);await fs.rename(held,target);}});
 await test('rename failure preserves memory/temp cleanup',async()=>{const before=await snapshot();const target=path.join(dataDir,'notes.json'),held=path.join(root,'held.json');await fs.rename(target,held);await fs.mkdir(target);try{error(await req('POST','/api/notes',{title:'must fail',body:''}),500);assert.deepEqual(await snapshot(),before);}finally{await fs.rmdir(target);await fs.rename(held,target);}assert.deepEqual((await fs.readdir(dataDir)).sort(),['notes.json']);});
 await test('restart persistence',async()=>{const before=await snapshot();await app.close();app=await startServer({dataDir,port:0,token});assert.deepEqual(await snapshot(),before);});
 if(process.platform!=='win32')await test('private storage permissions',async()=>{assert.equal((await fs.stat(dataDir)).mode&0o777,0o700);assert.equal((await fs.stat(path.join(dataDir,'notes.json'))).mode&0o777,0o600);});
 await test('delete then404',async()=>{const notes=(await snapshot()).notes;const selected=notes[0];status(await req('DELETE','/api/notes/'+selected.id),200);error(await req('GET','/api/notes/'+selected.id),404);});
 await test('literal malicious note roundtrip',async()=>{const title='<img src=x onerror=alert(1)>';const r=await req('POST','/api/notes',{title,body:'<script>bad()</script>'});status(r,201);assert.equal(r.json.note.title,title);assert.equal((await req('GET','/api/notes/'+r.json.note.id)).json.note.body,'<script>bad()</script>');});
 await test('real CLI entrypoint/token/shutdown',async()=>{
  const child=spawn(process.execPath,[path.join(packageDir,'server.mjs'),'--data-dir',path.join(root,'cli-data'),'--port','0'],{cwd:packageDir,stdio:['ignore','pipe','pipe']});
  let output='',stderr='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>stderr+=x);
  try {
    const until=Date.now()+5000;let match;
    while(Date.now()<until){match=output.match(/(http:\/\/127\.0\.0\.1:\d+)#token=([a-fA-F0-9]{64})/);if(match)break;if(child.exitCode!==null)throw new Error('CLI exited early: '+stderr);await new Promise(r=>setTimeout(r,20));}
    assert(match,'CLI must print a usable owner URL with token');const previous=app;app={url:match[1]};try{status(await req('GET','/api/notes',undefined,{'X-Local-Token':match[2]}),200);}finally{app=previous;}
  }finally{
    if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');let timer;await Promise.race([exited,new Promise((_,reject)=>timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('CLI did not stop gracefully'));},4000))]).finally(()=>clearTimeout(timer));}
  }
 });
 await test('bad existing JSON fails without erasing',async()=>{const dir=path.join(root,'corrupt');await fs.mkdir(dir);const file=path.join(dir,'notes.json');await fs.writeFile(file,'CORRUPT');await rejectsStart({dataDir:dir,port:0,token});assert.equal(await fs.readFile(file,'utf8'),'CORRUPT');});
 await test('bad existing schema fails',async()=>{const dir=path.join(root,'bad-schema');await fs.mkdir(dir);await fs.writeFile(path.join(dir,'notes.json'),'{"version":2,"notes":[]}');await rejectsStart({dataDir:dir,port:0,token});});
 await test('symlink data directory fails',async()=>{const target=path.join(root,'target'),link=path.join(root,'directory-link');await fs.mkdir(target);await fs.symlink(target,link);await rejectsStart({dataDir:link,port:0,token});});
 await test('symlink data file fails',async()=>{const dir=path.join(root,'linked-file');await fs.mkdir(dir);const target=path.join(root,'real.json');await fs.writeFile(target,'{"version":1,"notes":[]}');await fs.symlink(target,path.join(dir,'notes.json'));await rejectsStart({dataDir:dir,port:0,token});});
 for(const invalid of ['',null,'x','g'.repeat(64)])await test('invalid explicit token '+String(invalid),async()=>rejectsStart({dataDir:path.join(root,'bad-token'),port:0,token:invalid}));
} finally {if(app)await app.close().catch(()=>{});await fs.rm(root,{recursive:true,force:true});}
console.log(JSON.stringify({tests:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results},null,2));
if(results.some(x=>!x.pass))process.exitCode=1;
