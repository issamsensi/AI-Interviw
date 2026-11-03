# Frontend — Simulateur d'entretien IA

Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4.
Interface en français. Voir le [README principal](../README.md) pour le
parcours complet, les contrats d'API et les limitations connues.

## Démarrage

```bash
npm install
cp .env.example .env.local   # optionnel
npm run dev                  # http://localhost:3000
```

Le backend doit tourner sur l'URL configurée (`NEXT_PUBLIC_API_BASE_URL`,
`http://localhost:8000` par défaut) :

```bash
cd ../backend && .venv/bin/python -m uvicorn app.main:app --reload
```

## Commandes

| Commande        | Usage                          |
| --------------- | ------------------------------ |
| `npm run dev`   | Serveur de développement       |
| `npm run build` | Build de production (+ lint)   |
| `npm start`     | Sert le build (`node .next/standalone/server.js` en Docker) |
| `npm test`      | Tests vitest (24 tests)        |
| `npm run lint`  | ESLint                         |
| `npm run typecheck` | `tsc --noEmit`             |

## Pages

`/` · `/upload` · `/analyse` · `/configurer` · `/entretien/[id]` · `/rapport/[id]`

Le flux des réponses est 100 % REST : enregistrement `MediaRecorder` →
conversion WAV 16 kHz mono (`lib/audio.ts`) → `POST /api/transcribe` →
`POST /api/submit-answer`. Aucune clé d'API ne transite par ce code.
