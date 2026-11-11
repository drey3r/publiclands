"use client";

import { useEffect, useState } from "react";

/**
 * Share: "Copy link" everywhere, plus the native share sheet on phones (touch devices with
 * navigator.share). `path` is relative to this site, so both deployments share their own URL.
 */
export function ShareButton({ path, title, text, tone = "light", className = "" }: { path: string; title: string; text?: string; tone?: "light" | "dark"; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [native, setNative] = useState(false);
  useEffect(() => setNative(typeof navigator !== "undefined" && !!navigator.share && window.matchMedia("(pointer: coarse)").matches), []);
  const url = () => new URL(path, window.location.origin).toString();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
    } catch {
      const t = document.createElement("textarea");
      t.value = url();
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const share = () => navigator.share({ title, text, url: url() }).catch(() => {});
  const btn =
    tone === "dark"
      ? "rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft"
      : "rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:border-ink-soft hover:text-ink";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      {native && (
        <button type="button" onClick={share} className={btn}>
          Share…
        </button>
      )}
      <button type="button" onClick={copy} className={btn} aria-live="polite">
        {copied ? "Link copied ✓" : "Copy link"}
      </button>
    </span>
  );
}
