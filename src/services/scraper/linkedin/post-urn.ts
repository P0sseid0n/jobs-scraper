import { BASE_URL } from './urls'

/**
 * Descobre o URN do post a partir dos ids/links encontrados no card. O layout atual não tem mais `data-urn`:
 * o ID aparece no id da caixa de tradução (`ShareUrn(shareId=…)`, `UserGeneratedContentPostUrn(userGeneratedContentId=…)`,
 * `GroupPostUrn(groupId=…, postId=…)`) ou em links `/feed/update/urn:li:…`.
 */
export function resolvePostUrn(candidates: string[]): string | null {
	const values = candidates.map(value => {
		try {
			return decodeURIComponent(value)
		} catch {
			return value
		}
	})

	for (const value of values) {
		const direct = value.match(/urn:li:(activity|ugcPost|share):(\d+)/)
		if (direct) return `urn:li:${direct[1]}:${direct[2]}`

		const share = value.match(/shareId=(\d+)/)
		if (share) return `urn:li:share:${share[1]}`

		const ugcPost = value.match(/userGeneratedContentId=(\d+)/)
		if (ugcPost) return `urn:li:ugcPost:${ugcPost[1]}`
	}

	// Post de grupo sem link de activity: menos preferido, mas ainda abre em /feed/update/
	for (const value of values) {
		const groupPost = value.match(/groupId=(\d+), postId=(\d+)/)
		if (groupPost) return `urn:li:groupPost:${groupPost[1]}-${groupPost[2]}`
	}

	return null
}

export function postUrlFromUrn(urn: string) {
	return `${BASE_URL}/feed/update/${urn}/`
}

/**
 * Os IDs de post do LinkedIn carregam o timestamp de criação nos 41 bits mais altos (ms desde a epoch).
 * Retorna `null` se o URN não tiver um ID numérico ou se a data extraída não fizer sentido.
 */
export function postedAtFromUrn(urn: string, now = Date.now()): string | null {
	const id = urn.match(/(\d{15,})$/)?.[1]
	if (!id) return null

	const ms = Number(BigInt(id) >> 22n)
	if (ms < Date.UTC(2010, 0, 1) || ms > now + 86_400_000) return null
	return new Date(ms).toISOString()
}
