// waypost — the environment a test hands to the CLI and scripts it spawns.
//
// process.env without WAYPOST_*: a child gets the WAYPOST_* its call sets and
// none it would inherit. The suite itself may run under some —
// `WAYPOST_NO_BEAT=1 waypost run --heavy -- node --test …` turned off every
// heartbeat the presence tests count on, and an exported WAYPOST_PROC stands in
// for the harness process a call is meant to derive.
export const ambientEnv = () => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("WAYPOST_"))),
  WAYPOST_NO_STATE_MIGRATION: "1",
});

// Importing this module is enough for children spawned from `process.env` too:
// none of them moves a developer's real machine state (bin/waypost
// migrateStateIfNeeded). A test of the move itself sets it back to "".
process.env.WAYPOST_NO_STATE_MIGRATION = "1";
