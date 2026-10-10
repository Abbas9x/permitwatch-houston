// Plant ids, following "Building `id`" in data/README.md.

import { createHash } from "node:crypto";

export function makeId(permitNumber: string | null, name: string | null, address: string | null): string {
  const permit = permitNumber?.trim();
  if (permit) return `tceq-${permit}`;
  const key = `${normalize(name)}|${normalize(address)}`;
  return `cbp-${createHash("sha256").update(key, "utf8").digest("hex").slice(0, 12)}`;
}

function normalize(s: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
