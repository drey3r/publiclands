import { GLYPH, INK, discOf } from "@/lib/icons";
import type { KindKey } from "@/lib/types";

/** A lease kind icon as drawn on the map (Set A: gold disc, ink line). Same glyph data as the map. */
export function KindIcon({ k, size = 20, className = "" }: { k: KindKey; size?: number; className?: string }) {
  const d = discOf(k);
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" className={`shrink-0 ${className}`}>
      <circle cx="16" cy="16" r="14.6" fill={d.fill} stroke={d.line} strokeOpacity={d.lineAlpha} strokeWidth="1.6" />
      <g transform="translate(5.2 5.2) scale(0.9)" fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
        {GLYPH[k].map((e, i) => (
          <path key={i} d={e.d} fill={e.fill ? INK : "none"} strokeWidth={e.fill ? 1.2 : 2} />
        ))}
      </g>
    </svg>
  );
}
