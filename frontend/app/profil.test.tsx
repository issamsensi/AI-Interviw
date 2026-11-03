import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfilPage from "@/app/profil/page";
import { ApiError, api } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, getProfile: vi.fn(), updateProfile: vi.fn() },
  };
});

const getProfile = vi.mocked(api.getProfile);
const updateProfile = vi.mocked(api.updateProfile);

const PROFILE = {
  user: {
    id: "u1",
    email: "jane@example.com",
    name: "Jane Doe",
    target_role: "Backend Developer",
    created_at: "2026-01-15T10:00:00Z",
  },
  resumes: [
    {
      resume_id: "r1",
      filename: "jane-cv.pdf",
      created_at: "2026-01-15T10:00:00Z",
      analysis: { skills: ["Python"], projects: [], experience: [], education: [], tech_stack: ["FastAPI"] },
    },
  ],
  interviews: [
    {
      interview_id: "i1",
      role: "Backend Developer",
      seniority: "mid",
      status: "completed",
      created_at: "2026-01-16T10:00:00Z",
      ended_at: "2026-01-16T10:10:00Z",
      question_count: 5,
      answered_count: 5,
      score: 82,
    },
  ],
  stats: { interview_count: 1, completed_count: 1, average_score: 82, best_score: 82 },
};

describe("profile page", () => {
  beforeEach(() => {
    getProfile.mockReset();
    updateProfile.mockReset();
  });

  it("prompts guests to sign in", async () => {
    getProfile.mockRejectedValue(new ApiError(403, "Sign in to view your profile.", "AUTH_REQUIRED"));
    render(<ProfilPage />);
    expect(await screen.findByText(/browsing as a guest/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/connexion");
  });

  it("shows details, CV, history and stats for an account", async () => {
    getProfile.mockResolvedValue(PROFILE);
    render(<ProfilPage />);
    expect((await screen.findAllByText("jane@example.com")).length).toBeGreaterThan(0);
    expect(screen.getByText("jane-cv.pdf")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("82/100")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view report/i })).toHaveAttribute("href", "/rapport/i1");
  });

  it("saves edited name and target role", async () => {
    getProfile.mockResolvedValue(PROFILE);
    updateProfile.mockResolvedValue({ ...PROFILE.user, name: "Jane Smith" });
    render(<ProfilPage />);
    const nameBox = await screen.findByLabelText(/display name/i);
    fireEvent.change(nameBox, { target: { value: "Jane Smith" } });
    await userEvent.click(screen.getByRole("button", { name: /save details/i }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ name: "Jane Smith", target_role: "Backend Developer" }),
    );
    expect(await screen.findByText(/details saved/i)).toBeInTheDocument();
  });
});
