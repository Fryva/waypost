// Child-only fixture: intercept exactly the three next JSON producers, not arbitrary spawns.
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
const data = JSON.parse(process.env.NEXT_FIXTURE_DATA);
const routes = new Map(["doctor", "sessions", "ready"].map(name => [join(process.env.NEXT_FIXTURE_ROOT, "scripts", `${name}.mjs`), name]));
const original = cp.spawnSync;
cp.spawnSync = (command, args, options) => {
  const name = command === process.execPath && Array.isArray(args) ? routes.get(args[0]) : null;
  if (!name || args.length !== 2 || args[1] !== "--json") return original(command, args, options);
  appendFileSync(process.env.NEXT_FIXTURE_TRACE, JSON.stringify({ name, args: args.slice(1) }) + "\n");
  const response = data[name];
  return { status: response.status ?? 0, stdout: response.raw ?? JSON.stringify(response.value), stderr: "", signal: null };
};
syncBuiltinESMExports();
