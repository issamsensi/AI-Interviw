/** Minimal workflow identifiers persisted across navigation. Only IDs,
 *  never CV contents or audio. */

import { INTERVIEW_STORAGE_KEY, MODE_STORAGE_KEY, RESUME_STORAGE_KEY } from "./api";
import type { InterviewMode } from "./types";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function write(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(key, value);
  else window.localStorage.removeItem(key);
}

export const workflowStore = {
  get resumeId(): string | null {
    return read(RESUME_STORAGE_KEY);
  },
  set resumeId(value: string | null) {
    write(RESUME_STORAGE_KEY, value);
  },
  get interviewId(): string | null {
    return read(INTERVIEW_STORAGE_KEY);
  },
  set interviewId(value: string | null) {
    write(INTERVIEW_STORAGE_KEY, value);
  },
  clearInterview() {
    write(INTERVIEW_STORAGE_KEY, null);
  },
  /** Last chosen attendance mode; defaults to the Meet experience. */
  get interviewMode(): InterviewMode {
    return read(MODE_STORAGE_KEY) === "writing" ? "writing" : "meet";
  },
  set interviewMode(value: InterviewMode) {
    write(MODE_STORAGE_KEY, value);
  },
};
