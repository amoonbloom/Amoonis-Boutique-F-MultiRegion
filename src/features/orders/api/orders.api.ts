import { http } from "@/services/http";
import { filenameFromContentDisposition } from "@/lib/download";
import type { ApiResponse, PaginatedResponse } from "@/types";
import type {
  ApiAdminOrderHistoryParams,
  ApiCheckoutInput,
  ApiExpressCheckoutInput,
  ApiGuestCheckoutInput,
  ApiOrder,
  ApiOrderExportParams,
  ApiOrderHistoryParams,
  ApiOrderListRow,
  ApiOrderStatusLite,
  MoyasarFormBootstrap,
  OrderStatus,
  StartOnlinePaymentResult,
} from "../types";

function normalizePayResult(
  raw: Partial<StartOnlinePaymentResult> | null | undefined,
  fallbackOrderId: string
): StartOnlinePaymentResult {
  const mode = raw?.mode === "embedded" ? "embedded" : "redirect";
  return {
    mode,
    paymentUrl: raw?.paymentUrl ?? null,
    invoiceId: raw?.invoiceId ?? null,
    form: raw?.form ?? null,
    orderId: raw?.orderId || fallbackOrderId,
  };
}

export const ordersApi = {
  // --- Customer ---
  async checkout(payload: ApiCheckoutInput): Promise<ApiOrder> {
    const { data } = await http.post<ApiResponse<ApiOrder>>(
      "/orders/checkout",
      payload
    );
    return data.data;
  },

  // --- Guest (no authentication) ---
  // Items travel in the body (guests have no server cart); recipient identity
  // comes from shippingAddress + optional email. Payment is always COD.
  async guestCheckout(payload: ApiGuestCheckoutInput): Promise<ApiOrder> {
    const { data } = await http.post<ApiResponse<ApiOrder>>(
      "/orders/guest-checkout",
      payload
    );
    return data.data;
  },

  /** PDP Apple Pay express — creates an order without touching the cart. Sends
   *  the auth token when present (http interceptor) so the order is linked. */
  async expressCheckout(payload: ApiExpressCheckoutInput): Promise<ApiOrder> {
    const { data } = await http.post<ApiResponse<ApiOrder>>(
      "/orders/express-checkout",
      payload
    );
    return data.data;
  },

  /**
   * Price items WITHOUT creating an order (shipping + VAT + optional cash).
   * Used for the Apple Pay sheet total before authorize-time order create.
   */
  async quote(payload: {
    items: ApiExpressCheckoutInput["items"];
    shippingAddress?: ApiExpressCheckoutInput["shippingAddress"];
    promoCode?: string;
  }): Promise<{
    totalAmount: number;
    currency: string;
    subtotalAmount: number;
    shippingAmount: number;
    taxAmount: number;
  }> {
    const { data } = await http.post<
      ApiResponse<{
        totalAmount: number;
        currency: string;
        subtotalAmount: number;
        shippingAmount: number;
        taxAmount: number;
      }>
    >("/orders/quote", payload);
    return data.data;
  },

  /** Cancel an unpaid online order after Apple Pay / card failure (clears admin orphans). */
  async abandonUnpaidOrder(orderId: string): Promise<void> {
    await http.post(`/orders/${orderId}/abandon-unpaid`);
  },

  /** Overwrite shipping/guest contact from Apple Pay Wallet after authorization. */
  async updateExpressContact(
    orderId: string,
    payload: { fullName: string; phone: string; email?: string }
  ): Promise<
    Pick<
      ApiOrder,
      | "id"
      | "orderNumber"
      | "totalAmount"
      | "currency"
      | "status"
      | "paymentStatus"
    >
  > {
    const { data } = await http.patch<
      ApiResponse<
        Pick<
          ApiOrder,
          | "id"
          | "orderNumber"
          | "totalAmount"
          | "currency"
          | "status"
          | "paymentStatus"
        >
      >
    >(`/orders/${orderId}/express-contact`, payload);
    return data.data;
  },

  async myHistory(
    params: ApiOrderHistoryParams = {}
  ): Promise<PaginatedResponse<ApiOrderListRow>> {
    const { data } = await http.get<PaginatedResponse<ApiOrderListRow>>(
      "/orders/history",
      { params }
    );
    return data;
  },

  async getById(id: string): Promise<ApiOrder> {
    const { data } = await http.get<ApiResponse<ApiOrder>>(`/orders/${id}`);
    return data.data;
  },

  /** Publishable key + CDN for the checkout-inline Moyasar form (no secret). */
  async getMoyasarFormConfig(): Promise<MoyasarFormBootstrap> {
    const { data } = await http.get<ApiResponse<MoyasarFormBootstrap>>(
      "/orders/payment/moyasar/form-config"
    );
    return data.data;
  },

  // Start online payment for a PENDING_PAYMENT order (MYFATOORAH / MOYASAR / TABBY).
  // MyFatoorah/Tabby → mode=redirect + paymentUrl. Moyasar → mode=embedded + form config
  // (card form mounts inline on checkout — customer stays on our site).
  async pay(
    id: string,
    opts: { returnUrl?: string; lang?: "en" | "ar" } = {}
  ): Promise<StartOnlinePaymentResult> {
    const body: { returnUrl?: string; lang?: "en" | "ar" } = {};
    if (opts.returnUrl) body.returnUrl = opts.returnUrl;
    if (opts.lang) body.lang = opts.lang;
    const { data } = await http.post<ApiResponse<StartOnlinePaymentResult>>(
      `/orders/${id}/pay`,
      body
    );
    return normalizePayResult(data.data, id);
  },

  // Start online payment for a GUEST order (no login). Public endpoint — resolves the order
  // by id where it has no owner. Same shape as pay(); used by the guest checkout flow.
  async guestPay(
    id: string,
    opts: { returnUrl?: string; lang?: "en" | "ar" } = {}
  ): Promise<StartOnlinePaymentResult> {
    const body: { returnUrl?: string; lang?: "en" | "ar" } = {};
    if (opts.returnUrl) body.returnUrl = opts.returnUrl;
    if (opts.lang) body.lang = opts.lang;
    const { data } = await http.post<ApiResponse<StartOnlinePaymentResult>>(
      `/orders/${id}/guest-pay`,
      body
    );
    return normalizePayResult(data.data, id);
  },

  /** Persist Moyasar payment id from embedded form on_completed (authenticated). */
  async attachMoyasarPayment(orderId: string, paymentId: string): Promise<void> {
    await http.post(`/orders/${orderId}/moyasar/attach`, { paymentId });
  },

  /** Persist Moyasar payment id for a guest order. */
  async attachMoyasarGuestPayment(orderId: string, paymentId: string): Promise<void> {
    await http.post(`/orders/${orderId}/moyasar/guest-attach`, { paymentId });
  },

  /**
   * Re-verify a Moyasar payment after the form redirects back to our return page.
   * Never trust query-string status alone.
   */
  async confirmMoyasarPayment(opts: {
    paymentId?: string;
    orderId?: string;
  }): Promise<{ isPaid: boolean; orderId: string | null; status: string | null }> {
    const { data } = await http.post<
      ApiResponse<{ isPaid: boolean; orderId: string | null; status: string | null }>
    >(`/orders/payment/moyasar/confirm`, opts);
    return data.data;
  },

  async getStatus(id: string): Promise<ApiOrderStatusLite> {
    const { data } = await http.get<ApiResponse<ApiOrderStatusLite>>(
      `/orders/${id}/status`
    );
    return data.data;
  },

  // --- Admin / Manager (ORDERS permission) ---
  async listAdmin(
    params: ApiOrderHistoryParams = {}
  ): Promise<PaginatedResponse<ApiOrderListRow>> {
    const { data } = await http.get<PaginatedResponse<ApiOrderListRow>>(
      "/orders",
      {
        params,
      }
    );
    return data;
  },

  async adminHistory(
    params: ApiAdminOrderHistoryParams = {}
  ): Promise<PaginatedResponse<ApiOrderListRow>> {
    const { data } = await http.get<PaginatedResponse<ApiOrderListRow>>(
      "/orders/admin/history",
      { params }
    );
    return data;
  },

  async updateStatus(id: string, status: OrderStatus): Promise<ApiOrder> {
    const { data } = await http.patch<ApiResponse<ApiOrder>>(
      `/orders/${id}/status`,
      { status }
    );
    return data.data;
  },

  // Streams a SINGLE order's invoice as a file (currently Excel only — the PDF
  // is generated client-side from the rendered invoice so Arabic shapes for
  // free). `lang` picks the invoice's language independently of the admin's UI
  // locale. Returns the server's filename (Content-Disposition) with the blob.
  async invoiceFile(
    id: string,
    params: { format: "xlsx"; lang: "en" | "ar" }
  ): Promise<{ blob: Blob; filename: string }> {
    const response = await http.get<Blob>(`/orders/${id}/invoice`, {
      params,
      responseType: "blob",
    });
    return {
      blob: response.data,
      filename: filenameFromContentDisposition(
        response.headers["content-disposition"],
        `invoice-${id}.${params.format}`
      ),
    };
  },

  // Streams the Excel/PDF report directly as the response body. Returns the
  // server's own filename (from Content-Disposition) alongside the blob so
  // callers don't need to invent one — pairs with lib/download.ts.
  async exportFile(
    params: ApiOrderExportParams
  ): Promise<{ blob: Blob; filename: string }> {
    const response = await http.get<Blob>("/orders/export", {
      params,
      responseType: "blob",
    });
    return {
      blob: response.data,
      filename: filenameFromContentDisposition(
        response.headers["content-disposition"],
        `orders-export.${params.format}`
      ),
    };
  },
};
