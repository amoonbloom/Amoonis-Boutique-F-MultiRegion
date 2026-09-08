"use client";

import Image from "next/image";
import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ROUTES } from "@/constants/routes";
import { ArrowRight } from "@/components/icons";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { useT } from "@/i18n/useT";
import type { MessageKey } from "@/i18n/messages";
import { useRegionCopy } from "@/features/location/hooks/useRegionCopy";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import { deliveryConfigApi } from "@/features/delivery-config/api/delivery-config.api";
import { deliveryZonesApi } from "@/features/delivery-zones/api/delivery-zones.api";
import { queryKeys } from "@/services/queryKeys";

/**
 * Per-slide copy. Each slide carries its own headline, subtitle and single CTA
 * (client-supplied). Cycles when the store has more media slides than copy
 * sets, so adding a banner never leaves a slide with no text.
 */
const SLIDE_COPY: {
  title: MessageKey;
  subtitle: MessageKey;
  cta: MessageKey;
}[] = [
  {
    title: "hero.slide1Title",
    subtitle: "hero.slide1Subtitle",
    cta: "hero.slide1Cta",
  },
  {
    title: "hero.slide2Title",
    subtitle: "hero.slide2Subtitle",
    cta: "hero.slide2Cta",
  },
];

export interface HeroSlide {
  id: string;
  url: string;
  kind: "image" | "video";
}

interface HeroCarouselProps {
  /** Slides pre-sorted by the parent server component. Images or videos. */
  slides: HeroSlide[];
}

/**
 * Hero — inset 16:9 rounded slideshow supporting video and image slides. Video slides
 * autoplay muted (only the active one plays) and advance to the next slide when
 * they end; images auto-advance on a timer. Manual nav (arrows/dots/swipe) is
 * always available. Respects prefers-reduced-motion (no autoplay / no auto-
 * advance; the first frame is shown as a still).
 */
