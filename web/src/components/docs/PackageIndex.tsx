import Link from "next/link";

import { PACKAGE_DOCS, packageHref, shortSha } from "@/lib/packageDocs";

const LINK =
  "text-accent-purple-ink underline decoration-dotted underline-offset-2 hover:text-accent-purple-ink transition-colors";

/** Every imported package, with the version and commit its docs were taken at. */
export function PackageIndex() {
  return (
    <div className="my-4 overflow-x-auto scrollbar-thin">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-border bg-surface px-3 py-2 text-left font-medium text-foreground">Package</th>
            <th className="border border-border bg-surface px-3 py-2 text-left font-medium text-foreground">Version</th>
            <th className="border border-border bg-surface px-3 py-2 text-left font-medium text-foreground">Pages</th>
          </tr>
        </thead>
        <tbody>
          {PACKAGE_DOCS.map((pkg) => (
            <tr key={pkg.short}>
              <td className="border border-border px-3 py-2 align-top whitespace-nowrap">
                <Link href={packageHref(pkg.short)} className={LINK}>
                  {pkg.package}
                </Link>
              </td>
              <td className="border border-border px-3 py-2 align-top font-mono text-xs text-foreground/80 [overflow-wrap:anywhere]">
                {pkg.version} @ {shortSha(pkg.commit)}
              </td>
              <td className="border border-border px-3 py-2 align-top text-foreground/80">
                {pkg.pages.length}
                {pkg.held.length > 0 ? ` (${pkg.held.length} held)` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
