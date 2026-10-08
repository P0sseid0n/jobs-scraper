import { z } from 'zod'

export const extractionEnv = {
	/** Posts com confiança da IA abaixo disso são descartados (não viram vaga). */
	MIN_JOB_CONFIDENCE: z.coerce.number().min(0).max(100).default(60),
}
