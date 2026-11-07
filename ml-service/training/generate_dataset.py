"""
Generates the AISMP complaint dataset (English, French, Arabic - Lebanese dialect, Arabizi).

Why synthetic: Lebanese municipalities do not publish complaint records. This generator
creates realistic, labelled complaints from hand-written templates so the models can be
trained and evaluated now. Real complaints collected through the platform (including staff
corrections stored with source='manual') can be appended later via `--extra real.csv`.

Two parts:
 A) hand-written situation templates (~95 situations in 11 categories x 4 languages, plus
    Arabizi-only phrasings with French/English words mixed in)
 B) compositional complaints: category vocabulary (objects + problems) inserted into
    generic sentence frames, so domain words recur across many phrasings like in real life.

Each row:  text, category, priority, language, similar_recent_count, has_evidence, template_id
   - template_id (situation or frame id) lets us split train/test BY TEMPLATE, so the test set only contains sentence
   patterns the model never saw (prevents inflated scores from near-duplicate sentences).
 - priority = template severity, raised by safety-risk phrases and recurring issues in the
   same area, plus a little label noise to mimic disagreement between human labellers.

Usage:  python -m training.generate_dataset --n 25 --out data/complaints.csv
"""
import argparse
import csv
import random
import re
import unicodedata
from pathlib import Path

PRIORITIES = ["low", "medium", "high", "critical"]

# ---------------------------------------------------------------- slot fillers
SLOTS = {
    "en": {
        "place": ["near the school", "in front of my building", "on the main road", "next to the pharmacy",
                  "near the church", "by the mosque", "at the corner of our street", "near the bakery",
                  "in the neighborhood", "next to the public garden", "near the roundabout", "outside the supermarket"],
        "dur": ["for 3 days", "since last week", "for two weeks", "since yesterday", "for a month", "for 5 days", "since Monday"],
        "risk": ["Kids play here every day.", "Someone almost got hurt.", "It is really dangerous.",
                 "An old man fell yesterday.", "Cars almost crashed.", "This is an emergency, please hurry."],
        "calm": ["Please check it when you can.", "Thank you.", "Hope it gets fixed soon.", "", ""],
    },
    "ar": {
        "place": ["حد المدرسة", "قدام البناية", "عالطريق العام", "حد الصيدلية", "حد الكنيسة", "حد الجامع",
                  "عأول الشارع", "حد الفرن", "بالحي", "حد الجنينة العامة", "عند المستديرة", "قدام السوبرماركت"],
        "dur": ["من ٣ أيام", "من الجمعة الماضية", "من أسبوعين", "من مبارح", "من شهر", "من ٥ أيام", "من يوم الاثنين"],
        "risk": ["الولاد عم يلعبوا هون كل يوم.", "في حدا كان رح يتأذى.", "الوضع كتير خطر.",
                 "ختيار وقع مبارح.", "كانت رح تصير حادث سير.", "هيدي حالة طارئة، بليز بسرعة."],
        "calm": ["بس تقدروا تشوفوها.", "شكراً.", "نتمنى تنصلح قريباً.", "", ""],
    },
    "arabizi": {
        "place": ["7ad el madrase", "2eddem el binaye", "3al tari2 el 3am", "7ad el saydaliye", "7ad el kniseh",
                  "7ad el jeme3", "3a awal el shere3", "7ad el forn", "bel 7ay", "7ad el jnayne", "3and el mestdira",
                  "2eddem el supermarket"],
        "dur": ["men 3 iyem", "men el jem3a el madye", "men jem3tein", "men mbere7", "men shahr", "men 5 iyem", "men nhar el tanen"],
        "risk": ["el wled 3am yel3abo hon kel yom.", "fi 7ada ken rah yet2azza.", "el wade3 ktir 5atar.",
                 "5etyar we2e3 mbere7.", "kenet rah tsir 7adse.", "hayde 7ale tare2a, please bsor3a."],
        "calm": ["lamma t2edro tshoufoha.", "merci.", "nchalla btenzabat 2arib.", "", ""],
    },
}

