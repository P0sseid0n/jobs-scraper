import type { ProcessedJob } from '@shared/contracts'

/**
 * Lista os campos que faltam para a vaga ser útil: um cargo e uma forma de candidatura (link ou e-mail).
 * Empresa, local e modalidade são opcionais.
 */
export function missingRequiredFields(job: ProcessedJob): string[] {
	const missing: string[] = []
	if (!job.title) missing.push('title')
	if (!job.link && !job.recruiter_email) missing.push('link ou recruiter_email')
	return missing
}
