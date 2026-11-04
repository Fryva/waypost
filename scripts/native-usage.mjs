// Additive native counter diagnostics. Scalar settlement remains authoritative.
const schemas = {
 'claude-native-first-turn-total-v1':['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'],
 'codex-thread-cumulative-total-v1':['totalTokens','inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens'],
 'opencode-native-normalized-step-total-v1':['input','output','reasoning','cache_read','cache_write']
};
const fail = () => { throw new Error('native-usage-invalid'); };
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const integer = x => {if(typeof x !== 'string'||! /^(0|[1-9][0-9]{0,17})$/.test(x))fail();return BigInt(x);};
function counters(value,schema) {
 if(!object(value))fail();
 const required=schemas[schema];if(!required)fail();
 const optional=schema==='codex-thread-cumulative-total-v1'?['cacheWriteInputTokens']:[];
 if(required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>![...required,...optional].includes(k)))fail();
 const result=Object.fromEntries(Object.keys(value).map(k=>[k,integer(value[k])]));
 if(optional.length&&(result.cachedInputTokens>result.inputTokens||result.reasoningOutputTokens>result.outputTokens||result.inputTokens+result.outputTokens>result.totalTokens||Object.hasOwn(result,'cacheWriteInputTokens')&&result.cacheWriteInputTokens>result.inputTokens))fail();
 return result;
}
const charge = (c,schema) => schema==='codex-thread-cumulative-total-v1'?c.totalTokens:Object.values(c).reduce((a,b)=>a+b,0n);
export function validateNativeUsage(value,span) {
 if(!object(value)||Object.keys(value).length!==6||Object.keys(value).some(k=>!['protocol','schema','coverage','before','after','delta'].includes(k))||value.protocol!==1||!schemas[value.schema]||value.schema!==(span.counter_schema??span.schema)||!['complete','partial','absent'].includes(value.coverage))fail();
 const before=value.before===null?null:counters(value.before,value.schema),after=value.after===null?null:counters(value.after,value.schema);
 if(value.coverage!=='complete') {if(value.delta!==null||value.coverage==='absent'&&(before!==null||after!==null))fail();return structuredClone(value);}
 if(span.coverage!=='complete'||!before||!after)fail();
 const delta=counters(value.delta,value.schema),keys=Object.keys(before);
 if(keys.length!==Object.keys(after).length||keys.length!==Object.keys(delta).length||keys.some(k=>!Object.hasOwn(after,k)||!Object.hasOwn(delta,k)||after[k]<before[k]||after[k]-before[k]!==delta[k]))fail();
 if(charge(before,value.schema)!==integer(span.before)||charge(after,value.schema)!==integer(span.after)||charge(delta,value.schema)!==integer(span.actual_tokens))fail();
 return structuredClone(value);
}
// Boundaries must already be proved by the adapter; freshness alone is no baseline.
export function nativeUsage(span,before=null,after=null) {
 const strings=value=>value===null?null:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,String(v)]));
 try {
  const b=strings(before),a=strings(after),complete=span.coverage==='complete'&&b!==null&&a!==null;
  const value={protocol:1,schema:span.schema,coverage:complete?'complete':b||a?'partial':'absent',before:b,after:a,delta:complete?Object.fromEntries(Object.keys(b).map(k=>[k,(integer(a[k])-integer(b[k])).toString()])):null};
  return validateNativeUsage(value,span);
 } catch {return undefined;}
}
