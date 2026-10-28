export const STORAGE_KEYS = {
  authToken: "amoonis.auth.token",
  cart: "amoonis.cart",
  wishlist: "amoonis.wishlist",
  location: "amoonis.location",
  theme: "amoonis.theme",
  // Holds the order returned by guest checkout so the success page can render it
  // without an authenticated refetch (guests can't call GET /orders/:id).
  guestOrder: "amoonis.guestOrder",
  // Order id written right before redirecting to Tabby/MyFatoorah. If the guest
  // pays and closes the tab (never hits the success page), the next site visit
  // polls /orders/:id/status and clears the local cart once PAID (webhook path).
  pendingOnlineOrder: "amoonis.pendingOnlineOrder",
  // Prefix (order id appended) marking a GTM "purchase" event already pushed for
  // that order, so a refresh/remount of the confirmation page never double-fires
  // it — see src/lib/gtm.ts.
  gtmPurchaseTrackedPrefix: "amoonis.gtmPurchaseTracked.",
  // Same idea for the Meta Pixel "Purchase" event — see src/lib/metaPixel.ts.
  metaPixelPurchaseTrackedPrefix: "amoonis.metaPixelPurchaseTracked.",
} as const;
