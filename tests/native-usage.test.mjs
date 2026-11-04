import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeUsage,validateNativeUsage} from '../scripts/native-usage.mjs';
import {sealIdentityReceipt} from '../scripts/team-native-action.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
const claude='claude-native-first-turn-total-v1',codex='codex-thread-cumulative-total-v1',opencode='opencode-native-normalized-step-total-v1';
const span=(schema,before='0',after='30')=>({schema,coverage:'complete',before,after,actual_tokens:(BigInt(after)-BigInt(before)).toString()});
const zeros=c=>Object.fromEntries(Object.keys(c).map(k=>[k,'0']));
const cc={input_tokens:'10',output_tokens:'5',cache_creation_input_tokens:'3',cache_read_input_tokens:'12'};
const cx={totalTokens:'30',inputTokens:'20',cachedInputTokens:'15',outputTokens:'8',reasoningOutputTokens:'5'};
test('disjoint Claude and OpenCode buckets sum while Codex charges total without subset double count',()=>{
 for(const [schema,c] of [[claude,cc],[codex,cx],[opencode,{input:'10',output:'5',reasoning:'3',cache_read:'10',cache_write:'2'}]]){
  const s=span(schema),v=nativeUsage(s,zeros(c),c);assert.equal(v.coverage,'complete');assert.deepEqual(v.delta,c);assert.deepEqual(validateNativeUsage(v,s),v);
 }
});
test('counter diagnostics use exact BigInt subtraction above Number safe integer',()=>{
 const c={...cx,totalTokens:'9007199254741000',inputTokens:'9007199254740990',cachedInputTokens:'9007199254740980'},b={...c,totalTokens:'9007199254740999',inputTokens:'9007199254740989',cachedInputTokens:'9007199254740979'};
 const v=nativeUsage(span(codex,b.totalTokens,c.totalTokens),b,c);assert.equal(v.delta.totalTokens,'1');assert.equal(v.delta.cachedInputTokens,'1');
});
test('partial and absent never fabricate a baseline or known zero delta',()=>{
 const partial=nativeUsage({...span(codex),coverage:'partial'},null,cx);assert.equal(partial.coverage,'partial');assert.equal(partial.before,null);assert.equal(partial.delta,null);
 const absent=nativeUsage({...span(codex),coverage:'absent'});assert.deepEqual(absent,{protocol:1,schema:codex,coverage:'absent',before:null,after:null,delta:null});
 assert.equal(nativeUsage(span(codex),null,cx).coverage,'partial');
});
test('cache write is retained only with matching boundaries; bad subsets never invent diagnostics',()=>{
 const c={...cx,cacheWriteInputTokens:'2'},s=span(codex);assert.equal(nativeUsage(s,zeros(c),c).delta.cacheWriteInputTokens,'2');
 assert.equal(nativeUsage(s,zeros(cx),c),undefined);
 for(const change of [{cachedInputTokens:'21'},{reasoningOutputTokens:'9'},{cacheWriteInputTokens:'21'},{totalTokens:'27'}])assert.equal(nativeUsage(s,zeros({...cx,...change}),{...cx,...change}),undefined);
});
test('strict optional diagnostic rejects wrong schema, extra fields, noncanonical values and scalar mismatch',()=>{
 const s=span(claude),v=nativeUsage(s,zeros(cc),cc);
 for(const change of [{schema:codex},{extra:1},{protocol:2},{coverage:'partial'},{after:{...cc,input_tokens:'010'}},{delta:{...cc,output_tokens:'6'}},{delta:{...cc,thinking_tokens:'1'}}])assert.throws(()=>validateNativeUsage({...v,...change},s),/native-usage-invalid/);
 assert.throws(()=>validateNativeUsage(v,{...s,actual_tokens:'29'}));
});
test('identity seals bind optional diagnostics and preserve historical absent projection',()=>{
 const now=Date.parse('2026-10-03T12:00:00Z'),at=new Date(now).toISOString(),x={purpose:'identity',nonce:'nonce',context:{native_id:'native',id:'ctx'}},model={provider:'p',model_id:'m',reasoning:'unknown'};
 const native={invocation_id:'nonce',native_id:'native',usage_span:{...span(claude),native_id:'native',turn_id:'turn'},actualModel:{...model,observed_at:at},context_manifest:{native_id:'native'},output:'answer'};
 const receipt={...span(claude),counter_schema:claude,turn_id:'turn',observed_model:model,identity_seal:{native_receipt:native,native_receipt_digest:routingDigest(native),original_output:'answer',output_digest:routingDigest('answer'),outcome:'completed',observed_at:at}};
 assert.ok(sealIdentityReceipt({},x,receipt,now));
 const diagnostic=nativeUsage(span(claude),zeros(cc),cc);receipt.native_usage=diagnostic;assert.throws(()=>sealIdentityReceipt({},x,receipt,now),/counter-binding/);
 native.usage_span.native_usage=diagnostic;receipt.identity_seal.native_receipt_digest=routingDigest(native);assert.ok(sealIdentityReceipt({},x,receipt,now));
 receipt.native_usage={...diagnostic,coverage:'partial',delta:null};assert.throws(()=>sealIdentityReceipt({},x,receipt,now),/counter-binding/);
});