# ---------------------------------------------------------------- templates
# (template, base severity 0=low .. 3=critical)
T = {
    "road_damage": {
        "en": [
            ("There is a huge pothole {place} {dur}.", 1),
            ("The asphalt is completely broken {place}, cars keep hitting the holes.", 1),
            ("A big crack opened in the road {place}.", 1),
            ("The sidewalk tiles are broken {place} and people trip.", 1),
            ("The road {place} collapsed after the rain, part of it is gone.", 3),
            ("Speed bump is damaged {place} {dur}.", 0),
            ("Manhole cover is missing {place}, it's an open hole in the street.", 3),
            ("The traffic light {place} is not working {dur}.", 2),
            ("Road paint and signs are faded {place}.", 0),
            ("The retaining wall next to the road {place} is cracking and might fall.", 2),
        ],
        "ar": [
            ("في جورة كبيرة بالطريق {place} {dur}.", 1),
            ("الزفت مكسّر كله {place} والسيارات عم تفوت بالجور.", 1),
            ("في شق كبير بالطريق {place}.", 1),
            ("بلاط الرصيف مكسّر {place} والناس عم تتعتر.", 1),
            ("الطريق {place} انهار بعد الشتي وراح قسم منه.", 3),
            ("المطب مخرّب {place} {dur}.", 0),
            ("غطا الريغار مش موجود {place} والجورة مفتوحة بنص الطريق.", 3),
            ("إشارة السير {place} مش عم تشتغل {dur}.", 2),
            ("خطوط الطريق والإشارات ممحية {place}.", 0),
            ("الحيط حد الطريق {place} عم يتشقق وممكن يوقع.", 2),
        ],
        "arabizi": [
            ("fi jora kbire bel tari2 {place} {dur}.", 1),
            ("el zeft mkasar kello {place} w el sayarat 3am tfout bel jowar.", 1),
            ("fi sha2 kbir bel tari2 {place}.", 1),
            ("blat el rasif mkasar {place} w el nes 3am tet3atar.", 1),
            ("el tari2 {place} nhar ba3d el shete w ra7 2esm menno.", 3),
            ("el matab m5arab {place} {dur}.", 0),
            ("ghata el regar msh mawjoud {place} w el jora maftou7a bi nos el tari2.", 3),
            ("isharet el seir {place} msh 3am teshtegel {dur}.", 2),
            ("5tout el tari2 w el isharat mam7iye {place}.", 0),
            ("el 7eit 7ad el tari2 {place} 3am yetsha22a2 w momken yo2a3.", 2),
        ],
    },
    "electricity": {
        "en": [
            ("A power cable fell on the ground {place} and it is sparking.", 3),
            ("No electricity in our area {dur}.", 2),
            ("The electricity pole {place} is leaning and about to fall.", 3),
            ("The transformer {place} is making loud noises and smoke came out.", 3),
            ("Exposed wires hanging from the pole {place}.", 2),
            ("Power keeps cutting every hour in the neighborhood {dur}.", 1),
            ("Illegal wires from the generator are tangled on the pole {place}.", 1),
            ("The voltage keeps jumping {dur} and burned appliances in the building.", 1),
            ("The neighbourhood generator {place} cuts off for hours every day {dur}.", 1),
        ],
        "ar": [
            ("في شريط كهربا وقع عالأرض {place} وعم يعمل شرار.", 3),
            ("ما في كهربا بالمنطقة {dur}.", 2),
            ("عمود الكهربا {place} مايل ورح يوقع.", 3),
            ("المحوّل {place} عم يطلع صوت قوي وطلع منه دخان.", 3),
            ("في شريطة مكشوفة معلقة بالعمود {place}.", 2),
            ("الكهربا عم تنقطع كل ساعة بالحي {dur}.", 1),
            ("شرطان الموتور مخربطة عالعمود {place}.", 1),
            ("الكهربا عم تعلى وتوطى {dur} وحرقت أدوات بالبناية.", 1),
            ("موتور الحي {place} عم يقطع ساعات كل يوم {dur}.", 1),
        ],
        "arabizi": [
            ("fi shrit kahraba we2e3 3al ard {place} w 3am ya3mol sharar.", 3),
            ("ma fi kahraba bel mante2a {dur}.", 2),
            ("3amoud el kahraba {place} mayel w ra7 yo2a3.", 3),
            ("el mo7awel {place} 3am ytalle3 sot 2awe w tele3 menno d5an.", 3),
            ("fi shrita makshoufe m3alla2a bel 3amoud {place}.", 2),
            ("el kahraba 3am tenta2e3 kel se3a bel 7ay {dur}.", 1),
            ("shertan el motor m5arbata 3al 3amoud {place}.", 1),
            ("el kahraba 3am to3la w twata {dur} w 7ara2et adawet bel binaye.", 1),
            ("motor el 7ay {place} 3am y2ate3 se3at kel yom {dur}.", 1),
        ],
    },
    "water": {
        "en": [
            ("A water pipe burst {place} and water is flooding the street.", 2),
            ("No water reaching our building {dur}.", 2),
            ("The sewage is overflowing {place}, terrible smell.", 2),
            ("There is a small leak from the main pipe {place}.", 1),
            ("The storm drain {place} is blocked and the road floods when it rains.", 1),
            ("Tap water is coming out brown and dirty {dur}.", 2),
            ("Water pressure is very weak in the neighborhood {dur}.", 0),
            ("The street is flooded {place}, water entered the houses.", 3),
            ("Water meter {place} is leaking.", 0),
            ("Sewage water is mixing with drinking water {place}, people got sick.", 3),
        ],
        "ar": [
            ("انفجر قسطل مي {place} والمي عم تطوف عالطريق.", 2),
            ("ما عم توصل مي عالبناية {dur}.", 2),
            ("المجارير طايفة {place} والريحة بشعة.", 2),
            ("في تسريب صغير من القسطل الرئيسي {place}.", 1),
            ("ريغار الشتي {place} مسكّر والطريق بيطوف وقت الشتي.", 1),
            ("مي الحنفية طالعة بنية ووسخة {dur}.", 2),
            ("ضغط المي كتير ضعيف بالحي {dur}.", 0),
            ("الطريق طايف {place} والمي فاتت عالبيوت.", 3),
            ("عداد المي {place} عم ينقط.", 0),
            ("مي المجارير عم تختلط بمي الشرب {place} وفي ناس مرضت.", 3),
        ],
        "arabizi": [
            ("enfajar 2astal may {place} w el may 3am ttouf 3al tari2.", 2),
            ("ma 3am toussal may 3al binaye {dur}.", 2),
            ("el majarir tayfe {place} w el ri7a bashe3a.", 2),
            ("fi tasrib zghir men el 2astal el ra2ise {place}.", 1),
            ("regar el shete {place} msakkar w el tari2 bitouf wa2t el shete.", 1),
            ("may el 7anafiye tal3a bonniye w wes5a {dur}.", 2),
            ("daghet el may ktir da3if bel 7ay {dur}.", 0),
            ("el tari2 tayef {place} w el may fetet 3al byout.", 3),
            ("3addad el may {place} 3am yna22et.", 0),
            ("may el majarir 3am te5tolet b may el shereb {place} w fi nes mardet.", 3),
        ],
    },
    "waste": {
        "en": [
            ("Garbage has not been collected {place} {dur}.", 1),
            ("The trash bins {place} are overflowing and attracting rats.", 2),
            ("People are dumping construction waste {place}.", 1),
            ("Someone is burning garbage {place}, the smoke is toxic.", 3),
            ("Bad smell from the dumpster {place}.", 1),
            ("There is no garbage bin in our street.", 0),
            ("Medical waste thrown {place}, syringes on the ground.", 3),
            ("Litter everywhere in the public garden after the weekend.", 0),
            ("The garbage truck spills trash every time it passes {place}.", 0),
            ("Dead animal left {place} {dur}.", 2),
        ],
        "ar": [
            ("ما حدا لمّ الزبالة {place} {dur}.", 1),
            ("مستوعبات الزبالة {place} طايفة وعم تجيب جرذان.", 2),
            ("في ناس عم تكب ردميات {place}.", 1),
            ("في حدا عم يحرق زبالة {place} والدخان سام.", 3),
            ("ريحة بشعة من الحاوية {place}.", 1),
            ("ما في ولا مستوعب زبالة بشارعنا.", 0),
            ("في نفايات طبية مكبوبة {place} وإبر عالأرض.", 3),
            ("الزبالة بكل محل بالجنينة العامة بعد الويكند.", 0),
            ("شاحنة الزبالة بتوقّع زبالة كل ما تمرق {place}.", 0),
            ("في حيوان ميت مترك {place} {dur}.", 2),
        ],
        "arabizi": [
            ("ma 7ada lamm el zbele {place} {dur}.", 1),
            ("mestaw3abet el zbele {place} tayfe w 3am tjib jrazen.", 2),
            ("fi nes 3am tkebb radmiyet {place}.", 1),
            ("fi 7ada 3am ye7ra2 zbele {place} w el d5an sem.", 3),
            ("ri7a bashe3a men el 7awiye {place}.", 1),
            ("ma fi wala mestaw3ab zbele b shere3na.", 0),
            ("fi nifayet tebbiye makboube {place} w ibar 3al ard.", 3),
            ("el zbele b kel ma7al bel jnayne ba3d el weekend.", 0),
            ("sha7net el zbele bitwa22e3 zbele kel ma tmor2 {place}.", 0),
            ("fi 7ayawan mayet matrouk {place} {dur}.", 2),
        ],
    },
    # street_lighting, noise, illegal_construction, parking, stray_animals, public_spaces and other:
    # see training/data_more.py (merged below)
}

