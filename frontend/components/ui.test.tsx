import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert, ProgressBar } from "@/components/ui";
import { formatElapsed, formatFileSize, formatScore } from "@/lib/format";
import { workflowStore } from "@/lib/workflow";

describe("shared UI states", () => {
  it("announces errors assertively", () => {
    render(
      <Alert tone="error" title="Envoi impossible">
        Réessayez.
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Réessayez.");
  });
  it("exposes progress to assistive tech", () => {
    render(<ProgressBar value={2} max={14} label="Réponses envoyées" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "14");
  });
});

describe("French formatting", () => {
  it("formats scores, durations and file sizes for fr-FR", () => {
    expect(formatScore(82.5)).toContain("82");
    expect(formatElapsed(95)).toBe("01:35");
    expect(formatFileSize(5 * 1024 * 1024)).toContain("MB");
  });
});

describe("workflow identifiers", () => {
  beforeEach(() => window.localStorage.clear());
  it("stores only identifiers, never contents", () => {
    workflowStore.resumeId = "resume-1";
    workflowStore.interviewId = "interview-1";
    expect(workflowStore.resumeId).toBe("resume-1");
    const stored = ["aiw.resumeId", "aiw.interviewId"].map((key) => window.localStorage.getItem(key));
    expect(stored).toEqual(["resume-1", "interview-1"]);
    expect(stored.join("").length).toBeLessThan(100);
    workflowStore.clearInterview();
    expect(workflowStore.interviewId).toBeNull();
  });
});
