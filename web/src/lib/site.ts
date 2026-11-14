/** Where this site and its neighbours live. One place, so a header link and a canonical URL cannot disagree. */

/** The handbook's public origin, for canonical and Open Graph URLs. */
export const SITE_URL = "https://docs.dragonhound.dev";
export const SITE_NAME = "Argus docs";
export const REPO_URL = "https://github.com/smk762/argus-handbook";

/** The Dragonhound Labs landing page and the suite's hosted demo UIs (family hosts: same tab). */
export const HOME_URL = "https://dragonhound.dev/";
export const STUDIO_URL = "https://studio.dragonhound.dev/";
export const LIGHTBOX_URL = "https://lightbox.dragonhound.dev/";
export const REALMS_URL = "https://realms.dragonhound.dev/";

/** A page of the Studio demo (its tools and its captioning concept pages stayed there). */
export const studioHref = (path = "/"): string => new URL(path, STUDIO_URL).href;

export const DEMOS = [
  { label: "Studio", href: STUDIO_URL, about: "the suite's web UI: caption, curate, train configs, evaluate, bake maps" },
  { label: "Lightbox", href: LIGHTBOX_URL, about: "a photo gallery navigated by argus-lens captions" },
  { label: "Realms", href: REALMS_URL, about: "argus-atlas's prebaked fantasy-map mosaic" },
] as const;
