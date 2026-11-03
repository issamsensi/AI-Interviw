# AI Interview Simulator

A production-ready MVP for an AI-powered mock interview platform. It simulates realistic job interviews in real-time using voice interaction, webcam presence, resume analysis, adaptive questioning, and final performance evaluation.

> This is **not** a chatbot — it must feel like a real interview.

## Features

- **Resume Upload & Analysis** — Upload a PDF or image; the system extracts and structures your skills, projects, experience, and education.
- **Adaptive Interviewing** — Questions adapt dynamically based on your answers, resume content, and selected role/seniority.
- **Real-Time Voice Pipeline** — Speak your answers, AI transcribes them (Meta Muse Voice Transcribe), processes them (Meta Muse Spark), and responds via voice (browser speechSynthesis by default, ElevenLabs server-side TTS optional).
- **Webcam & Presence** — Live webcam feed during the interview with a clean, Meet-like interface.
- **Multi-Agent Architecture** — Specialized agents handle resume analysis, interview generation, real-time conversation, and evaluation.
- **Final Evaluation Report** — Overall score, strengths/weaknesses, suggestions, and a question-by-question breakdown.

## Tech Stack

| Layer       | Technology                                                                 |
| ----------- | -------------------------------------------------------------------------- |
| Frontend    | React 19, TypeScript, Vite, TailwindCSS, Zustand, Socket.IO Client, WebRTC |
| Backend     | FastAPI, Python 3.12, SQLAlchemy, LangGraph, WebSockets                    |
| Database    | PostgreSQL (via Docker), SQLite (dev fallback)                             |
| AI / APIs   | Meta Muse Spark (LLM), Meta Muse Voice Transcribe (STT), ElevenLabs (optional TTS) |
| OCR         | Tesseract OCR, pdfplumber, PyMuPDF                                         |
| Infra       | Docker, Docker Compose                                                     |

## Architecture

The platform uses a **multi-agent** system:

1. **Resume Analyzer Agent** — OCR + extraction of skills, projects, experience, tech stack, education.
2. **Interview Generator Agent** — Builds an interview roadmap with branching follow-up questions based on resume and role.
3. **Real-Time Interview Agent** — Manages live interview state, asks adaptive questions, acts as a senior recruiter.
4. **Evaluation Agent** — Tracks answers, mistakes, confidence, hesitations, filler words, and produces a structured feedback report.

### Voice Pipeline

```
User voice → Meta Muse Voice Transcribe STT → Meta Muse Spark LLM → browser speechSynthesis (ElevenLabs TTS optional) → User hears AI
```

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── agents/          # Multi-agent logic
│   │   ├── models/          # SQLAlchemy models
│   │   ├── routes/          # REST API routes
│   │   ├── services/        # Business logic
│   │   ├── websocket/       # WebSocket handlers
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py          # FastAPI app entrypoint
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Route pages
│   │   ├── store/           # Zustand state stores
│   │   ├── types/           # TypeScript types
│   │   └── lib/             # Utilities & Socket.IO client
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
└── .env.example
```

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.12+ (for local backend dev)

### API Keys

Set the following environment variables (copy from `.env.example`):

| Variable             | Description          |
| -------------------- | -------------------- |
| `META_API_KEY`       | Meta Model API key   |
| `META_MODEL_DEV`     | Text model for dev (default `muse-spark-1.3`) |
| `META_MODEL_PROD`    | Text model for prod (default `muse-spark-1.3`) |
| `META_ENV`           | `dev` or `prod` model selection |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS key (optional; empty disables server TTS) |
| `CORS_ORIGINS`       | Comma-separated frontend origins |

For Docker deployment, copy `.env.example` to `.env` and replace the database
password and provider placeholders. The frontend is a Next.js app that calls
the backend directly in the browser: set `NEXT_PUBLIC_API_BASE_URL` (default
`http://localhost:8000`) at frontend build time when the backend lives
elsewhere.

### Running with Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Running Locally

**Backend:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in your keys
uvicorn app.main:app --reload
```

**Frontend (Next.js, English UI):**

```bash
cd frontend
npm install
cp .env.example .env.local  # optional: NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
npm run dev     # http://localhost:3000
```

All API routes are prefixed with `/api`. Anonymous identification uses the
`X-Anonymous-User-ID` header, generated and persisted by the frontend.

## API Endpoints

| Method | Path                    | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| POST   | `/api/upload-resume`    | Upload a resume file (multipart `file`)  |
| POST   | `/api/analyze-resume`   | Extract structured data (`?resume_id=`)  |
| POST   | `/api/start-interview`  | Begin an interview                       |
| WS     | `/api/interview-stream` | Real-time interview (legacy transport)   |
| POST   | `/api/transcribe`       | Transcribe a WAV answer (`multipart file`) |
| POST   | `/api/submit-answer`    | Submit an answer (text)                  |
| POST   | `/api/end-interview`    | End the interview, generate evaluation   |
| GET    | `/api/report/{id}`      | Get questions, answers and evaluation    |
| GET    | `/health`               | Health check                             |

The canonical answer flow is 100% REST: browser recording →
16 kHz mono WAV conversion → `POST /api/transcribe` → `POST /api/submit-answer`.
The WebSocket is no longer used for answers.

## Frontend Pages

- **`/`** — Home: value proposition, steps, "Start a simulation" CTA.
- **`/upload`** — Resume drop (drag-and-drop, PDF/PNG/JPEG, 5 MB max).
- **`/analyse`** — Extracted skills, experience, projects, and education.
- **`/configurer`** — Interview type (mixed, behavioral, technical, case study, HR), target role, seniority, optional job description, duration, and question count (3–15; backend derives a default of ~1 per 2 min).
- **`/entretien/[id]`** — Video-call interview room: large live camera stage with mic-level meter, hands-free mode (question spoken, silence auto-sends your answer), manual mode, playback, transcription, submit, safe finish gating.
- **`/rapport/[id]`** — Score out of 100, strengths, areas to improve, tips, per-question breakdown.

## Tests

```bash
cd backend && .venv/bin/python -m unittest discover -s tests   # 74 tests
cd frontend && npm test        # vitest: 39 tests
cd frontend && npm run build   # production Next.js build
```

## Known limitations

- Transcription requires 16-bit mono WAV at 16 or 24 kHz: the frontend converts via Web Audio, which needs a recent browser (microphone + `AudioContext`).
- The generation model produces a variable question count (14 observed) regardless of the chosen duration: duration remains a pacing guide for the candidate.
- The model can occasionally return invalid evaluation JSON: `POST /api/end-interview` retries once, then answers 502 and the frontend offers a lossless retry.
- No interview history: the backend exposes no list endpoint; the frontend only keeps the in-progress identifiers.
- Camera self-view is a local preview (never uploaded); real-browser microphone/camera behavior still needs live testing.

## MVP Scope

### In Scope
- Resume upload & analysis
- Adaptive questioning with branching
- Real-time voice interview (STT → LLM → TTS)
- Final evaluation report
- Clean, investor-demo-ready UI

### Out of Scope
- Payments & subscriptions
- Auth providers / user accounts
- Social features
- Mobile app
- Multi-language support
