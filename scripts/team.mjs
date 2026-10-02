// Waypost team identity and evidenced model policy. Pure computation:
// authority credentials, inboxes, revisions and grants belong to the store.
import { randomUUID } from "node:crypto";

export const MODEL_EVIDENCE_KINDS = Object.freeze([
  "adapter-observed", "owner-attested", "self-declared", "unknown",
]);
export const DEFAULT_EVIDENCE_FLOOR = Object.freeze(["adapter-observed", "owner-attested"]);
export const TEAM_ROLES = Object.freeze(["coordinate", "implement", "review"]);
export const AVAILABILITY = Object.freeze(["ready", "busy", "unavailable", "left"]);

function object(value, name, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${name} must be an object`);
  }
  if (allowed) for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${name}: unknown field ${key}`);
  }
  return value;
}

function string(value, name, max = 256) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()
      || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${name} must be a nonempty bounded string without control characters`);
  }
  return value;
}

function positive(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`);
  return value;
}

function date(value, name) {
  string(value, name, 64);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)
      || !Number.isFinite(Date.parse(value))) throw new Error(`${name} must be an ISO date or timestamp`);
  const day = value.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    throw new Error(`${name} must be a valid calendar date`);
  }
  return value;
}

function modelKey(model) {
  return JSON.stringify([model.provider, model.model_id, model.reasoning]);
}

export function validateDescriptor(model) {
  object(model, "model", ["provider", "model_id", "reasoning", "model_revision", "resolved", "evidence"]);
  object(model.evidence, "model.evidence", ["kind", "source", "observed_at", "action"]);
  if (!MODEL_EVIDENCE_KINDS.includes(model.evidence.kind)) throw new Error("model.evidence.kind is unsupported");
  if (typeof model.resolved !== "boolean") throw new Error("model.resolved must be boolean");
  return {
    provider: string(model.provider, "model.provider"),
    model_id: string(model.model_id, "model.model_id"),
    reasoning: string(model.reasoning, "model.reasoning"),
    model_revision: positive(model.model_revision, "model.model_revision"),
    resolved: model.resolved,
    evidence: {
      kind: model.evidence.kind,
      source: string(model.evidence.source, "model.evidence.source", 1024),
      observed_at: date(model.evidence.observed_at, "model.evidence.observed_at"),
      ...(model.evidence.action === undefined ? {} : { action: string(model.evidence.action, "model.evidence.action") }),
    },
  };
}