# ---------------------------------------------------------------- Arabizi spelling variation
# There is no standard Arabizi spelling. Each writer has habits that stay the same within one
# message (writing 3 or a or nothing for ع, ch instead of sh, ...), and common words have many
# spellings (msh / mish / mesh). Simulate both, so the model learns meaning, not one spelling.
ARABIZI_SWAPS = [  # (from, to): each is a writer habit, applied to the whole message
    ("7", "h"), ("3", "a"), ("3", ""), ("2", ""), ("2", "a"), ("5", "kh"), ("8", "gh"), ("9", "2"),
    ("sh", "ch"), ("ou", "u"), ("ou", "o"), ("ee", "i"), ("kk", "k"), ("ss", "s"), ("ll", "l"), ("rr", "r"),
    ("yy", "y"), ("aa", "a"),
]
ARABIZI_WORD_VARIANTS = {
    "msh": ["mish", "mesh", "mch", "mush", "mich"], "ktir": ["kteer", "ktiir", "kter", "ktirr", "ikteer"],
    "3am": ["am", "3m", "aam", "3a"], "el": ["l", "il", "al", "e"], "w": ["wa", "o", "u", "we"], "fi": ["fe", "fii", "fy"],
    "ma": ["maa", "mah"], "shi": ["chi", "she", "shee"], "kel": ["kil", "kell", "kol", "kul"],
    "badde": ["baddi", "bade", "bdi", "baddeh"], "please": ["plz", "pls", "plis", "plsss"], "men": ["min", "mn", "mel"],
    "3al": ["3a", "al", "aal", "3ala"], "bel": ["bil", "bl", "b"], "hon": ["hown", "houn"], "fina": ["fiina", "fyna"],
    "ra7": ["rah", "ri7", "rayi7"], "kamen": ["kaman", "kmn"], "enno": ["inno", "anno", "eno"], "ba3d": ["baad", "ba3ed"],
    "shere3": ["share3", "sheri3", "chere3", "shere2"], "tari2": ["tarik", "tari", "tarii2", "taree2"],
    "binaye": ["binayeh", "binayi", "bineye", "binaya"], "kahraba": ["kahrba", "kahroba", "ke7raba", "kahrabaa"],
    "zbele": ["zbeleh", "zbeli", "zbale", "zbele"], "may": ["mayy", "mai", "maye", "mayye"], "nes": ["ness", "nas"],
    "sayarat": ["sayyarat", "siyarat", "cars"], "wled": ["wlad", "ewled", "lwled"], "leil": ["layl", "lel", "lail"],
    "jiran": ["jeeran", "jirane", "jiren"], "merci": ["mercii", "mrc", "merciii"],
}
ARABIZI_ARTICLE_RE = re.compile(r"\bel (\w)")


