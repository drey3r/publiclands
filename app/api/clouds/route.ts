import { NextResponse } from "next/server";

/**
 * Current cloud cover over California and well past it, for the map's cloud layer.
 *
 * Source: Open-Meteo (https://open-meteo.com, CC BY 4.0; free for non-commercial use). In the US its
 * "best match" blends NOAA's HRRR and GFS models.
 *
 * Two sets of points are asked for, then merged here into one regular 0.5° grid for the map:
 *   near   every 0.5° over California and its coastal waters (NEAR_ROWS, 278 points), so valley fog,
 *          Sierra cloud and the edge of the marine layer land where the model has them
 *   far    every 3° from 138°W to 102°W and 23°N to 50°N (130 points: the open Pacific, Oregon and
 *          Washington, Nevada, Arizona, northern Mexico), so the clouds never stop at the state line
 *          or at an edge in the ocean on any screen shape
 * About 400 points in all (a few are in both sets and asked once), in batches of 100 a request.
 *
 * Limits: the answer is cached for three hours (server data cache and CDN), so Open-Meteo is asked
 * about eight times a day per deployment however many people open the map. Open-Meteo counts each
 * location in a request as one call: ~400 × 8 = ~3,200 calls a day per deployment (two deployments:
 * ~6,400), under the free tier's 10,000 a day, 5,000 an hour and 600 a minute. Free tier:
 * non-commercial use only. Phones and reduced-motion readers don't ask unless they switch clouds on.
 */

export const dynamic = "force-dynamic";

const CACHE_S = 3 * 3600;
/** The grid the map receives. */
const STEP = 0.5;
const LON0 = -138;
const LON1 = -102;
const LAT0 = 23;
const LAT1 = 50;
const NX = (LON1 - LON0) / STEP + 1; // 73
const NY = (LAT1 - LAT0) / STEP + 1; // 55
const FAR_STEP = 3;
/** Near set: [latitude, west, east], every 0.5° between (California's extent at that latitude, half a degree more to sea). */
const NEAR_ROWS: [number, number, number][] = [
  [32.5, -119.5, -114], [33, -120.5, -114], [33.5, -121, -114], [34, -121, -114], [34.5, -121.5, -114],
  [35, -122, -114], [35.5, -122.5, -114.5], [36, -122.5, -115], [36.5, -123, -115.5], [37, -123, -116.5],
  [37.5, -124, -117], [38, -124, -117.5], [38.5, -124.5, -118.5], [39, -124.5, -119], [39.5, -125, -119.5],
  [40, -125, -119.5], [40.5, -125, -119.5], [41, -125, -119.5], [41.5, -125, -119.5], [42, -125, -119.5],
];
const BATCH = 100;
const VARS = "cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_850hPa,wind_direction_850hPa,wind_speed_300hPa,wind_direction_300hPa";

type Current = {
  time?: string;
  cloud_cover_low?: number;
  cloud_cover_mid?: number;
  cloud_cover_high?: number;
  wind_speed_850hPa?: number;
  wind_direction_850hPa?: number;
  wind_speed_300hPa?: number;
  wind_direction_300hPa?: number;
};
type Point = { current?: Current };

const key = (lat: number, lon: number) => `${lat},${lon}`;

/** Places a few known inland points in the grid, for the server log (do over-land values arrive?). */
const SPOT: [string, number, number][] = [["Sacramento", 38.5, -121.5], ["Fresno", 36.5, -120], ["Tahoe", 39, -120], ["Los Angeles", 34, -118]];

