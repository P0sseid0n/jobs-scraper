import type { Ollama } from 'ollama'

import type { ProcessedJob, RawPost } from '@shared/contracts'
import { PermanentError } from '@shared/messaging'

import type { AiJobOutput } from './extraction-output'
import { buildExtractionMessages, EXTRACTION_OUTPUT_FORMAT } from './extraction-prompt'
import { jobConfidenceFromLogprobs } from './job-confidence'
import {
	keepCompanyIfInPost,
	keepContractTypesInPost,
	keepLinkIfInPost,
	keepSkillsInPost,
	locationWithoutWorkMode,
	parseModelResponse,
} from './model-response'

/**
 * Pede ao modelo os dados da vaga contidos no post (`null` se ele responder `null`). Num post com várias vagas, o
 * modelo escolhe a mais próxima de `targetRole` (o cargo-alvo do perfil) ou, sem ele, a primeira.
 */
export async function extractJobFromPost(
	ollama: Ollama,
	model: string,
	post: RawPost,
	targetRole: string | null,
): Promise<AiJobOutput | null> {
	// Erros do Ollama (fora do ar, timeout) são transitórios: o QueueClient tenta de novo
	const response = await ollama.chat({
		model,
		messages: buildExtractionMessages({ text: normalizePostText(post.text), author: post.author }, targetRole),
		format: EXTRACTION_OUTPUT_FORMAT,
		options: { temperature: 0 },
		// A confiança sai da probabilidade dos tokens do `postType`, não de um número escrito pelo modelo
		logprobs: true,
	})

	let aiJob: AiJobOutput | null
	try {
		aiJob = parseModelResponse(response.message.content)
	} catch (error) {
		// Com structured outputs isso não deveria acontecer; se acontecer, tentar de novo não ajuda
		throw new PermanentError('Resposta do modelo inválida', { cause: error })
	}

	if (!aiJob) return null
	// Sem logprobs (Ollama anterior ao 0.12.11), só a classificação decide
	const aiJobConfidence = jobConfidenceFromLogprobs(response.logprobs) ?? (aiJob.isJob ? 100 : 0)
	return { ...aiJob, aiJobConfidence }
}

/** Monta a vaga com os dados da IA e os do post, que têm prioridade. */
export function buildProcessedJob(post: RawPost, aiJob: AiJobOutput, language: string | null): ProcessedJob {
	return {
		postId: post.postId,
		rawContent: post.text,
		title: aiJob.title,
		// Só a empresa escrita no post: o modelo às vezes a tira do domínio de um link ou e-mail
		company: keepCompanyIfInPost(aiJob.company, post.text),
		location: locationWithoutWorkMode(aiJob.location),
		// O da lista (vaga de um post com várias) tem prioridade; o da IA só vale se estiver escrito no texto; sem nenhum,
		// o do cartão anexado (reposts de sites de vagas, com o texto cortado)
		applyLink: post.jobLink ?? keepLinkIfInPost(aiJob.link, normalizePostText(post.text)) ?? post.attachedLink,
		// Só os conhecimentos escritos no post: o modelo às vezes completa com tecnologias "típicas" do cargo
		necessaryKnowledge: keepSkillsInPost(aiJob.necessary_knowledge, post.text),
		recruiterEmail: aiJob.recruiter_email,
		workMode: aiJob.workMode,
		// Só os regimes escritos no post; "CLT" e "PJ" entram pelo texto mesmo se o modelo não os devolver
		contractTypes: keepContractTypesInPost(aiJob.contractTypes, post.text),
		aiJobConfidence: aiJob.aiJobConfidence,
		postedAt: post.postedAt,
		author: post.author,
		language,
		sourcePostId: post.sourcePostId,
		postLink: post.url,
	}
}

/** Aplica NFKC: o "negrito" Unicode comum no LinkedIn (𝐕𝐮𝐞.𝐣𝐬) vira texto que o modelo entende. */
function normalizePostText(text: string) {
	return text.normalize('NFKC')
}
