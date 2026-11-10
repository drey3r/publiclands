// Lease kind icons (Set A: gold disc, ink line).
// Glyph paths live in icon-glyphs.json so the map (canvas) and the key (SVG) draw the same thing.
import GLYPHS from "./icon-glyphs.json";
import { LEASE_MARK, LEASE_TIER } from "./legend";
import type { KindKey } from "./types";

export type Glyph = { d: string; fill?: boolean }[];
export const GLYPH = GLYPHS.glyphs as Record<KindKey, Glyph>;
export const KIND_KEYS = Object.keys(GLYPH) as KindKey[];
export const INK = LEASE_MARK.line;

/** Disc colors: Infrastructure is full gold; Roads and bridges and Shoreline protection one step quieter. */
export const DISC = {
  strong: { fill: LEASE_MARK.fill, line: INK, lineAlpha: 1 },
  quiet: { fill: LEASE_TIER[2].fill, line: INK, lineAlpha: 0.7 },
} as const;
export const discOf = (k: KindKey) => (k === "roads" || k === "shore" ? DISC.quiet : DISC.strong);

/** Marker geometry, in a 32-unit box: disc r 14.6 with a 1.6 ring; the 24-grid glyph at 0.9 scale. */
const BOX = 32, R = 14.6, RING = 1.6, G_SCALE = 0.9, G_OFF = 5.2;

export function drawGlyph(g: CanvasRenderingContext2D, glyph: Glyph, color: string, width: number) {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const el of glyph) {
    const p = new Path2D(el.d);
    g.lineWidth = el.fill ? width * 0.6 : width;
    if (el.fill) g.fill(p);
    g.stroke(p);
  }
}

/** Kind marker as ImageData for map.addImage: `size` CSS px, at pixel ratio `pr`. `fill` overrides the disc color. */
export function kindMarker(k: KindKey, size: number, pr: number, fill?: string): ImageData {
  const S = Math.round(size * pr);
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const d = discOf(k);
  g.scale(S / BOX, S / BOX);
  g.beginPath();
  g.arc(BOX / 2, BOX / 2, R, 0, Math.PI * 2);
  g.fillStyle = fill ?? d.fill;
  g.fill();
  g.globalAlpha = d.lineAlpha;
  g.lineWidth = RING;
  g.strokeStyle = d.line;
  g.stroke();
  g.globalAlpha = 1;
  g.translate(G_OFF, G_OFF);
  g.scale(G_SCALE, G_SCALE);
  drawGlyph(g, GLYPH[k], glyphColorOn(fill ?? d.fill), 2);
  return g.getImageData(0, 0, S, S);
}

/** Ink on light fills, cream on dark ones (Color by era or score can make the disc dark). */
export function glyphColorOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, gg, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * gg + 0.114 * b < 120 ? "#faf7f0" : INK;
}
