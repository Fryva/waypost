// Waypost CLI: mcp-config.
import { fail, run, runJson } from "./core.mjs";
import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

// Create-only project installation. Never merge user settings or read credentials.
function installMcpConfig(argv) {
  const writes = argv.filter(value => value === "--write").length;
  if (!writes) { run("team-mcp-config", argv); return; }
  if (writes !== 1) fail("MCP config: duplicate --write");
  if (argv.indexOf("--write") % 2 !== 0) fail("MCP config: --write cannot replace an option value");
  const args = argv.filter(value => value !== "--write");
  const preview = runJson("team-mcp-config", args);
  let temporary, fd, ownTemporary = false, published = false, cleanupFailed = false;
  try {
    const project = preview.execution.args[2];
    const rootInfo = lstatSync(project);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("project-directory-required");
    const root = realpathSync(project);
    const offset = relative(project, preview.target.file);
    const parts = offset.split(sep);
    if (!offset || parts.some(p => !p || p === "." || p === ".." || /[<>:"|?*]/.test(p) || /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p) || [".git", ".waypost"].includes(p.toLowerCase())) ||
        (preview.harness !== "claude" && parts.some(p => p.toLowerCase() === ".claude"))) throw new Error("unsafe-project-target");
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      const next = join(parent, part);
      try { mkdirSync(next, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
      const info = lstatSync(next);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("unsafe-project-parent");
      parent = realpathSync(next);
      const inside = relative(root, parent);
      if (inside === ".." || inside.startsWith(".." + sep) || resolve(root, inside) !== parent) throw new Error("unsafe-project-parent");
    }
    const target = join(parent, parts.at(-1));
    // lstat also detects dangling links; linkSync is the final no-overwrite gate.
    try { lstatSync(target); throw new Error("config-already-exists-use-preview-to-merge"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    temporary = join(parent, ".waypost-mcp-config-" + randomUUID() + ".tmp");
    fd = openSync(temporary, "wx", 0o600); ownTemporary = true;
    writeFileSync(fd, preview.snippet, "utf8");
    fsyncSync(fd); closeSync(fd); fd = undefined;
    linkSync(temporary, target); published = true;
  } catch (error) {
    // No paths, credential contents or arbitrary filesystem diagnostics.
    const code = error.code === "EEXIST" ? "config-already-exists-use-preview-to-merge" :
      ["project-directory-required", "unsafe-project-target", "unsafe-project-parent", "config-already-exists-use-preview-to-merge"].includes(error.message) ? error.message : "config-installation-failed";
    process.stderr.write("waypost MCP config: " + code + "\n"); process.exitCode = 1;
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch {} }
    if (ownTemporary) { try { unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") cleanupFailed = true; } }
  }
  if (published) {
    const result = { ...preview, preview_only: false, written: true, cleanup_pending: cleanupFailed,
      limitations: preview.limitations.filter(value => !value.includes("Nothing was written.")) };
    result.limitations.push("Only a new project config was created; credentials and existing settings were not read. No approvals or native capabilities changed.",
      "Hard-link publication requires filesystem support. POSIX modes do not verify Windows ACLs. Parent checks are best-effort on a trusted filesystem, not protection against hostile concurrent ancestor replacement.");
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (cleanupFailed) process.stderr.write("waypost MCP config: installed; private temporary cleanup pending\n");
  } else if (cleanupFailed) process.stderr.write("waypost MCP config: installation failed; private temporary cleanup pending\n");
}

export { installMcpConfig };
