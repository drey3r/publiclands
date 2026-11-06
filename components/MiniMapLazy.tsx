"use client";

import dynamic from "next/dynamic";

export const MiniMapLazy = dynamic(() => import("./MiniMap"), { ssr: false, loading: () => <div className="absolute inset-0 animate-pulse bg-sand" /> });
