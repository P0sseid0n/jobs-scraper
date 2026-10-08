import { z } from 'zod'

export const extractionEnv = {
	/** Posts com confiança da IA abaixo disso são descartados. Valor inicial: depois vale o da coleção `settings`. */
	MIN_JOB_CONFIDENCE: z.coerce.number().min(0).max(100).default(60),
}
