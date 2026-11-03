"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Upload } from "lucide-react";
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatScore } from "@/lib/format";
import type { ProfileResponse } from "@/lib/types";

type ViewState = "loading" | "ready" | "needs-auth" | "error";

export default function ProfilPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const data = await api.getProfile();
      setProfile(data);
      setName(data.user.name ?? "");
      setTargetRole(data.user.target_role ?? "");
      setState("ready");
    } catch (err) {
      if (err instanceof ApiError && (err.code === "AUTH_REQUIRED" || err.status === 401 || err.status === 403)) {
        setState("needs-auth");
      } else {
        setError(err instanceof ApiError ? err.message : "Could not load your profile.");
        setState("error");
      }
    }
  }, []);

  useEffect(() => {
    // Mount fetch: external synchronization, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const user = await api.updateProfile({
        name: name.trim() || null,
        target_role: targetRole.trim() || null,
      });
      setProfile((prev) => (prev ? { ...prev, user } : prev));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  if (state === "loading") {
    return (
      <div>
        <PageHeader title="Your profile" />
        <Spinner label="Loading your profile…" />
      </div>
    );
  }

  if (state === "needs-auth") {
    return (
      <div>
        <PageHeader
          title="Your profile"
          subtitle="Profiles are for signed-in users, so your CV, history, and scores follow you across devices."
        />
        <Card className="max-w-xl">
          <p className="font-medium text-navy-900">You are browsing as a guest</p>
          <p className="mt-2 text-sm leading-relaxed text-navy-600">
            Guests get one free interview, and their data stays in this browser only. Sign in to save your
            CV and see your interview history and progress here — anything you already did as a guest is
            attached to your account automatically.
          </p>
          <Link href="/connexion">
            <Button className="mt-4">
              Sign in
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (state === "error" || !profile) {
    return (
      <div>
        <PageHeader title="Your profile" />
        <Alert tone="error" title="Could not load">
          <p>{error ?? "Unknown error."}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void load()}>
            Retry
          </Button>
        </Alert>
      </div>
    );
  }

  const { user, resumes, interviews, stats } = profile;
  const displayName = user.name?.trim() || user.email || "Your account";
  const initial = displayName.charAt(0).toUpperCase();
  const latestResume = resumes[0] ?? null;
  const skills = latestResume?.analysis
    ? Array.from(new Set([...latestResume.analysis.skills, ...latestResume.analysis.tech_stack])).slice(0, 12)
    : [];

  return (
    <div>
      <PageHeader title="Your profile" subtitle="Your details, saved CV, and every interview you have run." />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sand text-xl font-bold text-navy">
                {initial}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold tracking-tight text-navy-900">{displayName}</h2>
                <p className="truncate text-sm text-navy-600">{user.email ?? "No email on file"}</p>
                <p className="mt-0.5 text-xs text-navy-600">
                  Member since {formatDateTime(user.created_at)}
                  {user.target_role ? ` · Preparing for: ${user.target_role}` : ""}
                </p>
              </div>
              <span className="ml-auto rounded-full bg-accent-50 px-3 py-1 text-xs font-medium text-accent-700 ring-1 ring-inset ring-accent-100">
                Account
              </span>
            </div>

            <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-navy-100 pt-5 text-center">
              <div>
                <dt className="text-xs font-medium text-navy-600">Interviews</dt>
                <dd className="mt-1 text-2xl font-bold tracking-tight text-navy-900">{stats.interview_count}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-navy-600">Completed</dt>
                <dd className="mt-1 text-2xl font-bold tracking-tight text-navy-900">{stats.completed_count}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-navy-600">Average score</dt>
                <dd className="mt-1 text-2xl font-bold tracking-tight text-navy-900">
                  {stats.average_score !== null ? formatScore(stats.average_score) : "—"}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold text-navy-900">
                <FileText aria-hidden="true" className="h-5 w-5 text-accent-700" />
                Saved CV
              </h2>
              <Link href="/upload" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-900 hover:underline">
                <Upload aria-hidden="true" className="h-4 w-4" />
                Upload a new CV
              </Link>
            </div>
            {latestResume ? (
              <div className="mt-3">
                <p className="font-medium text-navy-900">{latestResume.filename}</p>
                <p className="text-sm text-navy-600">Uploaded {formatDateTime(latestResume.created_at)}</p>
                {skills.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2" aria-label="Skills detected in your CV">
                    {skills.map((skill) => (
                      <li key={skill} className="rounded-full bg-navy-50 px-3 py-1 text-sm text-navy-800 ring-1 ring-inset ring-navy-100">
                        {skill}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-navy-600">This CV has not been analyzed yet.</p>
                )}
                {resumes.length > 1 && (
                  <p className="mt-3 text-sm text-navy-600">
                    Plus {resumes.length - 1} earlier {resumes.length - 1 === 1 ? "CV" : "CVs"}. The newest one is used for new interviews.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState title="No CV saved yet">
                  <p>
                    <Link href="/upload" className="font-medium text-navy-900 underline">
                      Upload your resume
                    </Link>{" "}
                    to personalize your interview questions.
                  </p>
                </EmptyState>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold text-navy-900">Interview history</h2>
            {interviews.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No interviews yet">
                  <p>
                    Run your first{" "}
                    <Link href="/upload" className="font-medium text-navy-900 underline">
                      simulation
                    </Link>{" "}
                    and it will show up here with its score.
                  </p>
                </EmptyState>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-navy-100">
                {interviews.map((interview) => (
                  <li key={interview.interview_id} className="flex flex-wrap items-center gap-3 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-navy-900">{interview.role}</p>
                      <p className="text-sm text-navy-600">
                        {formatDateTime(interview.created_at)} · {interview.answered_count}/{interview.question_count} answered
                      </p>
                    </div>
                    {interview.score !== null ? (
                      <span className="rounded-full bg-accent-50 px-2.5 py-1 text-sm font-semibold text-accent-700 ring-1 ring-inset ring-accent-100">
                        {formatScore(interview.score)}/100
                      </span>
                    ) : (
                      <span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700 ring-1 ring-inset ring-navy-100">
                        In progress
                      </span>
                    )}
                    {interview.score !== null ? (
                      <Link href={`/rapport/${interview.interview_id}`} className="text-sm font-medium text-navy-900 hover:underline">
                        View report
                      </Link>
                    ) : (
                      <Link href={`/entretien/${interview.interview_id}`} className="text-sm font-medium text-navy-900 hover:underline">
                        Continue
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <h2 className="font-semibold text-navy-900">Your details</h2>
          <form onSubmit={handleSave} className="mt-4">
            <label htmlFor="profile-name" className="block text-sm font-medium text-navy-900">
              Display name
            </label>
            <input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Jane Doe"
              autoComplete="name"
              className="mt-1.5 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-sm text-navy-900 placeholder:text-navy-600/60 focus:border-accent-600 dark:bg-navy-50"
            />
            <label htmlFor="profile-target-role" className="mt-4 block text-sm font-medium text-navy-900">
              Target role
            </label>
            <input
              id="profile-target-role"
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
              maxLength={255}
              placeholder="Backend Developer"
              className="mt-1.5 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-sm text-navy-900 placeholder:text-navy-600/60 focus:border-accent-600 dark:bg-navy-50"
            />
            <p className="mt-2 text-xs text-navy-600">The role you are preparing for. Shown on your profile.</p>
            <Button type="submit" disabled={saving} className="mt-4 w-full">
              {saving ? "Saving…" : "Save details"}
            </Button>
            {saved && (
              <p role="status" className="mt-3 text-sm text-accent-700">
                Details saved.
              </p>
            )}
            {saveError && (
              <div className="mt-3">
                <Alert tone="error" title="Could not save">
                  <p>{saveError}</p>
                </Alert>
              </div>
            )}
          </form>
          <div className="mt-5 border-t border-navy-100 pt-4 text-sm text-navy-600">
            <p>
              Signed in as <span className="font-medium text-navy-900">{user.email ?? "—"}</span>
            </p>
            <p className="mt-1">To sign out, use the header menu.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
