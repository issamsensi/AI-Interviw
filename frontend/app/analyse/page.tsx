"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { ResumeAnalysis } from "@/lib/types";
import { workflowStore } from "@/lib/workflow";

type State =
  | { kind: "missing" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; analysis: ResumeAnalysis };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-600">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-navy-600">Not detected in this resume.</p>;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="List">
      {items.map((item) => (
        <li key={item} className="rounded-full bg-navy-50 px-3 py-1 text-sm text-navy-800 ring-1 ring-inset ring-navy-100">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function AnalysePage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    const resumeId = workflowStore.resumeId;
    if (!resumeId) {
      setState({ kind: "missing" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const response = await api.analyzeResume(resumeId);
      setState({ kind: "ready", analysis: response.analysis });
    } catch (error) {
      setState({ kind: "error", message: error instanceof ApiError ? error.message : "Analysis failed." });
    }
  }, []);

  useEffect(() => {
    // Mount fetch: legitimate external synchronization, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        step="Step 2 of 4 · Resume analysis"
        title="Review your extracted profile"
        subtitle="Check what the AI understood from your resume before configuring the simulation. This information personalizes the questions."
      />

      {state.kind === "missing" && (
        <EmptyState title="No resume to analyze">
          <p>
            Upload your resume first.{" "}
            <Link href="/upload" className="font-medium text-navy-900 underline">
              Go to upload
            </Link>
          </p>
        </EmptyState>
      )}

      {state.kind === "loading" && (
        <Card>
          <Spinner label="Analyzing your resume… This may take a few seconds." />
        </Card>
      )}

      {state.kind === "error" && (
        <Alert tone="error" title="Analysis failed">
          <p>{state.message}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void load()}>
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Retry analysis
          </Button>
        </Alert>
      )}

      {state.kind === "ready" && (
        <>
          <Card>
            <Section title="Skills">
              <Chips items={state.analysis.skills} />
            </Section>
            <Section title="Tech stack">
              <Chips items={state.analysis.tech_stack} />
            </Section>
            <Section title="Experience">
              {state.analysis.experience.length === 0 ? (
                <p className="text-sm text-navy-600">No experience detected.</p>
              ) : (
                <ul className="space-y-4">
                  {state.analysis.experience.map((exp, index) => (
                    <li key={`${exp.company}-${index}`} className="border-l-2 border-accent-600 pl-4">
                      <p className="font-semibold text-navy-900">
                        {exp.role || "Role not specified"}
                        {exp.company ? ` · ${exp.company}` : ""}
                      </p>
                      {exp.duration && <p className="text-sm text-navy-600">{exp.duration}</p>}
                      {exp.description && <p className="mt-1 text-sm text-navy-700">{exp.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Projects">
              {state.analysis.projects.length === 0 ? (
                <p className="text-sm text-navy-600">No projects detected.</p>
              ) : (
                <ul className="space-y-4">
                  {state.analysis.projects.map((project, index) => (
                    <li key={`${project.name}-${index}`}>
                      <p className="font-semibold text-navy-900">{project.name || `Project ${index + 1}`}</p>
                      {project.description && <p className="mt-1 text-sm text-navy-700">{project.description}</p>}
                      {project.technologies.length > 0 && (
                        <p className="mt-1 text-sm text-navy-600">Technologies: {project.technologies.join(", ")}</p>
                      )}
                      {project.key_achievements.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-sm text-navy-700">
                          {project.key_achievements.map((achievement) => (
                            <li key={achievement}>{achievement}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Education">
              {state.analysis.education.length === 0 ? (
                <p className="text-sm text-navy-600">No education detected.</p>
              ) : (
                <ul className="space-y-2">
                  {state.analysis.education.map((edu, index) => (
                    <li key={`${edu.institution}-${index}`} className="text-sm text-navy-700">
                      <span className="font-semibold text-navy-900">
                        {[edu.degree, edu.field].filter(Boolean).join(" · ") || "Education"}
                      </span>
                      {[edu.institution, edu.year].filter(Boolean).length > 0 &&
                        ` — ${[edu.institution, edu.year].filter(Boolean).join(", ")}`}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </Card>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => router.push("/configurer")}>
              Configure my simulation
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Button>
            <Link href="/upload">
              <Button variant="secondary">Upload another resume</Button>
            </Link>
          </div>
          <p className="mt-3 text-sm text-navy-600">
            Manual corrections are not supported yet: the analysis above is used as is.
          </p>
        </>
      )}
    </div>
  );
}
