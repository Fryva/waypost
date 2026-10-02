import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
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
