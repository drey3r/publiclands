import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { MAP_URL } from "@/lib/config";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif4", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  metadataBase: new URL(MAP_URL),
  title: { default: "California Public Lands Map", template: "%s · Public Lands Map" },
  description: "Browse the California State Lands Commission's public lease records alongside parks and protected lands you can visit.",
  // California outline (same silhouette as the Home button). SVG adapts to light/dark tabs;
  // PNG/ICO fallbacks sit on a cream tile so they read on either.
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  // Unlisted deployments (e.g. a private preview) set NEXT_PUBLIC_NOINDEX=1.
  ...(process.env.NEXT_PUBLIC_NOINDEX === "1" ? { robots: { index: false, follow: false } } : {}),
};

export const viewport: Viewport = { themeColor: "#f4efe4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${serif.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
