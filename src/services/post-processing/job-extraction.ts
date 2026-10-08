import type { Ollama } from 'ollama'

import type { ProcessedJob, RawPost } from '@shared/contracts'
import { PermanentError } from '@shared/messaging'

import type { AiJobOutput } from './extraction-output'
import { buildExtractionMessages, EXTRACTION_OUTPUT_FORMAT } from './extraction-prompt'
import { keepLinkIfInPost, parseModelResponse } from './model-response'

/** Pede ao modelo os dados da vaga contidos no post (`null` se ele responder `null`). */
export async function extractJobFromPost(ollama: Ollama, model: string, post: RawPost): Promise<AiJobOutput | null> {
	// Erros do Ollama (fora do ar, timeout) são transitórios: o QueueClient tenta de novo
	const response = await ollama.chat({
		model,
		messages: buildExtractionMessages({ text: normalizePostText(post.text), author: post.author }),
		format: EXTRACTION_OUTPUT_FORMAT,
		options: { temperature: 0 },
	})

	try {
		return parseModelResponse(response.message.content)
	} catch (error) {
		// Com structured outputs isso não deveria acontecer; se acontecer, tentar de novo não ajuda
		throw new PermanentError('Resposta do modelo inválida', { cause: error })
	}
}

/** Monta a vaga com os dados da IA e os do post, que têm prioridade. */
export function buildProcessedJob(post: RawPost, aiJob: AiJobOutput): ProcessedJob {
	return {
		postId: post.postId,
		rawContent: post.text,
		title: aiJob.title,
		company: aiJob.company,
		location: aiJob.location,
		// O link real do post tem prioridade; o da IA só vale se estiver escrito no texto
		link: post.url ?? keepLinkIfInPost(aiJob.link, normalizePostText(post.text)),
		necessary_knowledge: aiJob.necessary_knowledge,
		recruiter_email: aiJob.recruiter_email,
		workMode: aiJob.workMode,
		aiJobConfidence: aiJob.aiJobConfidence,
		postedAt: post.postedAt,
		author: post.author,
	}
}

/** Aplica NFKC: o "negrito" Unicode comum no LinkedIn (𝐕𝐮𝐞.𝐣𝐬) vira texto que o modelo entende. */
function normalizePostText(text: string) {
	return text.normalize('NFKC')
}
