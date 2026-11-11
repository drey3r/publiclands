"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { ABOUT_URL, BACK_LABEL, BACK_URL, DISCLAIMER, REPO_URL, STORIES, maskFrom, type MaskMode } from "@/lib/config";
import { EMPTY, activeCount, applyFilters, fromQuery, inBounds, kindCounts, kindOf, sortForList, toQuery, withKind, type Filters } from "@/lib/filters";
import type { LayerManifest, LayerName, LeasesPayload, MiniLease, OverlayDef } from "@/lib/types";
import { LeaseCard } from "./LeaseCard";
import { LeaseSwatch, MapControls, type LayerToggle, type Preset } from "./MapControls";
import { LAND, NONPROFIT_COLOR, landOf, type LandKey } from "@/lib/legend";
import { PlaceCard, type Place } from "./PlaceCard";
import { SearchBox, type Suggestion } from "./SearchBox";
import { FixtureBadge } from "./ui";
import type { Bounds, ColorBy } from "./MapView";
import type * as maplibregl from "maplibre-gl";
import { AUTO_PITCH, AUTO_ZOOM, bearingWithin, type Camera, type CameraOverride } from "@/lib/camera";
import { homeCamera, limitToHome, roomBeside } from "@/lib/home";
import { GLYPH, MARK_GLYPH } from "@/lib/icons";
import { LABEL, MARK, OG_BASE, OG_DEFAULT, OG_FRAME, WELL_GROUPS, footprintWatch, isWatchedLease, leaseWatch, wellWatch, type FormerLease, type Footprint, type OgPart, type OgRecord, type Terminal, type WatchKey, type Well, type WellGroup } from "@/lib/oilgas";
import type { OgData } from "./ogLayers";
import type { OgSel } from "./MapView";
import { MarkIcon } from "./KindIcon";
import { FootprintCard, FormerTable, OgKey, TerminalCard, WatchSummary, WatersKey, WatersSwatch, WellCard, WellDot, recordsFor } from "./OgPanel";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="absolute inset-0 animate-pulse bg-sand" /> });

const PAGE = 40;
/**
 * The layer stack, in panel order; also the ?layers= deep link (plus "open": only land open
 * to the public). Old links: "spaces" means all three kinds of public land.
 */
type ShowKey = "state" | "leases" | "federal" | "local" | "oilgas" | "waters";
const SHOW_KEYS: ShowKey[] = ["state", "leases", "federal", "local", "oilgas", "waters"];
const SHOW_LABEL: Record<ShowKey, string> = { state: "State lands", leases: "Lease sites", federal: "Federal lands", local: "Local and nonprofit", oilgas: "State oil & gas", waters: "State sovereign lands" };
const LAND_KEYS: LandKey[] = ["state", "federal", "local"];
type View = { show: Record<ShowKey, boolean>; openOnly: boolean };
/** The default view. State oil & gas and State sovereign lands start off. */
const ALL_ON: Record<ShowKey, boolean> = { state: true, leases: true, federal: true, local: true, oilgas: false, waters: false };
function viewFromQuery(sp: URLSearchParams): View {
  const raw = sp.get("layers");
  if (!raw) return { show: { ...ALL_ON }, openOnly: false };
  const on = new Set(raw.split(",").map((x) => x.trim()));
  const land = (k: string) => on.has(k) || on.has("spaces");
  return { show: { state: land("state"), leases: on.has("leases"), federal: land("federal"), local: land("local"), oilgas: on.has("oilgas"), waters: on.has("waters") }, openOnly: on.has("open") };
}
/** One-click views. */
const OFF = { oilgas: false, waters: false };
const PRESETS: (Preset & View)[] = [
  { key: "default", label: "Lands and leases", show: { ...ALL_ON }, openOnly: false },
  { key: "leases", label: "Leases only", show: { state: false, leases: true, federal: false, local: false, ...OFF }, openOnly: false },
  { key: "public", label: "Public lands only", show: { state: true, leases: false, federal: true, local: true, ...OFF }, openOnly: false },
  { key: "parks", label: "Parks only", show: { state: true, leases: false, federal: true, local: true, ...OFF }, openOnly: true },
  { key: "state", label: "State lands only", show: { state: true, leases: false, federal: false, local: false, ...OFF }, openOnly: false },
  // Turns the family on and frames the coast (Point Conception to Huntington Beach).
  { key: "oilgas", label: "Oil & gas", show: { state: false, leases: true, federal: false, local: false, oilgas: true, waters: true }, openOnly: false },
  { key: "everything", label: "Everything", show: { state: true, leases: true, federal: true, local: true, oilgas: true, waters: true }, openOnly: false },
];
type Sheet = "peek" | "half" | "full";
/** Left panel: one list at a time (?tab=). Oil & gas appears while that family is on. */
type ListTab = "leases" | "lands" | "oilgas";
const LIST_TABS: ListTab[] = ["leases", "lands", "oilgas"];

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return m;
}

/** Width the view panel takes on the right of the map, plus a margin (desktop). */
const VIEW_W = 312;
/** Bottom-sheet height when collapsed on phones (title + layer toggles + controls button). */
const PEEK = 178;
function viewPanelRight() {
  const el = document.getElementById("view-panel");
  const host = el?.parentElement;
  // Collapsed to a bar (small map, or by hand): it sits over Nevada's top corner; don't reserve a column.
  if (el?.dataset.compact || (host && (host.clientWidth < 760 || host.clientHeight < 540))) return 28;
  const w = el && el.offsetParent ? el.getBoundingClientRect().width : VIEW_W;
  return Math.round(w + 28);
}

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function bboxOf(geom: GeoJSON.Geometry): [number, number, number, number] {
  let b: [number, number, number, number] = [180, 90, -180, -90];
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    } else (c as unknown[]).forEach(walk);
  };
  if ("coordinates" in geom) walk(geom.coordinates);
  return b;
}