export function HeroCarousel({ slides }: HeroCarouselProps) {
  const { t, dir } = useT();
  const rtl = dir === "rtl";
  const regionCopy = useRegionCopy();
  const { countryCode } = useCurrency();
  // Selected city → delivery zone, so the hero's same-day eyebrow tracks the SELECTED
  // zone (zone override wins over region), not just the region.
  const city = useAppSelector((s) => s.location.city);
  const { data: zones } = useQuery({
    queryKey: queryKeys.deliveryZones.list(countryCode),
    queryFn: () => deliveryZonesApi.list(countryCode),
    enabled: Boolean(countryCode),
    staleTime: 5 * 60_000,
  });
  const zoneId = city ? zones?.find((z) => z.name === city)?.id : undefined;
  // Only claim "same-day delivery" in the hero when the selected zone (or its region
  // fallback) actually offers it; otherwise show a plain delivery eyebrow.
  const deliveryConfigQuery = useQuery({
    queryKey: queryKeys.deliveryConfig.resolve(countryCode, zoneId, 0),
    queryFn: () => deliveryConfigApi.get({ region: countryCode, zoneId }),
    enabled: Boolean(countryCode),
    staleTime: 60_000,
  });
  const sameDayEnabled = Boolean(deliveryConfigQuery.data?.sameDayEnabled);
  const total = slides.length;
  const hasMultiple = total > 1;

  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const goTo = useCallback(
    (i: number) => setActive(((i % total) + total) % total),
    [total]
  );
  const next = useCallback(() => goTo(active + 1), [active, goTo]);
  const prev = useCallback(() => goTo(active - 1), [active, goTo]);

  // Honour reduced-motion: pause autoplay + auto-advance.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Play only the active video; pause + rewind the rest.
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === active && !reduced) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [active, reduced, slides]);

  // Auto-advance image slides (videos advance via onEnded).
  useEffect(() => {
    if (!hasMultiple || reduced) return;
    if (slides[active]?.kind === "video") return;
    // TEMP (revert later): the first slide (promo banner) stays ~9s; all others 6s.
    // Revert = uncomment the original line below and delete the two TEMP lines.
    // const id = setTimeout(next, 6000);
    const id = setTimeout(next, active === 0 ? 9000 : 6000);
    return () => clearTimeout(id);
  }, [active, hasMultiple, reduced, slides, next]);

  // Copy for the slide on screen; cycles if there are more media slides than
  // copy sets.
  const copy = SLIDE_COPY[active % SLIDE_COPY.length];

  const touchStart = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) > 48) ((rtl ? dx > 0 : dx < 0) ? next : prev)();
    touchStart.current = null;
  };

  if (total === 0) return null;

  return (
    <div className="relative">
    <section
      aria-roledescription="carousel"
      aria-label={t("hero.carouselLabel")}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") (rtl ? prev : next)();
        if (e.key === "ArrowLeft") (rtl ? next : prev)();
      }}
      tabIndex={hasMultiple ? 0 : -1}
      className="relative isolate aspect-video w-full overflow-hidden rounded-2xl bg-blush-50 outline-none focus-visible:ring-2 focus-visible:ring-bloom-500/40 sm:rounded-3xl lg:aspect-auto lg:h-110 xl:h-125 2xl:h-150"
    >
      <div className="absolute inset-0">
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            aria-hidden={i !== active}
            className="absolute inset-0 transition-opacity duration-700 ease-out"
            style={{ opacity: i === active ? 1 : 0, zIndex: i === active ? 1 : 0 }}
          >
            {slide.kind === "video" ? (
              <video
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                src={slide.url}
                muted
                playsInline
                loop={total === 1}
                autoPlay={i === 0}
                preload={i === 0 ? "auto" : "metadata"}
                onEnded={hasMultiple ? next : undefined}
                className="h-full w-full object-cover"
                aria-hidden
              />
            ) : (
              <Image
                src={slide.url}
                alt=""
                fill
                priority={i === 0}
                sizes="100vw"
                className="object-cover"
                draggable={false}
              />
            )}
          </div>
        ))}
      </div>

      {/* Readability gradients */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-r from-ink-900/45 via-ink-900/10 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-48 bg-gradient-to-t from-ink-900/40 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-0 z-[2] h-[36rem] w-[36rem] rounded-full bg-bloom-300/20 blur-3xl"
      />

      {/* Prev / Next — manual navigation (desktop) */}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label={t("hero.prevSlide")}
            className="absolute inset-s-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/15 p-3 text-white backdrop-blur-md transition-colors hover:bg-white hover:text-ink-900 hover:shadow-(--shadow-lift) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:flex lg:inset-s-6"
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label={t("hero.nextSlide")}
            className="absolute inset-e-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/15 p-3 text-white backdrop-blur-md transition-colors hover:bg-white hover:text-ink-900 hover:shadow-(--shadow-lift) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:flex lg:inset-e-6"
          >
            <Chevron direction="right" />
          </button>
        </>
      )}

      {/* Content overlay */}
      <div className="relative z-10 flex h-full w-full flex-col justify-end p-5 sm:p-8 lg:p-12">
        {/* TEMP (revert later): hide the hero copy (eyebrow + title + subtitle + CTA) on the
            FIRST slide only — the promo banner already carries its own baked-in text. Revert =
            delete this `{active !== 0 && (` line and its matching `)}` just above the pager. */}
        {active !== 0 && (
        <div className="hidden max-w-xl sm:mb-10 sm:block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/85 sm:text-xs">
            {sameDayEnabled
              ? t("hero.eyebrow", { country: regionCopy.country })
              : t("hero.eyebrowDelivery", { country: regionCopy.country })}
          </p>
          <h1 className="mt-2 font-display text-2xl font-medium leading-[1.08] text-white sm:mt-3 sm:text-5xl sm:leading-[1.05] lg:text-6xl">
            {t(copy.title)}
          </h1>
          <p className="mt-4 hidden max-w-md text-sm leading-relaxed text-white/80 sm:block sm:text-base">
            {t(copy.subtitle)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-7">
            <LocalizedLink
              href={ROUTES.shop}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-ink-900 shadow-(--shadow-lift) transition-transform hover:-translate-y-0.5 hover:bg-cream-50 sm:h-12 sm:px-6"
            >
              {t(copy.cta)}
              <ArrowRight size={16} className="rtl:-scale-x-100" />
            </LocalizedLink>
          </div>
        </div>
        )}
        {/* END TEMP guard */}

        {hasMultiple && (
          <div className="flex items-center justify-end gap-4">
            <div className="hidden items-center gap-3 text-xs font-semibold tracking-[0.18em] text-white/85 uppercase sm:flex">
              <span className="tabular-nums">
                {String(active + 1).padStart(2, "0")}
              </span>
              <span className="h-px w-8 bg-white/40" />
              <span className="tabular-nums text-white/55">
                {String(total).padStart(2, "0")}
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {slides.map((s, i) => {
                const isActive = i === active;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={t("hero.goToSlide", { n: i + 1 })}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "h-1 rounded-full transition-[width,background-color] duration-300 ease-out",
                      isActive
                        ? "w-12 bg-white sm:w-16"
                        : "w-6 bg-white/40 hover:bg-white/60 sm:w-8"
                    )}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>

    {/* Mobile shop button — sits at the bottom-left of the carousel, half
        inside the image and half below it. Must live outside the overflow-hidden
        <section> so it isn't clipped at the rounded edge. */}
    {/* TEMP (revert later): hide the mobile shop button on the FIRST slide too, for
        consistency with the hidden desktop copy. Revert = delete this guard + its `)}`. */}
    {active !== 0 && (
    <LocalizedLink
      href={ROUTES.shop}
      className="absolute bottom-0 inset-s-5 z-20 translate-y-1/2 inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-bloom-700 shadow-xl ring-4 ring-cream-50 transition-colors hover:bg-cream-50 active:scale-95 sm:hidden"
    >
      {t(copy.cta)}
      <ArrowRight size={14} className="rtl:-scale-x-100" />
    </LocalizedLink>
    )}
    </div>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      // The nav buttons are placed with logical inset-s/inset-e, which already
      // swap sides in RTL — so the glyph has to mirror too, or it ends up
      // pointing back the way it came. Same idiom as ProductGallery.
      className={cn("rtl:-scale-x-100", direction === "left" && "rotate-180")}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
