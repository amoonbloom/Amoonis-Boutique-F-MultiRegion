import { http } from "@/services/http";
import type { ApiResponse, PaginatedResponse } from "@/types";
import type {
  ApiSection,
  ApiSectionCreateInput,
  ApiSectionEditorPreview,
  ApiSectionUpdateInput,
} from "../types";

export const sectionsApi = {
  // `zone` is the delivery-zone NAME. A section embeds products/categories, so without
  // it a section payload is a side door around zone hiding on server-rendered pages.
  async list(region?: string, zone?: string): Promise<ApiSection[]> {
    const params: Record<string, string> = {};
    if (region) params.region = region;
    if (zone) params.zone = zone;
    const { data } = await http.get<PaginatedResponse<ApiSection>>("/sections", {
      params: Object.keys(params).length ? params : undefined,
    });
    return data.data;
  },

  async getById(id: string): Promise<ApiSection> {
    const { data } = await http.get<ApiResponse<ApiSection>>(`/sections/${id}`);
    return data.data;
  },

  /** Staff-only: the dynamic auto-grow products (Pin/Hide candidates) + already-hidden
   *  products for a Best Sellers / New Arrivals section. */
  async preview(id: string): Promise<ApiSectionEditorPreview> {
    const { data } = await http.get<ApiResponse<ApiSectionEditorPreview>>(
      `/sections/${id}/preview`
    );
    return data.data;
  },

  async create(payload: ApiSectionCreateInput): Promise<ApiSection> {
    const { data } = await http.post<ApiResponse<ApiSection>>("/sections", payload);
    return data.data;
  },

  async update(id: string, payload: ApiSectionUpdateInput): Promise<ApiSection> {
    const { data } = await http.put<ApiResponse<ApiSection>>(
      `/sections/${id}`,
      payload
    );
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await http.delete(`/sections/${id}`);
  },

  /** Persist admin drag-and-drop order of sections. */
  async reorder(items: { id: string; sortOrder: number }[]): Promise<void> {
    await http.patch("/sections/order", { items });
  },
};
