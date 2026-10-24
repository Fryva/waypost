// Never entered, whatever it contains: version control metadata. Every
// other never-enter name (installed dependency trees, virtualenvs, …) is a
// tool's own business and comes from the registry's `skip` lists instead.
const CORE_SKIP = new Set([".git"]);


// The `system` entry's own list of distributable-package suffixes (the
// amended ADR, Decision 3) — read once per scan, lower-cased, and compared
// against an entry's own basename, also lower-cased, during the very same
// age walk that already visits every entry: an item holding one of these is
// never counted or picked by an automatic, no-questions-asked sweep. The
// list itself is registry data, never spelled out in this file.
export function keepSuffixesOf(entries) {
  const sys = entries.find((e) => e.id === "system");
  const list = Array.isArray(sys && sys.auto_keep_suffixes) ? sys.auto_keep_suffixes : [];
  return new Set(list.map((s) => String(s).toLowerCase()));
}

// Builds the four lookup shapes the walk needs — sure/generic names,
// prefixes and patterns — from every loaded entry's `artifacts`, plus the
// union of every entry's `skip` names, and an owner lookup back from a
// matched name/prefix/pattern to the entry that claims it (`tool`, whether
// that entry's own definition is the shipped registry or a project's own,
// `regenerable`, `stale_days`, and its clean instructions) — the same shape
// a matched cache item already carries, so a caller classifying a matched
// item never has to ask which kind of match it was to read its owner. Pure
// data assembly, no tool named.
export function compileArtifacts(entries) {
  const skip = new Set(CORE_SKIP);
  const ownerByName = new Map();
  const ownerByPrefix = [];
  const ownerByPattern = [];

  // Every (entry, artifact) pair, with its OWN origin resolved first: a
  // project artifact carries its own `origin: "project"` (sanitizeArtifact,
  // scripts/toolchains.mjs) even when merged into an otherwise-shipped
  // entry that extends a shipped id — `a.origin` always wins over the
  // entry's own `e.origin` when set, so that one glued-on artifact is never
  // mistaken for the shipped definition around it. A project artifact never
  // carries a `pattern` (the allowlist excludes it), so patterns are
  // shipped-only.
  //
  // Blocker 1, second round (independent review, 2026-09-18): whether a
  // matched name counts as "sure" (walked and counted at once) or
  // "generic" (needs a confirmed git-ignore first) used to be tracked in
  // FLAT sets built from every artifact regardless of origin or ownership —
  // a project artifact reusing a name, prefix, OR pattern a shipped entry
  // already owns as "generic" could flip it to "sure" project-wide, simply
  // by declaring the SAME name/prefix `match: "sure"` itself (a brand-new
  // id, an extension of the very entry that owns it, or an unrelated
  // prefix like "b" that happens to also match "build"). An un-ignored
  // "sure" match skips the git-ignore check the walk would otherwise
  // require, and — once its OWNER still resolves to the shipped entry
  // (ownership itself was already fixed the first round) — routeFor's own
  // shipped-sure bypass would remove it outright with no tracked-file
  // check at all; an ignored one would escape the generic cap (never
  // "should", never counted for a machine-wide limit) it was supposed to
  // stay under. The fix: `match` is now read from the SAME owner object
  // ownership already resolves with shipped priority (see below) — there
  // is no separate flat set left to flip.
  const pairs = [];
  for (const e of entries) {
    for (const name of e.skip || []) skip.add(name);
    for (const a of e.artifacts || []) {
      const origin = a.origin ?? e.origin ?? "shipped";
      const owner = {
        tool: e.id, origin, match: a.match, regenerable: a.regenerable,
        stale_days: Number.isFinite(a.stale_days) ? a.stale_days : null,
        clean: a.clean ?? null,
        // `false` only when this artifact's own origin is "shipped" AND it
        // carries `auto === false` itself (the amended ADR: read only from
        // the shipped registry) — never inherited, never true-by-default;
        // `undefined` (checked upstream as `!== false`, never as `=== true`)
        // is what every other artifact carries.
        auto: origin === "shipped" && a.auto === false ? false : undefined,
        clean_argv: Array.isArray(a.clean_argv) ? a.clean_argv : null,
      };
      let re = null;
      if (typeof a.pattern === "string") {
        try { re = new RegExp(a.pattern, a.flags || undefined); } catch { continue; }
      } else if (typeof a.name !== "string" && typeof a.prefix !== "string") continue;
      pairs.push({ a, owner, origin, re });
    }
  }

  // Ownership decides which entry's policy AND match kind govern a matched
  // name/prefix/pattern — a shipped artifact always claims its own key
  // outright (last one in `entries` order wins among shipped artifacts,
  // same as before); a project artifact only ever ADDS a key nothing
  // shipped already owns. Without this, a project's own toolchains data —
  // sorted by id, so ordering is not something a project file controls —
  // could shadow or downgrade a shipped owner's policy (or, per the note
  // above, its match kind) for a name it already governs (ADR: a project's
  // own data can only extend the registry, never change what an outside
  // name means).
  for (const { a, owner, origin, re } of pairs) {
    if (origin === "project") continue;
    if (typeof a.name === "string") ownerByName.set(a.name, owner);
    else if (typeof a.prefix === "string") ownerByPrefix.push({ prefix: a.prefix, owner });
    else if (re) ownerByPattern.push({ re, owner }); // patterns are shipped-only
  }
  for (const { a, owner, origin } of pairs) {
    if (origin !== "project") continue;
    if (typeof a.name === "string") { if (!ownerByName.has(a.name)) ownerByName.set(a.name, owner); }
    else if (typeof a.prefix === "string") { if (!ownerByPrefix.some((x) => x.prefix === a.prefix)) ownerByPrefix.push({ prefix: a.prefix, owner }); }
  }

  return { skip, ownerByName, ownerByPrefix, ownerByPattern };
}

