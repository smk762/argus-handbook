import type { Metadata, Viewport } from "next";

import "./globals.css";
import { DocsBreadcrumb } from "@/components/docs/DocsBreadcrumb";
import { DocsPager } from "@/components/docs/DocsPager";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { DocsToc } from "@/components/docs/DocsToc";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const DESCRIPTION =
  "Docs for the Argus suite: setting up the services it depends on, and each package's own docs, imported from its dev branch.";

// Every route sets its own title (pageMetadata) and canonical; this template and default cover the rest.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: SITE_NAME, description: DESCRIPTION },
  twitter: { card: "summary_large_image", description: DESCRIPTION },
};

// The browser chrome follows the page. These are the family's --dh-bg values; a <meta> can't read a CSS variable.
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#121416" },
  ],
};

/**
 * The one shell every page shares: header, the docs sidebar (a disclosure on
 * phones), the article with its breadcrumb and prev/next, the "On this page"
 * rail, and the footer. A static export: every page is prerendered at build time.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/*
          The family theme script (public/dh-theme.js, a copy of vendor/dh/dh-theme.js).
          A plain blocking <script src>, first in <head>, so the saved choice (the
          `dh-theme` cookie, shared across *.dragonhound.dev) is on <html> before the
          first paint. Not next/script: that would load it after hydration and flash.
          External, so the CSP (scripts/csp.mjs) covers it with 'self' and no hash.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- blocking on purpose: it must set the theme before first paint */}
        <script src="/dh-theme.js" />
        {/* favicon.ico, icon.svg and apple-icon.png sit in src/app/ (argus-cortex brand/mark/favicon/); Next emits their <link> tags. */}
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 py-6 sm:px-6 md:py-8">
            <aside aria-label="Docs pages" className="hidden w-56 shrink-0 md:block">
              <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto scrollbar-thin pb-6">
                <DocsSidebar />
              </div>
            </aside>
            <main id="main" tabIndex={-1} className="min-w-0 flex-1">
              {/* Phones: the same sidebar behind a native disclosure (no script needed to open it). */}
              <details className="mb-6 rounded-lg border border-border bg-surface/40 md:hidden">
                <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-foreground">All pages</summary>
                <div className="border-t border-border px-2 py-4">
                  <DocsSidebar />
                </div>
              </details>
              <DocsBreadcrumb />
              <article className="max-w-3xl">{children}</article>
              <DocsPager />
            </main>
            <aside aria-label="Table of contents" className="hidden w-52 shrink-0 xl:block">
              <div className="sticky top-24">
                <DocsToc />
              </div>
            </aside>
          </div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
