import { readFileSync, writeFileSync, linkSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { hostname, platform } from "node:os";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { machineStateDir, ensureMachineStateDir } from "./lib-machine-state.mjs";
import { hostSlug } from "./presence-storage.mjs";

// The identifier the OS keeps for this machine, or null. It is the same for
// every account on the machine, so two users of one host agree on who "this
// host" is; two devices never do, whatever they are called.
function osMachineId() {
  const read = (p) => { try { return readFileSync(p, "utf8").trim() || null; } catch { return null; } };
  const run = (cmd, args) => {
    try {
      const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 5000, windowsHide: true });
      return r.status === 0 ? String(r.stdout) : "";
    } catch { return ""; }
  };
  switch (platform()) {
    case "linux": return read("/etc/machine-id") || read("/var/lib/dbus/machine-id");
    case "darwin": return (/"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(run("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"])) || [])[1] || null;
    case "win32": return (/MachineGuid\s+REG_SZ\s+(\S+)/i.exec(run("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"])) || [])[1] || null;
    default: return null;
  }
}

// A stable identity of THIS machine. The short hostname is not one: two
// devices sharing a vault or checkout may both be called "MacBook-Pro", and
// each would then read the other's live records as its own, find their pids
// absent from the local process table and call them gone. The id is a hash of
// the OS machine id (the raw value never leaves this file: records may sit on a
// cloud drive); where the OS gives none it is a random "r-" id minted once.
// It is cached in the per-host machine state directory (never synced) so a
// command does not spawn ioreg/reg; a random id is replaced once an OS id is
// available. Any filesystem error gives null, and sameHost() falls back to
// comparing names.
const GOOD = /^(?:[0-9a-f]{32}|r-[0-9a-f-]{36})$/;
let hostIdMemo;
export function hostId() {
  if (hostIdMemo !== undefined) return hostIdMemo;
  let id = null;
  try {
    const file = join(ensureMachineStateDir(machineStateDir()), `host-id.${hostSlug()}`);
    const read = () => { try { const v = readFileSync(file, "utf8").trim(); return GOOD.test(v) ? v : null; } catch { return null; } };
    id = read();
    if (!id || id.startsWith("r-")) {
      const os = osMachineId();
      const fresh = os ? createHash("sha256").update("waypost-host-v1:" + os).digest("hex").slice(0, 32) : (id || "r-" + randomUUID());
      if (fresh !== id) {
        const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}`;
        try {
          writeFileSync(tmp, fresh + "\n", { flag: "wx", mode: 0o600 });
          try { linkSync(tmp, file); id = fresh; }
          catch (e) {
            const other = e && e.code === "EEXIST" ? read() : null;
            // Someone else's good id wins unless ours is better (an OS id over
            // a random one); an empty or broken file is replaced atomically.
            if (other && !(os && other.startsWith("r-"))) id = other;
            else { renameSync(tmp, file); id = fresh; }
          }
        } finally { try { unlinkSync(tmp); } catch {} }
      }
    }
  } catch { id = null; }
  return (hostIdMemo = id);
}

// Is this record from this machine? By id when both sides have one; a record
// written before `host_id` existed (or while the state directory was
// unwritable) falls back to the short name. That legacy case stays vulnerable
// to a same-named foreign machine until its record is rewritten by a beat.
export function sameHost(rec, short = hostname().split(".")[0]) {
  if (!rec) return false;
  const mine = hostId();
  if (rec.host_id && mine) return rec.host_id === mine;
  return rec.host === short;
}