// Every shipped owner (name, then prefix, then pattern) is asked before any
// project owner, so a project name or prefix can never take over a name only
// a shipped pattern governs (a project "derived-data" against the shipped
// derived-data pattern) and lift it out of that owner's match kind.
export function ownerOf(name, c) {
  for (const origin of ["shipped", "project"]) {
    const n = c.ownerByName.get(name);
    if (n && n.origin === origin) return n;
    const p = c.ownerByPrefix.find((x) => x.owner.origin === origin && name.startsWith(x.prefix));
    if (p) return p.owner;
    const r = c.ownerByPattern.find((x) => x.owner.origin === origin && x.re.test(name));
    if (r) return r.owner;
  }
  return null;
}

// One entry per locator name, from whichever entry declares it — the same
// owner shape as an artifact's, read from the locator's own declaration
// (a locator that carries no `regenerable`/`clean` of its own reports those
// as unknown rather than guessing).
export function compileLocatorOwners(entries) {
  const map = new Map();
  for (const e of entries) {
    for (const l of e.locators || []) {
      if (map.has(l.name)) continue;
      map.set(l.name, {
        tool: e.id, origin: e.origin || "shipped",
        regenerable: typeof l.regenerable === "boolean" ? l.regenerable : null,
        stale_days: Number.isFinite(l.stale_days) ? l.stale_days : null,
        clean: l.clean ?? null,
        clean_argv: Array.isArray(l.clean_argv) ? l.clean_argv : null,
      });
    }
  }
  return map;
}

// Both read the SAME owner ownership already resolved (shipped priority,
// see compileArtifacts above) — the match kind is the owner's own `match`,
// never a separate signal a project artifact could flip on its own.
export function isSureName(name, c) {
  const owner = ownerOf(name, c);
  return owner != null && owner.match === "sure";
}

export function isMaybeName(name, c) {
  const owner = ownerOf(name, c);
  return owner != null && owner.match === "generic";
}

