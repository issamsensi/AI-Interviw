import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useStoredValue } from "@/lib/useStored";

function Probe({ storageKey }: { storageKey: string }) {
  const value = useStoredValue(storageKey);
  return <p>{value ?? "empty"}</p>;
}

describe("useStoredValue", () => {
  it("renders empty when nothing is stored (server snapshot)", () => {
    render(<Probe storageKey="aiw.probe-a" />);
    expect(screen.getByText("empty")).toBeInTheDocument();
  });
  it("renders the stored browser value after hydration", () => {
    window.localStorage.setItem("aiw.probe-b", "resume-9");
    render(<Probe storageKey="aiw.probe-b" />);
    expect(screen.getByText("resume-9")).toBeInTheDocument();
  });
});
