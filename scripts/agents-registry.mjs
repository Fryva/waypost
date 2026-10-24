// waypost — lazy harness/provider registry and shared metadata state.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pluginRoot, projectRoot } from "./lib.mjs";

// ─── Harness registry ──────────────────────────────────────────────────
//
// A harness is DATA, not code: harnesses/<id>.json says where its role files
// live, what shape they are, and whether they can carry a model. Supporting one
// more agent CLI is a JSON file, not a branch in a renderer — which is the only
// way "works with whatever harness you use" can stay true as the field churns.
//
// A project can add or override an entry in <project>/.waypost/harnesses/<id>.json;
// nothing here is a closed list.
//
// Shapes:
//   frontmatter-md  one file per role: YAML frontmatter + the prompt
//   prompt-md       one file per role: optional frontmatter, $ARGUMENTS preamble
//   toml-prompt     one file per role: description/prompt TOML (Gemini CLI)
//   aggregate-json  one shared JSON file holding an array of modes (Roo Code)
//   none            the harness has NO per-role file format at all. Real and
//                   not rare: DeepSeek Harness registers subagents in code, and
//                   several editors only read a rules file. Such an entry is
//                   still worth having — it is detected, it receives the
//                   routing block, and it says how a role is reached instead
//                   (`waypost agents show`, or a harness it can spawn) — but
//                   install writes nothing and doctor must not ask why.

export const AGENT_BLOCK_VERSION = 3;
export const AGENT_BLOCK_MARKER = /<!--\s*waypost:agents v(\d+)/g;
// Roles register under a waypost- prefix in every harness. Bare names (critic,
// planner, reviewer) are common enough that a user's own agent would collide;
// a prefix keeps both, and makes "which of these is ours" a string match.
export const PREFIX = "waypost-";
export const TIERS = ["reasoning", "balanced", "fast"];

function registryDirs() {
  return [
    join(pluginRoot(), "harnesses"),
    join(pluginRoot(), "harnesses", "providers"),
    join(projectRoot(), ".waypost", "harnesses"),
    join(projectRoot(), ".waypost", "harnesses", "providers"),
  ];
}

// Memoized per plugin root, not once per process: every dispatch this CLI makes
// is given WAYPOST_HOME=ROOT, but an in-process import is not, and pluginRoot()
// honours WAYPOST_HOME and CLAUDE_PLUGIN_ROOT. Keyed only on first read, the
// first caller wins — and bin/waypost's own detection runs before anything
// pins the root, so a foreign root silently supplied the ids the rest of the
// command then used. Keyed on the root, a second read from a different root is
// a different registry, which is what every caller means.
let _registry = null;
let _registryRoot = null;
export function registry() {
  const root = pluginRoot();
  if (_registry && _registryRoot === root) return _registry;
  const out = new Map();
  const dirs = registryDirs();
  for (let i = 0; i < dirs.length; i++) {      // project entries override bundled ones
    const dir = dirs[i];
    let names = [];
    try { names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort(); }
    catch {
      // The bundled harnesses/ directory (index 0) is the tool's own data:
      // unreadable means WAYPOST_HOME/CLAUDE_PLUGIN_ROOT points at a
      // misconfigured or partial tool root, not "this project has no
      // harnesses". Every `agents`/`harnesses` command should fail loudly
      // instead of printing an empty table with exit 0. The project-local
      // dirs (and the bundled providers/ subdir) are legitimately optional.
      if (i === 0) {
        throw new Error(
          `Cannot read the bundled harness registry at ${dir} ` +
          `(pluginRoot: ${pluginRoot()}). Check WAYPOST_HOME / CLAUDE_PLUGIN_ROOT.`);
      }
      continue;
    }
    for (const n of names) {
      let h;
      try { h = JSON.parse(readFileSync(join(dir, n), "utf8")); }
      catch (e) { throw new Error(`${join(dir, n)}: not valid JSON — ${e.message}`); }
      const id = h.id || n.replace(/\.json$/, "");
      out.set(id, { ...h, id, source: join(dir, n) });
    }
  }
  _registry = out;
  _registryRoot = root;
  return out;
}

