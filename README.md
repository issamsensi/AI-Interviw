# AI Interview Simulator

A production-ready MVP for an AI-powered mock interview platform. It simulates realistic job interviews in real-time using voice interaction, webcam presence, resume analysis, adaptive questioning, and final performance evaluation.

> This is **not** a chatbot — it must feel like a real interview.

## Features

- **Resume Upload & Analysis** — Upload a PDF or image; the system extracts and structures your skills, projects, experience, and education.
- **Adaptive Interviewing** — Questions adapt dynamically based on your answers, resume content, and selected role/seniority.
- **Real-Time Voice Pipeline** — Speak your answers, AI transcribes them (Whisper), processes them (Groq), and responds via voice (ElevenLabs).
- **Webcam & Presence** — Live webcam feed during the interview with a clean, Meet-like interface.
- **Multi-Agent Architecture** — Specialized agents handle resume analysis, interview generation, real-time conversation, and evaluation.
- **Final Evaluation Report** — Overall score, strengths/weaknesses, suggestions, and a question-by-question breakdown.

## Tech Stack

| Layer       | Technology                                                                 |
| ----------- | -------------------------------------------------------------------------- |
| Frontend    | React 19, TypeScript, Vite, TailwindCSS, Zustand, Socket.IO Client, WebRTC |
| Backend     | FastAPI, Python 3.12, SQLAlchemy, LangGraph, WebSockets                    |
| Database    | PostgreSQL (via Docker), SQLite (dev fallback)                             |
| AI / APIs   | Groq API (LLM), Whisper (STT), ElevenLabs (TTS)                           |
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
User voice → Whisper STT → Groq LLM → ElevenLabs TTS → User hears AI
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
| `GROQ_API_KEY`       | Groq LLM API key     |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS key   |

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

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

| Method | Path                  | Description              |
| ------ | --------------------- | ------------------------ |
| POST   | `/upload-resume`      | Upload a resume file     |
| POST   | `/analyze-resume`     | Extract structured data  |
| POST   | `/start-interview`    | Begin an interview       |
| WS     | `/interview-stream`   | Real-time interview      |
| POST   | `/submit-answer`      | Submit an answer         |
| POST   | `/end-interview`      | End the interview        |
| GET    | `/report/{id}`        | Get evaluation report    |
| GET    | `/health`             | Health check             |

## Frontend Pages

- **`/`** — Landing page with hero, features, how-it-works, and CTA.
- **`/dashboard`** — Resume upload, role/difficulty selection, start interview.
- **`/interview/:id`** — Live interview room with webcam, AI voice, timer.
- **`/report/:id`** — Evaluation report with score, feedback, and breakdown.

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
