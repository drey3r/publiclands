import type { Map as MLMap } from "maplibre-gl";

type PaddingOptions = { top: number; bottom: number; left: number; right: number };
import { CA_BOUNDS } from "./config";
import frame from "@/data/ref/ca-frame.json";

/** California's land border (Oregon, Nevada, Arizona, Mexico), thinned for hit tests. */
const BORDER = (frame.border as [number, number][]).filter((_, i, a) => i % 3 === 0 || i === a.length - 1);

export type HomeCamera = { center: [number, number]; zoom: number };

const TILE = 512;
const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;

/** Pixel position of a point for a top-down camera, in a W×H container. */
function project([lng, lat]: [number, number], cam: HomeCamera, W: number, H: number): [number, number] {
  const ws = TILE * 2 ** cam.zoom;
  return [(mercX(lng) - mercX(cam.center[0])) * ws + W / 2, (mercY(lat) - mercY(cam.center[1])) * ws + H / 2];
}

/**
 * The Home camera: California as large as the map allows, top-down, inside the
 * padded box. Floating panels are not avoided here; see roomBeside().
 */
export function homeCamera(m: MLMap, pad: PaddingOptions): HomeCamera {
  const W = m.getContainer().clientWidth;
  const H = m.getContainer().clientHeight;
  // Fit the bounds into the padded box (Web Mercator, no map padding involved).
  const [[w, so], [e, n]] = CA_BOUNDS;
  const bw = mercX(e) - mercX(w), bh = mercY(so) - mercY(n);
  const aw = Math.max(40, W - pad.left - pad.right), ah = Math.max(40, H - pad.top - pad.bottom);
  const zoom = Math.log2(Math.min(aw / (bw * TILE), ah / (bh * TILE)));
  const ws = TILE * 2 ** zoom;
  // The box centre sits (left - right)/2 px off the container centre; move the camera the other way.
  const cx = (mercX(w) + mercX(e)) / 2 - (pad.left - pad.right) / 2 / ws;
  const cy = (mercY(n) + mercY(so)) / 2 - (pad.top - pad.bottom) / 2 / ws;
  return { center: [cx * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180) / Math.PI], zoom };
}

/**
 * How far down a panel whose left edge is at x = `left` can reach at Home
 * before it would cover California (the panel floats over Nevada). Pixels from
 * the top of the map; the full height if California never reaches that far right.
 */
export function roomBeside(m: MLMap, cam: HomeCamera, left: number): number {
  const W = m.getContainer().clientWidth;
  const H = m.getContainer().clientHeight;
  let y = H;
  for (const p of BORDER) {
    const [px, py] = project(p, cam, W, H);
    if (px >= left - 12) y = Math.min(y, py);
  }
  return y;
}

/**
 * Keeps the map on California: no zooming out past Home, and panning stays
 * within the Home view plus a small margin.
 */
export function limitToHome(m: MLMap, cam: HomeCamera) {
  const W = m.getContainer().clientWidth;
  const H = m.getContainer().clientHeight;
  const ws = TILE * 2 ** cam.zoom;
  const cx = mercX(cam.center[0]), cy = mercY(cam.center[1]);
  const margin = 0.12;
  const dx = (W / 2 / ws) * (1 + margin), dy = (H / 2 / ws) * (1 + margin);
  const lng = (x: number) => x * 360 - 180;
  const lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  m.setMinZoom(Math.max(0, cam.zoom - 0.05));
  m.setMaxBounds([[lng(cx - dx), lat(cy + dy)], [lng(cx + dx), lat(cy - dy)]]);
}
