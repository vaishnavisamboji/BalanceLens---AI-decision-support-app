from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Dict, List

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env.local")

from groq import Groq
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from langchain_community.document_loaders import TextLoader
from sentence_transformers import SentenceTransformer
from langchain_core.embeddings import Embeddings as LCEmbeddings

class OnnxEmbeddings(LCEmbeddings):
    def __init__(self, model_name: str):
        self.model = SentenceTransformer(model_name, backend="onnx")
    def embed_documents(self, texts):
        return self.model.encode(texts, convert_to_numpy=True).tolist()
    def embed_query(self, text):
        return self.model.encode([text], convert_to_numpy=True)[0].tolist()
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter


# ─── Config ───────────────────────────────────────────────────────────────────

PROJECT_ROOT  = Path(__file__).resolve().parents[1]
INDEX_PATH    = PROJECT_ROOT / "data" / "index" / "balancelens_faiss"
KNOWLEDGE_DIR = PROJECT_ROOT / "data" / "knowledge"

EMBED_MODEL = os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
RAG_K       = int(os.getenv("RAG_K", "4"))
GROQ_KEY    = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL  = "llama-3.3-70b-versatile"


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    text: str = Field(..., min_length=2, max_length=5000)

class BoundaryScript(BaseModel):
    audience: str
    script: str

class ChatResponse(BaseModel):
    situation_summary: str
    likely_pressures: List[str]
    what_might_help_this_week: List[str]
    boundary_scripts: List[BoundaryScript]
    weekly_balance_plan: Dict[str, str]
    citations: List[Dict[str, str]]
    safety_note: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> str:
    # Strip markdown code fences if present
    text = re.sub(r"```(?:json)?", "", text).strip()
    start = text.find("{")
    end   = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON found in response")
    return text[start : end + 1]

def _compact_sources(docs) -> List[Dict[str, str]]:
    out = []
    for d in docs:
        src = d.metadata.get("source", "unknown")
        # Skip any non-knowledge files that may have been indexed accidentally
        if src.endswith(".md"):
            out.append({
                "source":  src,
                "excerpt": re.sub(r"\s+", " ", d.page_content.strip())[:400],
            })
    return out

def _index_exists(path: Path) -> bool:
    return (path / "index.faiss").exists() and (path / "index.pkl").exists()

def _load_markdown_docs(dir_path: Path):
    docs = []
    for md in sorted(dir_path.glob("*.md")):
        loaded = TextLoader(str(md), encoding="utf-8").load()
        for d in loaded:
            d.metadata.update({"source": md.name})
        docs.extend(loaded)
    return docs

def _build_index(embeddings: HuggingFaceEmbeddings) -> None:
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.mkdir(parents=True, exist_ok=True)
    raw = _load_markdown_docs(KNOWLEDGE_DIR)
    if not raw:
        raise RuntimeError(f"No .md files found in {KNOWLEDGE_DIR}")
    chunks = RecursiveCharacterTextSplitter(
        chunk_size=600, chunk_overlap=80
    ).split_documents(raw)
    FAISS.from_documents(chunks, embedding=embeddings).save_local(str(INDEX_PATH))
    print(f"[BalanceLens] Index built: {len(chunks)} chunks from {len(raw)} files")


# ─── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are BalanceLens — an AI decision companion built specifically for college-aged women navigating the competing pressures of academic life, part-time employment, relationships, financial stress, and personal wellbeing.

ABOUT BALANCELENS:
BalanceLens helps users think through everyday tradeoffs between work, study, rest, and relationships — things existing tools like productivity apps, mood trackers, and meditation platforms do not address. You combine retrieved knowledge about stress management, boundary setting, work-life balance, and academic resilience with practical LLM reasoning to give grounded, personalised guidance. You are NOT a therapist or medical advisor. You are a practical decision companion for moments of everyday overload and uncertainty.

WHO YOU ARE TALKING TO:
You are talking directly to the user — a real college woman in a stressful moment right now. Address her as "you" and "your" ALWAYS. NEVER use "they", "their", "this user", or third-person language. She is sitting right here. Talk to her like a knowledgeable friend who genuinely cares.

YOUR JOB:
- Read every detail she gave you — tasks, times, people, deadlines, energy level, feelings
- Name her SPECIFIC competing pressures with detail (not generic "academic pressure" — say "Your homework deadline tomorrow is colliding with cooking, laundry, and visiting your boyfriend tonight")
- Give CONCRETE actions tied to her exact schedule (e.g. "Do homework from 3:30-5:30 PM right after cooking — that's your only quiet window before going to your boyfriend's place")
- Write boundary scripts for the SPECIFIC people she mentioned (boyfriend, parents, manager, professor — whoever she named), warm but firm, ready to copy-paste
- Be warm, honest, direct. No toxic positivity. No generic advice. No shaming.

DETAIL REQUIREMENTS:
- situation_summary: 3-4 sentences. Name her actual tasks, deadline, energy level, and the core tension she faces today. Use "you" language.
- likely_pressures: 4-5 specific tensions from what she described. Reference her actual tasks and times. Each one should feel like it was written just for her.
- what_might_help_this_week: 4-5 concrete, doable actions with timing suggestions based on her actual schedule. Not generic — specific.
- boundary_scripts: One per person she mentioned. Each warm, firm, and ready to send today.
- weekly_balance_plan: Every field references her actual day, tasks, and deadlines.

