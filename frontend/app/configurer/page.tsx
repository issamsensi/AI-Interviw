"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, EmptyState, FieldError, PageHeader, Spinner } from "@/components/ui";
import { ApiError, RESUME_STORAGE_KEY, api } from "@/lib/api";
import type { InterviewMode, InterviewType, Seniority } from "@/lib/types";
import { defaultQuestionCount } from "@/lib/types";
import { useStoredValue } from "@/lib/useStored";
import { validateSetup } from "@/lib/validation";
import { workflowStore } from "@/lib/workflow";

const SENIORITIES: { value: Seniority; label: string; hint: string }[] = [
  { value: "junior", label: "Junior", hint: "0–2 years of experience" },
  { value: "mid", label: "Mid-level", hint: "2–5 years of experience" },
  { value: "senior", label: "Senior", hint: "5+ years of experience" },
];

export const INTERVIEW_TYPES: { value: InterviewType; label: string; description: string }[] = [
  { value: "mixed", label: "Mixed", description: "A realistic blend of everything" },
  { value: "behavioral", label: "Behavioral", description: "Past situations, STAR method" },
  { value: "technical", label: "Technical", description: "Depth on your stack and role" },
  { value: "case_study", label: "Case study", description: "Problem-solving walkthroughs" },
  { value: "hr", label: "HR screening", description: "Motivation and culture fit" },
];

export const INTERVIEW_MODES: { value: InterviewMode; label: string; description: string }[] = [
  { value: "meet", label: "Meet — video & voice", description: "Camera on, Maya speaks, you answer out loud. Like a real video call." },
  { value: "writing", label: "Writing only — chat", description: "Can't talk right now? No mic or camera needed. Maya asks in chat, you type your answers and still get scored." },
];

