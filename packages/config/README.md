# @pretoscop/config

Environment, logging and (from M04) the shop registry.

Contract:
- `@pretoscop/config/env`: `getEnv()` returns the zod-validated environment (`Env`); every variable
  is documented in the root `.env.example`. `loadRootEnvFile()` loads the repository-root `.env`.
- `@pretoscop/config/logger`: `createLogger(name)` returns a pino JSON logger. Source jobs bind
  `source_id`, `run_id` and `shop` on a child logger.
