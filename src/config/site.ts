/**
 * Brand metadata for Amoon Boutique. The display name reflects what
 * customers see in the live site header and is used by `<Header>`/`<Footer>`
 * for the wordmark.
 *
 * `name` is a CONSTANT, deliberately not `NEXT_PUBLIC_APP_NAME`. The company has
 * one name in every environment, so an env var bought nothing — and a stale
 * "Amoonis Boutique" left in a deployment's variables silently overrode the
 * rename everywhere the brand appears (header, page titles, the order receipt
 * and its PDF), with no sign of it in the code. Rename here, not in a dashboard.
 */
export const siteConfig = {
  name: "Amoon Boutique",
  shortName: "Amoon",
  tagline: "Composed gift boxes for the moments that matter",
  description:
    "Amoon Boutique — curated gift boxes, hand-tied flowers, and same-day delivery in the UAE. Composed by hand for graduations, Eid, newborns, and every quiet celebration in between.",
  url: "https://amoon-bloom-f.vercel.app",
  ogImage: "/images/og-image.png",
  // Single store currency. The backend stores one price per product in one
  // currency (it has no per-region pricing and no public currency endpoint),
  // so the storefront displays this consistently regardless of delivery region.
  // Region selection controls catalog *visibility*, not currency.
  currency: "AED",
  locale: "en-AE",
  /**
   * Hero background videos (autoplay, muted, looped) — mirrors the client's
   * video hero. Self-hosted on Bunny CDN (compressed H.264). WebP/MP4 both play
   * fine on web + the Flutter mobile app.
   */
  heroVideos: [
    "https://ammon-pull-zone.b-cdn.net/videos/815a3673-06d7-45fa-8c2d-7ca1a880bfbb.mp4",
    "https://ammon-pull-zone.b-cdn.net/videos/3fc3ab0e-11ac-448a-8279-32bd281ad382.mp4",
    "https://ammon-pull-zone.b-cdn.net/videos/e9077e2a-808c-4e4c-9dd1-d25826738a5d.mp4",
  ],
  // Legal entity name shown in the copyright line — distinct from the
  // customer-facing `name` above.
  legalEntity: "AMOON BLOOM Trading L.L.C S.O.C™",
  contact: {
    email: "management@amoonbloom.com",
    phone: "+971 50 606 7910",
    whatsapp: "+971 50 606 7910",
    address: "Dubai, United Arab Emirates",
    hours: "Daily · 10:00 — 00:00 (Dubai time)",
  },
  links: {
    instagram: "https://www.instagram.com/amoonis.boutique/?hl=en",
    facebook: "https://www.facebook.com/amoonis.boutique/",
    tiktok: "https://www.tiktok.com/@amoonis.boutique",
    threads: "https://www.threads.com/@amoonis.boutique",
    whatsapp: "https://wa.me/971506067910",
  },
  shipping: {
    sameDayCutoff: "Order before 6 PM for same-day delivery in Dubai.",
    freeOver: 250,
    currency: "AED",
  },
  poweredBy: "MNASATI",
} as const;

export type SiteConfig = typeof siteConfig;
