import type { Metadata } from "next";

import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * One route's metadata: its own <title> (the root layout's template appends
 * "· Argus docs"), description, canonical and Open Graph URL and title.
 * `path` is the route as served, with the trailing slash the export uses.
 */
export function pageMetadata({
  title,
  path,
  description,
}: {
  title: string;
  path: string;
  description?: string;
}): Metadata {
  const full = `${title} · ${SITE_NAME}`;
  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    openGraph: { title: full, url: new URL(path, SITE_URL).href, ...(description ? { description } : {}) },
    twitter: { title: full, ...(description ? { description } : {}) },
  };
}
