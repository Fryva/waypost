// waypost — the environment a test hands to the CLI and scripts it spawns.
//
// process.env without WAYPOST_*: a child gets the WAYPOST_* its call sets and
// none it would inherit. The suite itself may run under some —
// `WAYPOST_NO_BEAT=1 waypost run --heavy -- node --test …` turned off every
// heartbeat the presence tests count on, and an exported WAYPOST_PROC stands in
// for the harness process a call is meant to derive.
export const ambientEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("WAYPOST_")));
