import type { ProcessedJob } from '@shared/contracts'

/**
 * Campos sem os quais a vaga não serve para quem lê o canal. A IA já decidiu que é uma vaga
 * (post-processing); aqui só garantimos o mínimo para exibir e se candidatar:
 * - um cargo (título do card);
 * - alguma forma de chegar na vaga: o link do post ou o e-mail do recrutador.
 * Empresa, local e modalidade são opcionais: o card omite o que não existir.
 */
export function missingRequiredFields(job: ProcessedJob): string[] {
	const missing: string[] = []
	if (!job.title) missing.push('title')
	if (!job.link && !job.recruiter_email) missing.push('link ou recruiter_email')
	return missing
}
