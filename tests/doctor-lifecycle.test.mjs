import "./env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as focused from "../scripts/doctor-lifecycle.mjs";
import { checkStoriesAndEpics, checkLifecycleGates } from "../scripts/doctor.mjs";

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const artifact = (kind, rel, fm, body = "") => freeze({ kind, rel, fm, body });
const policy = freeze({ lifecycle_gates: "on", spec_policy_since: "2026-01-01" });

test("doctor lifecycle module: two public imports retain identical bindings", () => {
  assert.equal(checkStoriesAndEpics, focused.checkStoriesAndEpics);
  assert.equal(checkLifecycleGates, focused.checkLifecycleGates);
});

test("doctor lifecycle module: basic findings preserve all story shapes, review case and code stripping", () => {
  const input = freeze([
    artifact("epic", "work/epics/E/epic.md", { status: "DONE" }),
    artifact("story", "work/epics/E/stories/story-flat.md", { status: "Done", review_status: "reviewed", reviewed_at: "null" },
      "## Acceptance Criteria\n\n- [ ] Real pending\n`- [ ] inline example`\n```\n- [ ] fenced example\n```\n"),
    artifact("story", "work/epics/E/stories/story-folder/README.md", { status: "done", review_status: "Reviewed" }),
    artifact("story", "work/epics/E/story-standalone.md", { status: "in-progress" }),
    artifact("adr", "adr/rules.md", { review_status: "reviewed" }),
    artifact("story", "work/epics/E2/stories/story-other.md", { status: "planned" }),
  ]);
  const before = JSON.stringify(input);
  assert.deepEqual(focused.checkStoriesAndEpics(input), [
    { group: "vault", level: "warn", check: "acceptance", message: 'Story is "done" with 1 unchecked acceptance criteria.', file: input[1].rel },
    { group: "vault", level: "issue", check: "review-status", message: 'review_status is "reviewed" but reviewed_at is empty.', file: input[1].rel },
    { group: "vault", level: "issue", check: "review-status", message: 'review_status is "reviewed" but reviewed_at is empty.', file: "adr/rules.md" },
    { group: "vault", level: "issue", check: "epic-status", message: 'Epic is "done" while 1 child story is not.', file: input[0].rel },
  ]);
  assert.equal(JSON.stringify(input), before);
});

test("doctor lifecycle module: done epic keeps plural wording for multiple open children", () => {
  const input = freeze([
    artifact("epic", "epics/E/epic.md", { status: "done" }),
    artifact("story", "epics/E/stories/story-a.md", { status: "planned" }),
    artifact("story", "epics/E/stories/story-b/README.md", {}),
  ]);
  assert.deepEqual(focused.checkStoriesAndEpics(input), [{ group: "vault", level: "issue", check: "epic-status",
    message: 'Epic is "done" while 2 child stories are not.', file: "epics/E/epic.md" }]);
});

test("doctor lifecycle module: gated full findings preserve raw backticks, fence exclusion and order", () => {
  const story = artifact("story", "epics/E/stories/story-a.md", { status: "done", closed_at: "2027-01-01", plan_updated_at: "null" },
    "## Acceptance Criteria\n\n- [x] `bare`\n- [x] Good — evidence: tests.mjs\n- [ ] Pending\n```\n- [x] Fenced example\n```\n\n## Implementation Plan\n\nRoute\n");
  const input = freeze([story]);
  const before = JSON.stringify(input);
  const expected = [
    { group: "vault", level: "warn", check: "evidence",
      message: 'Checked acceptance criterion carries no evidence suffix ("— evidence: <test | command | file:line>"): "`bare`".', file: story.rel },
    { group: "vault", level: "warn", check: "plan-gate",
      message: "Story has an Implementation Plan section but no plan_updated_at — the plan bypassed the waypost story plan gate.", file: story.rel },
    { group: "vault", level: "warn", check: "final-summary",
      message: "Done story has no Final Summary section (lifecycle_gates: on requires a close-out record).", file: story.rel },
  ];
  for (const value of ["on", "TRUE", true]) assert.deepEqual(focused.checkLifecycleGates(input, freeze({ ...policy, lifecycle_gates: value })), expected);
  for (const value of [undefined, "off", false, "yes"]) assert.deepEqual(focused.checkLifecycleGates(input, freeze({ ...policy, lifecycle_gates: value })), []);
  assert.equal(JSON.stringify(input), before);
});

test("doctor lifecycle module: legacy and policy exemption never silence basic acceptance or review findings", () => {
  const story = artifact("story", "epics/E/stories/story-old.md", { status: "done", review_status: "reviewed" }, "## Acceptance Criteria\n\n- [ ] Old pending\n");
  const input = freeze([story]);
  assert.deepEqual(focused.checkLifecycleGates(input, policy), []);
  assert.deepEqual(focused.checkLifecycleGates(input, {}), []);
  assert.deepEqual(focused.checkStoriesAndEpics(input), [
    { group: "vault", level: "warn", check: "acceptance", message: 'Story is "done" with 1 unchecked acceptance criteria.', file: story.rel },
    { group: "vault", level: "issue", check: "review-status", message: 'review_status is "reviewed" but reviewed_at is empty.', file: story.rel },
  ]);
  const modern = artifact("story", "epics/E/stories/story-modern.md", { status: "done", closed_at: "2027-01-01" });
  assert.deepEqual(focused.checkLifecycleGates([modern], policy), [
    { group: "vault", level: "warn", check: "final-summary", message: "Done story has no Final Summary section (lifecycle_gates: on requires a close-out record).", file: modern.rel },
    { group: "vault", level: "warn", check: "plan-gate", message: "Done story has no Implementation Plan section (lifecycle_gates: on requires the plan to live in the story).", file: modern.rel },
  ]);
  assert.deepEqual(focused.checkLifecycleGates([modern], { ...policy, spec_policy_since: "2040-01-01" }), []);
  assert.deepEqual(focused.checkLifecycleGates([artifact("story", "epics/E/stories/story-open.md", { status: "in-progress" })], policy), []);
});

test("doctor lifecycle module: EN RU and CJK sections and evidence remain valid", () => {
  for (const [plan, acceptance, summary, evidence] of [
    ["Implementation Plan", "Acceptance Criteria", "Final Summary", "evidence:"],
    ["План реализации", "Критерии приёмки", "Итоговое резюме", "подтверждение:"],
    ["实施计划", "验收标准", "最终总结", "证据："],
  ]) {
    const story = artifact("story", "epics/E/stories/story-a.md", { status: "done", closed_at: "2027-01-01", plan_updated_at: "2027-01-01" },
      `## ${plan}\n\nRoute\n\n## ${acceptance}\n\n- [x] Done — ${evidence} tests.mjs\n\n## ${summary}\n\nDone\n`);
    assert.deepEqual(focused.checkLifecycleGates([story], policy), [], acceptance);
  }
});
