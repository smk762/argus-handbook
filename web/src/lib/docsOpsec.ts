/**
 * The opsec gate for published docs (epic argus-studio#169, Approach 6). The
 * rules live in `scripts/opsec.mjs`, the one source both this module (the
 * vitest gate over the handbook's own pages and the imported package docs) and
 * `scripts/package-docs.mjs` (which gates every package doc before it writes
 * anything) use. It refuses, never redacts: a docs page that names a private or
 * link-local address, a home-directory or server path, an email address, or a
 * term on the private denylist fails, and the author swaps in a placeholder
 * (`<GPU_HOST>`, `<LAN_HOST>`, `<AGENT_HOST>`) or a container path.
 *
 * Loopback (`localhost`, `127.0.0.1`) and documentation ranges are fine: they
 * name nothing real. The denylist is never committed; CI passes it in through
 * the `DOCS_OPSEC_DENYLIST` secret (comma or newline separated).
 */
import { opsecFindings as findings, parseDenylist as parse } from "../../scripts/opsec.mjs";

export interface OpsecFinding {
  rule: "private-ip" | "link-local" | "home-path" | "server-path" | "email" | "denylist";
  match: string;
  line: number;
}

/** Parses the denylist secret: comma or newline separated, blanks dropped. */
export function parseDenylist(raw: string | undefined): string[] {
  return parse(raw);
}

/** Every opsec problem in `text`, with its 1-based line. Empty means it may be published. */
export function opsecFindings(text: string, denylist: string[] = []): OpsecFinding[] {
  return findings(text, denylist);
}

/**
 * The denylist the gate runs with. In GitHub Actions (`GITHUB_ACTIONS=true`),
 * where the secret lives, a missing or empty `DOCS_OPSEC_DENYLIST` is an error,
 * not an empty list: a fork or Dependabot run gets no secrets, and a renamed
 * secret reads as unset, and either would let the gate pass without the private
 * terms. Elsewhere (a local run, another runner that never had the secret) it may be empty.
 */
export function gateDenylist(env: Record<string, string | undefined> = process.env): string[] {
  const denylist = parseDenylist(env.DOCS_OPSEC_DENYLIST);
  if (denylist.length === 0 && env.GITHUB_ACTIONS === "true") {
    throw new Error("DOCS_OPSEC_DENYLIST is unset or empty in GitHub Actions: the opsec gate would skip the private denylist");
  }
  return denylist;
}
