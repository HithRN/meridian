/**
 * Deterministic, dependency-free hashing utilities.
 *
 * Used to produce stable content hashes for tool inputs, datasets, and
 * experiment configurations. These hashes appear in the audit trail so a
 * reviewer can confirm that a replayed run received byte-identical inputs.
 *
 * The algorithm is FNV-1a (64-bit) computed over a canonical JSON encoding.
 * It is not cryptographically secure; it is a fast, portable content
 * fingerprint that behaves identically in Node and the browser.
 */

/**
 * Canonical JSON: object keys are emitted in sorted order at every level so
 * that `{a:1,b:2}` and `{b:2,a:1}` hash identically. Arrays preserve order.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "null";
  const t = typeof value;
  if (t === "number") {
    return Number.isFinite(value as number) ? String(value) : "null";
  }
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (t === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`)
      .join(",")}}`;
  }
  return "null";
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit hash of a string, returned as a zero-padded 16-char hex. */
export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i) & 0xff);
    // include the high byte for non-latin code points
    const hi = input.charCodeAt(i) >> 8;
    hash = (hash * FNV_PRIME) & MASK_64;
    if (hi) {
      hash ^= BigInt(hi);
      hash = (hash * FNV_PRIME) & MASK_64;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

/** Stable content hash of any JSON-serialisable value. */
export function hashValue(value: unknown): string {
  return fnv1a64(canonicalize(value));
}

/** Short 8-character prefix, convenient for display in the UI. */
export function shortHash(value: unknown): string {
  return hashValue(value).slice(0, 8);
}
