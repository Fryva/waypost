import { existsSync, readdirSync } from "node:fs";

// ─── Slug / numbering ──────────────────────────────────────────────────

// Cyrillic → Latin so ru titles produce portable ASCII filenames; every other
// Unicode letter/digit survives via \p{L}\p{N}. Never returns an empty slug.
const CYRILLIC = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(s) {
  const slug = s
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => CYRILLIC[c] ?? c)
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "untitled";
}

// Prefix is matched case-insensitively and with regex metacharacters escaped:
// GrammarHelper ships `spec-002-*.md` while the layout prefix is `SPEC-` — a
// case-sensitive match would hand out SPEC-001 next to an existing spec-001.
export function nextNumber(dir, prefix, pad = 3) {
  if (!existsSync(dir)) return String(1).padStart(pad, "0");
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`^${escaped}(\\d+)`, "i");
  const nums = readdirSync(dir)
    .map((n) => n.match(rx))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return String(next).padStart(pad, "0");
}

