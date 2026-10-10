import type { Money, Image } from "@/types";

/**
 * Storefront-facing product type. Used by PLP, PDP, cart, and product cards.
 * Backend-aligned shapes for the admin panel and raw API responses live in
 * `./api-types.ts` (`ApiProduct`, `ApiProductCreateInput`, etc.). Phase 3 will
 * migrate storefront consumers off mocks and onto adapted API data.
 */

export interface ProductOptionGroup {
  id: string;
  title: string;
  options: string[];
  /** Optional per-value image URLs (first photo of each set), aligned with `options`. */
  optionImages?: string[];
  /** Optional per-value swatch colours (hex), aligned by index with `options`. */
  optionColors?: string[];
  /** Optional per-value image SETS (array-of-arrays), aligned with `options`. */
  optionImageSets?: string[][];
  /** True when this group's values map 1:1 to `Product.variants` (e.g. "Size") —
   *  picking a value changes price/photos/subtitle, not just the photo. */
  isVariantAxis?: boolean;
}

/** One colour choice available for ONE specific variant (e.g. "Pink" for the Large
 *  size) — entirely independent from any other size's colour list. Never affects
 *  price; picking one only swaps the displayed photo(s). */
export interface ProductVariantColor {
  id: string;
  /** Already localized to the active locale by the adapter. */
  label: string;
  images: string[];
  isDefault: boolean;
}

/** One priced/photographed size (or other single-axis variant) of a product — e.g. the
 *  Small/Medium/Large Graduation Giveaway Box. `optionValue`/`optionValue_ar` match a
 *  value in the product's `isVariantAxis` option group. */
export interface ProductVariant {
  id: string;
  optionValue: string;
  optionValue_ar?: string;
  price: number;
  discountedPrice: number | null;
  images: string[];
  /** Already localized to the active locale by the adapter. */
  subtitle?: string;
  isDefault: boolean;
  /** This variant's own description blocks — empty/absent means it has no override
   *  and shares the product's top-level `descriptions` instead. */
  descriptions?: ProductDescriptionBlock[];
  /** This variant's own colour choices (e.g. Large's Pink/Blue/Red). Empty/absent =
   *  this size offers no colour picker at all — the vast majority of variants. */
  colors?: ProductVariantColor[];
}

/** "From X to Y" price span across a product's variants. */
export interface ProductPriceRange {
  min: number;
  max: number;
}

export interface ProductDescriptionBlock {
  id: string;
  title?: string;
  description: string;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  description: string;
  descriptions?: ProductDescriptionBlock[];
  price: Money;
  compareAtPrice?: Money;
  images: Image[];
  category: string;
  categorySlug: string;
  collection?: string;
  inStock: boolean;
  /** The product's OWN teaser (global / per-region / per-zone, already resolved by the
   *  backend). Such a product STAYS LISTED but shows a "Coming soon" badge and is not
   *  clickable or orderable. */
  comingSoon?: boolean;
  /** Its CATEGORY is a teaser. The whole category is presented as coming soon, so its
   *  products are removed from listings entirely rather than shown with a badge —
   *  which is why this is a separate flag from `comingSoon`. */
  categoryComingSoon?: boolean;
  /** Effective on-sale (own OR category OR an on-sale section it's in): shows a Sale badge. */
  onSale?: boolean;
  /** Resolved Sale-badge text (already localized). Undefined = show the default "Sale". */
  saleLabel?: string;
  badge?: "new" | "bestseller" | "limited" | "sale";
  rating?: number;
  reviewCount?: number;
  options?: ProductOptionGroup[];
  /** Small/Medium/Large-style variants, each with its own price/photos/subtitle.
   *  Absent/empty for the vast majority of products. */
  variants?: ProductVariant[];
  /** "From X to Y" span across variants — present only when `variants` is non-empty. */
  priceRange?: ProductPriceRange;
  tags?: string[];
  /** Free gift-card message add-on, offered per product (most products have it). */
  giftCardEnabled?: boolean;
  giftCardExtraPrice?: number;
  /** Effective gift-card input mode (product ?? category ?? MESSAGE): whether the card
   *  collects a personalized MESSAGE or a single "gift NAME". */
  giftCardMode?: "MESSAGE" | "NAME";
  /** Paid "add a custom name" add-on, offered only on select products. */
  customNameEnabled?: boolean;
  customNamePrice?: number;
  /** Fully-resolved "ships within N day(s)" prep/booking lead time (product ->
   *  category -> site default). Always present on real API-adapted products. */
  deliveryLeadDays?: number;
  /** ISO creation timestamp — drives the "New arrivals" (newest-first) sort. */
  createdAt?: string;
}

export interface ProductFilter {
  category?: string;
  collection?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Selected colour option values (matched against product colour options). */
  colors?: string[];
  search?: string;
  sort?: "featured" | "newest" | "price-asc" | "price-desc";
  inStock?: boolean;
}
