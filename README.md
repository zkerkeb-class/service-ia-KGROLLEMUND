# Service IA - Générateur de Devis

Ce microservice est responsable de la génération de devis pour les projets de développement logiciel en utilisant l'intelligence artificielle. Il permet également d'analyser des documents (cahiers des charges, spécifications) pour en extraire automatiquement les fonctionnalités à développer.

## Fonctionnalités

- Génération de devis précis basés sur les informations du développeur et les fonctionnalités demandées
- Analyse de documents (PDF, Word, texte) pour extraire les spécifications
- Système d'agents IA personnalisables qui peuvent être entraînés pour s'adapter aux besoins spécifiques
- Notifications par email des devis générés

## Architecture

Le service est construit avec Node.js et Express, et utilise l'API OpenAI pour la génération de contenu intelligent. Voici la structure du projet :

```
service-ia-KGROLLEMUND/
├── src/
│   ├── controllers/       # Contrôleurs pour chaque type de route
│   ├── routes/            # Définition des points d'entrée API
│   ├── services/          # Logique métier et intégration avec OpenAI
│   └── index.js           # Point d'entrée de l'application
├── uploads/               # Stockage temporaire des fichiers uploadés
├── logs/                  # Journaux d'activité
├── data/                  # Données persistantes (agents, etc.)
├── .env                   # Variables d'environnement (non versionné)
├── .env.example           # Exemple de configuration
└── package.json           # Dépendances et scripts
```

## Installation

### Prérequis

- Node.js 16+ et npm
- Clé API OpenAI

### Étapes d'installation

1. Cloner le dépôt
   ```bash
   git clone <repository-url>
   cd service-ia-KGROLLEMUND
   ```

2. Installer les dépendances
   ```bash
   npm install
   ```

3. Configurer les variables d'environnement
   ```bash
   cp .env.example .env
   # Modifier le fichier .env avec votre clé API OpenAI
   ```

4. Lancer le service
   ```bash
   npm run dev
   ```

Le service sera disponible à l'adresse http://localhost:3005.

## Configuration

Créez un fichier `.env` à la racine du projet avec les variables suivantes :

```
# Configuration du serveur
PORT=3005

# Configuration OpenAI
OPENAI_API_KEY=votre_clé_api_openai

# Limites de l'API (optionnel)
MAX_RETRIES=3
RETRY_DELAY_MS=1000

# URLs des services
BDD_SERVICE_URL=http://localhost:3001
PAYMENT_SERVICE_URL=http://localhost:3002
NOTIFICATION_SERVICE_URL=http://localhost:3003
AUTH_SERVICE_URL=http://localhost:3004
```

## Démarrage

```bash
# Mode développement
npm run dev

# Mode production
npm start
```

## Utilisation de l'API

### Génération d'un devis

```http
POST /api/quote
Content-Type: application/json

{
  "quoteRequest": {
    "title": "Application e-commerce",
    "description": "Application de vente en ligne",
    "developer": {
      "experience": 5,
      "specialty": "fullstack",
      "skills": ["React", "Node.js", "Express"],
      "hourlyRate": 50
    },
    "features": [
      {
        "name": "Authentification",
        "description": "Système d'authentification avec OAuth",
        "complexity": "medium",
        "technologies": ["JWT", "OAuth2"]
      },
      ...
    ]
  },
  "email": "client@example.com"
}
```

### Analyse d'un document

```http
POST /api/analyze-document
Content-Type: multipart/form-data

file: [Document PDF/Word à analyser]
developerSpecialty: "fullstack"
developerExperience: 5
```

### Création d'un agent

```http
POST /api/agent/create
Content-Type: application/json

{
  "userId": "user123",
  "agentName": "Agent Développement Web",
  "agentDescription": "Agent spécialisé dans l'estimation de projets web",
  "specialties": ["web", "frontend", "backend"]
}
```

## Intégration avec les autres services

Le service IA s'intègre avec :

- **Service d'authentification** : Pour vérifier l'identité des utilisateurs
- **Service de base de données** : Pour stocker les devis générés
- **Service de notification** : Pour envoyer des emails aux clients

## Contribution

Pour contribuer au projet :

1. Créer une branche pour votre fonctionnalité
2. Implémenter et tester vos changements
3. Soumettre une Pull Request

## Licence

Projet développé par KGROLLEMUND - Tous droits réservés

## Gestion des quotas OpenAI

Le service utilise l'API OpenAI qui est soumise à des limites de quota. Deux types de limites peuvent affecter le service :

1. **Limites de requêtes par minute (RPM)** - Nombre maximum de requêtes que vous pouvez envoyer à l'API en une minute
2. **Limites de tokens par minute (TPM)** - Volume total de texte que vous pouvez traiter en une minute

Si vous rencontrez des erreurs de quota (code 429), voici les solutions possibles :

- **Augmenter votre niveau d'utilisation** : Visitez votre [tableau de bord OpenAI](https://platform.openai.com/account/limits) pour voir vos limites actuelles et les augmenter si nécessaire
- **Optimiser l'utilisation** : Le service implémente un mécanisme de retry avec backoff exponentiel pour gérer les dépassements temporaires de quota
- **Réduire la taille des documents** : Les documents très volumineux consomment plus de tokens

## Structure du projet

- `src/controllers/` - Contrôleurs pour gérer les requêtes HTTP
- `src/routes/` - Définition des routes de l'API
- `src/services/` - Services métier et intégrations externes
- `uploads/` - Stockage temporaire des fichiers uploadés
- `logs/` - Fichiers de logs et textes extraits des documents

## API Endpoints

- `GET /api/quote` - Liste des devis générés
- `POST /api/analyze-document` - Analyser un document (cahier des charges)
- `POST /api/quote` - Générer un devis basé sur une analyse
- `GET /api/quote/:id/pdf` - Obtenir un devis au format PDF 