import { NextResponse } from "next/server";

/**
 * Current cloud cover over California, for the map's cloud layer.
 *
 * Source: Open-Meteo (https://open-meteo.com, CC BY 4.0; free for non-commercial use). In the US its
 * "best match" blends NOAA's HRRR and GFS models. One request asks for low, mid and high cloud cover
 * at every point of a 1° grid (13 × 11 = 143 points) from the Pacific off Cape Mendocino to the
 * Colorado River. The answer is cached for three hours (server data cache and CDN), so the API is
 * asked about eight times a day per deployment however many people open the map. Open-Meteo does not
 * say how a multi-point request is counted; even at one call per point that is ~1,150 a day per
 * deployment, under the free tier's 10,000 a day and 600 a minute. Free tier: non-commercial use only.
 * Nothing is fetched until a reader turns clouds on (they are off by default).
 */

export const dynamic = "force-dynamic";

const CACHE_S = 3 * 3600;
const LAT0 = 32;
const LON0 = -126;
const STEP = 1;
const NX = 13; // -126 … -114
const NY = 11; // 32 … 42

type Point = {
  current?: {
    time?: string;
    cloud_cover_low?: number;
    cloud_cover_mid?: number;
    cloud_cover_high?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
};

export async function GET() {
  const lats: string[] = [];
  const lons: string[] = [];
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      lats.push(String(LAT0 + j * STEP));
      lons.push(String(LON0 + i * STEP));
    }
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lats.join(",")}&longitude=${lons.join(",")}` +
    "&current=cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m" +
    "&wind_speed_unit=ms&timezone=GMT&forecast_days=1";

  try {
    const res = await fetch(url, { next: { revalidate: CACHE_S } });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const body = (await res.json()) as Point[] | Point;
    const pts = Array.isArray(body) ? body : [body];
    if (pts.length !== NX * NY) throw new Error(`Open-Meteo returned ${pts.length} points, expected ${NX * NY}`);

    const low: number[] = [];
    const mid: number[] = [];
    const high: number[] = [];
    let u = 0;
    let v = 0;
    let time = "";
    for (const p of pts) {
      const c = p.current ?? {};
      low.push(Math.round(c.cloud_cover_low ?? 0));
      mid.push(Math.round(c.cloud_cover_mid ?? 0));
      high.push(Math.round(c.cloud_cover_high ?? 0));
      // Meteorological direction is where the wind comes from; u and v point where it goes.
      const s = c.wind_speed_10m ?? 0;
      const d = ((c.wind_direction_10m ?? 270) * Math.PI) / 180;
      u += -s * Math.sin(d);
      v += -s * Math.cos(d);
      if (!time && c.time) time = c.time.endsWith("Z") ? c.time : `${c.time}Z`;
    }
    const n = pts.length;
    return NextResponse.json(
      { time, lat0: LAT0, lon0: LON0, step: STEP, nx: NX, ny: NY, low, mid, high, wind: [+(u / n).toFixed(2), +(v / n).toFixed(2)], source: "Open-Meteo (NOAA HRRR/GFS)" },
      { headers: { "Cache-Control": `public, s-maxage=${CACHE_S}, stale-while-revalidate=86400` } },
    );
  } catch (e) {
    // No clouds is a fine fallback: the map simply draws none. Never cache a failure.
    return NextResponse.json({ error: e instanceof Error ? e.message : "clouds unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
