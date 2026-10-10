import { Suspense } from "react";
import { Hero } from "@/components/home/Hero";
import { CategoryShowcase } from "@/components/home/CategoryShowcase";
import { HomeSections } from "@/components/home/HomeSections";
import { TrustStrip } from "@/components/home/TrustStrip";
import { BrandStory } from "@/components/home/BrandStory";
import { SupportSection } from "@/components/home/SupportSection";
import { Container } from "@/components/ui";
import { getServerZoneName } from "@/services/serverRegion";

/**
 * Home page — section order mirrors the client's live site:
 *   Hero → categories → best sellers → new arrivals
 *        → trust strip → brand story → support.
 * Data-backed sections stream inside <Suspense> so the shell paints instantly.
 */
export default async function HomePage() {
  // Changing the delivery zone adds/removes catalog content, and LocationSheet
  // calls router.refresh() so these Server Components re-render. Their reveal
  // animations use `viewport: { once: true }`, so the observer has already fired
  // by then and a re-rendered card can sit at its initial opacity: 0 forever —
  // which reads as blank space where a category or product should be. Keying the
  // boundaries by zone remounts the subtree instead, so the reveal replays and
  // the new content fades in rather than leaving a hole.
  const zoneKey = (await getServerZoneName()) ?? "none";
  return (
    <>
      <Suspense fallback={<HeroFallback />}>
        <Hero />
      </Suspense>

      <Suspense key={`categories-${zoneKey}`} fallback={<RowFallback cards={4} />}>
        <CategoryShowcase />
      </Suspense>

      {/* Admin-managed product rails (Best sellers, New arrivals, …) in the
          order set in the admin Sections screen. */}
      <Suspense key={`sections-${zoneKey}`} fallback={<RowFallback cards={4} />}>
        <HomeSections />
      </Suspense>

      <TrustStrip />

      <BrandStory />

      <SupportSection />
    </>
  );
}

function HeroFallback() {
  return (
    <section className="bg-cream-50 pt-3 pb-6 sm:pt-4 sm:pb-8 lg:pt-6 lg:pb-10" aria-hidden>
      <Container size="lg">
        <div className="skeleton aspect-video w-full rounded-2xl sm:rounded-3xl" />
      </Container>
    </section>
  );
}

function RowFallback({ cards }: { cards: 3 | 4 }) {
  return (
    <section className="py-14 lg:py-20" aria-hidden>
      <Container>
        <div className="skeleton h-8 w-64 rounded-lg" />
        <div
          className={
            "mt-10 grid gap-5 lg:gap-6 " +
            (cards === 3
              ? "grid-cols-2 md:grid-cols-3"
              : "grid-cols-2 md:grid-cols-4")
          }
        >
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="skeleton aspect-4/5 w-full rounded-2xl" />
          ))}
        </div>
      </Container>
    </section>
  );
}
