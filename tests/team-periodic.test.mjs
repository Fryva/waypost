import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
const at = '2026-09-30T12:00:00Z';
const policy = { protocol: 1, revision: 1, mode: 'automatic', domain: 'coding', generated_at: at, expires_at: '2026-10-01T12:00:00Z', sources: [{ id: 'fixture', url: 'https://example.com/evidence', retrieved_at: at }], profiles: [{ provider: 'fixture', model_id: 'model', reasoning: 'none', priorities: { coordinate: 1, implement: 1, review: 1 }, source: 'fixture', date: '2026-09-30' }] };
function fixture() {
 const state = reduceTeamEvent(null, { type: 'create', actor: 'owner:fixture', owner_hash: 'fixture', team: 'fixture', task: 'fixture.md', policy, at }).state;
 const team = state.teams.fixture;
 team.status = 'active'; team.leader = 'leader'; team.epoch = 4;
 team.work.sample = { status: 'reviewed', reviews: [{ verdict: 'ship' }], policy_revision: 1 };
 return state;
}
test('periodic unchanged strength refresh preserves authority, work and reviews', () => {
 const state = fixture();
 const refreshed = { ...policy, profiles: policy.profiles.map(p => ({ ...p, date: '2026-10-01' })), generated_at: '2026-10-01T11:00:00Z', expires_at: '2026-10-02T11:00:00Z' };
 const next = reduceTeamEvent(state, { type: 'strength-check', actor: 'owner:fixture', team: 'fixture', at: refreshed.generated_at, check: { ok: true, at: refreshed.generated_at }, policy: refreshed }).state.teams.fixture;
 assert.equal(next.policy.revision, 1); assert.equal(next.status, 'active'); assert.equal(next.epoch, 4);
 assert.deepEqual(next.work, state.teams.fixture.work);
 assert.equal(next.policy.expires_at, refreshed.expires_at);
 assert.equal(state.teams.fixture.policy.expires_at, policy.expires_at);
});
test('failed periodic check records failure and cannot extend policy expiry', () => {
 const state = fixture();
 const next = reduceTeamEvent(state, { type: 'strength-check', actor: 'owner:fixture', team: 'fixture', at, check: { ok: false, blockers: ['network unavailable'] } }).state.teams.fixture;
 assert.equal(next.policy.expires_at, policy.expires_at);
 assert.equal(next.strength_check.ok, false);
});
test('metadata refresh cannot smuggle changed priorities, revision or expired evidence', () => {
 for (const changed of [ { ...policy, revision: 2 }, { ...policy, profiles: [] }, { ...policy, expires_at: at } ]) {
  assert.throws(() => reduceTeamEvent(fixture(), { type: 'strength-check', actor: 'owner:fixture', team: 'fixture', at, check: {}, policy: changed }));
 }
 assert.throws(() => reduceTeamEvent(fixture(), { type: 'strength-check', actor: 'intruder', team: 'fixture', at, check: {} }), /owner-required/);
});
test('caller timestamp cannot make expired policy fresh in an accepted transition', () => {
 const state = fixture();
 const command = { type: 'strength-check', actor: 'owner:fixture', team: 'fixture', at, check: {}, policy };
 assert.throws(() => reduceTeamEvent(state, command, { accepted_at: '2026-10-02T12:00:00Z' }), /fresh-automatic-policy-required/);
});
