import type { WebCvBaseVersion } from '../../api-types'

/** A versão ativa do currículo base: a última ativada; `null` se nenhuma foi (o cv-updater usa o arquivo). */
export function activeVersion(versions: readonly WebCvBaseVersion[]) {
	let active: WebCvBaseVersion | null = null

	for (const version of versions) {
		if (version.activatedAt && (!active || version.activatedAt > active.activatedAt!)) active = version
	}

	return active
}

/** Inclui ou troca a versão na lista, mantendo das mais novas às mais antigas. */
export function upsertVersion(versions: readonly WebCvBaseVersion[], version: WebCvBaseVersion) {
	return [...versions.filter(item => item.versionId !== version.versionId), version].sort((a, b) =>
		b.createdAt.localeCompare(a.createdAt),
	)
}

/** Tamanho do texto em bytes (UTF-8), como o servidor conta para o limite. */
export function texBytes(tex: string) {
	return new TextEncoder().encode(tex).length
}

const kilobytes = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** "12,3 KB". */
export function formatKilobytes(bytes: number) {
	return `${kilobytes.format(bytes / 1024)} KB`
}
