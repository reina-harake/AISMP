"""
Keyword / rule baseline for English, French, Arabic and Arabizi (Lebanese "Franco").
Kept after the ML models are trained: it is the comparison baseline for the report
(accuracy / F1 of trained models vs. this).
"""
import re
import unicodedata

ARABIC_RE = re.compile(r"[؀-ۿ]")
# Arabizi: Latin words containing the digits used for Arabic sounds (2=ء, 3=ع, 5=خ, 7=ح, 8=غ, 9=ق)
ARABIZI_DIGIT_RE = re.compile(r"(?=[a-z23578]*[a-z])(?=[a-z23578]*[23578])[a-z23578]+", re.I)
ARABIZI_WORDS = {
    "fi", "ma", "mesh", "msh", "kteer", "ktir", "men", "bel", "3al", "el", "w", "lal", "hay", "7ay",
    "ba2a", "kif", "lesh", "shou", "shu", "iza", "eza", "3am", "ya3ne", "baddna", "bade",
    # common words without digits (people often drop the 2/3/7): msh -> mish, 3am -> am ...
    "mish", "mch", "kter", "shi", "chi", "hon", "honik", "kel", "kil", "badde", "baddi", "fe", "wa", "enno", "inno",
    "lesh", "leh", "chou", "keef", "kif", "kamen", "kaman", "hayda", "hayde", "hal", "lyom", "mbere7", "yalla",
    "sarlo", "sarla", "min", "tari2", "tarik", "shere3", "share3", "zbele", "zbeleh", "kahraba", "kahrba", "binaye",
    "jiran", "wled", "nes", "sayyara", "sayara", "sayarat", "leil", "nhar", "dajje", "klab", "kleb", "jnayne", "mante2a",
    "baladiye", "shakwa", "ktiir", "kteer", "fina", "fiye", "ma3", "ba3d", "abel", "2oddem", "eddem", "7ad", "taba3",
}


FR_STOP = {
    "le", "la", "les", "des", "du", "de", "un", "une", "est", "et", "dans", "pour", "pas", "sur", "au", "aux",
    "il", "elle", "nous", "je", "vous", "que", "qui", "depuis", "très", "tres", "ne", "plus", "c", "l", "d",
    "j", "qu", "avec", "notre", "nos", "mon", "ma", "près", "pres", "devant", "rue", "merci", "bonjour",
    "sont", "ont", "fait", "cette", "ce", "quartier", "svp",
}
EN_STOP = {
    "the", "is", "are", "a", "an", "and", "of", "in", "on", "for", "to", "it", "there", "has", "have",
    "not", "near", "since", "our", "my", "please", "street", "this", "was", "been", "with", "at", "from",
}
FR_ACCENT_RE = re.compile(r"[éèêëàâçùûîïô]")


