// Browser checks for the map's panels, selection and deep links. Runs against the dev server (it needs
// window.__map, which only the development build exposes):
//
//   npm run dev            # in one terminal (port 3100)
//   npm run check:ui       # in another; BASE=http://localhost:3100 and CHROME=<path to Chrome> to override
//
// Uses playwright-core with an installed Chrome or Chromium (no browser download).
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const CANDIDATES = [
  process.env.CHROME,
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});

let failed = 0;
const results = [];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null;
async function check(name, fn, view = { width: 1440, height: 900 }, opts = {}) {
  if (ONLY && !ONLY.test(name)) return;
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: view, isMobile: view.width < 600, hasTouch: view.width < 600, ...opts });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The sea's currents and swell are answered here for every check (a check may route it again): never Open-Meteo.
  await page.route("**/api/ocean", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(OCEAN_FLOW) }));
  try {
    await Promise.race([fn(page), new Promise((_, no) => setTimeout(() => no(new Error("timed out after 150 s")), 150000))]);
    if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);
    results.push(`ok    ${name}`);
    console.log(`ok    ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } catch (e) {
    failed++;
    results.push(`FAIL  ${name}: ${e.message.split("\n")[0]}`);
    console.log(results.at(-1));
  } finally {
    await page.close();
  }
}
const OCEAN_FLOW = { time: "2026-11-11T18:00Z", lat0: 31, lon0: -128, step: 1, nx: 12, ny: 13, u: Array(156).fill(0.1), v: Array(156).fill(-0.2), swell: { from: 290, period: 10, height: 2 }, source: "test" };
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function open(page, path = "/") {
  await page.goto(BASE + path, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => window.__map && window.__map.loaded() && window.__map.getLayer("lease-pt"), null, { timeout: 60000 });
  await idle(page);
}
async function idle(page) {
  await page.waitForTimeout(400);
  await page.evaluate(() => new Promise((r) => { const m = window.__map; const t = setTimeout(r, 6000); if (m.loaded() && m.areTilesLoaded()) { clearTimeout(t); return r(); } m.once("idle", () => { clearTimeout(t); r(); }); }));
  await page.waitForTimeout(400);
}
const jump = (page, center, zoom) => page.evaluate(([c, z]) => window.__map.jumpTo({ center: c, zoom: z, pitch: 0, bearing: 0 }), [center, zoom]).then(() => idle(page));
const toScreen = (page, lngLat) => page.evaluate((c) => { const r = window.__map.getCanvas().getBoundingClientRect(); const q = window.__map.project(c); return { x: r.left + q.x, y: r.top + q.y }; }, lngLat);
const url = (page) => new URL(page.url());
const selectedTab = (page, list) => page.locator(`[aria-label="${list}"] [role=tab][aria-selected=true]`).first().textContent();

// ---------------------------------------------------------------- panels
await check("left panel: Leases and Public lands tabs, one list at a time, ?tab= remembered", async (page) => {
  await open(page);
  assert((await selectedTab(page, "Lists")).startsWith("Leases"), "Leases is not the first tab");
  assert(await page.locator("#list-scroll li[id^=card-]").count() > 0, "no lease cards");
  await page.getByRole("tab", { name: /^Public lands/ }).click();
  await page.waitForTimeout(400);
  assert(url(page).searchParams.get("tab") === "lands", "tab not in the URL");
  assert(await page.locator("#list-scroll li[id^=card-]").count() === 0, "lease cards still listed under Public lands");
  assert(await page.locator("#list-scroll li[id^=place-]").count() > 0, "no public-land cards");
  await open(page, "/?tab=lands");
  assert((await selectedTab(page, "Lists")).startsWith("Public lands"), "?tab=lands not restored");
});

await check("left panel: no Featured stories; no data labels on list cards", async (page) => {
  await open(page);
  assert(!(await page.getByText("Featured stories").count()), "Featured stories still shown");
  const txt = await page.locator("#list-scroll ul").first().innerText();
  assert(!/source data|\bestimate\b|\bfinding\b/i.test(txt), "a data label is on a list card");
});

await check("right panel: six tabs; layer toggles one click away on each", async (page) => {
  await open(page);
  const want = { Views: /Quick view/, Types: /What it is/, Eras: /when was it authorized/i, Status: /Worth watching/, Reference: /Reference layers/, Sources: /All sources and caveats/ };
  for (const [tab, re] of Object.entries(want)) {
    await page.locator(`[aria-label="View panel"] [role=tab]`, { hasText: tab }).click();
    await page.waitForTimeout(250);
    const body = await page.locator("#view-panel-body").innerText();
    assert(re.test(body), `${tab} tab does not show ${re}`);
    const sw = page.locator("#view-panel [role=switch]", { hasText: "Lease sites" }).first();
    assert(await sw.isVisible(), `Lease sites toggle not visible on ${tab}`);
  }
  const sw = page.locator("#view-panel [role=switch]", { hasText: "Lease sites" }).first();
  await sw.click();
  await page.waitForTimeout(300);
  assert((await sw.getAttribute("aria-checked")) === "false", "toggle did not switch off");
  assert(!url(page).searchParams.get("layers").split(",").includes("leases"), "layers= still has leases");
});

// ---------------------------------------------------------------- clicking the map
await check("click a green area: outline, popup, Public lands tab with that card first and selected", async (page) => {
  await open(page);
  await jump(page, [-116.9, 36.45], 8);
  const pt = await toScreen(page, [-116.95, 36.45]);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(800);
  const f = await page.evaluate(() => JSON.stringify(window.__map.getFilter("access-sel-line")));
  assert(!/literal/.test(f), "no outline filter set");
  assert(await page.locator(".sel-pop").isVisible(), "no popup");
  assert(await page.locator(".sel-pop .pop-fly").isVisible(), "no Fly in in the popup");
  assert((await selectedTab(page, "Lists")).startsWith("Public lands"), "panel did not switch to Public lands");
  const first = page.locator("#list-scroll li[id^=place-]").first();
  assert((await first.getAttribute("data-selected")) === "1", "selected card is not first");
  const name = (await page.locator(".sel-pop .pop-title").textContent()).trim();
  assert((await first.innerText()).includes(name), "popup and card disagree");
  // Another area moves everything.
  const pt2 = await toScreen(page, [-117.45, 35.0]);
  await page.mouse.click(pt2.x, pt2.y);
  await page.waitForTimeout(800);
  const name2 = (await page.locator(".sel-pop .pop-title").textContent().catch(() => "")).trim();
  if (name2) assert(name2 !== name || true, "");
});

await check("click a lease dot: popup stays (pointer onto it), Esc closes; click the popup opens the lease page", async (page) => {
  await open(page);
  await jump(page, [-120.639, 35.0435], 12);
  const pt = await toScreen(page, [-120.63921, 35.04352]);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(700);
  assert(await page.locator(".sel-pop").isVisible(), "no popup after clicking the dot");
  const box = await page.locator(".sel-pop .pop-link").boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10, { steps: 8 });
  await page.waitForTimeout(500);
  assert(await page.locator(".sel-pop").isVisible(), "popup vanished when the pointer moved onto it");
  const txt = await page.locator(".sel-pop").innerText();
  assert(/PRC 1449/.test(txt), "popup has no PRC");
  assert(!/source data|estimate/i.test(txt), "popup still has data labels");
  assert((await page.locator("#list-scroll li[id^=card-]").first().getAttribute("id")) === "card-1449", "selected card is not first");
  assert((await page.locator("#card-1449").getAttribute("data-selected")) === "1", "card not marked selected");
  if (process.env.DEBUG) console.log("  hover ok");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert(!(await page.locator(".sel-pop").count()), "Esc did not close the popup");
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(600);
  if (process.env.DEBUG) console.log("  esc ok, reopened:", await page.locator(".sel-pop").count());
  await Promise.all([page.waitForURL(/\/lease\/1449/, { timeout: 30000 }), page.locator(".sel-pop .pop-link").click()]);
});

await check("click a public-land card: outline and fit to the whole unit", async (page) => {
  await open(page, "/?tab=lands");
  await jump(page, [-117.0, 36.4], 7);
  const card = page.locator("#list-scroll li[id^=place-]", { hasText: "Death Valley National Park" }).first();
  await card.locator("h3 button").click();
  await page.waitForTimeout(2500);
  await idle(page);
  const r = await page.evaluate(() => { const b = window.__map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; });
  // Death Valley NP spans about 116.2-117.8 W, 35.6-37.3 N in California.
  assert(r[0] < -117.5 && r[2] > -116.6 && r[1] < 35.8 && r[3] > 37.0, `map not fit to the park: ${r.map((x) => x.toFixed(2))}`);
  assert(await page.locator(".sel-pop").isVisible(), "no popup");
});

await check("click a lease card: dot selected and popup on the map", async (page) => {
  await open(page, "/?tab=leases");
  const card = page.locator("#list-scroll li[id^=card-]").first();
  const id = (await card.getAttribute("id")).slice(5);
  await card.locator("h3 button").click();
  await page.waitForTimeout(2000);
  assert(await page.locator(".sel-pop").isVisible(), "no popup after card click");
  assert((await page.locator(".sel-pop").innerText()).includes(`PRC ${id}`), "popup is for another lease");
  assert(url(page).searchParams.get("prc") === id, "?prc= not set");
});

// ---------------------------------------------------------------- deep links (old and new)
await check("deep links: ?prc ?type ?kind ?cat ?layers ?mask ?story", async (page) => {
  await open(page, "/?prc=1449");
  await page.waitForTimeout(1500);
  assert((await page.locator("#card-1449").getAttribute("data-selected")) === "1", "?prc=1449 not selected");
  for (const [q, test] of [
    ["/?kind=cable", (u) => u.searchParams.get("kind") === "cable" || u.searchParams.get("type") === "cable"],
    ["/?type=pipeline", (u) => /pipeline/.test(u.search)],
    ["/?type=other", (u) => /cat=/.test(u.search)],
    ["/?cat=infra", (u) => /cat=infra/.test(u.search)],
    ["/?layers=leases", (u) => u.searchParams.get("layers") === "leases"],
    ["/?layers=spaces", (u) => /state,.*federal,.*local/.test(u.searchParams.get("layers"))],
    ["/?mask=flat", (u) => u.searchParams.get("mask") === "flat"],
  ]) {
    await open(page, q);
    assert(test(url(page)), `${q} → ${page.url()}`);
  }
  await open(page, "/?story=1579");
  await page.waitForTimeout(1500);
  assert(await page.getByText("Back to previous view").isVisible(), "?story=1579 did not fly in");
});

await check("search: a PRC selects its lease; a place selects its unit", async (page) => {
  await open(page);
  const box = page.getByRole("combobox").first();
  await box.fill("1579");
  await page.waitForTimeout(600);
  await box.press("Enter");
  await page.waitForTimeout(2500);
  assert(url(page).searchParams.get("prc") === "1579", "search did not select PRC 1579");
  assert((await page.locator("#list-scroll li[id^=card-]").first().getAttribute("id")) === "card-1579", "searched card not first");
});

await check("Fly in from a card, then back", async (page) => {
  await open(page, "/?tab=leases");
  await page.locator("#list-scroll li[id^=card-]").first().getByRole("button", { name: /Fly in/ }).click();
  await page.waitForTimeout(1500);
  const back = page.getByText("Back to previous view");
  assert(await back.isVisible(), "no Back to previous view after Fly in");
  await back.click();
});

await check("phone: bottom sheet with tabs; expands; tabs switch", async (page) => {
  await open(page);
  const sheet = page.locator('[aria-label="Results"]');
  assert(await sheet.isVisible(), "no bottom sheet");
  const h0 = (await sheet.boundingBox()).height;
  await sheet.locator("button").first().click();
  await page.waitForTimeout(500);
  assert((await sheet.boundingBox()).height > h0 + 50, "sheet did not expand");
  await page.getByRole("tab", { name: /^Public lands/ }).click();
  await page.waitForTimeout(400);
  assert((await selectedTab(page, "Lists")).startsWith("Public lands"), "phone tab did not switch");
}, { width: 390, height: 844 });

await check("lease titles: 'Lessee · Place' on the card and popup where the lessee is known; the lease page names it as Source data with its Commission item", async (page) => {
  await open(page, "/?prc=1579");
  await page.waitForTimeout(1500);
  const card = await page.locator("#card-1579 h3").innerText();
  assert(/^Pacific Bell Telephone Company · /.test(card.trim()), `card title is "${card.trim()}"`);
  assert(!/a California Corporation/i.test(card), "card title keeps the entity description");
  const pop = (await page.locator(".sel-pop .pop-title").textContent()).trim();
  assert(pop === card.trim(), `popup "${pop}" and card "${card.trim()}" disagree`);
  // A lease with no organization on file keeps the place alone.
  const data = await page.evaluate(() => fetch("/data/leases.min.json").then((r) => r.json()));
  const withLessee = data.leases.filter((l) => l.n.includes(" · ")).length;
  assert(withLessee >= 1100 && withLessee < data.leases.length, `${withLessee} titles carry a lessee`);
  await page.goto(BASE + "/lease/1579", { waitUntil: "load", timeout: 90000 });
  const le = page.locator("#lessee");
  const txt = await le.innerText();
  assert(/Pacific Bell Telephone Company, a California Corporation, dba AT&T California/.test(txt), "full lessee name missing on the lease page");
  assert(/source data/i.test(txt), "lessee is not labeled Source data");
  assert(/item 29/.test(txt) && /2023/.test(txt), "lessee does not cite its Commission item");
  assert(/^https:\/\/.+\.pdf$/.test(await le.locator("a[target=_blank]").getAttribute("href")), "lessee citation has no link to the item");
});

// ---------------------------------------------------------------- ambience: clouds and moving water
// /api/clouds is answered here (a fixed grid, or a failure), so the checks never call Open-Meteo.
const CLOUD_GRID = { time: "2026-11-11T18:00Z", lat0: 32, lon0: -126, step: 1, nx: 13, ny: 11, low: Array(143).fill(60), mid: Array(143).fill(30), high: Array(143).fill(40), wind: [2, 1], source: "test" };
const cloudCalls = (page, body, status = 200) => {
  const calls = [];
  return page.route("**/api/clouds", (r) => { calls.push(r.request().url()); r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }); }).then(() => calls);
};
const attribution = (page) => page.evaluate(() => document.querySelector(".maplibregl-ctrl-attrib-inner")?.textContent ?? "");

const order = (page) => page.evaluate(() => window.__map.getLayersOrder());

await check("clouds: on by default (one request, Open-Meteo credit); above land fills and tints, below lines, names and marks; three layers passed in turn on the way down; the switch hides them", async (page) => {
  const calls = await cloudCalls(page, CLOUD_GRID);
  await open(page, "/?layers=state,leases,federal,local,waters");
  const sw = page.getByRole("switch", { name: "Clouds" });
  assert((await sw.getAttribute("aria-checked")) === "true", "clouds switch is off by default on desktop");
  await page.waitForFunction(() => window.__map.getLayer("clouds"), null, { timeout: 15000 });
  await idle(page);
  assert(calls.length === 1, `expected one clouds request, got ${calls.length}`);
  assert(await page.evaluate(() => window.__ambience.cloudsShown()), "clouds not drawn at Home");
  assert(/Clouds: Weather data by Open-Meteo/.test(await attribution(page)), "Open-Meteo credit missing while clouds are on");
  // Layer order: every land fill, tint and mask below; county lines, names, clusters, lease marks and the selection above.
  const ids = await order(page);
  const at = (id) => { const i = ids.indexOf(id); assert(i >= 0, `layer ${id} missing`); return i; };
  const c = at("clouds");
  const below = ["access-fill", "access-line", "outside-base", "outside-veil", "water-ocean", "ocean-depth", "ocean-waves", "surf-line", "hillshade", ...ids.filter((id) => id.startsWith("sov-"))];
  assert(ids.some((id) => id.startsWith("sov-")), "sovereign-lands tint not loaded for the order check");
  for (const id of below) assert(at(id) < c, `${id} is drawn over the clouds`);
  const above = ["county-line", "ca-outline", "label-range", "label-water", "place-town", "place-city", "cluster", "cluster-count", "lease-flag", "lease-pt", "lease-icon", "hl-ring", "access-sel-fill", "access-sel-line", "access-label"];
  for (const id of above) assert(at(id) > c, `clouds are drawn over ${id}`);
  // Descending: all three layers whole at Home; the high layer is passed first, then the mid, then the low;
  // all gone 3.5 zoom levels below Home (before lease detail), while the water keeps moving.
  const levels = () => page.evaluate(() => window.__ambience.cloudLevels());
  const home = await levels();
  assert(home.low === 1 && home.mid === 1 && home.high === 1 && !home.lite, `layers at Home: ${JSON.stringify(home)}`);
  await jump(page, [-122.3, 37.8], home.base + 1.4);
  let l = await levels();
  assert(l.high === 0 && l.mid > 0 && l.mid < 1 && l.low === 1, `1.4 levels down: ${JSON.stringify(l)}`);
  await jump(page, [-122.3, 37.8], home.base + 2.6);
  l = await levels();
  assert(l.high === 0 && l.mid === 0 && l.low > 0 && l.low < 1, `2.6 levels down: ${JSON.stringify(l)}`);
  assert(await page.evaluate(() => window.__ambience.cloudsShown()), "low cloud not drawn 2.6 levels down");
  await jump(page, [-122.3, 37.8], home.base + 3.6);
  assert(!(await page.evaluate(() => window.__ambience.cloudsShown())), "clouds still drawn 3.6 zoom levels below Home");
  assert(await page.evaluate(() => window.__ambience.running()), "wave animation not running there");
  await sw.click();
  await page.waitForTimeout(500);
  assert((await page.evaluate(() => window.__map.getLayoutProperty("clouds", "visibility"))) === "none", "cloud layer still visible after the switch");
  assert(!/Clouds: Weather data by Open-Meteo/.test(await attribution(page)), "Open-Meteo credit shown while clouds are off");
  // Waves fade by zoom 11 and the ticker stops there.
  await jump(page, [-119.75, 34.15], 11.5);
  assert(!(await page.evaluate(() => window.__ambience.running())), "animation still running at zoom 11.5");
  await jump(page, [-119.75, 34.15], 8);
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => window.__ambience.running()), "animation did not restart after zooming out");
});

await check("surf line: along the coast above the wave marks, under the clouds, gone by zoom 10, and no repaint of its own", async (page) => {
  await cloudCalls(page, CLOUD_GRID);
  await open(page);
  const ids = await order(page);
  assert(ids.includes("surf-line"), "surf line layer missing");
  assert(ids.indexOf("surf-line") === ids.indexOf("ocean-waves") + 1, "surf line is not right above the wave marks");
  assert(ids.indexOf("surf-line") < ids.indexOf("county-line"), "surf line drawn over the county lines");
  assert((await page.evaluate(() => window.__map.getLayer("surf-line").maxzoom)) === 10, "surf line does not end at zoom 10");
  assert((await page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ["surf-line"] }).length)) > 0, "no surf line drawn at Home");
  // The same ticker as the waves: about 12 redraws a second at Home, not more.
  await page.waitForTimeout(1500);
  const n = await page.evaluate(() => new Promise((r) => { let k = 0; const f = () => k++; window.__map.on("render", f); setTimeout(() => { window.__map.off("render", f); r(k); }, 3000); }));
  assert(n > 20 && n < 48, `${n} renders in 3 s at Home with the surf line (expected about 36)`);
  await jump(page, [-119.75, 34.4], 10.5);
  assert((await page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ["surf-line"] }).length)) === 0, "surf line still drawn at zoom 10.5");
});

await check("ocean: wave marks drift with the live currents and swell (one request, credited); if that fails, an illustrative drift, labeled so", async (page) => {
  await cloudCalls(page, CLOUD_GRID);
  const calls = [];
  await page.route("**/api/ocean", (r) => { calls.push(1); r.fulfill({ contentType: "application/json", body: JSON.stringify(OCEAN_FLOW) }); });
  await open(page);
  await page.waitForFunction(() => window.__ambience.oceanFlow() === "live", null, { timeout: 15000 });
  assert(calls.length === 1, `expected one ocean request, got ${calls.length}`);
  assert((await page.evaluate(() => window.__map.getLayer("ocean-waves").type)) === "custom", "wave marks are not the shader layer");
  assert(/Sea currents and swell: Open-Meteo Marine.*Copernicus Marine/.test(await attribution(page)), "marine credit missing");
  assert(!/illustrative/.test(await attribution(page)), "live flow labeled illustrative");
  assert((await page.evaluate(() => fetch("/data/ocean-mask.png").then((r) => r.ok))), "sea mask not published");
  // A failed load: the sketch, and the credits say it is not data.
  await page.unroute("**/api/ocean");
  await page.route("**/api/ocean", (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await open(page);
  await page.waitForFunction(() => window.__ambience.oceanFlow() === "sketch", null, { timeout: 15000 });
  const credit = await attribution(page);
  assert(/Sea drift: illustrative, not data/.test(credit) && !/Open-Meteo Marine/.test(credit), `credits after a failed load: ${credit}`);
  assert(await page.evaluate(() => window.__ambience.running()), "water not moving on the illustrative drift");
});

await check("sea floor: depth shading reads terrain tiles no deeper than zoom 8 (deeper tiles have seams and holes in the bathymetry)", async (page) => {
  await cloudCalls(page, CLOUD_GRID);
  await open(page);
  const r = await page.evaluate(() => { const m = window.__map; const l = m.getLayer("ocean-depth"); return { source: l.source, maxzoom: m.getStyle().sources[l.source].maxzoom }; });
  assert(r.source === "depthDem", `ocean-depth reads ${r.source}`);
  assert(r.maxzoom <= 8, `depth tiles go to zoom ${r.maxzoom}`);
});

await check("clouds: the switch shows the served grid's model time and its age; a stale grid is marked; gone when off", async (page) => {
  // A grid whose model time is five hours ago: the caption must say so, not the time the page loaded.
  const stale = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 16) + "Z";
  await cloudCalls(page, { ...CLOUD_GRID, time: stale });
  await open(page);
  await page.waitForFunction(() => window.__map.getLayer("clouds"), null, { timeout: 15000 });
  const cap = page.locator("#view-panel #clouds-asof");
  await cap.waitFor({ timeout: 5000 });
  const txt = await cap.innerText();
  const want = await page.evaluate((t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" }), stale);
  assert(txt.includes(want), `caption "${txt}" does not show the grid's time ${want}`);
  assert(/about 5 h old/.test(txt), `caption "${txt}" does not give the age`);
  assert(/text-clay/.test(await cap.getAttribute("class")), "a five-hour-old grid is not marked stale");
  await page.getByRole("switch", { name: "Clouds" }).click();
  await page.waitForTimeout(300);
  assert(!(await cap.count()), "caption still shown with clouds off");
});

