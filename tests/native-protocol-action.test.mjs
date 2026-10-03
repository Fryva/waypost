import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityFixture,now,at,expiry} from './helpers/native-calibration.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {createProtocolLeaderAckRequest,protocolLeaderAckSlot,formatProtocolLeaderAck,readProtocolAck} from '../scripts/team-native-action.mjs';
let shared;
async function fixture(){shared??=authorityFixture();const f=await shared,s=structuredClone(f.state);Object.assign(s,{owner_hash:'fixture'});Object.assign(s.teams.team,{policy:{protocol:1,revision:1,mode:'automatic',domain:'coding',generated_at:at,expires_at:expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],profiles:[],evidence_floor:['adapter-observed']},leader:null,candidate:null,status:'forming',work:{},required_review_models:[],native_policy_bootstrap:true});return reduceTeamEvent(s,{type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:f.revision}).state.teams.team;}
test('fixed ACK binds actual current candidate and independent critic without granting authority',async()=>{
 const team=await fixture(),before=structuredClone(team),action=createProtocolLeaderAckRequest(team,{actionId:'ack-one',now});
 assert.equal(action.request.participant,team.candidate);assert.equal(action.request.review_candidate.participant,team.review_candidate);assert.equal(action.request.target_epoch,team.epoch+1);assert.equal(action.request.profile.profile_id,team.participants[team.candidate].native_admission.identity.profile_id);
 assert.deepEqual(team,before);assert.match(formatProtocolLeaderAck(action),/Do not call tools/);assert.deepEqual(readProtocolAck(JSON.stringify({ack:true,action_id:action.action_id,request_digest:action.request_digest}),action),{ack:true,action_id:action.action_id,request_digest:action.request_digest});
});
test('a new action ID cannot change the semantic election slot',async()=>{
 const team=await fixture(),a=createProtocolLeaderAckRequest(team,{actionId:'first',now}),b=createProtocolLeaderAckRequest(team,{actionId:'second',now});
 assert.notEqual(a.request_digest,b.request_digest);assert.equal(protocolLeaderAckSlot(a),protocolLeaderAckSlot(b));
 assert.throws(()=>protocolLeaderAckSlot({...a,request_digest:b.request_digest}),/fixed-request-binding/);
});
test('ACK grammar rejects duplicate decoded names, extras, refusal and foreign bindings',async()=>{
 const action=createProtocolLeaderAckRequest(await fixture(),{actionId:'one',now}),response={ack:true,action_id:'one',request_digest:action.request_digest};
 for(const raw of [JSON.stringify({...response,ack:false}),JSON.stringify({...response,extra:true}),JSON.stringify({...response,action_id:'foreign'}),JSON.stringify({...response,request_digest:'a'.repeat(64)}),'[]','{"ack":false,"ack":true,"action_id":"one","request_digest":"'+action.request_digest+'"}','{"ack":true,"a\\u0063k":true,"action_id":"one","request_digest":"'+action.request_digest+'"}'])assert.throws(()=>readProtocolAck(raw,action));
});
test('stale policy, changed candidate, missing critic and active work refuse a fixed ACK request',async()=>{
 const team=await fixture();assert.throws(()=>createProtocolLeaderAckRequest(team,{actionId:'one',now:Date.parse(expiry)}));
 for(const patch of [{candidate:'foreign'},{review_candidate:'foreign'},{leader:team.candidate,status:'active'},{work:{job:{status:'running'}}}])assert.throws(()=>createProtocolLeaderAckRequest({...team,...patch},{actionId:'one',now}));
});
