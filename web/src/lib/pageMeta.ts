import type { Metadata } from "next";

import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * One route's metadata: its own <title> (the root layout's template appends
 * "· Argus docs"), description, canonical and Open Graph URL and title.
 * `path` is the route as served, with the trailing slash the export uses.
 *
 * A page titled the site name itself (the home page) gets that title as is,
 * not "Argus docs · Argus docs". Next replaces a parent's `openGraph` and
 * `twitter` objects wholesale rather than merging them, so the site-wide fields
 * (site name, type, card, image) are repeated here; without them a page's
 * card would lose the image that src/app/opengraph-image.tsx gives the root.
 */
/**
 * The social card, drawn at build time by src/app/opengraph-image.tsx
 * (src/lib/ogCard.tsx) and exported as the extensionless file out/opengraph-image,
 * which scripts/csp.mjs's HEADERS serves as image/png. 1200×630: what Open Graph
 * and X's summary_large_image expect.
 */
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Argus docs: setup, services and package docs for the Argus suite",
};

export function pageMetadata({
  title,
  path,
  description,
}: {
  title: string;
  path: string;
  description?: string;
}): Metadata {
  const isSiteName = title === SITE_NAME;
  const full = isSiteName ? SITE_NAME : `${title} · ${SITE_NAME}`;
  const desc = description ? { description } : {};
  return {
    title: isSiteName ? { absolute: SITE_NAME } : title,
    ...desc,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, title: full, url: new URL(path, SITE_URL).href, images: [OG_IMAGE], ...desc },
    twitter: { card: "summary_large_image", title: full, images: [OG_IMAGE], ...desc },
  };
}
