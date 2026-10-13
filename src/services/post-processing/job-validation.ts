import type { ProcessedJob } from '@shared/contracts'

/**
 * Lista os campos que faltam para a vaga ser útil: um cargo e o link do post no LinkedIn (que também serve de forma
 * de candidatura quando não há site nem e-mail). Empresa, local, modalidade, site e e-mail são opcionais.
 */
export function missingRequiredFields(job: ProcessedJob): string[] {
	const missing: string[] = []
	if (!job.title) missing.push('title')
	if (!job.postLink) missing.push('postLink')
	return missing
}
