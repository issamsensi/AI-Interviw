/** Types aligned with backend Pydantic schemas (app/schemas/ai.py)
 *  and route response shapes. Fields the backend may omit stay optional. */

export interface ResumeProject {
  name: string;
  description: string;
  technologies: string[];
  key_achievements: string[];
}

export interface ResumeExperience {
  company: string;
  role: string;
  duration: string;
  description: string;
}

export interface ResumeEducation {
  institution: string;
  degree: string;
  field: string;
  year: string;
}

export interface ResumeAnalysis {
  skills: string[];
  projects: ResumeProject[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  tech_stack: string[];
}

export interface UploadResumeResponse {
  resume_id: string;
  raw_text: string;
  filename: string;
}

export interface AnalyzeResumeResponse {
  resume_id: string;
  analysis: ResumeAnalysis;
}

export interface StartInterviewResponse {
  interview_id: string;
  role: string;
  seniority: string;
  duration_minutes: number;
  question_count: number;
  strategy: string;
}

export interface QuestionAnswer {
  question_id: string;
  question: string;
  category: string;
  order: number;
  answer: string | null;
  confidence_score?: number | null;
}

export interface Evaluation {
  overall_score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  question_scores: Record<string, number>;
}

export interface ReportResponse {
  interview_id: string;
  role: string;
  seniority: string;
  status: string;
  created_at: string | null;
  evaluation: Evaluation | null;
  qa_pairs: QuestionAnswer[];
}

export interface EndInterviewResponse {
  interview_id: string;
  evaluation: Evaluation;
  qa_pairs: QuestionAnswer[];
}

export interface TranscribeResponse {
  text: string;
}

export interface ProfileUser {
  id: string;
  email: string | null;
  name: string | null;
  target_role: string | null;
  created_at: string | null;
}

export interface ProfileResume {
  resume_id: string;
  filename: string;
  created_at: string | null;
  analysis: ResumeAnalysis | null;
}

export interface ProfileInterview {
  interview_id: string;
  role: string;
  seniority: string;
  status: string;
  created_at: string | null;
  ended_at: string | null;
  question_count: number;
  answered_count: number;
  score: number | null;
}

export interface ProfileResponse {
  user: ProfileUser;
  resumes: ProfileResume[];
  interviews: ProfileInterview[];
  stats: {
    interview_count: number;
    completed_count: number;
    average_score: number | null;
    best_score: number | null;
  };
}

export type Seniority = "junior" | "mid" | "senior";

export type InterviewType = "mixed" | "behavioral" | "technical" | "case_study" | "hr";

/** How the candidate attends: a Meet-style video/voice call, or
 *  writing-only chat for when they cannot (or prefer not to) talk. */
export type InterviewMode = "meet" | "writing";

/** Default pace used by the backend: ~1 question per 2 minutes, 4..10. */
export function defaultQuestionCount(durationMinutes: number): number {
  return Math.max(4, Math.min(10, Math.floor(durationMinutes / 2)));
}