def normalize_arabic(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[ً-ْـ]", "", text)          # diacritics + tatweel
    text = re.sub("[إأآا]", "ا", text)
    text = text.replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    return text


def tokenize(text: str) -> list[str]:
    return re.findall(r"[\w؀-ۿ]+", normalize_arabic(text.lower()))


def detect_language(text: str) -> str:
    tokens = tokenize(text)
    if not tokens:
        return "unknown"
    ar = sum(1 for t in tokens if ARABIC_RE.search(t))
    latin = len(tokens) - ar
    arabizi = sum(1 for t in tokens if not ARABIC_RE.search(t) and (ARABIZI_DIGIT_RE.fullmatch(t) or t in ARABIZI_WORDS))
    if ar and latin and min(ar, latin) / len(tokens) > 0.2:
        return "mixed"
    if ar > latin:
        return "ar"
    latin_tokens = [t for t in tokens if not ARABIC_RE.search(t)]
    fr = sum(1 for t in latin_tokens if t in FR_STOP or FR_ACCENT_RE.search(t))
    en = sum(1 for t in latin_tokens if t in EN_STOP)
    if latin and arabizi / latin >= 0.2 and arabizi > fr:
        return "arabizi"
    if fr > en:
        return "fr"
    return "en"


# Stems/keywords per category. Arabic entries are normalized (ة->ه, أ->ا ...).
KEYWORDS = {
    "road_damage": [
        "pothole", "road", "street", "asphalt", "crack", "sidewalk", "pavement", "bridge", "traffic light",
        "حفره", "طريق", "شارع", "زفت", "رصيف", "جسر", "تشقق",
        "7ofra", "hofra", "7fra", "tari2", "tare2", "zeft", "rasif", "jeser",
        "route", "chaussée", "nid", "trottoir", "fissure", "pont", "asphalte", "feu de circulation",
    ],
    "street_lighting": [
        "street light", "street lights", "streetlight", "lamp", "lamps", "lamp post", "lighting", "dark",
        "ضو", "اضاءه", "انارة", "اناره", "لمبه", "لمبات", "عتمه",
        "dow", "daw", "lamba", "lambet", "enara", "3atme", "lampadaire",
        "lampadaires", "éclairage", "eclairage", "ampoule", "noir",
    ],
    "electricity": [
        "electricity", "power", "outage", "wire", "cable", "transformer", "pole", "blackout", "generator", "voltage",
        "كهربا", "كهرباء", "كهربه", "شريط", "محول", "عمود", "انقطاع", "موتور", "تيار",
        "kahraba", "kahrba", "shrit", "sharit", "mo7awel", "maktou3a", "ma2tou3a", "2ate3", "moteur", "motor",
        "dawle", "tayyar", "shertan", "poteau", "eshtirak",
        "électricité", "electricite", "courant", "câble", "cable", "transformateur", "panne", "générateur", "fils",
    ],
    "water": [
        "water", "leak", "pipe", "sewage", "flood", "drain", "drainage", "burst", "tap",
        "مي", "مياه", "ماء", "تسرب", "قسطل", "مجارير", "صرف", "فيضان", "طوفان",
        "may", "mayy", "miyeh", "mayye", "2assatel", "assatel", "2astal", "majarir", "majareer", "majrour", "tawafan",
        "khazzen", "regar", "tuyau",
        "eau", "fuite", "conduite", "égout", "egout", "inond", "robinet", "canalisation",
    ],
    "waste": [
        "garbage", "trash", "waste", "rubbish", "bin", "bins", "dump", "litter", "smell", "rats",
        "زباله", "نفايات", "زبالة", "مستوعب", "حاويه", "ريحه", "جرذان",
        "zbele", "zbeleh", "zbale", "nifayet", "nfeyet", "ri7a", "riha", "jrazen", "container", "camion",
        "poubelle", "ordure", "déchet", "dechet", "benne", "odeur", "rats",
    ],
    "noise": [
        "noise", "noisy", "loud", "music", "party", "barking", "fireworks", "sleep", "midnight",
        "ضجه", "صوت", "عالي", "موسيقى", "مفرقعات", "ننام", "نص الليل", "تقويص",
        "dajje", "sot", "sotto", "3ale", "3alye", "music", "7afle", "nnem", "mfere2a3at", "t2awwes",
        "bruit", "bruyant", "musique", "fête", "aboie", "dormir", "minuit", "tapage",
    ],
    "illegal_construction": [
        "permit", "illegal", "without a permit", "construction", "building", "extra floor", "public land", "violation",
        "رخصه", "مخالف", "مخالفه", "بناء", "عمار", "يعمر", "ورشه", "طابق", "ارض عامه",
        "rokhsa", "rukhsa", "mkhalef", "mkhalfe", "bina", "3ammar", "y3ammer", "warshe", "tabe2", "chantier", "permis",
        "permis", "illégal", "illegal", "chantier", "construit", "étage", "terrain public", "infraction",
    ],
    "parking": [
        "parked", "parking", "park", "double park", "abandoned car", "garage", "blocking the entrance",
        "صف", "صافه", "صافة", "بيصف", "سياره متروكه", "كاراج", "مدخل",
        "saff", "saffe", "soff", "tsoff", "bisoff", "garage", "mad5al", "madkhal", "double file",
        "garé", "garée", "garées", "stationnement", "double file", "voiture abandonnée",
    ],
    "stray_animals": [
        "stray", "dog", "dogs", "cat", "cats", "bit", "bite", "snake", "animal",
        "كلاب", "كلب", "شارده", "قطط", "عض", "حيه", "حيوان",
        "klab", "kleb", "kalb", "sharde", "2otat", "3add", "7ayye", "7ayawan",
        "chien", "chiens", "errant", "errants", "chat", "chats", "mordu", "serpent",
    ],
    "public_spaces": [
        "park", "garden", "playground", "bench", "benches", "tree", "trees", "branch", "graffiti", "fountain", "swings",
        "جنينه", "حديقه", "ملعب", "مقاعد", "شجره", "شجر", "غصن", "نافوره", "مراجيح", "كتابات",
        "jnayne", "7adi2a", "mal3ab", "ma2a3ed", "shajra", "shajar", "ghosn", "nafoura", "marji7", "ktebet",
        "jardin", "parc", "aire de jeux", "banc", "bancs", "arbre", "branche", "graffiti", "fontaine", "balançoire",
    ],
}

# Latin keywords also match through their Arabizi spelling key (kahraba ~ kahrba ~ ka7raba)
_KEY_TO_CATS = None


def _keyword_keys():
    global _KEY_TO_CATS
    if _KEY_TO_CATS is None:
        from .text import arabizi_key
        _KEY_TO_CATS = {}
        for cat, words in KEYWORDS.items():
            for w in words:
                k = arabizi_key(w) if " " not in w else ""
                if len(k) >= 3:
                    _KEY_TO_CATS.setdefault(k, set()).add(cat)
    return _KEY_TO_CATS

SAFETY_RISK = [
    "danger", "dangerous", "accident", "injured", "fire", "spark", "electrocution", "collapse", "child",
    "children", "school", "hospital", "fallen wire", "exposed wire", "gas", "flood", "emergency",
    "خطر", "حادث", "حوادث", "حريق", "شرار", "انهيار", "ولاد", "اطفال", "مدرسه", "مستشفى", "طوارئ",
    "5atar", "khatar", "7adis", "hades", "7ari2", "wled", "madrase", "mestashfa",
    "dangereux", "danger", "accident", "blessé", "incendie", "étincelle", "effondr", "enfants", "école", "hôpital",
    "bit", "bite", "attack", "shooting", "عض", "تهجم", "3add", "tehjom", "mordu", "attaquent",
]
URGENCY = ["urgent", "now", "immediately", "days", "week", "weeks", "عاجل", "فورا", "ايام", "مستعجل", "3ajel", "fawran", "iyem", "ayam",
           "urgence", "vite", "jours", "semaine", "semaines"]

CATEGORY_BASE = {"electricity": 0.45, "water": 0.4, "road_damage": 0.4, "street_lighting": 0.35, "stray_animals": 0.35,
                 "waste": 0.3, "illegal_construction": 0.3, "public_spaces": 0.25, "noise": 0.2, "parking": 0.2,
                 "other": 0.2}


AR_PREFIX_RE = re.compile(r"^(وال|بال|عال|كال|فال|لل|ال|و|ب)")


def _variants(token):
    """Token plus the token without common Arabic prefixes (ال, بال, عال, و ...)."""
    stripped = AR_PREFIX_RE.sub("", token)
    return (token, stripped) if stripped and stripped != token else (token,)


def _count_hits(text_tokens: list[str], text_norm: str, words: list[str]) -> int:
    hits = 0
    for w in words:
        w_norm = normalize_arabic(w.lower())
        if " " in w_norm:
            hits += text_norm.count(w_norm)
        else:
            hits += sum(1 for t in text_tokens
                        if any(v == w_norm or (len(w_norm) >= 4 and v.startswith(w_norm)) for v in _variants(t)))
    return hits


def keyword_classify(text: str) -> tuple[str, float]:
    tokens = tokenize(text)
    norm = " ".join(tokens)
    scores = {cat: _count_hits(tokens, norm, words) for cat, words in KEYWORDS.items()}
    from .text import arabizi_key
    keys = _keyword_keys()
    for t in tokens:            # spelling variants: kahrba, zbeleh, chare3 ... (only words with no exact match)
        k = arabizi_key(t)
        if len(k) >= 3 and k in keys and not any(_count_hits([t], t, KEYWORDS[c]) for c in keys[k]):
            for c in keys[k]:
                scores[c] += 1
    best = max(scores, key=scores.get)
    total = sum(scores.values())
    if scores[best] == 0:
        return "other", 0.3
    return best, round(min(0.95, 0.5 + 0.45 * scores[best] / total), 4)


def rule_prioritize(text: str, category: str, similar_recent_count: int, has_evidence: bool):
    tokens = tokenize(text)
    norm = " ".join(tokens)
    risk = min(_count_hits(tokens, norm, SAFETY_RISK), 3)
    urgency = min(_count_hits(tokens, norm, URGENCY), 2)

    score = CATEGORY_BASE.get(category, 0.2)
    score += 0.15 * risk
    score += 0.05 * urgency
    score += min(similar_recent_count, 5) * 0.03     # recurring issue in the same area
    score += 0.03 if has_evidence else 0
    score = round(min(score, 1.0), 4)

    if score >= 0.8:
        level = "critical"
    elif score >= 0.6:
        level = "high"
    elif score >= 0.4:
        level = "medium"
    else:
        level = "low"

    factors = {
        "category_base": CATEGORY_BASE.get(category, 0.2),
        "safety_risk_hits": risk,
        "urgency_hits": urgency,
        "similar_recent_count": similar_recent_count,
        "has_evidence": has_evidence,
    }
    return level, score, factors
