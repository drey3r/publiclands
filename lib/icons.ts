// Lease kind icons (Set A: gold disc, ink line), and the State oil & gas marks.
// Glyph paths live in icon-glyphs.json so the map (canvas) and the key (SVG) draw the same thing.
import GLYPHS from "./icon-glyphs.json";
import { LEASE_MARK, LEASE_TIER } from "./legend";
import type { KindKey } from "./types";

export type Glyph = { d: string; fill?: boolean }[];
export const GLYPH = GLYPHS.glyphs as Record<KindKey, Glyph>;
/** State oil & gas marks that are not lease kinds: wellhead and marine oil terminal berth. */
export const MARK_GLYPH = GLYPHS.marks as Record<"well" | "terminal", Glyph>;
export const KIND_KEYS = Object.keys(GLYPH) as KindKey[];
export const INK = LEASE_MARK.line;

/** Disc colors: Infrastructure is full gold; Roads and bridges, Shoreline protection and Oil and gas one step quieter. */
export const DISC = {
  strong: { fill: LEASE_MARK.fill, line: INK, lineAlpha: 1 },
  quiet: { fill: LEASE_TIER[2].fill, line: INK, lineAlpha: 0.7 },
} as const;
export const discOf = (k: KindKey) => (k === "roads" || k === "shore" || k === "oilgas" ? DISC.quiet : DISC.strong);

/** How one marker is drawn: disc fill, ring color and strength, glyph color, dashed ring, overall strength. */
export type MarkStyle = { fill: string; line: string; lineAlpha: number; glyph: string; dashed?: boolean; alpha?: number };

/** Marker geometry, in a 32-unit box: disc r 14.6 with a 1.6 ring; the 24-grid glyph at 0.9 scale. */
const BOX = 32, R = 14.6, RING = 1.6, G_SCALE = 0.9, G_OFF = 5.2;
/** Dashed ring, in box units (the SVG key uses the same). */
export const RING_DASH = [3.2, 2.4];

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

/** Any marker as ImageData for map.addImage: `size` CSS px, at pixel ratio `pr`. */
export function markImage(glyph: Glyph, st: MarkStyle, size: number, pr: number): ImageData {
  const S = Math.round(size * pr);
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.scale(S / BOX, S / BOX);
  g.globalAlpha = st.alpha ?? 1;
  g.beginPath();
  g.arc(BOX / 2, BOX / 2, R, 0, Math.PI * 2);
  g.fillStyle = st.fill;
  g.fill();
  g.globalAlpha = (st.alpha ?? 1) * st.lineAlpha;
  g.lineWidth = RING;
  g.strokeStyle = st.line;
  if (st.dashed) g.setLineDash(RING_DASH);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = st.alpha ?? 1;
  g.translate(G_OFF, G_OFF);
  g.scale(G_SCALE, G_SCALE);
  drawGlyph(g, glyph, st.glyph, 2);
  return g.getImageData(0, 0, S, S);
}

/** Kind marker as ImageData for map.addImage: `size` CSS px, at pixel ratio `pr`. `fill` overrides the disc color. */
export function kindMarker(k: KindKey, size: number, pr: number, fill?: string): ImageData {
  const d = discOf(k);
  return markImage(GLYPH[k], { fill: fill ?? d.fill, line: d.line, lineAlpha: d.lineAlpha, glyph: glyphColorOn(fill ?? d.fill) }, size, pr);
}

/** Ink on light fills, cream on dark ones (Color by era or score can make the disc dark). */
export function glyphColorOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, gg, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * gg + 0.114 * b < 120 ? "#faf7f0" : INK;
}
