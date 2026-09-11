"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ordersApi } from "@/features/orders/api/orders.api";
import { regionsApi } from "@/features/regions/api/regions.api";
import { queryKeys } from "@/services/queryKeys";
import { Badge, Button } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import { Select } from "@/components/admin/Select";
import { DownloadIcon } from "@/components/icons";
import { formatCurrency, formatDate, addDays } from "@/lib/format";
import { useT } from "@/i18n/useT";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL_KEY,
  ORDER_STATUS_TONE,
} from "./orderStatus";
import { orderPaymentContext } from "@/features/orders/constants";
import { OrderExportDialog } from "./OrderExportDialog";
import { customerName, customerEmail, customerLabel, isGuestOrder } from "./orderCustomer";
import type { ApiOrderListRow, OrderStatus } from "@/features/orders/types";

const PAGE_SIZE = 20;

function lineItemCount(o: ApiOrderListRow): number {
  if (typeof o.itemCount === "number") return o.itemCount;
  if (Array.isArray(o.items)) {
    return o.items.reduce((sum, i) => sum + (i?.quantity ?? 0), 0);
  }
  return 0;
}

export function OrdersAdminPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | "ALL">("ALL");
  const [region, setRegion] = useState<string>("ALL");
  const [exportOpen, setExportOpen] = useState(false);
  const router = useRouter();
  const { t } = useT();

  const regionsQuery = useQuery({
    queryKey: queryKeys.regions.list(),
    queryFn: () => regionsApi.list(),
  });

  const params = {
    page,
    limit: PAGE_SIZE,
    ...(status === "ALL" ? {} : { status }),
    ...(region === "ALL" ? {} : { region }),
  };

  const query = useQuery({
    queryKey: queryKeys.orders.adminList(params),
    queryFn: () => ordersApi.listAdmin(params),
  });

  const columns: Column<ApiOrderListRow>[] = [
    {
      key: "id",
      header: t("admin.ordersPage.columnOrder"),
      cell: (o) => (
        <span className="font-mono text-xs text-ink-700">{o.id.slice(0, 8)}</span>
      ),
    },
    {
      key: "customer",
      header: t("admin.ordersPage.columnCustomer"),
      cell: (o) => (
        <div className="max-w-56">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-ink-900">{customerLabel(o)}</p>
            {isGuestOrder(o) ? (
              <Badge tone="neutral">{t("admin.ordersPage.guest")}</Badge>
            ) : null}
          </div>
          {customerName(o) && customerEmail(o) ? (
            <p className="truncate text-xs text-ink-500">{customerEmail(o)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "items",
      header: t("admin.ordersPage.columnItems"),
      cell: (o) => <span className="text-ink-700">{lineItemCount(o)}</span>,
    },
    {
      key: "status",
      header: t("admin.status"),
      cell: (o) => {
        // Payment context (COD vs failed online, etc.) alongside the fulfilment
        // status, so the sales team can triage a PENDING_PAYMENT row at a glance.
        const pay = orderPaymentContext(o.paymentMethod, o.paymentStatus);
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge tone={ORDER_STATUS_TONE[o.status]}>
              {t(ORDER_STATUS_LABEL_KEY[o.status])}
            </Badge>
            <Badge tone={pay.tone}>{t(pay.labelKey)}</Badge>
          </div>
        );
      },
    },
    {
      key: "region",
      header: t("admin.ordersPage.columnRegion"),
      cell: (o) =>
        o.region ? (
          <span className="text-xs font-medium text-ink-700">{o.region.code}</span>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: "delivery",
      header: t("admin.ordersPage.columnDelivery"),
      cell: (o) => {
        // Scheduled orders show the customer's chosen date (date only, no time).
        if (o.deliveryType === "SCHEDULED" && o.scheduledDeliveryAt) {
          return <span className="text-xs text-ink-700">{formatDate(o.scheduledDeliveryAt)}</span>;
        }
        // Standard orders show the estimated arrival date (createdAt + ETA snapshot),
        // matching the order-detail page. Legacy orders with no ETA fall back to the label.
        if (o.estimatedDeliveryDays != null) {
          return (
            <span className="text-xs text-ink-700">
              {formatDate(addDays(o.createdAt, o.estimatedDeliveryDays))}
            </span>
          );
        }
        return <span className="text-xs text-ink-500">{t("admin.ordersPage.standardDelivery")}</span>;
      },
    },
    {
      key: "date",
      header: t("admin.ordersPage.columnPlaced"),
      cell: (o) => <span className="text-ink-500">{formatDate(o.createdAt)}</span>,
    },
    {
      key: "total",
      header: t("common.total"),
      align: "right",
      cell: (o) => (
        <span className="font-medium text-ink-900">
          {formatCurrency(o.totalAmount, o.currency ?? "AED")}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("admin.ordersPage.title")}
        description={t("admin.ordersPage.description")}
        actions={
          <Button
            variant="outline"
            leadingIcon={<DownloadIcon size={16} />}
            onClick={() => setExportOpen(true)}
          >
            {t("admin.ordersPage.exportButton")}
          </Button>
        }
      />

      <OrderExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        initialStatus={status}
        initialRegion={region}
        regionOptions={(regionsQuery.data ?? []).map((r) => ({ value: r.code, label: r.name }))}
      />

      <DataTable
        columns={columns}
        rows={query.data?.data}
        rowKey={(o) => o.id}
        isLoading={query.isPending}
        isError={query.isError}
        error={query.error}
        emptyTitle={t("admin.ordersPage.emptyTitle")}
        onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
        toolbar={
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium uppercase tracking-wider text-ink-500">
              {t("admin.status")}
            </label>
            <Select
              value={status}
              onChange={(v) => {
                setStatus(v as OrderStatus | "ALL");
                setPage(1);
              }}
              aria-label={t("admin.status")}
              options={[
                { value: "ALL", label: t("admin.ordersPage.allOption") },
                ...ORDER_STATUSES.map((s) => ({
                  value: s,
                  label: t(ORDER_STATUS_LABEL_KEY[s]),
                })),
              ]}
            />

            <label className="ms-2 text-xs font-medium uppercase tracking-wider text-ink-500">
              {t("admin.ordersPage.columnRegion")}
            </label>
            <Select
              value={region}
              onChange={(v) => {
                setRegion(v);
                setPage(1);
              }}
              aria-label={t("admin.ordersPage.columnRegion")}
              options={[
                { value: "ALL", label: t("admin.ordersPage.allRegionsOption") },
                ...(regionsQuery.data ?? []).map((r) => ({
                  value: r.code,
                  label: r.name,
                })),
              ]}
            />
          </div>
        }
        footer={
          <Pagination
            meta={query.data?.meta?.pagination}
            page={page}
            onChange={setPage}
          />
        }
      />
    </div>
  );
}
