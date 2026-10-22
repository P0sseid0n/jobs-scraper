import { z } from 'zod'

export const WORK_MODES = ['remoto', 'presencial', 'hibrido'] as const

/** Regimes de contratação que a vaga pode citar. */
export const CONTRACT_TYPES = ['clt', 'pj', 'estagio', 'freelance'] as const
export type ContractType = (typeof CONTRACT_TYPES)[number]

/**
 * Checks da extração: cada um marca um campo em que a IA devolveu algo que não está escrito no post (o valor já foi
 * descartado, menos o cargo). Quanto mais checks, maior a chance de o resto da vaga também estar errado.
 */
export const EXTRACTION_CHECKS = ['title', 'company', 'workMode', 'contractTypes', 'necessaryKnowledge', 'applyLink'] as const
export type ExtractionCheck = (typeof EXTRACTION_CHECKS)[number]

export const EXTRACTION_CHECK_LABELS: Record<ExtractionCheck, string> = {
	title: 'cargo',
	company: 'empresa',
	workMode: 'modalidade',
	contractTypes: 'regime',
	necessaryKnowledge: 'tecnologias',
	applyLink: 'link',
}

/** Quantos checks a vaga precisa ter para pedir que a pessoa confira o post original (`percent` dos checks). */
export function reviewChecksThreshold(percent: number) {
	return Math.max(1, Math.ceil((EXTRACTION_CHECKS.length * percent) / 100))
}

/**
 * Se a vaga tem checks suficientes para pedir que a pessoa confira o post original e reporte o erro.
 * @param percent O `reviewChecksPercent` das configurações do post-processing.
 */
export function needsReview(checks: readonly ExtractionCheck[], percent: number) {
	return checks.length >= reviewChecksThreshold(percent)
}

/** Vaga já estruturada: salva pelo post-processing e enviada no evento `job-published`. */
export const ProcessedJobSchema = z.object({
	postId: z.string().min(1),
	rawContent: z.string(),
	title: z.string().nullable(),
	company: z.string().nullable(),
	location: z.string().nullable(),
	/** Link de candidatura (site da vaga, formulário...), se houver. */
	applyLink: z.string().nullable(),
	necessaryKnowledge: z.array(z.string()).nullable(),
	recruiterEmail: z.string().nullable(),
	workMode: z.enum(WORK_MODES).nullable(),
	/**
	 * Regimes citados no post (um post com "CLT ou PJ" traz os dois); `null` quando o post não diz.
	 * O padrão aceita mensagens de antes do campo existir.
	 */
	contractTypes: z.array(z.enum(CONTRACT_TYPES)).nullable().default(null),
	/** Os checks da extração que dispararam; o padrão aceita mensagens de antes do campo existir. */
	extractionChecks: z.array(z.enum(EXTRACTION_CHECKS)).default([]),
	postedAt: z.iso.datetime().nullable().default(null),
	author: z.string().nullable().default(null),
	/** Idioma do post (ISO 639-1), detectado no texto; `null` se curto demais. */
	language: z.string().nullable().default(null),
	/** Post que listava várias vagas, de onde esta saiu; `null` se a vaga é o próprio post. */
	sourcePostId: z.string().nullable().default(null),
	/** Link do post no LinkedIn (numa vaga de lista, o do post de origem); `null` se o scraper não achou o id do post. */
	postLink: z.string().nullable().default(null),
})
export type ProcessedJob = z.infer<typeof ProcessedJobSchema>

/**
 * Evento `job-published`: a vaga e se ela pede para conferir o post original, pelo limite de checks em vigor quando
 * foi anunciada. O padrão aceita mensagens de antes do campo existir.
 */
export const JobPublishedSchema = ProcessedJobSchema.extend({ needsReview: z.boolean().default(false) })
export type JobPublished = z.infer<typeof JobPublishedSchema>
