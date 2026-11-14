import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

const CARD =
  "block rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground transition-colors hover:bg-surface-hover";

/** The 404 page, inside the same shell as every page. Studio's old /docs/ paths are redirected by public/_redirects. */
export default function NotFound() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-foreground mt-2 mb-4">Page not found</h1>
      <p className="my-3 text-sm leading-relaxed text-foreground/80">
        There is no page at this address. It may have moved, or the link may be mistyped.
      </p>
      <ul className="mt-6 grid gap-2 sm:grid-cols-3">
        <li>
          <Link href="/" className={CARD}>
            Overview
          </Link>
        </li>
        <li>
          <Link href="/setup" className={CARD}>
            Setup and services
          </Link>
        </li>
        <li>
          <Link href="/packages" className={CARD}>
            Packages
          </Link>
        </li>
      </ul>
    </>
  );
}
