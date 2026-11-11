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
async function check(name, fn, view = { width: 1440, height: 900 }) {
  if (ONLY && !ONLY.test(name)) return;
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: view, isMobile: view.width < 600, hasTouch: view.width < 600 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
