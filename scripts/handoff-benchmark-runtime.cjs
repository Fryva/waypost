// Trusted observation collector. No assertions or expected answers live here.
// This VM limits the import surface; the verified OS sandbox is the security boundary.
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const source = fs.readFileSync(request.file, 'utf8');
  const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  const harness = vm.runInContext(`(() => {
    const stringify = JSON.stringify, keys = Object.keys;
    const events = [];
    const streamNames = new Map();
    const primitive = (value, expected) => ({type:typeof value,value:typeof value===expected?value:null});
    const clock = [];
    globalThis.setTimeout = (fn, ms) => { const t = {fn, ms:typeof ms==='number'?ms:null, active:true}; clock.push(t); return t; };
    globalThis.clearTimeout = t => { if(t) t.active=false; };
    const makeStream = name => {const stream=Object.freeze({name, pause(){events.push('pause:'+name)},write(s){events.push('write:'+name+':'+s)}});streamNames.set(stream,name);return stream;};
    globalThis.process = Object.freeze({stdin:makeStream('stdin'),stdout:makeStream('stdout'),stderr:makeStream('stderr')});
    let scenario = {};
    const fsMock = Object.freeze({existsSync:()=>{events.push('exists');return scenario.exists!==false}, readdirSync:()=>{events.push('list');return scenario.names||[]}});
    const readlineMock = Object.freeze({createInterface(options){
      events.push('output:'+streamNames.get(options.output));
      events.push('input:'+streamNames.get(options.input));
      const handlers = {}; let closed=false;
      const rl = {
        question(q,cb){events.push('question:'+q);scenario.answer=cb},
        on(name,cb){handlers[name]=cb;return rl},
        once(name,cb){const once=(...args)=>{delete handlers[name];cb(...args)};once.listener=cb;handlers[name]=once;return rl},
        removeListener(name,cb){if(handlers[name]===cb||handlers[name]?.listener===cb)delete handlers[name];return rl},
        off(name,cb){return rl.removeListener(name,cb)},
        close(){if(closed)return;closed=true;options.signal?.removeEventListener('abort',abort);events.push('close');handlers.close?.()}
      };
      const abort=()=>rl.close();
      if(options.signal&&!options.signal.aborted)options.signal.addEventListener('abort',abort,{once:true});
      scenario.handlers=handlers; return rl;
    }});
    globalThis.AbortController = class {
      constructor(){
        const listeners=new Map();let aborted=false;this.listenerCount=()=>listeners.size;
        this.signal=Object.freeze({get aborted(){return aborted},addEventListener(name,fn,options){if(name==='abort'&&(typeof fn==='function'||typeof fn?.handleEvent==='function')&&!listeners.has(fn))listeners.set(fn,{once:options?.once===true})},removeEventListener(name,fn){if(name==='abort')listeners.delete(fn)}});
        this.abort=()=>{if(aborted)return;aborted=true;const event=Object.freeze({type:'abort',target:this.signal});for(const[fn,options]of[...listeners]){if(!listeners.has(fn))continue;if(options.once)listeners.delete(fn);if(typeof fn==='function')Reflect.apply(fn,this.signal,[event]);else fn.handleEvent(event)}};
      }
    };
    // Keep the collector and mock state in a lexical closure inaccessible to candidate code.
    for (const ctor of [Object,Array,String,Number,Boolean,RegExp,Promise,Set,Map,JSON,Reflect,Symbol,AbortController]) {
      if(ctor.prototype)Object.freeze(ctor.prototype);Object.freeze(ctor);
    }
    for(const name of ['process','setTimeout','clearTimeout','AbortController','Object','Array','String','Number','Boolean','RegExp','Promise','Set','Map','JSON','Reflect','Symbol'])Object.defineProperty(globalThis,name,{value:globalThis[name],writable:false,configurable:false});
    return Object.freeze({fsMock,readlineMock,run:async(candidate,taskId)=>{
    let result;
    if(taskId==='A'){
      const inputs=['a|b|c','a\\\\|b|c', '', null, 12, '|||'];
      const cases=inputs.map(v=>{
        const escaped=candidate.escCell(v),unescaped=candidate.unescCell(v),round=candidate.unescCell(escaped);
        const e=primitive(escaped,'string'),u=primitive(unescaped,'string'),r=primitive(round,'string');
        return {escaped:e.value,escaped_type:e.type,unescaped:u.value,unescaped_type:u.type,round:r.value,round_type:r.type};
      });
      const symbol=primitive(candidate.escCell(Symbol('a|b|c')),'string');
      result={exports:keys(candidate).sort(),cases,symbol:symbol.value,symbol_type:symbol.type};
    } else if(taskId==='B'){
      const cases=[{names:[],prefix:'SPEC-'},{names:['spec-002-a.md','SPEC-013-x','spec-010-z','ignore-900'],prefix:'SPEC-'},{names:['A[001-x','A[012-y','AA999'],prefix:'A['},{names:['X+007-z','XX099'],prefix:'X+',pad:0},{names:['A.004','AB999'],prefix:'A.',pad:5}];
      events.length=0;
      const samples=cases.map(c=>primitive(candidate.nextNumberFromNames(c.names,c.prefix,c.pad),'string'));
      const values=samples.map(s=>s.value),value_types=samples.map(s=>s.type);
      const pureEvents=[...events];
      scenario={names:['spec-002-x','SPEC-013-y']}; events.length=0;
      const old=primitive(candidate.nextNumber('fixture','SPEC-'),'string');
      const oldEvents=[...events];
      scenario={exists:false};const missing=primitive(candidate.nextNumber('missing',null),'string');
      const slug=primitive(candidate.slugify('Привет Мир'),'string');
      result={exports:keys(candidate).sort(),values,value_types,pureEvents,old:old.value,old_type:old.type,oldEvents,missing:missing.value,missing_type:missing.type,slug:slug.value,slug_type:slug.type};
    } else if(taskId==='C'){
      const cases=[];
      for(const mode of ['yes','singley','no','eof','sigint','timeout','preabort','abort','afteranswer','overrides','defaults']){
        events.length=0;clock.length=0;scenario={};
        const controller=new AbortController();if(mode==='preabort')controller.abort();
        const input=makeStream(mode==='overrides'?'custom-input':'input');
        const options=mode==='defaults'?{signal:controller.signal}:{input,timeoutMs:mode==='overrides'?37:20,signal:controller.signal};
        if(mode==='overrides')options.output=makeStream('custom-output');
        const pending=candidate.askYesNo('Continue?',options);
        let settled=false;pending.then(()=>{settled=true});await Promise.resolve();
        if(mode==='yes'||mode==='afteranswer')scenario.answer?.(' YES ');
        else if(mode==='singley'||mode==='overrides')scenario.answer?.('y');
        else if(mode==='defaults')scenario.answer?.('no');
        else if(mode==='no')scenario.answer?.('yesterday');
        else if(mode==='eof')scenario.handlers?.close?.();
        else if(mode==='sigint')scenario.handlers?.SIGINT?.();
        else if(mode==='abort')controller.abort();
        await Promise.resolve();await Promise.resolve();
        const beforeTimers=settled;
        for(const timer of [...clock])if(timer.active)timer.fn();
        const sample=primitive(await pending,'boolean');
        if(mode==='afteranswer')controller.abort();
        cases.push({mode,value:sample.value,value_type:sample.type,beforeTimers,events:[...events],timerDurations:clock.map(t=>t.ms),createdTimers:clock.length,activeTimers:clock.filter(t=>t.active).length,abortListeners:controller.listenerCount()});
      }
      result={exports:keys(candidate).sort(),cases};
    } else throw Error('task');
    return stringify(result);
    }});
  })()`, context);
  const mod = new vm.SourceTextModule(source, { context, identifier: 'candidate.mjs', importModuleDynamically: () => { throw Error('dynamic-import-denied'); } });
  await mod.link(async specifier => {
    const key = specifier === 'node:fs' ? 'fsMock' : specifier === 'node:readline' ? 'readlineMock' : null;
    if (!key) throw Error('import-denied');
    const values = harness[key];
    const names = Object.keys(values);
    return new vm.SyntheticModule(names, function(){ for (const name of names) this.setExport(name, values[name]); }, { context });
  });
  await mod.evaluate({ timeout: 1000 });
  // Inputs are exercised here; only the parent holds expected answers.
  const serialized = await harness.run(mod.namespace, request.task);
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized)>32768) throw Error('observation-limit');
  process.stdout.write(JSON.stringify({kind:'coding-observations',version:1,task:request.task,observations:JSON.parse(serialized)}));
})().catch(() => { process.exitCode=1; });
