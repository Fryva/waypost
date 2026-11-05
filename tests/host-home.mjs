// Import first: points HOME at a throwaway directory so hostId() (machine state
// under ~/.local/state/waypost) never writes into the developer's real home.
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const home = mkdtempSync(join(tmpdir(), "wp-test-home-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.on("exit", () => { try { rmSync(home, { recursive: true, force: true }); } catch {} });
