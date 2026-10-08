import { createHash } from 'node:crypto'

/** Normaliza espaços e caixa, para o mesmo post não gerar IDs diferentes. */
export function normalizePostText(text: string) {
	return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Gera o ID estável de um post, usado na deduplicação em todo o pipeline. */
export function hashPost(text: string) {
	return createHash('sha256').update(normalizePostText(text)).digest('hex')
}
