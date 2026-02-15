# Architecture Overview

## Data Flow

1. Clinician uploads multi-view X-rays.
2. Backend validates, normalizes, and aligns images.
3. Reconstruction engine infers 3D voxel volume.
4. Mesh refinement converts to polygonal surface.
5. Frontend renders a 3D view and enables export.

## Core Services

- API: FastAPI
- Database: PostgreSQL
- Storage: S3 (MinIO locally)
- Inference: PyTorch (CUDA optional)

## Security

- JWT-based auth with roles (doctor/patient/admin)
- Encrypted storage at rest
- Audit logging for access and export

## Scaling

- GPU worker pool for reconstruction
- Async job queue (placeholder hook)
- Versioned reconstructions per case
