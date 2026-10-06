import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {authorizeActor} from '../scripts/team-state.mjs';
import {validateProtocolDelivery,formatDeliveryPrompt,deliverySuiteDigest} from '../scripts/team-native-delivery.mjs';

async function fixture(t,options={}){
 const f=await protocolHostFixture(t,{registerHosts:true,...options});
 // Delivery calls run as owned operations, so each binds its runtime operation.
 f.dependencies.ownedSubscriptionCalls=true;
 const team=f.load().state.teams.team,ids=Object.keys(team.participants),recipient=ids.find(id=>id!==f.participant);
 const enable=(revision,patch={})=>f.host.enableNativeDelivery({revision,policy:{kind:'addressed-delivery',allow_unknown_quota:true,max_calls:4,max_estimate_tokens:'40',timeout_ms:1000,expires_at:f.expiry,unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'200'}],...patch}});
 // A question sent by the fixture's main participant with its own credential.
 function ask(text,{to=recipient,id='question-'+text.replace(/\W/g,'-').slice(0,40)}={}){
  const cred=JSON.parse(readFileSync(join(f.root,'participant-'+f.participant.slice(-1)+'.json'),'utf8')),c={...cred,token_hash:createHash('sha256').update(cred.token).digest('hex')};
  const v=f.load(),actor=authorizeActor(v.state,'team',c);
  f.dependencies.mutate(join(f.root,'authority'),{actor,key:id,expected_revision:v.revision,command:{type:'send',team:'team',actor,incarnation:cred.incarnation,epoch:v.state.teams.team.epoch,at:new Date().toISOString(),request_key:id,message_id:id,to,kind:'question',payload:{text}}},null,{authorize:()=>{}});
  return id;
 }
 return {...f,recipient,recipientHost:f.hostFor(recipient),enable,ask};
}
const team=f=>f.load().state.teams.team;
const deliveries=f=>Object.values(f.load().state.subscription_invocations).filter(x=>x.purpose==='delivery');

