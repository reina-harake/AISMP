"""
Trains and compares the AISMP models (proposal section 3.5).

  1. Complaint CATEGORY classifier  (NLP, text only)
       TF-IDF (word 1-2 grams + character 2-5 grams) + {Naive Bayes, Linear SVM, Logistic Regression}
       compared against the keyword baseline.
  2. Complaint PRIORITY model  (text + category + historical frequency + evidence)
       {Logistic Regression, Linear SVM, Random Forest} compared against the rule baseline.

Evaluation
  - Train/test split BY TEMPLATE (GroupShuffleSplit): test sentences use patterns never seen
    in training, in any language -> honest scores, no near-duplicate leakage.
  - Model selection by 5-fold GroupKFold cross-validation (macro F1) on the training set only.
  - Metrics: accuracy, macro precision / recall / F1, per-language F1, confusion matrices,
    and for priority also "within one level" accuracy and recall on Critical.
  - The selected models are refit on all data and saved to models/.

Usage:  python -m training.train_all            (from ml-service/)
Outputs: models/category.joblib, models/priority.joblib, reports/metrics.json,
         reports/RESULTS.md, reports/*.png
"""
import argparse
import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                             precision_recall_fscore_support, recall_score)
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, cross_val_score
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import LinearSVC

from app.baseline import detect_language, keyword_classify, rule_prioritize
from app.text import arabizi_skeleton, preprocess

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ["road_damage", "street_lighting", "electricity", "water", "waste", "noise", "illegal_construction",
              "parking", "stray_animals", "public_spaces", "other"]
# Hand-written Arabizi complaints, typed the way people actually write (free spelling, French/English
# words mixed in). NOT generated from the templates and never used for training: an honest check
# of how well the models handle real Arabizi.
REALISTIC_ARABIZI = ROOT / "data" / "arabizi_realistic.csv"
PRIORITIES = ["low", "medium", "high", "critical"]
SEED = 42


# ---------------------------------------------------------------- feature builders

def text_features():
    """Word n-grams capture meaning; character n-grams handle typos and Arabic morphology
    (prefixes like بال, عال); the Arabizi spelling key maps kahraba / kahrba / ka7raba (etc.)
    to one feature, so spellings never seen in training still match."""
    return FeatureUnion([
        ("word", TfidfVectorizer(preprocessor=preprocess, ngram_range=(1, 2), min_df=2, sublinear_tf=True)),
        ("char", TfidfVectorizer(preprocessor=preprocess, analyzer="char_wb", ngram_range=(2, 5),
                                 min_df=2, sublinear_tf=True, max_features=80000)),
        ("arabizi", TfidfVectorizer(preprocessor=arabizi_skeleton, ngram_range=(1, 2), min_df=2, sublinear_tf=True)),
    ])


def category_candidates():
    return {
        "Naive Bayes": Pipeline([("tfidf", text_features()), ("clf", MultinomialNB(alpha=0.1))]),
        "Linear SVM": Pipeline([("tfidf", text_features()),
                                ("clf", CalibratedClassifierCV(LinearSVC(C=1.0, random_state=SEED), cv=3))]),
        "Logistic Regression": Pipeline([("tfidf", text_features()),
                                         ("clf", LogisticRegression(C=10, max_iter=3000, random_state=SEED))]),
    }


def priority_features():
    return ColumnTransformer([
        ("text", text_features(), "text"),
        ("category", OneHotEncoder(handle_unknown="ignore"), ["category"]),
        ("numeric", StandardScaler(), ["similar_recent_count", "has_evidence"]),
    ])


def priority_candidates():
    return {
        "Logistic Regression": Pipeline([("features", priority_features()),
                                         ("clf", LogisticRegression(C=5, max_iter=3000, class_weight="balanced",
                                                                    random_state=SEED))]),
        "Linear SVM": Pipeline([("features", priority_features()),
                                ("clf", CalibratedClassifierCV(LinearSVC(C=0.5, class_weight="balanced",
                                                                         random_state=SEED), cv=3))]),
        "Random Forest": Pipeline([("features", priority_features()),
                                   ("clf", RandomForestClassifier(n_estimators=300, min_samples_leaf=2,
                                                                  class_weight="balanced", n_jobs=-1,
                                                                  random_state=SEED))]),
    }


