import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RapportPage from "@/app/rapport/[id]/RapportClient";
import { api } from "@/lib/api";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "iid-1" }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, getReport: vi.fn(), endInterview: vi.fn() } };
});

const getReport = vi.mocked(api.getReport);
const endInterview = vi.mocked(api.endInterview);

const FULL_REPORT = {
  interview_id: "iid-1",
  role: "Dev backend",
  seniority: "mid",
  status: "completed",
  created_at: "2026-10-28T10:00:00",
  evaluation: {
    overall_score: 82,
    strengths: ["Clear answers"],
    weaknesses: [],
    suggestions: ["Chiffrer les résultats"],
    question_scores: { "Q1": 80 },
  },
  qa_pairs: [
    { question_id: "q1", question: "Q1", category: "technique", order: 0, answer: "Answer A" },
  ],
};

describe("report page", () => {
  beforeEach(() => {
    getReport.mockReset();
    endInterview.mockReset();
  });
  it("renders the persisted evaluation without inventing fields", async () => {
    getReport.mockResolvedValue(FULL_REPORT);
    render(<RapportPage />);
    expect(await screen.findByText(/82/)).toBeInTheDocument();
    expect(await screen.findByText("Clear answers")).toBeInTheDocument();
    expect(await screen.findByText("Answer A")).toBeInTheDocument();
    expect(await screen.findByText("No areas recorded.")).toBeInTheDocument();
  });
  it("offers safe generation when the evaluation is missing", async () => {
    getReport.mockResolvedValue({ ...FULL_REPORT, evaluation: null, status: "ready" });
    endInterview.mockResolvedValue({ interview_id: "iid-1", evaluation: FULL_REPORT.evaluation, qa_pairs: FULL_REPORT.qa_pairs });
    render(<RapportPage />);
    const button = await screen.findByRole("button", { name: /generate my evaluation/i });
    await userEvent.click(button);
    await waitFor(() => expect(endInterview).toHaveBeenCalledTimes(1));
  });
  it("shows an actionable error when loading fails", async () => {
    getReport.mockRejectedValue(Object.assign(new Error("down"), { status: 502 }));
    render(<RapportPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
