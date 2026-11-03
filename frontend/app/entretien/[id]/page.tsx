import { Suspense } from "react";
import EntretienClient from "./EntretienClient";

export default function EntretienPage() {
  return (
    <Suspense fallback={<p>Chargement de l&apos;entretien…</p>}>
      <EntretienClient />
    </Suspense>
  );
}