# ---------------------------------------------------------------- metrics

def scores(y_true, y_pred, labels):
    p, r, f, _ = precision_recall_fscore_support(y_true, y_pred, labels=labels, average="macro", zero_division=0)
    return {"accuracy": round(accuracy_score(y_true, y_pred), 4),
            "precision": round(p, 4), "recall": round(r, 4), "f1": round(f, 4)}


def lang_f1(y_true, y_pred, langs):
    y_true, y_pred, langs = np.asarray(y_true), np.asarray(y_pred), np.asarray(langs)
    return {l: round(f1_score(y_true[langs == l], y_pred[langs == l], average="macro"), 4)
            for l in ["en", "fr", "ar", "arabizi"]}


def priority_extra(y_true, y_pred):
    rank = {p: i for i, p in enumerate(PRIORITIES)}
    t = np.array([rank[v] for v in y_true])
    p = np.array([rank[v] for v in y_pred])
    return {"within_one_level": round(float(np.mean(np.abs(t - p) <= 1)), 4),
            "critical_recall": round(recall_score(y_true, y_pred, labels=["critical"], average="macro",
                                                  zero_division=0), 4)}


def save_confusion(y_true, y_pred, labels, title, path):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    fig, ax = plt.subplots(figsize=(4 + 0.6 * len(labels), 3 + 0.55 * len(labels)))
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(labels)), labels, rotation=35, ha="right")
    ax.set_yticks(range(len(labels)), labels)
    for i in range(len(labels)):
        for j in range(len(labels)):
            ax.text(j, i, cm[i, j], ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black", fontsize=8 if len(labels) > 6 else 10)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def md_table(rows, cols):
    head = "| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n"
    return head + "".join("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |\n" for r in rows)


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / "data" / "complaints.csv"))
    ap.add_argument("--extra", default=None, help="optional CSV of real labelled complaints to append")
    ap.add_argument("--quick", action="store_true", help="skip cross-validation (dev only: then selection uses the test set)")
    args = ap.parse_args()

    df = pd.read_csv(args.data)
    if args.extra:
        extra = pd.read_csv(args.extra)
        extra["template_id"] = extra.get("template_id", pd.Series(range(len(extra)))).astype(str).radd("real:")
        df = pd.concat([df, extra], ignore_index=True)
    df["text"] = df["text"].astype(str)
    print(f"[data] {len(df)} rows, {df['template_id'].nunique()} template groups")

    split = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=SEED)
    tr_idx, te_idx = next(split.split(df, groups=df["template_id"]))
    train, test = df.iloc[tr_idx].reset_index(drop=True), df.iloc[te_idx].reset_index(drop=True)
    print(f"[split] train {len(train)}  test {len(test)} (unseen templates)")

    (ROOT / "models").mkdir(exist_ok=True)
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    metrics = {"dataset": {"rows": len(df), "train": len(train), "test": len(test),
                           "categories": df["category"].value_counts().to_dict(),
                           "priorities": df["priority"].value_counts().to_dict(),
                           "languages": df["language"].value_counts().to_dict()}}
    cv = GroupKFold(n_splits=5)

    # ============================== LANGUAGE DETECTION (rule-based)
    det = df["text"].map(detect_language)
    lang_acc = round(float((det == df["language"]).mean()), 4)
    metrics["language_detection"] = {
        "accuracy": lang_acc,
        "per_language": {l: round(float((det[df["language"] == l] == l).mean()), 4) for l in ["en", "fr", "ar", "arabizi"]},
    }
    print(f"[lang] detection accuracy {lang_acc}  {metrics['language_detection']['per_language']}")

    # ============================== CATEGORY
    print("\n=== Category classification ===")
    real = pd.read_csv(REALISTIC_ARABIZI) if REALISTIC_ARABIZI.exists() else None

    def real_acc(predict):
        return "-" if real is None else round(float((np.asarray(predict(real["text"])) == real["category"]).mean()), 4)

    cat_rows = []
    base_pred = [keyword_classify(t)[0] for t in test["text"]]
    cat_rows.append({"model": "Keyword baseline", "cv_f1": "-", **scores(test["category"], base_pred, CATEGORIES),
                     **{f"f1_{k}": v for k, v in lang_f1(test["category"], base_pred, test["language"]).items()},
                     "acc_arabizi_real": real_acc(lambda xs: [keyword_classify(t)[0] for t in xs])})

    best_cat, best_cv, cat_preds = None, -1, {}
    for name, model in category_candidates().items():
        t0 = time.time()
        cv_f1 = "-"
        if not args.quick:
            cv_f1 = round(cross_val_score(clone(model), train["text"], train["category"], groups=train["template_id"],
                                          cv=cv, scoring="f1_macro", n_jobs=-1).mean(), 4)
        model.fit(train["text"], train["category"])
        pred = model.predict(test["text"])
        cat_preds[name] = pred
        row = {"model": name, "cv_f1": cv_f1, **scores(test["category"], pred, CATEGORIES),
               **{f"f1_{k}": v for k, v in lang_f1(test["category"], pred, test["language"]).items()},
               "acc_arabizi_real": real_acc(model.predict), "train_sec": round(time.time() - t0, 1)}
        cat_rows.append(row)
        print(f"  {name:22s} cv_f1={cv_f1}  test_f1={row['f1']}  acc={row['accuracy']}  "
              f"real_arabizi_acc={row['acc_arabizi_real']}")
        sel = cv_f1 if cv_f1 != "-" else row["f1"]
        if sel > best_cv:
            best_cat, best_cv = name, sel

    print(f"  -> selected: {best_cat}")
    save_confusion(test["category"], cat_preds[best_cat], CATEGORIES, f"Category - {best_cat}",
                   reports / "confusion_category.png")
    final_cat = category_candidates()[best_cat].fit(df["text"], df["category"])
    joblib.dump({"model": final_cat, "name": best_cat, "labels": CATEGORIES}, ROOT / "models" / "category.joblib")
    metrics["category"] = {"selected": best_cat, "results": cat_rows,
                           "confusion_matrix": confusion_matrix(test["category"], cat_preds[best_cat],
                                                                labels=CATEGORIES).tolist()}
    real_errors = []
    if real is not None:   # the deployed model (trained on all generated data) on the hand-written Arabizi
        real_pred = final_cat.predict(real["text"])
        real_errors = [{"text": t, "expected": e, "predicted": p}
                       for t, e, p in zip(real["text"], real["category"], real_pred) if e != p]
        metrics["category"]["arabizi_realistic"] = {
            "rows": len(real), "accuracy": round(1 - len(real_errors) / len(real), 4), "errors": real_errors}
        print(f"  deployed model on hand-written Arabizi: {len(real) - len(real_errors)}/{len(real)} correct")

    # ============================== PRIORITY
    print("\n=== Priority prediction ===")
    feats = ["text", "category", "similar_recent_count", "has_evidence"]
    pri_rows = []
    base_pri = [rule_prioritize(r.text, r.category, int(r.similar_recent_count), bool(r.has_evidence))[0]
                for r in test.itertuples()]
    pri_rows.append({"model": "Rule baseline", "cv_f1": "-", **scores(test["priority"], base_pri, PRIORITIES),
                     **priority_extra(test["priority"], base_pri)})

    best_pri, best_cv, pri_preds, pri_models = None, -1, {}, {}
    for name, model in priority_candidates().items():
        t0 = time.time()
        cv_f1 = "-"
        if not args.quick:
            cv_f1 = round(cross_val_score(clone(model), train[feats], train["priority"], groups=train["template_id"],
                                          cv=cv, scoring="f1_macro", n_jobs=-1).mean(), 4)
        model.fit(train[feats], train["priority"])
        pred = model.predict(test[feats])
        pri_preds[name], pri_models[name] = pred, model
        row = {"model": name, "cv_f1": cv_f1, **scores(test["priority"], pred, PRIORITIES),
               **priority_extra(test["priority"], pred), "train_sec": round(time.time() - t0, 1)}
        pri_rows.append(row)
        print(f"  {name:22s} cv_f1={cv_f1}  test_f1={row['f1']}  within1={row['within_one_level']}  "
              f"crit_recall={row['critical_recall']}")
        sel = cv_f1 if cv_f1 != "-" else row["f1"]
        if sel > best_cv:
            best_pri, best_cv = name, sel

    print(f"  -> selected: {best_pri}")

    # End-to-end: priority computed from the PREDICTED category (what happens in production)
    e2e_in = test[feats].copy()
    e2e_in["category"] = cat_preds[best_cat]
    e2e_pred = pri_models[best_pri].predict(e2e_in)
    e2e = {**scores(test["priority"], e2e_pred, PRIORITIES), **priority_extra(test["priority"], e2e_pred)}
    print(f"  end-to-end (predicted category) f1={e2e['f1']}")

    save_confusion(test["priority"], pri_preds[best_pri], PRIORITIES, f"Priority - {best_pri}",
                   reports / "confusion_priority.png")
    final_pri = priority_candidates()[best_pri].fit(df[feats], df["priority"])
    joblib.dump({"model": final_pri, "name": best_pri, "labels": PRIORITIES, "features": feats},
                ROOT / "models" / "priority.joblib")
    metrics["priority"] = {"selected": best_pri, "results": pri_rows, "end_to_end": e2e,
                           "confusion_matrix": confusion_matrix(test["priority"], pri_preds[best_pri],
                                                                labels=PRIORITIES).tolist()}

    # ============================== reports
    (reports / "metrics.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    md = ["# AISMP model evaluation results\n",
          f"Dataset: {len(df)} complaints (EN / FR / AR / Arabizi), {df['template_id'].nunique()} sentence templates. "
          f"Train {len(train)} / test {len(test)}; the test set contains only templates unseen in training.\n",
          f"## Language detection\n\nRule-based detector accuracy: **{lang_acc}** "
          f"(per language: {metrics['language_detection']['per_language']})\n",
          "## Category classification\n",
          md_table(cat_rows, ["model", "cv_f1", "accuracy", "precision", "recall", "f1", "f1_en", "f1_fr", "f1_ar",
                              "f1_arabizi", "acc_arabizi_real"]),
          f"\nSelected (best cross-validated macro F1): **{best_cat}**\n",
          "\nacc_arabizi_real = accuracy on data/arabizi_realistic.csv: hand-written Arabizi complaints (free "
          "spelling, French/English words mixed in), never used for training.\n",
          *([f"\nDeployed model on that set: **{metrics['category']['arabizi_realistic']['accuracy']}**. "
             "Misclassified:\n\n" + md_table(real_errors, ["text", "expected", "predicted"])]
            if real_errors else []),
          "\n![category confusion](confusion_category.png)\n",
          "## Priority prediction\n",
          md_table(pri_rows, ["model", "cv_f1", "accuracy", "precision", "recall", "f1", "within_one_level", "critical_recall"]),
          f"\nSelected: **{best_pri}**. End-to-end (using the predicted category): "
          f"F1 {e2e['f1']}, accuracy {e2e['accuracy']}, within one level {e2e['within_one_level']}.\n",
          "\n![priority confusion](confusion_priority.png)\n",
          "\nMetrics are macro-averaged. cv_f1 = mean macro F1 over 5-fold GroupKFold on the training set.\n"]
    (reports / "RESULTS.md").write_text("\n".join(md), encoding="utf-8")
    print(f"\n[done] models -> {ROOT / 'models'}, reports -> {reports}")


if __name__ == "__main__":
    main()
