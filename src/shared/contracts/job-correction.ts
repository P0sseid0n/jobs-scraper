import { z } from 'zod'

import { CONTRACT_TYPES, WORK_MODES, type ProcessedJob } from './job'

/** Campos da vaga extraídos pela IA que podem ser corrigidos pelo site (os mesmos avaliados por `bun eval:extraction`). */
export const CORRECTABLE_FIELDS = [
	'title',
	'company',
	'location',
	'workMode',
	'contractTypes',
	'necessaryKnowledge',
	'recruiterEmail',
	'applyLink',
] as const
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number]

/** Os valores dos campos corrigíveis de uma vaga (o que a IA extraiu ou o que foi corrigido). */
export type JobFields = Pick<ProcessedJob, CorrectableField>

/** Os valores dos campos corrigíveis, com lista vazia e campo ausente como `null` (como a API devolve). */
export function jobFields(job: { [K in CorrectableField]?: JobFields[K] | undefined }): JobFields {
	return {
		title: job.title ?? null,
		company: job.company ?? null,
		location: job.location ?? null,
		workMode: job.workMode ?? null,
		contractTypes: job.contractTypes?.length ? job.contractTypes : null,
		necessaryKnowledge: job.necessaryKnowledge?.length ? job.necessaryKnowledge : null,
		recruiterEmail: job.recruiterEmail ?? null,
		applyLink: job.applyLink ?? null,
	}
}

export const CORRECTION_LIMITS = { text: 200, skills: 30, skillLength: 60, link: 2000 } as const

/** Texto opcional: espaços nas pontas saem e vazio vira `null` ("não informado"). */
const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max, `Use até ${max} caracteres`)
		.nullable()
		.transform(value => value || null)

/** Lista sem itens vazios nem repetidos; vazia vira `null`, como a IA deixa um campo que o post não diz. */
const optionalList = <T extends z.ZodType<string>>(item: T, max: number) =>
	z
		.array(item)
		.max(max, `Use no máximo ${max} itens`)
		.nullable()
		.transform(items => {
			const seen = new Set<string>()
			const unique = (items ?? []).filter(value => {
				const key = value.toLowerCase()
				if (!value || seen.has(key)) return false
				seen.add(key)
				return true
			})
			return unique.length > 0 ? unique : null
		})

/**
 * Corpo do `PATCH /api/jobs/:postId`: só os campos enviados mudam. Ou corrige campos, ou marca que o post não é
 * vaga (`notAJob`), nunca os dois.
 */
export const JobCorrectionSchema = z
	.strictObject({
		title: z.string().trim().min(1, 'O cargo não pode ficar vazio').max(CORRECTION_LIMITS.text).optional(),
		company: optionalText(CORRECTION_LIMITS.text).optional(),
		location: optionalText(CORRECTION_LIMITS.text).optional(),
		workMode: z.enum(WORK_MODES).nullable().optional(),
		contractTypes: optionalList(z.enum(CONTRACT_TYPES), CONTRACT_TYPES.length)
			// Na ordem de CONTRACT_TYPES, como a IA devolve
			.transform(types => types && CONTRACT_TYPES.filter(type => types.includes(type)))
			.optional(),
		necessaryKnowledge: optionalList(
			z.string().trim().max(CORRECTION_LIMITS.skillLength, `Use até ${CORRECTION_LIMITS.skillLength} caracteres`),
			CORRECTION_LIMITS.skills,
		).optional(),
		recruiterEmail: z
			.union([z.literal('').transform(() => null), z.email('E-mail inválido').max(CORRECTION_LIMITS.text)])
			.nullable()
			.optional(),
		applyLink: z
			.union([
				z.literal('').transform(() => null),
				z.url({ protocol: /^https?$/, message: 'Use um link começando com http:// ou https://' }).max(CORRECTION_LIMITS.link),
			])
			.nullable()
			.optional(),
		notAJob: z.literal(true).optional(),
	})
	.superRefine((value, ctx) => {
		const fields = CORRECTABLE_FIELDS.filter(field => value[field] !== undefined)

		if (value.notAJob && fields.length > 0) {
			ctx.addIssue({ code: 'custom', path: ['notAJob'], message: '"Não é vaga" não vai junto com a correção de campos' })
		} else if (!value.notAJob && fields.length === 0) {
			ctx.addIssue({ code: 'custom', path: [], message: 'Envie ao menos um campo para corrigir' })
		}
	})
export type JobCorrection = z.output<typeof JobCorrectionSchema>
export type JobCorrectionInput = z.input<typeof JobCorrectionSchema>
