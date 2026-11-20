import { describe, expect, it } from "vitest";

import { OG_IMAGE, pageMetadata } from "@/lib/pageMeta";
import { SITE_NAME } from "@/lib/site";

describe("pageMetadata", () => {
  it("does not repeat the site name on a page titled with it", () => {
    const m = pageMetadata({ title: SITE_NAME, path: "/" });
    expect(m.title).toEqual({ absolute: SITE_NAME });
    expect(m.openGraph?.title).toBe(SITE_NAME);
    expect(m.twitter?.title).toBe(SITE_NAME);
  });

  it("lets the template suffix other pages and keeps the site-wide card fields", () => {
    const m = pageMetadata({ title: "Setup", path: "/setup/", description: "d" });
    expect(m.title).toBe("Setup");
    expect(m.openGraph).toMatchObject({ siteName: SITE_NAME, type: "website", title: `Setup · ${SITE_NAME}`, images: [OG_IMAGE] });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: `Setup · ${SITE_NAME}`, images: [OG_IMAGE] });
  });
});
