import { ImageResponse } from "next/og";

import { OG_IMAGE } from "@/lib/pageMeta";

/**
 * The social card (og:image and twitter:image) for every page: 1200×630, the
 * size Open Graph and X's summary_large_image expect. Drawn at build time by
 * src/app/opengraph-image.tsx (force-static), so the export ships it as a plain
 * PNG; pageMetadata (OG_IMAGE) points every page's og:image and twitter:image
 * at it. Dark-scheme family tokens (vendor/dh), the site's dark accent
 * (globals.css) and the argus mark from src/app/icon.svg.
 */
export const OG_SIZE = { width: OG_IMAGE.width, height: OG_IMAGE.height };
export const OG_ALT = OG_IMAGE.alt;

const BG = "#121416"; // --dh-bg (dark)
const SURFACE = "#1a1d20"; // --dh-surface (dark)
const TEXT = "#e6e8ea"; // --dh-text (dark)
const MUTED = "#9aa3ab"; // --dh-muted (dark)
const BORDER = "#2b3035"; // --dh-border (dark)
const ACCENT = "#a78bfa"; // --dh-accent, the site's dark override
const PUPIL = "#e57a64"; // the mark's dark pupil (icon.svg)

const DOTS: [number, number][] = [
  [15.75, 12],
  [13.88, 15.25],
  [10.12, 15.25],
  [8.25, 12],
  [10.12, 8.75],
  [13.88, 8.75],
];

export function ogCard(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: BG,
          color: TEXT,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="112" height="112" viewBox="0 0 24 24">
            <path
              d="M1 12A11.82 11.82 0 0 1 23 12A11.82 11.82 0 0 1 1 12Z"
              fill="none"
              stroke={TEXT}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {DOTS.map(([cx, cy]) => (
              <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="1.6" fill={TEXT} />
            ))}
            <circle cx="12" cy="12" r="1.6" fill={PUPIL} />
          </svg>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -1 }}>Argus docs</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", fontSize: 44, lineHeight: 1.25, maxWidth: 980 }}>
            Setting up the services the Argus suite depends on, and each package&apos;s own docs.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 30, color: MUTED }}>
            <div
              style={{
                display: "flex",
                padding: "8px 20px",
                borderRadius: 12,
                background: SURFACE,
                border: `2px solid ${BORDER}`,
                color: ACCENT,
              }}
            >
              docs.dragonhound.dev
            </div>
            <div style={{ display: "flex" }}>Dragonhound Labs</div>
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