def vary_arabizi(text, rng):
    for a, b in ARABIZI_SWAPS:                      # writer habits (whole message)
        if a in text and rng.random() < 0.2:
            text = text.replace(a, b)
    if rng.random() < 0.2:                          # article glued to the noun: "el zbele" -> "lzbele"
        text = ARABIZI_ARTICLE_RE.sub(lambda m: "l" + m.group(1), text)
    words = []
    for w in text.split(" "):                       # word-level spelling variants
        core = w.rstrip(".,!?").lower()
        tail = w[len(core):]
        if core in ARABIZI_WORD_VARIANTS and rng.random() < 0.3:
            w = rng.choice(ARABIZI_WORD_VARIANTS[core]) + tail
        elif len(core) > 4 and core.endswith("e") and rng.random() < 0.1:   # final -e written -i / -a / -eh
            w = core[:-1] + rng.choice(["i", "a", "eh"]) + tail
        elif len(core) > 2 and rng.random() < 0.02:                       # elongation: "ktiiir", "pleaaase"
            k = rng.randrange(1, len(core))
            w = core[:k] + core[k - 1] * 2 + core[k:] + tail
        words.append(w)
    return " ".join(words)


def strip_accents(text):
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def typo(text, rng):
    """Drop or duplicate one character in a random word (real users make typos)."""
    words = text.split()
    i = rng.randrange(len(words))
    w = words[i]
    if len(w) > 3:
        j = rng.randrange(1, len(w) - 1)
        words[i] = w[:j] + w[j + 1:] if rng.random() < 0.5 else w[:j] + w[j] + w[j:]
    return " ".join(words)


