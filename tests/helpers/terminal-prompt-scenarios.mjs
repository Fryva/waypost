// Isolated child: fake readline/timers/stdio; no terminal, OS signals or removal.
import assert from "node:assert/strict";
import readline from "node:readline";
import {EventEmitter} from "node:events";
import {syncBuiltinESMExports} from "node:module";
const rawOut=process.stdout.write.bind(process.stdout),rawErr=process.stderr.write.bind(process.stderr);
let trace=[],timers=new Map(),nextId=0,activeCase,input,output,instance,expectedInput,expectedOutput;
const fault=new Error("fixture prompt failure");
function stream(tag,pausable=true){
  return{tag,pauseCalls:0,paused:false,write(s){trace.push(["output",tag,String(s)]);return true;},...(pausable?{pause(){this.pauseCalls++;trace.push(["pause",tag]);if(activeCase?.name==="pause-error")throw fault;this.paused=true;}}:{})};
}
Object.defineProperty(process,"stdin",{configurable:true,enumerable:true,get(){trace.push(["get","stdin",input.tag]);return input;}});
Object.defineProperty(process,"stderr",{configurable:true,enumerable:true,get(){trace.push(["get","stderr",output.tag]);return output;}});
globalThis.setTimeout=(cb,ms)=>{const t={id:++nextId,cb,ms,active:true};timers.set(t.id,t);trace.push(["timer",t.id,ms]);return t;};
globalThis.clearTimeout=t=>{assert.equal(timers.get(t.id),t);trace.push(["clear",t.id]);t.active=false;};
readline.createInterface=options=>{
  assert.deepEqual(Object.keys(options),["input","output"]);assert.equal(options.input,expectedInput);assert.equal(options.output,expectedOutput);
  trace.push(["create",options.input.tag,options.output.tag]);
  if(activeCase.name==="create-error")throw fault;
  const events=new EventEmitter();
  instance={closed:false,callback:null,
    question(q,cb){trace.push(["question",q]);if(activeCase.name==="question-error")throw fault;options.output.write(q);this.callback=cb;if(activeCase.name==="sync-answer")cb("Y");},
    on(name,cb){trace.push(["on",name]);events.on(name,cb);return this;},
    close(){trace.push(["close"]);if(!this.closed){this.closed=true;events.emit("close");}},
    emit(name){trace.push(["emit",name]);if(name==="close")this.closed=true;events.emit(name);},
  };return instance;
};
syncBuiltinESMExports();
const scenarios=[
  {name:"y",answer:"y",expected:true},{name:"yes",answer:"yes",expected:true},{name:"trim-case",answer:"  YeS  ",expected:true},
  {name:"no",answer:"n",expected:false},{name:"empty",answer:"",expected:false},{name:"fullwidth",answer:"ＹＥＳ",expected:false},
  {name:"null-answer",answer:null,expected:false},{name:"zero-answer",answer:0,expected:false},{name:"true-answer",answer:true,expected:false},
  {name:"symbol-answer",answer:Symbol("yes"),expected:false},{name:"object-answer",expected:true},
  {name:"defaults-A",answer:"y",expected:true},{name:"defaults-B",answer:"n",expected:false},
  {name:"timeout",expected:false},{name:"eof",expected:false},{name:"sigint",expected:false},
  {name:"race-answer",answer:"yes",expected:true},{name:"race-sigint",expected:false},
  {name:"pause-error",answer:"y",expected:true},{name:"no-pause",answer:"yes",expected:true},
  {name:"create-error",error:"rejected"},{name:"question-error",error:"rejected"},
  {name:"getter-error",error:"sync-error"},{name:"null-options",error:"sync-error"},
  {name:"sync-answer",expected:true},{name:"option-getters",answer:"yes",expected:true},
];
function fire(t){trace.push(["fire",t.id]);t.active=false;t.cb();}
async function flush(){await Promise.resolve();await Promise.resolve();}
async function main(){
  const m=await import(process.argv[2]);assert.deepEqual(trace,[],"no prompt, timer or stdio capture on import");
  const results=[];
  for(const c of scenarios){
    activeCase=c;trace=[];timers=new Map();nextId=0;instance=null;
    input=stream("input-"+c.name,c.name!=="no-pause");output=stream("stderr-"+c.name);expectedInput=input;expectedOutput=output;
    let options={input,output,timeoutMs:13};
    if(c.name==="option-getters")options={get input(){trace.push(["option","input"]);return input;},get output(){trace.push(["option","output"]);return output;},get timeoutMs(){trace.push(["option","timeoutMs"]);return 23;}};
    if(c.name==="getter-error")options={get input(){trace.push(["option","input"]);throw fault;}};
    if(c.name==="null-options")options=null;
    let observation={state:"pending"},settlements=0,p;
    const errorData=e=>({name:e.name,message:e.message,sameFault:e===fault});
    try{
      p=c.name.startsWith("defaults-")?m.askYesNo("Remove fixture? [y/N] "):m.askYesNo("Remove fixture? [y/N] ",options);
      assert.ok(p instanceof Promise);
      p.then(value=>{settlements++;observation={state:"fulfilled",value};trace.push(["settle","fulfilled",value]);},e=>{settlements++;observation={state:"rejected",error:errorData(e)};trace.push(["settle","rejected"]);});
    }catch(e){observation={state:"sync-error",error:errorData(e)};trace.push(["sync-error"]);}
    if(c.error){
      await flush();assert.equal(observation.state,c.error);
      if(c.name!=="null-options")assert.equal(observation.error.sameFault,true);else assert.equal(observation.error.name,"TypeError");
      if(c.name==="question-error"){
        assert.equal([...timers.values()].filter(t=>t.active).length,1,"preserve residual timer after rejected question");
        assert.equal(instance.closed,false);trace.push(["before-error-drain",1]);
      }
      for(const t of timers.values())if(t.active)fire(t);
    }else{
      assert.ok(instance);assert.equal([...timers.values()][0].ms,c.name.startsWith("defaults-")?60000:c.name==="option-getters"?23:13);
      if(c.name==="timeout")fire([...timers.values()][0]);
      else if(c.name==="eof")instance.emit("close");
      else if(c.name==="sigint"||c.name==="race-sigint"){
        instance.emit("SIGINT");if(c.name==="race-sigint"){instance.callback("yes");fire([...timers.values()][0]);instance.emit("close");}
      }else if(c.name!=="sync-answer"){
        const value=c.name==="object-answer"?{toString(){trace.push(["coerce-answer"]);return " YES ";}}:c.answer;
        trace.push(["answer"]);instance.callback(value);
        if(c.name==="race-answer"){instance.callback("no");instance.emit("SIGINT");fire([...timers.values()][0]);instance.emit("close");}
      }
    }
    await flush();
    assert.equal(observation.state,c.error||"fulfilled");assert.equal(settlements,c.error==="sync-error"?0:1);
    if(!c.error){
      assert.equal(observation.value,c.expected);assert.equal(instance.closed,true);assert.equal(input.pauseCalls,c.name==="no-pause"?0:1);
      const index=name=>trace.findIndex(e=>e[0]===name);
      assert.ok(index("create")<index("timer")&&index("timer")<index("question"));
      assert.ok(index("clear")<index("close")&&index("close")<index("settle"));
      if(c.name!=="no-pause")assert.ok(index("close")<index("pause")&&index("pause")<index("settle"));
      assert.equal(trace.filter(e=>e[0]==="clear").length,1);assert.equal(trace.filter(e=>e[0]==="close").length,1);
    }
    assert.equal([...timers.values()].filter(t=>t.active).length,0,"no remaining fake timer after normal finish or harness error drain");
    results.push({name:c.name,observation,settlements,trace,closed:instance?.closed??null,pauseCalls:input.pauseCalls,paused:input.paused});
  }
  rawOut(JSON.stringify({results})+"\n");
}
main().catch(e=>{rawErr(e.stack+"\n");process.exitCode=1;});
