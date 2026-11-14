import { PackageIndex } from "@/components/docs/PackageIndex";
import { pageMetadata } from "@/lib/pageMeta";

export const metadata = pageMetadata({
  title: "Packages",
  path: "/packages/",
  description: "Each Argus package's own docs, imported from its dev branch at a recorded commit.",
});

export default function PackagesPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-foreground mt-2 mb-4">Packages</h1>
      <p className="my-3 text-sm leading-relaxed text-foreground/80">
        Each package&apos;s README and its <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[0.8125rem] text-accent-teal-ink">docs/</code>{" "}
        pages, imported from the package&apos;s <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[0.8125rem] text-accent-teal-ink">dev</code>{" "}
        branch at the commit shown, and re-imported when that branch moves on. The package is the source of truth: a fix
        goes to its repo, never to the copy here.
      </p>
      <PackageIndex />
    </>
  );
}
