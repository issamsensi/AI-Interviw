import { Suspense } from "react";
import RapportClient from "./RapportClient";

export default function RapportPage() {
  return (
    <Suspense fallback={<p>Chargement du rapport…</p>}>
      <RapportClient />
    </Suspense>
  );
}