def make_row(category, lang, tid, template, severity, rng):
    s = SLOTS[lang]
    text = template.format(place=rng.choice(s["place"]), dur=rng.choice(s["dur"]))
    sev = severity
    if rng.random() < 0.2:
        text += " " + rng.choice(s["risk"])
        sev += 1
    else:
        extra = rng.choice(s["calm"])
        if extra:
            text += " " + extra

    similar = int(rng.choice([0, 0, 0, 1, 1, 2, 3, 4, 6, 9]))
    if similar >= 4 and rng.random() < 0.4:
        sev += 1                                   # recurring issue in the area -> escalate
    has_evidence = rng.random() < 0.4

    if rng.random() < 0.08:                        # labeller disagreement
        sev += rng.choice([-1, 1])
    sev = max(0, min(3, sev))

    if lang == "arabizi":
        text = vary_arabizi(text, rng)
    if lang == "fr" and rng.random() < 0.3:           # many people type French without accents
        text = strip_accents(text)
    if lang != "ar" and rng.random() < 0.3:
        text = text.lower()
    if rng.random() < 0.15:
        text = typo(text, rng)
    if rng.random() < 0.2:
        text = re.sub(r"[.,!،]", "", text)

    return {
        "text": text.strip(),
        "category": category,
        "priority": PRIORITIES[sev],
        "language": lang,
        "similar_recent_count": similar,
        "has_evidence": int(has_evidence),
        "template_id": tid,
    }


