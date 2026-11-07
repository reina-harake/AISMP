"""
AISMP AI service (FastAPI).

/classify   -> trained TF-IDF + Linear SVM (or whichever model won training) for the category,
               plus rule-based language detection (en / ar / arabizi / mixed)
/prioritize -> trained priority model using text + category + similar_recent_count + has_evidence

Models are loaded from models/*.joblib (built by `python -m training.train_all`).
If a model file is missing, the endpoint falls back to the keyword/rule baseline,
so the service always answers.
"""
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel, Field

from .baseline import detect_language, keyword_classify, rule_prioritize
from .smalltalk import extract_entities, match_smalltalk

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"


def _load(name):
    path = MODELS_DIR / f"{name}.joblib"
    if not path.exists():
        print(f"[ml] {path.name} not found -> using baseline")
        return None
    bundle = joblib.load(path)
    print(f"[ml] loaded {name} model: {bundle['name']}")
    return bundle


CATEGORY = _load("category")
PRIORITY = _load("priority")
INTENT = _load("intent")

app = FastAPI(title="AISMP AI Service", version="1.0.0")


class ClassifyIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=6000)


class ClassifyOut(BaseModel):
    category: str
    confidence: float
    language: str
    model: str
    probabilities: dict | None = None


class PrioritizeIn(BaseModel):
    text: str = Field(..., max_length=6000)
    category: str
    area: str | None = None
    similar_recent_count: int = Field(0, ge=0)
    has_evidence: bool = False


class PrioritizeOut(BaseModel):
    priority: str
    score: float
    model: str
    probabilities: dict | None = None
    factors: dict | None = None


def _proba(model, X):
    probs = model.predict_proba(X)[0]
    return {str(c): round(float(p), 4) for c, p in zip(model.classes_, probs)}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "category_model": CATEGORY["name"] if CATEGORY else "keyword-baseline",
        "priority_model": PRIORITY["name"] if PRIORITY else "rule-baseline",
        "intent_model": INTENT["name"] if INTENT else "none",
    }


@app.post("/classify", response_model=ClassifyOut)
def classify(body: ClassifyIn):
    lang = detect_language(body.text)
    if CATEGORY is None:
        cat, conf = keyword_classify(body.text)
        return ClassifyOut(category=cat, confidence=conf, language=lang, model="keyword-baseline")

    probs = _proba(CATEGORY["model"], [body.text])
    cat = max(probs, key=probs.get)
    return ClassifyOut(category=cat, confidence=probs[cat], language=lang,
                       model=CATEGORY["name"], probabilities=probs)


# weights to turn class probabilities into a single 0..1 urgency score (for sorting/dashboards)
_URGENCY = {"low": 0.1, "medium": 0.4, "high": 0.7, "critical": 1.0}


@app.post("/prioritize", response_model=PrioritizeOut)
def prioritize(body: PrioritizeIn):
    if PRIORITY is None:
        level, score, factors = rule_prioritize(body.text, body.category, body.similar_recent_count, body.has_evidence)
        return PrioritizeOut(priority=level, score=score, factors=factors, model="rule-baseline")

    X = pd.DataFrame([{
        "text": body.text,
        "category": body.category,
        "similar_recent_count": body.similar_recent_count,
        "has_evidence": int(body.has_evidence),
    }])
    probs = _proba(PRIORITY["model"], X)
    level = max(probs, key=probs.get)
    score = round(sum(_URGENCY[k] * v for k, v in probs.items()), 4)
    return PrioritizeOut(priority=level, score=score, model=PRIORITY["name"], probabilities=probs,
                         factors={"category": body.category, "similar_recent_count": body.similar_recent_count,
                                  "has_evidence": body.has_evidence})


# ---------------------------------------------------------------- chatbot NLU

class IntentIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class IntentOut(BaseModel):
    intent: str
    confidence: float
    language: str
    source: str                 # 'rules' (small talk) | 'model' | 'none'
    alternatives: list = []
    entities: dict = {}


INTENT_THRESHOLD = 0.40
# filing a complaint is an action, so ask for more certainty before suggesting it
INTENT_THRESHOLDS = {"report_problem": 0.60, "human_contact": 0.50}


@app.post("/intent", response_model=IntentOut)
def intent(body: IntentIn):
    """Small talk (hi / thanks / bye) is matched against phrase lists; everything else goes to
    the trained intent classifier. Low-confidence predictions come back as 'unknown'."""
    lang = detect_language(body.text)
    entities = extract_entities(body.text)

    # rules first; a leading greeting ("hello, there is a pothole ...") is removed before the model,
    # otherwise the greeting words pull the prediction towards 'greeting'
    rule, rest, greeted = match_smalltalk(body.text)
    if rule:
        return IntentOut(intent=rule, confidence=1.0, language=lang, source="rules", entities=entities)
    if INTENT is None:
        return IntentOut(intent=greeted or "unknown", confidence=0.0, language=lang, source="none", entities=entities)

    probs = _proba(INTENT["model"], [rest or body.text])
    ranked = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
    best, conf = ranked[0]
    if conf < INTENT_THRESHOLDS.get(best, INTENT_THRESHOLD):
        best = "unknown"
    # what followed the greeting meant nothing ("how are you today", "hello my friend"):
    # answer the greeting instead of "I did not understand"
    if greeted and (best in ("unknown", "greeting", "how_are_you", "acknowledge")
                    or (best == "out_of_scope" and len(rest.split()) <= 2)):
        return IntentOut(intent=greeted, confidence=1.0, language=lang, source="rules", entities=entities)
    return IntentOut(intent=best, confidence=conf, language=lang, source="model", entities=entities,
                     alternatives=[{"intent": k, "confidence": v} for k, v in ranked[1:3]])
