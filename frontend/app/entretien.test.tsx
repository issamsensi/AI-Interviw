import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EntretienClient from "@/app/entretien/[id]/EntretienClient";
import { ApiError, api } from "@/lib/api";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "iid-1" }),
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getReport: vi.fn(),
      transcribeAnswer: vi.fn(),
      submitAnswer: vi.fn(),
      endInterview: vi.fn(),
    },
  };
});

const getReport = vi.mocked(api.getReport);
const submitAnswer = vi.mocked(api.submitAnswer);
const endInterview = vi.mocked(api.endInterview);

const OPEN_REPORT = {
  interview_id: "iid-1",
  role: "Dev",
  seniority: "mid",
  status: "ready",
  created_at: null,
  evaluation: null,
  qa_pairs: [
    { question_id: "q1", question: "Tell me about yourself", category: "behavioral", order: 0, answer: null },
  ],
};

describe("interview room", () => {
  beforeEach(() => {
    push.mockClear();
    getReport.mockReset();
    submitAnswer.mockReset();
    endInterview.mockReset();
    getReport.mockResolvedValue(OPEN_REPORT);
  });

  it("shows the current question with progress from the API", async () => {
    render(<EntretienClient />);
    expect(await screen.findByText("Tell me about yourself")).toBeInTheDocument();
    expect(await screen.findByText(/Question 1 of 1/)).toBeInTheDocument();
  });

  it("prevents duplicate submission while sending", async () => {
    let release!: (value: { status: string; answer_id: string }) => void;
    submitAnswer.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    render(<EntretienClient />);
    const box = await screen.findByLabelText(/Your answer/);
    fireEvent.change(box, { target: { value: "My answer" } });
    const send = await screen.findByRole("button", { name: /submit answer/i });
    await userEvent.click(send);
    // While the request is pending the form leaves the DOM, so a second
    // submission cannot even be attempted.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /submit answer/i })).not.toBeInTheDocument(),
    );
    release({ status: "ok", answer_id: "a1" });
    // The single-question interview then finishes automatically.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/rapport/iid-1"));
    expect(submitAnswer).toHaveBeenCalledTimes(1);
  });

  it("keeps the answer and offers retry after a failed submission", async () => {
    submitAnswer.mockRejectedValue(new ApiError(502, "The AI service returned an invalid response. Please retry."));
    render(<EntretienClient />);
    const box = await screen.findByLabelText(/Your answer/) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Kept text" } });
    await userEvent.click(await screen.findByRole("button", { name: /submit answer/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("retry");
    expect(box.value).toBe("Kept text");
    submitAnswer.mockResolvedValue({ status: "ok", answer_id: "a1" });
    await userEvent.click(await screen.findByRole("button", { name: /submit answer/i }));
    // Retried successfully; the single-question interview auto-finishes.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/rapport/iid-1"));
    expect(submitAnswer).toHaveBeenCalledTimes(2);
  });

  it("offers WhatsApp-style composer: mic when empty, send when there are words", async () => {
    render(<EntretienClient />);
    await screen.findByText("Tell me about yourself");
    expect(screen.getByRole("switch", { name: /auto-send when i pause/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /start live voice answer/i })).toBeInTheDocument();
    const box = await screen.findByLabelText(/Your answer/);
    fireEvent.change(box, { target: { value: "Typed like a chat message" } });
    expect(screen.getByRole("button", { name: /submit answer/i })).toBeInTheDocument();
  });

  it("auto-send off means nothing sends until the candidate taps send", async () => {
    render(<EntretienClient />);
    await screen.findByText("Tell me about yourself");
    await userEvent.click(screen.getByRole("switch", { name: /auto-send when i pause/i }));
    expect(screen.getByRole("switch", { name: /auto-send when i pause/i })).toHaveAttribute("aria-checked", "false");
    expect(await screen.findByText(/nothing sends until you tap send/i)).toBeInTheDocument();
    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it("shows camera denial without breaking the interview", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: async () => { throw new DOMException("denied", "NotAllowedError"); } },
      configurable: true,
    });
    render(<EntretienClient />);
    await screen.findByText("Tell me about yourself");
    await userEvent.click(await screen.findByRole("button", { name: /show my video/i }));
    expect(await screen.findByText(/camera blocked/i)).toBeInTheDocument();
  });

  it("leaves immediately with zero answers, without evaluating", async () => {
    render(<EntretienClient />);
    await screen.findByText("Tell me about yourself");
    const leave = await screen.findByRole("button", { name: /leave interview/i });
    expect(leave).not.toBeDisabled();
    await userEvent.click(leave);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(endInterview).not.toHaveBeenCalled();
  });

  it("finishes automatically and shows the result after the last answer", async () => {
    endInterview.mockResolvedValue({ interview_id: "iid-1", evaluation: { overall_score: 80, strengths: [], weaknesses: [], suggestions: [], question_scores: {} }, qa_pairs: [] });
    submitAnswer.mockResolvedValue({ status: "ok", answer_id: "a1" });
    render(<EntretienClient />);
    const box = await screen.findByLabelText(/Your answer/);
    fireEvent.change(box, { target: { value: "My answer" } });
    await userEvent.click(await screen.findByRole("button", { name: /submit answer/i }));
    // No Leave click needed: answering the final question evaluates.
    await waitFor(() => expect(endInterview).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/rapport/iid-1"));
  });

  it("writing mode: no mic, type and send like a chat, still scored", async () => {
    window.localStorage.setItem("aiw.interviewMode", "writing");
    try {
      submitAnswer.mockResolvedValue({ status: "ok", answer_id: "a1" });
      endInterview.mockResolvedValue({ interview_id: "iid-1", evaluation: { overall_score: 80, strengths: [], weaknesses: [], suggestions: [], question_scores: {} }, qa_pairs: [] });
      render(<EntretienClient />);
      expect(await screen.findByText(/writing interview — type your answers/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /start live voice answer/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("switch", { name: /auto-send/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^writing$/i })).toHaveAttribute("aria-pressed", "true");
      const box = await screen.findByLabelText(/Your answer/);
      fireEvent.change(box, { target: { value: "Typed answer, no talking" } });
      await userEvent.click(await screen.findByRole("button", { name: /submit answer/i }));
      await waitFor(() => expect(submitAnswer).toHaveBeenCalledWith(expect.objectContaining({ interview_id: "iid-1" })));
      await waitFor(() => expect(push).toHaveBeenCalledWith("/rapport/iid-1"));
    } finally {
      window.localStorage.removeItem("aiw.interviewMode");
    }
  });

  it("does not finish early when questions remain unanswered", async () => {
    getReport.mockResolvedValue({
      ...OPEN_REPORT,
      qa_pairs: [
        { question_id: "q1", question: "Tell me about yourself", category: "behavioral", order: 0, answer: null },
        { question_id: "q2", question: "Describe a tough bug", category: "technical", order: 1, answer: null },
      ],
    });
    endInterview.mockResolvedValue({ interview_id: "iid-1", evaluation: { overall_score: 80, strengths: [], weaknesses: [], suggestions: [], question_scores: {} }, qa_pairs: [] });
    submitAnswer.mockResolvedValue({ status: "ok", answer_id: "a1" });
    render(<EntretienClient />);
    const box = await screen.findByLabelText(/Your answer/);
    fireEvent.change(box, { target: { value: "First answer" } });
    await userEvent.click(await screen.findByRole("button", { name: /submit answer/i }));
    await screen.findByText(/answer saved/i);
    expect(endInterview).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: /next question/i }));
    const box2 = await screen.findByLabelText(/Your answer/);
    fireEvent.change(box2, { target: { value: "Second answer" } });
    await userEvent.click(await screen.findByRole("button", { name: /submit answer/i }));
    await waitFor(() => expect(endInterview).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/rapport/iid-1"));
  });
});