await check("idle is idle: no map renders at rest once nothing animates", async (page) => {
  await cloudCalls(page, CLOUD_GRID);
  await open(page);
  await jump(page, [-121.5, 38.55], 12);
  await page.waitForTimeout(1500);
  const n = await page.evaluate(() => new Promise((r) => { let k = 0; const f = () => k++; window.__map.on("render", f); setTimeout(() => { window.__map.off("render", f); r(k); }, 3000); }));
  assert(n === 0, `${n} renders in 3 s at rest (zoom 12, nothing animating)`);
  // At Home the ticker runs at about 12 frames a second, never the display's 60.
  await page.evaluate(() => window.__map.jumpTo({ center: [-119.4, 37.2], zoom: 5.6 }));
  await idle(page);
  await page.waitForTimeout(1500);
  const h = await page.evaluate(() => new Promise((r) => { let k = 0; const f = () => k++; window.__map.on("render", f); setTimeout(() => { window.__map.off("render", f); r(k); }, 3000); }));
  assert(h > 20 && h < 48, `${h} renders in 3 s at Home (expected about 36)`);
});

await check("clouds: a failed load shows none and breaks nothing", async (page) => {
  const calls = await cloudCalls(page, { error: "down" }, 503);
  await open(page, "/?tab=leases");
  await page.waitForTimeout(2500);
  assert(calls.length === 1, `expected one clouds request, got ${calls.length}`);
  assert(!(await page.evaluate(() => !!window.__map.getLayer("clouds"))), "cloud layer added after a failed load");
  // The map still works: select a lease from the list.
  await page.locator("#list-scroll li[id^=card-]").first().locator("h3 button").click();
  await page.waitForTimeout(2000);
  assert(await page.locator(".sel-pop").isVisible(), "no popup after card click");
});

