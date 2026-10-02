import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { routingDigest } from '../scripts/model-routing.mjs';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
import { validateParticipantHostManifest, createParticipantHostBinding, readParticipantHost } from '../scripts/team-host-registry.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'wp-host-registry-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const endpointFile=join(root,'endpoint.json'),collectorFile=join(root,'collector.json'),credentialFile=join(root,'participant.json'),hostFile=join(root,'host.json');
 const descriptor={managed:true,harness:'codex',cwd:root,mode:'read-only'},p={id:'worker',incarnation:'worker-inc',availability:'ready',credential_hash:sha('p'.repeat(64))};
 p.native_binding={endpoint_file:endpointFile,collector_file:collectorFile,collector_id:'collector',descriptor_digest:routingDigest(descriptor)};
 const manifest={protocol:1,team:'team',participant:p.id,incarnation:p.incarnation,authority_root:root,project_root:root,vault_path:root,participant_credential_file:credentialFile,endpoint_file:endpointFile,collector_file:collectorFile,descriptor_digest:routingDigest(descriptor)};
 const files=[[endpointFile,{team:'team',participant:p.id,descriptor}],[credentialFile,{protocol:1,role:'participant',participant:p.id,incarnation:p.incarnation,token:'p'.repeat(64)}],[collectorFile,{protocol:1,role:'collector',collector:'collector',token:'c'.repeat(64)}],[hostFile,manifest]];
 for(const [path,data]of files)writeFileSync(path,JSON.stringify(data),{mode:0o600});
 p.host_binding=createParticipantHostBinding({hostFile,manifest,participant:p});
 const state={protocol:1,owner_hash:'o'.repeat(64),teams:{team:{id:'team',epoch:0,status:'active',participants:{worker:p},work:{},messages:[]}},collectors:{collector:{id:'collector',team:'team',credential_hash:sha('c'.repeat(64)),purposes:['dispatch'],revoked:false}}};
 const read=()=>readParticipantHost({state,teamId:'team',participantId:'worker',authorityRoot:root,projectRoot:root,vaultPath:root});
 return {root,state,p,manifest,hostFile,credentialFile,collectorFile,endpointFile,read};
}
test('explicit registry validates exact private locator and participant/collector credentials',t=>{
 const f=fixture(t),resolved=f.read();assert.equal(resolved.credential.participant,'worker');assert.equal(resolved.collector.collector,'collector');assert.equal(resolved.descriptor.managed,true);assert.deepEqual(resolved.manifest,f.manifest);
});
test('registry rejects unknown fields and executable or owner credential locators',t=>{
 const f=fixture(t);for(const field of ['dispatcher','owner_credential_file','command','dependencies'])assert.throws(()=>validateParticipantHostManifest({...f.manifest,[field]:'/untrusted'}),/shape-required/);
 assert.throws(()=>validateParticipantHostManifest({...f.manifest,participant_credential_file:'../participant.json'}),/canonical-path|required/);
});
test('registry never searches for unregistered credentials and blocks revoked incarnations',t=>{
 const f=fixture(t);delete f.p.host_binding;assert.throws(f.read,/locator-unregistered/);
 f.p.host_binding=createParticipantHostBinding({hostFile:f.hostFile,manifest:f.manifest,participant:f.p});f.p.revoked=true;assert.throws(f.read,/participant-binding-mismatch/);
 f.p.revoked=false;f.p.incarnation='replacement';assert.throws(f.read,/participant-binding-mismatch/);
});
test('registry refuses locator tampering, native drift and foreign credentials',t=>{
 const f=fixture(t);writeFileSync(f.hostFile,JSON.stringify({...f.manifest,participant_credential_file:f.collectorFile}));assert.throws(f.read,/manifest-binding-mismatch/);
 writeFileSync(f.hostFile,JSON.stringify(f.manifest));f.p.native_binding.descriptor_digest='a'.repeat(64);assert.throws(f.read,/participant-binding-mismatch/);
 f.p.native_binding.descriptor_digest=f.manifest.descriptor_digest;writeFileSync(f.credentialFile,JSON.stringify({protocol:1,role:'participant',participant:'foreign',incarnation:'worker-inc',token:'p'.repeat(64)}));assert.throws(f.read,/participant-credential-mismatch/);
});
test('registry requires private regular files and denies symlink credential paths',t=>{
 const f=fixture(t);if(process.platform!=='win32'){chmodSync(f.credentialFile,0o644);assert.throws(f.read,/private-file-required/);chmodSync(f.credentialFile,0o600);}
 const original=readFileSync(f.credentialFile);rmSync(f.credentialFile);const target=join(f.root,'original.json');writeFileSync(target,original,{mode:0o600});symlinkSync(target,f.credentialFile);assert.throws(f.read,/symlink/);
});
test('registry rejects collector revocation and mismatched project authority root',t=>{
 const f=fixture(t);f.state.collectors.collector.revoked=true;assert.throws(f.read,/collector-credential-mismatch/);f.state.collectors.collector.revoked=false;
 const other=realpathSync(tmpdir());assert.throws(()=>readParticipantHost({state:f.state,teamId:'team',participantId:'worker',authorityRoot:other,projectRoot:f.root,vaultPath:f.root}),/project-binding-mismatch/);
});
test('real reducer registers immutable locator only for owner and current native binding',t=>{
 const f=fixture(t),binding=f.p.host_binding;delete f.p.host_binding;
 const event={type:'participant-host-register-v1',team:'team',actor:'owner:'+f.state.owner_hash,epoch:0,at:new Date().toISOString(),participant_id:'worker',binding};
 assert.throws(()=>reduceTeamEvent(f.state,{...event,actor:'worker',incarnation:'worker-inc'}),/owner-required/);
 const accepted=reduceTeamEvent(f.state,event);assert.deepEqual(accepted.state.teams.team.participants.worker.host_binding,binding);
 assert.deepEqual(reduceTeamEvent(accepted.state,event).state,accepted.state);
 assert.throws(()=>reduceTeamEvent(accepted.state,{...event,binding:{...binding,host_digest:'a'.repeat(64)}}),/change-requires-new-participant/);
 assert.throws(()=>reduceTeamEvent(f.state,{...event,binding:{...binding,native_binding_digest:'a'.repeat(64)}}),/participant-binding-mismatch/);
});
