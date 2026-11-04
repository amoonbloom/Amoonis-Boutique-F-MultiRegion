export const ROUTES = {
  home: "/",
  shop: "/shop",
  category: (slug: string) => `/shop?category=${slug}`,
  product: (slug: string) => `/shop/${slug}`,
  cart: "/cart",
  checkout: "/checkout",
  orderSuccess: "/order/success",
  orderError: "/order/error",
  orderStatus: "/order/status",
  /** Moyasar embedded card form — customer stays on our domain. */
  orderPay: "/order/pay",
  /** Moyasar form callback_url target (after 3DS / pay). */
  orderMoyasarReturn: "/order/moyasar/return",
  account: "/account",
  orders: "/account/orders",
  wishlist: "/account/wishlist",
  notifications: "/account/notifications",
  login: "/login",
  register: "/register",
  signup: "/signup",
  about: "/about",
  contact: "/contact",
  branches: "/branches",
  privacy: "/privacy",
  terms: "/terms",
  refundPolicy: "/refund-policy",
  productDisclaimer: "/product-disclaimer",
  shippingPolicy: "/shipping-policy",
  admin: "/admin",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
