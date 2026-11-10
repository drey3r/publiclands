// Builds data/ref/ca-frame.json from data/ref/ca-outline.geojson (run once; output is committed).
//   border: California's land border with Oregon, Nevada, Arizona and Mexico (no coastline)
//   area:   the border closed through the Pacific, so it holds California plus its bays and
//           coastal waters. Map labels and bridges are drawn only inside it.
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const g = JSON.parse(fs.readFileSync(path.join(root, "data/ref/ca-outline.geojson"), "utf8"));
const ring = (g.features ? g.features[0].geometry : g).coordinates[0][0];
const near = (x, y) => ring.reduce((b, p, i) => ((p[0] - x) ** 2 + (p[1] - y) ** 2 < (ring[b][0] - x) ** 2 + (ring[b][1] - y) ** 2 ? i : b), 0);
const sw = near(-117.12, 32.53), nw = near(-124.21, 42.0);
if (!(sw < nw)) throw new Error("unexpected ring order");
const border = ring.slice(sw, nw + 1);
const [nwx, nwy] = border.at(-1);
const area = [...border, [-126.5, nwy], [-126.5, 32.25], [-119.6, 32.25], border[0]];
fs.writeFileSync(path.join(root, "data/ref/ca-frame.json"), JSON.stringify({ border, area }));
console.log(`border ${border.length} pts (${nwx}, ${nwy})`);
