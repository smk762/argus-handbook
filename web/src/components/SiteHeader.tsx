import Link from "next/link";

import { ExternalLink } from "@/components/ExternalLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DEMOS, SITE_NAME } from "@/lib/site";

/**
 * The Argus suite mark (argus-cortex brand/mark/argus-mark-mono.svg), inline in
 * currentColor so it follows the theme.
 */
function ArgusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path d="M1 12A11.82 11.82 0 0 1 23 12A11.82 11.82 0 0 1 1 12Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <g fill="currentColor">
        <circle cx="15.75" cy="12" r="1.6" />
        <circle cx="13.88" cy="15.25" r="1.6" />
        <circle cx="10.12" cy="15.25" r="1.6" />
        <circle cx="8.25" cy="12" r="1.6" />
        <circle cx="10.12" cy="8.75" r="1.6" />
        <circle cx="13.88" cy="8.75" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
      </g>
    </svg>
  );
}

const SECTION = "rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground";
const DEMO = "rounded-md px-2 py-1 text-xs text-muted underline underline-offset-2 transition-colors hover:text-foreground";

/**
 * The site header: the mark and name (home), the two sections, the hosted demo
 * UIs as plain links (family hosts, same tab), and the theme toggle. Wraps to a
 * second row on phones; sticky from `md` up.
 */
export function SiteHeader() {
  return (
    <header className="z-10 border-b border-border bg-surface/50 backdrop-blur-sm md:sticky md:top-0">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-foreground">
          <ArgusMark className="h-6 w-6 text-accent-purple" />
          <span className="text-base font-semibold">{SITE_NAME}</span>
        </Link>
        <nav aria-label="Sections" className="flex items-center gap-1">
          <Link href="/setup" className={SECTION}>
            Setup
          </Link>
          <Link href="/packages" className={SECTION}>
            Packages
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <nav aria-label="Demos" className="hidden items-center sm:flex">
            {DEMOS.map((demo) => (
              <ExternalLink key={demo.href} href={demo.href} className={DEMO}>
                {demo.label}
              </ExternalLink>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