export default function Explorer() {
  const [data, setData] = useState<LeasesPayload | null>(null);
  const [manifest, setManifest] = useState<LayerManifest | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<OverlayDef[]>([]);
  const [overlayVis, setOverlayVis] = useState<Record<string, boolean>>({});

  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  /** The public-land unit selected on the map or in the list (its card is pinned to the top of Public lands). */
  const [selPlace, setSelPlace] = useState<Place | null>(null);
  const [tab, setTab] = useState<ListTab>("leases");
  /** Lease chosen by search or link: its card is pinned to the top of the list. */
  const [pinned, setPinned] = useState<string | null>(null);
  /** ?prc= that isn't in the lease layer. */
  const [missingPrc, setMissingPrc] = useState<string | null>(null);
  /** Public spaces arrive from map tiles; until the first batch, counts read "Loading". */
  const [spacesReady, setSpacesReady] = useState(false);
  const [colorBy, setColorBy] = useState<ColorBy>("lease");
  // Public land (access) follows the State / Federal / Local rows; the reference layers start off.
  const [layers, setLayers] = useState<Record<LayerName, boolean>>({ access: true, granted: false, school: false, waterlines: false });
  const [terrain, setTerrain] = useState(false);
  const [clouds, setClouds] = useState(false);
  const [cloudsAt, setCloudsAt] = useState<string | null>(null);
  /** Reference tab: county lines (on by default; ?counties=0 in the link when off) and county names (?cnames=1). */
  const [countyLines, setCountyLines] = useState(true);
  const [countyNames, setCountyNames] = useState(false);
  const countiesView = useMemo(() => ({ lines: countyLines, names: countyNames }), [countyLines, countyNames]);
  const [show, setShow] = useState<Record<ShowKey, boolean>>({ ...ALL_ON });
  /** "Parks only": public land CPAD marks Open Access. */
  const [openOnly, setOpenOnly] = useState(false);
  // ?panelw=520 tries another left-panel width (for choosing one).
  const [panelW] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const n = Number(new URLSearchParams(window.location.search).get("panelw"));
    return n >= 280 && n <= 800 ? n : null;
  });
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState<Sheet>("peek");
  const mobile = useIsMobile();
  const [findParam, setFindParam] = useState<string | null>(null);
  // Read before the map mounts: ?mask=fade|blank|outline compares outside-California treatments.
  const [mask] = useState<MaskMode>(() => (typeof window === "undefined" ? maskFrom(null) : maskFrom(new URLSearchParams(window.location.search).get("mask"))));
  const map = useRef<MLMap | null>(null);
  const initial = useRef<URLSearchParams | null>(null);
  // ---- State oil & gas (fetched the first time the family is switched on)
  const [ogParts, setOgParts] = useState<Record<OgPart, boolean>>({ ...OG_DEFAULT });
  const [ogSel, setOgSel] = useState<OgSel | null>(null);
  const [og, setOg] = useState<{ data: OgData; former: FormerLease[]; records: Record<string, OgRecord[]>; terminalsCaveat: string } | null>(null);
  const ogLoading = useRef(false);

  // ---- load data
  useEffect(() => {
    initial.current = new URLSearchParams(window.location.search);
    setFilters(fromQuery(initial.current));
    const v0 = viewFromQuery(initial.current);
    setShow(v0.show);
    setOpenOnly(v0.openOnly);
    setFindParam(initial.current.get("find"));
    // Clouds: on by default (phones draw one light, still layer); a switch only for readers who prefer reduced motion.
    setClouds(!reduceMotion());
    setCountyLines(initial.current.get("counties") !== "0");
    setCountyNames(initial.current.get("cnames") === "1");
    const t0 = initial.current.get("tab") as ListTab | null;
    if (t0 && LIST_TABS.includes(t0)) setTab(t0);
    fetch("/data/cameras.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setCameras)
      .catch(() => setCameras({}));
    fetch("/data/overlays/index.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((o: OverlayDef[]) => {
        setOverlays(o);
        setOverlayVis(Object.fromEntries(o.map((x) => [x.id, x.visible])));
      })
      .catch(() => setOverlays([]));
    Promise.all([fetch("/data/leases.min.json").then((r) => r.json()), fetch("/data/layers/manifest.json").then((r) => r.json())])
      .then(async ([d, man]: [LeasesPayload, LayerManifest]) => {
        setData(d);
        setManifest(man);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!show.oilgas || og || ogLoading.current) return;
    ogLoading.current = true;
    const j = (f: string) => fetch(`${OG_BASE}/${f}`).then((r) => r.json());
    Promise.all([j("offshore-leases.geojson"), j("state-lease-wells.geojson"), j("marine-oil-terminals.geojson"), j("former-leases.json"), j("records.json"), j("index.json")])
      .then(([footprints, wells, terminals, former, records, index]) => setOg({ data: { footprints, wells, terminals }, former: former.leases, records, terminalsCaveat: index.terminalsCaveat ?? "" }))
      .catch((e) => { ogLoading.current = false; setError(String(e)); });
  }, [show.oilgas, og]);

  // ---- filters → URL (shareable)
  useEffect(() => {
    if (!initial.current) return;
    const qs = toQuery(filters);
    const keep = new URLSearchParams(window.location.search);
    const next = new URLSearchParams(qs);
    next.set("layers", [...SHOW_KEYS.filter((k) => show[k]), ...(openOnly ? ["open"] : [])].join(",") || "none");
    for (const k of ["mask", "panelw"]) if (keep.get(k)) next.set(k, keep.get(k)!);
    if (selected) next.set("prc", selected);
    else keep.delete("prc");
    if (tab !== "leases") next.set("tab", tab);
    if (!countyLines) next.set("counties", "0");
    if (countyNames) next.set("cnames", "1");
    const q = next.toString().replace(/%2C/gi, ","); // readable deep links: ?layers=state,leases,federal,local
    history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}`);
  }, [filters, selected, show, openOnly, tab, countyLines, countyNames]);

  const all = data?.leases ?? [];
  const hasPlaces = !!manifest?.access;
  const byPrc = useMemo(() => new Map(all.map((l) => [l.p, l])), [all]);
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);
  const nKinds = useMemo(() => kindCounts(all), [all]);

  // ---- State oil & gas: records per footprint, Worth watching flags, counts
  const fps = useMemo(() => og?.data.footprints.features ?? [], [og]);
  const fpRecords = useMemo(() => new Map(fps.map((f) => [f.properties.prc, og ? recordsFor(f.properties, og.records) : []])), [fps, og]);
  const fpWatch = useMemo(() => new Map(fps.map((f) => [f.properties.prc, footprintWatch(f.properties, fpRecords.get(f.properties.prc) ?? [])])), [fps, fpRecords]);
  const watchFp = useMemo(() => [...fpWatch].filter(([, r]) => r.length).map(([p]) => p), [fpWatch]);
  const wells = useMemo(() => (og?.data.wells.features ?? []) as GeoJSON.Feature<GeoJSON.Point, Well>[], [og]);
  const terminals = useMemo(() => (og?.data.terminals.features ?? []) as GeoJSON.Feature<GeoJSON.Point, Terminal>[], [og]);
  const wellCounts = useMemo(() => {
    const c = Object.fromEntries(WELL_GROUPS.map((g) => [g.key, 0])) as Record<WellGroup, number>;
    for (const w of wells) c[w.properties.statusGroup]++;
    return c;
  }, [wells]);
  const watchCounts = useMemo(() => {
    const c: Record<WatchKey, number> = { nonop: 0, expired: 0, notprod: 0, idle: wellCounts.idle, disagree: 0, nodecom: 0 };
    for (const l of all) for (const r of leaseWatch(l)) c[r.key]++;
    for (const rs of fpWatch.values()) for (const r of rs) c[r.key]++;
    return c;
  }, [all, fpWatch, wellCounts]);
  /** Items Worth watching flags: leases (one in two groups counts once), plus flagged footprints and idle wells when the family is on. */
  const watchLeases = useMemo(() => all.filter(isWatchedLease).length, [all]);
  const ogView = useMemo(() => ({ parts: ogParts, watch: filters.watch, watchFp, selected: ogSel }), [ogParts, filters.watch, watchFp, ogSel]);
  const ogMap = useMemo(() => ({ on: show.oilgas, data: og?.data ?? null, view: ogView }), [show.oilgas, og, ogView]);
  /** Wells, footprints and terminals shown in view (what the State oil & gas row counts). */
  const ogInView = useMemo(() => {
    if (!og || !bounds) return { wells: [] as typeof wells, fps: [] as typeof fps, terminals: 0 };
    const [w, so, e, n] = bounds;
    const inB = ([x, y]: number[]) => x >= w && x <= e && y >= so && y <= n;
    const ws = wells.filter((f) => ogParts[`well-${f.properties.statusGroup}`] && (!filters.watch || f.properties.statusGroup === "idle") && inB(f.geometry.coordinates));
    const fs = fps.filter((f) => {
      if (!ogParts.footprints) return false;
      if (filters.watch && !watchFp.includes(f.properties.prc)) return false;
      const b = bboxOf(f.geometry);
      return b[0] <= e && b[2] >= w && b[1] <= n && b[3] >= so;
    });
    const ts = ogParts.terminals && !filters.watch ? terminals.filter((f) => inB(f.geometry.coordinates)).length : 0;
    return { wells: ws, fps: fs, terminals: ts };
  }, [og, bounds, wells, fps, terminals, ogParts, filters.watch, watchFp]);
  const ogCount = ogInView.wells.length + new Set(ogInView.fps.map((f) => f.properties.recordsKey)).size + ogInView.terminals;
  const deferredFiltered = useDeferredValue(filtered);
  const inView = useMemo(() => {
    const ls = sortForList(inBounds(deferredFiltered, bounds));
    const i = pinned ? ls.findIndex((l) => l.p === pinned) : -1;
    return i > 0 ? [ls[i], ...ls.slice(0, i), ...ls.slice(i + 1)] : ls;
  }, [deferredFiltered, bounds, pinned]);
  // Public spaces in view come from the map's rendered tiles; largest first.
  // Counted per kind of land (what each row of the stack would show), listed for the kinds that are on.
  const openPlaces = useMemo(() => (openOnly ? places.filter((p) => p.access === "Open Access") : places), [places, openOnly]);
  const landCount = useMemo(() => {
    const c: Record<LandKey, number> = { state: 0, federal: 0, local: 0 };
    for (const p of openPlaces) c[landOf(p.kind)]++;
    return c;
  }, [openPlaces]);
  const placesInView = useMemo(() => {
    const ls = openPlaces.filter((p) => show[landOf(p.kind)]).sort((a, b) => (b.acres ?? 0) - (a.acres ?? 0));
    // The selected unit is pinned to the top, even when its outline has moved out of view.
    return selPlace ? [selPlace, ...ls.filter((p) => p.id !== selPlace.id)] : ls;
  }, [openPlaces, show, selPlace]);
  const spacesOn = LAND_KEYS.some((k) => show[k]);
  // One object per real change: MapView's layer effect depends on it, and a fresh object on every render
  // made that effect repaint the map, whose `idle` then set state here again (an endless ~13 redraws a second).
  const mapLayers = useMemo(() => ({ ...layers, access: spacesOn }), [layers, spacesOn]);
  const onSpaces = useCallback((sp: Place[]) => {
    setPlaces(sp);
    setSpacesReady(true);
  }, []);
  const land = useMemo(() => ({ groups: LAND_KEYS.filter((k) => show[k]), openOnly }), [show, openOnly]);
  const counties = useMemo(() => [...new Set(all.map((l) => l.c).filter(Boolean) as string[])].sort(), [all]);
  const waterbodies = useMemo(() => {
    const n = new Map<string, number>();
    all.forEach((l) => l.w && n.set(l.w, (n.get(l.w) ?? 0) + 1));
    return [...n].filter(([, c]) => c >= 2 || all.length < 200).map(([w]) => w).sort();
  }, [all]);

  useEffect(() => setLimit(PAGE), [filters, bounds, tab]);

  // ---- camera helpers
  /**
   * Home: California as large as the map allows, clear of the map buttons (top left)
   * and the bottom sheet on phones. The view panel may float over Nevada but never
   * over California. Also sets the limits: no zooming out past Home, no drifting away.
   */
  const homeView = useCallback(() => {
    const m = map.current;
    if (!m) return null;
    const phone = window.innerWidth < 768;
    const pad = phone ? { top: 12, bottom: PEEK + 8, left: 50, right: 12 } : { top: 18, bottom: 26, left: 58, right: 18 };
    const cam = homeCamera(m, pad);
    limitToHome(m, cam);
    // The view panel floats over Nevada: it ends above California's border, and scrolls inside.
    if (!phone) {
      const W = m.getContainer().clientWidth;
      const top = 12;
      setPanelMaxH(Math.max(230, Math.round(roomBeside(m, cam, W - 12 - VIEW_W) - top - 10)));
    }
    return cam;
  }, []);
  const [panelMaxH, setPanelMaxH] = useState<number | null>(null);
  /** False while the map shows Home; any other move sets it. A resize at Home re-frames Home. */
  const away = useRef(false);
  // ---- Fly in / fly out
  const [cameras, setCameras] = useState<Record<string, CameraOverride>>({});
  /** The view before the first fly-in, for "Back to previous view". */
  const prevView = useRef<{ center: [number, number]; zoom: number; pitch: number; bearing: number; terrain: boolean } | null>(null);
  const [flown, setFlown] = useState<string | null>(null);
  const flySeq = useRef(0);

  const goHome = useCallback(() => {
    prevView.current = null;
    setFlown(null);
    setTerrain(false);
    const cam = homeView();
    const m = map.current;
    if (!cam || !m) return;
    m.easeTo({ ...cam, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduceMotion() ? 0 : 1000 });
    m.once("moveend", () => (away.current = false));
  }, [homeView]);
  const padding = useCallback(
    () => (mobile ? { top: 70, bottom: Math.round(window.innerHeight * 0.45), left: 20, right: 20 } : { top: 40, bottom: 40, left: 40, right: viewPanelRight() }),
    [mobile],
  );

  /**
   * Tilted 3D flight to a site. Camera: data/cameras.json override, then a story
   * camera, then automatic (fixed pitch and zoom, bearing clear of terrain).
   */
  const flyTo3D = useCallback(
    async (key: string, pts: [number, number][], opts: { camera?: Partial<Camera>; duration?: number; label: string }) => {
      const m = map.current;
      if (!m || !pts.length) return;
      const seq = ++flySeq.current;
      if (!prevView.current) {
        const c = m.getCenter();
        prevView.current = { center: [c.lng, c.lat], zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(), terrain };
      }
      if (mobile) setSheet("peek");
      const pad = mobile ? { top: 70, bottom: PEEK + 10, left: 20, right: 20 } : padding();
      const ov = { ...opts.camera, ...cameras[key] };
      let center = ov.center;
      let zoom = ov.zoom;
      if (!center || zoom == null) {
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const bb: [[number, number], [number, number]] = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
        const fitCam = pts.length > 1 ? m.cameraForBounds(bb, { padding: pad, maxZoom: AUTO_ZOOM }) : null;
        const c = fitCam?.center ? (fitCam.center as maplibregl.LngLat) : null;
        center ??= c ? [c.lng, c.lat] : pts[0];
        zoom ??= Math.min(AUTO_ZOOM, fitCam?.zoom ?? AUTO_ZOOM);
      }
      const pitch = ov.pitch ?? AUTO_PITCH;
      const bearing = ov.bearing ?? (await bearingWithin(center, 900, pitch));
      if (seq !== flySeq.current) return; // a newer flight started while we looked at the terrain
      setTerrain(true);
      setFlown(opts.label);
      m.flyTo({ center, zoom, pitch, bearing, padding: pad, duration: reduceMotion() ? 0 : opts.duration ?? 4500, curve: 1.5, essential: true });
    },
    [cameras, mobile, padding, terrain],
  );

  const flyOut = useCallback(() => {
    const m = map.current;
    const v = prevView.current;
    flySeq.current++;
    prevView.current = null;
    setFlown(null);
    if (!m || !v) return;
    setTerrain(v.terrain);
    m.flyTo({ center: v.center, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduceMotion() ? 0 : 2500, essential: true });
  }, []);

  const flyInLease = useCallback(
    (l: MiniLease, duration?: number) => {
      const story = STORIES.find((x) => x.prc === l.p);
      return flyTo3D(l.p, l.pts, { camera: story?.camera, duration, label: `PRC ${l.p}` });
    },
    [flyTo3D],
  );
  const fit = useCallback(
    (b: [number, number, number, number], maxZoom = 13) => map.current?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: padding(), maxZoom, duration: reduceMotion() ? 0 : 1200 }),
    [padding],
  );
  const focusLease = useCallback(
    (l: MiniLease, zoom = 12.5) => {
      const xs = l.pts.map((p) => p[0]), ys = l.pts.map((p) => p[1]);
      if (l.pts.length > 1) fit([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], zoom);
      else map.current?.flyTo({ center: l.pts[0], zoom: Math.max(map.current.getZoom(), zoom), padding: padding(), duration: reduceMotion() ? 0 : 1400 });
    },
    [fit, padding],
  );

  const select = useCallback(
    (p: string | null, fly = false) => {
      setSelected(p);
      // The selected lease's card goes to the top of the Leases list (map and list agree).
      setPinned(p);
      if (p) {
        setOgSel(null);
        setSelectedPlace(null);
        setSelPlace(null);
        setTab("leases");
        setShow((v) => ({ ...v, leases: true }));
        if (mobile) setSheet((s) => (s === "peek" ? "half" : s));
        const l = byPrc.get(p);
        if (l && fly) focusLease(l);
        requestAnimationFrame(() => document.getElementById("list-scroll")?.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }));
      }
    },
    [byPrc, focusLease, mobile],
  );

  const playStory = useCallback(
    (prc: string) => {
      const s = STORIES.find((x) => x.prc === prc);
      if (!s || !map.current) return;
      setFilters(EMPTY);
      setSelected(prc);
      setShow((v) => ({ ...v, leases: true }));
      flyTo3D(prc, [s.camera.center], { camera: s.camera, duration: 7000, label: s.title });
    },
    [flyTo3D],
  );

  /** Fly in to a lease from a card or preview: select it too. */
  const flyIn = useCallback(
    (p: string) => {
      const l = byPrc.get(p);
      if (!l) return;
      setSelected(p);
      setShow((v) => ({ ...v, leases: true }));
      flyInLease(l);
    },
    [byPrc, flyInLease],
  );

  /**
   * The whole outline of a public-land unit, from the map's loaded tiles (a unit is split across tiles; tiles
   * outside the view aren't loaded, so the extent is re-read after each move until it stops growing).
   */
  const placeExtent = useCallback((id: string): [number, number, number, number] | null => {
    const m = map.current;
    const def = manifest?.access;
    if (!m || !def || !m.getSource("ov-access")) return null;
    const feats = m.querySourceFeatures("ov-access", def.kind === "pmtiles" ? { sourceLayer: def.sourceLayer } : undefined);
    let b: [number, number, number, number] | null = null;
    for (const f of feats) {
      const p = f.properties ?? {};
      if (String(p.id ?? p.unitId ?? f.id ?? "") !== id) continue;
      const x = bboxOf(f.geometry);
      b = b ? [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])] : x;
    }
    return b;
  }, [manifest]);
  const fitPlace = useCallback((pl: Place) => {
    const m = map.current;
    if (!m) return;
    let box = pl.bbox;
    let tries = 0;
    const go = (b: [number, number, number, number]) => {
      fit(b, 14);
      m.once("idle", () => {
        const e = placeExtent(pl.id);
        if (!e || tries++ >= 3) return;
        const grew = e[0] < box[0] - 1e-4 || e[1] < box[1] - 1e-4 || e[2] > box[2] + 1e-4 || e[3] > box[3] + 1e-4;
        if (!grew) return;
        box = [Math.min(box[0], e[0]), Math.min(box[1], e[1]), Math.max(box[2], e[2]), Math.max(box[3], e[3])];
        setSelPlace((cur) => (cur && cur.id === pl.id ? { ...cur, bbox: box } : cur));
        go(box);
      });
    };
    go(box);
  }, [fit, placeExtent]);
  /** Select a public-land unit (map click or card): outline on the map, its card at the top of Public lands. */
  const selectPlace = useCallback(
    (pl: Place | null, opts: { fit?: boolean } = {}) => {
      setSelPlace(pl);
      setSelectedPlace(pl?.id ?? null);
      if (!pl) return;
      setSelected(null);
      setPinned(null);
      setOgSel(null);
      setTab("lands");
      if (mobile) setSheet((st) => (st === "peek" ? "half" : st));
      requestAnimationFrame(() => document.getElementById("list-scroll")?.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }));
      if (opts.fit) fitPlace(pl);
    },
    [fitPlace, mobile],
  );

  /** Map created (before tiles load): frame Home and set the limits right away. */
  const onCreate = useCallback(
    (m: MLMap) => {
      map.current = m;
      // `away` turns on with any move that isn't Home itself or a resize (the visitor, a search, a fly-in).
      let quiet = false;
      const jumpHome = () => {
        const c = homeView();
        if (!c) return;
        quiet = true;
        m.jumpTo({ ...c, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
        quiet = false;
        away.current = false;
      };
      m.on("movestart", () => { if (!quiet) away.current = true; });
      jumpHome();
      // Resizes are handled here (trackResize is off): lift the limits so the old ones can't pin the
      // view, resize, then re-frame Home if the visitor hasn't moved, else just reset the limits.
      const ro = new ResizeObserver(() => {
        quiet = true;
        m.setMaxBounds(null);
        m.setMinZoom(0);
        m.resize();
        quiet = false;
        if (!away.current) jumpHome();
        else homeView();
      });
      ro.observe(m.getContainer());
      m.once("remove", () => ro.disconnect());
    },
    [homeView],
  );
  const onReady = useCallback(
    (m: MLMap) => {
      map.current = m;
      const sp = initial.current;
      const story = sp?.get("story");
      const prc = sp?.get("prc");
      if (story) setTimeout(() => playStory(story), 300);
      else if (prc) setTimeout(() => { setSelected(prc); setPinned(prc); }, 0);
    },
    [playStory],
  );

  // Fly to ?prc= once data is in.
  const flewInitial = useRef(false);
  useEffect(() => {
    const prc = initial.current?.get("prc");
    if (flewInitial.current || !prc || !map.current || !byPrc.size || initial.current?.get("story")) return;
    const l = byPrc.get(prc);
    flewInitial.current = true;
    // ?fly=1 (the lease page's Fly in link): straight into 3D.
    if (l) setTab("leases");
    if (l && initial.current?.get("fly") === "1") flyInLease(l, 5000);
    else if (l) focusLease(l);
    else {
      setMissingPrc(prc);
      setSelected(null);
      setPinned(null);
    }
  });

  const scrollListTop = () => requestAnimationFrame(() => document.getElementById("list-scroll")?.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }));

  const onPick = (s: Suggestion) => {
    setMissingPrc(null);
    if (s.kind === "lease") {
      select(s.l.p, true);
      setPinned(s.l.p);
      scrollListTop();
    }
    else if (s.kind === "filter") {
      const next = { ...filters, q: s.q };
      setFilters(next);
      const ls = applyFilters(all, next);
      const pts = ls.flatMap((l) => l.pts);
      if (pts.length) fit([Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))], 12);
    } else if (s.kind === "place") {
      setShow((v) => ({ ...v, [landOf(s.p.kind)]: true }));
      if (s.p.access !== "Open Access") setOpenOnly(false);
      selectPlace(s.p, { fit: true });
    } else if (s.kind === "geo") {
      if (s.bbox) fit(s.bbox, 13);
      else map.current?.flyTo({ center: s.center, zoom: 11, padding: padding(), duration: reduceMotion() ? 0 : 1400 });
    }
  };

  const sel = selected ? byPrc.get(selected) : null;

  // ---- State oil & gas selection: a footprint (also from a former-lease mark or the table), a well, a terminal
  const selectOg = (x: OgSel | null) => {
    setOgSel(x ? (x.kind === "former" ? { kind: "footprint", id: x.id } : x) : null);
    if (x) {
      setSelected(null);
      setSelPlace(null);
      setSelectedPlace(null);
      setTab("oilgas");
      if (mobile) setSheet((st) => (st === "peek" ? "half" : st));
      requestAnimationFrame(() => document.getElementById("list-scroll")?.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }));
    }
  };
  const zoomFootprint = (prc: string) => {
    const key = fps.find((f) => f.properties.prc === prc)?.properties.recordsKey;
    const b = fps.filter((f) => f.properties.recordsKey === key).map((f) => bboxOf(f.geometry));
    if (b.length) fit([Math.min(...b.map((x) => x[0])), Math.min(...b.map((x) => x[1])), Math.max(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))], 13);
  };
  const showFormer = (prc: string) => {
    setShow((v) => ({ ...v, oilgas: true }));
    setOgParts((v) => ({ ...v, footprints: true, former: true }));
    selectOg({ kind: "footprint", id: prc });
    zoomFootprint(prc);
  };
  const ogCard = (() => {
    if (!ogSel || !og || !show.oilgas) return null;
    const close = () => setOgSel(null);
    const zoomPt = (c?: [number, number]) => c && map.current?.flyTo({ center: c, zoom: Math.max(13, map.current.getZoom()), padding: padding(), duration: reduceMotion() ? 0 : 1200 });
    if (ogSel.kind === "footprint") {
      const f = fps.find((x) => x.properties.prc === ogSel.id)?.properties;
      if (!f) return null;
      return <FootprintCard f={f} parcels={fps.filter((x) => x.properties.recordsKey === f.recordsKey).map((x) => x.properties)} records={fpRecords.get(f.prc) ?? []} reasons={filters.watch ? fpWatch.get(f.prc) ?? [] : []} onClose={close} onZoom={() => zoomFootprint(f.prc)} />;
    }
    if (ogSel.kind === "well") {
      const w = wells.find((x) => x.properties.api === ogSel.id);
      if (!w) return null;
      return <WellCard w={w.properties} reasons={filters.watch ? wellWatch(w.properties) : []} onClose={close} onZoom={() => zoomPt(w.geometry.coordinates as [number, number])} />;
    }
    const t = terminals.find((x) => x.properties.berth === ogSel.id);
    if (!t) return null;
    return <TerminalCard berths={terminals.filter((x) => x.properties.wo === t.properties.wo).map((x) => x.properties)} caveat={og.terminalsCaveat} onClose={close} onZoom={() => zoomPt(t.geometry.coordinates as [number, number])} />;
  })();
  const meta = data?.meta;
  const nActive = activeCount(filters);
  const atStatewide = !bounds || bounds[2] - bounds[0] > 6;

  const counts: Record<ShowKey, number> = { state: landCount.state, leases: inView.length, federal: landCount.federal, local: landCount.local, oilgas: ogCount, waters: 0 };
  const landLoaded = spacesReady || !hasPlaces;
  const loaded: Record<ShowKey, boolean> = { state: landLoaded, leases: !!data && !!bounds, federal: landLoaded, local: landLoaded, oilgas: !!og && !!bounds, waters: true };
  const countText = (k: ShowKey) => (k === "waters" ? "Reference" : loaded[k] ? `${counts[k].toLocaleString()} in view` : "Loading…");
  const toggle = (k: ShowKey) => setShow((v) => ({ ...v, [k]: !v[k] }));
  const landSwatch = (k: LandKey) => {
    const c = LAND.find((x) => x.key === k)!.color;
    return k === "local" ? (
      <span className="flex h-3.5 w-4 overflow-hidden rounded-[3px] border border-[#3f5e3f]/60"><span className="flex-1" style={{ background: c }} /><span className="flex-1" style={{ background: NONPROFIT_COLOR }} /></span>
    ) : (
      <span className="h-3.5 w-4 rounded-[3px] border border-[#3f5e3f]/60" style={{ background: c }} />
    );
  };

  const toggles: LayerToggle[] = SHOW_KEYS.map((k) => ({
    key: k,
    label: SHOW_LABEL[k],
    on: show[k],
    status: countText(k),
    onToggle: () => toggle(k),
    title:
      k === "leases" ? "State Lands Commission lease sites (source data: one point per lease, approximate)"
      : k === "oilgas" ? "Offshore oil and gas lease footprints, former leases and marine oil terminals (CSLC); oil and gas wells on state leases (CalGEM)"
      : k === "waters" ? LABEL.waters
      : `${LAND.find((x) => x.key === k)?.note}. Source data: CPAD's owner level (AGNCY_LEV).`,
    swatch: k === "leases" ? <LeaseSwatch /> : k === "oilgas" ? <MarkIcon glyph={GLYPH.oilgas} st={MARK.terminal} size={16} /> : k === "waters" ? <WatersSwatch /> : landSwatch(k as LandKey),
    legend:
      k === "oilgas" ? (
        <OgKey
          parts={ogParts}
          setPart={(part, on) => setOgParts((v) => ({ ...v, [part]: on }))}
          counts={{
            footprints: fps.filter((f) => f.properties.group === "production").length,
            comp: fps.filter((f) => f.properties.group === "compensatory").length,
            former: fps.filter((f) => f.properties.former).length,
            formerAll: og?.former.length ?? 0,
            terminals: terminals.length,
            wells: wellCounts,
          }}
        />
      ) : k === "waters" ? <WatersKey /> : undefined,
  }));
  const preset = PRESETS.find((x) => x.openOnly === openOnly && SHOW_KEYS.every((k) => x.show[k] === show[k]))?.key ?? "";
  const onPreset = (key: string) => {
    const x = PRESETS.find((y) => y.key === key);
    if (!x) return;
    setShow({ ...x.show });
    setOpenOnly(x.openOnly);
    if (key === "oilgas") fit(OG_FRAME, 10);
  };
  const stackNote = openOnly ? (
    <p className="text-[11.5px] text-ink-soft">
      Only land open to the public (CPAD access).{" "}
      <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setOpenOnly(false)}>Show all</button>
    </p>
  ) : null;

  const setTerrain3D = (t: boolean) => {
    setTerrain(t);
    if (t && map.current && map.current.getPitch() < 30) map.current.easeTo({ pitch: 55, duration: reduceMotion() ? 0 : 900 });
    if (!t && map.current) map.current.easeTo({ pitch: 0, bearing: 0, duration: reduceMotion() ? 0 : 600 });
  };

  const controls = (variant: "panel" | "sheet") => (
    <MapControls
      variant={variant}
      toggles={toggles}
      colorBy={colorBy}
      setColorBy={setColorBy}
      leasesOn={show.leases}
      layers={layers}
      setLayers={setLayers}
      manifest={manifest}
      overlays={overlays}
      overlayVis={overlayVis}
      setOverlayVis={setOverlayVis}
      terrain={terrain}
      setTerrain={setTerrain3D}
      clouds={clouds}
      setClouds={setClouds}
      cloudsAt={cloudsAt}
      filterCount={nActive}
      presets={PRESETS}
      preset={preset}
      onPreset={onPreset}
      stackNote={stackNote}
      maxHeight={variant === "panel" ? panelMaxH : null}
      counties={countyLines}
      setCounties={setCountyLines}
      countyNames={countyNames}
      setCountyNames={setCountyNames}
      datasets={meta?.datasets ?? []}
      kinds={{ counts: nKinds, active: kindOf(filters), onPick: (k) => setFilters((f) => withKind(f, k)) }}
      watch={{ on: filters.watch, set: (on) => setFilters((f) => ({ ...f, watch: on })), total: watchLeases + (show.oilgas ? watchFp.length + watchCounts.idle : 0) }}
      filterProps={{ f: filters, set: setFilters, counties, waterbodies, methods: meta?.methods ?? {} }}
      matchText={`${filtered.length.toLocaleString()} of ${all.length.toLocaleString()} lease sites match.`}
      onClearFilters={() => setFilters((f) => ({ ...EMPTY, q: f.q }))}
    />
  );

  // ---- left panel: one list at a time, in tabs (shared by desktop sidebar and mobile sheet)
  const tabs: { key: ListTab; label: string; count: number | null; on: boolean }[] = [
    { key: "leases", label: "Leases", count: loaded.leases ? inView.length : null, on: show.leases },
    { key: "lands", label: "Public lands", count: landLoaded ? placesInView.length : null, on: spacesOn },
    ...(show.oilgas ? [{ key: "oilgas" as ListTab, label: "Oil & gas", count: loaded.oilgas ? ogCount : null, on: true }] : []),
  ];
  const curTab: ListTab = tab === "oilgas" && !show.oilgas ? "leases" : tab;
  const tabBar = (
    <div role="tablist" aria-label="Lists" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-cream px-3 pt-2 md:px-4">
      {tabs.map((t) => (
        <button
          key={t.key}
          id={`list-tab-${t.key}`}
          type="button"
          role="tab"
          aria-selected={curTab === t.key}
          aria-controls="list-scroll"
          onClick={() => { setTab(t.key); scrollListTop(); }}
          className={`-mb-px flex min-h-11 items-center gap-2 whitespace-nowrap rounded-t-xl border font-semibold transition-colors ${tabs.length > 2 ? (mobile ? "min-w-0 flex-1 flex-col justify-center gap-0.5 px-1 py-1 text-[13px]" : "px-2.5 text-[13.5px]") : "px-3.5 text-[14.5px]"} ${curTab === t.key ? "border-line border-b-cream bg-cream text-ink" : "border-transparent text-ink-soft hover:text-ink"} ${t.on ? "" : "opacity-60"}`}
        >
          {t.label}
          <span className={`rounded-full px-2 py-0.5 text-[12px] tabular-nums ${curTab === t.key ? "bg-ink text-paper" : "bg-sand text-ink-soft"}`} aria-live="polite">{t.count == null ? "…" : tabs.length > 2 && mobile && t.count >= 10000 ? `${Math.round(t.count / 1000)}k` : t.count.toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
  const offCard = (what: string, turnOn: () => void) => (
    <div className="card p-4 text-[13.5px] text-ink-soft">
      {what} {what.endsWith("s") ? "are" : "is"} switched off on the map.{" "}
      <button type="button" onClick={turnOn} className="font-semibold text-ink underline underline-offset-2">Turn on</button>
    </div>
  );
  const listNote = (t: string) => <p className="mb-2.5 text-[12px] text-ink-faint">{t}</p>;
  const panel = (
    <div className="flex h-full flex-col">
      {/* Phones: the view controls sit at the top of the bottom sheet. */}
      {mobile && controls("sheet")}
      {tabBar}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3" id="list-scroll" role="tabpanel" aria-labelledby={`list-tab-${curTab}`}>
        {error && <p className="rounded-lg bg-clay/10 p-3 text-sm text-clay">Could not load map data: {error}</p>}
        {missingPrc && (
          <div role="alert" className="mb-4 rounded-2xl border border-clay/40 bg-clay/5 p-3.5 text-[13px]">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-ink">PRC {missingPrc} isn&apos;t in the lease layer.</p>
              <button type="button" onClick={() => setMissingPrc(null)} className="rounded-full px-1.5 text-ink-faint hover:text-ink" aria-label="Dismiss">✕</button>
            </div>
            <p className="mt-1 text-ink-soft">
              This map shows the State Lands Commission&apos;s public lease layer{meta?.file ? ` (snapshot ${meta.file.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ""})` : ""}. The number may be mistyped, or the lease may have ended or not be mapped. Search above for another PRC or a place.
            </p>
          </div>
        )}
        {filters.watch && curTab !== "lands" && <WatchSummary counts={watchCounts} ogOn={show.oilgas} />}

        {curTab === "leases" && (
          <section aria-label="Lease sites in view">
            {!show.leases ? offCard("Lease sites", () => setShow((v) => ({ ...v, leases: true }))) : (
              <>
                {listNote(`State Lands Commission lease sites in view${filtered.length !== all.length ? ` · ${filtered.length.toLocaleString()} of ${all.length.toLocaleString()} match filters` : ""}. Highest screen score first.`)}
                {!loaded.leases && !error && <ListSkeleton />}
                {inView.length === 0 && loaded.leases && (
                  <div className="card p-4 text-sm text-ink-soft">
                    No lease sites here with these filters. Zoom out or{" "}
                    <button className="underline" onClick={() => setFilters(EMPTY)}>clear filters</button>.
                  </div>
                )}
                <ul className="space-y-2" aria-label="Lease sites in view">
                  {inView.slice(0, limit).map((l) => (
                    <LeaseCard key={l.p} l={l} active={hover === l.p} selected={selected === l.p} onHover={setHover} onSelect={(p) => select(p, true)} onFly={flyIn} watch={filters.watch ? leaseWatch(l).map((r) => r.reason) : undefined} />
                  ))}
                </ul>
                {inView.length > limit && (
                  <button type="button" onClick={() => setLimit((n) => n + PAGE * 2)} className="mt-3 min-h-10 w-full rounded-full border border-line bg-paper text-[13px] font-medium text-ink-soft hover:border-ink-soft">
                    Show more ({(inView.length - limit).toLocaleString()} left)
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {curTab === "lands" && (
          <section aria-label="Public lands in view">
            {!spacesOn ? offCard("Public lands", () => setShow((v) => ({ ...v, state: true, federal: true, local: true }))) : (
              <>
                {listNote(`${LAND_KEYS.filter((k) => show[k]).map((k) => SHOW_LABEL[k].replace(" lands", "")).join(", ")} land in view${openOnly ? ", open to the public" : ""} (CPAD), largest first. Click any green area on the map to select it.`)}
                {!landLoaded && <ListSkeleton />}
                {landLoaded && placesInView.length === 0 && <div className="card p-3 text-[13px] text-ink-soft">None in this view yet. Pan or zoom the map.</div>}
                <ul className="space-y-2">
                  {placesInView.slice(0, limit).map((p) => (
                    <PlaceCard
                      key={p.id}
                      p={p}
                      selected={selectedPlace === p.id}
                      onSelect={(pl) => selectPlace(pl, { fit: true })}
                      onFly={(pl) => {
                        selectPlace(pl);
                        const [w, so, e, n] = pl.bbox;
                        flyTo3D(`place:${pl.id}`, [[w, so], [e, n]], { label: pl.name });
                      }}
                    />
                  ))}
                </ul>
                {placesInView.length > limit && (
                  <button type="button" onClick={() => setLimit((n) => n + PAGE * 2)} className="mt-3 min-h-10 w-full rounded-full border border-line bg-paper text-[13px] font-medium text-ink-soft hover:border-ink-soft">
                    Show more ({(placesInView.length - limit).toLocaleString()} left)
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {curTab === "oilgas" && ogCard}
        {curTab === "oilgas" && show.oilgas && (
          <section id="sec-og" aria-label="State oil and gas in view" className="mb-6">
            {listNote(filters.watch ? "Worth watching: flagged footprints and idle wells in view, each with its reason." : "Offshore lease footprints, former leases and marine oil terminals (CSLC); wells on state leases (CalGEM). Click one on the map for its card.")}
            {og && (
              <>
                <ul className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-ink-soft">
                  <li className="flex items-center gap-1.5"><FootprintMini /> Lease footprints <b className="ml-auto tabular-nums text-ink">{new Set(ogInView.fps.map((f) => f.properties.recordsKey)).size}</b></li>
                  <li className="flex items-center gap-1.5"><MarkIcon glyph={MARK_GLYPH.terminal} st={MARK.terminal} size={14} /> Terminals <b className="ml-auto tabular-nums text-ink">{ogInView.terminals}</b></li>
                  {WELL_GROUPS.filter((g) => ogParts[`well-${g.key}`]).map((g) => (
                    <li key={g.key} className="flex items-center gap-1.5"><WellDot g={g.key} /> {g.label} wells <b className="ml-auto tabular-nums text-ink">{ogInView.wells.filter((w) => w.properties.statusGroup === g.key).length.toLocaleString()}</b></li>
                  ))}
                </ul>
                {filters.watch && (
                  <ul className="mb-3 space-y-1.5" aria-label="Worth watching: oil and gas">
                    {[...new Map(ogInView.fps.map((f) => [f.properties.recordsKey, f])).values()].map((f) => (
                      <li key={f.properties.prc}>
                        <button type="button" onClick={() => { selectOg({ kind: "footprint", id: f.properties.prc }); zoomFootprint(f.properties.prc); }} className="card w-full p-2.5 text-left hover:border-sage">
                          <span className="flex items-center text-[13px] font-semibold text-ink">PRC {f.properties.prc}</span>
                          {(fpWatch.get(f.properties.prc) ?? []).map((r) => <span key={r.key} className="block text-[12px] text-ink-soft">{r.reason}</span>)}
                        </button>
                      </li>
                    ))}
                    {ogInView.wells.slice(0, 25).map((w) => (
                      <li key={w.properties.api}>
                        <button type="button" onClick={() => selectOg({ kind: "well", id: w.properties.api, coords: w.geometry.coordinates as [number, number] })} className="card w-full p-2.5 text-left hover:border-sage">
                          <span className="flex items-center text-[13px] font-semibold text-ink">Well {w.properties.leaseName} {w.properties.wellNumber}</span>
                          <span className="block text-[12px] text-ink-soft">CalGEM lists this well as Idle. API {w.properties.api}.</span>
                        </button>
                      </li>
                    ))}
                    {ogInView.wells.length > 25 && <li className="text-[12px] text-ink-faint">{ogInView.wells.length - 25} more idle wells in view; zoom in to see them listed.</li>}
                  </ul>
                )}
                <details className="group">
                  <summary className="cursor-pointer text-[13px] font-semibold text-ink">Former state offshore oil leases ({og.former.length})<span className="ml-1 text-[11.5px] font-normal text-ink-faint">quitclaimed or terminated, from CSLC&apos;s tables</span></summary>
                  <div className="mt-2"><FormerTable former={og.former} records={og.records} onShow={showFormer} /></div>
                </details>
              </>
            )}
            {!og && <ListSkeleton />}
          </section>
        )}

        <SourceNote meta={meta} manifest={manifest} overlays={overlays} />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-cream">
      {/* Header */}
      <header className="relative z-30 flex items-center gap-3 border-b border-line bg-cream/95 px-3 py-2 backdrop-blur md:px-4">
        <Brand />
        <div className="min-w-0 flex-1 md:max-w-md">
          <SearchBox leases={all} places={places} applied={filters.q} onPick={onPick} onClear={() => setFilters((f) => ({ ...f, q: "" }))} autoFind={findParam} />
        </div>
        {meta?.fixture && <span className="hidden lg:inline"><FixtureBadge label={`Fixture data · ${all.length} leases`} /></span>}
        <nav className="ml-auto hidden shrink-0 items-center gap-4 text-[13px] font-medium text-ink-soft md:flex" aria-label="Site">
          {BACK_URL && <a href={BACK_URL} className="underline-offset-2 hover:text-ink hover:underline">← {BACK_LABEL}</a>}
          <a href={ABOUT_URL} className="underline-offset-2 hover:text-ink hover:underline">About</a>
          <a href={REPO_URL} className="underline-offset-2 hover:text-ink hover:underline">Source</a>
        </nav>
      </header>

      {meta?.fixture && (
        <div className="z-20 border-b border-dashed border-clay/50 bg-clay/10 px-4 py-1 text-center text-[12px] text-clay lg:hidden">
          Fixture data: {all.length}-lease development sample, not the full dataset.
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop list */}
        {!mobile && (
          <aside
            className="w-[360px] shrink-0 border-r border-line bg-cream lg:w-[420px] xl:w-[480px]"
            style={panelW ? { width: panelW } : undefined}
            aria-label="Stories, lease sites and places"
          >
            {panel}
          </aside>
        )}

        {/* Map */}
        <div className="relative min-w-0 flex-1">
          <MapView
            leases={filtered}
            colorBy={colorBy}
            layers={mapLayers}
            land={land}
            showLeases={show.leases}
            onSpaces={onSpaces}
            manifest={manifest}
            terrain={terrain}
            clouds={clouds}
            onCloudsTime={setCloudsAt}
            counties={countiesView}
            overlays={overlays}
            overlayVis={overlayVis}
            hover={hover}
            selected={selected}
            attribution={`${meta?.fixture ? "FIXTURE · " : ""}Leases: <a href="https://www.slc.ca.gov/">California State Lands Commission</a> · Not legal or survey data`}
            onHover={setHover}
            onSelect={(p) => select(p)}
            selectedPlace={selPlace}
            onSelectPlace={(pl) => selectPlace(pl)}
            onFlyPlace={(pl) => {
              selectPlace(pl);
              const [w, so, e, n] = pl.bbox;
              flyTo3D(`place:${pl.id}`, [[w, so], [e, n]], { label: pl.name });
            }}
            onFlyLease={flyIn}
            onViewport={setBounds}
            onCreate={onCreate}
            onReady={onReady}
            mask={mask}
            onHome={goHome}
            og={ogMap}
            waters={show.waters}
            onSelectOg={(x) => (x ? selectOg(x) : setOgSel(null))}
          />
          {flown && (
            <button
              type="button"
              onClick={flyOut}
              className="absolute left-1/2 top-3 z-20 max-w-[calc(100%-140px)] -translate-x-1/2 truncate rounded-full border border-ink/20 bg-paper/95 px-4 py-2 text-[13px] font-semibold text-ink shadow-[0_4px_18px_rgba(43,42,38,0.14)] backdrop-blur hover:bg-white md:left-[calc(50%-150px)]"
            >
              ← Back to previous view
            </button>
          )}
          {/* View controls on the right of the map (over Nevada); content on the left. */}
          {!mobile && controls("panel")}
        </div>

        {/* Mobile bottom sheet */}
        {mobile && <BottomSheet state={sheet} setState={setSheet} title={
              [
                show.leases ? `Leases ${loaded.leases ? counts.leases.toLocaleString() : "…"}` : "",
                spacesOn ? `Public lands ${landLoaded ? placesInView.length.toLocaleString() : "…"}` : "",
              ].filter(Boolean).join(" · ") || "Nothing switched on"
            }>{panel}</BottomSheet>}
      </div>
    </div>
  );
}

function SourceNote({ meta, manifest, overlays }: { meta?: LeasesPayload["meta"]; manifest: LayerManifest | null; overlays: OverlayDef[] }) {
  if (!meta) return null;
  const fx = manifest ? (Object.entries(manifest).filter(([, v]) => v?.fixture).map(([k]) => k) as string[]) : [];
  return (
    <footer className="mt-6 space-y-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
      {meta.fixture && <FixtureBadge label={`Fixture: ${meta.counts.leases}-lease sample`} />}
      <p className="text-ink-soft">{meta.source.label}.</p>
      <p>{meta.source.completeness} “Active” is the record status in the layer, not evidence that anything is in use.</p>
      <p>Three labels: <b className="font-semibold text-ink-soft">Source data</b> is the official record; <b className="font-semibold text-ink-soft">Estimate</b> is this map&apos;s classification or score (category, kind, era, region, county, waterbody, score, candidates for review), each with its reason; <b className="font-semibold text-ink-soft">Finding</b> is an editorial determination, such as a case study. The score means “read this file first”, not a finding about any lessee.</p>
      {fx.length > 0 && <p>Placeholder layers (hand-drawn fixture outlines, not survey data): {fx.join(", ")}.</p>}
      {manifest &&
        Object.values(manifest)
          .filter((l) => l && !l.fixture)
          .map((l) => (
            <p key={l!.url}>
              <b className="font-semibold text-ink-soft">{l!.title}</b>: {l!.source}{l!.asOf ? `, ${l!.asOf}` : ""}. {l!.caveat}
            </p>
          ))}
      {manifest && Object.values(manifest).some((l) => l && !l.fixture && /State Lands/.test(l.source ?? "")) && <p>CSLC layers are not legal boundary determinations.</p>}
      {overlays.map((o) => (
        <p key={o.id}>
          <b className="font-semibold text-ink-soft">{o.title}</b> (added layer){o.attribution ? `: ${o.attribution}` : ""}. {o.description}
        </p>
      ))}
      <p className="font-medium text-ink-soft">{DISCLAIMER}</p>
      <p>
        <a href={ABOUT_URL} className="underline underline-offset-2 hover:text-ink">About</a> ·{" "}
        <a href={REPO_URL} className="underline underline-offset-2 hover:text-ink">Source code</a>
        {BACK_URL && <> · <a href={BACK_URL} className="underline underline-offset-2 hover:text-ink">{BACK_LABEL}</a></>}
      </p>
      <p>Basemap © OpenMapTiles © OpenStreetMap contributors via OpenFreeMap. Terrain: AWS Terrain Tiles.</p>
    </footer>
  );
}

function BottomSheet({ state, setState, title, children }: { state: Sheet; setState: (s: Sheet) => void; title: string; children: React.ReactNode }) {
  const heights: Record<Sheet, string> = { peek: `${PEEK}px`, half: "52dvh", full: "calc(100dvh - 64px)" };
  const drag = useRef<{ y: number; h: number } | null>(null);
  const dragged = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const order: Sheet[] = ["peek", "half", "full"];
  return (
    <div
      ref={ref}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-line bg-cream shadow-[0_-8px_30px_rgba(43,42,38,0.14)] transition-[height] duration-200"
      style={{ height: heights[state] }}
      aria-label="Results"
    >
      <button
        type="button"
        className="flex w-full touch-none flex-col items-center gap-1 pb-1 pt-2"
        aria-label={`${title}. ${state === "full" ? "Collapse" : "Expand"} list`}
        onClick={() => {
          if (dragged.current) return void (dragged.current = false);
          setState(order[(order.indexOf(state) + 1) % 3]);
        }}
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, h: ref.current!.getBoundingClientRect().height };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current || !ref.current) return;
          const h = Math.max(96, Math.min(window.innerHeight - 64, drag.current.h - (e.clientY - drag.current.y)));
          ref.current.style.transition = "none";
          ref.current.style.height = `${h}px`;
        }}
        onPointerUp={(e) => {
          if (!drag.current || !ref.current) return;
          const moved = Math.abs(e.clientY - drag.current.y) > 6;
          const h = ref.current.getBoundingClientRect().height;
          ref.current.style.transition = "";
          ref.current.style.height = "";
          drag.current = null;
          if (!moved) return; // click handler cycles
          dragged.current = true;
          const vh = window.innerHeight;
          setState(h < vh * 0.3 ? "peek" : h < vh * 0.72 ? "half" : "full");
        }}
      >
        <span aria-hidden className="h-1.5 w-10 rounded-full bg-line" />
        <span className="text-[13px] font-semibold text-ink">{title}</span>
      </button>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function FootprintMini() {
  return <span aria-hidden className="inline-block h-2.5 w-3.5 shrink-0 rounded-[2px] border border-[#7a5a1e] bg-[#d2b06a]/40" />;
}

function ListSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => <li key={i} className="card h-[84px] animate-pulse bg-sand/60" />)}
    </ul>
  );
}

function Brand() {
  return (
    <a href={ABOUT_URL} className="flex min-w-0 shrink-0 items-center gap-2.5" aria-label="California Public Lands Map: about this project">
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-sage-deep text-[14px] font-bold text-paper">CA</span>
      <span className="hidden min-w-0 flex-col leading-tight sm:flex">
        <span className="display text-[17px] text-ink">California Public Lands Map</span>
        <span className="text-[11.5px] text-ink-faint">State lease records and public spaces, from open data</span>
      </span>
    </a>
  );
}
