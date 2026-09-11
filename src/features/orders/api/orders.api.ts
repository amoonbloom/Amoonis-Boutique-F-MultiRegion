import { http } from "@/services/http";
import { filenameFromContentDisposition } from "@/lib/download";
import type { ApiResponse, PaginatedResponse } from "@/types";
import type {
  ApiAdminOrderHistoryParams,
  ApiCheckoutInput,
  ApiGuestCheckoutInput,
  ApiOrder,
  ApiOrderExportParams,
  ApiOrderHistoryParams,
  ApiOrderListRow,
  ApiOrderStatusLite,
  OrderStatus,
} from "../types";

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

  // Start online payment for a PENDING_PAYMENT order whose paymentMethod is MYFATOORAH.
  // Returns the MyFatoorah hosted-page URL — redirect the browser there; Apple Pay shows
  // on iPhone/Safari, cards everywhere. The backend re-verifies server-side on return.
  async pay(
    id: string,
    opts: { returnUrl?: string } = {}
  ): Promise<{ paymentUrl: string; invoiceId: string | null }> {
    const { data } = await http.post<
      ApiResponse<{ paymentUrl: string; invoiceId: string | null }>
    >(`/orders/${id}/pay`, opts.returnUrl ? { returnUrl: opts.returnUrl } : {});
    return data.data;
  },

  // Start online payment for a GUEST order (no login). Public endpoint — resolves the order
  // by id where it has no owner. Same shape as pay(); used by the guest checkout flow.
  async guestPay(
    id: string,
    opts: { returnUrl?: string } = {}
  ): Promise<{ paymentUrl: string; invoiceId: string | null }> {
    const { data } = await http.post<
      ApiResponse<{ paymentUrl: string; invoiceId: string | null }>
    >(`/orders/${id}/guest-pay`, opts.returnUrl ? { returnUrl: opts.returnUrl } : {});
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
