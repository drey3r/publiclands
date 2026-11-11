import "server-only";
import fs from "node:fs";
import path from "node:path";

/** "What the records show" for one lease (Finding), from the research export's review files (scripts/sync/review.mjs). */
export type Review = {
  heading: string;
  finding: { kind: string; value: string; summary: string };
  whatWasThere: string | null;
  evidence: { label: string; date: string | null; item: string | null; url: string | null; page: number | null; quote: string }[];
  documents: { date: string | null; item: string | null; title: string; url: string }[];
  method: string | null;
  readOn: string | null;
};
let cache: { mtime: number; byPrc: Record<string, Review> } | null = null;
export function loadReview(prc: string): Review | null {
  const file = path.join(process.cwd(), "data/generated/review.json");
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch { return null; }
  if (!cache || cache.mtime !== mtime) cache = { mtime, byPrc: JSON.parse(fs.readFileSync(file, "utf8")) };
  return cache.byPrc[prc] ?? null;
}
/** Link to a PDF page (most viewers honor #page=). */
export const pageUrl = (url: string, page: number | null) => (page ? `${url}#page=${page}` : url);
