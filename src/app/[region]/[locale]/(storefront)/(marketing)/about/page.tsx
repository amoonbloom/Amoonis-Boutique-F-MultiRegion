import Image from "next/image";
import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { Container, Section, Button } from "@/components/ui";
import { ArrowRight, BagIcon, SparkleIcon, TruckIcon } from "@/components/icons";
import { ROUTES } from "@/constants/routes";
import { getServerLocale } from "@/i18n/server";
import { getServerRegion } from "@/services/serverRegion";
import { localized } from "@/i18n";
import { regionCopyFromRegionCode, type RegionCopy } from "@/features/location/regionCopy";
import type { Locale } from "@/store/slices/ui.slice";

export const metadata = { title: "Our Story" };

// Client's own section photos, mirrored to our Bunny CDN.
const IMG = {
  hero: "https://ammon-pull-zone.b-cdn.net/uploads/amoon-2de65d019703.jpg",
  media1: "https://ammon-pull-zone.b-cdn.net/uploads/amoon-6c5d88801b7a.png",
  media2: "https://ammon-pull-zone.b-cdn.net/uploads/amoon-e61293c7c410.png",
  media3: "https://ammon-pull-zone.b-cdn.net/uploads/amoon-f5abb20e275a.png",
  belief: "https://ammon-pull-zone.b-cdn.net/uploads/amoon-d201022a58cb.png",
};

const BRAND = (locale: Locale) => localized("Amoon Boutique", "أمون بوتيك", locale);

