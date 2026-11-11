import type { Setting } from "@/lib/settings";

/**
 * A quiet illustrated band along the bottom of a list card (lib/settings.ts picks which).
 * Low contrast, in the map's palette (sage, sand, water, gold), faded in from the top so it never meets the text.
 */
const ART: Record<Setting, React.ReactNode> = {
  mountains: (
    <>
      <path d="M0 40 L0 26 L28 12 L52 24 L84 6 L118 26 L150 14 L176 24 L214 4 L250 24 L282 12 L314 26 L346 10 L376 22 L400 16 L400 40Z" fill="#c9d1bd" />
      <path d="M78 10 L84 6 L90 10 L86 11 L84 9 L81 11Z M208 8 L214 4 L220 8 L216 9 L214 7 L211 9Z M340 14 L346 10 L352 14 L348 15 L346 13 L343 15Z" fill="#faf7f0" />
      <path d="M0 40 L0 32 L40 22 L74 32 L110 20 L148 32 L186 22 L226 32 L262 24 L300 33 L338 23 L372 32 L400 26 L400 40Z" fill="#a9b799" />
    </>
  ),
  desert: (
    <>
      <path d="M0 40 L0 30 L30 30 L36 20 L70 20 L76 30 L160 30 L166 24 L196 24 L202 30 L400 30 L400 40Z" fill="#e6d4b0" />
      <path d="M0 40 L0 34 Q60 26 120 33 T240 32 T360 33 L400 31 L400 40Z" fill="#dcc59a" />
      <path d="M300 30 L300 18 M300 22 L296 18 M300 24 L304 20" stroke="#b9a479" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M342 31 L342 22 M342 25 L339 22" stroke="#b9a479" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  riverlands: (
    <>
      <path d="M0 40 L0 24 Q100 18 200 24 T400 22 L400 40Z" fill="#c9d1bd" />
      <path d="M0 34 Q60 26 130 31 T260 30 T400 28 L400 34 Q330 35 260 36 T130 37 T0 40Z" fill="#c4d4dc" />
      <path d="M40 24 L40 17 M44 24 L45 15 M48 24 L47 18 M250 23 L250 16 M254 23 L255 14 M258 23 L257 17 M352 22 L352 15 M356 22 L357 13" stroke="#97a889" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  farmlands: (
    <>
      <path d="M0 40 L0 24 Q100 14 200 22 T400 18 L400 40Z" fill="#d9d2a6" />
      <path d="M0 40 L0 30 Q120 22 240 29 T400 26 L400 40Z" fill="#c9d1bd" />
      <path d="M0 36 Q120 29 240 35 T400 33 M0 39 Q120 33 240 38 T400 37" stroke="#b6c0a6" strokeWidth="1" fill="none" />
      <path d="M318 22 L318 15 L326 11 L334 15 L334 22Z" fill="#cdb98e" />
    </>
  ),
  ocean: (
    <>
      <path d="M0 40 L0 22 L400 22 L400 40Z" fill="#d3dee3" />
      <path d="M0 28 Q25 24 50 28 T100 28 T150 28 T200 28 T250 28 T300 28 T350 28 T400 28 L400 40 L0 40Z" fill="#bfd0d8" />
      <path d="M0 34 Q25 30 50 34 T100 34 T150 34 T200 34 T250 34 T300 34 T350 34 T400 34 L400 40 L0 40Z" fill="#aec3cd" />
      <path d="M340 22 L352 14 L366 22Z" fill="#c9d1bd" />
    </>
  ),
};

export function SettingBand({ s, className = "" }: { s: Setting; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 40"
      preserveAspectRatio="xMidYMax slice"
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-7 w-full rounded-b-[13px] opacity-70 [mask-image:linear-gradient(to_bottom,transparent,black_45%)] ${className}`}
      data-setting={s}
    >
      {ART[s]}
    </svg>
  );
}
