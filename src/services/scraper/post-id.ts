import { createHash } from 'node:crypto'

/** Normaliza o texto para que diferenças de espaçamento ou caixa não gerem IDs diferentes para o mesmo post. */
export function normalizePostText(text: string) {
	return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** ID estável de um post, usado para deduplicação em todo o pipeline. */
export function hashPost(text: string) {
	return createHash('sha256').update(normalizePostText(text)).digest('hex')
}
