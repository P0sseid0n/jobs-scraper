import type { ExtractionCheck, ProcessedJob } from '@shared/contracts'

import type { AiJobOutput } from './extraction-output'
import { titleInPost } from './model-response'

/**
 * Os checks da extração: os campos em que a IA devolveu algo que não está escrito no post. As regras do texto já
 * descartaram esses valores na vaga (`job`); aqui eles só são contados, como sinal de que o resto pode estar errado.
 * @param text O texto que foi para a IA (já normalizado).
 */
export function extractionChecks(aiJob: AiJobOutput, job: ProcessedJob, text: string): ExtractionCheck[] {
	const checks: ExtractionCheck[] = []
	const keptSkills = new Set(job.necessaryKnowledge)
	const keptContractTypes = new Set(job.contractTypes)

	if (aiJob.title && !titleInPost(aiJob.title, text)) checks.push('title')
	if (aiJob.company && !job.company) checks.push('company')
	if (aiJob.workMode && !job.workMode) checks.push('workMode')
	if (aiJob.contractTypes?.some(type => !keptContractTypes.has(type))) checks.push('contractTypes')
	if (aiJob.necessary_knowledge?.some(skill => !keptSkills.has(skill))) checks.push('necessaryKnowledge')
	if (aiJob.link && !text.includes(aiJob.link)) checks.push('applyLink')

	return checks
}
