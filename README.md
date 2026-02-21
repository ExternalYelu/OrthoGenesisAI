# OrthoGenesisAI

AI-powered medical imaging platform that reconstructs accurate, 3D-printable anatomical bone models from multiple 2D X-ray images.

## Repo Structure

- `frontend`: Next.js + React + Tailwind + React Three Fiber UI
- `backend`: FastAPI + PyTorch inference pipeline + PostgreSQL
- `infra`: Docker and infrastructure helpers
- `docs`: Architecture and product notes

## Quick Start (Local)

1. Copy env examples

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

2. Dev servers

```bash
# backend
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# frontend
cd frontend
npm install
npm run dev
```

If uploads fail with `Failed to fetch`, ensure the backend is running and the frontend API URL is set to `/api`
(`frontend/.env.local` with `NEXT_PUBLIC_API_URL=/api`), then restart the frontend.

## Notes

- The ML reconstruction engine is stubbed behind a clean interface; swap in a production model by implementing `ReconstructionEngine` in `backend/app/reconstruction/engine.py`.
- Test mode uses local file storage and SQLite for fast setup. For production, swap to Postgres and S3.
- HIPAA and clinical compliance require environment hardening and infrastructure controls beyond code (auditing, encryption, BAAs).
