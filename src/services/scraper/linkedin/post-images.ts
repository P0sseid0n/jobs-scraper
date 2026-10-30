import { POST_IMAGE_LIMITS } from '@shared/contracts'

/** Uma `<img>` do card como o navegador a mostra: o `src` e o `srcset` (tamanhos alternativos), se houver. */
export type CardImage = { src: string; srcset: string }

/**
 * Imagem do conteúdo do post (não avatar nem logo): `media.licdn.com/dms/image/.../feedshare-shrink_<tamanho>/...`, ou
 * `.../image-shrink_<tamanho>/...` nas postadas pela API (páginas que publicam vagas automaticamente). A barra antes
 * evita o `profile-displaybackgroundimage-shrink_` da capa do perfil.
 */
const CONTENT_IMAGE = /^https:\/\/media\.licdn\.com\/dms\/image\/.*\/(?:feedshare|image)-shrink_\d+/

/** Identifica a imagem independente do tamanho: o id depois de `/dms/image/` (com ou sem `v2/`). */
const IMAGE_ID = /\/dms\/image\/(?:v\d+\/)?([^/?]+)\//

const SIZE = /\/(feedshare|image)-shrink_\d+(?:_\d+)?/g

/** Tamanhos legíveis para a IA: a prévia (`_160`) é pequena demais; acima disso, só aumenta o download. */
const READABLE_MIN = 800
const READABLE_MAX = 1280

/**
 * As URLs de cada imagem do conteúdo do post (até `POST_IMAGE_LIMITS.maxImages`, na ordem do card), da preferida
 * para a última tentativa: os tamanhos do `srcset` e do `src` entre 800 e 1280 px primeiro, depois os maiores e
 * por fim os menores. Sem nenhum legível, tenta antes o `src` trocado para `_1280` e `_800`: as URLs são assinadas
 * e a troca pode ser recusada, por isso o original fica no fim.
 */
export function postImageUrls(images: CardImage[]): string[][] {
	const byImage = new Map<string, string[]>()

	for (const image of images) {
		const urls = [...srcsetUrls(image.srcset), image.src].filter(url => CONTENT_IMAGE.test(url))
		const id = urls[0] && IMAGE_ID.exec(urls[0])?.[1]
		if (!id) continue

		byImage.set(id, [...(byImage.get(id) ?? []), ...urls])
	}

	return [...byImage.values()].slice(0, POST_IMAGE_LIMITS.maxImages).map(urls => {
		const unique = [...new Set(urls)].sort((a, b) => preference(imageWidth(a)) - preference(imageWidth(b)))
		if (unique.some(url => isReadable(imageWidth(url)))) return unique

		const resized = [READABLE_MAX, READABLE_MIN].map(width => withWidth(unique[0]!, width))
		return [...new Set([...resized, ...unique])]
	})
}

/** As URLs de um `srcset` ("url 800w, url 1280w"); as URLs do LinkedIn não têm vírgula nem espaço. */
function srcsetUrls(srcset: string) {
	return srcset
		.split(',')
		.map(entry => entry.trim().split(/\s+/)[0] ?? '')
		.filter(Boolean)
}

function imageWidth(url: string) {
	return Number(/\/(?:feedshare|image)-shrink_(\d+)/.exec(url)?.[1] ?? 0)
}

function isReadable(width: number) {
	return width >= READABLE_MIN && width <= READABLE_MAX
}

/** Menor é melhor: legíveis do maior para o menor, depois os grandes do menor para o maior, por fim os pequenos. */
function preference(width: number) {
	if (isReadable(width)) return READABLE_MAX - width
	if (width > READABLE_MAX) return width
	return 1_000_000 - width
}

function withWidth(url: string, width: number) {
	return url.replace(SIZE, `/$1-shrink_${width}`)
}
