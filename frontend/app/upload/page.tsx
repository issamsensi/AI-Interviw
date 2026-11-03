"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, FileUp, RotateCcw, Trash2 } from "lucide-react";
import { Alert, Button, Card, PageHeader, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatFileSize } from "@/lib/format";
import type { ProfileResume } from "@/lib/types";
import { validateResumeFile } from "@/lib/validation";
import { workflowStore } from "@/lib/workflow";

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savedResumes, setSavedResumes] = useState<ProfileResume[]>([]);
  const [browserResumeId, setBrowserResumeId] = useState<string | null>(null);

  useEffect(() => {
    // Saved CVs live on the account (signed-in) or in this browser (guest).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrowserResumeId(workflowStore.resumeId);
    let cancelled = false;
    void (async () => {
      try {
        const profile = await api.getProfile();
        if (!cancelled) setSavedResumes(profile.resumes);
      } catch {
        /* guests and unconfigured accounts simply have no saved list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function pickSavedResume(resume: ProfileResume) {
    // workflowStore is a localStorage-backed setter object, not React state.
    // eslint-disable-next-line react-hooks/immutability
    workflowStore.resumeId = resume.resume_id;
    workflowStore.clearInterview();
    // Already analyzed: skip straight to setup, no re-upload, no new AI call.
    router.push(resume.analysis ? "/configurer" : "/analyse");
  }

  function continueWithBrowserResume() {
    workflowStore.clearInterview();
    router.push("/analyse");
  }

  const choose = useCallback((candidate: File | null) => {
    setUploadError(null);
    if (!candidate) {
      setFile(null);
      setFieldError(null);
      return;
    }
    const problem = validateResumeFile(candidate);
    setFieldError(problem);
    setFile(problem ? null : candidate);
  }, []);

  async function handleUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const response = await api.uploadResume(file);
      workflowStore.resumeId = response.resume_id;
      workflowStore.clearInterview();
      router.push("/analyse");
    } catch (error) {
      setUploadError(error instanceof ApiError ? error.message : "Upload failed. Please retry.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <PageHeader
        step="Step 1 of 4 · Resume upload"
        title="Upload your resume"
        subtitle={
          savedResumes.length > 0
            ? "Reuse the CV saved on your account, or upload a different one below."
            : "PDF, PNG, or JPEG, max 5 MB. The text is extracted and analyzed in the next step."
        }
      />

      {savedResumes.length > 0 && (
        <Card className="mb-6 max-w-2xl">
          <h2 className="flex items-center gap-2 font-semibold text-navy-900">
            <FileText aria-hidden="true" className="h-5 w-5 text-accent-700" />
            {savedResumes.length === 1 ? "Your saved CV" : "Your saved CVs"}
          </h2>
          <ul className="mt-3 divide-y divide-navy-100">
            {savedResumes.map((resume) => (
              <li key={resume.resume_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-navy-900">{resume.filename}</p>
                  <p className="text-sm text-navy-600">
                    Uploaded {formatDateTime(resume.created_at)}
                    {resume.analysis ? " · Already analyzed" : " · Not analyzed yet"}
                  </p>
                </div>
                <Button onClick={() => pickSavedResume(resume)}>
                  Use this CV
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-navy-600">Uploading below replaces nothing — the new CV is simply added to your account.</p>
        </Card>
      )}

      {savedResumes.length === 0 && browserResumeId && (
        <Card className="mb-6 max-w-2xl">
          <h2 className="flex items-center gap-2 font-semibold text-navy-900">
            <FileText aria-hidden="true" className="h-5 w-5 text-accent-700" />
            Resume already uploaded in this browser
          </h2>
          <p className="mt-2 text-sm text-navy-600">
            You do not need to upload it again. Continue with it, or upload a different resume below.
          </p>
          <Button className="mt-3" onClick={continueWithBrowserResume}>
            Continue with it
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </Card>
      )}

      <Card className="max-w-2xl">
        {savedResumes.length > 0 && <h2 className="mb-4 font-semibold text-navy-900">Upload a different resume</h2>}
        <div
          role="button"
          tabIndex={0}
          aria-label="Resume drop zone. Activate to choose a file."
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files?.[0] ?? null);
          }}
          className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? "border-accent-600 bg-accent-50" : "border-navy-200 bg-navy-50 hover:border-navy-600"
          }`}
        >
          <FileUp aria-hidden="true" className="h-8 w-8 text-navy-600" />
          <p className="mt-3 font-medium text-navy-900">Drop your resume here, or click to choose it</p>
          <p className="mt-1 text-sm text-navy-600">PDF, PNG, JPEG · 5 MB max</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            aria-label="Choose a resume file"
            className="sr-only"
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
          />
        </div>

        {fieldError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {fieldError}
          </p>
        )}

        {file && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-navy-50 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-navy-900">{file.name}</p>
              <p className="text-sm text-navy-600">{formatFileSize(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => choose(null)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-navy-600 hover:bg-white dark:hover:bg-navy-50"
              aria-label="Remove the selected file"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Remove
            </button>
          </div>
        )}

        {uploadError && (
          <div className="mt-4">
            <Alert tone="error" title="Upload failed">
              <p>{uploadError}</p>
              <Button variant="secondary" className="mt-3" onClick={handleUpload} disabled={uploading}>
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Retry
              </Button>
            </Alert>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? <Spinner label="Uploading…" /> : "Analyze my resume"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
