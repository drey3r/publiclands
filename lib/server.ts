import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { DataMeta, FullLease } from "./types";

type Full = { meta: DataMeta; leases: FullLease[] };
let cache: { mtime: number; data: Full; byPrc: Map<string, FullLease> } | null = null;

/** Full records written by scripts/sync-data.mjs. Re-read when the file changes (dev). */
export function loadFull() {
  const file = path.join(process.cwd(), "data/generated/leases.full.json");
  const mtime = fs.statSync(file).mtimeMs;
  if (!cache || cache.mtime !== mtime) {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as Full;
    cache = { mtime, data, byPrc: new Map(data.leases.map((l) => [l.prc, l])) };
  }
  return cache;
}

export function getLease(prc: string) {
  const { data, byPrc } = loadFull();
  return { meta: data.meta, lease: byPrc.get(prc) ?? null };
}

/** Other leases near this one (same waterbody first, then nearest), for "nearby" links. */
export function nearby(l: FullLease, n = 4) {
  const { data } = loadFull();
  const k = Math.cos((l.lat * Math.PI) / 180);
  return data.leases
    .filter((o) => o.prc !== l.prc)
    .map((o) => ({ o, d: Math.hypot((o.lng - l.lng) * k, o.lat - l.lat) * 111 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

