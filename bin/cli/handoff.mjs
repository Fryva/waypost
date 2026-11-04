// Experimental packet writer. Computation and observations live in scripts/.
import { openSync, writeFileSync, closeSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, dirname, basename, join, sep } from 'node:path';
import { projectRoot } from './core.mjs';
import { createPacket, inspectPacket, formatInspection, readHandoffJson } from '../../scripts/handoff.mjs';

export async function handleHandoff(args) {
  try {
    const [command, ...rest] = args;
    if (command === 'continue') {
      await (await import('./handoff-retrieval.mjs')).handleRetrieval(rest);
      return;
    }
    if (command === 'transfer') {
      await (await import('./handoff-transfer.mjs')).handleTransfer(rest);
      return;
    }
    if (command === 'prepare') {
      await (await import('./handoff-prepare.mjs')).handlePrepare(rest);
      return;
    }
    if (command === 'capture') {
      await (await import('./handoff-capture.mjs')).handleCapture(rest);
      return;
    }
    if (command === 'deliver') {
      await (await import('./handoff-delivery.mjs')).handleDelivery(rest);
      return;
    }
    if (command === 'show') {
      if (!rest[0] || rest[0].startsWith('--') || rest.length > 2 || (rest.length === 2 && rest[1] !== '--json')) throw new Error('usage: handoff show <packet> [--json]');
      const report = inspectPacket(projectRoot(), readHandoffJson(resolve(rest[0])));
      process.stdout.write(rest[1] === '--json' ? JSON.stringify(report, null, 2) + '\n' : formatInspection(report));
      if (report.snapshot_matches !== true) process.exitCode = 2;
      return;
    }
    if (command !== 'create' || rest.length !== 4) throw new Error('usage: handoff create --input <json> --output <new-json>');
    const options = {};
    for (let i = 0; i < rest.length; i += 2) {
      const [key, value] = rest.slice(i, i + 2);
      if (!['--input', '--output'].includes(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error('handoff-invalid-arguments');
      options[key] = value;
    }
    if (!options['--input'] || !options['--output']) throw new Error('handoff-invalid-arguments');
    const input = resolve(options['--input']), output = resolve(options['--output']);
    const destination = join(realpathSync(dirname(output)), basename(output));
    if (destination === realpathSync(input)) throw new Error('handoff-output-collision');
    const root = realpathSync(resolve(projectRoot()));
    const packet = createPacket(root, readHandoffJson(input));
    const outputKey = destination.toLowerCase();
    if ([...packet.files, ...packet.evidence].some(e => {
      const sourceKey = join(root, e.path).toLowerCase();
      return sourceKey === outputKey || sourceKey.startsWith(outputKey + sep);
    })) throw new Error('handoff-output-collision');
    // An explicit file is the only write. Never replace a packet or another file.
    // lstat is not the no-clobber gate: open('wx') below is.
    try { lstatSync(output); throw new Error('handoff-output-exists'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const fd = openSync(output, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify(packet, null, 2) + '\n'); }
    finally { closeSync(fd); }
    process.stdout.write(`created ${options['--output']} (${packet.files.length} files, ${packet.evidence.length} evidence references; caller claims unverified)\n`);
  } catch (e) {
    process.stderr.write(`waypost handoff: ${e.message}\n`);
    process.exitCode = 1;
  }
}
