import { OG_ALT, OG_SIZE, ogCard } from "@/lib/ogCard";

// Rendered once at build time (a static export has no server); see src/lib/ogCard.tsx.
export const dynamic = "force-static";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard();
}
