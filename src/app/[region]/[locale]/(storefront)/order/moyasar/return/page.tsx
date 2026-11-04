import { Suspense } from "react";
import { MoyasarReturnClient } from "@/components/checkout/MoyasarReturnClient";

export const metadata = { title: "Confirming payment" };

export default function MoyasarReturnPage() {
  return (
    <Suspense fallback={null}>
      <MoyasarReturnClient />
    </Suspense>
  );
}
