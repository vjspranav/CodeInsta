"use client";
import type { NodeIcon as IconName } from "@/lib/reel-schema";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ICONS: Record<IconName, React.ReactNode> = {
  client: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  lb: (
    <>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 6.3V10M12 10L5 15.2M12 10v5.2M12 10l7 5.2" />
      <circle cx="5" cy="17.5" r="1.8" />
      <circle cx="12" cy="17.5" r="1.8" />
      <circle cx="19" cy="17.5" r="1.8" />
    </>
  ),
  cdn: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  cache: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  db: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  queue: (
    <>
      <rect x="2" y="8" width="5" height="8" rx="1.2" />
      <rect x="9.5" y="8" width="5" height="8" rx="1.2" />
      <rect x="17" y="8" width="5" height="8" rx="1.2" />
    </>
  ),
  service: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  worker: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  storage: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
};

export function NodeGlyph({ icon }: { icon: IconName }) {
  return (
    <svg className="node-icon" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      {ICONS[icon]}
    </svg>
  );
}

/** Splits "$1,250.5k" into prefix, number and suffix; null when there is no digit. */
export function parseMetric(value: string) {
  const m = value.match(/^([^\d]*?)(-?\d[\d,]*(?:\.\d+)?)([\s\S]*)$/);
  if (!m) return null;
  const digits = m[2].replace(/,/g, "");
  return {
    prefix: m[1],
    suffix: m[3],
    target: Number(digits),
    decimals: digits.includes(".") ? digits.length - digits.indexOf(".") - 1 : 0,
    grouped: m[2].includes(","),
  };
}

export function formatMetric(value: string, progress: number) {
  const parsed = parseMetric(value);
  if (!parsed) return value;
  const eased = 1 - (1 - Math.min(1, Math.max(0, progress))) ** 3;
  const n = parsed.target * eased;
  const text = n.toLocaleString("en-US", {
    minimumFractionDigits: parsed.decimals,
    maximumFractionDigits: parsed.decimals,
    useGrouping: parsed.grouped,
  });
  return `${parsed.prefix}${text}${parsed.suffix}`;
}
