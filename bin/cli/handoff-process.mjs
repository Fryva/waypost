// Bounds only the held team-command child. Native closure remains authority-owned.
import { spawn } from 'node:child_process';

export const COMMAND_CLEANUP_GRACE_MS = 2000;
export function runHandoffCommand(executable, args, { deadlineAt, now = Date.now, maxBytes = 1048576,
  cleanupGraceMs = COMMAND_CLEANUP_GRACE_MS, env = process.env } = {}) {
  if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= now()) return Promise.reject(new Error('handoff-delivery-deadline'));
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1048576 || !Number.isSafeInteger(cleanupGraceMs) || cleanupGraceMs < 100 || cleanupGraceMs > 5000) return Promise.reject(new Error('handoff-team-command-options'));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let bytes = 0, output = [], failure = null, settled = false, closed = false, killTimer, drainTimer;
    const timer = setTimeout(() => stop('handoff-delivery-deadline'), Math.max(1, deadlineAt - now()));
    const finish = () => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(killTimer); clearTimeout(drainTimer);
      if (failure) {
        // Closing this wrapper never proves the native inference stopped or settled.
        failure.command_cleanup = { process_closed: closed, native_closure: 'unknown', grace_ms: cleanupGraceMs };
        reject(failure);
      } else {
        try { resolve(JSON.parse(Buffer.concat(output).toString('utf8'))); }
        catch { reject(new Error('handoff-team-command-json')); }
      }
    };
    function stop(code) {
      if (failure || settled) return;
      failure = new Error(code); clearTimeout(timer);
      // Held object only: never signal a PID recovered from persisted state.
      try { child.kill('SIGTERM'); } catch {}
      killTimer = setTimeout(() => { if (!closed) { try { child.kill('SIGKILL'); } catch {} } }, Math.floor(cleanupGraceMs / 2));
      drainTimer = setTimeout(() => {
        child.stdout.destroy(); child.stderr.destroy(); child.unref(); finish();
      }, cleanupGraceMs);
    }
    const collect = (chunk, stdout) => {
      if (settled || failure) return;
      bytes += chunk.length;
      if (bytes > maxBytes) return stop('handoff-team-command-output-limit');
      if (stdout) output.push(chunk);
    };
    child.stdout.on('data', chunk => collect(chunk, true));
    child.stderr.on('data', chunk => collect(chunk, false));
    child.on('error', error => { failure ||= new Error('handoff-team-command-failed:' + error.code); });
    child.on('close', (code, signal) => {
      closed = true;
      if (code !== 0 || signal) failure ||= new Error('handoff-team-command-failed:' + (signal || code));
      finish();
    });
  });
}
