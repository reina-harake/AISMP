"""
Trains the chatbot intent classifier (proposal section 3.7: "natural language understanding").

Data: hand-written examples per intent in EN / AR / Arabizi / FR (training/intents_data.py)
plus compositional phrasings (training/intents_frames.py), expanded into noisy variants (typos, no punctuation, Arabizi spelling, French
without accents), plus a 'report_problem' class sampled from the complaint dataset.

Evaluation: 5-fold StratifiedGroupKFold where a group = one original sentence (with its
variants) or one sentence frame, so test sentences are never seen in training.

Usage:  python -m training.train_intent       (after training.generate_dataset)
Output: models/intent.joblib, reports/INTENT_RESULTS.md, reports/metrics_intent.json
"""
import json
import random
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from training.generate_dataset import strip_accents, typo, vary_arabizi
from training.intents_data import INTENTS
from training.intents_frames import generate as generate_frames
from training.train_all import text_features

ROOT = Path(__file__).resolve().parents[1]
SEED = 42
POLITE = {"en": ["please", "hi,", "excuse me,"], "ar": ["لو سمحت", "مرحبا،", "بليز"],
          "arabizi": ["please", "marhaba,", "law sama7t"], "fr": ["s'il vous plaît", "bonjour,", "svp"]}
GREET = {"en": ["hello,", "hi,", "hey,", "good morning,", "hello, i have a problem:"],
         "ar": ["مرحبا،", "السلام عليكم،", "صباح الخير،", "مرحبا، عندي مشكلة:"],
         "arabizi": ["marhaba,", "hi,", "salam,", "marhaba, 3ande moshkle:"],
         "fr": ["bonjour,", "salut,", "bonsoir,", "bonjour, j'ai un problème :"]}


def variants(text, lang, rng, n=5):
    out = [text]
    for _ in range(n - 1):
        v = text
        r = rng.random()
        if r < 0.25:
            p = rng.choice(POLITE[lang])
            v = f"{p} {v}" if rng.random() < 0.5 else f"{v} {p}"
        if lang == "arabizi":
            v = vary_arabizi(v, rng)
        if lang == "fr" and rng.random() < 0.4:
            v = strip_accents(v)
        if rng.random() < 0.3 and len(v.split()) > 1:
            v = typo(v, rng)
        if rng.random() < 0.4:
            v = v.replace("?", "").replace("!", "").replace(",", "").replace("،", "")
        if lang != "ar" and rng.random() < 0.3:
            v = v.lower()
        out.append(v)
    return out


def build(seed=SEED):
    rng = random.Random(seed)
    rows = []
    for intent, langs in INTENTS.items():
        for lang, examples in langs.items():
            for i, ex in enumerate(examples):
                for v in variants(ex, lang, rng):
                    rows.append({"text": v, "intent": intent, "language": lang, "group": f"{intent}:{lang}:{i}"})

    # compositional phrasings (frames x vocabulary), with the same noise
    for r in generate_frames(rng):
        r["text"] = variants(r["text"], r["language"], rng, n=2)[1]
        rows.append(r)

    # report_problem: real-looking complaint texts from the complaint dataset
    comp = pd.read_csv(ROOT / "data" / "complaints.csv")
    sample = pd.concat([d.sample(min(len(d), 250), random_state=seed) for _, d in comp.groupby("language")])
    for r in sample.itertuples():
        text = r.text
        if rng.random() < 0.2:   # people often greet first: "hello, there is a pothole ..."
            text = f"{rng.choice(GREET[r.language])} {text}"
        rows.append({"text": text, "intent": "report_problem", "language": r.language, "group": f"rp:{r.template_id}"})
    return pd.DataFrame(rows)


def candidates():
    return {
        "Linear SVM": Pipeline([("tfidf", text_features()),
                                ("clf", CalibratedClassifierCV(LinearSVC(C=1.0, class_weight="balanced", random_state=SEED), cv=3))]),
        "Logistic Regression": Pipeline([("tfidf", text_features()),
                                         ("clf", LogisticRegression(C=10, max_iter=3000, class_weight="balanced", random_state=SEED))]),
        "Naive Bayes": Pipeline([("tfidf", text_features()), ("clf", MultinomialNB(alpha=0.1))]),
    }


def main():
    df = build()
    print(f"[intent] {len(df)} rows, {df['group'].nunique()} source sentences, {df['intent'].nunique()} intents")
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)

    results, preds = [], {}
    for name, model in candidates().items():
        y_pred = np.empty(len(df), dtype=object)
        for tr, te in cv.split(df, df["intent"], groups=df["group"]):
            m = clone(model).fit(df["text"].iloc[tr], df["intent"].iloc[tr])
            y_pred[te] = m.predict(df["text"].iloc[te])
        preds[name] = y_pred
        row = {"model": name,
               "accuracy": round(accuracy_score(df["intent"], y_pred), 4),
               "f1": round(f1_score(df["intent"], y_pred, average="macro"), 4)}
        for lang in ["en", "fr", "ar", "arabizi"]:
            m = (df["language"] == lang).values
            row[f"f1_{lang}"] = round(f1_score(df["intent"][m], y_pred[m], average="macro"), 4)
        results.append(row)
        print(f"  {name:20s} acc={row['accuracy']} f1={row['f1']}")

    best = max(results, key=lambda r: r["f1"])["model"]
    print(f"  -> selected: {best}")
    final = candidates()[best].fit(df["text"], df["intent"])
    (ROOT / "models").mkdir(exist_ok=True)
    joblib.dump({"model": final, "name": best, "labels": sorted(df["intent"].unique())}, ROOT / "models" / "intent.joblib")

    report = classification_report(df["intent"], preds[best], digits=3, zero_division=0)
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    (reports / "metrics_intent.json").write_text(json.dumps({"rows": len(df), "results": results, "selected": best,
                                                              "per_intent": classification_report(df["intent"], preds[best], output_dict=True, zero_division=0)},
                                                             indent=2), encoding="utf-8")
    cols = ["model", "accuracy", "f1", "f1_en", "f1_fr", "f1_ar", "f1_arabizi"]
    md = ["# Chatbot intent classifier\n",
          f"{len(df)} training sentences ({df['group'].nunique()} originals + noisy variants), "
          f"{df['intent'].nunique()} intents, 4 languages. 5-fold cross-validation grouped by original sentence.\n",
          "| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    md += ["| " + " | ".join(str(r[c]) for c in cols) + " |" for r in results]
    md += [f"\nSelected: **{best}**\n", "## Per intent (selected model)\n", "```", report, "```"]
    (reports / "INTENT_RESULTS.md").write_text("\n".join(md), encoding="utf-8")
    print("[done]")


if __name__ == "__main__":
    main()
