/**
 * Adapters between the canonical backend `ApiProduct` shape and the storefront
 * UI `Product` shape. The backend has no notion of slugs, badges, or
 * collections — those fields stay undefined on the UI side and the components
 * fall back gracefully. URLs use the product's UUID as the slug. `rating`/
 * `reviewCount` ARE backend-aggregated (from the Review table).
 */

import type {
  Product,
  ProductDescriptionBlock,
  ProductOptionGroup,
  ProductVariant,
  ProductVariantColor,
} from "./types";
import type {
  ApiProduct,
  ApiProductDescriptionBlock,
  ApiProductOptionGroup,
  ApiProductVariant,
  ApiProductVariantColor,
} from "./api-types";
import { localized } from "@/i18n";
import type { Locale } from "@/store/slices/ui.slice";

const FALLBACK_CURRENCY = "AED";
const FALLBACK_IMAGE = {
  url: "/placeholder-product.svg",
  alt: "",
};

const adaptDescription = (
  d: ApiProductDescriptionBlock,
  locale: Locale
): ProductDescriptionBlock => ({
  id: d.id,
  title: localized(d.title ?? "", d.title_ar, locale) || undefined,
  description: localized(d.description, d.description_ar, locale),
});

const adaptOption = (
  o: ApiProductOptionGroup,
  locale: Locale
): ProductOptionGroup => ({
  id: o.id,
  title: localized(o.title, o.title_ar, locale),
  options:
    locale === "ar" && o.options_ar?.length ? o.options_ar : o.options ?? [],
  // Images align by index with the canonical `options` order, which also holds
  // for `options_ar` (same order), so no re-indexing is needed per locale.
  optionImages: o.optionImages ?? [],
  // Swatch colours align by the same canonical index.
  optionColors: o.optionColors ?? [],
  // Per-value image sets align by the same canonical index.
  optionImageSets: o.optionImageSets ?? [],
  isVariantAxis: o.isVariantAxis ?? false,
});

const adaptVariantColor = (
  c: ApiProductVariantColor,
  locale: Locale
): ProductVariantColor => ({
  id: c.id,
  label: localized(c.label, c.label_ar, locale),
  images: c.images ?? [],
  isDefault: c.isDefault,
});

const adaptVariant = (v: ApiProductVariant, locale: Locale): ProductVariant => ({
  id: v.id,
  optionValue: v.optionValue,
  optionValue_ar: v.optionValue_ar ?? undefined,
  price: v.price,
  discountedPrice: v.discountedPrice,
  images: v.images ?? [],
  subtitle: localized(v.subtitle ?? "", v.subtitle_ar, locale) || undefined,
  isDefault: v.isDefault,
  descriptions: v.descriptions?.map((d) => adaptDescription(d, locale)),
  colors: v.colors?.map((c) => adaptVariantColor(c, locale)),
});

export interface ToUiProductOptions {
  /** Currency code from `/settings/public` or `/settings`. Defaults to AED. */
  currency?: string;
  /** Active locale — picks Arabic content fields when "ar". */
  locale?: Locale;
}

export function toUiProduct(api: ApiProduct, opts: ToUiProductOptions = {}): Product {
  const currency = opts.currency ?? FALLBACK_CURRENCY;
  const locale = opts.locale ?? "en";
  const title = localized(api.title, api.title_ar, locale);
  const subtitle = localized(api.subtitle ?? "", api.subtitle_ar, locale) || undefined;
  const isOnSale =
    api.discountedPrice != null && api.discountedPrice < api.price;
  const sellAmount = isOnSale ? (api.discountedPrice as number) : api.price;

  // Pull a description from the first description block, falling back to
  // subtitle. Storefront PDPs render the full descriptions[] array as well.
  const firstBlock = api.descriptions?.[0];
  const firstDescription = firstBlock
    ? localized(firstBlock.description, firstBlock.description_ar, locale)
    : "";
  const description = firstDescription || subtitle || "";

  // Storefront uses category title for display + slug for URL; backend has
  // only id + (joined) title. Localize so the category eyebrow renders Arabic.
  const categoryTitle = localized(
    api.category?.title ?? "",
    api.category?.title_ar,
    locale
  );
  const categorySlug = api.categoryId ?? "";

  const images = (api.images ?? []).map((url, i) => ({
    url,
    alt: i === 0 ? title : "",
  }));
  if (images.length === 0 && api.image) {
    images.push({ url: api.image, alt: title });
  }
  if (images.length === 0) {
    images.push(FALLBACK_IMAGE);
  }

  return {
    id: api.id,
    slug: api.id,
    title,
    subtitle,
    description,
    descriptions: api.descriptions?.map((d) => adaptDescription(d, locale)),
    price: { amount: sellAmount, currency },
    compareAtPrice: isOnSale ? { amount: api.price, currency } : undefined,
    images,
    category: categoryTitle,
    categorySlug,
    inStock: api.quantity > 0,
    // The two tiers are kept SEPARATE because they render differently: the product's
    // own teaser stays listed (badge, not clickable), while a category teaser removes
    // its products from listings altogether.
    comingSoon: Boolean(api.comingSoon),
    categoryComingSoon: Boolean(api.category?.comingSoon),
    // Effective on-sale = the product's resolved flag (backend already ORs own/category/
    // section on storefront reads) OR the category cascade as a fallback. Visual only.
    onSale: Boolean(api.onSale || api.category?.onSale),
    saleLabel:
      localized(api.saleLabel ?? "", api.saleLabel_ar, locale) ||
      localized(api.category?.saleLabel ?? "", api.category?.saleLabel_ar, locale) ||
      undefined,
    options: api.productOptions?.map((o) => adaptOption(o, locale)),
    variants: api.variants?.length ? api.variants.map((v) => adaptVariant(v, locale)) : undefined,
    priceRange: api.priceRange ?? undefined,
    giftCardEnabled: api.giftCardEnabled ?? false,
    giftCardExtraPrice: api.giftCardExtraPrice ?? undefined,
    // Effective mode: product override, else category default, else MESSAGE. `??` (not
    // `||`) because null is the "inherit" sentinel — falls through to the category.
    giftCardMode: api.giftCardMode ?? api.category?.giftCardMode ?? "MESSAGE",
    customNameEnabled: api.customNameEnabled ?? false,
    customNamePrice: api.customNamePrice ?? undefined,
    deliveryLeadDays: api.resolvedDeliveryLeadDays ?? undefined,
    createdAt: api.createdAt,
    rating: api.avgRating ?? undefined,
    reviewCount: api.reviewCount ?? undefined,
  };
}

export const toUiProducts = (
  list: ApiProduct[] | undefined,
  opts?: ToUiProductOptions
): Product[] => (list ?? []).map((p) => toUiProduct(p, opts));
