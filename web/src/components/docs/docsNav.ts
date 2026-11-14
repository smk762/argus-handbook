/**
 * Sidebar manifest for the handbook. Pages register here once; the sidebar,
 * the breadcrumb and prev/next paging read from this list. (Studio's captioning
 * concept pages stayed in Studio, next to the tool they explain.)
 */
import { SERVICES, serviceHref } from "@/content/services";
import { PACKAGE_DOCS, packageHref, subPages } from "@/lib/packageDocs";

export interface DocsNavItem {
  href: string;
  label: string;
  /** Pages under this one: in reading order and the breadcrumb, but not in the sidebar (the page lists them). */
  children?: DocsNavItem[];
}

export interface DocsNavSection {
  title: string;
  items: DocsNavItem[];
}

export const DOCS_NAV: DocsNavSection[] = [
  {
    title: "Getting started",
    items: [{ href: "/", label: "Overview" }],
  },
  {
    // Cross-package topics (argus-studio#172): the UIs link here rather than
    // copying it. The per-service pages come from the registry, so a new
    // service needs only its entry and its page.
    title: "Setup and services",
    items: [
      { href: "/setup", label: "Overview" },
      { href: "/setup/moderation", label: "Moderation" },
      { href: "/setup/which-services", label: "What to run for which UI" },
      ...SERVICES.map((s) => ({ href: serviceHref(s.id), label: s.title })),
    ],
  },
  {
    // Each package's own docs, imported at its dev HEAD (argus-studio#170,
    // web/scripts/package-docs.mjs). One entry per package: its docs/*.md pages are
    // listed on the package page, not here.
    title: "Packages",
    items: [
      { href: "/packages", label: "Overview" },
      ...PACKAGE_DOCS.map((pkg) => ({
        href: packageHref(pkg.short),
        label: pkg.package,
        children: subPages(pkg).map((page) => ({ href: packageHref(pkg.short, page.slug), label: page.title })),
      })),
    ],
  },
];

/** A page in reading order, carrying the section it belongs to (for breadcrumbs). */
export interface DocsNavPage extends DocsNavItem {
  section: string;
  /** The nav item a child page sits under. */
  parent?: DocsNavItem;
}

/**
 * The manifest flattened into linear reading order — the single source both
 * prev/next paging and the breadcrumb read, so page order lives in one place.
 */
export const DOCS_PAGES: DocsNavPage[] = DOCS_NAV.flatMap((section) =>
  section.items.flatMap((item) => [
    { ...item, section: section.title },
    ...(item.children ?? []).map((child) => ({ ...child, section: section.title, parent: item })),
  ]),
);

/** Prev/next/current for `pathname`, or nulls when it is not a registered page. */
export function docsPager(pathname: string): {
  current: DocsNavPage | null;
  prev: DocsNavPage | null;
  next: DocsNavPage | null;
} {
  // The static export serves every route with a trailing slash.
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const i = DOCS_PAGES.findIndex((p) => p.href === path);
  if (i === -1) return { current: null, prev: null, next: null };
  return {
    current: DOCS_PAGES[i],
    prev: i > 0 ? DOCS_PAGES[i - 1] : null,
    next: i < DOCS_PAGES.length - 1 ? DOCS_PAGES[i + 1] : null,
  };
}
