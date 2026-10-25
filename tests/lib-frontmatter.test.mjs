import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {ambientEnv} from "./env.mjs";
import * as facade from "../scripts/lib.mjs";
import * as focused from "../scripts/lib-frontmatter.mjs";

test("frontmatter leaf preserves facade namespace, bindings and function contracts", () => {
  assert.deepEqual(Object.keys(facade).sort(), ["ENTRY_IGNORE", "ERROR_CELL", "INFLIGHT_CAP", "LIMIT_WRITER", "PATH_CELL", "PURPOSE_CELL", "REMOVING_DIR", "SOURCE_IGNORE", "TITLE_CELL", "accountStateDir", "askYesNo", "bindingInfo", "buildNodeIndex", "cleanupStaleSessions", "compareArtifactOrder", "configPath", "displayNumberOf", "ensureMachineStateDir", "ensureSessionsDir", "escCell", "evidenceSuffixRe", "expandHome", "extractLinks", "findSlugCollision", "folderByKind", "folderPurpose", "footerDateRe", "gatherVaultFacts", "gitCommonDir", "heading", "headingLineRe", "hostTag", "ignoreEpipe", "indexHeaderRe", "isInsideVault", "isLegacyNumberedId", "isLegacyStory", "isLinkedWorktree", "keywordRe", "lastVaultActivityMs", "legacyDirsToMove", "legacyStateDirs", "legacyStateView", "legalArtifactName", "listEpicDirs", "listEpicStories", "listOf", "listStoryFiles", "listVaultStoryFiles", "loadHeadingsRegistry", "loadLayout", "loadTemplate", "machineStateDir", "mainWorktree", "nextNumber", "nowIso", "openStoryFrom", "parseFrontmatter", "pathUnder", "pluginRoot", "projectRoot", "readCleanupSetting", "readConfig", "readLastAutoCleanup", "readVaultConfig", "realPath", "refsOf", "renderTemplate", "renderVaultSkeleton", "resolveLinkTarget", "resolveVaultPath", "sectionOf", "selfInstallOff", "sessionFilePath", "sessionId", "sessionIdFlag", "sessionsDir", "slugIdentity", "slugify", "stateWriteHint", "statusCellRe", "storedVaultPath", "storiesAttributionRe", "storyMatchesEntry", "storyPathOf", "storyRefOf", "stricterLimit", "stripCodeSpans", "today", "touchSession", "treesOverlap", "truncEnd", "truncFront", "unescCell", "vaultConfigPath", "worktreeTag", "writeConfig", "writeFileAtomic", "writeSession", "writeVaultConfig"]);
  assert.deepEqual(Object.keys(focused).sort(), ["listOf", "parseFrontmatter", "refsOf"]);
  for (const [name, arity] of [["parseFrontmatter", 1], ["listOf", 2], ["refsOf", 2]]) {
    assert.equal(facade[name], focused[name], name);
    assert.equal(focused[name].name, name);
    assert.equal(focused[name].length, arity);
  }
});

test("frontmatter leaf stays readable in one pass", () => {
  const source = readFileSync(new URL("../scripts/lib-frontmatter.mjs", import.meta.url));
  assert.ok(source.length <= 6000, `frontmatter leaf is ${source.length} UTF-8 bytes`);
});

test("frontmatter leaf import and parsing perform no I/O or probes", () => {
  const url = new URL("../scripts/lib-frontmatter.mjs", import.meta.url).href;
  const path = fileURLToPath(url);
  const code = `import fs from "node:fs";import cp from "node:child_process";import {syncBuiltinESMExports} from "node:module";import {fileURLToPath} from "node:url";
    let calls=0;const blocked=()=>{calls++;throw Error("unexpected I/O")};
    const read=fs.readFileSync;fs.readFileSync=(p,...args)=>{const name=p instanceof URL?fileURLToPath(p):String(p);return name===${JSON.stringify(path)}?read(p,...args):blocked()};
    for(const name of ["readFile","writeFileSync","appendFileSync","mkdirSync","unlinkSync","renameSync","rmSync","readdirSync","statSync"])fs[name]=blocked;
    cp.spawnSync=blocked;syncBuiltinESMExports();
    const m=await import(${JSON.stringify(url)});
    if(m.parseFrontmatter("---\\ntitle: Value\\n---\\nBody").data.title!=="Value")throw Error("parser positive control");
    if(m.listOf({x:'["a"]'},"x")[0]!=="a"||m.refsOf({x:"bare"},"x")[0]!=="bare")throw Error("list positive control");
    if(calls!==0)throw Error("unexpected import/parser I/O:"+calls);
    try{fs.readFileSync("not-the-module")}catch{};try{cp.spawnSync("probe")}catch{};
    if(calls!==2)throw Error("inactive I/O guards");console.log("pure");`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {encoding:"utf8",env:ambientEnv()});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "pure\n");
});