export function harness(id) {
  const h = registry().get(id);
  if (!h) throw new Error(`Unknown harness: ${id} (known: ${[...registry().keys()].join(", ")})`);
  return h;
}

// A vendor is not a harness. DeepSeek, Kimi, GLM and MiniMax ship MODELS that
// run inside somebody else's harness — usually Claude Code against an
// Anthropic-compatible endpoint. Registering them as harnesses would promise
// role files that have nowhere to go; registering them as providers lets waypost
// name which model produced a commit while installing into the harness that is
// actually running.
export const isProvider = (h) => (typeof h === "string" ? harness(h) : h).kind === "provider";

// How sure we are about an entry's file format. The levels are about EVIDENCE,
// not about how much we like the tool:
//   verified    the format is documented AND has been exercised in that harness
//   documented  taken from the vendor's own documentation (`docs:` names it),
//               but not run here
//   inferred    guessed from a directory convention or a sibling CLI in the
//               same family; the entry's `notes` say what was assumed
export const CONFIDENCE = ["verified", "documented", "inferred"];
export const confidenceOf = (h) =>
  h.confidence || (h.verified ? "verified" : "inferred");

// Ordered ids, most-trusted first: the list is printed to users, and "what is
// known to work" is the useful order. Providers are not in it — nothing
// installs into them. A confidence value CONFIDENCE does not know (a typo in a
// project-local harness override) sorts LAST rather than throwing — a typo in
// one entry must not break every `waypost` command that lists harnesses.
const confidenceRank = (h) => {
  const i = CONFIDENCE.indexOf(confidenceOf(h));
  return i === -1 ? CONFIDENCE.length : i;
};
export const harnessIds = () => [...registry().values()]
  .filter((h) => !isProvider(h))
  .sort((a, b) => (confidenceRank(a) - confidenceRank(b))
    || a.id.localeCompare(b.id))
  .map((h) => h.id);

export const providerIds = () => [...registry().values()]
  .filter(isProvider).map((h) => h.id).sort();

// Which model provider this session is pointed at, if any. Read from the
// environment the way harness detection is: an endpoint override or a vendor
// key. `WAYPOST_PROVIDER` wins, because a guess in a permanent record is worse than
// a blank.
export function detectProvider(env = process.env) {
  if (env.WAYPOST_PROVIDER) return env.WAYPOST_PROVIDER;
  const urls = ["ANTHROPIC_BASE_URL", "ANTHROPIC_API_URL", "OPENAI_BASE_URL", "OPENAI_API_BASE",
    "OPENAI_API_HOST", "LLM_BASE_URL"].map((k) => env[k]).filter(Boolean).join(" ").toLowerCase();
  for (const id of providerIds()) {
    const m = harness(id).match || {};
    if ((m.env || []).some((k) => env[k])) return id;
    if (urls && (m.url_contains || []).some((u) => urls.includes(String(u).toLowerCase()))) return id;
  }
  return null;
}

// Kept as a live getter so the registry stays the single source; existing
// callers (doctor, tests) read it as a list.
export const HARNESSES = new Proxy([], {
  get(_t, prop) {
    const ids = harnessIds();
    const v = ids[prop];
    return typeof v === "function" ? v.bind(ids) : (prop in ids ? ids[prop] : Reflect.get(ids, prop));
  },
  has(_t, prop) { return prop in harnessIds(); },
  ownKeys() { return Reflect.ownKeys(harnessIds()); },
  getOwnPropertyDescriptor(_t, prop) { return Reflect.getOwnPropertyDescriptor(harnessIds(), prop); },
});

const roleSpec = (h) => h.roles || {};

// Whether a harness's file format can carry a model at all. Cursor's `.mdc`
// rule format cannot: there is no per-rule model field, so a role file has
// nowhere to put one. This is a different fact from an empty tier map (Codex's
// `.codex/agents/*.toml` publishes no tier naming, but its `model` field does
// take an explicit id — `roles.model: { tiers: {} }`), and conflating the two
// let `agents model harness:cursor <id>` be accepted and then silently
// discarded.
export function harnessTakesModel(id) {
  return roleSpec(harness(id)).model !== false && roleSpec(harness(id)).model !== undefined;
}

export { roleSpec };
