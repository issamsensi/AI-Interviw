import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle, THEME_STORAGE_KEY } from "@/components/ThemeToggle";
import { Footer } from "@/components/Footer";

describe("theme toggle", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
  });

  it("toggles the dark class on <html> and persists the choice", async () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("button", { name: /switch to dark mode/i });
    await userEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await userEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("follows the DOM class, not stale state, when the class changed after mount", async () => {
    render(<ThemeToggle />);
    // Simulates the pre-paint script applying the OS theme late: the class
    // is present but the component state never saw it.
    document.documentElement.classList.add("dark");
    await userEvent.click(screen.getByRole("button", { name: /switch to dark mode/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});

describe("footer", () => {
  it("links to the main flows and states the privacy note", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: /start a simulation/i })).toHaveAttribute("href", "/upload");
    for (const link of screen.getAllByRole("link", { name: /^sign in$/i })) {
      expect(link).toHaveAttribute("href", "/connexion");
    }
    expect(screen.getByText(/video never leaves your browser/i)).toBeInTheDocument();
  });
});
