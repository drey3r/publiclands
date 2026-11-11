import { NextResponse } from "next/server";

/**
 * How the sea off California is moving now, for the map's wave marks: the surface current (which way
 * and how fast) on a coarse grid, and the swell (where it comes from, its period and height).
 *
 * Source: Open-Meteo's Marine API (https://open-meteo.com/en/docs/marine-weather-api, CC BY 4.0; free
 * for non-commercial use). Its default models here, checked 2026-11-11 against each model asked for by
 * name: currents from Météo-France / Mercator Ocean SMOC (0.08°, includes tides), swell from
 * Météo-France MFWAM (0.08°); both "generated using E.U. Copernicus Marine Service Information".
 * Open-Meteo's own caution applies: coarse numerical models, limited near the coast, not for navigation.
 * The map uses it for the look of the water only.
 *
 * One request for 91 sea points, every 1° from 128°W to the coast and 31°N to 43°N (SEA_ROWS). Land
 * cells are filled from their sea neighbours so the map can read the grid anywhere.
 *
 * Limits: cached for three hours like the clouds (data cache and CDN), so about eight requests a
 * day: 91 × 8 = ~730 calls a day by Open-Meteo's count (each location is one call), on top of the
 * clouds' ~3,200, against the free tier's 10,000 a day, 5,000 an hour and 600 a minute. Only the
 * public deployment asks; a second deployment reads this route from it (see lib/config.ts).
 */

export const dynamic = "force-dynamic";

const CACHE_S = 3 * 3600;
const LON0 = -128;
const LAT0 = 31;
const NX = 12; // to 117°W
const NY = 13; // to 43°N
/** [latitude, easternmost sea point]: every 1° from 128°W to there. */
const SEA_ROWS: [number, number][] = [
  [31, -117], [32, -118], [33, -118], [34, -119], [35, -121], [36, -122], [37, -123],
  [38, -124], [39, -124], [40, -125], [41, -125], [42, -125], [43, -125],
];
const VARS = "ocean_current_velocity,ocean_current_direction,swell_wave_height,swell_wave_direction,swell_wave_period";

type Current = {
  time?: string;
  ocean_current_velocity?: number | null;
  ocean_current_direction?: number | null;
  swell_wave_height?: number | null;
  swell_wave_direction?: number | null;
  swell_wave_period?: number | null;
};

export async function GET() {
  const pts: [number, number][] = [];
  for (const [lat, east] of SEA_ROWS) for (let lon = LON0; lon <= east; lon++) pts.push([lat, lon]);
  try {
    const url =
      "https://marine-api.open-meteo.com/v1/marine" +
      `?latitude=${pts.map((p) => p[0]).join(",")}&longitude=${pts.map((p) => p[1]).join(",")}` +
      `&current=${VARS}&timezone=GMT&forecast_days=1`;
    const res = await fetch(url, { next: { revalidate: CACHE_S } });
    if (!res.ok) throw new Error(`Open-Meteo marine ${res.status}`);
    const body = (await res.json()) as { current?: Current }[];
    if (!Array.isArray(body) || body.length !== pts.length) throw new Error("Open-Meteo marine returned an unexpected number of points");

    // Currents: km/h and the direction the water heads toward → m/s east (u) and north (v).
    const u: (number | null)[] = Array(NX * NY).fill(null);
    const v: (number | null)[] = Array(NX * NY).fill(null);
    let sx = 0, sy = 0, sw = 0, period = 0, height = 0, n = 0, have = 0;
    body.forEach((p, i) => {
      const c = p.current ?? {};
      const at = (pts[i][0] - LAT0) * NX + (pts[i][1] - LON0);
      if (c.ocean_current_velocity != null && c.ocean_current_direction != null) {
        const s = c.ocean_current_velocity / 3.6, d = (c.ocean_current_direction * Math.PI) / 180;
        u[at] = s * Math.sin(d);
        v[at] = s * Math.cos(d);
        have++;
      }
      if (c.swell_wave_direction != null && c.swell_wave_height != null && c.swell_wave_period != null) {
        // The coast-wide swell: mean direction weighted by height (the big swell sets the look).
        const d = (c.swell_wave_direction * Math.PI) / 180, w = Math.max(0.05, c.swell_wave_height);
        sx += w * Math.sin(d);
        sy += w * Math.cos(d);
        sw += w;
        period += c.swell_wave_period;
        height += c.swell_wave_height;
        n++;
      }
    });
    if (have < pts.length / 2 || !n) throw new Error(`Open-Meteo marine: currents at ${have} of ${pts.length} points, swell at ${n}`);
    // Fill the cells with no value (land, and any sea point the model left out) from filled neighbours.
    for (let pass = 0; pass < NX + NY && u.includes(null); pass++) {
      const nu = [...u], nv = [...v];
      for (let j = 0; j < NY; j++)
        for (let i = 0; i < NX; i++) {
          if (u[j * NX + i] != null) continue;
          let a = 0, b = 0, k = 0;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const x = i + di, y = j + dj;
            if (x < 0 || y < 0 || x >= NX || y >= NY || u[y * NX + x] == null) continue;
            a += u[y * NX + x]!; b += v[y * NX + x]!; k++;
          }
          if (k) { nu[j * NX + i] = a / k; nv[j * NX + i] = b / k; }
        }
      u.splice(0, u.length, ...nu);
      v.splice(0, v.length, ...nv);
    }
    const r3 = (x: number | null) => +(x ?? 0).toFixed(3);
    const from = (Math.atan2(sx / sw, sy / sw) * 180) / Math.PI;
    const swell = { from: Math.round((from + 360) % 360), period: +(period / n).toFixed(1), height: +(height / n).toFixed(2) };
    const t = body[0].current?.time ?? "";
    const time = !t || t.endsWith("Z") ? t : `${t}Z`;
    const ageS = time ? (Date.now() - Date.parse(time)) / 1000 : 0;
    const cdnS = ageS > CACHE_S + 1800 ? 120 : CACHE_S;
    console.log(`[ocean] ${time} ${pts.length} points (${have} with currents); swell from ${swell.from}°, ${swell.period} s, ${swell.height} m`);
    return NextResponse.json(
      { time, lat0: LAT0, lon0: LON0, step: 1, nx: NX, ny: NY, u: u.map(r3), v: v.map(r3), swell, source: "Open-Meteo Marine (Météo-France SMOC currents, MFWAM swell; E.U. Copernicus Marine Service Information)" },
      { headers: { "Cache-Control": `public, s-maxage=${cdnS}, stale-while-revalidate=600`, "Access-Control-Allow-Origin": "*" } },
    );
  } catch (e) {
    // The map then draws its own illustrative drift. Never cache a failure.
    return NextResponse.json({ error: e instanceof Error ? e.message : "ocean unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
