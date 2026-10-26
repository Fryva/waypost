// Isolated child: all fixtures and mutations belong to the supplied root.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { join, dirname, resolve, sep } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
const [moduleURL,fixtureRoot]=process.argv.slice(2), root=fs.realpathSync(fixtureRoot);
const original=Object.fromEntries(["mkdirSync","existsSync","writeFileSync","readFileSync","utimesSync","readdirSync","statSync","unlinkSync"].map(k=>[k,fs[k].bind(fs)]));
const NativeDate=Date, base=NativeDate.parse("2026-01-02T12:00:00.000Z"), day=86400000;
let clock=base,pid=4242,host="fixture-host.domain",armed=false,mode="",trace=[],protectedPaths=new Set(),pidReads=0,hostReads=0;
const violations=[],fault=Object.assign(new Error("injected legacy failure"),{code:"EIO"});
const pathOf=p=>p instanceof URL?fileURLToPath(p):p;
const inside=p=>typeof pathOf(p)==="string"&&resolve(pathOf(p)).startsWith(root+sep), short=p=>String(pathOf(p)).slice(root.length+1);
function mutation(p){if(!inside(p)||protectedPaths.has(resolve(p))){violations.push(String(p));throw Error("forbidden mutation");}}
function event(...args){if(armed)trace.push(args);}
Object.defineProperty(process,"pid",{configurable:true,enumerable:Object.getOwnPropertyDescriptor(process,"pid").enumerable,get(){pidReads++;event("pid",pid);return pid;}});
assert.equal(process.pid,4242);pid=4343;assert.equal(process.pid,4343);pid=4242;
process.kill=(...args)=>{violations.push(["kill",...args]);throw Error("no PID probes");};
os.hostname=()=>{hostReads++;event("hostname",host);if(mode==="host-failure")throw fault;return host;};
globalThis.Date=class extends NativeDate{
  constructor(...args){if(!args.length)event("date",clock);super(...(args.length?args:[clock]));}
  static now(){event("now",clock);return clock;}
};
fs.mkdirSync=(p,...a)=>{mutation(p);event("mkdir",short(p),...a);if(mode==="mkdir-failure")throw fault;return original.mkdirSync(p,...a);};
fs.existsSync=p=>{if(inside(p))event("exists",short(p));return original.existsSync(p);};
fs.readFileSync=(p,...a)=>{if(inside(p)){event("read",short(p),...a);if(mode==="read-failure"&&String(p).endsWith("record.json"))throw fault;}return original.readFileSync(p,...a);};
fs.writeFileSync=(p,content,...a)=>{mutation(p);event("write",short(p),content,...a);if(mode==="write-failure"||(mode==="ignore-failure"&&String(p).endsWith(".gitignore")))throw fault;const out=original.writeFileSync(p,content,...a);original.utimesSync(p,clock/1000,clock/1000);return out;};
fs.utimesSync=(p,a,b)=>{mutation(p);event("utimes",short(p),a.getTime(),b.getTime());if(mode==="touch-failure")throw fault;return original.utimesSync(p,a,b);};
fs.readdirSync=(p,...a)=>{if(inside(p)){event("list",short(p));if(mode==="cleanup-list-failure")throw fault;}return original.readdirSync(p,...a);};
fs.statSync=(p,...a)=>{if(inside(p)){event("stat",short(p));if(String(p).endsWith("bad-stat.json"))throw fault;}return original.statSync(p,...a);};
fs.unlinkSync=p=>{mutation(p);event("unlink",short(p));if(String(p).endsWith("blocked.json"))throw fault;return original.unlinkSync(p);};
syncBuiltinESMExports();
const m=await import(moduleURL);
assert.equal(pidReads,2,"no import-time PID capture");assert.equal(hostReads,0);assert.deepEqual(trace,[]);
const identity=p=>{const s=original.statSync(p);return{bytes:original.readFileSync(p).toString("hex"),ino:s.ino,dev:s.dev,mtimeMs:s.mtimeMs};};
function seed(p,bytes,time=base-1000,keep=false){
  if(!keep||!original.existsSync(p)){original.mkdirSync(dirname(p),{recursive:true});original.writeFileSync(p,bytes);original.utimesSync(p,time/1000,time/1000);}
  if(keep)protectedPaths.add(resolve(p));
}
function remove(p){assert.ok(inside(p));assert.ok(!protectedPaths.has(resolve(p)));try{original.unlinkSync(p);}catch(e){if(e.code!=="ENOENT")throw e;}}
function snapshot(dir){
  const out=[];function walk(p){for(const n of original.readdirSync(p).sort()){const q=join(p,n),s=original.statSync(q);if(s.isDirectory())walk(q);else out.push([short(q),original.readFileSync(q).toString("hex"),s.mtimeMs]);}}walk(dir);return out;
}
const names=["new","existing","false-start","malformed","read-failure","write-failure","mkdir-failure","ignore-failure","host-failure","refresh","touch","touch-missing","touch-failure","cleanup","cleanup-dry","cleanup-list-failure","cleanup-missing","cleanup-null-options"];
const results=[];let protectedCount=0;
for(const name of names){
  mode=name;clock=base;pid=4242;host="fixture-host.domain";protectedPaths=new Set();
  const vault=join(root,name),dir=join(vault,".projectstore","sessions"),record=join(dir,"record.json"),gi=join(vault,".projectstore",".gitignore");
  original.mkdirSync(vault,{recursive:true});
  seed(join(vault,"human.md"),"human source\n",base-1000,true);
  seed(join(vault,".projectstore","presence","foreign.json"),"modern presence\n",base-1000,true);
  const cleanup=name.startsWith("cleanup"), missing=name==="cleanup-missing";
  if(!missing)original.mkdirSync(dir,{recursive:true});
  if(!["new","ignore-failure","mkdir-failure"].includes(name))seed(gi,"human ignore policy\n",base-1000,true);else remove(gi);
  if(!missing){
    remove(record);
    if(cleanup){
      seed(join(dir,"old.json"),"old\n",base-day-1);
      seed(join(dir,"blocked.json"),"blocked\n",base-day-1);
      seed(join(dir,"bad-stat.json"),"stat failure\n",base-day-1);
      seed(join(dir,"self.json"),"self\n",base-2*day,true);
      seed(join(dir,"cutoff.json"),"cutoff\n",base-day,true);
      seed(join(dir,"live.json"),"live\n",base,true);
      seed(join(dir,"ignored.JSON"),"case-sensitive extension\n",base-2*day,true);
      seed(join(dir,"notes.txt"),"not session data\n",base-2*day,true);
    }else if(!["new","mkdir-failure","ignore-failure","host-failure","touch-missing"].includes(name)){
      const content=name==="malformed"?"{bad":JSON.stringify({id:"old",started_at:name==="false-start"?0:"kept-start",project_root:"old",recent_activity:name==="false-start"?{}:[{tool:"Edit",path:"a|b"}],discarded:true});
      seed(record,content);
    }
  }
  const protectedBefore=[...protectedPaths].map(p=>[short(p),identity(p)]);protectedCount+=protectedPaths.size;
  trace=[];let value,error;armed=true;
  try{
    if(cleanup)value=name==="cleanup-null-options"?m.cleanupStaleSessions(vault,24,"self",null):m.cleanupStaleSessions(vault,24,"self",{dryRun:name==="cleanup-dry"});
    else if(name.startsWith("touch"))value=m.touchSession(vault,"record");
    else{
      value=m.writeSession(vault,"record",join(root,"project"));
      if(name==="refresh"){clock+=1000;pid=4343;host="changed-host.domain";assert.equal(process.pid,4343);value=m.writeSession(vault,"record",join(root,"new-project"));}
    }
  }catch(e){error=e;}finally{armed=false;}
  assert.deepEqual([...protectedPaths].map(p=>[short(p),identity(p)]),protectedBefore);
  if(["write-failure","mkdir-failure","ignore-failure","host-failure","cleanup-list-failure"].includes(name))assert.equal(error,fault,"same original error");
  else if(name==="cleanup-null-options")assert.equal(error.name,"TypeError");else assert.equal(error,undefined);
  if(name==="cleanup")assert.equal(value,1);if(name==="cleanup-dry")assert.equal(value,2);if(name==="cleanup-missing")assert.equal(value,0);
  if(name==="touch")assert.equal(value,true);if(["touch-missing","touch-failure"].includes(name))assert.equal(value,false);
  if(name==="touch-missing")assert.equal(trace.some(c=>c[0]==="date"||c[0]==="utimes"),false);
  if(name==="cleanup-dry")assert.equal(trace.some(c=>c[0]==="unlink"),false);
  if(["new","existing","false-start","malformed","read-failure","refresh"].includes(name)){
    const bytes=original.readFileSync(record,"utf8"),data=JSON.parse(bytes);assert.equal(bytes.endsWith("\n"),false);assert.equal(data.id,"record");assert.equal("discarded"in data,false);
    assert.equal(data.started_at,["existing","refresh"].includes(name)?"kept-start":new NativeDate(base).toISOString());
    assert.deepEqual(data.recent_activity,["existing","refresh"].includes(name)?[{tool:"Edit",path:"a|b"}]:[]);
    if(name==="refresh"){assert.equal(data.host,"changed-host.domain");assert.equal(data.pid,4343);}
  }
  if(name==="new")assert.equal(original.readFileSync(gi,"utf8"),"# projectstore — runtime data, do not commit\n*\n");
  results.push({name,value,error:error?{name:error.name,code:error.code,message:error.message,sameFault:error===fault}:null,trace,files:snapshot(vault),protected:protectedBefore});
}
assert.deepEqual(violations,[],"no forbidden action, including swallowed ones");
console.log(JSON.stringify({results,protectedCount}));
