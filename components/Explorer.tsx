"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { ABOUT_URL, BACK_LABEL, BACK_URL, DISCLAIMER, REPO_URL, STORIES, maskFrom, type MaskMode } from "@/lib/config";
import { EMPTY, activeCount, applyFilters, fromQuery, inBounds, kindCounts, kindOf, sortForList, toQuery, withKind, type Filters } from "@/lib/filters";
import type { LayerManifest, LayerName, LeasesPayload, MiniLease, OverlayDef } from "@/lib/types";
import { FilterPanel } from "./FilterPanel";
import { LeaseCard } from "./LeaseCard";
import { LeaseSwatch, MapControls, type LayerToggle, type Preset } from "./MapControls";
import { LAND, NONPROFIT_COLOR, landOf, type LandKey } from "@/lib/legend";
import { PlaceCard, type Place } from "./PlaceCard";
import { SearchBox, type Suggestion } from "./SearchBox";
import { DataLabel, FixtureBadge, ScoreRing, StageTracker, WhatDot, eraLabel, whatLabel } from "./ui";
import type { Bounds, ColorBy } from "./MapView";
import type * as maplibregl from "maplibre-gl";
import { AUTO_PITCH, AUTO_ZOOM, bearingWithin, type Camera, type CameraOverride } from "@/lib/camera";
import { homeCamera, limitToHome, roomBeside } from "@/lib/home";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="absolute inset-0 animate-pulse bg-sand" /> });

const PAGE = 40;
const PLACE_MAX = 60;
/**
 * The layer stack, in panel order; also the ?layers= deep link (plus "open": only land open
 * to the public). Old links: "spaces" means all three kinds of public land.
 */