# ---------------------------------------------------------------- compositional part
# Category vocabulary (objects + problems with severity) combined with GENERIC sentence frames.
# Mirrors real complaints: phrasing changes person to person, domain words repeat.
LEX = {
    "road_damage": {
        "en": (["the road", "the street", "the asphalt", "the sidewalk", "the pavement", "the bridge", "the stairs"],
               [("has potholes everywhere", 1), ("is cracked", 1), ("is badly damaged", 1), ("collapsed", 3),
                ("has a deep hole in the middle", 2), ("is uneven and bumpy", 0), ("is sinking", 2)]),
        "ar": (["الطريق", "الشارع", "الزفت", "الرصيف", "الجسر", "الدرج"],
               [("مليان جور", 1), ("مشقّق", 1), ("مخرّب كتير", 1), ("انهار", 3), ("فيه جورة عميقة بالنص", 2),
                ("مش مستوي", 0), ("عم يهبط", 2)]),
        "arabizi": (["el tari2", "el shere3", "el zeft", "el rasif", "el jeser", "el daraj", "el trottoir", "el route",
                     "el autostrade"],
                    [("malyen jowar", 1), ("msha22a2", 1), ("m5arab ktir", 1), ("nhar", 3),
                     ("fi jora 3ami2a bel nos", 2), ("msh mestwe", 0), ("3am yehbot", 2)]),
    },
    "electricity": {
        "en": (["the electricity", "the power", "the generator", "the power line", "the electric pole",
                "the transformer", "the cables"],
               [("is cut", 2), ("keeps going off", 1), ("is sparking", 3), ("is not working", 1),
                ("fell down", 3), ("is flickering", 0), ("is damaged and exposed", 2)]),
        "ar": (["الكهربا", "التيار", "الموتور", "خط الكهربا", "عمود الكهربا", "المحوّل", "الشرطان"],
               [("مقطوعة", 2), ("عم تروح وتجي", 1), ("عم يعمل شرار", 3), ("مش عم يشتغل", 1), ("وقع", 3),
                ("عم يضوي ويطفي", 0), ("مخرّب ومكشوف", 2)]),
        "arabizi": (["el kahraba", "el tayyar", "el motor", "5att el kahraba", "3amoud el kahraba",
                     "el mo7awel", "el shertan", "el poteau", "kahraba el dawle"],
                    [("ma2tou3a", 2), ("3am trou7 w tije", 1), ("3am ya3mol sharar", 3), ("msh 3am yeshtegel", 1),
                     ("we2e3", 3), ("3am ydawe w ytafe", 0), ("m5arab w makshouf", 2)]),
    },
    "water": {
        "en": (["the water", "the water pipe", "the sewage", "the drain", "the water supply", "the tap water",
                "the main pipe"],
               [("is leaking", 1), ("burst", 2), ("is cut", 2), ("is overflowing", 2), ("is dirty", 2),
                ("is blocked", 1), ("is flooding the houses", 3)]),
        "ar": (["المي", "قسطل المي", "المجارير", "الريغار", "خط المي", "مي الحنفية", "القسطل الرئيسي"],
               [("عم ينقّط", 1), ("انفجر", 2), ("مقطوعة", 2), ("طايفة", 2), ("وسخة", 2), ("مسكّر", 1),
                ("عم تطوف عالبيوت", 3)]),
        "arabizi": (["el may", "2astal el may", "el majarir", "el regar", "5att el may", "may el 7anafiye",
                     "el 2astal el ra2ise", "el khazzen", "el tuyau", "may el dawle"],
                    [("3am yna22et", 1), ("enfajar", 2), ("ma2tou3a", 2), ("tayfe", 2), ("wes5a", 2),
                     ("msakkar", 1), ("3am ttouf 3al byout", 3)]),
    },
    "waste": {
        "en": (["the garbage", "the trash", "the waste", "the dumpster", "the garbage bins", "the rubbish"],
               [("was not collected", 1), ("is piling up", 1), ("is overflowing", 2), ("is being burned", 3),
                ("smells terrible", 1), ("is everywhere", 0), ("is full of rats", 2)]),
        "ar": (["الزبالة", "النفايات", "الحاوية", "مستوعبات الزبالة", "الوساخة"],
               [("ما حدا لمّها", 1), ("عم تتكدّس", 1), ("طايفة", 2), ("عم تنحرق", 3), ("ريحتها بشعة", 1),
                ("بكل محل", 0), ("مليانة جرذان", 2)]),
        "arabizi": (["el zbele", "el nifayet", "el 7awiye", "mestaw3abet el zbele", "el wsa5a", "el poubelle",
                     "el container", "camion el zbele"],
                    [("ma 7ada lammha", 1), ("3am tetkaddas", 1), ("tayfe", 2), ("3am tan7ere2", 3),
                     ("ri7ta bashe3a", 1), ("b kel ma7al", 0), ("malyene jrazen", 2)]),
    },
}

