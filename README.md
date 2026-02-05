# RunPlanner

Générateur de plan d'entraînement course à pied avec périodisation automatique.

## Features

- 📊 Calcul VDOT et allures d'entraînement personnalisées
- 📅 Génération de cycles d'entraînement avec périodisation (Base → Construction → Spécifique → Affûtage)
- 🏃 Séances détaillées avec échauffement, corps de séance, retour au calme
- 📱 Interface mobile-first
- 📄 Export PDF du plan complet

## Structure du projet

```
runplanner/
├── src/
│   ├── App.jsx              # Composant principal (monolithique)
│   ├── main.jsx             # Point d'entrée
│   ├── components/          # Composants React (à développer)
│   ├── screens/             # Écrans de l'app (à développer)
│   ├── data/
│   │   └── constants.js     # Constantes et configurations
│   ├── utils/
│   │   ├── vdot.js          # Calculs VDOT et allures
│   │   ├── planGenerator.js # Génération de macro-cycles
│   │   ├── sessionBuilder.js # Construction des séances
│   │   └── pdfExport.js     # Export PDF
│   └── styles/
│       ├── global.css       # Styles globaux
│       └── shared.js        # Styles partagés (objets JS)
├── index.html
├── package.json
└── vite.config.js
```

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

## Build pour production

```bash
npm run build
```

Le build sera dans le dossier `dist/`.

## Déploiement Netlify

1. `npm run build`
2. Drag & drop le dossier `dist/` sur [app.netlify.com/drop](https://app.netlify.com/drop)

Ou connecter le repo GitHub à Netlify pour déploiement automatique.

## Architecture

### État de l'application

L'app utilise un état centralisé dans `App.jsx` :

- `profile` : Infos utilisateur (nom, perf de référence, VDOT)
- `objectives` : Liste des objectifs de course
- `availability` : Disponibilités (jours, séances/semaine)
- `paces` : Allures calculées depuis le VDOT
- `plan` : Plan généré (cycles, semaines, séances)

### Flux de données

1. **Profil** → Calcul VDOT → Calcul allures
2. **Objectifs** + **Disponibilités** → Génération plan
3. **Plan** → Affichage semaine par semaine → Export PDF

### Algorithmes clés

- **VDOT** : Formule de Jack Daniels pour estimer VO2max
- **Périodisation** : Base (40%) → Construction (30%) → Spécifique (20%) → Affûtage (10%)
- **Volume** : Progression +3-6km/semaine avec semaines d'assimilation (75%)

## Prochaines étapes

- [ ] Extraire les composants du fichier monolithique
- [ ] Ajouter tests unitaires
- [ ] Intégration calendrier (Google Calendar, iCal)
- [ ] Sync avec apps de tracking (Strava, Garmin)
- [ ] Mode hors-ligne (PWA)
