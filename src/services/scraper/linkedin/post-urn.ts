import { BASE_URL } from './urls'

/**
 * Descobre o URN do post pelos ids e links do card, ou `null`. Sem `data-urn` no layout atual, o ID vem do id
 * da caixa de tradução (`ShareUrn(...)`, `GroupPostUrn(...)`...), de links `/feed/update/urn:li:…` ou da
 * `componentkey` das ações do post (ver `urnFromComponentKey`).
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

		const fromKey = urnFromComponentKey(value)
		if (fromKey && postedAtFromUrn(fromKey)) return fromKey
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
 * Extrai a data de criação do post, guardada nos 41 bits mais altos do ID.
 * @returns Data ISO, ou `null` se o URN não tiver ID numérico ou a data não fizer sentido.
 */
export function postedAtFromUrn(urn: string, now = Date.now()): string | null {
	const id = urn.match(/(\d{15,})$/)?.[1]
	if (!id) return null

	const ms = Number(BigInt(id) >> 22n)
	if (ms < Date.UTC(2010, 0, 1) || ms > now + 86_400_000) return null
	return new Date(ms).toISOString()
}

/** Tipo do URN pelo número do campo no protobuf da `componentkey` (confirmados com o URN que vem no HTML da busca). */
const URN_TYPES_BY_FIELD: Record<number, string> = { 1: 'activity', 2: 'ugcPost' }

/**
 * Layout de 2026: o card não traz mais o URN, mas a `componentkey` das ações do post
 * (`CgsIgMDJ0JC9lMvQAQ-replaceableCommentTools…`) começa com um protobuf em base64url: o número do campo de fora
 * diz o tipo (1 = activity, 2 = ugcPost) e, dentro dele, o campo 1 é o ID em sint64 (zigzag).
 * @returns O URN, ou `null` se a chave não tiver esse formato.
 */
export function urnFromComponentKey(key: string): string | null {
	// O base64url também usa "-": tenta cada "-" como fim do prefixo e fica com o que tiver a estrutura esperada
	for (const match of key.matchAll(/-/g)) {
		const bytes = Buffer.from(key.slice(0, match.index), 'base64url')

		// <campo, tipo 2 (mensagem)> <tamanho da mensagem> 0x08 <varint>
		const type = URN_TYPES_BY_FIELD[(bytes[0] ?? 0) >> 3]
		if (!type || ((bytes[0] ?? 0) & 0b111) !== 2 || bytes[1] !== bytes.length - 2 || bytes[2] !== 0x08) continue

		const value = readVarint(bytes, 3)
		if (value === null) continue

		const id = (value >> 1n) ^ -(value & 1n)
		return id > 0n ? `urn:li:${type}:${id}` : null
	}

	return null
}

function readVarint(bytes: Buffer, start: number): bigint | null {
	let value = 0n
	let shift = 0n

	for (let index = start; index < bytes.length; index++) {
		const byte = bytes[index] ?? 0
		value |= BigInt(byte & 0x7f) << shift
		shift += 7n

		if ((byte & 0x80) === 0) return index === bytes.length - 1 ? value : null
	}

	return null
}
