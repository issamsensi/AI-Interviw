"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Award, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatScore } from "@/lib/format";
import type { ReportResponse } from "@/lib/types";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string; interviewId: string | null }
  | { kind: "generating"; interviewId: string }
  | { kind: "ready"; report: ReportResponse };

function ScoreDial({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const tone = clamped >= 75 ? "text-accent-700" : clamped >= 50 ? "text-amber-600" : "text-red-700";
  const ring = clamped >= 75 ? "stroke-accent-600" : clamped >= 50 ? "stroke-amber-500" : "stroke-red-600";
  return (
    <div className="flex items-center gap-4">
      <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={`Score: ${formatScore(score)} out of 100`}>
        <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="12" className="stroke-navy-100" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 64 64)"
          className={ring}
        />
        <text x="64" y="60" textAnchor="middle" className={`text-2xl font-bold ${tone}`} fill="currentColor">
          {formatScore(score)}
        </text>
        <text x="64" y="80" textAnchor="middle" className="fill-navy-600 text-xs">
          / 100
        </text>
      </svg>
      <div className="text-sm text-navy-600">
        <p className="font-semibold text-navy-900">Overall score out of 100</p>
        <p>Combining technical depth, clarity, and answer structure.</p>
      </div>
    </div>
  );
}

export default function RapportClient() {
  const params = useParams<{ id: string }>();
  const interviewId = params.id;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const report = await api.getReport(interviewId);
      if (report.evaluation) setState({ kind: "ready", report });
      else setState({ kind: "generating", interviewId });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof ApiError ? error.message : "Report unavailable.",
        interviewId,
      });
    }
  }, [interviewId]);

  useEffect(() => {
    // Mount fetch: legitimate external synchronization, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      await api.endInterview(interviewId);
      await load();
    } catch (error) {
      setGenerateError(error instanceof ApiError ? error.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <PageHeader
        step="Step 4 of 4 · Evaluation"
        title="Your evaluation"
        subtitle="Detailed feedback from your simulation, question by question."
      />

      {state.kind === "loading" && (
        <Card>
          <Spinner label="Loading report…" />
        </Card>
      )}

      {state.kind === "error" && (
        <Alert tone="error" title="Report unavailable">
          <p>{state.message}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void load()}>
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Retry
          </Button>
        </Alert>
      )}

      {state.kind === "generating" && (
        <Card>
          <h2 className="text-lg font-semibold text-navy-900">Evaluation not ready yet</h2>
          <p className="mt-2 text-navy-600">
            No evaluation has been generated for this interview yet. Generating is safe:
            it overwrites nothing and only creates a report when your answers are usable.
          </p>
          {generateError && (
            <div className="mt-4">
              <Alert tone="error" title="Generation failed">
                {generateError}
              </Alert>
            </div>
          )}
          <div className="mt-4">
            <Button onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? <Spinner label="Generating…" /> : "Generate my evaluation"}
            </Button>
          </div>
        </Card>
      )}

      {state.kind === "ready" && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-navy-600">
                  {state.report.role} · {state.report.seniority} ·{" "}
                  {formatDateTime(state.report.created_at)}
                </p>
                <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-navy-900">
                  <Award aria-hidden="true" className="h-5 w-5 text-accent-700" />
                  Overall result
                </h2>
              </div>
            </div>
            <div className="mt-4">
              <ScoreDial score={state.report.evaluation?.overall_score ?? 0} />
            </div>
          </Card>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card>
              <h2 className="flex items-center gap-2 font-semibold text-navy-900">
                <TrendingUp aria-hidden="true" className="h-5 w-5 text-accent-700" />
                Strengths
              </h2>
              {(state.report.evaluation?.strengths.length ?? 0) === 0 ? (
                <p className="mt-2 text-sm text-navy-600">No strengths recorded.</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-navy-700">
                  {state.report.evaluation?.strengths.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </Card>
            <Card>
              <h2 className="flex items-center gap-2 font-semibold text-navy-900">
                <TrendingDown aria-hidden="true" className="h-5 w-5 text-red-700" />
                Areas to improve
              </h2>
              {(state.report.evaluation?.weaknesses.length ?? 0) === 0 ? (
                <p className="mt-2 text-sm text-navy-600">No areas recorded.</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-navy-700">
                  {state.report.evaluation?.weaknesses.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </Card>
          </div>

          <Card className="mt-4">
            <h2 className="font-semibold text-navy-900">Tips to improve</h2>
            {(state.report.evaluation?.suggestions.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-navy-600">No tips recorded.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-navy-700">
                {state.report.evaluation?.suggestions.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </Card>

          <Card className="mt-4">
            <h2 className="font-semibold text-navy-900">Question-by-question breakdown</h2>
            {state.report.qa_pairs.length === 0 ? (
              <div className="mt-2">
                <EmptyState title="No questions recorded" />
              </div>
            ) : (
              <ol className="mt-3 space-y-4">
                {state.report.qa_pairs.map((qa, position) => {
                  const score = state.report.evaluation?.question_scores?.[qa.question];
                  return (
                    <li key={qa.question_id} className="rounded-lg bg-navy-50 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium text-navy-900">
                          {position + 1}. {qa.question}
                        </p>
                        {typeof score === "number" && (
                          <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold text-navy-800 dark:bg-navy-100 ring-1 ring-inset ring-navy-100">
                            {formatScore(score)}/100
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-wide text-navy-600">{qa.category}</p>
                      <p className="mt-2 text-sm text-navy-700">
                        {qa.answer?.trim() ? qa.answer : <em>No answer.</em>}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/upload">
              <Button>
                Start another simulation
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/">
              <Button variant="secondary">Back to home</Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
