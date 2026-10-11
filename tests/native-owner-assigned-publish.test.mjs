import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {nativePublicationGate} from '../scripts/team-native-integration.mjs';
import {createProtocolWorkReviewRequest,OWNER_ASSIGNED_REVIEW_LABEL} from '../scripts/team-native-work-review.mjs';

// ADR owner-assigned-team-roles, slice 4: review by the top listed independent reviewer, publication gate, labels.
const git=(cwd,...args)=>{const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const identity={name:'Owner',email:'owner@example.com',date:'1791331200 +0000'};
const work=f=>f.load().state.teams.team.work['fix-sum'];
async function reviewed(t,{review=true}={}){
 const f=await protocolHostFixture(t,{ownerAssigned:{executors:['peer-d']}});
 git(f.root,'init','-q');mkdirSync(join(f.root,'src'));writeFileSync(join(f.root,'src/sum.js'),'export const sum=(a,b)=>a-b;\n');git(f.root,'add','src/sum.js');git(f.root,'commit','-q','-m','base');
 const base=git(f.root,'rev-parse','HEAD');
 const ack=await f.host.acknowledgeProtocolLeadership({actionId:'leader',nonce:'leader',estimateTokens:'40'});assert.equal(ack.leader_acknowledged,true,ack.action_blocker);
 const allocation=f.load().state.subscription_allocations[routingDigest(f.unit)];
 f.host.enableNativeWork({revision:1,policy:{kind:'protocol-work',executor:'owner-assigned',allow_unknown_quota:true,max_attempts:2,timeout_ms:1000,expires_at:f.expiry,ceilings:{execution:{max_calls:3,max_estimate_tokens:'40'},review:{max_calls:3,max_estimate_tokens:'40'}},unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'200',allocation_revision:allocation.revision}]}});
 const criteria=['sum returns a+b'];
 f.host.installWorkManifest({workId:'fix-sum',manifest:{protocol:2,goal:'Fix sum',criteria,criteria_digest:routingDigest(criteria),paths:['src/sum.js'],base,forbidden_actions:['network']}});
 await f.hostFor('peer-d').executeNativeWork({workId:'fix-sum',estimateTokens:'40'});f.hostFor('peer-d').captureNativeWork({workId:'fix-sum'});
 if(review){const r=await f.hostFor('peer-b').reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});assert.equal(r.work_review_captured,true,JSON.stringify(r));}
 return {...f,base};
}
const publish=f=>f.host.publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity});
const gate=(f,mutate)=>{const s=structuredClone(f.load().state),t=s.teams.team;mutate?.(t);return nativePublicationGate(s,t,t.work['fix-sum'],Date.now());};
// What the reducer recomputes when the top reviewer is revoked, leaves or rebinds: the team floor falls to the next listed.
const out=(t,id,change)=>{Object.assign(t.participants[id],change);t.review_floor=1;};
const record=t=>Object.values(t.native_work_reviews)[0].records[0];
// Rewrites the standing approval as if peer-c had given it with its own binding.
const asPeerC=t=>{const rec=record(t),p=t.participants['peer-c'],row=t.policy.profiles.find(r=>r.participant==='peer-c');Object.assign(rec,{participant:'peer-c',incarnation:p.incarnation,model_revision:p.model.model_revision,descriptor_digest:p.native_binding.descriptor_digest,profile:structuredClone(row.identity),assignment_digest:routingDigest(row),review_floor:2});};

