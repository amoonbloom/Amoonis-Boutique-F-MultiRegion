import { http } from "@/services/http";
import type { ApiResponse, PaginatedResponse } from "@/types";
import type {
  ApiCategory,
  ApiCategoryCreateInput,
  ApiCategoryDetail,
  ApiCategoryUpdateInput,
} from "../api-types";

export const categoriesApi = {
  // `zone` is the selected delivery-zone NAME. Server components have no cookies on
  // the outgoing request, so the zone travels as a query param there, exactly like
  // `region` does; browser calls get it automatically as an X-Zone header instead.
  // Needed so zone-hidden categories don't leak into server-rendered surfaces (home
  // page grid, shop sidebar).
  async list(region?: string, zone?: string): Promise<ApiCategory[]> {
    const params: Record<string, string> = {};
    if (region) params.region = region;
    if (zone) params.zone = zone;
    const { data } = await http.get<PaginatedResponse<ApiCategory>>("/categories", {
      params: Object.keys(params).length ? params : undefined,
    });
    return data.data;
  },

  async getById(id: string, region?: string, zone?: string): Promise<ApiCategoryDetail> {
    const params: Record<string, string> = {};
    if (region) params.region = region;
    if (zone) params.zone = zone;
    const { data } = await http.get<ApiResponse<ApiCategoryDetail>>(
      `/categories/${id}`,
      { params: Object.keys(params).length ? params : undefined }
    );
    return data.data;
  },

  async create(payload: ApiCategoryCreateInput): Promise<ApiCategory> {
    const { data } = await http.post<ApiResponse<ApiCategory>>("/categories", payload);
    return data.data;
  },

  async update(id: string, payload: ApiCategoryUpdateInput): Promise<ApiCategory> {
    const { data } = await http.put<ApiResponse<ApiCategory>>(`/categories/${id}`, payload);
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/categories/${id}`);
  },

  /**
   * Persist a drag-reorder of the store-wide category display order. Send every
   * category with its new 0-based `sortOrder`; the storefront home grid + menus
   * follow this order. Global (not per-region), unlike delivery zones.
   */
  async reorder(items: { id: string; sortOrder: number }[]): Promise<void> {
    await http.patch("/categories/order", { items });
  },
};
