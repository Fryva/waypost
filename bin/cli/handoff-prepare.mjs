// Private route references and metadata-only receiver preparation.
import {resolve,join} from 'node:path';
import {TextDecoder} from 'node:util';
import {spawnSync} from 'node:child_process';
import {projectRoot,ROOT} from './core.mjs';
import {readConfig} from '../../scripts/lib.mjs';
import {coordinationDirs} from '../../scripts/presence.mjs';
import {readAuthority} from '../../scripts/team-store.mjs';
import {reduceTeamEvent} from '../../scripts/team-state.mjs';
import {readHandoffFile,inspectPacket} from '../../scripts/handoff.mjs';
import {createHandoffRoute,readHandoffRoute,writePreparedHandoffRoute,preflightCurrentPacket} from '../../scripts/handoff-prepare.mjs';
const allowed=new Set(['--packet','--route','--team','--sender','--receiver','--sender-credential','--owner-credential','--output','--estimate-tokens']);
export async function handlePrepare(rest){
 try{
  const prepareOptions={};for(let i=0;i<rest.length;i+=2){const key=rest[i],value=rest[i+1];if(!allowed.has(key)||Object.hasOwn(prepareOptions,key)||typeof value!=='string'||!value||value.startsWith('--'))throw new Error('handoff-prepare-options');prepareOptions[key]=value;}
  if(!prepareOptions['--packet'])throw new Error('handoff-prepare-packet-required');
  if(prepareOptions['--estimate-tokens']!==undefined&&(!/^[1-9][0-9]{0,17}$/.test(prepareOptions['--estimate-tokens'])))throw new Error('handoff-preflight-positive-estimate-required');
  const cfg=readConfig();if(!cfg?.vault_path)throw new Error('bind-a-vault-before-handoff-prepare');
  const root=resolve(projectRoot()),authorityRoot=join(coordinationDirs(cfg.vault_path).primary,'teams','authority'),state=readAuthority(authorityRoot,reduceTeamEvent).state;
  const context={state,authorityRoot,projectRoot:root,vaultPath:cfg.vault_path},packetBytes=readHandoffFile(root,prepareOptions['--packet'],65536),packet=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(packetBytes)),inspection=inspectPacket(root,packet);
  let route,routePath;
  if(prepareOptions['--route']){
   if(['--team','--sender','--receiver','--sender-credential','--owner-credential','--output'].some(k=>prepareOptions[k]))throw new Error('handoff-prepare-route-options-conflict');
   routePath=resolve(prepareOptions['--route']);route=readHandoffRoute(routePath,context);
  }else{
   if(['--team','--sender','--receiver','--sender-credential','--owner-credential','--output'].some(k=>!prepareOptions[k]))throw new Error('handoff-prepare-route-inputs-required');
   route=createHandoffRoute({...context,team:prepareOptions['--team'],sender:prepareOptions['--sender'],receiver:prepareOptions['--receiver'],senderCredential:prepareOptions['--sender-credential'],ownerCredential:prepareOptions['--owner-credential']});
   routePath=writePreparedHandoffRoute(prepareOptions['--output'],route,{root,packetPath:prepareOptions['--packet']});
  }
  const preflight=preflightCurrentPacket(inspection,()=>{
  const r=spawnSync(process.execPath,[join(ROOT,'bin','waypost.mjs'),'--project',root,'team','host',route.team,'--operation','preflight','--participant',route.receiver,'--credential',route.receiver_credential,'--owner-credential',route.owner_credential,'--collector-credential',route.collector_credential,'--endpoint-file',route.endpoint,'--estimate-tokens',prepareOptions['--estimate-tokens']||'16000'],{encoding:'utf8',maxBuffer:1048576,env:{...process.env,WAYPOST_NO_BEAT:'1'}});
  if(!r.error&&r.status===0)try{return JSON.parse(r.stdout);}catch{}
  return {ready:false,blockers:['handoff-preflight-host-command-failed'],model_requests:0};
  });
  readHandoffRoute(routePath,{...context,state:readAuthority(authorityRoot,reduceTeamEvent).state});
  const finalInspection=inspectPacket(root,packet),packetUnchanged=packetBytes.equals(readHandoffFile(root,prepareOptions['--packet'],65536));
  const blockers=[...new Set([...(packetUnchanged&&inspection.snapshot_matches===true&&finalInspection.snapshot_matches===true?[]:['handoff-delivery-stale']),...(preflight.blockers||[])])],result={protocol:1,scope:'packet-route-policy-and-native-isolation',ready:blockers.length===0,blockers,route_file:routePath,packet_current:packetUnchanged&&inspection.snapshot_matches===true&&finalInspection.snapshot_matches===true,preflight,actual_model:'unknown-until-native-receipt',task_payload:'checked-again-by-deliver',proof_reusable:false,model_requests:0};
  process.stdout.write(JSON.stringify(result,null,2)+'\n');if(!result.ready)process.exitCode=2;
 }catch(error){process.stderr.write('waypost handoff prepare: '+error.message+'\n');process.exitCode=1;}
}
