import { Suspense } from "react";
import { MoyasarPayClient } from "@/components/checkout/MoyasarPayClient";

export const metadata = { title: "Pay for your order" };

export default function OrderPayPage() {
  return (
    <Suspense fallback={null}>
      <MoyasarPayClient />
    </Suspense>
  );
}