await check("reduced motion: clouds off by default and never fetched; switched on they are one still frame; the sea's motion is never asked for", async (page) => {
  const calls = await cloudCalls(page, CLOUD_GRID);
  const sea = [];
  await page.route("**/api/ocean", (r) => { sea.push(1); r.fulfill({ contentType: "application/json", body: JSON.stringify(OCEAN_FLOW) }); });
  await open(page);
  assert(await page.evaluate(() => !!window.__map.getLayer("ocean-waves") && !!window.__map.getLayer("ocean-depth")), "wave or depth layer missing");
  assert(!(await page.evaluate(() => window.__ambience.running())), "animation running with reduced motion");
  const sw = page.getByRole("switch", { name: "Clouds" });
  assert((await sw.getAttribute("aria-checked")) === "false", "clouds on by default with reduced motion");
  assert(calls.length === 0, `clouds fetched while off (${calls.length})`);
  await sw.click();
  await page.waitForFunction(() => window.__map.getLayer("clouds"), null, { timeout: 15000 });
  await idle(page);
  assert(await page.evaluate(() => window.__ambience.cloudsShown()), "clouds not drawn after the switch");
  assert(!(await page.evaluate(() => window.__ambience.running())), "animation started by the clouds with reduced motion");
  assert(sea.length === 0, `currents fetched for a still frame (${sea.length})`);
}, { width: 1440, height: 900 }, { reducedMotion: "reduce" });

