# BalanceLens 🌿
### AI Decision Companion for College-Aged Women

> Navigate life's pressures with purpose and strength.

**Live App → [balance-lens-ai-decision-support-ap.vercel.app](https://balance-lens-ai-decision-support-ap.vercel.app)**

BalanceLens is an AI-powered decision support platform built for college-aged women navigating the competing pressures of academic life, part-time employment, relationships, financial stress, and personal wellbeing. It combines a Retrieval-Augmented Generation (RAG) knowledge system with Groq's Llama 3.3 70B to deliver grounded, personalized guidance — not generic advice.

Built as a Week 4 capstone for the **Chicago Education Advocacy Cooperative (ChiEAC) Data Science Alliance**.

---

## The Problem

College women frequently face complex, simultaneous pressures:

- Balancing coursework with work shifts
- Managing deadlines while experiencing burnout
- Feeling pressure to accept extra hours due to financial stress
- Difficulty setting boundaries with employers, professors, or peers
- Guilt associated with rest or recovery

Existing tools — productivity apps, mood trackers, meditation platforms — don't help users think through real-time tradeoffs. BalanceLens does.

---

## Features

**🧠 AI Situation Interpreter**  
Describe your situation in plain language. The system identifies your specific competing pressures — not generic categories, but your actual tasks, deadlines, and energy level.

**📚 RAG Knowledge System**  
Retrieves curated knowledge about burnout prevention, boundary setting, student wellness, and academic resilience before generating any response.

**📋 Structured AI Insights**  
Every response includes:
- Situation summary addressed directly to you
- Likely pressures (specific to what you described)
- Practical actions with timing suggestions
- Boundary scripts for the exact people you mentioned
- A weekly balance plan

**💬 Boundary Script Generator**  
Ready-to-send scripts for managers, professors, friends, and partners — warm, firm, and personalized.

**📅 Weekly Balance Plan**  
Short-term prioritization plan built around your actual schedule and energy.

---

## Architecture

```
User Input (Natural Language)
        │
        ▼
  Next.js Frontend (Vercel)
        │
        ▼
  FastAPI Backend (Railway)
        │
   ┌────┴────┐
   ▼         ▼
FAISS      Groq API
Vector     Llama 3.3 70B
Search          │
   │            │
   └────┬───────┘
        ▼
  Structured JSON Response
  (summary, pressures, actions,
   scripts, weekly plan)
```

**RAG Pipeline:**
1. Knowledge base `.md` files are chunked and embedded using `sentence-transformers/all-MiniLM-L6-v2` (ONNX backend)
2. User input is embedded and matched against the FAISS index
3. Top-k retrieved chunks are passed as context to Groq Llama 3.3 70B
4. LLM generates a structured JSON response validated by Pydantic

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript |
| Backend | Python FastAPI |
| LLM | Groq — Llama 3.3 70B Versatile |
| Embeddings | sentence-transformers (ONNX backend) |
| Vector DB | FAISS |
| RAG Framework | LangChain |
| Containerization | Docker (multi-stage build) |
| Backend Hosting | Railway |
| Frontend Hosting | Vercel |

---

## Project Structure

```
BalanceLens/
├── backend/
│   ├── main.py              # FastAPI app, RAG pipeline, Groq integration
│   ├── requirements.txt     # Python dependencies
│   └── Dockerfile           # Multi-stage Docker build
├── frontend/
│   ├── app/
│   │   ├── page.tsx         # Main UI — all pages (landing, reflect, balance, scripts)
│   │   ├── layout.tsx       # Root layout
│   │   └── globals.css      # Global styles
│   └── next.config.js
├── data/
│   ├── knowledge/           # Curated .md knowledge base files
│   └── index/               # FAISS index (auto-built on first run)
├── notebooks/               # EDA and embedding experiments
├── docker-compose.yml       # Local development
└── railway.toml             # Railway deployment config
```

---

## Running Locally

**Prerequisites:** Docker Desktop, a [Groq API key](https://console.groq.com)

```bash
# 1. Clone the repo
git clone https://github.com/vaishnavisamboji/BalanceLens---AI-decision-support-app.git
cd BalanceLens---AI-decision-support-app

# 2. Set your environment variables
cp .env.example .env
# Edit .env and add your GROQ_API_KEY

# 3. Run with Docker Compose
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

The FAISS index is built automatically on first run from the knowledge base files in `data/knowledge/`.

---

## API Reference

### `POST /chat`

Takes a user's situation description and returns structured AI guidance.

**Request:**
```json
{
  "text": "I have three exams this week but my manager scheduled me for extra shifts and I'm exhausted."
}
```

**Response:**
```json
{
  "situation_summary": "...",
  "likely_pressures": ["...", "..."],
  "what_might_help_this_week": ["...", "..."],
  "boundary_scripts": [
    { "audience": "Manager", "script": "..." }
  ],
  "weekly_balance_plan": {
    "current_pressure_points": "...",
    "what_to_protect_first": "...",
    "one_boundary_to_set": "...",
    "one_recovery_action": "...",
    "one_achievable_academic_step": "..."
  },
  "citations": [{ "source": "burnout.md", "excerpt": "..." }],
  "safety_note": "..."
}
```

### `GET /health`
```json
{ "ok": true, "groq_key_set": true }
```

---

## Deployment

**Backend — Railway**  
- Multi-stage Docker build
- Root Directory: `backend`
- Required env vars: `GROQ_API_KEY`, `EMBED_MODEL`, `RAG_K`

**Frontend — Vercel**  
- Auto-detected as Next.js
- Root Directory: `frontend`
- Required env var: `NEXT_PUBLIC_API_BASE` = Railway backend URL

---

## About This Project

Built by **Vaishnavi Samboji** as a capstone project for the Chicago Education Advocacy Cooperative (ChiEAC) Data Science Alliance program.

The platform is not a substitute for professional mental health support. It is a practical decision companion for everyday moments of overload and uncertainty.

---

## Resume Context

> Built and deployed BalanceLens, an AI decision-support web application helping college-aged women navigate tradeoffs between academic demands, employment, and personal wellbeing. Designed a Retrieval-Augmented Generation architecture using LangChain, FAISS vector search, and transformer embeddings to ground LLM responses in curated wellness and early-career guidance. Implemented a structured LLM reasoning pipeline generating weekly balance plans, burnout risk reflections, and boundary-setting scripts. Deployed full-stack on Railway (Docker) and Vercel.
