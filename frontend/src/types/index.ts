export interface ResumeAnalysis {
  skills: string[]
  projects: Project[]
  experience: Experience[]
  education: Education[]
  tech_stack: string[]
}

export interface Project {
  name: string
  description: string
  technologies: string[]
  key_achievements: string[]
}

export interface Experience {
  company: string
  role: string
  duration: string
  description: string
}

export interface Education {
  institution: string
  degree: string
  field: string
  year: string
}

export interface InterviewConfig {
  resume_id: string
  role: string
  seniority: 'junior' | 'mid' | 'senior'
  job_description?: string
}

export interface InterviewPlan {
  interview_id: string
  role: string
  seniority: string
  duration_minutes: number
  question_count: number
  strategy: string
}

export interface Question {
  id: string
  text: string
  category: string
  order: number
}

export interface Answer {
  question_id: string
  question: string
  category: string
  order: number
  answer: string | null
  confidence_score: number | null
}

export interface Evaluation {
  overall_score: number
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  question_scores: Record<string, number>
}

export interface InterviewReport {
  interview_id: string
  role: string
  seniority: string
  status: string
  created_at: string
  evaluation: Evaluation | null
  qa_pairs: Answer[]
}