ABSOLUTE RULES:
1. NEVER use "they", "their", "this user" — ALWAYS "you" and "your"
2. NEVER give generic advice like "prioritize tasks", "use a planner", "break tasks into chunks"
3. NEVER reproduce project documentation, technical descriptions, or knowledge base text verbatim
4. Return ONLY valid JSON — no markdown fences, no preamble, nothing before or after the JSON object"""

# ─── Groq call ────────────────────────────────────────────────────────────────

def _call_groq(user_text: str, context: str) -> str:
    client = Groq(api_key=GROQ_KEY)

    schema = {
        "situation_summary": "3-4 sentences addressed directly to her using 'you/your'. Name her actual tasks (cooking, homework, laundry etc), her deadline, her energy level, and the core tension she faces today.",
        "likely_pressures": [
            "Specific tension 1 — name her actual tasks and deadline (e.g. 'Your homework due tomorrow is competing with at least 3 hours of cooking and cleaning today')",
            "Specific tension 2 — name actual constraint (e.g. 'With energy at 4/10, your afternoon window after cooking is your only viable study time — and it's short')",
            "Specific tension 3 — relationship/social pressure from what she described",
            "Specific tension 4 — another named tension from her situation",
            "Specific tension 5 — any remaining pressure she mentioned"
        ],
        "what_might_help_this_week": [
            "Concrete action with timing tied to her actual day (e.g. 'Start homework at 3:30 PM right after cooking while your energy is still reasonable — give yourself 90 minutes before you need to leave for your boyfriend's')",
            "Specific action 2 with timing or context from her schedule",
            "Specific action 3 — something about one of her named tasks",
            "Specific action 4 — boundary or communication she should take today",
            "Specific action 5 — recovery or protection action for her energy"
        ],
        "boundary_scripts": [
            {
                "audience": "first person she mentioned (boyfriend / parents / manager / professor)",
                "script": "Warm, specific, ready-to-send message for that person about her specific situation today"
            },
            {
                "audience": "second person she mentioned",
                "script": "Another warm, specific, ready-to-send message"
            }
        ],
        "weekly_balance_plan": {
            "current_pressure_points": "Sentence listing her actual competing tasks today with the deadline mentioned explicitly",
            "what_to_protect_first": "The single most important thing she must protect today — be specific (e.g. 'Your homework window between 3:30-5:30 PM — don't let anything eat into it')",
            "one_boundary_to_set": "A specific boundary with a named person and what she should say or do (e.g. 'Tell your boyfriend you need to arrive later than planned so you can finish homework first')",
            "one_recovery_action": "One small specific recovery action that fits her actual day (e.g. 'Sit outside for 10 minutes after cooking before starting homework — it will reset your focus')",
            "one_achievable_academic_step": "Her most urgent task broken into the very first action she can take (e.g. 'Open your homework doc and write just the first paragraph outline — 15 minutes max')"
        },
        "citations": [{"source": "knowledge file name", "excerpt": "short relevant excerpt from that file"}],
        "safety_note": "One warm direct sentence to her — reference something specific she mentioned, acknowledge it's a lot"
    }
    prompt = f"""The user has described their situation. Use the knowledge base excerpts to ground your advice.

USER'S SITUATION:
{user_text}

KNOWLEDGE BASE (use relevant parts to inform your advice — do NOT reproduce this verbatim):
{context}

Return ONLY a JSON object. No markdown, no preamble, nothing else. Every field must be specific to what she actually described. Use "you/your" language throughout — never "they/their/this user".

JSON schema to follow:
{json.dumps(schema, indent=2)}"""

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        temperature=0.3,
        max_tokens=2000,
    )
    return response.choices[0].message.content


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="BalanceLens API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    global retriever

    if not GROQ_KEY:
        print("[BalanceLens] WARNING: GROQ_API_KEY not set. /chat will fail.")
    else:
        print("[BalanceLens] Groq API key loaded ✓")

    embeddings = OnnxEmbeddings(model_name=EMBED_MODEL)

    if not _index_exists(INDEX_PATH):
        print("[BalanceLens] Building FAISS index from knowledge base...")
        _build_index(embeddings)

    vs = FAISS.load_local(
        str(INDEX_PATH), embeddings, allow_dangerous_deserialization=True
    )
    retriever = vs.as_retriever(search_kwargs={"k": RAG_K})
    print("[BalanceLens] Ready.")


@app.get("/health")
def health():
    return {"ok": True, "groq_key_set": bool(GROQ_KEY)}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    # 1. Retrieve from knowledge base — only .md files
    docs    = retriever.invoke(req.text)
    sources = _compact_sources(docs)
    context = "\n\n".join(
        f"[{s['source']}]\n{s['excerpt']}" for s in sources
    ) or "No relevant knowledge retrieved."

    # 2. Call Groq
    raw = _call_groq(req.text, context)

    # 3. Parse JSON — try once, repair once if needed
    try:
        obj = json.loads(_extract_json(raw))
    except Exception:
        try:
            client = Groq(api_key=GROQ_KEY)
            fix = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{
                    "role": "user",
                    "content": f"Fix this into valid JSON only. Return nothing but the raw JSON object:\n\n{raw}"
                }],
                max_tokens=2000,
                temperature=0,
            )
            obj = json.loads(_extract_json(fix.choices[0].message.content))
        except Exception as e:
            raise ValueError(f"JSON parse failed: {e}\n\nRaw output was:\n{raw[:600]}")

    # 4. Always use the actual retrieved sources
    obj["citations"] = sources
    return obj