export async function GET() {
  const near: [number, number][] = [];
  for (const [lat, w, e] of NEAR_ROWS) for (let lon = w; lon <= e; lon += STEP) near.push([lat, lon]);
  const nearKeys = new Set(near.map(([la, lo]) => key(la, lo)));
  const far: [number, number][] = [];
  for (let lat = LAT0; lat <= LAT1; lat += FAR_STEP) for (let lon = LON0; lon <= LON1; lon += FAR_STEP) far.push([lat, lon]);
  const pts = [...near, ...far.filter(([la, lo]) => !nearKeys.has(key(la, lo)))];

  try {
    const batches: [number, number][][] = [];
    for (let i = 0; i < pts.length; i += BATCH) batches.push(pts.slice(i, i + BATCH));
    const answers = await Promise.all(
      batches.map(async (b) => {
        const url =
          "https://api.open-meteo.com/v1/forecast" +
          `?latitude=${b.map((p) => p[0]).join(",")}&longitude=${b.map((p) => p[1]).join(",")}` +
          `&current=${VARS}&wind_speed_unit=ms&timezone=GMT&forecast_days=1`;
        const res = await fetch(url, { next: { revalidate: CACHE_S } });
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
        const body = (await res.json()) as Point[] | Point;
        const out = Array.isArray(body) ? body : [body];
        if (out.length !== b.length) throw new Error(`Open-Meteo returned ${out.length} points, expected ${b.length}`);
        return out;
      }),
    );
    const got = new Map<string, Current>();
    answers.flat().forEach((p, i) => got.set(key(pts[i][0], pts[i][1]), p.current ?? {}));

    // Far set → every cell (bilinear); the near set then replaces the cells it has.
    const farAt = (v: (c: Current) => number, lat: number, lon: number) => {
      const fx = Math.min((LON1 - LON0) / FAR_STEP - 1e-9, Math.max(0, (lon - LON0) / FAR_STEP));
      const fy = Math.min((LAT1 - LAT0) / FAR_STEP - 1e-9, Math.max(0, (lat - LAT0) / FAR_STEP));
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
      const g = (di: number, dj: number) => v(got.get(key(LAT0 + (j + dj) * FAR_STEP, LON0 + (i + di) * FAR_STEP)) ?? {});
      return (g(0, 0) * (1 - tx) + g(1, 0) * tx) * (1 - ty) + (g(0, 1) * (1 - tx) + g(1, 1) * tx) * ty;
    };
    const layer = (v: (c: Current) => number) => {
      const out: number[] = [];
      for (let j = 0; j < NY; j++)
        for (let i = 0; i < NX; i++) {
          const lat = LAT0 + j * STEP, lon = LON0 + i * STEP;
          const c = nearKeys.has(key(lat, lon)) ? got.get(key(lat, lon)) : undefined;
          out.push(Math.round(c ? v(c) : farAt(v, lat, lon)));
        }
      return out;
    };
    const low = layer((c) => c.cloud_cover_low ?? 0);
    const mid = layer((c) => c.cloud_cover_mid ?? 0);
    const high = layer((c) => c.cloud_cover_high ?? 0);

    // Mean wind over California at cloud height: 850 hPa (~1.5 km) moves the low and mid cloud,
    // 300 hPa (~9 km) the high cloud. Meteorological direction is where the wind comes from; u and
    // v point where it goes (east, north), m/s.
    const mean = (sp: (c: Current) => number | undefined, dir: (c: Current) => number | undefined): [number, number] => {
      let u = 0, v = 0, n = 0;
      for (const [la, lo] of near) {
        const c = got.get(key(la, lo)) ?? {};
        const s = sp(c), d = dir(c);
        if (s == null || d == null) continue;
        u += -s * Math.sin((d * Math.PI) / 180);
        v += -s * Math.cos((d * Math.PI) / 180);
        n++;
      }
      return n ? [+(u / n).toFixed(2), +(v / n).toFixed(2)] : [3, 0];
    };
    const wind = mean((c) => c.wind_speed_850hPa, (c) => c.wind_direction_850hPa);
    const windHigh = mean((c) => c.wind_speed_300hPa, (c) => c.wind_direction_300hPa);
    const t = answers[0][0].current?.time ?? "";
    const time = !t || t.endsWith("Z") ? t : `${t}Z`;

    console.log(
      `[clouds] ${time} ${pts.length} points; low/mid/high % at ` +
        SPOT.map(([name, la, lo]) => { const c = got.get(key(la, lo)) ?? {}; return `${name} ${c.cloud_cover_low}/${c.cloud_cover_mid}/${c.cloud_cover_high}`; }).join(", ") +
        `; wind 850 hPa ${wind}, 300 hPa ${windHigh} m/s`,
    );
    return NextResponse.json(
      { time, lat0: LAT0, lon0: LON0, step: STEP, nx: NX, ny: NY, low, mid, high, wind, windHigh, source: "Open-Meteo (NOAA HRRR/GFS)" },
      { headers: { "Cache-Control": `public, s-maxage=${CACHE_S}, stale-while-revalidate=86400` } },
    );
  } catch (e) {
    // No clouds is a fine fallback: the map simply draws none. Never cache a failure.
    return NextResponse.json({ error: e instanceof Error ? e.message : "clouds unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
