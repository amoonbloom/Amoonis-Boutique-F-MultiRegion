/**
 * Order types — match `toOrderResponsePayload` in
 * Amoonis-Boutique-B/src/services/order.service.js.
 */

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PROCESSING"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED"
  | "FAILED"
  | "DRAFT";

// The web only initiates COD, but the backend can return MYFATOORAH on orders
// placed via other clients (e.g. mobile) that the web may still display.
export type PaymentMethod = "COD" | "MYFATOORAH";

/** STANDARD (default) or SCHEDULED (customer picked a future date/time at checkout). */
export type DeliveryType = "STANDARD" | "SCHEDULED";

export type PaymentStatus = "UNPAID" | "PAID" | "FAILED";

/** Matches `toOrderResponsePayload`'s actual `?? null` mapping — every field
 * here can genuinely be null (e.g. every legacy field is null for an order
 * placed through the current area/zone-based checkout). Never assume a field
 * is present without checking; UI that reads this should prefer `area`/
 * `deliveryZoneName` and fall back to the legacy fields for older orders. */
export interface OrderShippingAddress {
  fullName: string | null;
  phone: string | null;
  streetAddress: string | null;
  apartment: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  /** Neighborhood/community free text — the checkout form's primary location field. */
  area: string | null;
  /** Zone (e.g. emirate) name, snapshot at checkout time — not a live reference. */
  deliveryZoneName: string | null;
}

/** Inline address sent when placing an order — the current checkout form's
 * minimal field set. Distinct from `OrderShippingAddress` (the fuller response
 * shape, which also carries legacy fields from before this feature existed). */
export interface OrderShippingAddressInput {
  fullName: string;
  phone: string;
  area: string;
  deliveryZoneId?: string;
}

export interface OrderItemProductSnapshot {
  id: string | null;
  title: string;
  title_ar: string | null;
  subtitle: string | null;
  subtitle_ar: string | null;
  image: string | null;
  images: string[];
  descriptions: Array<{
    id: string;
    title: string | null;
    title_ar: string | null;
    description: string;
    description_ar: string | null;
  }>;
  productOptions: Array<{
    id: string;
    title: string;
    title_ar: string | null;
    options: string[];
    options_ar: string[];
  }>;
  deleted?: boolean;
}

export interface ApiOrderItem {
  id: string;
  productId: string | null;
  product: OrderItemProductSnapshot | null;
  quantity: number;
  perProductMessage: string | null;
  price: number;
  /** Chosen variant, e.g. {"Colour":"Pink"}. Null for orders placed before this was captured. */
  selectedOptions?: Record<string, string> | null;
  /** Photo of the chosen variant (backend-derived), or null to use the product snapshot's image. */
  selectedImage?: string | null;
  /** Gift-card/custom-name add-ons chosen at add-to-cart time, snapshotted at order time. */
  giftCardSelected?: boolean;
  /** Resolved gift-card input mode snapshot ("MESSAGE" | "NAME"), for labeling. */
  giftCardMode?: "MESSAGE" | "NAME" | null;
  customName?: string | null;
  /** Per-line cash arrangement snapshot (PER UNIT — line total is each × quantity). */
  cashArrangementRequested?: boolean;
  cashArrangementAmount?: number | null;
  cashArrangementDenomination?: number | null;
  cashArrangementNote?: string | null;
  cashArrangementFeeAmount?: number | null;
  cashArrangementFeeVatAmount?: number | null;
  /** This line's VAT rate/amount, snapshotted at order time. 0 when the line wasn't taxable. */
  vatRatePercent?: number;
  vatAmount?: number;
  /** Resolved "ships within N day(s)" prep/booking lead time, snapshotted at order
   *  creation time (product -> category -> site default). Null for legacy orders
   *  placed before this feature existed. */
  resolvedLeadDays?: number | null;
}

