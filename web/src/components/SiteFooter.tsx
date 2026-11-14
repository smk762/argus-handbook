import { ExternalLink } from "@/components/ExternalLink";
import { DEMOS, HOME_URL, REPO_URL } from "@/lib/site";

const LINK = "underline underline-offset-2 hover:text-foreground";

/** The footer: the family (landing page and demos, same tab), the source (new tab), and the licence. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border py-4">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 text-xs text-muted sm:px-6">
        <nav aria-label="Dragonhound Labs" className="flex flex-wrap gap-x-3 gap-y-1">
          <ExternalLink href={HOME_URL} className={LINK}>
            Dragonhound Labs
          </ExternalLink>
          {DEMOS.map((demo) => (
            <ExternalLink key={demo.href} href={demo.href} className={LINK}>
              {demo.label}
            </ExternalLink>
          ))}
          <ExternalLink href={REPO_URL} className={LINK}>
            GitHub
          </ExternalLink>
        </nav>
        <span>
          MIT License ·{" "}
          <ExternalLink href={REPO_URL} className={LINK}>
            smk762/argus-handbook
          </ExternalLink>
        </span>
      </div>
    </footer>
  );
}