type ShowKey = "state" | "leases" | "federal" | "local";
const SHOW_KEYS: ShowKey[] = ["state", "leases", "federal", "local"];
const SHOW_LABEL: Record<ShowKey, string> = { state: "State lands", leases: "Lease sites", federal: "Federal lands", local: "Local and nonprofit" };
const LAND_KEYS: LandKey[] = ["state", "federal", "local"];
type View = { show: Record<ShowKey, boolean>; openOnly: boolean };
const ALL_ON: Record<ShowKey, boolean> = { state: true, leases: true, federal: true, local: true };
function viewFromQuery(sp: URLSearchParams): View {
  const raw = sp.get("layers");
  if (!raw) return { show: { ...ALL_ON }, openOnly: false };
  const on = new Set(raw.split(",").map((x) => x.trim()));
  const land = (k: string) => on.has(k) || on.has("spaces");
  return { show: { state: land("state"), leases: on.has("leases"), federal: land("federal"), local: land("local") }, openOnly: on.has("open") };
}
/** One-click views. */
const PRESETS: (Preset & View)[] = [
  { key: "everything", label: "Everything", show: { ...ALL_ON }, openOnly: false },
  { key: "leases", label: "Leases only", show: { state: false, leases: true, federal: false, local: false }, openOnly: false },
  { key: "public", label: "Public lands only", show: { state: true, leases: false, federal: true, local: true }, openOnly: false },
  { key: "parks", label: "Parks only", show: { state: true, leases: false, federal: true, local: true }, openOnly: true },
  { key: "state", label: "State lands only", show: { state: true, leases: false, federal: false, local: false }, openOnly: false },
];
type Sheet = "peek" | "half" | "full";

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
const VIEW_W = 284;
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
  const [countyLines, setCountyLines] = useState(false);
  const [show, setShow] = useState<Record<ShowKey, boolean>>({ ...ALL_ON });
  /** "Parks only": public land CPAD marks Open Access. */
  const [openOnly, setOpenOnly] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(false);
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

  // ---- load data
  useEffect(() => {
    initial.current = new URLSearchParams(window.location.search);
    setFilters(fromQuery(initial.current));
    const v0 = viewFromQuery(initial.current);
    setShow(v0.show);
    setOpenOnly(v0.openOnly);
    setFindParam(initial.current.get("find"));
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
    const q = next.toString().replace(/%2C/gi, ","); // readable deep links: ?layers=state,leases,federal,local
    history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}`);
  }, [filters, selected, show, openOnly]);

  const all = data?.leases ?? [];
  const hasPlaces = !!manifest?.access;
  const byPrc = useMemo(() => new Map(all.map((l) => [l.p, l])), [all]);
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);
  const nKinds = useMemo(() => kindCounts(all), [all]);
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
  const placesInView = useMemo(
    () => openPlaces.filter((p) => show[landOf(p.kind)]).sort((a, b) => (b.acres ?? 0) - (a.acres ?? 0)),
    [openPlaces, show],
  );
  const spacesOn = LAND_KEYS.some((k) => show[k]);
  const land = useMemo(() => ({ groups: LAND_KEYS.filter((k) => show[k]), openOnly }), [show, openOnly]);
  const counties = useMemo(() => [...new Set(all.map((l) => l.c).filter(Boolean) as string[])].sort(), [all]);
  const waterbodies = useMemo(() => {
    const n = new Map<string, number>();
    all.forEach((l) => l.w && n.set(l.w, (n.get(l.w) ?? 0) + 1));
    return [...n].filter(([, c]) => c >= 2 || all.length < 200).map(([w]) => w).sort();
  }, [all]);

  useEffect(() => setLimit(PAGE), [filters, bounds]);

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
      setPinned((x) => (x === p ? x : null));
      if (p) {
        setSelectedPlace(null);
        setShow((v) => ({ ...v, leases: true }));
        if (mobile) setSheet((s) => (s === "peek" ? "half" : s));
        const l = byPrc.get(p);
        if (l && fly) focusLease(l);
        requestAnimationFrame(() => document.getElementById(`card-${p}`)?.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" }));
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
      setSelectedPlace(s.p.id);
      fit(s.p.bbox, 13);
    } else if (s.kind === "geo") {
      if (s.bbox) fit(s.bbox, 13);
      else map.current?.flyTo({ center: s.center, zoom: 11, padding: padding(), duration: reduceMotion() ? 0 : 1400 });
    }
  };

  const sel = selected ? byPrc.get(selected) : null;
  const meta = data?.meta;
  const nActive = activeCount(filters);
  const atStatewide = !bounds || bounds[2] - bounds[0] > 6;

  const counts: Record<ShowKey, number> = { state: landCount.state, leases: inView.length, federal: landCount.federal, local: landCount.local };
  const landLoaded = spacesReady || !hasPlaces;
  const loaded: Record<ShowKey, boolean> = { state: landLoaded, leases: !!data && !!bounds, federal: landLoaded, local: landLoaded };
  const countText = (k: ShowKey) => (loaded[k] ? `${counts[k].toLocaleString()} in view` : "Loading…");
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
    title: k === "leases" ? "State Lands Commission lease sites (source data: one point per lease, approximate)" : `${LAND.find((x) => x.key === k)?.note}. Source data: CPAD's owner level (AGNCY_LEV).`,
    swatch: k === "leases" ? <LeaseSwatch /> : landSwatch(k),
  }));
  const preset = PRESETS.find((x) => x.openOnly === openOnly && SHOW_KEYS.every((k) => x.show[k] === show[k]))?.key ?? "";
  const onPreset = (key: string) => {
    const x = PRESETS.find((y) => y.key === key);
    if (!x) return;
    setShow({ ...x.show });
    setOpenOnly(x.openOnly);
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
      filterCount={nActive}
      presets={PRESETS}
      preset={preset}
      onPreset={onPreset}
      stackNote={stackNote}
      maxHeight={variant === "panel" ? panelMaxH : null}
      counties={countyLines}
      setCounties={setCountyLines}
      datasets={meta?.datasets ?? []}
      kinds={{ counts: nKinds, active: kindOf(filters), onPick: (k) => setFilters((f) => withKind(f, k)) }}
      filters={
        <>
          <FilterPanel f={filters} set={setFilters} counties={counties} waterbodies={waterbodies} methods={meta?.methods ?? {}} />
          <p className="mt-3 text-[12px] text-ink-faint" aria-live="polite">{filtered.length.toLocaleString()} of {all.length.toLocaleString()} lease sites match.</p>
        </>
      }
    />
  );

  // ---- panel contents (shared by desktop sidebar and mobile sheet)
  const panel = (
    <div className="flex h-full flex-col">
      {/* Phones: the view controls sit at the top of the bottom sheet. */}
      {mobile && controls("sheet")}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3" id="list-scroll">
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
        {sel && <SelectedPreview l={sel} onClose={() => setSelected(null)} onFly={() => flyIn(sel.p)} />}
            {show.leases && atStatewide && !filters.q && nActive === 0 && (
              <section aria-label="Featured stories" className="mb-4">
                <h2 className="kicker mb-2">Featured stories</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
                  {STORIES.map((s) => (
                    <button key={s.prc} type="button" onClick={() => playStory(s.prc)} className="card group overflow-hidden text-left hover:border-sage">
                      <div className="relative h-16 bg-[linear-gradient(160deg,#b4c7d2_0%,#dfe3cf_55%,#c9bfa6_100%)]">
                        <svg viewBox="0 0 200 64" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
                          <path d="M0 50 L30 30 L52 42 L80 14 L104 36 L130 20 L160 40 L200 26 L200 64 L0 64Z" fill="#8a9a7b" opacity=".55" />
                          <path d="M0 58 L40 46 L70 52 L110 40 L150 50 L200 44 L200 64 L0 64Z" fill="#56664f" opacity=".5" />
                        </svg>
                        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.kicker === "Completed" ? "bg-sage-deep text-paper" : "bg-paper text-clay"}`}>{s.kicker}</span>
                        <span className="absolute bottom-1.5 right-2 text-[10px] font-semibold text-paper drop-shadow">Fly in →</span>
                      </div>
                      <div className="p-2.5">
                        <div className="text-[11px] font-semibold text-ink-faint">Lake Tahoe · PRC {s.prc}<DataLabel kind={s.kicker === "Completed" ? "finding" : "estimate"} title={s.kicker === "Completed" ? undefined : "Estimate: this map assigns \u201ccandidate for review\u201d; the State Lands Commission does not"} /></div>
                        <div className="text-[14px] font-semibold leading-snug text-ink">{s.title}</div>
                        <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">{s.blurb}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

        {!SHOW_KEYS.some((k) => show[k]) && <div className="card p-4 text-sm text-ink-soft">Everything is switched off. Turn on a layer in {mobile ? "the controls above" : "the panel on the right of the map"}.</div>}

        {spacesOn && (
          <section id="sec-spaces" aria-labelledby="h-spaces" className="mb-6">
            <SectionHead
              id="h-spaces"
              title="Public lands"
              count={placesInView.length}
              loading={!landLoaded}
              note={`${LAND_KEYS.filter((k) => show[k]).map((k) => SHOW_LABEL[k].replace(" lands", "")).join(", ")} land in view${openOnly ? ", open to the public" : ""} (CPAD), largest first.`}
            />
            {!landLoaded && <ListSkeleton />}
            {landLoaded && placesInView.length === 0 && <div className="card p-3 text-[13px] text-ink-soft">None in this view yet. Pan or zoom the map.</div>}
            <ul className="space-y-2">
              {placesInView.slice(0, spacesOpen ? PLACE_MAX : 4).map((p) => (
                <PlaceCard
                  key={p.id}
                  p={p}
                  selected={selectedPlace === p.id}
                  onSelect={(pl) => { setSelectedPlace(pl.id); fit(pl.bbox, 13); }}
                  onFly={(pl) => {
                    setSelectedPlace(pl.id);
                    const [w, so, e, n] = pl.bbox;
                    flyTo3D(`place:${pl.id}`, [[w, so], [e, n]], { label: pl.name });
                  }}
                />
              ))}
            </ul>
            {placesInView.length > 4 && (
              <button type="button" onClick={() => setSpacesOpen((v) => !v)} className="mt-2 w-full rounded-full border border-line bg-paper py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-ink-soft">
                {spacesOpen ? "Show fewer" : `Show ${Math.min(PLACE_MAX, placesInView.length) - 4} more`}
              </button>
            )}
          </section>
        )}

        {show.leases && (
          <section id="sec-leases" aria-labelledby="h-leases" className="mb-6">
            <SectionHead
              id="h-leases"
              title="Leases"
              count={inView.length}
              loading={!loaded.leases}
              note={`State Lands Commission lease sites in view${filtered.length !== all.length ? ` · ${filtered.length.toLocaleString()} match filters` : ""}. Sorted: case studies, candidates, score.`}
            />
            {!loaded.leases && !error && <ListSkeleton />}
            {inView.length === 0 && loaded.leases && (
              <div className="card p-4 text-sm text-ink-soft">
                No lease sites here with these filters. Zoom out or{" "}
                <button className="underline" onClick={() => setFilters(EMPTY)}>clear filters</button>.
              </div>
            )}
            <ul className="space-y-2" aria-label="Lease sites in view">
              {inView.slice(0, limit).map((l) => (
                <LeaseCard key={l.p} l={l} active={hover === l.p} selected={selected === l.p} onHover={setHover} onSelect={(p) => select(p, true)} onFly={flyIn} />
              ))}
            </ul>
            {inView.length > limit && (
              <button type="button" onClick={() => setLimit((n) => n + PAGE * 2)} className="mt-3 w-full rounded-full border border-line bg-paper py-2 text-[13px] font-medium text-ink-soft hover:border-ink-soft">
                Show more ({(inView.length - limit).toLocaleString()} left)
              </button>
            )}
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
            layers={{ ...layers, access: spacesOn }}
            land={land}
            showLeases={show.leases}
            onSpaces={(sp) => {
              setPlaces(sp);
              setSpacesReady(true);
            }}
            manifest={manifest}
            terrain={terrain}
            counties={countyLines}
            overlays={overlays}
            overlayVis={overlayVis}
            hover={hover}
            selected={selected}
            attribution={`${meta?.fixture ? "FIXTURE · " : ""}Leases: <a href="https://www.slc.ca.gov/">California State Lands Commission</a> · Not legal or survey data`}
            onHover={setHover}
            onSelect={(p) => select(p)}
            onSelectPlace={(id) => {
              setSelectedPlace(id);
              if (id) {
                setSpacesOpen(true);
                if (mobile) setSheet("half");
                requestAnimationFrame(() => document.getElementById("sec-spaces")?.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" }));
              }
            }}
            onViewport={setBounds}
            onCreate={onCreate}
            onReady={onReady}
            mask={mask}
            onHome={goHome}
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
                spacesOn ? `Public lands ${landLoaded ? placesInView.length.toLocaleString() : "…"}` : "",
                show.leases ? `Leases ${loaded.leases ? counts.leases.toLocaleString() : "…"}` : "",
              ].filter(Boolean).join(" · ") || "Nothing switched on"
            }>{panel}</BottomSheet>}
      </div>
    </div>
  );
}

function SelectedPreview({ l, onClose, onFly }: { l: MiniLease; onClose: () => void; onFly: () => void }) {
  return (
    <section aria-label={`Selected: PRC ${l.p}`} className="mb-4 rounded-2xl border border-ink/50 bg-white p-3.5 shadow-[0_4px_16px_rgba(43,42,38,0.08)]">
      <div className="flex items-start gap-3">
        <ScoreRing s={l.s} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-ink-faint">
            PRC {l.p}<DataLabel kind="source" />
            {l.x ? <> · Completed<DataLabel kind="finding" /></> : l.f ? <> · Candidate for review<DataLabel kind="estimate" title="Estimate: this map assigns it; the State Lands Commission does not" /></> : null}
          </div>
          <h2 className="text-[16px] font-semibold leading-snug text-ink">{l.n}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-soft">
            <span className="inline-flex items-center gap-1"><WhatDot t={l.t} k={l.k} />{whatLabel(l.t, l.k)}</span>
            <span>{eraLabel(l.e)}</span>
            {l.w && <span>{l.w}</span>}
            <DataLabel kind="estimate" />
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full px-1.5 text-ink-faint hover:text-ink" aria-label="Close selection">✕</button>
      </div>
      <p className="mt-3 text-[11px] font-semibold text-ink-faint">Review stage<DataLabel kind="finding" /></p>
      <div className="mt-1"><StageTracker stage={l.st} completed={!!l.x} /></div>
      <div className="mt-3 flex gap-2">
        <Link href={`/lease/${encodeURIComponent(l.p)}`} className="flex-1 rounded-full bg-ink py-2 text-center text-[13px] font-semibold text-paper hover:bg-ink-soft">Open lease page</Link>
        <button type="button" onClick={onFly} className="rounded-full border border-line px-3 py-2 text-[13px] font-medium text-ink-soft hover:border-ink-soft">Fly in</button>
      </div>
    </section>
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

function ListSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => <li key={i} className="card h-[84px] animate-pulse bg-sand/60" />)}
    </ul>
  );
}

function SectionHead({ id, title, count, note, loading = false }: { id: string; title: string; count: number; note: string; loading?: boolean }) {
  return (
    <div className="sticky top-[-12px] z-20 -mx-4 mb-2 border-b border-line bg-cream px-4 pb-1.5 pt-2">
      <h2 id={id} className="flex items-baseline justify-between text-[15px] font-semibold text-ink">
        {title} <span className="text-[12px] font-medium text-ink-faint" aria-live="polite">{loading ? "Loading…" : `${count.toLocaleString()} in view`}</span>
      </h2>
      <p className="text-[11.5px] text-ink-faint">{note}</p>
    </div>
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
