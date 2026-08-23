# II. Caractéristiques et compétences

## A. Caractéristiques principales

Le système est basé sur *des jets de caractéristiques* qui permettent à la fois les trames d'action et les trames sociales ou politiques. L'aspect social est piloté par des modules dépendant des chapitres en cours.

*Les caractéristiques sont les suivantes :*

### Force
La **force** détermine la puissance physique d'une créature ; elle sert à représenter la capacité à soulever un poids important, à effectuer un effort intense de durée ou encore la rapidité brute.

### Dextérité
La **dextérité** détermine l'agilité d'une créature. Elle représente particulièrement la finesse des actions, comme le crochetage, l'escalade discrète, ou encore la visée et la proprioception.

### Constitution
La **constitution** détermine la capacité d'une créature à avoir une santé vigoureuse, une endurance importante ou la force vitale effective. Elle permet notamment de représenter la résistance aux [[Blessures]] et aux afflictions physiques.

### Intelligence
L'**intelligence** détermine la capacité d'une créature à posséder l'acuité mentale, ou la capacité à raisonner. Cette caractéristique entre en jeu lors de la résolution de puzzles, d'intrigues ou encore la compilation de connaissances précises sur un sujet.

### Sagesse
La **sagesse** détermine la capacité d'une créature à prendre du recul et la perspicacité sur l'analyse du monde. Elle quantifie l'intelligence active vis-à-vis de l'environnement et la capacité d'empathie effective.

### Sanité
La **sanité** détermine la capacité d'une créature à posséder une constitution mentale face à des événements choquants, déstabilisants, ou encore la résistance aux influences mentales extérieures. Elle représente la volonté d'une individualité face aux influences extérieures.

*RQ :* Pour permettre la personnalisation, ces caractéristiques sont liées à des compétences qui permettent au personnage d'agir plus efficacement sur le Monde extérieur.

## C. Caractéristiques secondaires

### a. Caractéristiques générales

**Vitalité** — profondeur maximale de points de vie d'une créature, réductible par des effets négatifs (fatigue, malédiction, [[Blessures]]).

> VITALITÉ = BASE_PV + INCREMENT_CONSTITUTION + BONUS_EQUIPEMENT

**Énergie** — capacité d'action d'une créature (magique ou physique). Son nom est à la discrétion du joueur : Mana, Foi, Dévotion, Rage…

> ENERGIE = BASE_ENERGIE + INCREMENT_FORCE + INCREMENT_CONSTITUTION + BONUS_EQUIPEMENT

**Seuil critique / d'habileté** — pourcentage de chances d'effectuer une réussite critique (positionné au dé minimum atteignable, `1d100 = 1`).

> SEUIL_CRIT = BASE_CRIT + INCREMENT_DEXTERITE

### b. Caractéristiques de combat

**Précision offensive** — précision effective d'une créature lorsqu'elle vise une autre créature à l'aide d'un objet, arme ou sortilège.

> PRÉCISION = BASE_PRE + INCREMENT_DEXTERITE + BONUS_EQUIPEMENT

**Blocage physique** — capacité à dévier ou réduire les dégâts d'un événement physique.

> BLOCAGE_PHYSIQUE = BASE_BLOC + INCREMENT_CONSTITUTION + INCREMENT_FORCE + INCREMENT_DEXTERITE + BONUS_EQUIPEMENT

**Blocage magique** — capacité à dévier ou réduire les dégâts d'un événement magique.

> BLOCAGE_MAGIQUE = BASE_CASTMAGE + INCREMENT_CONSTITUTION + BONUS_EQUIPEMENT

**Esquive** — capacité à éviter directement le coup infligé.

> ESQUIVE = BASE_ESQUIVE + INCREMENT_DEXTERITE + BONUS_EQUIPEMENT

**Efficacité d'arme** — capacité à frapper plus fortement à l'aide de son arme.

> EFF_ARME = 1 + INCREMENT_FORCE

**Puissance des sorts** — capacité à matérialiser plus fortement la force de sa magie.

> EFF_SORT = BASE_SORT + INCREMENT_CASTMAGE