export default function ConfigurerPage() {
  const router = useRouter();
  // Hydration-safe: server snapshot is null, browser value after hydration.
  const resumeId = useStoredValue(RESUME_STORAGE_KEY);
  const [role, setRole] = useState("");
  const [seniority, setSeniority] = useState<Seniority>("mid");
  const [mode, setMode] = useState<InterviewMode>("meet");
  const [interviewType, setInterviewType] = useState<InterviewType>("mixed");
  const [jobDescription, setJobDescription] = useState("");
  const [duration, setDuration] = useState(10);
  const [questionCount, setQuestionCount] = useState(5);
  const [countTouched, setCountTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [trialUsed, setTrialUsed] = useState(false);
  const [starting, setStarting] = useState(false);

  // Restore the last chosen mode after hydration (localStorage read).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(workflowStore.interviewMode);
  }, []);

  if (!resumeId) {
    return (
      <div>
        <PageHeader step="Step 3 of 4 · Setup" title="Configure the simulation" />
        <EmptyState title="Analyze your resume first">
          <p>
            <Link href="/upload" className="font-medium text-navy-900 underline">
              Upload my resume
            </Link>
          </p>
        </EmptyState>
      </div>
    );
  }

  function handleDurationChange(value: number) {
    setDuration(value);
    if (!countTouched) setQuestionCount(defaultQuestionCount(value));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (starting) return;
    const problems = validateSetup({ role, duration });
    if (!Number.isInteger(questionCount) || questionCount < 3 || questionCount > 15) {
      problems.questionCount = "Choose between 3 and 15 questions.";
    }
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setStarting(true);
    setSubmitError(null);
    setTrialUsed(false);
    try {
      const response = await api.startInterview({
        resume_id: resumeId as string,
        role: role.trim(),
        seniority,
        job_description: jobDescription.trim() || undefined,
        duration_minutes: duration,
        interview_type: interviewType,
        question_count: questionCount,
      });
      workflowStore.interviewId = response.interview_id;
      workflowStore.interviewMode = mode;
      router.push(`/entretien/${response.interview_id}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "GUEST_TRIAL_USED") {
        setTrialUsed(true);
      } else {
        setSubmitError(error instanceof ApiError ? error.message : "Could not start.");
      }
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <PageHeader
        step="Step 3 of 4 · Setup"
        title="Configure the simulation"
        subtitle="Choose the interview you want to practice. This shapes every question."
      />
      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit} noValidate>
          <fieldset>
            <legend className="text-sm font-medium text-navy-900">How do you want to attend?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {INTERVIEW_MODES.map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    mode === option.value
                      ? "border-navy bg-navy text-ivory dark:border-forest dark:bg-forest"
                      : "border-navy-200 bg-white text-navy-900 hover:border-navy-600 dark:bg-navy-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="interview-mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={() => setMode(option.value)}
                    className="sr-only"
                  />
                  <span className="block font-semibold">{option.label}</span>
                  <span className={`block text-xs ${mode === option.value ? "text-sage" : "text-navy-600"}`}>
                    {option.description}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-navy-900">Interview type</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {INTERVIEW_TYPES.map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    interviewType === option.value
                      ? "border-navy bg-navy text-ivory dark:border-forest dark:bg-forest"
                      : "border-navy-200 bg-white text-navy-900 hover:border-navy-600 dark:bg-navy-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="interview-type"
                    value={option.value}
                    checked={interviewType === option.value}
                    onChange={() => setInterviewType(option.value)}
                    className="sr-only"
                  />
                  <span className="block font-semibold">{option.label}</span>
                  <span className={`block text-xs ${interviewType === option.value ? "text-sage" : "text-navy-600"}`}>
                    {option.description}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5">
            <label htmlFor="role" className="block text-sm font-medium text-navy-900">
              Target job title <span aria-hidden="true" className="text-red-700">*</span>
            </label>
            <input
              id="role"
              type="text"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="E.g. Python backend developer"
              maxLength={120}
              aria-invalid={!!errors.role}
              aria-describedby={errors.role ? "role-error" : undefined}
              className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-navy-900 dark:bg-navy-50 placeholder:text-navy-600/60 focus:border-accent-600"
            />
            <div id="role-error">
              <FieldError message={errors.role} />
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-navy-900">Seniority level</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {SENIORITIES.map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    seniority === option.value
                      ? "border-navy bg-navy text-ivory dark:border-forest dark:bg-forest"
                      : "border-navy-200 bg-white text-navy-900 hover:border-navy-600 dark:bg-navy-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="seniority"
                    value={option.value}
                    checked={seniority === option.value}
                    onChange={() => setSeniority(option.value)}
                    className="sr-only"
                  />
                  <span className="block font-semibold">{option.label}</span>
                  <span className={`block text-xs ${seniority === option.value ? "text-sage" : "text-navy-600"}`}>
                    {option.hint}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5">
            <label htmlFor="job-description" className="block text-sm font-medium text-navy-900">
              Job description <span className="font-normal text-navy-600">(optional)</span>
            </label>
            <textarea
              id="job-description"
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              rows={4}
              maxLength={12000}
              placeholder="Paste the job posting here for even more targeted questions."
              className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-navy-900 dark:bg-navy-50 placeholder:text-navy-600/60 focus:border-accent-600"
            />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-navy-900">
                Duration <span aria-hidden="true" className="text-red-700">*</span>
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="duration"
                  type="number"
                  min={2}
                  max={20}
                  step={1}
                  value={duration}
                  onChange={(event) => handleDurationChange(Number(event.target.value))}
                  aria-invalid={!!errors.duration}
                  aria-describedby={errors.duration ? "duration-error" : undefined}
                  className="w-20 rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-navy-900 dark:bg-navy-50 focus:border-accent-600"
                />
                <span className="text-sm text-navy-600">minutes</span>
              </div>
              <div id="duration-error">
                <FieldError message={errors.duration} />
              </div>
            </div>
            <div>
              <label htmlFor="question-count" className="block text-sm font-medium text-navy-900">
                Questions <span aria-hidden="true" className="text-red-700">*</span>
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="question-count"
                  type="number"
                  min={3}
                  max={15}
                  step={1}
                  value={questionCount}
                  onChange={(event) => {
                    setCountTouched(true);
                    setQuestionCount(Number(event.target.value));
                  }}
                  aria-invalid={!!errors.questionCount}
                  aria-describedby={errors.questionCount ? "count-error" : undefined}
                  className="w-20 rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-navy-900 dark:bg-navy-50 focus:border-accent-600"
                />
                <span className="text-sm text-navy-600">of {defaultQuestionCount(duration)} suggested</span>
              </div>
              <div id="count-error">
                <FieldError message={errors.questionCount} />
              </div>
            </div>
          </div>

          {submitError && (
            <div className="mt-5">
              <Alert tone="error" title="Could not start">
                {submitError}
              </Alert>
            </div>
          )}

          {trialUsed && (
            <div className="mt-5">
              <Alert tone="info" title="Your free guest interview is used">
                <p>
                  You have already run your one free interview without an account. Create a free account to run
                  more — your CV and finished report stay attached.
                </p>
                <Link href="/connexion">
                  <Button className="mt-3">Create a free account</Button>
                </Link>
              </Alert>
            </div>
          )}

          <div className="mt-6">
            <Button type="submit" disabled={starting}>
              {starting ? <Spinner label="Preparing questions…" /> : "Start the interview"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
