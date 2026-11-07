"""Small-talk phrase matching, greeting stripping and entity extraction for the chatbot.

Rules run before the trained intent model. They cover short social messages the model is bad at
(very few words, no domain vocabulary): greetings, thanks, goodbye, "how are you", "ok", and
questions about the assistant itself ("what's your name", "are you a robot").
All patterns match PREPROCESSED text (lowercase, Arabic normalized: إأآ->ا, ة->ه, ى->ي; punctuation
and apostrophes replaced by spaces).
"""
import re

from .text import preprocess

SMALLTALK = {
    "greeting": [
        "hi", "hello", "hey", "hey there", "good morning", "good afternoon", "good evening", "hiya", "yo", "hello there",
        "مرحبا", "مرحبتين", "اهلا", "اهلين", "هلا", "السلام عليكم", "سلام", "صباح الخير", "مسا الخير", "مساء الخير", "هاي",
        "marhaba", "marhabtein", "ahla", "ahlan", "hala", "salam", "sabah el kheir", "masa el kheir", "hi", "hello", "bonjour",
        "bonjour", "salut", "bonsoir", "coucou", "allo", "allô", "bjr", "slt",
    ],
    "how_are_you": [
        "how are you", "how r u", "how are u", "how are you doing", "how is it going", "how s it going", "how do you do",
        "what s up", "whats up", "wassup", "sup", "how are things", "hope you are well", "how was your day",
        "كيفك", "كيفكن", "كيف حالك", "شو اخبارك", "كيف الصحه", "شو الوضع", "كيفك اليوم",
        "kifak", "kifik", "kifkon", "kif7alak", "kif halak", "kif 7alak", "kif el sa7a", "shu akhbarak", "shu el wade3", "kifak el yom",
        "ca va", "ça va", "comment ca va", "comment ça va", "comment allez vous", "comment vas tu", "cv", "tu vas bien",
        "vous allez bien",
    ],
    "thanks": [
        "thanks", "thank you", "thx", "ty", "thanks a lot", "thank you so much", "appreciate it", "great thanks", "ok thanks", "perfect thanks",
        "شكرا", "شكراً", "شكرا كتير", "يسلمو", "تسلم", "تسلمي", "ممنون", "ممنونك", "مشكور", "الله يعطيك العافية", "يعطيك العافية",
        "merci", "shukran", "shokran", "yislamo", "teslam", "mamnoun", "merci ktir", "yaatik el 3afye", "ya3tik el 3afye",
        "merci beaucoup", "je vous remercie", "super merci", "parfait merci", "mrc",
    ],
    "goodbye": [
        "bye", "goodbye", "bye bye", "see you", "see you later", "that's all", "thats all", "have a nice day", "good night",
        "باي", "مع السلامة", "بشوفك", "هيدا كل شي", "تصبح على خير", "نهارك سعيد", "يلا باي",
        "ma3 el salame", "ma3 salame", "bshoufak", "yalla bye", "hayda kel shi", "tesba7 3a kheir",
        "au revoir", "a bientot", "à bientôt", "bonne journee", "bonne journée", "bonne soiree", "bonne soirée", "a plus", "à plus", "c'est tout",
    ],
    "acknowledge": [
        "ok", "okay", "oki", "okey", "k", "alright", "all right", "cool", "great", "nice", "good", "fine", "got it", "i see",
        "understood", "sure", "perfect", "noted", "طيب", "تمام", "ماشي", "اوكي", "منيح", "فهمت", "tayeb", "tamam", "mashi",
        "okay ya", "fhemt", "mni7", "d accord", "dac", "parfait", "compris", "très bien", "tres bien", "entendu", "super",
    ],
}
_NORMALIZED = {intent: {preprocess(p) for p in phrases} for intent, phrases in SMALLTALK.items()}
_FILLERS = {"ya", "assistant", "claude", "bot", "please", "plz", "yalla", "habibi", "chabeb", "chabab", "akhi", "sir", "madame"}

# words people add after a greeting: "hello my friend", "good morning everyone", "salut les amis"
ADDRESS_WORDS = {"my", "friend", "friends", "dear", "everyone", "everybody", "all", "guys", "team", "there", "sir", "madam",
                 "folks", "buddy", "mate", "habibi", "7abibi", "sadi2i", "ya", "chabeb", "jama3a", "kel", "el", "mon", "ami", "amis",
                 "les", "tout", "le", "monde", "à", "a", "tous", "حبيبي", "صديقي", "يا", "جماعة", "الكل", "شباب"}

