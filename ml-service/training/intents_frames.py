"""
Compositional chatbot phrasings: sentence frames x vocabulary, per intent and language.
Combined with the hand-written examples in intents_data.py. Train/test is split by frame,
so the test set contains sentence structures never seen in training.
"""

N = ["12", "5", "#8", "#23", "3", "41"]

FRAMES = {
    "complaint_status": {
        "en": (["what is the status of my {o}", "any update on my {o}", "where is my {o}", "has my {o} been fixed",
                "is my {o} resolved yet", "what happened to my {o}", "can you check my {o}", "track my {o}",
                "is someone handling my {o}", "I'm still waiting for my {o}", "any news about my {o}", "status {o}"],
               ["complaint", "complaints", "report", "complaint {n}", "complaint number {n}", "complaint about the road",
                "water complaint", "pothole report"]),
        "ar": (["شو صار ب{o}", "وين وصلت {o}", "في شي جديد ب{o}", "انحلت {o}", "شو وضع {o}", "فيك تشوفلي {o}",
                "بدي تابع {o}", "حدا عم يشتغل على {o}", "بعدني ناطر {o}", "في أخبار عن {o}", "حالة {o}", "إيمتى بتنحل {o}"],
               ["شكوتي", "الشكوى", "شكاويي", "الشكوى رقم {n}", "شكوى المي", "شكوتي عن الطريق", "التبليغ تبعي"]),
        "arabizi": (["shu sar bi {o}", "wen weslet {o}", "fi shi jdid bi {o}", "enhallet {o}", "shu wade3 {o}",
                     "fik tshoufle {o}", "badde tebe3 {o}", "7ada 3am yeshtghel 3a {o}", "ba3dne naterr {o}",
                     "fi akhbar 3an {o}", "status {o}", "emta btenhal {o}"],
                    ["shakwete", "el shakwa", "shakawiye", "el shakwa ra2m {n}", "shakwet el may", "shakwete 3an el tari2", "el report taba3e"]),
        "fr": (["quel est le statut de ma {o}", "des nouvelles de ma {o}", "où en est ma {o}", "ma {o} est-elle réglée",
                "ma {o} est résolue ?", "qu'est-il arrivé à ma {o}", "pouvez-vous vérifier ma {o}", "suivre ma {o}",
                "quelqu'un s'occupe de ma {o} ?", "j'attends toujours ma {o}", "statut {o}", "quand ma {o} sera traitée"],
               ["plainte", "réclamation", "plainte n°{n}", "plainte numéro {n}", "plainte sur la route", "plainte pour l'eau", "demande d'intervention"]),
    },
    "request_status": {
        "en": (["is my {o} ready", "status of my {o}", "where is my {o}", "has my {o} been approved", "when can I pick up my {o}",
                "track my {o}", "any update on my {o}", "what happened to my {o}"],
               ["document request", "certificate", "residence certificate", "permit request", "building permit",
                "civil record", "license request", "requests"]),
        "ar": (["جاهزة {o}", "شو صار ب{o}", "وين وصلت {o}", "انقبلت {o}", "إيمتى فيني استلم {o}", "بدي تابع {o}",
                "في شي جديد ب{o}", "شو وضع {o}"],
               ["إفادة السكن", "طلب المستند", "طلب الرخصة", "رخصة البناء", "إخراج القيد", "الورقة يلي طلبتها", "طلباتي"]),
        "arabizi": (["jehze {o}", "shu sar bi {o}", "wen weslet {o}", "en2abalet {o}", "emta fiye estelem {o}",
                     "badde tebe3 {o}", "fi shi jdid bi {o}", "shu wade3 {o}"],
                    ["ifadet el sakan", "talab el wara2a", "talab el rukhsa", "rukhset el bina", "ikhraj el 2aid", "el wara2a li talabta", "talabete"]),
        "fr": (["mon {o} est-il prêt", "statut de mon {o}", "où en est mon {o}", "mon {o} a été approuvé ?",
                "quand puis-je retirer mon {o}", "suivre mon {o}", "des nouvelles de mon {o}", "qu'en est-il de mon {o}"],
               ["certificat de résidence", "permis de bâtir", "extrait d'état civil", "dossier", "document demandé", "permis de construire"]),
    },
    "document_info": {
        "en": (["how do I get a {o}", "I need a {o}", "how to apply for a {o}", "can I request a {o} online",
                "what do I need for a {o}", "where can I ask for a {o}", "I want to request a {o}", "how long does a {o} take"],
               ["residence certificate", "building permit", "business license", "civil record extract", "construction permit",
                "official document", "certificate from the municipality"]),
        "ar": (["كيف بطلّع {o}", "بدي {o}", "كيف بقدّم على {o}", "فيني اطلب {o} اونلاين", "شو بدي لـ{o}",
                "وين بطلب {o}", "بدي اطلب {o}", "قديش بتاخد {o}"],
               ["إفادة سكن", "رخصة بناء", "رخصة تجارية", "إخراج قيد", "رخصة إنشاءات", "مستند رسمي", "ورقة من البلدية"]),
        "arabizi": (["kif betalle3 {o}", "badde {o}", "kif b2adem 3a {o}", "fiye otlob {o} online", "shu badde la {o}",
                     "wen boutlob {o}", "badde otlob {o}", "2adesh btekhod {o}"],
                    ["ifadet sakan", "rukhset bina", "rukhsa tijariye", "ikhraj 2aid", "rukhset insha2at", "wara2a rasmiye", "wara2a men el baladiye"]),
        "fr": (["comment obtenir un {o}", "j'ai besoin d'un {o}", "comment demander un {o}", "puis-je demander un {o} en ligne",
                "que faut-il pour un {o}", "où demander un {o}", "je veux demander un {o}", "combien de temps pour un {o}"],
               ["certificat de résidence", "permis de bâtir", "extrait d'état civil", "permis de construire", "document officiel",
                "certificat de la municipalité"]),
    },
    "how_to_report": {
        "en": (["how do I {o}", "how can I {o}", "where do I {o}", "I want to {o}, how?", "is it possible to {o}",
                "explain how to {o}", "what's the way to {o}", "can I {o} here"],
               ["report a problem", "file a complaint", "submit a complaint", "report a pothole", "send a photo with my complaint",
                "report a broken street light", "make a complaint"]),
        "ar": (["كيف ب{o}", "كيف فيني {o}", "وين ب{o}", "بدي {o} كيف", "في مجال {o}", "اشرحلي كيف {o}", "شو الطريقة لـ{o}", "فيني {o} هون"],
               ["قدّم شكوى", "بلّغ عن مشكلة", "بلّغ عن جورة", "ابعت صورة مع الشكوى", "بلّغ عن ضو مطفي", "اعمل شكوى"]),
        "arabizi": (["kif b{o}", "kif fiye {o}", "wen b{o}", "badde {o} kif", "fi majal {o}", "eshra7le kif {o}", "shu el tari2a la {o}", "fiye {o} hon"],
                    ["2adem shakwa", "balle3 3an moshkle", "balle3 3an jora", "eb3at sura ma3 el shakwa", "balle3 3an daw mtafe", "a3mol shakwa"]),
        "fr": (["comment {o}", "comment puis-je {o}", "où {o}", "je veux {o}, comment ?", "est-il possible de {o}",
                "expliquez-moi comment {o}", "quelle est la façon de {o}", "puis-je {o} ici"],
               ["signaler un problème", "déposer une plainte", "envoyer une plainte", "signaler un nid-de-poule",
                "joindre une photo à ma plainte", "signaler un lampadaire éteint"]),
    },
    "account_help": {
        "en": (["I {o}", "help, I {o}", "what do I do if I {o}", "how do I {o}", "I need to {o}", "can I {o}"],
               ["forgot my password", "can't log in", "change my password", "change the language", "create an account",
                "update my phone number", "change my name", "reset my password", "log in", "sign in", "sign up", "register", "log out"]),
        "ar": (["{o}", "ساعدني {o}", "شو بعمل إذا {o}", "كيف {o}", "لازم {o}", "فيني {o}"],
               ["نسيت كلمة السر", "ما عم فيني فوت عالحساب", "غيّر كلمة المرور", "غيّر اللغة", "اعمل حساب", "غيّر رقم التلفون", "غيّر اسمي", "سجّل دخول", "فوت عالحساب", "اطلع من الحساب"]),
        "arabizi": (["{o}", "se3edne {o}", "shu ba3mol iza {o}", "kif {o}", "lezem {o}", "fiye {o}"],
                    ["nsit el password", "ma 3am fiye fout 3al account", "ghayyer el password", "ghayyer el lougha", "a3mol account",
                     "ghayyer ra2m el telephone", "ghayyer esme", "a3mol login", "fout 3al account", "a3mol sign up", "a3mol logout"]),
        "fr": (["j'{o}", "aidez-moi, j'{o}", "que faire si j'{o}", "comment {o}", "je dois {o}", "puis-je {o}"],
               ["ai oublié mon mot de passe", "arrive pas à me connecter", "changer mon mot de passe", "changer la langue",
                "créer un compte", "modifier mon téléphone", "réinitialiser mon mot de passe", "me connecter", "m'inscrire", "me déconnecter"]),
    },
    "human_contact": {
        "en": (["{o}", "can you tell me {o}", "I need {o}", "please give me {o}", "what is {o}"],
               ["the municipality phone number", "your opening hours", "the address of the municipality", "to talk to a person",
                "to speak to an employee", "a human please", "how to contact the municipality"]),
        "ar": (["{o}", "فيك تقلي {o}", "بدي {o}", "عطيني {o}", "شو {o}"],
               ["رقم البلدية", "دوام البلدية", "عنوان البلدية", "احكي مع شخص", "احكي مع موظف", "كيف بتواصل مع البلدية"]),
        "arabizi": (["{o}", "fik t2elle {o}", "badde {o}", "a3tine {o}", "shu {o}"],
                    ["ra2m el baladiye", "dawam el baladiye", "3enwen el baladiye", "e7ke ma3 7ada", "e7ke ma3 mwazzaf", "kif bet2assal bel baladiye"]),
        "fr": (["{o}", "pouvez-vous me donner {o}", "j'ai besoin {o}", "donnez-moi {o} svp", "quels sont {o}"],
               ["le numéro de la municipalité", "les horaires d'ouverture", "l'adresse de la mairie", "de parler à une personne",
                "de parler à un employé", "le contact de la municipalité"]),
    },
    "points_info": {
        "en": (["{o}", "can you explain {o}", "tell me {o}", "I want to know {o}"],
               ["what points are", "how to earn points", "how many points I have", "what the points are for", "about the rewards"]),
        "ar": (["{o}", "اشرحلي {o}", "قلّي {o}", "بدي اعرف {o}"], ["شو هني النقاط", "كيف بربح نقاط", "قديش عندي نقاط", "لشو النقاط", "عن المكافآت"]),
        "arabizi": (["{o}", "eshra7le {o}", "2elle {o}", "badde e3ref {o}"], ["shu hene el ni2at", "kif berba7 points", "2adesh 3ande points", "la shu el ni2at", "3an el mukafa2at"]),
        "fr": (["{o}", "expliquez-moi {o}", "dites-moi {o}", "je veux savoir {o}"],
               ["ce que sont les points", "comment gagner des points", "combien de points j'ai", "à quoi servent les points", "les récompenses"]),
    },
    "capabilities": {
        "en": (["{o}", "{o}?", "hey {o}"], ["what can you do", "how can you help", "what is this", "what is this site for", "help me", "what services do you offer", "what can I do here"]),
        "ar": (["{o}", "{o}؟", "مرحبا {o}"], ["شو فيك تعمل", "كيف فيك تساعدني", "شو هيدا", "لشو هالموقع", "ساعدني", "شو الخدمات", "شو فيني اعمل هون"]),
        "arabizi": (["{o}", "{o}?", "hi {o}"], ["shu fik ta3mol", "kif fik tse3edne", "shu hayda", "la shu hal site", "se3edne", "shu el khadamat", "shu fiye a3mol hon"]),
        "fr": (["{o}", "{o} ?", "bonjour {o}"], ["que pouvez-vous faire", "comment pouvez-vous aider", "c'est quoi ça", "à quoi sert ce site", "aidez-moi",
                                                  "quels services proposez-vous", "que puis-je faire ici"]),
    },
}


def generate(rng, per_frame=6):
    rows = []
    for intent, langs in FRAMES.items():
        for lang, (frames, objs) in langs.items():
            for k, f in enumerate(frames):
                for _ in range(per_frame):
                    o = rng.choice(objs).replace("{n}", rng.choice(N))
                    rows.append({"text": f.replace("{o}", o), "intent": intent, "language": lang,
                                 "group": f"frame:{intent}:{lang}:{k}"})
    return rows
