import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync, lstatSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { renderMcpConfig, parseMcpConfigArgs } from '../scripts/team-mcp-config.mjs';
const cli=fileURLToPath(new URL('../bin/waypost',import.meta.url));
const entry=(format='json-mcp-servers',project_file='.mcp.json')=>({id:'fixture',mcp:{format,project_file,confidence:'documented',docs:'https://example.org/mcp'}});
const options={entry:entry(),project:'/private/tmp/project "quoted" $() Unicode界',team:'test-team',credential:'/private/tmp/missing "credential" $().json',name:'dedicated-inbox'};
test('preview preserves literal structured arguments in JSON, TOML and local MCP formats',()=>{
 for(const format of ['json-mcp-servers','toml-mcp-servers','json-local-mcp']){
  const preview=renderMcpConfig({...options,entry:entry(format)});
  assert.equal(preview.preview_only,true);assert.equal(preview.capabilities.native_binding,'unverified');assert.equal(preview.capabilities.protected_review,'unverified');
  assert.equal(preview.execution.args[2],options.project);assert.equal(preview.execution.args[6],options.credential);
  if(format==='toml-mcp-servers'){
   const lines=preview.snippet.trim().split('\n');assert.equal(lines[0],'[mcp_servers."dedicated-inbox"]');
   assert.equal(JSON.parse(lines[1].slice('command = '.length)),process.execPath);
   assert.deepEqual(JSON.parse(lines[2].slice('args = '.length)),preview.execution.args);
  }else{
   const v=JSON.parse(preview.snippet);
   if(format==='json-local-mcp')assert.deepEqual(v.mcp[options.name].command,[preview.execution.command,...preview.execution.args]);
   else assert.deepEqual(v.mcpServers[options.name],preview.execution);
  }
 }
});
test('unsafe paths, IDs and registry metadata fail without configuration fallback',()=>{
 for(const change of [{project:'relative'},{credential:'relative'},{credential:'/tmp/line\nsecret'},{credential:'/tmp/${TOKEN}'},{project:'/tmp/{file:secret}'},{node:'/tmp/{env:NODE}'},{name:'a.b'},{team:'--bad'},{node:'node'}])assert.throws(()=>renderMcpConfig({...options,...change}));
 for(const m of [null,{...entry().mcp,format:'shell'},{...entry().mcp,confidence:'inferred'},{...entry().mcp,docs:'http://example.org'},{...entry().mcp,project_file:'../config'},{...entry().mcp,project_file:'/tmp/config'},{...entry().mcp,project_file:'a\\b'}])assert.throws(()=>renderMcpConfig({...options,entry:{id:'fixture',mcp:m}}));
});
test('parser rejects duplicates, unknown switches, missing values and write requests',()=>{
 const args=['--harness','fixture','--project','/tmp/p','--team','t','--credential','/tmp/c','--name','n'];
 assert.equal(parseMcpConfigArgs(args).harness,'fixture');
 for(const bad of [[...args,'--write'],[...args,'--name','n'],[...args,'--unknown','x'],args.slice(0,-1),['--project','--team']])assert.throws(()=>parseMcpConfigArgs(bad));
});
test('early dispatcher uses requested project override without vault or credential reads/writes',()=>{
 const root=mkdtempSync(join(realpathSync(tmpdir()),'waypost-mcp-preview-'));
 try{
  mkdirSync(join(root,'.waypost/harnesses'),{recursive:true});
  writeFileSync(join(root,'.waypost/harnesses/preview.json'),JSON.stringify({...entry('json-mcp-servers','existing.json'),id:'preview'}));
  writeFileSync(join(root,'existing.json'),'preserve settings byte for byte\n');
  const credential=join(root,'credential.json');writeFileSync(credential,'not JSON and must never be read');
  const before=readdirSync(root).sort();
  const run=(id,file=credential)=>spawnSync(process.execPath,[cli,'team-mcp-config','--harness',id,'--project',root,'--team','t','--credential',file,'--name','own-inbox'],{cwd:tmpdir(),encoding:'utf8',env:{...process.env,WAYPOST_PROJECT_DIR:tmpdir()}});
  const result=run('preview');assert.equal(result.status,0,result.stderr);const preview=JSON.parse(result.stdout);assert.equal(preview.target.file,join(root,'existing.json'));
  assert.equal(run('preview',join(root,'absent.json')).status,0);
  assert.notEqual(run('unknown-harness').status,0);
  assert.equal(readFileSync(join(root,'existing.json'),'utf8'),'preserve settings byte for byte\n');
  assert.equal(readFileSync(credential,'utf8'),'not JSON and must never be read');assert.deepEqual(readdirSync(root).sort(),before);
 }finally{rmSync(root,{recursive:true,force:true});}
});

