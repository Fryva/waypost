import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateDescriptor, validatePolicy, createParticipant, rankParticipant,
  selectCoordinator, updateReviewFloor, selectReviewer,
} from "../scripts/team.mjs";

// Synthetic identities only: these fixtures assert policy behavior, not a
// real-world order of model vendors, products, prices or benchmark quality.
const at = "2026-09-30T12:00:00Z";
function descriptor(model_id = "fixture-basic", overrides = {}) {
  return { provider: "fixture-provider", model_id, reasoning: "fixture-reasoning", model_revision: 1,
    resolved: true, evidence: { kind: "adapter-observed", source: "fixture-inspection", observed_at: at }, ...overrides };
}
function profile(model_id, coordinate, review = coordinate, implement = coordinate) {
  return { provider: "fixture-provider", model_id, reasoning: "fixture-reasoning",
    priorities: { coordinate, implement, review }, source: "fixture-policy-decision", date: "2026-09-30" };
}
function policy(overrides = {}) {
  return { protocol: 1, revision: 1, domain: "fixture-coding", mode: "manual", approved_by: "fixture-owner", approved_at: at,
    profiles: [profile("fixture-basic", 1, 2, 9), profile("fixture-strong", 3, 4, 5)], ...overrides };
}
function participant(id, model_id = "fixture-basic", overrides = {}) {
  return { ...createParticipant({ session: "inherited-session", harness: "fixture-harness", root: "/fixture/root", model: descriptor(model_id) }), id, ...overrides };
}
function automatic(overrides = {}) {
  return { protocol: 1, revision: 2, domain: "fixture-coding", mode: "automatic", generated_at: at,
    expires_at: "2026-10-01T12:00:00Z", sources: [{ id: "fixture-source", url: "https://example.test/fixture-benchmark", retrieved_at: at }],
    profiles: policy().profiles.map((p) => ({ ...p, source: "fixture-source" })), ...overrides };
}
function context(id, overrides = {}) {
  return { id, fresh: true, read_only: true,
    evidence: { kind: "isolated-invocation", source: "fixture-context-manifest", observed_at: at }, ...overrides };
}

test("parent, child and restart have unique identities despite inherited legacy session", () => {
  const args = { session: "inherited", harness: "fixture", root: "/fixture", model: descriptor(), locator: { native_id: "conversation" } };
  const identities = Array.from({ length: 3 }, () => createParticipant(args));
  assert.equal(new Set(identities.map((p) => p.id)).size, 3);
  assert.equal(new Set(identities.map((p) => p.incarnation)).size, 3);
  assert.ok(identities.every((p) => p.session === "inherited"));
  identities[0].model.evidence.source = "changed";
  identities[0].locator.native_id = "changed";
  assert.equal(args.model.evidence.source, "fixture-inspection");
  assert.equal(args.locator.native_id, "conversation");
});

test("validators clone data, normalize floor and reject ambiguous or malformed inputs", () => {
  const original = policy();
  const valid = validatePolicy(original);
  assert.deepEqual(valid.evidence_floor, ["adapter-observed", "owner-attested"]);
  valid.profiles[0].priorities.review = 99;
  assert.equal(original.profiles[0].priorities.review, 2);
  for (const bad of [null, [], policy({ revision: 0 }), policy({ protocol: 2 }), policy({ approved_by: "" }),
    policy({ profiles: [profile("duplicate", 1), profile("duplicate", 2)] }), policy({ evidence_floor: ["self-declared"] }),
    policy({ profiles: [{ ...profile("bad", 1), priorities: { coordinate: 1, implement: 2, review: Infinity } }] }),
    policy({ approved_at: "2026-02-30" }), policy({ secret: "forbidden" })]) assert.throws(() => validatePolicy(bad));
  for (const bad of [descriptor("x", { resolved: "true" }), descriptor("x", { model_revision: 0 }),
    descriptor("x", { reasoning: " " }), descriptor("x", { evidence: { kind: "role-pin", source: "x", observed_at: at } }),
    descriptor("x", { credentials: "forbidden" })]) assert.throws(() => validateDescriptor(bad));
});

test("automatic strength requires provenance and fails closed outside its freshness window", () => {
  const p = participant("p");
  const ranked = automatic();
  assert.equal(validatePolicy(ranked).mode, "automatic");
  assert.equal(rankParticipant(p, ranked, "coordinate", { now: Date.parse(at) }), 1);
  assert.equal(rankParticipant(p, ranked, "coordinate", { now: Date.parse(at) - 1 }), null);
  assert.equal(rankParticipant(p, ranked, "coordinate", { now: Date.parse(ranked.expires_at) }), null);
  for (const bad of [automatic({ sources: [] }), automatic({ approved_by: "not-owner-approved" }),
    automatic({ expires_at: at }), automatic({ sources: [{ id: "fixture-source", url: "https://user:secret@example.test", retrieved_at: at }] }),
    automatic({ sources: [{ id: "missing-source", url: "https://example.test", retrieved_at: at }] }),
    automatic({ sources: [{ id: "fixture-source", url: "https://example.test", retrieved_at: "2026-10-01" }] })]) {
    assert.throws(() => validatePolicy(bad));
    assert.equal(rankParticipant(p, bad, "coordinate"), null);
  }
});

