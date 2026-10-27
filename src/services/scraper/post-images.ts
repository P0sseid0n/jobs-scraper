import { POST_IMAGE_LIMITS, POST_IMAGE_TYPES, type PostImage, type PostImageType } from '@shared/contracts'
import type { Logger } from '@shared/logging'

const DOWNLOAD_TIMEOUT_MS = 15_000

/**
 * Baixa as imagens do post para mandar à fila: as URLs do LinkedIn são assinadas e expiram, então guardar só a URL
 * não serve. Para cada imagem, tenta as URLs na ordem (ver `postImageUrls`) até uma vir como imagem dentro do
 * limite de tamanho; a imagem que não baixar fica de fora, sem impedir o post de seguir.
 */
export async function downloadPostImages(
	urlsPerImage: string[][],
	logger: Logger,
	fetchImage: typeof fetch = fetch,
): Promise<PostImage[]> {
	const images: PostImage[] = []

	for (const urls of urlsPerImage) {
		const image = await downloadFirst(urls, logger, fetchImage)
		if (image) images.push(image)
	}

	return images
}

async function downloadFirst(urls: string[], logger: Logger, fetchImage: typeof fetch): Promise<PostImage | null> {
	for (const url of urls) {
		try {
			const response = await fetchImage(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
			const mimeType = imageType(response.headers.get('content-type'))
			const declaredSize = Number(response.headers.get('content-length') ?? 0)

			if (!response.ok || !mimeType || declaredSize > POST_IMAGE_LIMITS.maxBytes) {
				await response.body?.cancel()
				continue
			}

			const data = await response.arrayBuffer()
			if (data.byteLength === 0 || data.byteLength > POST_IMAGE_LIMITS.maxBytes) continue

			return { mimeType, data: Buffer.from(data).toString('base64') }
		} catch (error) {
			logger.debug({ err: error }, 'Falha ao baixar uma imagem do post, tentando o próximo tamanho')
		}
	}

	logger.debug({ tried: urls.length }, 'Imagem do post não baixada')
	return null
}

/** O tipo da imagem pelo `Content-Type` ("image/jpeg; charset=..." → "image/jpeg"); `null` se não for um aceito. */
function imageType(contentType: string | null): PostImageType | null {
	const type = contentType?.split(';')[0]?.trim().toLowerCase().replace('image/jpg', 'image/jpeg')
	return (POST_IMAGE_TYPES as readonly string[]).includes(type ?? '') ? (type as PostImageType) : null
}
