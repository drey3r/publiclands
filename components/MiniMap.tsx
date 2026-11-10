"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { baseStyle } from "@/lib/mapStyle";
import { LEASE_MARK } from "@/lib/legend";
import type { TypeKey } from "@/lib/types";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** Small locator map for a lease page, with terrain tilt. */
export default function MiniMap({ points, t, pitch = 50, approximate = false }: { points: [number, number][]; t: TypeKey; pitch?: number; approximate?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const m = new maplibregl.Map({
      container: el.current,
      style: baseStyle(),
      center: points[0],
      zoom: 12.5,
      pitch,
      maxPitch: 75,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    if (points.length > 1)
      m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 50, maxZoom: 13, pitch, duration: 0 });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    m.on("load", () => {
      // Start the compact attribution collapsed (still one tap away via the ⓘ button).
      el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      m.setTerrain({ source: "terrainDem", exaggeration: 1.3 });
      m.setSky({ "sky-color": "#dfe5e0", "horizon-color": "#f4efe4", "fog-color": "#f4efe4", "atmosphere-blend": 0 });
      m.addSource("pts", { type: "geojson", data: { type: "FeatureCollection", features: points.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: {} })) } });
      if (approximate) {
        // Approximate location: a soft area instead of a pin.
        m.addLayer({ id: "pts-approx", type: "circle", source: "pts", paint: { "circle-radius": 46, "circle-color": "rgba(164,85,63,0.12)", "circle-stroke-color": "#a4553f", "circle-stroke-width": 1.5, "circle-pitch-alignment": "map" } });
        return;
      }
      m.addLayer({ id: "pts-halo", type: "circle", source: "pts", paint: { "circle-radius": 13, "circle-color": "rgba(250,247,240,0.5)", "circle-stroke-color": "#2b2a26", "circle-stroke-width": 2 } });
      m.addLayer({ id: "pts", type: "circle", source: "pts", paint: { "circle-radius": 6, "circle-color": LEASE_MARK.fill, "circle-stroke-color": LEASE_MARK.line, "circle-stroke-width": 1.8 } });
    });
    m.getCanvas().setAttribute("aria-label", "Locator map of the lease site");
    return () => m.remove();
  }, [points, t, pitch, approximate]);
  return <div ref={el} style={{ position: "absolute", inset: 0 }} />;
}
