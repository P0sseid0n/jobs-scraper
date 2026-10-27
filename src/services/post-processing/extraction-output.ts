import { z } from 'zod'

import { CONTRACT_TYPES, WORK_MODES, type ContractType } from '@shared/contracts'

/** Classificação do post feita pela IA; só `job_opening` vira vaga. */
export const POST_TYPES = ['job_opening', 'job_seeker', 'course_or_graduation', 'tips_or_list', 'other'] as const

/** Textos que o modelo às vezes devolve como string em vez do `null` do JSON. */
const EMPTY_VALUES = new Set(['', 'null', 'none', 'n/a', 'na', 'undefined', '-', 'string'])

/** Frases que dizem que o valor falta ("unknown", "Não especificado", "O nome da empresa não foi mencionado no post"). */
const MISSING_VALUE =
	/\b(unknown|desconhecid[oa]|not (specified|mentioned|stated|informed)|nao (foi |e |esta )?(especificad|informad|mencionad|divulgad|citad|identificad)[oa])\b/

function isEmptyValue(value: string) {
	const normalized = value
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()

	return EMPTY_VALUES.has(normalized) || MISSING_VALUE.test(normalized)
}

const nullableString = z
	.string()
	.trim()
	.transform(value => (isEmptyValue(value) ? null : value))
	.nullable()
	.catch(null)

/** Nomes que o modelo às vezes usa no lugar dos valores do enum ("Estágio", "PJ", "freelancer"). */
const CONTRACT_TYPE_ALIASES: Record<string, ContractType> = {
	'pessoa juridica': 'pj',
	internship: 'estagio',
	intern: 'estagio',
	freelancer: 'freelance',
	freela: 'freelance',
}

function toContractType(value: string): ContractType | null {
	const normalized = value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim()

	if ((CONTRACT_TYPES as readonly string[]).includes(normalized)) return normalized as ContractType
	return CONTRACT_TYPE_ALIASES[normalized] ?? null
}

/**
 * Schema tolerante para a saída do modelo de IA: campos ausentes ou com tipo errado viram `null`
 * em vez de invalidar a resposta inteira.
 */
export const AiJobOutputSchema = z
	.object({
		postType: z.enum(POST_TYPES).nullable().catch(null),
		title: nullableString,
		company: nullableString,
		location: nullableString,
		link: nullableString,
		necessary_knowledge: z
			.union([z.array(z.string()), z.string().transform(value => value.split(','))])
			.transform(items => {
				const knowledge = items.map(item => item.trim()).filter(item => !isEmptyValue(item))
				return knowledge.length > 0 ? knowledge : null
			})
			.nullable()
			.catch(null),
		recruiter_email: nullableString,
		// Só nos posts com imagens (ver `EXTRACTION_OUTPUT_FORMAT_WITH_IMAGES`)
		imageText: nullableString,
		// Lista sem repetição, na ordem de CONTRACT_TYPES; sem nenhum regime válido vira `null`
		contractTypes: z
			.union([z.array(z.string()), z.string().transform(value => value.split(/,|\/| ou | or /i))])
			.transform(items => {
				const found = new Set(items.map(toContractType))
				const types = CONTRACT_TYPES.filter(type => found.has(type))
				return types.length > 0 ? types : null
			})
			.nullable()
			.catch(null),
		workMode: z
			.string()
			.transform(value =>
				value
					.normalize('NFD')
					.replace(/\p{Diacritic}/gu, '')
					.toLowerCase(),
			)
			.pipe(z.enum(WORK_MODES))
			.nullable()
			.catch(null),
		isJob: z.union([z.boolean(), z.enum(['true', 'false']).transform(value => value === 'true')]).catch(false),
	})
	// Com `postType` (formato atual), ele decide se é vaga; `isJob` fica como compatibilidade com o formato antigo
	.transform(({ postType, ...job }) => ({ ...job, postType, isJob: postType ? postType === 'job_opening' : job.isJob }))
export type AiJobOutput = z.infer<typeof AiJobOutputSchema>
