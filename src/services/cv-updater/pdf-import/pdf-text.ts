import { extractLinks, extractText, getDocumentProxy } from 'unpdf'

import { t } from '@shared/i18n'

/** Menos que isso de texto (sem os espaços) é PDF escaneado ou uma imagem: não há o que ler sem OCR. */
const MIN_TEXT_CHARS = 100

/** O PDF não pode ser importado; a mensagem vai para a pessoa como está. */
export class PdfImportError extends Error {}

/** O texto do PDF, com as quebras de linha, e os links clicáveis (o "LinkedIn" que leva ao perfil), sem os `mailto:`. */
export type PdfText = { text: string; links: string[]; pages: number }

/**
 * Extrai o texto e os links do PDF, sem ferramenta externa (pdf.js, pelo `unpdf`).
 * @throws {PdfImportError} Se não for um PDF, estiver corrompido ou protegido, ou não tiver texto selecionável.
 */
export async function extractPdfText(pdf: Uint8Array): Promise<PdfText> {
	if (new TextDecoder().decode(pdf.subarray(0, 1024)).indexOf('%PDF-') === -1) {
		throw new PdfImportError(t().cvErrors.notPdf)
	}

	let document: Awaited<ReturnType<typeof getDocumentProxy>>
	try {
		// Uma cópia: o pdf.js transfere o buffer recebido (que fica inutilizável, e o de um Buffer pode ser compartilhado).
		// Sem os avisos no console de cada objeto que ele precisou reconstruir: o erro, se houver, basta
		document = await getDocumentProxy(new Uint8Array(pdf), { verbosity: 0 })
	} catch (error) {
		if ((error as Error).name === 'PasswordException') {
			throw new PdfImportError(t().cvErrors.passwordProtected)
		}
		throw new PdfImportError(t().cvErrors.corruptedPdf)
	}

	try {
		const [{ text, totalPages }, { links }] = await Promise.all([
			extractText(document, { mergePages: true }),
			extractLinks(document),
		])

		if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
			throw new PdfImportError(t().cvErrors.noText)
		}

		const urls = links.flat().filter(link => /^https?:\/\//i.test(link))
		return { text: text.normalize('NFKC'), links: [...new Set(urls)], pages: totalPages }
	} finally {
		await document.loadingTask.destroy()
	}
}
