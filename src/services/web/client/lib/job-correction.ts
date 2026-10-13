import type { CorrectableField, JobCorrectionInput, JobFields } from '@shared/contracts'

import type { WebJob } from '../../api-types'

/** Rascunho do formulário de correção: textos como o usuário digita (vazio = não informado), listas e a modalidade. */
export type CorrectionDraft = {
	title: string
	company: string
	location: string
	workMode: JobFields['workMode']
	contractTypes: NonNullable<JobFields['contractTypes']>
	necessaryKnowledge: string[]
	recruiterEmail: string
	applyLink: string
}

/** O formulário começa com os valores atuais da vaga. */
export function draftFromJob(job: WebJob): CorrectionDraft {
	return {
		title: job.title,
		company: job.company ?? '',
		location: job.location ?? '',
		workMode: job.workMode,
		contractTypes: job.contractTypes ?? [],
		necessaryKnowledge: job.necessaryKnowledge ?? [],
		recruiterEmail: job.recruiterEmail ?? '',
		applyLink: job.applyLink ?? '',
	}
}

/**
 * Corpo do `PATCH /api/jobs/:postId` com só os campos escolhidos. O servidor limpa espaços e troca vazio por `null`;
 * a validação (com o erro de cada campo) também é dele.
 */
export function correctionBody(draft: CorrectionDraft, fields: CorrectableField[]): JobCorrectionInput {
	return Object.fromEntries(fields.map(field => [field, draft[field]]))
}