test('an owner-assigned work goes executor, review by the top listed reviewer, publication, with the owner-assigned labels',async t=>{
 const f=await reviewed(t),w=work(f);
 assert.equal(w.status,'approved');assert.equal(w.worker,'peer-d');
 const x=Object.values(f.load().state.subscription_invocations).find(i=>i.action?.kind==='protocol-work-review'),r=x.action.request;
 assert.equal(x.participant,'peer-b');assert.equal(r.label,OWNER_ASSIGNED_REVIEW_LABEL);assert.ok(r.assignment_digest);assert.equal(r.calibration_digest,undefined);assert.equal(r.review_floor,2);
 assert.match(f.prompts.find(p=>p.prompt.includes('Independent review')).prompt,/label: owner-assigned-review/);
 const rec=record(f.load().state.teams.team);
 assert.equal(rec.label,'owner-assigned-review');assert.equal(rec.assignment_digest,r.assignment_digest);assert.equal(rec.calibration_digest,undefined);
 const done=await publish(f),after=work(f),body=git(f.root,'show','-s','--format=%B',after.commit);
 assert.equal(after.status,'integrated');assert.equal(done.commit,after.commit);
 assert.ok(body.split('\n').includes('Waypost-Label: owner-assigned-unmeasured'),body);
 assert.doesNotMatch(body,/strongest|calibrated/);
 assert.equal(after.integrated_evidence.reviewer.participant,'peer-b');assert.ok(after.integrated_evidence.reviewer.assignment_digest);assert.equal(after.integrated_evidence.reviewer.calibration_digest,undefined);
});
test('the reviewer may share the leader\'s native configuration, but never the executor\'s',async t=>{
 const f=await reviewed(t,{review:false}),s=structuredClone(f.load().state),team=s.teams.team,row=id=>team.policy.profiles.find(p=>p.participant===id);
 const set=(id,from)=>{row(id).identity=structuredClone(row(from).identity);team.participants[id].native_admission.identity=structuredClone(row(from).identity);};
 const ask=()=>createProtocolWorkReviewRequest(s,team,{actionId:'r1',workId:'fix-sum'}).request.participant;
 set('peer-b','peer-a');assert.equal(ask(),'peer-b','the coordinator\'s configuration reviews');
 set('peer-b','peer-d');assert.equal(ask(),'peer-c','the executor\'s configuration is out');
 set('peer-c','peer-d');assert.throws(ask,/native-work-strongest-independent-review-unavailable/);
});
test('the executor is not its own reviewer',async t=>{
 const f=await reviewed(t,{review:false}),s=structuredClone(f.load().state),team=s.teams.team;
 team.work['fix-sum'].worker='peer-b';
 assert.equal(createProtocolWorkReviewRequest(s,team,{actionId:'r1',workId:'fix-sum'}).request.participant,'peer-c');
 team.participants['peer-c'].revoked=true;
 assert.throws(()=>createProtocolWorkReviewRequest(s,team,{actionId:'r1',workId:'fix-sum'}),/native-work-strongest-independent-review-unavailable/);
});
test('an approval from a lower-listed reviewer does not publish while the top independent reviewer stands',async t=>{
 const f=await reviewed(t);
 assert.equal(gate(f).reviewer.participant,'peer-b');
 assert.throws(()=>gate(f,asPeerC),/native-integration-(stronger-review-required|approving-critic-changed)/,'below the current floor');
 assert.equal(gate(f,t=>{asPeerC(t);out(t,'peer-b',{revoked:true});}).reviewer.participant,'peer-c','the next listed reviewer is the top once the first is out');
});
test('a busy top reviewer keeps the floor; a revoked, departed or rebound one is out and its approval is void',async t=>{
 const f=await reviewed(t);
 assert.throws(()=>gate(f,t=>{t.participants['peer-b'].availability='busy';}),/native-work-listed-reviewer-unavailable/,'the busy top reviewer keeps the floor and the team waits');
 assert.throws(()=>gate(f,t=>{t.participants['peer-b'].availability='busy';asPeerC(t);}),/native-work-listed-reviewer-unavailable/,'a lower approval does not open it while the top is busy');
 for(const [name,mutate] of [['revoked',t=>out(t,'peer-b',{revoked:true})],['left',t=>out(t,'peer-b',{availability:'left'})],['rebound',t=>out(t,'peer-b',{incarnation:'moved'})]])assert.throws(()=>gate(f,mutate),/native-integration-approving-critic-changed/,name);
});
// Slice 5: the same loss through the reducer's own events, not by editing the state.
test('a top reviewer revoked or departed by a real event voids its approval and the next listed reviewer becomes the top',async t=>{
 const f=await reviewed(t),at=new Date().toISOString();
 const event=(s,type,fields,actor)=>reduceTeamEvent(s,{type,team:'team',actor,at,request_key:type+'-'+fields.name,...fields.body});
 for(const [name,after] of [['revoked',s=>event(s,'revoke',{name:'r',body:{participant_id:'peer-b'}},'owner:'+s.owner_hash).state],['left',s=>event(s,'availability',{name:'l',body:{availability:'left',incarnation:s.teams.team.participants['peer-b'].incarnation,epoch:s.teams.team.epoch}},'peer-b').state]]){
  const s=after(structuredClone(f.load().state)),team=s.teams.team;
  assert.equal(team.assignment_lost,undefined,name);assert.equal(team.status,'active',name);assert.equal(team.work['fix-sum'].status,'approved',name);
  assert.throws(()=>nativePublicationGate(s,team,team.work['fix-sum'],Date.now()),/native-integration-approving-critic-changed/,name);
 }
});
test('after a real revoke the reviewer request names the next listed reviewer and its own floor',async t=>{
 const g=await reviewed(t,{review:false}),at=new Date().toISOString(),s=reduceTeamEvent(structuredClone(g.load().state),{type:'revoke',team:'team',actor:'owner:'+g.load().state.owner_hash,participant_id:'peer-b',at,request_key:'revoke-b'}).state,req=createProtocolWorkReviewRequest(s,s.teams.team,{actionId:'r2',workId:'fix-sum'}).request;
 assert.equal(req.participant,'peer-c');assert.equal(req.review_floor,1);
});
test('the reviewer request names the next listed reviewer and its own floor once the top one is out',async t=>{
 const f=await reviewed(t,{review:false}),state=structuredClone(f.load().state),team=state.teams.team;
 team.participants['peer-b'].revoked=true;team.review_floor=1;
 const req=createProtocolWorkReviewRequest(state,team,{actionId:'r2',workId:'fix-sum'}).request;
 assert.equal(req.participant,'peer-c');assert.equal(req.review_floor,1);
});
test('an expired assignment refuses the review request and the publication gate',async t=>{
 const f=await reviewed(t),state=structuredClone(f.load().state),team=state.teams.team,late=Date.parse(team.policy.expires_at)+1000;
 assert.throws(()=>nativePublicationGate(state,team,team.work['fix-sum'],late));
 const g=await reviewed(t,{review:false}),s2=structuredClone(g.load().state);
 assert.throws(()=>createProtocolWorkReviewRequest(s2,s2.teams.team,{actionId:'r3',workId:'fix-sum',now:Date.parse(s2.teams.team.policy.expires_at)+1000}),/native-work-review-active-team-required/);
});
