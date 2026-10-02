import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMcpHandler, cliInvoker, serveStdio, parseMcpArgs } from '../scripts/team-mcp.mjs';
import { mutateAuthority } from '../scripts/team-store.mjs';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
const cli = fileURLToPath(new URL('../bin/waypost', import.meta.url));
const roots = []; after(() => roots.forEach(p => rmSync(p, {recursive:true,force:true})));
test('startup options are unique exact pairs and preserve literal paths',()=>{
 const pairs=[['--project','/tmp/project "quotes" $() 界'],['--team','test-team'],['--credential','/tmp/private "file".json']];
 for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]])assert.deepEqual(parseMcpArgs(order.flatMap(i=>pairs[i])),{project:pairs[0][1],team:pairs[1][1],credential:pairs[2][1]});
 const valid=pairs.flat();
 for(const argv of [[...valid,'extra'],[...valid,'--write','yes'],...pairs.map(p=>[...valid,...p]),valid.slice(0,-1),['--project=x',...valid.slice(2)],['--project','',...valid.slice(2)]])assert.throws(()=>parseMcpArgs(argv));
 for(const value of ['relative','/tmp/a\nsecret','/tmp/a\x7f','/'+ 'a'.repeat(4096)]){
  assert.throws(()=>parseMcpArgs(['--project',value,...valid.slice(2)]));
  assert.throws(()=>cliInvoker({project:pairs[0][1],team:'test',credential:value}));
 }
 assert.throws(()=>cliInvoker({project:'/tmp/p',team:123,credential:'/tmp/c'}));
});
test('invalid direct or dispatcher startup is silent on stdout and hides supplied values',()=>{
 const script=fileURLToPath(new URL('../scripts/team-mcp.mjs',import.meta.url));
 for(const entry of [[script],[cli,'team-mcp']]){
  const r=spawnSync(process.execPath,[...entry,'--project','/tmp/secret-path','--project','/tmp/other','--team','t','--credential','/tmp/private-token.json'],{encoding:'utf8'});
  assert.equal(r.status,1);assert.equal(r.stdout,'');assert.ok(!/secret-path|private-token|other/.test(r.stderr));
 }
});
async function start(invoke) {
 const h = createMcpHandler(invoke);
 const request = (method,params,id=1) => h({jsonrpc:'2.0',id,method,params});
 assert.equal((await request('tools/list')).error.code,-32002);
 assert.equal((await request('initialize',{protocolVersion:'2025-11-25'})).result.protocolVersion,'2025-11-25');
 await h({jsonrpc:'2.0',method:'notifications/initialized'});
 return {h,request,call:(name,args)=>request('tools/call',{name,arguments:args})};
}
test('MCP exposes only cooperative participant tools with bounded arguments and no authority fields',async()=>{
 let calls=0;const c=await start(async()=>{calls++;return {ok:true};});
 assert.deepEqual((await c.request('tools/list')).result.tools.map(t=>t.name),['waypost_inbox','waypost_send','waypost_ack']);
 for (const args of [{actor:'owner'}, {credential:'/private/secret'}, {model:'strong'}, {surface:'desktop'}, {cursor:'x'.repeat(4097)}]) assert.equal((await c.call('waypost_inbox',args)).result.isError,true);
 assert.equal((await c.call('waypost_send',{to:'p',kind:'assignment',payload:{},request_key:'k',epoch:0,at:new Date().toISOString()})).result.isError,true);
 assert.equal((await c.call('waypost_send',{to:'p',kind:'question',payload:{},request_key:'x'.repeat(129),epoch:0,at:new Date().toISOString()})).result.isError,true);
 assert.equal((await c.call('waypost_send',{to:'p',kind:'question',payload:{},request_key:'not a key',epoch:0,at:new Date().toISOString()})).result.isError,true);
 assert.equal(calls,0);
 assert.equal((await c.call('waypost_inbox',{})).result.isError,undefined);
 assert.equal((await c.request('owner/revoke',{})).error.code,-32601);
});
test('stdio frames split UTF-8 safely and return only JSON-RPC; oversized lines stop admission',async()=>{
 const input=new PassThrough(),output=new PassThrough();let text='';output.on('data',b=>text+=b);
 const done=serveStdio(createMcpHandler(async()=>({})),input,output);
 const line=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:'кириллица',method:'ping'})+'\n');
 for(const byte of line) input.write(Buffer.from([byte]));
 await done();assert.equal(JSON.parse(text).id,'кириллица');
 input.write('x'.repeat(65537));await done();assert.equal(text.trim().split('\n').length,2);
});
test('malformed UTF-8 never reaches handler; valid replacement character and CRLF survive',async()=>{
 const input=new PassThrough(),output=new PassThrough();let text='',calls=0;output.on('data',b=>text+=b);
 const done=serveStdio(async r=>{calls++;return {jsonrpc:'2.0',id:r.id,result:{}};},input,output);
 const prefix=Buffer.from('{"jsonrpc":"2.0","id":"'),suffix=Buffer.from('","method":"ping"}\n');
 for(const bytes of [[0x80],[0xc0,0xaf],[0xe2,0x82]])input.write(Buffer.concat([prefix,Buffer.from(bytes),suffix]));
 input.write(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('{"jsonrpc":"2.0","id":1,"method":"ping"}\n')]));
 await done();assert.equal(calls,0);assert.equal(text.trim().split('\n').length,4);
 assert.ok(text.trim().split('\n').every(line=>JSON.parse(line).error.code===-32700));
 input.write(JSON.stringify({jsonrpc:'2.0',id:'\ufffd',method:'ping'})+'\r\n');await done();assert.equal(calls,1);
 assert.equal(JSON.parse(text.trim().split('\n').at(-1)).id,'\ufffd');
});
test('dispatcher MCP handshake is protocol-only and does not need or create a vault',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'waypost-mcp-dispatch-')));roots.push(root);
 const frames=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'waypost_inbox',arguments:{}}}];
 const r=spawnSync(process.execPath,[cli,'team-mcp','--project',root,'--team','test','--credential',join(root,'missing.json')],{cwd:root,encoding:'utf8',input:frames.map(x=>JSON.stringify(x)).join('\n')+'\n',timeout:5000});
 assert.equal(r.status,0,r.stderr);const messages=r.stdout.trim().split('\n').map(x=>JSON.parse(x));
 assert.equal(messages.length,3);assert.equal(messages[0].result.protocolVersion,'2024-11-05');assert.equal(messages[1].result.tools.length,3);
 assert.match(messages[0].result.instructions,/do not authenticate/);assert.equal(messages[2].result.isError,true);
});
test('stdio waits for output consumption before admitting the next operation',async()=>{
 const input=new PassThrough();let release,calls=0;
 const output=new Writable({write(chunk,encoding,callback){release=callback;}});
 const done=serveStdio(async r=>{calls++;return {jsonrpc:'2.0',id:r.id,result:{}};},input,output);
 input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);release();
 await new Promise(r=>setImmediate(r));assert.equal(calls,2);release();await done();
});
test('two MCP holders exchange addressed messages through the real CLI, preserve replay and refuse stale/foreign ack',async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'waypost-team-mcp-')));roots.push(root);
 mkdirSync(join(root,'.waypost'));mkdirSync(join(root,'vault'));
 writeFileSync(join(root,'.waypost/projectstore.json'),JSON.stringify({vault_path:'vault',layout:'engineering',language:'en'}));
 writeFileSync(join(root,'vault/task.md'),'---\ntype: epic\nid: test\ntitle: Test\nstatus: planned\n---\n');
 const run=(...args)=>{const r=spawnSync(process.execPath,[cli,'team',...args],{cwd:root,encoding:'utf8',env:{...process.env,WAYPOST_PROJECT_DIR:root,WAYPOST_NO_BEAT:'1'}});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 run('create','vault/task.md','--id','mcp-team','--confirm-local');
 writeFileSync(join(root,'model.json'),JSON.stringify({provider:'unknown',model_id:'unknown',reasoning:'unknown',model_revision:1,resolved:false,evidence:{kind:'unknown',source:'fixture',observed_at:new Date().toISOString()}}));
 const a=run('join','mcp-team','--model','model.json','--credential','a.json','--surface','desktop-chat').result.participant;
 const b=run('join','mcp-team','--model','model.json','--credential','b.json','--surface','desktop').result.participant;
 const client=async file=>start(cliInvoker({project:root,team:'mcp-team',credential:join(root,file)}));
 const A=await client('a.json'),B=await client('b.json');
 const value=r=>{assert.equal(r.result.isError,undefined,JSON.stringify(r));return JSON.parse(r.result.content[0].text);};
 const send={to:b,kind:'question',payload:{text:'Привет, другой харнесс'},request_key:'mcp-question',epoch:0,at:new Date().toISOString()};
 const sent=value(await A.call('waypost_send',send));
 assert.equal(value(await A.call('waypost_send',send)).replayed,true);
 assert.equal(value(await A.call('waypost_inbox',{})).messages.length,0);
 const inbox=value(await B.call('waypost_inbox',{}));assert.equal(inbox.messages[0].payload.text,send.payload.text);
 assert.equal(inbox.messages[0].ack,null);assert.equal(inbox.native_delivery,'unverified');
 assert.equal((await A.call('waypost_ack',{message:sent.result.id,request_key:'foreign',epoch:0,at:new Date().toISOString()})).result.isError,true);
 assert.equal((await B.call('waypost_ack',{message:sent.result.id,request_key:'stale',epoch:1,at:new Date().toISOString()})).result.isError,true);
 assert.equal((await B.call('waypost_ack',{message:sent.result.id,request_key:'stale-code',epoch:1,at:new Date().toISOString()})).result.content[0].text,'stale-epoch');
 value(await B.call('waypost_ack',{message:sent.result.id,request_key:'ack',epoch:0,at:new Date().toISOString()}));
 value(await B.call('waypost_send',{to:a,kind:'answer',payload:{text:'Ответ'},reply_to:sent.result.id,request_key:'answer',epoch:0,at:new Date().toISOString()}));
 assert.equal(value(await A.call('waypost_inbox',{})).messages[0].reply_to,sent.result.id);
 const owner=await client('.waypost/team-owner.json');assert.equal((await owner.call('waypost_inbox',{})).result.isError,true);
 const status=run('status','mcp-team').teams[0];assert.equal(status.participants[a].surface,'desktop-chat');assert.equal(status.participants[b].surface,'desktop');assert.equal(status.status,'paused');
 // Legal compact payloads used to expand past the bridge's response ceiling
 // under pretty printing. Byte pages must advance without skipping recipients.
 const store=run('status','mcp-team'),cred=JSON.parse(readFileSync(join(root,'a.json'),'utf8'));let revision=store.revision;
 for(let i=0;i<24;i++) {
   const key='bulk-'+i;
   revision=mutateAuthority(store.authority,{key,actor:a,expected_revision:revision,command:{type:'send',team:'mcp-team',actor:a,incarnation:cred.incarnation,epoch:0,request_key:key,at:new Date().toISOString(),to:b,kind:'progress',payload:{text:'界'.repeat(16000)}}},reduceTeamEvent).revision;
 }
 const first=value(await B.call('waypost_inbox',{}));assert.ok(first.messages.length<25);assert.ok(first.messages.length>1);
 const next=value(await B.call('waypost_inbox',{cursor:first.cursor}));assert.equal(first.messages.length+next.messages.length,25);
 assert.equal(new Set([...first.messages,...next.messages].map(m=>m.id)).size,25);
 const dash=value(await A.call('waypost_send',{to:b,kind:'question',payload:{},request_key:'--dash-message',epoch:0,at:new Date().toISOString()}));
 value(await B.call('waypost_ack',{message:dash.result.id,request_key:'dash-ack',epoch:0,at:new Date().toISOString()}));
 writeFileSync(join(root,'wrong-incarnation.json'),JSON.stringify({...JSON.parse(readFileSync(join(root,'b.json'),'utf8')),incarnation:'wrong-incarnation'}));
 const wrong=await client('wrong-incarnation.json');assert.equal((await wrong.call('waypost_inbox',{})).result.content[0].text,'invalid-participant-credential');
 run('revoke','mcp-team','--participant',b);
 assert.equal((await B.call('waypost_inbox',{})).result.content[0].text,'invalid-participant-credential');
});
