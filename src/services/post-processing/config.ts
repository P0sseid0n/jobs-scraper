import { z } from 'zod'

export const extractionEnv = {
	/** Posts com confiança da IA abaixo disso são descartados. Valor inicial: depois vale o da coleção `settings`. */
	MIN_JOB_CONFIDENCE: z.coerce.number().min(0).max(100).default(60),
	/** Idiomas aceitos (ISO 639-1) separados por vírgula; vazio aceita todos. Valor inicial, como o acima. */
	JOB_LANGUAGES: z.string().default('pt'),
}

/** Converte `JOB_LANGUAGES` ("pt, en") na lista de idiomas aceitos. */
export function languagesFromEnv(value: string) {
	return value
		.split(',')
		.map(language => language.trim().toLowerCase())
		.filter(Boolean)
}
