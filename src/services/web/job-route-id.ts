/**
 * Id curto da vaga na URL (`/vagas/7515393090820456448`): o `postId` sem o `urn:li:<tipo>:` do LinkedIn.
 * Vagas de posts com várias têm um hash como `postId`, que fica igual. Usado pelo site e pela API.
 */

/** Tipos de post que o scraper salva (ver `resolvePostUrn` no scraper). */
const URN_TYPES = ['activity', 'ugcPost', 'share', 'groupPost']

const URN_PREFIX = /^urn:li:[A-Za-z]+:/

export function jobRouteId(postId: string) {
	return postId.replace(URN_PREFIX, '')
}

/** Se a vaga é a do id da URL; links antigos traziam o `postId` inteiro e continuam valendo. */
export function isJobRouteId(postId: string, routeId: string) {
	return postId === routeId || jobRouteId(postId) === routeId
}

/** Os `postId` que o id da URL pode ser, para buscar no banco. */
export function postIdCandidates(routeId: string) {
	if (URN_PREFIX.test(routeId)) return [routeId]

	return [routeId, ...URN_TYPES.map(type => `urn:li:${type}:${routeId}`)]
}
