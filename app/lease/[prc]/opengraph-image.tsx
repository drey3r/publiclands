import { ImageResponse } from "next/og";
import { getLease } from "@/lib/server";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/legend";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Lease site on California public land";

// Simplified California outline (decorative locator, not survey geometry).
const CA: [number, number][] = [
  [-124.21, 42.0], [-120.0, 42.0], [-120.0, 39.0], [-114.63, 35.0], [-114.57, 34.3], [-114.13, 34.27], [-114.72, 32.72],
  [-117.12, 32.53], [-117.25, 32.9], [-117.6, 33.39], [-118.1, 33.74], [-118.41, 33.76], [-118.52, 34.03], [-119.2, 34.15],
  [-119.6, 34.42], [-120.47, 34.45], [-120.64, 34.58], [-120.6, 34.95], [-120.65, 35.15], [-121.0, 35.6], [-121.9, 36.3],
  [-121.95, 36.6], [-121.8, 36.85], [-122.4, 37.2], [-122.51, 37.78], [-123.0, 38.0], [-123.7, 38.9], [-123.84, 39.8],
  [-124.4, 40.43], [-124.1, 41.0], [-124.21, 42.0],
];
const box = { w: 330, h: 420, x0: -124.6, x1: -114.0, y0: 32.4, y1: 42.1 };
const k = Math.cos((37.2 * Math.PI) / 180);
const sx = box.w / ((box.x1 - box.x0) * k);
const sy = box.h / (box.y1 - box.y0);
const s = Math.min(sx, sy);
const proj = ([x, y]: [number, number]) => [((x - box.x0) * k * s).toFixed(1), ((box.y1 - y) * s).toFixed(1)];

export default async function OG({ params }: { params: Promise<{ prc: string }> }) {
  const { prc } = await params;
  const { meta, lease: l } = getLease(decodeURIComponent(prc));
  const title = l ? l.caseStudy?.title ?? l.name : `PRC ${prc}`;
  const color = l ? TYPE_COLOR[l.derived.typeKey] : "#8d887c";
  const at: [number, number] | null = l ? [l.lng, l.lat] : null;
  const [px, py] = at ? proj(at) : ["0", "0"];
  const status = !l ? "" : l.completed ? "Completed" : l.derived.firstTarget ? "Candidate for review" : "Lease site";
  const d = "M" + CA.map((p) => proj(p).join(" ")).join(" L") + " Z";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f4efe4", fontFamily: "serif", padding: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 40 }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: "#56664f", fontWeight: 700 }}>
            California Public Lands Map
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 34, fontSize: 30, color: "#57534a" }}>
            <span>PRC {prc}</span>
            {status && (
              <span style={{ display: "flex", fontSize: 22, padding: "4px 14px", borderRadius: 999, background: l?.completed ? "#56664f" : "#ebe3d3", color: l?.completed ? "#faf7f0" : "#a4553f" }}>{status}</span>
            )}
          </div>
          <div style={{ display: "flex", fontSize: title.length > 40 ? 56 : 68, lineHeight: 1.05, color: "#2b2a26", marginTop: 14, fontWeight: 600 }}>{title}</div>
          {l && (
            <div style={{ display: "flex", fontSize: 26, color: "#57534a", marginTop: 22, lineHeight: 1.35 }}>
              {(l.facts.improvements ?? "").slice(0, 110)}
            </div>
          )}
          <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 12, fontSize: 22, color: "#57534a" }}>
            {l && <div style={{ display: "flex", width: 18, height: 18, borderRadius: 9, background: color }} />}
            {l && <span>{TYPE_LABEL[l.derived.typeKey]} (est.) · {l.derived.county?.value ? `${l.derived.county.value} County` : l.region.value}</span>}
          </div>
          <div style={{ display: "flex", fontSize: 16, color: "#736e63", marginTop: 10 }}>
            {meta.fixture ? "FIXTURE DATA · " : ""}Source: California State Lands Commission lease layer
          </div>
        </div>
        <div style={{ display: "flex", width: 330, alignItems: "center", justifyContent: "center" }}>
          <svg width="330" height="420" viewBox="0 0 330 420">
            <path d={d} fill="#dfe3cf" stroke="#8a9a7b" strokeWidth="2" />
            {at && <circle cx={px} cy={py} r="22" fill="none" stroke="#2b2a26" strokeWidth="3" />}
            {at && <circle cx={px} cy={py} r="10" fill={color} stroke="#faf7f0" strokeWidth="3" />}
          </svg>
        </div>
      </div>
    ),
    size,
  );
}
