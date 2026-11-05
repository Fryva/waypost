// Local transfer bytes only. Authenticated reports remain optimization hints.
import { createHash } from 'node:crypto';
import { mkdtempSync, openSync, writeFileSync, closeSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { projectRoot, ROOT } from './core.mjs';
import { readConfig } from '../../scripts/lib.mjs';
import { coordinationDirs } from '../../scripts/presence.mjs';
import { readAuthority } from '../../scripts/team-store.mjs';
import { authorizeActor, reduceTeamEvent } from '../../scripts/team-state.mjs';
import { readHandoffRoute } from '../../scripts/handoff-prepare.mjs';
import { readHandoffJson } from '../../scripts/handoff.mjs';
import { assertDeliveryDestination } from '../../scripts/handoff-delivery.mjs';
import { buildTransfer, parseTransfer, readTransferFile, writeTransferFile, applyTransfer, availabilityReport, collectTransferStore } from '../../scripts/handoff-transfer.mjs';
import { runHandoffCommand } from './handoff-process.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
export async function handleTransfer(rest) {
  let scratch;
  try {
    const [mode, ...args] = rest, options = {};
    const modes = {
      export: ['--config', '--packet', '--selection', '--output', '--base', '--availability-id'],
      import: ['--config', '--store', '--input', '--materialize', '--quota-bytes'],
      report: ['--config', '--store', '--manifest'], gc: ['--config', '--store', '--keep']
    };
    if (!modes[mode]) throw new Error('handoff-transfer-operation: export|import|report|gc');
    for (let i = 0; i < args.length; i += 2) {
      const [key, value] = args.slice(i, i + 2);
      if (!modes[mode].includes(key) || Object.hasOwn(options, key) || typeof value !== 'string' || !value || value.startsWith('--')) throw new Error('handoff-transfer-options');
      options[key] = value;
    }
    const required = mode === 'export' ? ['--config', '--packet', '--selection', '--output'] : ['--config', '--store', ...(mode === 'import' ? ['--input'] : mode === 'report' ? ['--manifest'] : ['--keep'])]; // gc without --keep would collect every snapshot
    if (required.some(key => !options[key]) || Boolean(options['--base']) !== Boolean(options['--availability-id'])) throw new Error('handoff-transfer-required-options');
    const cfg = readConfig(); if (!cfg?.vault_path) throw new Error('bind-a-vault-before-handoff-transfer');
    const root = resolve(projectRoot()), authorityRoot = join(coordinationDirs(cfg.vault_path).primary, 'teams', 'authority');
    const load = () => readAuthority(authorityRoot, reduceTeamEvent).state;
    const state = load(), route = readHandoffRoute(resolve(options['--config']), { state, authorityRoot, projectRoot: root, vaultPath: cfg.vault_path });
    const team = state.teams[route.team];
    if (team.status === 'closed') throw new Error('handoff-transfer-team-closed');
    const scope = { team: route.team, epoch: team.epoch, sender: route.sender, sender_incarnation: team.participants[route.sender].incarnation, receiver: route.receiver, receiver_incarnation: team.participants[route.receiver].incarnation };
    const actor = mode === 'export' ? route.sender : route.receiver;
    const credential = readHandoffJson(resolve(mode === 'export' ? route.sender_credential : route.receiver_credential));
    if (credential.protocol !== 1 || credential.role !== 'participant' || typeof credential.token !== 'string' || credential.token.length < 32 || authorizeActor(state, route.team, { ...credential, token_hash: sha(credential.token) }) !== actor) throw new Error('handoff-transfer-participant-required');
    let result;
    if (mode === 'export') {
      const selection = readHandoffJson(resolve(options['--selection']));
      if (!selection || Object.keys(selection).join() !== 'include') throw new Error('handoff-transfer-selection');
      const baseline = options['--base'] ? parseTransfer(readTransferFile(options['--base'])).envelope : null;
      if (baseline && JSON.stringify(baseline.scope) !== JSON.stringify(scope)) throw new Error('handoff-transfer-base-scope');
      const envelope = buildTransfer(root, options['--packet'], { scope, include: selection.include, base: baseline?.manifest, availabilityId: options['--availability-id'], authority: load() });
      assertDeliveryDestination({ root, packetPath: options['--packet'] }, resolve(options['--output']));
      const output = writeTransferFile(options['--output'], envelope);
      result = { stage: 'exported', mode: envelope.mode, manifest_sha256: envelope.manifest_sha256, transfer_id: envelope.transfer_id, output,
        object_bytes: envelope.objects.reduce((n, object) => n + object.bytes, 0), serialized_transfer_bytes: Buffer.byteLength(JSON.stringify(envelope)), model_input_tokens: null };
    } else if (mode === 'import') {
      let quotaBytes;
      if (options['--quota-bytes']) { if (!/^[1-9][0-9]{0,8}$/.test(options['--quota-bytes'])) throw new Error('handoff-transfer-quota'); quotaBytes = Number(options['--quota-bytes']); }
      result = applyTransfer(options['--store'], readTransferFile(options['--input']), { scope, quotaBytes, materialize: options['--materialize'], authority: load() });
      if (result.stage === 'needs-full') process.exitCode = 2;
    } else if (mode === 'gc') {
      result = { stage: 'collected', ...collectTransferStore(options['--store'], scope, { keep: options['--keep']?.split(',') || [] }) };
    } else {
      const payload = availabilityReport(options['--store'], options['--manifest'], scope);
      scratch = mkdtempSync(join(tmpdir(), 'waypost-handoff-availability-'));
      const request = join(scratch, 'request.json'), fd = openSync(request, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify({ payload })); } finally { closeSync(fd); }
      const sent = await runHandoffCommand(process.execPath, [join(ROOT, 'bin', 'waypost.mjs'), '--project', root, 'team', 'send', route.team,
        '--credential', route.receiver_credential, '--to', route.sender, '--kind', 'ack', '--request-key', 'handoff-availability-' + sha(JSON.stringify(payload)).slice(0, 32), '--request-file', request],
      { deadlineAt: Date.now() + 30000, env: { ...process.env, WAYPOST_NO_BEAT: '1' } });
      // Existing send records participant identity. It does not attest Host origin.
      result = { stage: 'reported', message_id: sent.result?.id, manifest_sha256: payload.manifest_sha256, transfer_id: payload.transfer_id, proof: 'participant-availability-hint', model_input_tokens: null };
      if (!result.message_id) throw new Error('handoff-transfer-report-message');
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) { process.stderr.write('waypost handoff transfer: ' + error.message + '\n'); process.exitCode = 1; }
  finally { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
}
