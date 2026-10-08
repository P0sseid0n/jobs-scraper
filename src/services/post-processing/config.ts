import { z } from 'zod'

/** Valores iniciais da coleção `settings` (post-processing): depois da primeira execução valem os do banco. */
export const extractionEnv = {
	/** Posts com confiança da IA abaixo disso são descartados. */
	MIN_JOB_CONFIDENCE: z.coerce.number().min(0).max(100).default(60),
	/** Idiomas aceitos (ISO 639-1) separados por vírgula; vazio aceita todos. */
	JOB_LANGUAGES: z.string().default('pt'),
	/** Palavras que a vaga precisa citar (ao menos uma) no cargo ou nos conhecimentos, separadas por vírgula; vazio desliga. */
	JOB_REQUIRED_KEYWORDS: z.string().default(''),
	/** Palavras que descartam a vaga se aparecerem no cargo ou nos conhecimentos, separadas por vírgula. */
	JOB_EXCLUDED_KEYWORDS: z.string().default(''),
}

/** Converte uma lista do `.env` separada por vírgula ("pt, en") em itens em minúsculas, sem vazios. */
export function listFromEnv(value: string) {
	return value
		.split(',')
		.map(item => item.trim().toLowerCase())
		.filter(Boolean)
}