# Questions about the assistant itself (who / what are you). Matched anywhere in a short message.
IDENTITY_RE = re.compile("|".join([
    r"\bwhat s your name\b", r"\bwhats your name\b", r"\bwhat is your name\b", r"\byour name\b", r"\bwho are you\b",
    r"\bwho r u\b", r"\bare you (a |an )?(robot|bot|human|real|ai|person|machine|chatbot)\b", r"\bwho (made|created|built|programmed) you\b",
    r"\bwhat are you\b", r"\bdo you have a name\b",
    # personal questions to the assistant get the same "I am the municipality's assistant" answer
    r"\bhow old are you\b", r"\bwhere are you from\b", r"\bwhere do you live\b", r"\bdo you have (feelings|a family|friends)\b",
    r"\bare you (a )?(boy|girl|man|woman|male|female|alive|smart|intelligent|married)\b",
    r"قديش عمرك", r"من وين انت", r"وين ساكن", r"انت شب ولا بنت",
    r"\b(2adesh|adesh|ade) (3omrak|omrak|3omrik)\b", r"\b(men|min) wen (enta|ente|inta)\b", r"\b(enta|ente) shab walla bent\b",
    r"\b(quel age as tu|tu as quel age|quel âge as tu|tu as quel âge)\b", r"\bd ou viens tu\b", r"\bd où viens tu\b",
    r"شو اسمك", r"ما اسمك", r"شو اسمكن", r"مين انت", r"مين انتي", r"انت روبوت", r"انتي روبوت", r"مين عملك", r"مين صنعك", r"انت انسان",
    r"\b(shu|chou|shou|shoo|sho) (esmak|esmik|ismak|ismik|esmek|esmo|esmik)\b", r"\b(min|meen) (enta|ente|inta|inte|ent)\b",
    r"\b(enta|ente|inta|inte) (robot|bot|ensen|insan)\b", r"\bmin (3emlak|amalak|sana3ak)\b",
    r"\bcomment (tu t appelles|vous vous appelez|t appelles tu)\b", r"\b(quel est )?(ton|votre) nom\b", r"\bqui (es tu|êtes vous|etes vous)\b",
    r"\bt es qui\b", r"\b(tu es|es tu|vous êtes|vous etes) (un )?(robot|humain|bot|une ia)\b", r"\bqui t a (créé|cree|fait)\b",
]))


def _rule_for(norm: str):
    """Small-talk intent for an already-preprocessed message, or None."""
    if not norm:
        return None
    words = [w for w in norm.split() if w not in _FILLERS]
    if not words:
        return "acknowledge"
    core = " ".join(words)
    if len(words) <= 9 and IDENTITY_RE.search(core):
        return "bot_identity"
    if len(words) > 6:
        return None
    for intent, phrases in _NORMALIZED.items():
        if core in phrases:
            return intent
    # "thanks bye", "merci au revoir", "ok merci": every word belongs to closing phrases
    if len(words) <= 5:
        if all(w in _VOCAB["goodbye"] | _VOCAB["thanks"] | _VOCAB["acknowledge"] for w in words):
            only_bye = _VOCAB["goodbye"] - _VOCAB["thanks"] - _VOCAB["acknowledge"]
            return "goodbye" if any(w in only_bye for w in words) else "thanks" \
                if any(w in _VOCAB["thanks"] - _VOCAB["acknowledge"] for w in words) else "acknowledge"
        if all(w in _VOCAB["greeting"] for w in words):          # "hello hello", "hi there"
            return "greeting"
    return None


_VOCAB = {intent: {w for p in phrases for w in p.split()} for intent, phrases in _NORMALIZED.items()}
_PREFIXES = sorted(((p, i) for i in ("greeting", "how_are_you", "acknowledge") for p in _NORMALIZED[i]),
                   key=lambda x: len(x[0]), reverse=True)


def strip_greeting(norm: str):
    """'hello, i have a big pothole' -> ('i have a big pothole', {'greeting'}).
    Removes leading greetings, "how are you", "ok" and fillers, repeatedly; returns what was removed."""
    found = set()
    changed = True
    while changed and norm:
        changed = False
        for p, intent in _PREFIXES:
            if norm == p or norm.startswith(p + " "):
                norm = norm[len(p):].strip()
                found.add(intent)
                changed = True
                break
        words = norm.split()
        while words and words[0] in _FILLERS:
            words.pop(0)
            changed = True
        norm = " ".join(words)
    return norm, found


def match_smalltalk(text: str):
    """Rule intent for the whole message, or for what remains after a leading greeting.
    Returns (intent or None, rest, greeted) where rest is the message without the leading greeting and
    greeted is the greeting that was removed (used when the rest turns out to mean nothing:
    "how are you today" -> rest "today" -> answer "how are you")."""
    norm = preprocess(text)
    rule = _rule_for(norm)
    if rule:
        return rule, "", None
    rest, found = strip_greeting(norm)
    if rest == norm:
        return None, norm, None
    greeted = next((i for i in ("how_are_you", "greeting", "acknowledge") if i in found), None)
    if not rest:     # only greetings / "how are you" / "ok": answer the most informative one
        return greeted, "", None
    if greeted and all(w in ADDRESS_WORDS for w in rest.split()):
        return greeted, "", None
    return _rule_for(rest), rest, greeted


ID_RE = re.compile(r"(?:#|n°|no\.?\s|num(?:ber|éro|ero)?\.?\s*|رقم\s*|ra2m\s*)(\d{1,7})", re.I)
BARE_NUM_RE = re.compile(r"(?<![\w\d])(\d{1,7})(?![\w\d])")
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def extract_entities(text: str) -> dict:
    t = text.translate(ARABIC_DIGITS)
    m = ID_RE.search(t)
    if m:
        return {"id": int(m.group(1))}
    nums = BARE_NUM_RE.findall(t)
    return {"id": int(nums[0])} if len(nums) == 1 else {}
