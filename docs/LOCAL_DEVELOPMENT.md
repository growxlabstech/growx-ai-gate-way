# Local development

Copy `.env.example` to `.env.local`, replace placeholder secrets, run `pnpm install`, then `pnpm dev`. Docker starts PostgreSQL and Redis and Turbo starts applications and workers. Individual projects can be selected with `pnpm --filter <package> dev`.

If ports 3000–3002, 4000, 5432, or 6379 are occupied, stop the conflicting process or override the relevant port. Use `pnpm infra:down` to stop local infrastructure while retaining volumes.