test('a v2 relay answers an addressed question in a fresh stand-in context and forwards a labelled answer with the original correlation',async t=>{
 const f=await fixture(t);f.enable(1);const q=f.ask('What is the build status?'),begin=f.calls.length;
 const r=await f.recipientHost.relay({limit:5});assert.equal(r.delivered,1,JSON.stringify(r));assert.equal(r.protected_actions_granted,false);
 const calls=f.calls.slice(begin);assert.ok(calls.indexOf('subscription-reserve-v2')<calls.indexOf('subscription-consume-v2')&&calls.indexOf('subscription-consume-v2')<calls.indexOf('native-delivery'));
 const m=team(f).messages.find(x=>x.id===q);assert.ok(m.ack,'the question is acknowledged');
 const answer=team(f).messages.find(x=>x.reply_to===q);assert.equal(answer.sender,f.recipient);assert.equal(answer.recipient,f.participant);assert.equal(answer.payload.stand_in,true);assert.equal(answer.payload.text,'stand-in answer');
 const x=deliveries(f)[0];assert.equal(x.state,'settled');assert.equal(x.delivery.message_id,q);assert.match(x.operation_id,/^[A-Za-z0-9_-]+$/);
 const record=team(f).deliveries[x.nonce];assert.equal(record.state,'received');assert.equal(record.stand_in,true);assert.equal(record.invocation_id,x.id);
 assert.equal(team(f).leader,null,'a delivery grants nothing');
 const again=await f.recipientHost.relay({limit:5});assert.deepEqual(again.results,[]);assert.equal(f.calls.filter(c=>c==='native-delivery').length,1,'an answered question is never sent again');
});
test('without a current owner delivery ceiling the relay starts no native process, and an expired one is the same',async t=>{
 const f=await fixture(t);f.ask('no ceiling');const begin=f.calls.length;
 const r=await f.recipientHost.relay({limit:5});assert.equal(r.blocker,'host-native-delivery-owner-ceiling-required');assert.equal(r.delivered,0);
 assert.equal(f.calls.slice(begin).some(c=>c==='native-create'||c.startsWith('subscription-')),false);
 assert.throws(()=>f.enable(1,{expires_at:new Date(Date.now()-1000).toISOString()}),/bounded-owner-delivery-ceiling/);
 assert.throws(()=>f.enable(1,{unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'0'}]}),/existing-delivery-unit-allocation/);
});
test('an estimate above the ceiling is refused before inference',async t=>{
 const f=await fixture(t);f.enable(1);f.ask('expensive');
 const r=await f.recipientHost.relay({limit:5,estimateTokens:'41'});assert.equal(r.results[0].delivery_blocker,'bounded-delivery-reservation-required');assert.equal(f.calls.includes('native-delivery'),false);
});
test('a native turn that fails but still returns a receipt is settled as failed and never forwarded as an answer',async t=>{
 const f=await fixture(t,{deliveryTurnFails:true});f.enable(1);const q=f.ask('overloaded');
 const r=await f.recipientHost.relay({limit:5});assert.equal(r.delivered,0);
 const x=deliveries(f)[0],record=team(f).deliveries[x.nonce];assert.equal(record.state,'failed');assert.equal(record.failure,'delivery-native-turn-failed');assert.equal(record.output,undefined);
 assert.equal(team(f).messages.some(m=>m.reply_to===q),false);assert.equal(team(f).messages.find(m=>m.id===q).ack,null);
});
test('an answer to a sender who has left is not sent, but the question is acknowledged',async t=>{
 const f=await fixture(t);f.enable(1);const q=f.ask('then leave'),original=f.dependencies.mutate;
 const r0=f.load().state.teams.team.participants[f.participant];
 // The sender leaves after asking.
 const {readFileSync:read}=await import('node:fs'),cred=JSON.parse(read(join(f.root,'participant-'+f.participant.slice(-1)+'.json'),'utf8')),c={...cred,token_hash:createHash('sha256').update(cred.token).digest('hex')},v=f.load(),actor=authorizeActor(v.state,'team',c);
 original(join(f.root,'authority'),{actor,key:'leave',expected_revision:v.revision,command:{type:'availability',team:'team',actor,incarnation:r0.incarnation,epoch:v.state.teams.team.epoch,at:new Date().toISOString(),request_key:'leave',availability:'left'}},null,{authorize:()=>{}});
 const r=await f.recipientHost.relay({limit:5});assert.equal(r.results[0].forwarded,false);assert.equal(r.results[0].acknowledged,true);
 assert.equal(team(f).messages.some(m=>m.reply_to===q),false);assert.ok(team(f).messages.find(m=>m.id===q).ack);
});
test('the owner ceiling bounds the number of deliveries; the refused one is reported and not sent',async t=>{
 const f=await fixture(t);f.enable(1,{max_calls:1});f.ask('first question');f.ask('second question');
 const r=await f.recipientHost.relay({limit:5});assert.equal(r.delivered,1);assert.equal(r.results.at(-1).delivery_blocker,'delivery-owner-ceiling-exceeded');
 assert.equal(f.calls.filter(c=>c==='native-delivery').length,1);
});
test('an uncertain delivery keeps its hold, is never redelivered, and is reconciled from its owned closure',async t=>{
 let failing=true;const f=await fixture(t,{failSend:(_created,invocation)=>failing&&invocation.purpose==='addressed-peer-message'});f.enable(1);const q=f.ask('lost question');
 const r=await f.recipientHost.relay({limit:5});assert.equal(r.results[0].delivery_blocker,'native-outcome-uncertain');
 const x=deliveries(f)[0];assert.equal(x.state,'uncertain');assert.equal(team(f).deliveries[x.nonce].state,'uncertain');
 const sends=f.calls.filter(c=>c==='native-send').length,again=await f.recipientHost.relay({limit:5});assert.deepEqual(again.results,[]);assert.equal(f.calls.filter(c=>c==='native-send').length,sends);
 assert.equal(team(f).messages.find(m=>m.id===q).ack,null,'the sender sees no answer');
 // The lost call blocks the counter until it is reconciled and its charge accepted.
 failing=false;const next=f.ask('after the loss');
 const blocked=await f.recipientHost.relay({limit:5});assert.match(blocked.results[0].delivery_blocker,/uncertain/);
 assert.equal(f.recipientHost.reconcileProtocolControl({invocationId:x.id}).reconciled,x.id);assert.equal(team(f).deliveries[x.nonce].state,'stopped');
 f.recipientHost.acceptUnknownUsage({invocationId:x.id,chargedTokens:x.estimate_tokens});
 const resumed=await f.recipientHost.relay({limit:5});assert.equal(resumed.delivered,1,JSON.stringify(resumed));assert.ok(team(f).messages.find(m=>m.reply_to===next));
});
test('an answer that would not fit the message limit is recorded as failed and not forwarded; tokens still settle',async t=>{
 const f=await fixture(t,{deliveryAnswer:()=>'x'.repeat(16370)});f.enable(1);const q=f.ask('long answer');
 const r=await f.recipientHost.relay({limit:5});assert.equal(r.delivered,0);assert.equal(r.results[0].failure,'delivery-answer-exceeds-message-limit');
 const x=deliveries(f)[0];assert.equal(x.state,'settled');assert.equal(team(f).deliveries[x.nonce].state,'failed');assert.equal(team(f).messages.find(m=>m.id===q).ack,null);
});
test('an answer received before a crash is forwarded on the next relay without another inference',async t=>{
 const f=await fixture(t);f.enable(1);const q=f.ask('crash before forward'),original=f.dependencies.mutate;let dropped=false;
 f.dependencies.mutate=(path,request,...rest)=>{if(!dropped&&request.command.type==='send'&&request.command.reply_to===q){dropped=true;throw Object.assign(Error('fixture crash'),{code:'fixture-crash'});}return original(path,request,...rest);};
 const first=await f.recipientHost.relay({limit:5});assert.equal(first.results[0].forward_blocker,'fixture-crash');
 const inferences=f.calls.filter(c=>c==='native-delivery').length,second=await f.recipientHost.relay({limit:5});
 assert.equal(second.results[0].recovered,true);assert.equal(second.results[0].forwarded,true);assert.equal(f.calls.filter(c=>c==='native-delivery').length,inferences);
 assert.ok(team(f).messages.find(m=>m.reply_to===q));assert.ok(team(f).messages.find(m=>m.id===q).ack);
});
test('a Claude stand-in runs the same-peer preflight before capture and again before consume',async t=>{
 const f=await fixture(t,{harness:'claude'});f.enable(1);f.ask('claude question');const begin=f.calls.length;
 const r=await f.recipientHost.relay({limit:5});assert.equal(r.delivered,1,JSON.stringify(r));
 const calls=f.calls.slice(begin),inspects=calls.flatMap((c,i)=>c==='native-inspect'?[i]:[]);assert.equal(inspects.length,2);assert.ok(inspects[1]<calls.indexOf('subscription-consume-v2'));
});
test('the reducer refuses a Codex recipient, a prompt bound to other text and a question that is not current',()=>{
 const message={id:'q',kind:'question',recipient:'p',incarnation:'i',epoch:1,ack:null,sender:'s',payload:{text:'hi'}};
 const t={id:'team',epoch:1,policy:{expires_at:new Date(Date.now()+600000).toISOString()},messages:[message],deliveries:{},participants:{p:{id:'p',incarnation:'i'}},native_delivery_policy:{revision:1,expires_at:new Date(Date.now()+60000).toISOString(),max_calls:2,max_estimate_tokens:'40',timeout_ms:1000,unit_allocations:[{unit_digest:'u',max_tokens:'100'}]}};
 const r=over=>({purpose:'delivery',max_calls:1,estimate_tokens:'40',timeout_ms:1000,suite_digest:deliverySuiteDigest(),delivery:{message_id:'q',prompt_digest:routingDigest(formatDeliveryPrompt(message))},...over});
 assert.equal(validateProtocolDelivery({},t,r({}),t.participants.p,{unit_digest:'u'},Date.now()).delivery.message_id,'q');
 assert.throws(()=>validateProtocolDelivery({},t,r({}),{...t.participants.p,harness:'codex'},{unit_digest:'u'},Date.now()),/delivery-no-tools-context-required/);
 assert.throws(()=>validateProtocolDelivery({},t,r({delivery:{message_id:'q',prompt_digest:routingDigest('other')}}),t.participants.p,{unit_digest:'u'},Date.now()),/delivery-prompt-binding-required/);
 assert.throws(()=>validateProtocolDelivery({},{...t,messages:[{...message,ack:{at:'x'}}]},r({}),t.participants.p,{unit_digest:'u'},Date.now()),/current-unacknowledged-question/);
 assert.throws(()=>validateProtocolDelivery({},{...t,native_delivery_policy:undefined},r({}),t.participants.p,{unit_digest:'u'},Date.now()),/owner-ceiling-required/);
});
test('legacy v1 delivery commands cannot rewrite a v2 delivery record',async()=>{
 const {reduceTeamEvent}=await import('../scripts/team-state.mjs');
 const state={owner_hash:'o',collectors:{c:{id:'c',team:'team',purposes:['dispatch'],revoked:false}},teams:{team:{id:'team',epoch:1,messages:[],participants:{},deliveries:{n:{protocol:2,nonce:'n',collector:'collector:c',state:'dispatching',participant:'p',incarnation:'i',epoch:1}},policy:{protocol:1}}}};
 for(const command of [{type:'delivery-capture-v1',nonce:'n',outcome:'uncertain'},{type:'native-operation-reconcile-v1',operation:'delivery',nonce:'n',stopped:true,evidence_digest:'a'.repeat(64)}])
  {assert.throws(()=>reduceTeamEvent(structuredClone(state),{...command,team:'team',actor:'collector:c',at:new Date().toISOString(),request_key:'k'}),/bound-native-delivery-required|uncertain-native-operation-required/);
   const v1=structuredClone(state);delete v1.teams.team.deliveries.n.protocol;assert.doesNotThrow(()=>reduceTeamEvent(v1,{...command,team:'team',actor:'collector:c',at:new Date().toISOString(),request_key:'k'}),'the same command still works on a v1 record');}
});
test('doctor names an orphaned prepared reservation with the owner abort',async()=>{
 const {subscriptionCallWarnings}=await import('../scripts/team-diagnostics.mjs');
 const out=subscriptionCallWarnings({subscription_invocations:{x:{id:'x',nonce:'n',team:'team',protocol:2,state:'prepared',context:{expires_at:new Date(Date.now()-1000).toISOString()}}}});
 assert.match(out[0],/subscription-abort-v2 team/);
});
test('a complete receipt after a partial one settles the delivery record from uncertain to received',async t=>{
 const f=await fixture(t,{deliveryPartial:true});f.enable(1);const q=f.ask('partial first');
 await f.recipientHost.relay({limit:5});const x=deliveries(f)[0];assert.equal(x.state,'uncertain');assert.equal(team(f).deliveries[x.nonce].state,'uncertain');
 const {routingDigest:digest}=await import('../scripts/model-routing.mjs'),receipt={...x.partial_receipt,coverage:'complete',before:'0',after:'20',actual_tokens:'20',delivery:{output_digest:digest('late answer'),outcome:'completed'}};
 const cred=JSON.parse(readFileSync(join(f.root,'collector-'+f.recipient.slice(-1)+'.json'),'utf8')),v=f.load(),actor=authorizeActor(v.state,'team',{...cred,token_hash:createHash('sha256').update(cred.token).digest('hex')});
 f.dependencies.mutate(join(f.root,'authority'),{actor,key:'late',expected_revision:v.revision,command:{type:'subscription-usage-v2',team:'team',actor,incarnation:null,epoch:v.state.teams.team.epoch,at:new Date().toISOString(),request_key:'late',invocation_id:x.id,nonce:x.nonce,receipt,delivery_output:'late answer'}},null,{authorize:()=>{}});
 assert.equal(deliveries(f)[0].state,'settled');const record=team(f).deliveries[x.nonce];assert.equal(record.state,'received');assert.equal(record.output,'late answer');
 const r=await f.recipientHost.relay({limit:5});assert.equal(r.results[0].recovered,true);assert.ok(team(f).messages.find(m=>m.reply_to===q));
});
test('a ceiling that lapses after enabling stops new deliveries but answers already received are still forwarded',async t=>{
 const f=await fixture(t);f.enable(1,{expires_at:new Date(Date.now()+1500).toISOString()});f.ask('quick');
 await new Promise(resolve=>setTimeout(resolve,1600));
 const r=await f.recipientHost.relay({limit:5});assert.equal(r.blocker,'host-native-delivery-owner-ceiling-required');assert.equal(f.calls.includes('native-delivery'),false);
});