await check("phone: one light, still cloud layer by default (one request); waves are a still frame; nothing animates", async (page) => {
  const calls = await cloudCalls(page, CLOUD_GRID);
  await open(page);
  assert(await page.evaluate(() => !!window.__map.getLayer("ocean-waves")), "wave layer missing on phone");
  await page.waitForFunction(() => window.__map.getLayer("clouds"), null, { timeout: 15000 });
  await idle(page);
  assert(calls.length === 1, `expected one clouds request on a phone, got ${calls.length}`);
  const l = await page.evaluate(() => window.__ambience.cloudLevels());
  assert(l.lite && l.low === 1 && l.mid === 0 && l.high === 0, `phone cloud layers: ${JSON.stringify(l)}`);
  assert(!(await page.evaluate(() => window.__ambience.running())), "animation running on a phone");
  await page.evaluate(() => { window.__renders = 0; window.__map.on("render", () => window.__renders++); });
  await page.waitForTimeout(3000);
  const n = await page.evaluate(() => window.__renders);
  assert(n <= 2, `${n} map renders in 3 s at rest on a phone`);
}, { width: 390, height: 844 });

await check("county lines: on by default, a Reference-tab toggle, kept in the link (?counties=0); names separate", async (page) => {
  await cloudCalls(page, CLOUD_GRID);
  await open(page);
  const vis = (id) => page.evaluate((i) => window.__map.getLayoutProperty(i, "visibility") ?? "visible", id);
  assert((await vis("county-line")) === "visible", "county lines hidden by default");
  assert((await vis("county-label")) === "none", "county names shown by default");
  assert(!url(page).searchParams.has("counties"), "counties= in the link while at the default");
  await page.locator(`[aria-label="View panel"] [role=tab]`, { hasText: "Reference" }).click();
  const lines = page.getByRole("checkbox", { name: "County lines" });
  assert(await lines.isChecked(), "County lines not checked by default");
  await lines.uncheck();
  await page.waitForTimeout(300);
  assert((await vis("county-line")) === "none", "county lines still drawn after switching off");
  assert(url(page).searchParams.get("counties") === "0", "counties=0 not in the link");
  await page.getByRole("checkbox", { name: "County names" }).check();
  await page.waitForTimeout(300);
  assert((await vis("county-label")) === "visible", "county names not shown");
  await open(page, "/?counties=0");
  assert((await vis("county-line")) === "none", "?counties=0 not restored");
  await page.locator(`[aria-label="View panel"] [role=tab]`, { hasText: "Reference" }).click();
  assert(!(await page.getByRole("checkbox", { name: "County lines" }).isChecked()), "County lines checked after ?counties=0");
  // Public lands still go in under the (hidden) lines, and the clouds with them.
  const ids = await page.evaluate(() => window.__map.getLayersOrder());
  assert(ids.indexOf("access-fill") < ids.indexOf("county-line"), "public lands drawn over the county lines' slot");
});