export function validatePolicy(policy) {
  object(policy, "policy", ["protocol", "revision", "domain", "mode", "approved_by", "approved_at", "generated_at", "expires_at", "sources", "profiles", "evidence_floor"]);
  if (policy.protocol !== 1) throw new Error("policy.protocol must be 1");
  const mode = policy.mode ?? "manual";
  if (!["manual", "automatic"].includes(mode)) throw new Error("policy.mode is unsupported");
  let provenance;
  if (mode === "automatic") {
    if (policy.approved_by !== undefined || policy.approved_at !== undefined) throw new Error("automatic policy must not claim owner approval");
    const generatedAt = date(policy.generated_at, "policy.generated_at");
    const expiresAt = date(policy.expires_at, "policy.expires_at");
    if (Date.parse(expiresAt) <= Date.parse(generatedAt)) throw new Error("policy.expires_at must follow generated_at");
    if (!Array.isArray(policy.sources) || !policy.sources.length || policy.sources.length > 1024) {
      throw new Error("automatic policy.sources must contain 1 to 1024 sources");
    }
    const seenSources = new Set();
    const sources = policy.sources.map((source) => {
      object(source, "policy.source", ["id", "url", "retrieved_at"]);
      const id = string(source.id, "policy.source.id");
      if (seenSources.has(id)) throw new Error("policy contains duplicate source ids");
      seenSources.add(id);
      const url = string(source.url, "policy.source.url", 2048);
      let parsed;
      try { parsed = new URL(url); } catch { throw new Error("policy.source.url must be HTTPS"); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("policy.source.url must be HTTPS without credentials");
      const retrievedAt = date(source.retrieved_at, "policy.source.retrieved_at");
      if (Date.parse(retrievedAt) > Date.parse(generatedAt)) throw new Error("source retrieval cannot follow policy generation");
      return { id, url, retrieved_at: retrievedAt };
    });
    provenance = { generated_at: generatedAt, expires_at: expiresAt, sources };
  } else {
    if (policy.generated_at !== undefined || policy.expires_at !== undefined || policy.sources !== undefined) throw new Error("manual policy must use owner approval provenance");
    provenance = {
      approved_by: string(policy.approved_by, "policy.approved_by"),
      approved_at: date(policy.approved_at, "policy.approved_at"),
    };
  }
  if (!Array.isArray(policy.profiles) || (mode === "manual" && !policy.profiles.length) || policy.profiles.length > 1024) {
    throw new Error("policy.profiles must contain at most 1024 profiles (manual mode requires at least one)");
  }
  const seen = new Set();
  const profiles = policy.profiles.map((profile) => {
    object(profile, "profile", ["provider", "model_id", "reasoning", "priorities", "source", "date"]);
    object(profile.priorities, "profile.priorities", TEAM_ROLES);
    const out = {
      provider: string(profile.provider, "profile.provider"),
      model_id: string(profile.model_id, "profile.model_id"),
      reasoning: string(profile.reasoning, "profile.reasoning"),
      priorities: {},
      source: string(profile.source, "profile.source", 1024),
      date: date(profile.date, "profile.date"),
    };
    for (const role of TEAM_ROLES) {
      const rank = profile.priorities[role];
      if (!Number.isSafeInteger(rank) || rank < 0) throw new Error(`profile.priorities.${role} must be a nonnegative safe integer`);
      out.priorities[role] = rank;
    }
    const key = modelKey(out);
    if (mode === "automatic" && !provenance.sources.some((source) => source.id === out.source)) {
      throw new Error("profile.source must name a policy source");
    }
    if (seen.has(key)) throw new Error("policy contains duplicate exact model profiles");
    seen.add(key);
    return out;
  });
  const floor = policy.evidence_floor ?? DEFAULT_EVIDENCE_FLOOR;
  if (!Array.isArray(floor) || !floor.length || floor.some((kind) => !DEFAULT_EVIDENCE_FLOOR.includes(kind))
      || new Set(floor).size !== floor.length) {
    throw new Error("policy.evidence_floor must select unique adapter-observed or owner-attested kinds");
  }
  return {
    protocol: 1,
    revision: positive(policy.revision, "policy.revision"),
    domain: string(policy.domain, "policy.domain"),
    mode,
    ...provenance,
    profiles,
    evidence_floor: [...floor],
  };
}

export function createParticipant({ session, harness, root, model, locator = null, availability = "ready" }) {
  if (!AVAILABILITY.includes(availability)) throw new Error("participant.availability is unsupported");
  let nativeLocator = null;
  if (locator !== null) {
    object(locator, "participant.locator");
    const json = JSON.stringify(locator);
    if (json.length > 4096) throw new Error("participant.locator is too large");
    nativeLocator = JSON.parse(json);
  }
  return {
    id: `participant-${randomUUID()}`,
    incarnation: randomUUID(),
    session: string(session, "participant.session"),
    harness: string(harness, "participant.harness"),
    root: string(root, "participant.root", 4096),
    model: validateDescriptor(model),
    locator: nativeLocator,
    availability,
    revoked: false,
    context: null,
  };
}

// Invalid/unclassified identity fails closed. Validation of writes remains a
// separate operation so read-side selection never turns malformed data into rank.
export function rankParticipant(participant, policy, role, { action, now = Date.now() } = {}) {
  if (!TEAM_ROLES.includes(role)) throw new Error(`unsupported team role: ${role}`);
  if (!policy || !participant) return null;
  let descriptor, approved;
  try {
    descriptor = validateDescriptor(participant.model);
    approved = validatePolicy(policy);
  } catch { return null; }
  if (approved.mode === "automatic" && (!Number.isFinite(now)
      || now < Date.parse(approved.generated_at) || now >= Date.parse(approved.expires_at))) return null;
  if (!descriptor.resolved || [descriptor.provider,descriptor.model_id,descriptor.reasoning].includes('unknown') || !approved.evidence_floor.includes(descriptor.evidence.kind)) return null;
  if (action !== undefined && (typeof action !== "string" || !action || descriptor.evidence.action !== action)) return null;
  const profile = approved.profiles.find((candidate) => modelKey(candidate) === modelKey(descriptor));
  return profile ? profile.priorities[role] : null;
}

function available(participant) {
  return participant && typeof participant.id === "string" && participant.id
    && participant.availability === "ready" && participant.revoked === false;
}

function highest(participants, policy, role, predicate = () => true, options = {}) {
  return participants.filter((participant) => available(participant) && predicate(participant))
    .map((participant) => ({ participant, rank: rankParticipant(participant, policy, role, options) }))
    .filter(({ rank }) => rank !== null)
    .sort((a, b) => b.rank - a.rank || (a.participant.id < b.participant.id ? -1 : a.participant.id > b.participant.id ? 1 : 0));
}

export function selectCoordinator(participants, policy, incumbentId = null, { now = Date.now() } = {}) {
  const ranked = highest(participants, policy, "coordinate", () => true, { now });
  if (!ranked.length) return null;
  return (ranked.find(({ participant, rank }) => participant.id === incumbentId && rank === ranked[0].rank)
    ?? ranked[0]).participant;
}

export function updateReviewFloor(previousFloor, participants, policy, { now = Date.now() } = {}) {
  if (previousFloor !== null && (!Number.isSafeInteger(previousFloor) || previousFloor < 0)) {
    throw new Error("review floor must be null or a nonnegative safe integer");
  }
  let floor = previousFloor;
  for (const participant of participants) {
    const rank = rankParticipant(participant, policy, "review", { now });
    if (rank !== null) floor = floor === null ? rank : Math.max(floor, rank);
  }
  return floor;
}

function freshContext(context, excluded) {
  if (!context || !context.id || typeof context.id !== "string" || excluded.includes(context.id)
      || context.fresh !== true || context.read_only !== true) return false;
  try {
    object(context.evidence, "context.evidence", ["kind", "source", "observed_at"]);
    if (!["isolated-invocation", "owner-attested"].includes(context.evidence.kind)) return false;
    string(context.evidence.source, "context.evidence.source", 1024);
    date(context.evidence.observed_at, "context.evidence.observed_at");
    return true;
  } catch { return false; }
}

export function selectReviewer(participants, policy, floor, { excludedContexts = [], now = Date.now() } = {}) {
  if (!Number.isSafeInteger(floor) || floor < 0 || !Array.isArray(excludedContexts)) return null;
  const ranked = highest(participants, policy, "review", (participant) => freshContext(participant.context, excludedContexts), { now });
  return ranked.find(({ rank }) => rank >= floor)?.participant ?? null;
}
// Publication dates belong to freshness provenance, not strength privileges.
export function policyStrengthShape(policy) {
  const profiles = policy.profiles.map(({ provider, model_id, reasoning, priorities, source }) => ({ provider, model_id, reasoning, priorities, source }));
  profiles.sort((a, b) => JSON.stringify([a.provider, a.model_id, a.reasoning]).localeCompare(JSON.stringify([b.provider, b.model_id, b.reasoning])));
  return JSON.stringify([policy.domain, policy.mode, profiles, policy.evidence_floor]);
}