FRAMES = {
    "en": ["{obj} {place} {issue} {dur}.", "Hello, {obj} {place} {issue}.", "Please help, {obj} {issue} {dur}.",
           "I want to report that {obj} {place} {issue}.", "{obj} {issue} again {place}!",
           "Why is nobody fixing this? {obj} {issue} {dur}.", "Complaint: {obj} {issue} {place}.",
           "For your information {obj} {place} {issue} {dur}.", "Dear municipality, {obj} {issue}.",
           "{obj} {place}... {issue}. {dur}", "Our neighbours and I noticed {obj} {issue} {place}.",
           "Urgent: {obj} {issue} {place}."],
    "ar": ["{obj} {place} {issue} {dur}.", "مرحبا، {obj} {place} {issue}.", "بليز ساعدونا، {obj} {issue} {dur}.",
           "بدي بلّغ إنو {obj} {place} {issue}.", "{obj} رجع {issue} {place}!",
           "ليش ما حدا عم يصلّح؟ {obj} {issue} {dur}.", "شكوى: {obj} {issue} {place}.",
           "للعلم {obj} {place} {issue} {dur}.", "حضرة البلدية، {obj} {issue}.",
           "{obj} {place}... {issue}. {dur}", "نحنا والجيران لاحظنا إنو {obj} {issue} {place}.",
           "عاجل: {obj} {issue} {place}."],
    "arabizi": ["{obj} {place} {issue} {dur}.", "marhaba, {obj} {place} {issue}.", "please se3douna, {obj} {issue} {dur}.",
                "badde balle3 enno {obj} {place} {issue}.", "{obj} rje3 {issue} {place}!",
                "lesh ma 7ada 3am ysalle7? {obj} {issue} {dur}.", "shakwa: {obj} {issue} {place}.",
                "lal 3elm {obj} {place} {issue} {dur}.", "7adret el baladiye, {obj} {issue}.",
                "{obj} {place}... {issue}. {dur}", "ne7na w el jiran la7azna enno {obj} {issue} {place}.",
                "3ajel: {obj} {issue} {place}."],
}


# ---------------------------------------------------------------- French (training/data_fr.py)
from .data_fr import FRAMES_FR, LEX_FR, SLOTS_FR, T_FR  # noqa: E402

SLOTS["fr"] = SLOTS_FR
for _cat, _tpls in T_FR.items():
    T[_cat]["fr"] = _tpls
for _cat, _lex in LEX_FR.items():
    LEX[_cat]["fr"] = _lex
FRAMES["fr"] = FRAMES_FR

# ---------------------------------------------------------------- more categories + Arabizi (training/data_more.py)
from .data_more import ARABIZI_SLOTS_EXTRA, LEX_MORE, T_ARABIZI_EXTRA, T_MORE  # noqa: E402

T.update(T_MORE)
LEX.update(LEX_MORE)
for _k, _vals in ARABIZI_SLOTS_EXTRA.items():
    SLOTS["arabizi"][_k] = SLOTS["arabizi"][_k] + _vals
FRAMES["arabizi"] = FRAMES["arabizi"] + [
    "ya3ne {obj} {issue} {dur} w ma 7ada 3am yesta2el", "{obj} {place} {issue} lak", "shu ha2a {obj} {issue} {dur}",
    "{obj} {issue} {place} please ta3o shoufo", "salam, {obj} {issue} {place}", "ya baladiye {obj} {issue} {dur}",
]
CATEGORIES = list(T)


def generate(n_per_template=25, seed=42, n_compositional=8000):
    rng = random.Random(seed)
    rows = []

    # Part A: hand-written situation templates (group = situation, shared across languages)
    for category, langs in T.items():
        for lang, templates in langs.items():
            for k, (tpl, sev) in enumerate(templates):
                tid = f"{category}:{k}"
                for _ in range(n_per_template):
                    rows.append(make_row(category, lang, tid, tpl, sev, rng))

    # Arabizi-only phrasings with French/English words mixed in (own groups)
    for category, templates in T_ARABIZI_EXTRA.items():
        for k, (tpl, sev) in enumerate(templates):
            for _ in range(n_per_template):
                rows.append(make_row(category, "arabizi", f"{category}:az{k}", tpl, sev, rng))

    # Part B: compositional (group = sentence frame, shared across languages and categories)
    langs = list(FRAMES)
    cats = list(LEX)
    for _ in range(n_compositional):
        lang = rng.choice(langs)
        cat = rng.choice(cats)
        objs, issues = LEX[cat][lang]
        f_id = rng.randrange(len(FRAMES[lang]))
        issue, sev = rng.choice(issues)
        # pre-fill obj/issue, then let make_row fill place/dur and apply augmentation
        tpl = FRAMES[lang][f_id].replace("{obj}", rng.choice(objs)).replace("{issue}", issue)
        tpl = tpl[0].upper() + tpl[1:] if lang in ("en", "fr") else tpl
        rows.append(make_row(cat, lang, f"frame:{f_id}", tpl, sev, rng))

    rng.shuffle(rows)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=25, help="variants per template")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="data/complaints.csv")
    args = ap.parse_args()

    rows = generate(args.n, args.seed)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {out}")


if __name__ == "__main__":
    main()
