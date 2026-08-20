# GrowX AI Gateway

Production-oriented Phase 1 monorepo for the GrowX AI product. It contains three Next.js applications, isolated service and worker boundaries, shared platform packages, local infrastructure, CI/CD, and operational documentation. Business features are intentionally deferred.

## Prerequisites

- Node.js 20.9+
- pnpm 10+
- Docker with Compose

## Start

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Applications run on ports 3000 (console), 3001 (admin), and 3002 (docs). PostgreSQL and Redis run through Docker Compose. To start only the web applications, use `pnpm dev:apps`.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [ROADMAP.md](./ROADMAP.md) for system boundaries and deferred work.
