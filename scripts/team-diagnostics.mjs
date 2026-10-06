// Deterministic authority diagnostics; never repair or infer stopped processes.
import { join } from 'node:path';
import { coordinationDirs } from './presence.mjs';
import { readAuthority, explainRecovery } from './team-store.mjs';
import { reduceTeamEvent } from './team-state.mjs';
import { readFileSync, lstatSync } from 'node:fs';
import { parseFrontmatter, pathUnder } from './lib.mjs';
function authorityExists(root){try{lstatSync(root);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export function teamOrientation(vault) {
 const root=join(coordinationDirs(vault).primary,'teams','authority');
 try {
  if(!authorityExists(root))return {facts:[],text:''};
  const {state}=readAuthority(root,reduceTeamEvent),active=Object.values(state?.teams||{}).filter(t=>t.status!=='closed');
  if(!active.length)return {facts:[],text:''};
  const facts=active.slice(0,3).map(t=>{
   let title=t.task;const path=join(vault,t.task);
   try{if(pathUnder(path,vault)!==null && lstatSync(path).size<=262144)title=String(parseFrontmatter(readFileSync(path,'utf8')).data.title||title).slice(0,512);}catch{}
   return {id:t.id,title,status:t.status,epoch:t.epoch,leader:t.leader,review_blocker:t.review_blocker,work:Object.values(t.work).filter(w=>!['integrated','cancelled'].includes(w.status)).length};
  });
  const text='\n## Coordinated tasks\n\n'+facts.map(t=>`- ${t.title} (${t.status}): team ${t.id}, epoch ${t.epoch}, leader ${t.leader||'pending'}, ${t.work} unfinished work item(s). Inspect: waypost team status ${t.id}`).join('\n')+(active.length>3?`\n- ${active.length-3} more active team(s); waypost team status.`:'')+'\n';
  return {facts,text};
 }catch(error){return {facts:[],error:error.code||'authority-verification-failed',text:'\nTeam authority could not be verified; run waypost doctor before changing coordinated work.\n'};}
}
// Subscription calls without a terminal receipt, and reconciled calls whose
// unknown usage is not yet accepted, block admission and quota handover.
export function subscriptionCallWarnings(state){
 const out=[];
 for(const x of Object.values(state?.subscription_invocations||{})){
  if(['consumed','uncertain'].includes(x.state))out.push(`${x.team}: subscription call ${x.id} has ${x.partial_receipt?'only a partial receipt':'no terminal receipt'} and blocks admission and quota handover; ${(x.purpose==='protocol-control'?x.action?.operation_id:x.operation_id)?'run the participant Host operation native-control-reconcile --invocation '+x.id:'it has no ledger-bound operation to reconcile'}. Do not retry it.`);
  else if(x.state==='prepared'&&Date.parse(x.context?.expires_at)<Date.now())out.push(`${x.team}: reservation ${x.id} was never consumed and its context has expired; release it with the owner command team subscription-abort-${x.protocol===2?'v2':'v1'} ${x.team} --request-file <file with {"invocation_id":"${x.id}","nonce":"${x.nonce}"}>.`);
  else if(x.state==='reconciled'&&x.unknown_usage_accepted!==true)out.push(`${x.team}: reconciled call ${x.id} has unknown usage; admission on its counter waits until the owner runs unknown-usage-accept --invocation ${x.id} --charged-tokens <at least ${x.estimate_tokens}>.`);
 }
 return out;
}
export function checkTeamAuthority(vault) {
 const root=join(coordinationDirs(vault).primary,'teams','authority'),out=[];
 const finding=(level,message)=>out.push({group:'vault',level,check:'team-authority',message,file:root});
 try{
  if(!authorityExists(root))return out;
  const {state}=readAuthority(root,reduceTeamEvent),lock=explainRecovery(root);
  if(lock.locked)finding('warn','Team authority is locked; inspect the command and children before recovery. Age is not proof of stopping.');
  for(const t of Object.values(state?.teams||{})){
   if(t.status==='closed')continue;
   if(t.policy.mode==='automatic' && Date.parse(t.policy.expires_at)<=Date.now())finding('warn',`${t.id}: model strength evidence expired; run team refresh/watch.`);
   if(t.status==='handover')finding('warn',`${t.id}: leader handover requires stopped/adopted work acknowledgements.`);
   if(Object.values(t.work).some(w=>w.status==='uncertain') || Object.values(t.deliveries||{}).some(d=>d.state==='uncertain'))finding('warn',`${t.id}: uncertain execution or delivery must be reconciled before retry.`);
   if(Object.values(t.runtime_requests||{}).some(r=>r.consumed&&!r.captured&&!r.reconciled_stopped) || Object.values(t.review_requests||{}).some(r=>r.consumed&&!r.output_digest&&!r.reconciled_stopped) || Object.values(t.deliveries||{}).some(r=>r.state==='dispatching'))finding('warn',`${t.id}: consumed native operation has no final receipt or stopped-process proof; do not retry.`);
  }
  if(state?.publication_fence)finding('warn',`${state.publication_fence.team}: Git publication fence requires exact receipt or stopped-child reconciliation.`);
  for(const message of subscriptionCallWarnings(state))finding('warn',message);
  if(Object.values(state?.invocations||{}).some(i=>!['settled','aborted'].includes(i.state)))finding('warn','Outstanding provider invocation liabilities remain reserved; inspect dispatch and invoice evidence before retry.');
 }catch(e){finding('issue',`Team authority cannot be verified: ${e.code||e.message}`);}
 return out;
}