// Mirrors the client's About layout, adapted to the active region + Amoon Boutique.
export default async function AboutPage() {
  const [locale, region] = await Promise.all([getServerLocale(), getServerRegion()]);
  const regionCopy = await regionCopyFromRegionCode(region, locale);
  const brand = BRAND(locale);

  const deliverySub =
    region === "SA"
      ? localized("Inside Saudi Arabia", "داخل السعودية", locale)
      : localized("Inside the UAE", "داخل الإمارات", locale);

  const features = [
    {
      icon: <BagIcon size={22} />,
      title: localized("Ready-made Gifts", "هدايا جاهزة", locale),
      sub: localized("For every occasion", "لكل مناسبة", locale),
    },
    {
      icon: <SparkleIcon size={22} />,
      title: localized("Elegant Packaging", "تغليف أنيق", locale),
      sub: localized("And personal touches", "ولمسات شخصية", locale),
    },
    {
      icon: <TruckIcon size={22} />,
      title: localized("Fast Delivery", "توصيل سريع", locale),
      sub: deliverySub,
    },
  ];

  const points = [
    {
      n: "01",
      title: localized("Hand-curated", "منتقاة يدويًا", locale),
      body: localized("Every piece is selected for craft, usefulness and story.", "يُختار كل عنصر لجودته وفائدته وقصته.", locale),
    },
    {
      n: "02",
      title: localized("Beautifully presented", "تقديم أنيق", locale),
      body: localized("Signature ribbon, custom card, considered packaging.", "شريطة مميزة، وبطاقة مخصصة، وتغليف مدروس.", locale),
    },
    {
      n: "03",
      title: localized("Delivered with care", "توصيل بعناية", locale),
      body: localized("Same-day local delivery and white-glove handling.", "توصيل محلي في اليوم نفسه وعناية فائقة.", locale),
    },
  ];

  const beliefs = [
    {
      title: localized("Chosen with Purpose", "مختارة بعناية", locale),
      body: localized("Every item earns its place through quality, usefulness, and the feeling it creates.", "يستحق كل عنصر مكانه بجودته وفائدته والشعور الذي يخلقه.", locale),
    },
    {
      title: localized("Designed to Impress", "مصممة لتبهر", locale),
      body: localized("From elegant packaging to personalized gift cards, every detail is crafted to last.", "من التغليف الأنيق إلى بطاقات الإهداء المخصصة، كل تفصيل مصنوع ليدوم أثره.", locale),
    },
    {
      title: localized("Effortless Experience", "تجربة سلسة", locale),
      body: localized("From placing your order to delivery, we make gifting simple and enjoyable.", "من إتمام طلبك إلى التوصيل، نجعل الإهداء بسيطًا وممتعًا.", locale),
    },
  ];

  const values = [
    {
      title: localized("Beauty with purpose", "جمال بهدف", locale),
      body: localized("We choose pieces that look lovely and feel useful long after the occasion passes.", "نختار قطعًا تبدو جميلة وتبقى مفيدة بعد انقضاء المناسبة.", locale),
    },
    {
      title: localized("Human service", "خدمة إنسانية", locale),
      body: localized("Questions, custom notes and delivery details are handled with a boutique rhythm.", "نتعامل مع الأسئلة والملاحظات الخاصة وتفاصيل التوصيل بروح البوتيك.", locale),
    },
    {
      title: localized("Quiet luxury", "فخامة هادئة", locale),
      body: localized("Soft color, clean presentation, and considered materials keep the gift elegant.", "ألوان هادئة، وتقديم أنيق، ومواد مدروسة تحافظ على رقي الهدية.", locale),
    },
  ];

  const process = [
    {
      n: "01",
      title: localized("Understand", "نفهم", locale),
      body: localized("We begin with the occasion and the person receiving the gift.", "نبدأ بالمناسبة وبالشخص الذي سيستلم الهدية.", locale),
    },
    {
      n: "02",
      title: localized("Curate", "ننسق", locale),
      body: localized("Every detail is carefully selected and arranged with purpose.", "يُنتقى كل تفصيل ويُرتب بعناية وهدف.", locale),
    },
    {
      n: "03",
      title: localized("Deliver", "نوصل", locale),
      body: localized("Your gift arrives beautifully prepared and ready to make its moment.", "تصل هديتك مُعدّة بأناقة وجاهزة لصنع لحظتها.", locale),
    },
  ];

  return (
    <>
      {/* 1 — Hero */}
      <section className="bg-cream-50 pt-16 pb-12 lg:pt-24">
        <Container className="grid gap-12 md:grid-cols-2 md:items-center md:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bloom-700">
              {localized("Our Story", "قصتنا", locale)}
            </p>
            <h1 className="mt-3 font-display text-4xl font-medium leading-[1.05] tracking-tight text-ink-900 sm:text-5xl md:text-6xl">
              {localized("Because the gift ", "لأن الهدية ", locale)}
              <span className="bg-linear-to-r from-bloom-600 to-gold-500 bg-clip-text text-transparent">
                {localized("beautiful", "الجميلة", locale)}
              </span>
              {localized(" starts before it's opened.", " تبدأ قبل فتحها.", locale)}
            </h1>
            <p className="mt-5 max-w-md text-lg text-ink-600">
              {localized(
                "We carefully coordinate gifts to leave a lasting impression — from occasion boxes and flower bouquets to newborn gifts designed with the finest details.",
                "ننسق الهدايا بعناية لتترك انطباعاً يدوم، من بوكسات المناسبات وباقات الورد إلى هدايا المواليد المصممة بأدق التفاصيل.",
                locale
              )}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <LocalizedLink href={ROUTES.shop} className="contents">
                <Button size="lg" trailingIcon={<ArrowRight size={16} className="rtl:-scale-x-100" />}>
                  {localized("Explore Gifts", "استكشف الهدايا", locale)}
                </Button>
              </LocalizedLink>
              <LocalizedLink href={ROUTES.contact} className="contents">
                <Button size="lg" variant="outline">
                  {localized("Contact customer service", "تواصل مع خدمة العملاء", locale)}
                </Button>
              </LocalizedLink>
            </div>
          </div>
          <div className="relative aspect-4/5 overflow-hidden rounded-3xl">
            <Image
              src={IMG.hero}
              alt={localized("Elegant gift wrapping with ribbon and flowers", "تغليف هدايا أنيق بالشريط والزهور", locale)}
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </Container>
      </section>

      {/* 2 — Feature strip */}
      <Section spacing="md" tone="default">
        <div className="grid gap-6 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="flex items-center gap-4 rounded-3xl border border-ink-100 bg-white p-5">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blush-100 text-bloom-700">
                {f.icon}
              </span>
              <div>
                <p className="font-display text-lg font-medium text-ink-900">{f.title}</p>
                <p className="text-sm text-ink-500">{f.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 3 — About the maison (text + 3-photo gallery, mirrors the client) */}
      <Section spacing="lg" tone="cream">
        <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-end md:gap-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bloom-700">
              {localized("Boutique Notes", "ملاحظات البوتيك", locale)}
            </p>
            <h2 className="mt-3 font-display text-3xl font-medium leading-tight text-ink-900 sm:text-4xl md:text-5xl">
              {localized("Composed by hand, finished with feeling.", "مؤلفة يدويًا، وتُنهى بإحساس.", locale)}
            </h2>
          </div>
          <span className="inline-flex w-fit items-center rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-900 md:justify-self-end">
            {localized("Est. 2024", "تأسس ٢٠٢٤", locale)}
          </span>
        </div>
        <p className="mt-5 max-w-3xl text-lg text-ink-600">
          {localized(
            "{brand} is a {country}-based gift boutique born from a love of small, beautiful moments — the tenderness of a newborn's first keepsake, the quiet luxury of a beauty ritual, and the joy of a perfectly chosen card. Each gift box is curated, wrapped, and signed with care in {city}.",
            "{brand} بوتيك هدايا مقره في {country}، وُلد من حب اللحظات الصغيرة الجميلة — حنان أول تذكار لمولود، وفخامة طقوس العناية الهادئة، وفرحة بطاقة مختارة بعناية. تُنسق كل علبة هدية وتُغلف وتُوقّع بعناية في {city}.",
            locale,
            { brand, country: regionCopy.country, city: regionCopy.city }
          )}
        </p>
        {/* Three tall media photos, exactly as on the client's About page. */}
        <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-6">
          {[
            { src: IMG.media1, alt: localized("Gift boxes composed by hand", "علب هدايا مؤلفة يدويًا", locale) },
            { src: IMG.media2, alt: localized("Beautifully presented gifts", "هدايا بتقديم أنيق", locale) },
            { src: IMG.media3, alt: localized("Curated boutique gifting", "إهداء منسّق من البوتيك", locale) },
          ].map((m) => (
            <div key={m.src} className="relative aspect-4/5 overflow-hidden rounded-2xl sm:rounded-3xl">
              <Image src={m.src} alt={m.alt} fill sizes="(min-width: 640px) 30vw, 33vw" className="object-cover" />
            </div>
          ))}
        </div>
        <dl className="mt-10 grid gap-6 sm:grid-cols-3">
          {points.map((p) => (
            <div key={p.n}>
              <dt className="font-display text-2xl font-medium text-bloom-700">{p.n}</dt>
              <dd className="mt-1">
                <span className="block font-medium text-ink-900">{p.title}</span>
                <span className="mt-1 block text-sm text-ink-600">{p.body}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* 4 — What we believe (text + photo, then value cards) */}
      <Section spacing="lg" tone="default">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bloom-700">
              {localized("What we believe", "بماذا نؤمن", locale)}
            </p>
            <h2 className="mt-3 font-display text-3xl font-medium leading-tight text-ink-900 sm:text-4xl md:text-5xl">
              {localized("A gift should be chosen with care, not picked by chance.", "الهدية تُختار بعناية، لا بالصدفة.", locale)}
            </h2>
            <p className="mt-4 text-lg text-ink-600">
              {localized(
                "At {brand}, we believe every gift carries a message. That's why we focus on thoughtful details that turn gift boxes, flower bouquets, and newborn gifts into meaningful experiences.",
                "في {brand}، نؤمن أن كل هدية تحمل رسالة. لذلك نركز على التفاصيل المدروسة التي تحوّل علب الهدايا وباقات الزهور وهدايا المواليد إلى تجارب ذات معنى.",
                locale,
                { brand }
              )}
            </p>
          </div>
          <div className="relative aspect-4/3 overflow-hidden rounded-3xl">
            <Image
              src={IMG.belief}
              alt={localized("Gift boxes and boutique stationery arranged on a table", "علب هدايا وقرطاسية البوتيك مرتبة على طاولة", locale)}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {beliefs.map((b) => (
            <div key={b.title} className="rounded-3xl border border-ink-100 bg-white p-6">
              <h3 className="font-display text-xl font-medium text-ink-900">{b.title}</h3>
              <p className="mt-2 text-ink-600">{b.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 5 — Story + quote */}
      <Section spacing="lg" tone="cream">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="font-display text-3xl font-medium leading-tight text-ink-900 sm:text-4xl">
              {localized("From a small gifting table to a boutique edit.", "من طاولة هدايا صغيرة إلى بوتيك متكامل.", locale)}
            </h2>
            <p className="mt-5 text-ink-600">
              {localized(
                "We began with the kind of gifts people remember: a carefully wrapped newborn keepsake, a beauty box that makes an ordinary evening softer, a card that says the thing you meant to say.",
                "بدأنا بالهدايا التي يتذكرها الناس: تذكار مولود مُغلف بعناية، وعلبة عناية تجعل أمسية عادية أكثر رقة، وبطاقة تقول ما أردت قوله.",
                locale
              )}
            </p>
            <p className="mt-4 text-ink-600">
              {localized(
                "Today, each {brand} piece is selected, arranged, and finished with the same quiet attention — a gifting experience that feels warm, polished, and personal from the first message to the final ribbon.",
                "واليوم، تُنتقى كل قطعة من {brand} وتُرتب وتُنهى بالعناية الهادئة نفسها — تجربة إهداء دافئة وأنيقة وشخصية من أول رسالة إلى آخر شريطة.",
                locale,
                { brand }
              )}
            </p>
          </div>
          <blockquote className="rounded-3xl bg-ink-900 p-8 text-cream-50 sm:p-10">
            <p className="font-display text-2xl font-medium italic leading-snug sm:text-3xl">
              {localized(
                "The most beautiful gifts do not shout. They arrive with care, detail, and a little bit of wonder.",
                "أجمل الهدايا لا تصرخ. تصل بعناية وتفاصيل وقليل من الدهشة.",
                locale
              )}
            </p>
            <footer className="mt-6 text-sm uppercase tracking-[0.16em] text-cream-50/70">{brand}</footer>
          </blockquote>
        </div>
      </Section>

      {/* 6 — Values */}
      <Section spacing="lg" tone="default">
        <div className="grid gap-8 sm:grid-cols-3">
          {values.map((v) => (
            <div key={v.title}>
              <h3 className="font-display text-2xl font-medium text-ink-900">{v.title}</h3>
              <p className="mt-3 text-ink-600">{v.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 7 — Process */}
      <Section spacing="lg" tone="cream">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bloom-700">
          {localized("How we work", "كيف نعمل", locale)}
        </p>
        <div className="mt-6 grid gap-8 sm:grid-cols-3">
          {process.map((s) => (
            <div key={s.n} className="border-t-2 border-ink-900 pt-5">
              <span className="font-display text-4xl font-medium text-bloom-700">{s.n}</span>
              <h3 className="mt-2 font-display text-xl font-medium text-ink-900">{s.title}</h3>
              <p className="mt-2 text-ink-600">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap gap-3">
          <LocalizedLink href={ROUTES.shop} className="contents">
            <Button size="lg" trailingIcon={<ArrowRight size={16} className="rtl:-scale-x-100" />}>
              {localized("Explore Gifts", "استكشف الهدايا", locale)}
            </Button>
          </LocalizedLink>
          <LocalizedLink href={ROUTES.contact} className="contents">
            <Button size="lg" variant="outline">
              {localized("Contact customer service", "تواصل مع خدمة العملاء", locale)}
            </Button>
          </LocalizedLink>
        </div>
      </Section>
    </>
  );
}
