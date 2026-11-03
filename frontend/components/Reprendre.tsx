"use client";

import Link from "next/link";
import { INTERVIEW_STORAGE_KEY } from "@/lib/api";
import { useStoredValue } from "@/lib/useStored";

/** Resume link shown only when this browser holds an interview in progress. */
export function ReprendreBanner() {
  const interviewId = useStoredValue(INTERVIEW_STORAGE_KEY);
  if (!interviewId) return null;
  return (
    <p className="mt-4 text-sm text-navy-600">
      A simulation is in progress in this browser.{" "}
      <Link href={`/entretien/${interviewId}`} className="font-medium text-navy-900 underline">
        Resume it
      </Link>
    </p>
  );
}
