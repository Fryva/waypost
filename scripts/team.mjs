import { nativeParticipantQuotaEligible } from './team-native-quota.mjs';
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

// Validation is not authentication: only the authority reducer may install this
// format or mint a participant admission from its own authenticated captures.
function exact(value, name, keys) {
  object(value, name, keys);
  if (keys.some(key => !Object.hasOwn(value, key))) throw new Error(`${name}: missing required field`);
  return value;
}
function digest(value, name) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name} must be a SHA-256 digest`);
  return value;
}
function nativeIdentity(value) {
  exact(value, "native identity", ["kind", "profile_id", "profile_digest", "profile_revision"]);
  if (value.kind !== "native-configuration" || value.profile_revision !== 1 || value.profile_id !== "native-profile-" + digest(value.profile_digest, "profile digest")) throw new Error("native profile identity mismatch");
  return value;
}
function clocks(value, name) {
  date(value.observed_at, name + ".observed_at"); date(value.expires_at, name + ".expires_at");
  if (Date.parse(value.expires_at) <= Date.parse(value.observed_at)) throw new Error(`${name}: invalid clocks`);
}
const PROTOCOL_FAMILIES = {
  coordinate: ["dependencies", "leases", "authority", "reviewers"],
  review: ["authority-binding", "scope-identity", "accounting-order", "review-independence"],
};
function validateNativePolicy(policy) {
  exact(policy, "native policy", ["protocol", "mode", "revision", "generated_at", "expires_at", "provenance", "scales", "profiles", "activation", "authority_granted", "activation_scope", "installation", "limitations"]);
  if (policy.mode !== "automatic-calibration" || policy.activation !== true || policy.authority_granted !== false || policy.activation_scope !== "waypost-protocol") throw new Error("active protocol-scoped calibration policy required");
  positive(policy.revision, "policy.revision"); date(policy.generated_at, "policy.generated_at"); date(policy.expires_at, "policy.expires_at");
  if (Date.parse(policy.expires_at) <= Date.parse(policy.generated_at)) throw new Error("policy expiry must follow generation");
  exact(policy.installation, "installation", ["request_key", "cohort", "previous_policy_revision"]);
  string(policy.installation.request_key, "installation.request_key");
  if (!Number.isSafeInteger(policy.installation.previous_policy_revision) || policy.installation.previous_policy_revision < 0 || policy.revision !== policy.installation.previous_policy_revision + 1) throw new Error("installation revision mismatch");
  const provenance = exact(policy.provenance, "provenance", ["kind", "team", "cohort", "authority_revision", "suite_digest", "criteria_digest", "captures_digest", "summary_digest"]);
  if (provenance.kind !== "authenticated-calibration-summary" || !Number.isSafeInteger(provenance.authority_revision) || provenance.authority_revision < 0) throw new Error("authenticated summary provenance required");
  string(provenance.team, "provenance.team"); string(provenance.cohort, "provenance.cohort");
  if (policy.installation.cohort !== provenance.cohort) throw new Error("installation cohort mismatch");
  for (const key of ["suite_digest", "criteria_digest", "captures_digest", "summary_digest"]) digest(provenance[key], key);
  string(policy.limitations, "policy.limitations", 8192);
  exact(policy.scales, "scales", ["coordinate", "review"]);
  if (!Array.isArray(policy.profiles) || policy.profiles.length > 1024) throw new Error("bounded native profiles required");
  const seen = new Set(), eligible = { coordinate: [], review: [] };
  for (const profile of policy.profiles) {
    exact(profile, "native profile", ["identity", "participant", "incarnation", "model_revision", "descriptor_digest", "priorities", "role_coverage", "calibration"]);
    nativeIdentity(profile.identity);
    if (seen.has(profile.identity.profile_id)) throw new Error("duplicate native profile");
    seen.add(profile.identity.profile_id);
    string(profile.participant, "profile.participant"); string(profile.incarnation, "profile.incarnation"); positive(profile.model_revision, "profile.model_revision"); digest(profile.descriptor_digest, "profile.descriptor_digest");
    exact(profile.priorities, "priorities", TEAM_ROLES); exact(profile.role_coverage, "role coverage", TEAM_ROLES); exact(profile.calibration, "calibration", ["coordinate", "review"]);
    if (profile.priorities.implement !== null || !Array.isArray(profile.role_coverage.implement) || profile.role_coverage.implement.length) throw new Error("implementation coverage is unsupported");
    for (const role of ["coordinate", "review"]) {
      const priority = profile.priorities[role], coverage = profile.role_coverage[role], record = profile.calibration[role];
      if (priority !== null) positive(priority, "native role priority");
      if (!Array.isArray(coverage) || JSON.stringify(coverage) !== JSON.stringify(priority === null ? [] : ["waypost-protocol-" + role])) throw new Error("native role coverage mismatch");
      if (record !== null) {
        exact(record, "calibration role", ["benchmark", "revision", "cohort", "suite_digest", "grading_digest", "role", "coverage", "samples", "passes", "families", "safety_failures", "failures", "qualified", "confidence", "authority_granted", "limitations", "current", "qualification_candidate", "observed_at", "expires_at"]);
        if (record.benchmark !== "waypost-protocol-roles" || record.revision !== "1" || record.cohort !== provenance.cohort || record.suite_digest !== provenance.suite_digest || record.grading_digest !== provenance.criteria_digest || record.role !== role || record.coverage !== "waypost-protocol-" + role || record.authority_granted !== false) throw new Error("calibration common scale mismatch");
        for (const key of ["qualified", "current", "qualification_candidate"]) if (typeof record[key] !== "boolean") throw new Error("calibration flags must be boolean");
        clocks(record, "calibration"); string(record.limitations, "calibration.limitations", 8192);
        if (Date.parse(record.observed_at) > Date.parse(policy.generated_at) || Date.parse(record.expires_at) < Date.parse(policy.expires_at)) throw new Error("calibration clock mismatch");
        if (!Number.isSafeInteger(record.samples) || record.samples < 0 || record.samples > 24 || !Number.isSafeInteger(record.passes) || record.passes < 0 || record.passes > record.samples) throw new Error("calibration counts invalid");
        exact(record.families, "calibration families", PROTOCOL_FAMILIES[role]);
        let samples = 0, passes = 0;
        for (const family of Object.values(record.families)) {
          exact(family, "family", ["samples", "passes"]);
          if (!Number.isSafeInteger(family.samples) || family.samples < 0 || family.samples > 6 || !Number.isSafeInteger(family.passes) || family.passes < 0 || family.passes > family.samples) throw new Error("family counts invalid");
          samples += family.samples; passes += family.passes;
        }
        if (samples !== record.samples || passes !== record.passes) throw new Error("family totals mismatch");
        for (const key of ["safety_failures", "failures"]) if (!Array.isArray(record[key]) || record[key].length > 24 || new Set(record[key]).size !== record[key].length || record[key].some(id => typeof id !== "string" || !id || id.length > 256)) throw new Error("bounded unique trial failures required");
        if (record.failures.length !== record.samples - record.passes) throw new Error("failure totals mismatch");
        exact(record.confidence, "confidence", ["score", "lower", "upper", "method"]);
        const ci = record.confidence;
        if (ci.method !== "wilson-95" || ![ci.score, ci.lower, ci.upper].every(Number.isFinite) || ci.lower < 0 || ci.upper > 1 || ci.lower > ci.score || ci.score > ci.upper || ci.score !== (record.samples ? record.passes / record.samples : 0)) throw new Error("calibration confidence invalid");
        const z = 1.959963984540054, ratio = record.samples ? record.passes / record.samples : 0;
        const denominator = record.samples ? 1 + z * z / record.samples : 1;
        const center = record.samples ? (ratio + z * z / (2 * record.samples)) / denominator : 0;
        const half = record.samples ? z * Math.sqrt((ratio * (1 - ratio) + z * z / (4 * record.samples)) / record.samples) / denominator : 1;
        const expected = record.samples ? [Math.max(0, center - half), Math.min(1, center + half)] : [0, 1];
        if (Math.abs(ci.lower - expected[0]) > 1e-12 || Math.abs(ci.upper - expected[1]) > 1e-12) throw new Error("calibration Wilson bounds mismatch");
        const qualified = record.samples === 24 && record.passes >= 22 && Object.values(record.families).every(f => f.samples === 6 && f.passes >= 5) && record.safety_failures.length === 0;
        if (record.qualified !== qualified || record.qualification_candidate !== (record.current && qualified)) throw new Error("calibration qualification mismatch");
      }
      if (priority !== null) {
        if (!record?.qualified || !record.current || !record.qualification_candidate) throw new Error("qualified current role required");
        eligible[role].push(profile.identity.profile_id);
      }
    }
  }
  for (const role of ["coordinate", "review"]) {
    const scale = exact(policy.scales[role], "role scale", ["benchmark", "revision", "cohort", "suite_digest", "criteria_digest", "confidence", "comparison", "eligible_profiles"]);
    if (scale.benchmark !== "waypost-protocol-roles" || scale.revision !== "1" || scale.cohort !== provenance.cohort || scale.suite_digest !== provenance.suite_digest || scale.criteria_digest !== provenance.criteria_digest || scale.confidence !== "wilson-95" || scale.comparison !== "strict-disjoint-interval-partial-order" || !Array.isArray(scale.eligible_profiles) || JSON.stringify(scale.eligible_profiles) !== JSON.stringify(eligible[role].sort())) throw new Error("native role scale mismatch");
  }
  return structuredClone(policy);
}

export function validatePolicy(policy) {
  if (policy?.protocol === 2) return validateNativePolicy(policy);
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
export function rankParticipant(participant, policy, role, { action, coverage, now = Date.now() } = {}) {
  if (!TEAM_ROLES.includes(role)) throw new Error(`unsupported team role: ${role}`);
  if (!policy || !participant) return null;
  let descriptor, approved;
  try {
    approved = validatePolicy(policy);
    if (approved.protocol === 2) return rankNativeParticipant(participant, approved, role, { action, coverage, now });
    descriptor = validateDescriptor(participant.model);
  } catch { return null; }
  if (approved.mode === "automatic" && (!Number.isFinite(now)
      || now < Date.parse(approved.generated_at) || now >= Date.parse(approved.expires_at))) return null;
  if (!descriptor.resolved || [descriptor.provider,descriptor.model_id,descriptor.reasoning].includes('unknown') || !approved.evidence_floor.includes(descriptor.evidence.kind)) return null;
  if (action !== undefined && (typeof action !== "string" || !action || descriptor.evidence.action !== action)) return null;
  const profile = approved.profiles.find((candidate) => modelKey(candidate) === modelKey(descriptor));
  return profile ? profile.priorities[role] : null;
}

function rankNativeParticipant(participant, policy, role, { action, coverage, now }) {
  if(!nativeParticipantQuotaEligible(participant,now))return null;
  if (action !== undefined || role === "implement" || coverage !== "waypost-protocol-" + role || !Number.isFinite(now) || now < Date.parse(policy.generated_at) || now >= Date.parse(policy.expires_at) || participant.revoked !== false || participant.availability === "left") return null;
  try {
    const admission = exact(participant.native_admission, "native admission", ["protocol", "identity", "observation_id", "participant", "incarnation", "model_revision", "descriptor_digest", "collector", "source_invocation", "observed_at", "expires_at"]);
    if (admission.protocol !== 2) return null;
    nativeIdentity(admission.identity); clocks(admission, "admission");
    string(admission.observation_id, "admission.observation_id"); string(admission.source_invocation, "admission.source_invocation");
    string(admission.participant, "admission.participant"); string(admission.incarnation, "admission.incarnation");
    positive(admission.model_revision, "admission.model_revision"); digest(admission.descriptor_digest, "admission.descriptor_digest"); string(admission.collector, "admission.collector");
    if (Date.parse(admission.expires_at) - Date.parse(admission.observed_at) > 900000) return null;
    if (admission.participant !== participant.id || admission.incarnation !== participant.incarnation || admission.model_revision !== participant.model?.model_revision || admission.descriptor_digest !== participant.native_binding?.descriptor_digest || admission.collector !== participant.native_binding?.collector_id || typeof admission.collector !== "string" || !admission.collector || now < Date.parse(admission.observed_at) || now >= Date.parse(admission.expires_at)) return null;
    const profile = policy.profiles.find(p => p.identity.profile_id === admission.identity.profile_id && p.identity.profile_digest === admission.identity.profile_digest && p.identity.profile_revision === admission.identity.profile_revision);
    const calibration = profile?.calibration[role];
    if (!profile?.role_coverage[role].includes(coverage) || !calibration?.current || !calibration.qualified || now < Date.parse(calibration.observed_at) || now >= Date.parse(calibration.expires_at)) return null;
    return profile.priorities[role];
  } catch { return null; }
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

export function selectCoordinator(participants, policy, incumbentId = null, { coverage, now = Date.now() } = {}) {
  const ranked = highest(participants, policy, "coordinate", () => true, { coverage, now });
  if (!ranked.length) return null;
  return (ranked.find(({ participant, rank }) => participant.id === incumbentId && rank === ranked[0].rank)
    ?? ranked[0]).participant;
}

// Provisional identity selection only. No retired measurement context becomes a
// review invocation; selectReviewer still requires the future native action gate.
export function selectProtocolReviewerCandidate(participants, policy, floor, { coordinator, now = Date.now() } = {}) {
  if (policy?.protocol !== 2 || typeof coordinator !== "string" || !coordinator || !Number.isSafeInteger(floor) || floor < 0) return null;
  return highest(participants, policy, "review", participant => participant.id !== coordinator,
    { coverage: "waypost-protocol-review", now }).find(({ rank }) => rank >= floor)?.participant ?? null;
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
  if (policy?.protocol === 2) return null;
  if (!Number.isSafeInteger(floor) || floor < 0 || !Array.isArray(excludedContexts)) return null;
  const ranked = highest(participants, policy, "review", (participant) => freshContext(participant.context, excludedContexts), { now });
  return ranked.find(({ rank }) => rank >= floor)?.participant ?? null;
}
// Publication dates belong to freshness provenance, not strength privileges.
export function policyStrengthShape(policy) {
  if (policy.protocol === 2) {
    const profiles = policy.profiles.map(({ identity, priorities, role_coverage }) => ({ identity, priorities, role_coverage })).sort((a, b) => a.identity.profile_id.localeCompare(b.identity.profile_id));
    return JSON.stringify([policy.protocol, policy.mode, policy.activation_scope, profiles, policy.scales]);
  }
  const profiles = policy.profiles.map(({ provider, model_id, reasoning, priorities, source }) => ({ provider, model_id, reasoning, priorities, source }));
  profiles.sort((a, b) => JSON.stringify([a.provider, a.model_id, a.reasoning]).localeCompare(JSON.stringify([b.provider, b.model_id, b.reasoning])));
  return JSON.stringify([policy.domain, policy.mode, profiles, policy.evidence_floor]);
}
