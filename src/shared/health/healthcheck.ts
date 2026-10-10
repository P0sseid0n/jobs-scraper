// Healthcheck do Docker: `bun src/shared/health/healthcheck.ts` sai com 0 se o heartbeat do serviço está recente
import { checkHeartbeat } from './heartbeat'

process.exit((await checkHeartbeat()) ? 0 : 1)
