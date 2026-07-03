# AI Interview Simulator (MVP)

## Project Overview

Build a production-ready MVP for an AI-powered mock interview platform.

The platform simulates realistic job interviews in real-time using voice interaction, webcam presence, resume analysis, adaptive questioning, and final performance evaluation.

This is NOT a chatbot.
It must feel like a real interview.

Core philosophy:
- Real-time conversational interview
- Resume-aware contextual questioning
- Dynamic follow-up questions
- Performance evaluation after interview
- Multi-agent architecture

---

# Tech Stack

## Frontend
- React (Vite)
- TailwindCSS
- TypeScript
- WebRTC for webcam/microphone
- Zustand for state management
- Socket.IO client
- React Webcam

## Backend
- FastAPI
- Python 3.12
- WebSocket support
- LangGraph (or custom orchestration)
- PostgreSQL
- Redis (optional for sessions)

## AI / APIs
- Groq API (main LLM)
- Whisper API (Speech-to-Text)
- ElevenLabs API (Text-to-Speech)

## OCR
- Tesseract OCR
- pdfplumber
- PyMuPDF

---

# Main Product Flow

1. User uploads CV (PDF or image)
2. System extracts text
3. Resume Analyzer Agent parses:
   - projects
   - skills
   - experience
   - technologies
   - education

4. User selects:
   - job role
   - level (junior/mid/senior)
   - optional job description

5. Interview Generator Agent builds interview strategy

6. Real-time interview starts:
   - webcam on
   - microphone on
   - AI voice asks questions
   - user replies by voice

7. Speech is converted to text

8. Interview adapts dynamically based on:
   - answer quality
   - technologies mentioned
   - projects in CV

9. Evaluation Agent stores:
   - answers
   - mistakes
   - strengths
   - hesitation
   - filler words
   - confidence

10. Final report generated

---

# Core UI Requirements

## Landing Page
Sections:
- Hero
- Features
- How it works
- Start Interview button

---

## Dashboard

User can:

- Upload resume
- Select job role
- Select difficulty
- Add job description
- Start interview

---

## Interview Room

Layout:

Left side:
- User webcam live

Right side:
- AI speaking indicator (animated pulse)

Bottom:
- Current question
- Timer
- Mute button
- End interview button

Important:
NO avatar.
Only voice + speaking indicator.

Must feel like Zoom/Google Meet.

---

## Final Report Page

Sections:

### Overall score
Example:
82/100

### Strengths
- Clear communication
- Strong technical explanations

### Weaknesses
- Long answers
- Weak STAR method
- Missing quantifiable impact

### Suggestions
- Use STAR framework
- Be concise
- Mention metrics

### Question-by-question breakdown

---

# Multi-Agent Architecture

---

## Agent 1: Resume Analyzer

Input:
- PDF
- image

Responsibilities:
- OCR extraction
- detect projects
- detect skills
- detect technologies
- detect experience

Output JSON:

{
  "skills": [],
  "projects": [],
  "experience": [],
  "education": [],
  "tech_stack": []
}

---

## Agent 2: Interview Generator

Input:
- resume analysis
- selected role
- job description
- seniority

Responsibilities:
- build interview roadmap
- generate behavioral questions
- generate technical questions
- generate resume-based questions

Must support branching.

Example:

If user mentions APIs:
→ ask API scaling

If user mentions CNN:
→ ask overfitting

If user mentions Laravel:
→ ask authentication/security

---

## Agent 3: Real-Time Interview Agent

Responsibilities:
- manage live interview state
- ask next question
- analyze current answer
- decide next question

Rules:
- conversational
- professional
- realistic
- adaptive

Must act like a senior recruiter.

---

## Agent 4: Evaluation Agent

Tracks:
- all answers
- mistakes
- confidence
- hesitations
- filler words
- technical depth

Produces final structured feedback.

---

# Important Interview Behaviors

System must ask:

## Behavioral
- Tell me about yourself
- Why this role?

## Resume-specific
- I saw your X project. Can you explain it?
- Why did you choose Y?
- What challenges did you face?

## Technical deep dive
- architecture
- debugging
- optimization
- tradeoffs

## Pressure testing
- What would you improve?
- What failed?
- Biggest challenge?

Must feel realistic.

---

# Real-time Voice Pipeline

User voice
→ Whisper STT
→ Groq
→ ElevenLabs TTS
→ User hears AI

Latency must be minimized.

Use WebSockets.

---

# Database Models

Users
Interviews
Resumes
Questions
Answers
Evaluations
FeedbackReports

---

# Backend API Routes

POST /upload-resume
POST /analyze-resume
POST /start-interview
WS /interview-stream
POST /submit-answer
POST /end-interview
GET /report/{id}

---

# Critical Requirements

- Clean architecture
- Modular agents
- Scalable
- Type-safe frontend
- WebSocket-based
- Error handling
- Resume parsing robustness
- Real-time state persistence
- Session memory

---

# MVP Scope Only

Do NOT build:
- payments
- auth providers
- social features
- mobile app
- multi-language

Focus only on:
- interview flow
- resume analysis
- adaptive questioning
- evaluation

This MVP must be investor-demo ready.