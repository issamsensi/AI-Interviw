import { create } from 'zustand'
import type { ResumeAnalysis, InterviewPlan, Question, Evaluation } from '../types'

interface InterviewState {
  step: 'landing' | 'dashboard' | 'interview' | 'report'
  resumeId: string | null
  resumeAnalysis: ResumeAnalysis | null
  interviewPlan: InterviewPlan | null
  interviewId: string | null
  currentQuestion: Question | null
  questions: Question[]
  currentIndex: number
  evaluation: Evaluation | null
  reportId: string | null
  isMuted: boolean
  isAiSpeaking: boolean
  isRecording: boolean

  setStep: (step: InterviewState['step']) => void
  setResumeId: (id: string) => void
  setResumeAnalysis: (analysis: ResumeAnalysis) => void
  setInterviewPlan: (plan: InterviewPlan) => void
  setInterviewId: (id: string) => void
  setCurrentQuestion: (q: Question | null) => void
  setQuestions: (qs: Question[]) => void
  nextQuestion: () => void
  setEvaluation: (e: Evaluation) => void
  setReportId: (id: string) => void
  toggleMute: () => void
  setAiSpeaking: (v: boolean) => void
  setRecording: (v: boolean) => void
  reset: () => void
}

export const useInterviewStore = create<InterviewState>((set) => ({
  step: 'landing',
  resumeId: null,
  resumeAnalysis: null,
  interviewPlan: null,
  interviewId: null,
  currentQuestion: null,
  questions: [],
  currentIndex: 0,
  evaluation: null,
  reportId: null,
  isMuted: false,
  isAiSpeaking: false,
  isRecording: false,

  setStep: (step) => set({ step }),
  setResumeId: (resumeId) => set({ resumeId }),
  setResumeAnalysis: (resumeAnalysis) => set({ resumeAnalysis }),
  setInterviewPlan: (interviewPlan) => set({ interviewPlan }),
  setInterviewId: (interviewId) => set({ interviewId }),
  setCurrentQuestion: (currentQuestion) => set({ currentQuestion }),
  setQuestions: (questions) => set({ questions, currentIndex: 0 }),
  nextQuestion: () => set((s) => {
    const next = s.currentIndex + 1
    if (next < s.questions.length) {
      return { currentIndex: next, currentQuestion: s.questions[next] }
    }
    return {}
  }),
  setEvaluation: (evaluation) => set({ evaluation }),
  setReportId: (reportId) => set({ reportId }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  setAiSpeaking: (isAiSpeaking) => set({ isAiSpeaking }),
  setRecording: (isRecording) => set({ isRecording }),
  reset: () => set({
    step: 'landing',
    resumeId: null,
    resumeAnalysis: null,
    interviewPlan: null,
    interviewId: null,
    currentQuestion: null,
    questions: [],
    currentIndex: 0,
    evaluation: null,
    reportId: null,
    isMuted: false,
    isAiSpeaking: false,
    isRecording: false,
  }),
}))
