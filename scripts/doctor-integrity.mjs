// Artifact integrity checks (ADR-0009), using the shared field readers and resolver.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listOf, refsOf, resolveLinkTarget } from "./lib.mjs";

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

function epicIdOf(storyRel, epicFolderPath) {
  if (!storyRel.startsWith(epicFolderPath + "/")) return null;
  return storyRel.slice(epicFolderPath.length + 1).split("/")[0];
}

// code_refs: status-aware (upstream ADR-004) — an unresolved path is an issue for
// in-progress / done artifacts and a warning at any other status (ADR-0009: an ADR
// is never in either state, so its refs used to go unchecked entirely). Globs are
// skipped in v1 (documented). Story refs must fall under the parent epic's refs
// (subset) — that is how drift between the two levels is caught.


// A path annotated as not-yet-there or gone is a promise, not a claim: exempt at
// every status. Suffix only — a real path cannot end in "(deleted)".
const REF_ANNOTATION = /\((?:deleted|waiting|planned)\)$/i;

// supersedes / superseded_by (ADR-0009). graph.mjs renders these edges but never
// verifies them, so a dangling or one-directional declaration produced a
// plausible-looking graph. Severity follows the spec<->story precedent: asymmetry
// is a warning (a union is legal to write in one edit), a target that resolves to
// nothing is an issue.
//
// Resolution goes through resolveLinkTarget and refsOf — the same resolver and the
// same field reader graph.mjs uses. A private lookup here was the first version of
// this check and it was wrong twice over: it missed the bare-scalar form these
// fields are normally written in, and it rejected legal slug and case variants that
// the shared resolver accepts, turning a correct vault red.
export function checkSupersedes(index, files) {
  const out = [];
  const ctx = { index, files, kinds: null };
  const seen = new Set();
  const add = (level, rel, message) => {
    const k = `${rel}\u0000${level}\u0000${message}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(finding("vault", level, "supersedes", message, rel));
  };
  const resolve = (entry, kind) => {
    const scoped = { ...ctx, sourceRel: null, kinds: kind ? [kind] : null };
    const result = resolveLinkTarget(entry, "ref", scoped);
    // Keep the resolver-owned lazy membership local to this check.
    ctx._fileSet ??= scoped._fileSet;
    return result;
  };
  const declaresBack = (target, key, self) =>
    refsOf(target.fm, key).some((e) => {
      const r = resolve(e, self.type);
      return r.outcome === "node" && r.node.path === self.path;
    });

  for (const node of index.nodes) {
    for (const [key, mirror] of [["supersedes", "superseded_by"], ["superseded_by", "supersedes"]]) {
      for (const entry of refsOf(node.fm, key)) {
        const r = resolve(entry, node.type);
        if (r.outcome === "ambiguous") {
          add("issue", node.path, `${key} "${entry}" is ambiguous — it matches ${r.candidates.join(", ")}.`);
          continue;
        }
        if (r.outcome !== "node") {
          // Before calling it missing, look outside this kind: a research note
          // superseded by an ADR is a true statement, and reporting it as
          // "not an artifact" was both false and unfixable without deleting the
          // declaration. The graph does not render that edge, which is worth
          // saying — but it is not an error.
          const anywhere = resolve(entry, null);
          if (anywhere.outcome === "node") {
            add("warn", node.path,
              `${key} "${entry}" resolves to ${anywhere.node.path} (kind: ${anywhere.node.type}) — `
              + `graph.mjs reads these fields for adr only, so the edge is not rendered.`);
            continue;
          }
          if (anywhere.outcome === "ambiguous") {
            // Ambiguous OUTSIDE this kind is not "not an artifact" either — it is
            // "an artifact, just not uniquely which one", the same fact the
            // in-kind branch above already reports correctly.
            add("issue", node.path, `${key} "${entry}" is ambiguous — it matches ${anywhere.candidates.join(", ")}.`);
            continue;
          }
          add("issue", node.path, `${key} names "${entry}", which is not an artifact in this vault.`);
          continue;
        }
        if (r.node.path === node.path) {
          add("issue", node.path, `${key} points at the artifact itself.`);
          continue;
        }
        if (!declaresBack(r.node, mirror, node)) {
          add("warn", node.path,
            `${key} "${entry}" is one-directional — ${r.node.path} does not declare ${mirror} back.`);
        }
      }
    }
    // The replaced side must say so, whichever end declared the relation: a live
    // status on a withdrawn decision is how a reader acts on it anyway.
    const replaced = [];
    for (const entry of refsOf(node.fm, "supersedes")) {
      const r = resolve(entry, node.type);
      if (r.outcome === "node" && r.node.path !== node.path) replaced.push(r.node);
    }
    if (refsOf(node.fm, "superseded_by").length) replaced.push(node);
    for (const target of replaced) {
      if ((target.fm.status || "").toLowerCase() !== "superseded") {
        add("warn", target.path,
          `Declared as replaced, but its status is "${target.fm.status || "—"}", not "superseded".`);
      }
    }
  }
  return out;
}

// The acceptance gate (ADR-0009). Its own key, not lifecycle_gates: that switch is
// story-scoped, every finding under it is a warning, and `waypost bind` recommends
// turning it on — so hanging an issue-level policy there would enrol projects that
// only ever agreed to story gates.
//
// The invariant is narrow on purpose: acceptance must not happen while the review
// question is still open. Any explicit answer satisfies it — `reviewed`, `n/a`,
// `waived`, or a project's own word for "consciously not reviewed". Only silence
// (`pending`, empty) fails, so a project supplies its own vocabulary without this
// check having to know it.
const REVIEW_UNANSWERED = new Set(["", "pending", "todo", "unknown", "null"]);

export function checkAcceptanceGate(artifacts, vaultCfg) {
  const gate = String(vaultCfg.acceptance_gate || "off").toLowerCase();
  if (!["on", "true"].includes(gate)) return [];
  // Only kinds whose template carries the field: a runbook has no review_status,
  // and demanding one would be asking for a field that does not exist.
  const kinds = new Set(["adr", "spec", "research"]);
  const out = [];
  for (const a of artifacts) {
    if (!kinds.has(a.kind)) continue;
    if ((a.fm.status || "").toLowerCase() !== "accepted") continue;
    const review = String(a.fm.review_status || "").trim().toLowerCase();
    if (REVIEW_UNANSWERED.has(review)) {
      out.push(finding("vault", "issue", "acceptance-gate",
        `status is "accepted" while review_status is "${a.fm.review_status || "—"}" `
        + `(acceptance_gate: on — record the review outcome before accepting).`, a.rel));
    }
  }
  return out;
}

export function checkCodeRefs(artifacts, proj, epicFolderPath = "epics") {
  const out = [];
  const epicRefs = new Map();
  for (const e of artifacts.filter((a) => a.kind === "epic")) {
    epicRefs.set(e.rel.replace(/\/epic\.md$/, ""), listOf(e.fm, "code_refs"));
  }
  for (const a of artifacts) {
    const refs = listOf(a.fm, "code_refs");
    if (!refs.length) continue;
    const status = (a.fm.status || "").toLowerCase();
    const level = ["in-progress", "in_progress", "done"].includes(status) ? "issue" : "warn";
    for (const ref of refs) {
      const path = ref.trim();
      if (path.includes("*") || REF_ANNOTATION.test(path)) continue;
      if (!existsSync(join(proj, path))) {
        out.push(finding("vault", level, "code-refs",
          `code_refs path "${ref}" does not resolve inside the project (status: ${status || "—"}).`, a.rel));
      }
    }
    if (a.kind === "story") {
      // epicIdOf, not a `/stories/[^/]+$` regex: that shape only matches the
      // flat form and silently returns the story's own rel unchanged for a
      // folder-shape (`stories/<slug>/README.md`) or standalone
      // (`epics/<id>/story-<slug>.md`) story — losing the epic lookup for
      // two of the three story shapes.
      const epicId = epicIdOf(a.rel, epicFolderPath);
      const dir = epicId ? `${epicFolderPath}/${epicId}` : null;
      const parent = (dir && epicRefs.get(dir)) || [];
      if (!parent.length) {
        out.push(finding("vault", "warn", "code-refs",
          "Story has code_refs but its epic has none — set the epic's footprint first.", a.rel));
      } else {
        const norm = (r) => r.replace(/\/+$/, "");
        for (const ref of refs) {
          if (!parent.some((p) => norm(ref).startsWith(norm(p)))) {
            out.push(finding("vault", "warn", "code-refs",
              `Story code_ref "${ref}" falls outside the parent epic's code_refs.`, a.rel));
          }
        }
      }
    }
  }
  return out;
}

