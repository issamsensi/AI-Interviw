import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadPage from "@/app/upload/page";
import { ApiError, RESUME_STORAGE_KEY, api } from "@/lib/api";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, getProfile: vi.fn(), uploadResume: vi.fn() },
  };
});

const getProfile = vi.mocked(api.getProfile);

const SAVED_PROFILE = {
  user: { id: "u1", email: "jane@example.com", name: "Jane", target_role: null, created_at: null },
  resumes: [
    {
      resume_id: "r-saved",
      filename: "jane-cv.pdf",
      created_at: "2026-01-15T10:00:00Z",
      analysis: { skills: ["Python"], projects: [], experience: [], education: [], tech_stack: [] },
    },
  ],
  interviews: [],
  stats: { interview_count: 0, completed_count: 0, average_score: null, best_score: null },
};

describe("upload page resume reuse", () => {
  beforeEach(() => {
    push.mockClear();
    getProfile.mockReset();
    window.localStorage.clear();
  });

  it("lets a signed-in user reuse the saved CV and skip re-uploading", async () => {
    getProfile.mockResolvedValue(SAVED_PROFILE);
    render(<UploadPage />);
    expect(await screen.findByText("jane-cv.pdf")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /use this cv/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/configurer"));
    expect(window.localStorage.getItem(RESUME_STORAGE_KEY)).toBe("r-saved");
  });

  it("lets a guest continue with the resume already uploaded in this browser", async () => {
    getProfile.mockRejectedValue(new ApiError(403, "Sign in", "AUTH_REQUIRED"));
    window.localStorage.setItem(RESUME_STORAGE_KEY, "r-browser");
    render(<UploadPage />);
    expect(await screen.findByText(/already uploaded in this browser/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /continue with it/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/analyse"));
  });

  it("shows only the upload form when nothing is saved", async () => {
    getProfile.mockRejectedValue(new ApiError(403, "Sign in", "AUTH_REQUIRED"));
    render(<UploadPage />);
    expect(await screen.findByText(/drop your resume here/i)).toBeInTheDocument();
    expect(screen.queryByText(/already uploaded/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /use this cv/i })).not.toBeInTheDocument();
  });
});