export interface ApiOrderListUser {
  id: string;
  email: string;
  /** Backend sends a single fullName; first/last are mirrored by the auth adapter. */
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * The full payload returned for `GET /orders/:id` and on order create/update.
 * List endpoints return a lighter row (no `items`/`shippingAddress`) — see
 * `ApiOrderListRow` below.
 */
export interface ApiOrder {
  id: string;
  /** Human-friendly sequential order number (e.g. 1004). */
  orderNumber: number | null;
  /** Null for guest (unauthenticated) orders until linked to an account. */
  userId: string | null;
  /** Guest contact snapshot — present only on guest orders (userId null). */
  guestName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  orderMessage: string | null;
  totalAmount: number;
  discountAmount: number | null;
  /** Flat delivery fee charged on this order (snapshot of the region's rate at
   * checkout). Already included in totalAmount. 0 for legacy/free-shipping orders. */
  shippingAmount?: number;
  /** STANDARD (default) or SCHEDULED. Undefined/absent on legacy orders — treat as STANDARD. */
  deliveryType?: DeliveryType;
  /** Customer-chosen future date/time. Only set when deliveryType is SCHEDULED. */
  scheduledDeliveryAt?: string | null;
  /** Snapshot of the region's standard delivery days at checkout time. Only set when
   * deliveryType is STANDARD; null for legacy orders or when the region had no ETA configured. */
  estimatedDeliveryDays?: number | null;
  /** Concrete resolved STANDARD arrival date ("YYYY-MM-DD", region tz) — display directly,
   * no timezone drift. Null for SCHEDULED / legacy orders. */
  estimatedDeliveryDate?: string | null;
  /** Pre-VAT, pre-discount line sum. Null for legacy orders placed before VAT. */
  subtotalAmount?: number | null;
  /** Total VAT — included in totalAmount for exclusive VAT, extracted (informational) for inclusive VAT. 0 when no VAT applied. */
  taxAmount?: number;
  /** Alias of taxAmount — kept for readability at call sites. */
  vatAmount?: number;
  /** The rate applied at order time, e.g. 5 for 5%. Null when no VAT applied. */
  vatRatePercent?: number | null;
  /** True when the VAT was already included in the catalogue price (nothing added at checkout). */
  vatInclusive?: boolean;
  /** Whether the customer requested a cash arrangement on this order. */
  cashArrangementRequested?: boolean;
  /** Raw cash amount requested (never taxed) — null when not requested. */
  cashArrangementAmount?: number | null;
  /** Customer's preferred banknote denomination — informational only, never affects price. */
  cashArrangementDenomination?: number | null;
  /** Free-text note specific to the cash-arrangement request (separate from orderMessage). */
  cashArrangementNote?: string | null;
  /** Pre-VAT service fee charged for arranging the cash. Already folded into totalAmount. */
  cashArrangementFeeAmount?: number | null;
  /** VAT on cashArrangementFeeAmount ONLY (never on cashArrangementAmount) — already folded into taxAmount. */
  cashArrangementFeeVatAmount?: number | null;
  appliedPromoCode: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** Currency the order was totaled/charged in (e.g. "AED", "SAR"). */
  currency?: string;
  /** Region the order was placed in. */
  regionId?: string | null;
  status: OrderStatus;
  shippingAddress: OrderShippingAddress | null;
  inventoryDeducted: boolean;
  createdAt: string;
  updatedAt: string;
  items: ApiOrderItem[];
}

/**
 * Lighter row returned by list endpoints (`GET /orders`, `GET /orders/history`,
 * `GET /orders/admin/history`). Backend rolls items up into `itemCount` and
 * omits the shipping address. Optional `user` is present on admin endpoints.
 */
export interface ApiOrderListRegion {
  id: string;
  code: string;
  name: string;
}

export interface ApiOrderListRow {
  id: string;
  orderNumber: number | null;
  /** Null for guest orders. */
  userId: string | null;
  user?: ApiOrderListUser;
  /** Guest contact snapshot — present only on guest orders (no linked user). */
  guestName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  orderMessage: string | null;
  totalAmount: number;
  subtotalAmount?: number | null;
  taxAmount?: number;
  vatAmount?: number;
  vatRatePercent?: number | null;
  vatInclusive?: boolean;
  cashArrangementRequested?: boolean;
  cashArrangementAmount?: number | null;
  cashArrangementDenomination?: number | null;
  cashArrangementNote?: string | null;
  cashArrangementFeeAmount?: number | null;
  cashArrangementFeeVatAmount?: number | null;
  /** Currency the order was totaled in (e.g. "AED", "SAR"). Defaults to AED for legacy orders. */
  currency?: string;
  /** STANDARD (default) or SCHEDULED. Undefined/absent on legacy orders — treat as STANDARD. */
  deliveryType?: DeliveryType;
  /** Customer-chosen future date/time. Only set when deliveryType is SCHEDULED. */
  scheduledDeliveryAt?: string | null;
  /** Snapshot of the region's standard delivery days at checkout time. Only set when
   * deliveryType is STANDARD. */
  estimatedDeliveryDays?: number | null;
  /** Region the order was placed in. */
  region?: ApiOrderListRegion | null;
  status: OrderStatus;
  /** Payment state snapshot. Absent on legacy list rows — treat as UNPAID. */
  paymentStatus?: PaymentStatus;
  /** How the customer chose to pay (COD vs online). Absent on legacy list rows — treat as COD. */
  paymentMethod?: PaymentMethod;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  items?: ApiOrderItem[];
}

export interface ApiOrderStatusLite {
  id: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  totalAmount: number;
  /** Order's stamped currency (e.g. "SAR"). Defaults to AED for legacy orders. */
  currency?: string;
  /** Mirrors order.service status snapshot exactly. */
  progress: {
    currentStep: OrderStatus;
    isTerminal: boolean;
    typicalFlow: OrderStatus[];
    stepIndex: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

/** Optional PER-UNIT "Add cash arrangement" request on a cart/order line. Absent or
 *  `cashAmount` <= 0 means no cash for that line. */
export interface ApiCashArrangementRequestInput {
  cashAmount: number;
  /** Must be one of the region's configured denomination presets — no custom option. */
  denomination?: number;
  /** Free-text note specific to this cash request, capped at 500 chars server-side. */
  note?: string;
}

export interface ApiCheckoutInput {
  addressId?: string;
  shippingAddress?: OrderShippingAddressInput;
  paymentMethod?: PaymentMethod;
  promoCode?: string;
  /** Defaults to STANDARD on the backend when omitted. */
  deliveryType?: DeliveryType;
  /** Required (and validated as 1-60 days out) when deliveryType is SCHEDULED. ISO datetime. */
  scheduledDeliveryAt?: string;
  // Cash arrangement is per-line and lives on the server CART for signed-in users — not sent here.
}

export interface ApiGuestCheckoutItem {
  productId: string;
  quantity: number;
  message?: string | null;
  selectedOptions?: Record<string, string> | null;
  giftCardSelected?: boolean;
  customName?: string | null;
  /** Per-unit cash arrangement for this item. */
  cashArrangement?: ApiCashArrangementRequestInput;
}

/** Body for `POST /orders/guest-checkout` (unauthenticated). */
export interface ApiGuestCheckoutInput {
  items: ApiGuestCheckoutItem[];
  shippingAddress: OrderShippingAddressInput;
  /** Optional — enables the confirmation email and links the order on sign-up. */
  email?: string;
  orderMessage?: string;
  promoCode?: string;
  /** Defaults to STANDARD on the backend when omitted. */
  deliveryType?: DeliveryType;
  /** Required (and validated as 1-60 days out) when deliveryType is SCHEDULED. ISO datetime. */
  scheduledDeliveryAt?: string;
  /** COD (default) or MYFATOORAH. For MYFATOORAH, follow up with ordersApi.guestPay(order.id). */
  paymentMethod?: PaymentMethod;
  // Cash arrangement is per-item — see ApiGuestCheckoutItem.cashArrangement.
}

export interface ApiOrderHistoryParams {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  /** Admin-only region filter — region code (e.g. "UAE", "SA"). */
  region?: string;
}

export interface ApiAdminOrderHistoryParams extends ApiOrderHistoryParams {
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  includeItems?: boolean;
}

/** Params for `GET /orders/export` (admin/manager, ORDERS permission). */
export interface ApiOrderExportParams {
  dateFrom: string;
  dateTo: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  region?: string;
  format: "xlsx" | "pdf" | "csv";
}
