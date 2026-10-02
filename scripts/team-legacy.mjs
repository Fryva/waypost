// Legacy writes cannot bypass a canonical task's active team workflow.
import { realpathSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { projectRoot } from './lib.mjs';
import { coordinationDirs } from './presence.mjs';
import { withAuthorityGate } from './team-store.mjs';
import { reduceTeamEvent } from './team-state.mjs';
export function withTeamArtifactGate(vault,path,operation,write) {
 const root=join(coordinationDirs(vault).primary,'teams','authority');
 const task=relative(resolve(vault),resolve(path)).replace(/\\/g,'/');
 return withAuthorityGate(root,reduceTeamEvent,state=>{
  const id=state?.task_bindings[task];
  if(id)throw new Error('team-bound-artifact-use-team-workflow:'+id+':'+operation);
  return write();
 });
}

// Ordinary commits cannot acquire team rights by omitting story trailers or forcing.
// All enforcement is project-wide under the same authority mutex as admission.
export function withTeamCommitGate(vault, staged, commit, { artifactPath } = {}) {
 const root=join(coordinationDirs(vault).primary,'teams','authority');
 const project=realpathSync(resolve(projectRoot()));
 const normalized=path=>{
  if(typeof path!=='string'||!path||path.includes('\0'))throw new Error('team-commit-invalid-staged-path');
  const absolute=resolve(project,path),rel=relative(project,absolute).replace(/\\/g,'/');
  if(!rel||rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw new Error('team-commit-path-outside-project');
  return {absolute,relative:rel};
 };
 return withAuthorityGate(root,reduceTeamEvent,state=>{
  if(state?.publication_fence)throw new Error('team-publication-fence-blocks-legacy-commit:'+state.publication_fence.team);
  const values=typeof staged==='function'?staged():staged;
  if(!Array.isArray(values))throw new Error('team-commit-staged-paths-required');
  const files=values.map(normalized);
  const taskFiles=new Map(Object.entries(state?.task_bindings||{}).map(([task,id])=>[resolve(vault,task),id]));
  if(artifactPath&&taskFiles.has(resolve(artifactPath)))throw new Error('team-bound-artifact-use-team-workflow:'+taskFiles.get(resolve(artifactPath))+':commit');
  for(const file of files){
   if(taskFiles.has(file.absolute))throw new Error('team-bound-artifact-use-team-workflow:'+taskFiles.get(file.absolute)+':commit');
   for(const team of Object.values(state?.teams||{})){
    if(team.status==='closed')continue;
    for(const work of Object.values(team.work||{})){
     if(['integrated','cancelled'].includes(work.status))continue;
     for(const path of work.paths||[]){
      const scope=normalized(path).relative;
      if(file.relative===scope||file.relative.startsWith(scope+'/')||scope.startsWith(file.relative+'/'))throw new Error('team-work-scope-use-protected-integration:'+team.id+':'+work.id+':'+file.relative);
     }
    }
   }
  }
  return commit();
 });
}
