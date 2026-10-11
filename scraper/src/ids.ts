// Site ids, following "Building id" in data/README.md: a short source prefix
// plus the source's own record id, or a hash of name and address when the
// source has no id.

import { createHash } from "node:crypto";

/** `<prefix>-<sourceId>`, or `<fallbackPrefix>-<hash of normalized name|address>` without a source id. */
export function siteId(
  prefix: string,
  sourceId: string | null | undefined,
  fallbackPrefix: string,
  name: string | null,
  address: string | null,
): string {
  const id = sourceId?.trim();
  if (id) return `${prefix}-${id}`;
  const key = `${normalize(name)}|${normalize(address)}`;
  return `${fallbackPrefix}-${createHash("sha256").update(key, "utf8").digest("hex").slice(0, 12)}`;
}

/** Concrete batch plants: "tceq-<permit number>", or "cbp-<hash>" without one. */
export function makeId(permitNumber: string | null, name: string | null, address: string | null): string {
  return siteId("tceq", permitNumber, "cbp", name, address);
}

function normalize(s: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