test("automatic replay selects against persisted command time; empty classification forms without a leader", () => {
  const atTime = { now: Date.parse(at) };
  const expiredTime = { now: Date.parse("2026-10-01T12:00:00Z") };
  const p = participant("p", "fixture-strong", { context: context("independent") });
  assert.equal(selectCoordinator([p], automatic(), null, atTime).id, "p");
  assert.equal(selectCoordinator([p], automatic(), null, expiredTime), null);
  assert.equal(updateReviewFloor(null, [p], automatic(), atTime), 4);
  assert.equal(updateReviewFloor(4, [p], automatic(), expiredTime), 4);
  assert.equal(selectReviewer([p], automatic(), 4, atTime).id, "p");
  assert.equal(selectReviewer([p], automatic(), 4, expiredTime), null);
  const empty = validatePolicy(automatic({ profiles: [] }));
  assert.equal(selectCoordinator([p], empty, null, atTime), null);
  assert.equal(updateReviewFloor(null, [p], empty, atTime), null);
});

test("strength uses exact qualified identity and role, never harness, alias, price or vendor", () => {
  const base = participant("p");
  assert.equal(rankParticipant(base, policy(), "implement"), 9);
  assert.equal(rankParticipant(base, policy(), "review"), 2);
  for (const model of [descriptor("latest", { resolved: false }), descriptor("unknown"),
    descriptor("fixture-basic", { provider: "other-vendor" }), descriptor("fixture-basic", { reasoning: "other-reasoning" }),
    descriptor("fixture-basic", { evidence: { kind: "self-declared", source: "fixture", observed_at: at } }),
    descriptor("fixture-basic", { evidence: { kind: "unknown", source: "fixture", observed_at: at } })]) {
    assert.equal(rankParticipant({ ...base, model }, policy(), "coordinate"), null);
  }
  assert.equal(rankParticipant({ ...base, harness: "expensive-vendor", price: 999 }, policy(), "coordinate"), 1);
  assert.equal(rankParticipant(base, null, "coordinate"), null);
});

test("protected actions require exact fresh attestation token, not inherited declaration", () => {
  for (const kind of ["owner-attested", "adapter-observed"]) {
    const p = participant("p", "fixture-basic", { model: descriptor("fixture-basic", { evidence: { kind, source: "fixture", observed_at: at, action: "action:one" } }) });
    assert.equal(rankParticipant(p, policy(), "coordinate", { action: "action:one" }), 1);
    assert.equal(rankParticipant(p, policy(), "coordinate", { action: "action:two" }), null);
    delete p.model.evidence.action;
    assert.equal(rankParticipant(p, policy(), "coordinate", { action: "action:one" }), null);
    p.model.evidence.kind = "self-declared";
    p.model.evidence.action = "action:one";
    assert.equal(rankParticipant(p, policy(), "coordinate", { action: "action:one" }), null);
  }
});

test("coordinator ties retain eligible incumbent; stronger arrival and unavailable identities rerank", () => {
  const a = participant("a"), b = participant("b"), strongest = participant("z", "fixture-strong");
  assert.equal(selectCoordinator([b, a], policy()).id, "a");
  assert.equal(selectCoordinator([a, b], policy(), "b").id, "b");
  assert.equal(selectCoordinator([a, b, strongest], policy(), "b").id, "z");
  for (const unavailable of [{ availability: "busy" }, { availability: "left" }, { availability: "unavailable" }, { revoked: true }]) {
    assert.equal(selectCoordinator([a, { ...strongest, ...unavailable }], policy(), "z").id, "a");
  }
  assert.equal(selectCoordinator([strongest], policy({ profiles: [profile("fixture-basic", 1)] }), "z"), null);
  const changed = { ...strongest, model: { ...strongest.model, model_revision: 2, reasoning: "different" } };
  assert.equal(selectCoordinator([a, changed], policy(), "z").id, "a");
});

test("review floor preserves strongest admission across busy/departure/revocation/model/policy changes", () => {
  const weak = participant("weak"), strong = participant("strong", "fixture-strong", { availability: "left", revoked: true });
  const floor = updateReviewFloor(null, [weak, strong], policy());
  assert.equal(floor, 4);
  assert.equal(updateReviewFloor(floor, [weak], policy()), 4);
  assert.equal(updateReviewFloor(floor, [], null), 4);
  assert.equal(updateReviewFloor(floor, [strong], policy({ profiles: [profile("fixture-strong", 1, 1)] })), 4);
  assert.equal(updateReviewFloor(floor, [strong], policy({ revision: 2, profiles: [profile("fixture-strong", 1, 10)] })), 10);
  assert.equal(updateReviewFloor(null, [participant("unknown", "unknown")], policy()), null);
  assert.throws(() => updateReviewFloor(-1, [], policy()));
});

test("strongest review requires fresh read-only provenance and excludes every author context", () => {
  const weak = participant("weak", "fixture-basic", { context: context("independent-weak") });
  const strong = participant("strong", "fixture-strong", { context: context("author") });
  assert.equal(selectReviewer([weak, strong], policy(), 4, { excludedContexts: ["author"] }), null);
  assert.equal(selectReviewer([weak, strong], policy(), 4).id, "strong");
  assert.equal(selectReviewer([weak], policy(), 4), null);
  for (const invalid of [null, { id: "fresh-name", fresh: true }, context("x", { fresh: false }),
    context("x", { read_only: false }), context("x", { evidence: null }),
    context("x", { evidence: { kind: "self-declared", source: "fixture", observed_at: at } })]) {
    assert.equal(selectReviewer([{ ...strong, context: invalid }], policy(), 4), null);
  }
  assert.equal(selectReviewer([{ ...strong, availability: "busy" }, weak], policy(), 4), null);
  assert.equal(selectReviewer([strong], policy(), null), null);
});

test("descriptor and policy schema documents are valid JSON and contain no strength leaderboard", () => {
  for (const file of ["descriptor", "policy"]) {
    const schema = JSON.parse(readFileSync(new URL(`../models/${file}.schema.json`, import.meta.url), "utf8"));
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    assert.ok(schema.required.length);
    assert.equal(schema.examples, undefined);
  }
});
