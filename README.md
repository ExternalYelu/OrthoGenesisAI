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

2. Start services

```bash
docker compose -f infra/docker-compose.yml up --build
```

3. Dev servers

```bash
# backend
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# frontend
cd frontend
npm install
npm run dev
```

## Notes

- The ML reconstruction engine is stubbed behind a clean interface; swap in a production model by implementing `ReconstructionEngine` in `backend/app/reconstruction/engine.py`.
- S3-compatible storage uses MinIO locally; set real AWS credentials for production.
- HIPAA and clinical compliance require environment hardening and infrastructure controls beyond code (auditing, encryption, BAAs).
