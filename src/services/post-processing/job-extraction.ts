import type { Ollama } from 'ollama'

import type { ProcessedJob, RawPost } from '@shared/contracts'
import { PermanentError } from '@shared/messaging'

import { extractionChecks } from './extraction-checks'
import type { AiJobOutput } from './extraction-output'
import { buildExtractionMessages, extractionOutputFormat } from './extraction-prompt'
import {
	keepCompanyIfInPost,
	keepContractTypesInPost,
	keepLinkIfInPost,
	keepSkillsInPost,
	keepWorkModeInPost,
	locationWithoutWorkMode,
	parseModelResponse,
} from './model-response'

/**
 * Pede ao modelo os dados da vaga contidos no post (`null` se ele responder `null`). Num post com várias vagas, o
 * modelo escolhe a mais próxima de `targetRole` (o cargo-alvo do perfil) ou, sem ele, a primeira. As imagens do
 * post vão junto: o modelo transcreve o texto delas (`imageText`) e o usa na extração.
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
		messages: buildExtractionMessages({ text: normalizePostText(post.text), author: post.author, images: post.images }, targetRole),
		format: extractionOutputFormat(post),
		options: { temperature: 0 },
	})

	try {
		return parseModelResponse(response.message.content)
	} catch (error) {
		// Com structured outputs isso não deveria acontecer; se acontecer, tentar de novo não ajuda
		throw new PermanentError('Resposta do modelo inválida', { cause: error })
	}
}

/**
 * Monta a vaga com os dados da IA e os do post, que têm prioridade. As regras que descartam o que não está escrito
 * no post leem também o texto que a IA transcreveu das imagens dele: senão os dados que só estão na imagem saem.
 */
export function buildProcessedJob(post: RawPost, aiJob: AiJobOutput, language: string | null): ProcessedJob {
	const imageText = post.images.length > 0 ? aiJob.imageText : null
	const sourceText = imageText ? `${post.text}\n\n${imageText}` : post.text

	const job: ProcessedJob = {
		postId: post.postId,
		rawContent: post.text,
		title: aiJob.title,
		// Só a empresa escrita no post: o modelo às vezes a tira do domínio de um link ou e-mail
		company: keepCompanyIfInPost(aiJob.company, sourceText),
		location: locationWithoutWorkMode(aiJob.location),
		// O da lista (vaga de um post com várias) tem prioridade; o da IA só vale se estiver escrito no texto; sem nenhum,
		// o do cartão anexado (reposts de sites de vagas, com o texto cortado)
		applyLink: post.jobLink ?? keepLinkIfInPost(aiJob.link, normalizePostText(sourceText)) ?? post.attachedLink,
		// Só os conhecimentos escritos no post: o modelo às vezes completa com tecnologias "típicas" do cargo
		necessaryKnowledge: keepSkillsInPost(aiJob.necessary_knowledge, sourceText),
		recruiterEmail: aiJob.recruiter_email,
		// Só a modalidade escrita no post: o modelo às vezes a deduz do cargo
		workMode: keepWorkModeInPost(aiJob.workMode, sourceText),
		// Só os regimes escritos no post; "CLT" e "PJ" entram pelo texto mesmo se o modelo não os devolver
		contractTypes: keepContractTypesInPost(aiJob.contractTypes, sourceText),
		extractionChecks: [],
		postedAt: post.postedAt,
		author: post.author,
		language,
		sourcePostId: post.sourcePostId,
		postLink: post.url,
		imageCount: post.images.length,
		imageText,
	}

	return { ...job, extractionChecks: extractionChecks(aiJob, job, normalizePostText(sourceText)) }
}

/** Aplica NFKC: o "negrito" Unicode comum no LinkedIn (𝐕𝐮𝐞.𝐣𝐬) vira texto que o modelo entende. */
function normalizePostText(text: string) {
	return text.normalize('NFKC')
}
