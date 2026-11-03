import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfigurerPage from "@/app/configurer/page";
import { api } from "@/lib/api";
import { workflowStore } from "@/lib/workflow";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, startInterview: vi.fn() } };
});

const startInterview = vi.mocked(api.startInterview);

describe("setup — attendance mode", () => {
  beforeEach(() => {
    push.mockClear();
    startInterview.mockReset();
    window.localStorage.clear();
    window.localStorage.setItem("aiw.resumeId", "resume-1");
    startInterview.mockResolvedValue({
      interview_id: "iid-9",
      role: "Dev",
      seniority: "mid",
      duration_minutes: 10,
      question_count: 5,
      strategy: "",
    });
  });

  it("defaults to Meet and offers Writing only", async () => {
    render(<ConfigurerPage />);
    expect(await screen.findByRole("radio", { name: /meet — video & voice/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /writing only — chat/i })).toBeInTheDocument();
    expect(screen.getByText(/can't talk right now/i)).toBeInTheDocument();
  });

  it("starts a writing interview and remembers the choice", async () => {
    render(<ConfigurerPage />);
    await userEvent.click(await screen.findByRole("radio", { name: /writing only — chat/i }));
    fireEvent.change(await screen.findByLabelText(/target job title/i), { target: { value: "Backend developer" } });
    await userEvent.click(screen.getByRole("button", { name: /start the interview/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/entretien/iid-9"));
    expect(workflowStore.interviewMode).toBe("writing");
    expect(startInterview).toHaveBeenCalledTimes(1);
  });
});
