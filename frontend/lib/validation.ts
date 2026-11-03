/** Client-side validation mirroring backend limits. */
import { formatFileSize } from "./format";

const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];
const ACCEPTED_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function validateResumeFile(file: { name: string; type: string; size: number }): string | null {
  const ext = extensionOf(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return "Unsupported format. Send a PDF, PNG, or JPEG.";
  }
  if (file.type && file.type !== ACCEPTED_MIME[ext] && file.type !== "application/octet-stream") {
    return "The file contents do not match its extension.";
  }
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_RESUME_BYTES) {
    return `File too large (${formatFileSize(file.size)}). Maximum: 5 MB.`;
  }
  return null;
}

export function validateSetup(input: { role: string; duration: number }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.role.trim()) errors.role = "Enter the target job title.";
  else if (input.role.trim().length > 120) errors.role = "Title too long (120 characters maximum).";
  if (!Number.isInteger(input.duration) || input.duration < 2 || input.duration > 20) {
    errors.duration = "Duration must be between 2 and 20 minutes.";
  }
  return errors;
}
