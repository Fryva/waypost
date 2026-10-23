// Story and epic lifecycle diagnostics.
import { isLegacyStory, sectionOf, evidenceSuffixRe, stripCodeSpans } from "./lib.mjs";

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

// Fence/inline-code stripping lives in lib.mjs (stripCodeSpans) — one
// definition shared with the link-graph extractor, so "not a link/checkbox
// when inside code" means the same thing everywhere.

// RAW lines outside fenced blocks — for checks that must both MATCH (fence-
// immune) and REPORT the line verbatim (backticks intact in the message).
function linesOutsideFences(s) {
  const out = [];
  let fenced = false;
  for (const line of s.split("\n")) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (!fenced) out.push(line);
  }
  return out;
}

export function checkStoriesAndEpics(artifacts) {
  const out = [];
  for (const a of artifacts) {
    if (a.kind === "story" && (a.fm.status || "").toLowerCase() === "done") {
      const sec = sectionOf(a.body, "acceptance") || "";
      const unchecked = (stripCodeSpans(sec).match(/- \[ \]/g) || []).length;
      if (unchecked > 0) {
        out.push(finding("vault", "warn", "acceptance",
          `Story is "done" with ${unchecked} unchecked acceptance criteria.`, a.rel));
      }
    }
    if ((a.fm.review_status || "") === "reviewed" && (!a.fm.reviewed_at || a.fm.reviewed_at === "null")) {
      out.push(finding("vault", "issue", "review-status",
        `review_status is "reviewed" but reviewed_at is empty.`, a.rel));
    }
  }
  for (const epic of artifacts.filter((a) => a.kind === "epic")) {
    if ((epic.fm.status || "").toLowerCase() !== "done") continue;
    const dir = epic.rel.replace(/\/epic\.md$/, "");
    const open = artifacts.filter((s) =>
      s.kind === "story" && s.rel.startsWith(dir + "/") && (s.fm.status || "").toLowerCase() !== "done");
    if (open.length) {
      out.push(finding("vault", "issue", "epic-status",
        `Epic is "done" while ${open.length} child stor${open.length === 1 ? "y is" : "ies are"} not.`, epic.rel));
    }
  }
  return out;
}

// ─── Lifecycle gates (PS-SPEC story-008) — behind lifecycle_gates=on ───

export function checkLifecycleGates(artifacts, vaultCfg) {
  const gates = String(vaultCfg.lifecycle_gates || "off").toLowerCase();
  if (!["on", "true"].includes(gates)) return [];
  const out = [];
  const since = vaultCfg.spec_policy_since || null;
  const evidenceRe = evidenceSuffixRe();

  for (const story of artifacts.filter((a) => a.kind === "story")) {
    if (String(story.fm.status || "").toLowerCase() !== "done") continue;
    if (isLegacyStory(story.fm, since)) continue;

    const acc = sectionOf(story.body, "acceptance");
    if (acc !== null) {
      // Raw lines (fence-immune matching, verbatim reporting — backticks kept).
      for (const line of linesOutsideFences(acc)) {
        const m = line.match(/^\s*-\s*\[(x|X)\]\s*(.*)$/);
        if (m && !evidenceRe.test(m[2])) {
          out.push(finding("vault", "warn", "evidence",
            `Checked acceptance criterion carries no evidence suffix ("— evidence: <test | command | file:line>"): "${m[2].slice(0, 70)}".`, story.rel));
        }
      }
    }

    const plan = sectionOf(story.body, "implementation_plan");
    if (plan !== null && (!story.fm.plan_updated_at || story.fm.plan_updated_at === "null")) {
      out.push(finding("vault", "warn", "plan-gate",
        "Story has an Implementation Plan section but no plan_updated_at — the plan bypassed the waypost story plan gate.", story.rel));
    }
    const summary = sectionOf(story.body, "final_summary");
    if (summary === null) {
      out.push(finding("vault", "warn", "final-summary",
        "Done story has no Final Summary section (lifecycle_gates: on requires a close-out record).", story.rel));
    }
    if (plan === null) {
      out.push(finding("vault", "warn", "plan-gate",
        "Done story has no Implementation Plan section (lifecycle_gates: on requires the plan to live in the story).", story.rel));
    }
  }
  return out;
}

