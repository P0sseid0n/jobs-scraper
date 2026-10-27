import { describe, expect, mock, test } from 'bun:test'

import { POST_IMAGE_LIMITS } from '@shared/contracts'
import { createLogger } from '@shared/logging'

import { downloadPostImages } from './post-images'

const logger = createLogger('test')
const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

function respond(routes: Record<string, () => Response>) {
	return mock(async (input: string | URL | Request) => {
		const route = routes[String(input)]
		if (!route) throw new Error('sem rede')
		return route()
	}) as unknown as typeof fetch
}

describe('downloadPostImages', () => {
	test('baixa a primeira URL que vem como imagem e guarda em base64', async () => {
		const fetchImage = respond({
			'https://x/1280': () => new Response('assinatura inválida', { status: 403 }),
			'https://x/800': () => new Response(PNG, { headers: { 'content-type': 'image/png' } }),
		})

		const images = await downloadPostImages([['https://x/1280', 'https://x/800', 'https://x/160']], logger, fetchImage)

		expect(images).toEqual([{ mimeType: 'image/png', data: PNG.toString('base64') }])
		expect(fetchImage).toHaveBeenCalledTimes(2)
	})

	test('pula o que não é imagem, o grande demais e a falha de rede', async () => {
		const big = Buffer.alloc(POST_IMAGE_LIMITS.maxBytes + 1)
		const fetchImage = respond({
			'https://x/html': () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
			'https://x/grande': () => new Response(big, { headers: { 'content-type': 'image/jpeg' } }),
			'https://x/jpg': () => new Response(PNG, { headers: { 'content-type': 'image/jpg; charset=binary' } }),
		})

		const images = await downloadPostImages(
			[['https://x/html', 'https://x/grande', 'https://x/offline'], ['https://x/jpg']],
			logger,
			fetchImage,
		)

		expect(images).toEqual([{ mimeType: 'image/jpeg', data: PNG.toString('base64') }])
	})

	test('post sem imagem não faz nenhuma requisição', async () => {
		const fetchImage = respond({})

		expect(await downloadPostImages([], logger, fetchImage)).toEqual([])
		expect(fetchImage).not.toHaveBeenCalled()
	})
})
