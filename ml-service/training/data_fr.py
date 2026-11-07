"""French complaint data (same situations, same order and severities as the English templates)."""

SLOTS_FR = {
    "place": ["près de l'école", "devant mon immeuble", "sur la route principale", "à côté de la pharmacie",
              "près de l'église", "près de la mosquée", "au coin de notre rue", "près de la boulangerie",
              "dans le quartier", "à côté du jardin public", "près du rond-point", "devant le supermarché"],
    "dur": ["depuis 3 jours", "depuis la semaine dernière", "depuis deux semaines", "depuis hier",
            "depuis un mois", "depuis 5 jours", "depuis lundi"],
    "risk": ["Les enfants jouent ici tous les jours.", "Quelqu'un a failli se blesser.", "C'est vraiment dangereux.",
             "Un vieil homme est tombé hier.", "Des voitures ont failli avoir un accident.",
             "C'est une urgence, faites vite s'il vous plaît."],
    "calm": ["Merci de vérifier quand vous pouvez.", "Merci.", "J'espère que ce sera réparé bientôt.", "", ""],
}

T_FR = {
    "road_damage": [
        ("Il y a un énorme nid-de-poule {place} {dur}.", 1),
        ("L'asphalte est complètement abîmé {place}, les voitures tombent dans les trous.", 1),
        ("Une grande fissure s'est ouverte dans la route {place}.", 1),
        ("Les dalles du trottoir sont cassées {place} et les gens trébuchent.", 1),
        ("La route {place} s'est effondrée après la pluie, une partie a disparu.", 3),
        ("Le ralentisseur est abîmé {place} {dur}.", 0),
        ("La plaque d'égout a disparu {place}, il y a un trou ouvert dans la rue.", 3),
        ("Le feu de circulation {place} ne fonctionne pas {dur}.", 2),
        ("Le marquage au sol et les panneaux sont effacés {place}.", 0),
        ("Le mur de soutènement au bord de la route {place} se fissure et risque de tomber.", 2),
    ],
    "electricity": [
        ("Un câble électrique est tombé par terre {place} et il fait des étincelles.", 3),
        ("Pas d'électricité dans notre quartier {dur}.", 2),
        ("Le poteau électrique {place} penche et va bientôt tomber.", 3),
        ("Le transformateur {place} fait un bruit fort et de la fumée est sortie.", 3),
        ("Des fils dénudés pendent du poteau {place}.", 2),
        ("Le courant coupe toutes les heures dans le quartier {dur}.", 1),
        ("Les câbles illégaux du générateur sont emmêlés sur le poteau {place}.", 1),
        ("La tension monte et descend {dur} et a grillé des appareils dans l'immeuble.", 1),
        ("Le générateur du quartier {place} coupe pendant des heures chaque jour {dur}.", 1),
    ],
    "water": [
        ("Une conduite d'eau a éclaté {place} et l'eau inonde la rue.", 2),
        ("L'eau n'arrive plus à notre immeuble {dur}.", 2),
        ("Les égouts débordent {place}, l'odeur est horrible.", 2),
        ("Il y a une petite fuite sur la conduite principale {place}.", 1),
        ("La bouche d'évacuation {place} est bouchée et la route est inondée quand il pleut.", 1),
        ("L'eau du robinet sort marron et sale {dur}.", 2),
        ("La pression de l'eau est très faible dans le quartier {dur}.", 0),
        ("La rue est inondée {place}, l'eau est entrée dans les maisons.", 3),
        ("Le compteur d'eau {place} fuit.", 0),
        ("Les eaux usées se mélangent à l'eau potable {place}, des gens sont tombés malades.", 3),
    ],
    "waste": [
        ("Les poubelles n'ont pas été ramassées {place} {dur}.", 1),
        ("Les bennes à ordures {place} débordent et attirent les rats.", 2),
        ("Des gens déversent des gravats de chantier {place}.", 1),
        ("Quelqu'un brûle des ordures {place}, la fumée est toxique.", 3),
        ("Mauvaise odeur qui vient de la benne {place}.", 1),
        ("Il n'y a aucune poubelle dans notre rue.", 0),
        ("Des déchets médicaux ont été jetés {place}, il y a des seringues par terre.", 3),
        ("Des déchets partout dans le jardin public après le week-end.", 0),
        ("Le camion poubelle fait tomber des ordures chaque fois qu'il passe {place}.", 0),
        ("Un animal mort est abandonné {place} {dur}.", 2),
    ],
    # the other categories (street lighting, noise, ...) live in data_more.py
}

LEX_FR = {
    "road_damage": (["la route", "la rue", "l'asphalte", "le trottoir", "la chaussée", "le pont", "les escaliers"],
                    [("est pleine de nids-de-poule", 1), ("est fissurée", 1), ("est très abîmée", 1),
                     ("s'est effondrée", 3), ("a un trou profond au milieu", 2), ("est inégale et bosselée", 0),
                     ("s'affaisse", 2)]),
    "electricity": (["l'électricité", "le courant", "le générateur", "la ligne électrique", "le poteau électrique",
                     "le transformateur", "les câbles"],
                    [("est coupée", 2), ("saute tout le temps", 1), ("fait des étincelles", 3), ("ne marche pas", 1),
                     ("est tombé", 3), ("clignote", 0), ("est abîmé et dénudé", 2)]),
    "water": (["l'eau", "la conduite d'eau", "les égouts", "l'évacuation", "l'alimentation en eau",
               "l'eau du robinet", "la conduite principale"],
              [("fuit", 1), ("a éclaté", 2), ("est coupée", 2), ("déborde", 2), ("est sale", 2), ("est bouchée", 1),
               ("inonde les maisons", 3)]),
    "waste": (["les ordures", "les poubelles", "les déchets", "la benne", "les bennes à ordures"],
              [("n'ont pas été ramassées", 1), ("s'accumulent", 1), ("débordent", 2), ("sont brûlées", 3),
               ("sentent très mauvais", 1), ("sont partout", 0), ("sont pleines de rats", 2)]),
}

FRAMES_FR = [
    "{obj} {place} {issue} {dur}.", "Bonjour, {obj} {place} {issue}.", "Aidez-nous svp, {obj} {issue} {dur}.",
    "Je voudrais signaler que {obj} {place} {issue}.", "Encore une fois {obj} {issue} {place} !",
    "Pourquoi personne ne répare ? {obj} {issue} {dur}.", "Plainte : {obj} {issue} {place}.",
    "Pour information {obj} {place} {issue} {dur}.", "Madame, Monsieur, {obj} {issue}.",
    "{obj} {place}... {issue}. {dur}", "Mes voisins et moi avons remarqué que {obj} {issue} {place}.",
    "Urgent : {obj} {issue} {place}.",
]