function installFixture(format='json-mcp-servers',projectFile='.mcp.json',id='fixture') {
 const root=mkdtempSync(join(realpathSync(tmpdir()),'waypost-mcp-create-'));
 mkdirSync(join(root,'.waypost/harnesses'),{recursive:true});
 writeFileSync(join(root,'.waypost/harnesses',`${id}.json`),JSON.stringify({...entry(format,projectFile),id}));
 const args=['team-mcp-config','--harness',id,'--project',root,'--team','t','--credential',join(root,'absent-credential.json'),'--name','own-inbox'];
 const run=(extra=[],nodeArgs=[])=>spawnSync(process.execPath,[...nodeArgs,cli,...args,...extra],{cwd:tmpdir(),encoding:'utf8',env:{...process.env,WAYPOST_PROJECT_DIR:tmpdir()}});
 return {root,args,run,target:join(root,projectFile),close:()=>rmSync(root,{recursive:true,force:true})};
}
function treeSnapshot(root) {
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(item=>{
  const path=join(dir,item.name),relative=path.slice(root.length+1);
  if(item.isDirectory())return [relative+'/',...walk(path)];
  return [relative+':'+(item.isSymbolicLink()?'symlink':readFileSync(path).toString('base64'))];
 });
 return walk(root);
}
test('dispatcher create-only install publishes all formats with private permissions and no authority side effects',()=>{
 for(const [format,file] of [['json-mcp-servers','.mcp.json'],['toml-mcp-servers','.codex/config.toml'],['json-local-mcp','settings/nested/opencode.json']]) {
  const f=installFixture(format,file);
  try {
   const originalRegistry=readFileSync(join(f.root,'.waypost/harnesses/fixture.json'),'utf8');
   const before=treeSnapshot(f.root),preview=f.run();assert.equal(preview.status,0,preview.stderr);
   assert.deepEqual(treeSnapshot(f.root),before);assert.equal(existsSync(f.target),false);
   const expected=JSON.parse(preview.stdout),created=f.run(['--write']);assert.equal(created.status,0,created.stderr);
   const result=JSON.parse(created.stdout);assert.equal(result.preview_only,false);assert.equal(result.written,true);
   assert.equal(readFileSync(f.target,'utf8'),expected.snippet);
   if(process.platform!=='win32')assert.equal(statSync(f.target).mode&0o777,0o600);
   assert.equal(result.capabilities.native_binding,'unverified');
   assert.equal(readFileSync(join(f.root,'.waypost/harnesses/fixture.json'),'utf8'),originalRegistry);
   assert.deepEqual(readdirSync(join(f.root,'.waypost')).sort(),['harnesses']);
   assert.equal(treeSnapshot(f.root).some(v=>/presence|grants|team-owner/.test(v)),false);
   const first=treeSnapshot(f.root),duplicate=f.run(['--write']);assert.notEqual(duplicate.status,0);
   assert.deepEqual(treeSnapshot(f.root),first,'even an identical installed config must not be replaced');
  } finally {f.close();}
 }
});
test('create-only rejects malformed flags before creating files or parent directories',()=>{
 const f=installFixture('toml-mcp-servers','.codex/config.toml');
 try {
  const before=treeSnapshot(f.root);
  for(const extra of [['--write','--write'],['--write','--unknown','value'],['--write=value'],['--write','unexpected'],['--write','--name','duplicate']]) {
   const result=f.run(extra);assert.notEqual(result.status,0,JSON.stringify(extra));
   assert.deepEqual(treeSnapshot(f.root),before);assert.equal(existsSync(join(f.root,'.codex')),false);
  }
  const misplaced=spawnSync(process.execPath,[cli,...f.args.slice(0,-1),'--write',f.args.at(-1)],{cwd:tmpdir(),encoding:'utf8'});
  assert.notEqual(misplaced.status,0);assert.deepEqual(treeSnapshot(f.root),before);
 }finally{f.close();}
});
test('existing foreign config, directories and symlinks are refused without changing any existing bytes',()=>{
 for(const kind of ['foreign','directory','symlink','dangling']) {
  const f=installFixture();
  try {
   if(kind==='foreign')writeFileSync(f.target,'foreign settings must remain byte-for-byte\n');
   else if(kind==='directory')mkdirSync(f.target);
   else {
    const destination=join(f.root,'symlink-destination.json');
    if(kind==='symlink')writeFileSync(destination,'unrelated destination\n');
    symlinkSync(destination,f.target);
   }
   const before=treeSnapshot(f.root),result=f.run(['--write']);assert.notEqual(result.status,0,kind);
   assert.deepEqual(treeSnapshot(f.root),before);
   if(kind==='symlink'||kind==='dangling')assert.equal(lstatSync(f.target).isSymbolicLink(),true);
  }finally{f.close();}
 }
});
test('symlinked config ancestors never receive a published config',()=>{
 const f=installFixture('toml-mcp-servers','.codex/config.toml');
 const outside=mkdtempSync(join(realpathSync(tmpdir()),'waypost-mcp-outside-'));
 try {
  symlinkSync(outside,join(f.root,'.codex'));
  const before=treeSnapshot(f.root),result=f.run(['--write']);assert.notEqual(result.status,0);
  assert.deepEqual(treeSnapshot(f.root),before);assert.deepEqual(readdirSync(outside),[]);
 }finally{f.close();rmSync(outside,{recursive:true,force:true});}
});
test('custom registry cannot install over Git, Waypost metadata or another harness instruction area',()=>{
 for(const file of ['.git/config','.waypost/projectstore.json','.waypost/teams/config.json','.claude/config.json','.git./config','NUL/config','settings/bad?/config.json']) {
  const f=installFixture('json-mcp-servers',file);
  try {
   const before=treeSnapshot(f.root),result=f.run(['--write']);assert.notEqual(result.status,0,file);
   assert.deepEqual(treeSnapshot(f.root),before);
  }finally{f.close();}
 }
});
test('install never reads a malformed participant credential or creates a team authority',()=>{
 const f=installFixture();
 try {
  const credential=join(f.root,'absent-credential.json');writeFileSync(credential,'deliberately not JSON\n');
  const result=f.run(['--write']);assert.equal(result.status,0,result.stderr);
  assert.equal(readFileSync(credential,'utf8'),'deliberately not JSON\n');
  assert.deepEqual(readdirSync(join(f.root,'.waypost')).sort(),['harnesses']);
  assert.deepEqual(readdirSync(f.root).sort(),['.mcp.json','.waypost','absent-credential.json']);
 }finally{f.close();}
});
test('concurrent creators publish exactly one complete config and leave no temporary sibling',async()=>{
 const f=installFixture();
 try {
  const expected=JSON.parse(f.run().stdout).snippet;
  const launch=()=>new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[cli,...f.args,'--write'],{cwd:tmpdir(),env:{...process.env,WAYPOST_PROJECT_DIR:tmpdir()},stdio:['ignore','pipe','pipe']});
   let stdout='',stderr='';child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);
   child.on('error',reject);child.on('close',status=>resolve({status,stdout,stderr}));
  });
  const results=await Promise.all([launch(),launch()]);
  assert.equal(results.filter(r=>r.status===0).length,1,JSON.stringify(results));
  assert.equal(results.filter(r=>r.status!==0).length,1);
  assert.equal(readFileSync(f.target,'utf8'),expected);
  assert.deepEqual(readdirSync(f.root).sort(),['.mcp.json','.waypost']);
 }finally{f.close();}
});
test('failed temporary write, sync or exclusive publication leaves target absent and removes only its own temporary file',()=>{
 for(const operation of ['writeFileSync','fsyncSync','linkSync']) {
  const f=installFixture();
  try {
   const preload=join(f.root,'failure.cjs');
   writeFileSync(preload,`const fs=require('node:fs'); const original=fs.${operation}; fs.${operation}=function(...args){ const error=new Error('fixture failure'); error.code='EOPNOTSUPP'; throw error; }; require('node:module').syncBuiltinESMExports();\n`);
   const sentinel=join(f.root,'.foreign-mcp-temp');writeFileSync(sentinel,'foreign temp must remain\n');
   const before=treeSnapshot(f.root),result=f.run(['--write'],['--require',preload]);assert.notEqual(result.status,0,operation);
   assert.equal(existsSync(f.target),false);assert.deepEqual(treeSnapshot(f.root),before);
   assert.equal(readFileSync(sentinel,'utf8'),'foreign temp must remain\n');
  }finally{f.close();}
 }
});
test('cleanup failure reports installed config accurately and leaves only a private recoverable temporary sibling',()=>{
 const f=installFixture();
 try {
  const preload=join(f.root,'cleanup-failure.cjs');
  writeFileSync(preload,"const fs=require('node:fs'); fs.unlinkSync=()=>{const error=new Error('fixture cleanup failure'); error.code='EACCES'; throw error;}; require('node:module').syncBuiltinESMExports();\n");
  const sentinel=join(f.root,'.foreign-mcp-temp');writeFileSync(sentinel,'foreign temporary bytes\n');
  const expected=JSON.parse(f.run().stdout).snippet;
  const result=f.run(['--write'],['--require',preload]);assert.equal(result.status,0,result.stderr);
  const installed=JSON.parse(result.stdout);assert.equal(installed.written,true);assert.equal(installed.cleanup_pending,true);
  assert.equal(readFileSync(f.target,'utf8'),expected);assert.match(result.stderr,/cleanup pending/);
  assert.equal(readFileSync(sentinel,'utf8'),'foreign temporary bytes\n');
  const leftovers=readdirSync(f.root).filter(name=>name.startsWith('.waypost-mcp-config-'));
  assert.equal(leftovers.length,1);assert.equal(readFileSync(join(f.root,leftovers[0]),'utf8'),expected);
  if(process.platform!=='win32')assert.equal(statSync(join(f.root,leftovers[0])).mode&0o777,0o600);
  assert.equal(installed.limitations.some(value=>value.includes('Nothing was written.')),false);
 }finally{f.close();}
});
