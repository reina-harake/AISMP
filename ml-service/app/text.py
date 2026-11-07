"""Text preprocessing shared by training and serving (must be importable when models load)."""
import re
import unicodedata

from .baseline import normalize_arabic

URL_RE = re.compile(r"https?://\S+")
NUM_ONLY_RE = re.compile(r"\b\d+\b")   # standalone numbers (not Arabizi digits inside words)
ELONGATION_RE = re.compile(r"(\D)\1{2,}")  # 3+ repeats of a letter: "ktiiiir", "pleaaase", "كتييير"


def preprocess(text: str) -> str:
    """Lowercase, normalize Arabic letters/diacritics, drop URLs and standalone numbers,
    collapse stretched letters. Arabizi digits inside words (3am, 7ay, 2astal) are kept."""
    text = normalize_arabic(str(text).lower())
    text = ELONGATION_RE.sub(r"\1", text)
    text = URL_RE.sub(" ", text)
    text = NUM_ONLY_RE.sub(" ", text)
    text = re.sub(r"[^\w؀-ۿ\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------- Arabizi spelling key
# Arabizi has no standard spelling: the same word appears as kahraba / kahrba / ka7raba,
# zbele / zbeleh / zbale, shere3 / chare3 / sheri3, msh / mish / mesh. The key below maps
# all of these to one form by keeping the consonant skeleton:
#   kh->5, gh->8, sh/ch->x, 7->h, q/9/2 (hamza) and 3 (ayn) dropped, vowels dropped,
#   doubled letters collapsed.   kahraba, kahrba, ka7raba -> khrb   zbele, zbeleh, zbale -> zbl
LATIN_RE = re.compile(r"^[a-z0-9]+$")


def _strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def arabizi_key(token: str) -> str:
    t = _strip_accents(token.lower())
    if not LATIN_RE.match(t) or not re.search("[a-z]", t):
        return ""
    t = t.replace("kh", "5").replace("gh", "8").replace("sh", "x").replace("ch", "x")
    t = t.replace("7", "h").replace("q", "").replace("9", "").replace("2", "").replace("3", "")
    t = re.sub(r"(?<=[aeiou])h$", "", t)          # final -eh / -ah: zbeleh -> zbele
    t = re.sub(r"[aeiou]", "", t)
    t = re.sub(r"(.)\1+", r"\1", t)
    return t


def arabizi_skeleton(text: str) -> str:
    """Preprocessed text with every Latin word replaced by its spelling key (Arabic words dropped).
    Used as an extra feature channel next to the normal word and character features."""
    keys = (arabizi_key(w) for w in _strip_accents(preprocess(text)).split())
    return " ".join(k for k in keys if k)
