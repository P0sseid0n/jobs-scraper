import type { Message, Ollama } from 'ollama'

import type { CvFormDraft } from '@shared/contracts'
import type { Logger } from '@shared/logging'

import { importedForm } from './import-form'
import { buildImportRequest, buildImportRetryMessage, parseImportOutput } from './import-prompt'
import { extractPdfText, PdfImportError } from './pdf-text'

const MODEL_ATTEMPTS = 2
/** O texto do currículo, o schema e a resposta passam do contexto padrão do Ollama (4096 tokens). */
const CONTEXT_TOKENS = 16_384

type AiOptions = { ollama: Ollama; model: string }

/**
 * Lê o currículo em PDF e distribui o texto nos campos do formulário do currículo base, sem reescrever nada: o que o
 * modelo devolve e não está no PDF é descartado (`importedForm`).
 * @throws {PdfImportError} Se o PDF não puder ser lido, a IA não responder ou o PDF não parecer um currículo.
 */
export async function importResumePdf(ai: AiOptions, pdf: Uint8Array, log: Logger): Promise<CvFormDraft> {
	const text = await extractPdfText(pdf)
	log.info({ pages: text.pages, chars: text.text.length, links: text.links.length }, 'Texto do PDF extraído')

	const output = await requestImportOutput(ai, buildImportRequest(text), log)
	const { form, dropped } = importedForm(output, text)
	if (dropped > 0) log.info({ dropped }, 'Campos da IA que não estão no PDF foram descartados')

	const hasBase = form.sections.some(section => section.kind === 'experience' || section.kind === 'education')
	if (!hasBase) {
		throw new PdfImportError(
			'Não encontrei experiência nem formação nesse PDF: ele não parece um currículo. Confira o arquivo ou preencha o formulário.',
		)
	}

	return form
}

/** Pede ao modelo os campos do formulário; uma resposta fora do formato ganha mais uma tentativa. */
async function requestImportOutput(ai: AiOptions, request: ReturnType<typeof buildImportRequest>, log: Logger) {
	const messages: Message[] = [...request.messages]
	let lastError: unknown

	for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt++) {
		let content: string
		try {
			const response = await ai.ollama.chat({
				model: ai.model,
				messages,
				format: request.format,
				options: { temperature: 0, num_ctx: CONTEXT_TOKENS },
			})
			content = response.message.content
		} catch (error) {
			log.warn({ err: error }, 'Falha ao consultar a IA para importar o PDF')
			throw new PdfImportError('A IA não respondeu ao ler o currículo. Confira se o Ollama está rodando e tente de novo.')
		}

		try {
			return parseImportOutput(content)
		} catch (error) {
			lastError = error
			const reason = error instanceof SyntaxError ? 'invalid JSON' : 'fields outside the schema'
			log.info({ attempt, reason }, 'Resposta da IA fora do formato, pedindo de novo')
			messages.push({ role: 'assistant', content }, buildImportRetryMessage(reason))
		}
	}

	log.warn({ err: lastError }, 'A IA não devolveu os campos do currículo no formato pedido')
	throw new PdfImportError('A IA não conseguiu ler o currículo. Tente de novo ou preencha o formulário.')
}