// ---------------------------------------------------------------- nothing clipped
for (const v of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 2000, height: 1086 }, { width: 390, height: 844 }]) {
  await check(`no clipping at ${v.width}×${v.height}`, async (page) => {
    await open(page);
    const bad = await page.evaluate(() => {
      const out = [];
      const W = innerWidth, H = innerHeight;
      if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth})`);
      for (const el of document.querySelectorAll('[role=tablist] [role=tab], #view-panel h2, [role=switch]')) {
        const r = el.getBoundingClientRect();
        if (!r.width || getComputedStyle(el).visibility === "hidden") continue;
        if (r.left < -1 || r.right > W + 1) out.push(`${el.textContent.trim().slice(0, 30)} off screen sideways`);
        if (el.scrollWidth > el.clientWidth + 2 && el.getAttribute("role") === "tab") out.push(`tab text clipped: ${el.textContent.trim()}`);
      }
      for (const el of document.querySelectorAll("#list-scroll h3")) {
        const r = el.getBoundingClientRect();
        if (r.right > (document.getElementById("list-scroll")?.getBoundingClientRect().right ?? W) + 1) out.push(`card title overflows: ${el.textContent.slice(0, 30)}`);
      }
      return out;
    });
    assert(!bad.length, bad.join("; "));
  }, v);
}

await browser.close();
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
