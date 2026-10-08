import type { Message, Ollama } from 'ollama'

import type { Logger } from '@shared/logging'

import type { ResumeContent } from './resume/resume.types'
import { tailorResumeToJob } from './tailor-resume'
import { buildRetryMessage, buildTailoringRequest, parseTailoringSuggestions, type TailoringSuggestions } from './tailoring-prompt'
import type { TargetJob } from './target-job'

const MODEL_ATTEMPTS = 2

type AiOptions = { ollama: Ollama; model: string }

/**
 * Pede à IA a nova apresentação e as sugestões de habilidades e projetos; se a apresentação for
 * rejeitada, pede outra versão uma vez.
 * @returns As sugestões, ou `null` se a IA falhar (o currículo ainda é ajustado, sem apresentação nova).
 */
export async function requestTailoringSuggestions(
	ai: AiOptions,
	resume: ResumeContent,
	job: TargetJob,
	log: Logger,
): Promise<TailoringSuggestions | null> {
	const request = buildTailoringRequest(resume, job)
	const messages: Message[] = request.messages
	let suggestions: TailoringSuggestions | null = null

	for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt++) {
		try {
			const response = await ai.ollama.chat({
				model: ai.model,
				messages,
				format: request.format,
				options: { temperature: 0.2 },
			})
			suggestions = parseTailoringSuggestions(response.message.content)

			const { report } = tailorResumeToJob(resume, job, suggestions)
			if (!report.summaryRejected) return suggestions

			log.info({ attempt, reason: report.summaryRejected }, 'Apresentação rejeitada, pedindo nova versão à IA')
			messages.push({ role: 'assistant', content: response.message.content }, buildRetryMessage(report.summaryRejected))
		} catch (error) {
			log.warn({ err: error }, 'Falha ao consultar a IA; gerando currículo só com os ajustes determinísticos')
			return suggestions
		}
	}

	return suggestions
}
