// Explicit owner-authorized host locators. No credential discovery or writes.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, parse, join, posix, win32 } from 'node:path';
import { createHash } from 'node:crypto';
import { routingDigest } from './model-routing.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
function fail(code){throw Object.assign(new Error(code),{code});}
function digest(value){if(!/^[a-f0-9]{64}$/.test(value||''))fail('host-registry-digest-required');}
function absolute(value){if(typeof value!=='string'||value.length>4096||/[\x00-\x1f]/.test(value))fail('host-registry-absolute-path-required');const p=/^[A-Za-z]:[\\/]/.test(value)?win32:posix;if(!p.isAbsolute(value)||p.normalize(value)!==value)fail('host-registry-canonical-path-required');return value;}
function fields(raw,allowed){if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!allowed.includes(k)))fail('host-registry-shape-required');}
export function validateParticipantHostManifest(raw){
 fields(raw,['protocol','team','participant','incarnation','authority_root','project_root','vault_path','participant_credential_file','endpoint_file','collector_file','descriptor_digest']);
 if(raw.protocol!==1||![raw.team,raw.participant,raw.incarnation].every(v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v)))fail('host-registry-identity-required');
 for(const key of ['authority_root','project_root','vault_path','participant_credential_file','endpoint_file','collector_file'])absolute(raw[key]);
 digest(raw.descriptor_digest);return structuredClone(raw);
}
export function validateParticipantHostBinding(binding,{participant}={}){
 fields(binding,['protocol','incarnation','host_file','host_digest','native_binding_digest']);
 if(binding.protocol!==1||typeof binding.incarnation!=='string')fail('host-registry-binding-required');absolute(binding.host_file);digest(binding.host_digest);digest(binding.native_binding_digest);
 if(participant&&(!participant.native_binding||participant.revoked||participant.availability==='left'||binding.incarnation!==participant.incarnation||binding.native_binding_digest!==routingDigest(participant.native_binding)))fail('host-registry-participant-binding-mismatch');
 return structuredClone(binding);
}
export function createParticipantHostBinding({hostFile,manifest,participant}){
 const m=validateParticipantHostManifest(manifest);
 if(!participant||m.participant!==participant.id||m.incarnation!==participant.incarnation||m.endpoint_file!==participant.native_binding?.endpoint_file||m.collector_file!==participant.native_binding?.collector_file||m.descriptor_digest!==participant.native_binding?.descriptor_digest)fail('host-registry-native-binding-mismatch');
 return validateParticipantHostBinding({protocol:1,incarnation:m.incarnation,host_file:absolute(hostFile),host_digest:routingDigest(m),native_binding_digest:routingDigest(participant.native_binding)},{participant});
}
function canonical(path){absolute(path);let at=parse(path).root;for(const part of path.slice(at.length).split(/[\\/]/).filter(Boolean)){at=join(at,part);if(lstatSync(at).isSymbolicLink())fail('host-registry-symlink');}if(realpathSync(path)!==resolve(path))fail('host-registry-canonical-path-required');return path;}
function privateJSON(path,max=16384){canonical(path);const st=lstatSync(path);if(!st.isFile()||st.size>max)fail('host-registry-bounded-file-required');if(process.platform!=='win32'&&(st.mode&0o077))fail('host-registry-private-file-required');let value;try{value=JSON.parse(readFileSync(path,'utf8'));}catch{fail('host-registry-invalid-json');}return value;}
function credential(path,role){const c=privateJSON(path);if(c.protocol!==1||c.role!==role||typeof c.token!=='string'||c.token.length<32||c.token.length>1024)fail('host-registry-credential-required');return {...c,token_hash:sha(c.token)};}
export function readParticipantHost({state,teamId,participantId,authorityRoot,projectRoot,vaultPath}){
 const t=state?.teams?.[teamId],p=t?.participants?.[participantId];if(!p?.host_binding)fail('host-participant-locator-unregistered');
 const b=validateParticipantHostBinding(p.host_binding,{participant:p}),m=validateParticipantHostManifest(privateJSON(b.host_file));
 if(routingDigest(m)!==b.host_digest||m.team!==teamId||m.participant!==participantId||m.incarnation!==p.incarnation)fail('host-registry-manifest-binding-mismatch');
 for(const [key,value]of [['authority_root',authorityRoot],['project_root',projectRoot],['vault_path',vaultPath]])if(!value||canonical(m[key])!==canonical(value))fail('host-registry-project-binding-mismatch');
 if(m.endpoint_file!==p.native_binding.endpoint_file||m.collector_file!==p.native_binding.collector_file||m.descriptor_digest!==p.native_binding.descriptor_digest)fail('host-registry-native-binding-mismatch');
 const endpoint=privateJSON(m.endpoint_file),participant=credential(m.participant_credential_file,'participant'),collector=credential(m.collector_file,'collector'),registered=state.collectors?.[collector.collector];
 if(endpoint.team!==teamId||endpoint.participant!==participantId||routingDigest(endpoint.descriptor)!==m.descriptor_digest||endpoint.descriptor?.native_id||endpoint.descriptor?.managed!==true)fail('host-registry-endpoint-binding-mismatch');
 if(participant.participant!==participantId||participant.incarnation!==p.incarnation||participant.token_hash!==p.credential_hash)fail('host-registry-participant-credential-mismatch');
 if(!registered||registered.revoked||registered.team!==teamId||registered.credential_hash!==collector.token_hash||collector.collector!==p.native_binding.collector_id)fail('host-registry-collector-credential-mismatch');
 return {manifest:m,binding:b,credential:participant,collector,descriptor:endpoint.descriptor};
}
