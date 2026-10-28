import { STORAGE_KEYS } from "@/constants/storage-keys";
import { storage } from "@/lib/storage";

/** Drop pending markers older than this — abandoned Tabby tabs shouldn't linger forever. */
const MAX_AGE_MS = 1000 * 60 * 60 * 48; // 48h

export type PendingOnlineOrder = {
  orderId: string;
  at: number;
};

export function readPendingOnlineOrder(): PendingOnlineOrder | null {
  const raw = storage.get<PendingOnlineOrder>(STORAGE_KEYS.pendingOnlineOrder);
  if (!raw?.orderId || typeof raw.at !== "number") return null;
  if (Date.now() - raw.at > MAX_AGE_MS) {
    clearPendingOnlineOrder();
    return null;
  }
  return raw;
}

export function writePendingOnlineOrder(orderId: string): void {
  if (!orderId) return;
  storage.set(STORAGE_KEYS.pendingOnlineOrder, {
    orderId,
    at: Date.now(),
  } satisfies PendingOnlineOrder);
}

export function clearPendingOnlineOrder(): void {
  storage.remove(STORAGE_KEYS.pendingOnlineOrder);
}
