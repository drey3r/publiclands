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
