export const STORAGE_KEYS = {
  authToken: "amoonis.auth.token",
  cart: "amoonis.cart",
  wishlist: "amoonis.wishlist",
  location: "amoonis.location",
  theme: "amoonis.theme",
  // Holds the order returned by guest checkout so the success page can render it
  // without an authenticated refetch (guests can't call GET /orders/:id).
  guestOrder: "amoonis.guestOrder",
  // Prefix (order id appended) marking a GTM "purchase" event already pushed for
  // that order, so a refresh/remount of the confirmation page never double-fires
  // it — see src/lib/gtm.ts.
  gtmPurchaseTrackedPrefix: "amoonis.gtmPurchaseTracked.",
  // Same idea for the Meta Pixel "Purchase" event — see src/lib/metaPixel.ts.
  metaPixelPurchaseTrackedPrefix: "amoonis.metaPixelPurchaseTracked.",
} as const;
