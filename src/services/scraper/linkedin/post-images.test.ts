import { describe, expect, test } from 'bun:test'

import { postImageUrls } from './post-images'

// URLs no formato das imagens dos posts na busca (assinatura e prazo trocados)
const image = (id: string, size: string) =>
	`https://media.licdn.com/dms/image/v2/${id}/feedshare-shrink_${size}/feedshare-shrink_${size}/0/1760000000000?e=1762992000&v=beta&t=assinatura`
const AVATAR =
	'https://media.licdn.com/dms/image/v2/D4D03AQF/profile-displayphoto-shrink_100_100/0/1700000000000?e=1762992000&v=beta&t=x'
const LOGO = 'https://media.licdn.com/dms/image/v2/C4E0BAQG/company-logo_100_100/0/1630000000000?e=1762992000&v=beta&t=x'
// Imagem postada pela API (páginas que publicam vagas automaticamente): só um trecho com o tamanho
const apiImage = (id: string, size: string) =>
	`https://media.licdn.com/dms/image/v2/${id}/image-shrink_${size}/B4EaGDdaERIwAg-/0/1760000000000?e=1762992000&v=beta&t=assinatura`
const COVER =
	'https://media.licdn.com/dms/image/v2/D4D16AQE/profile-displaybackgroundimage-shrink_200_800/profile-displaybackgroundimage-shrink_200_800/0/1700000000000?e=1762992000&v=beta&t=x'

describe('postImageUrls', () => {
	test('fica só com as imagens do conteúdo, sem avatar nem logo', () => {
		const urls = postImageUrls([
			{ src: AVATAR, srcset: '' },
			{ src: image('D4D22AQH', '800'), srcset: '' },
			{ src: LOGO, srcset: '' },
		])

		expect(urls).toEqual([[image('D4D22AQH', '800')]])
	})

	test('aceita a imagem postada pela API (image-shrink), sem a capa do perfil', () => {
		const urls = postImageUrls([
			{ src: COVER, srcset: '' },
			{ src: apiImage('D4D10AQH', '800'), srcset: '' },
		])

		expect(urls).toEqual([[apiImage('D4D10AQH', '800')]])
	})

	test('a imagem da API sem tamanho legível também é trocada para 1280 e 800', () => {
		const urls = postImageUrls([{ src: apiImage('D4D10AQH', '160'), srcset: '' }])

		expect(urls).toEqual([[apiImage('D4D10AQH', '1280'), apiImage('D4D10AQH', '800'), apiImage('D4D10AQH', '160')]])
	})

	test('prefere um tamanho legível do srcset à prévia pequena', () => {
		const urls = postImageUrls([
			{
				src: image('D4D22AQH', '160'),
				srcset: `${image('D4D22AQH', '160')} 160w, ${image('D4D22AQH', '2048_1536')} 2048w, ${image('D4D22AQH', '800')} 800w, ${image('D4D22AQH', '1280')} 1280w`,
			},
		])

		expect(urls).toEqual([
			[image('D4D22AQH', '1280'), image('D4D22AQH', '800'), image('D4D22AQH', '2048_1536'), image('D4D22AQH', '160')],
		])
	})

	test('sem tamanho legível, tenta a URL trocada para 1280 e 800 antes da original', () => {
		const urls = postImageUrls([{ src: image('D4D22AQH', '160'), srcset: '' }])

		expect(urls).toEqual([[image('D4D22AQH', '1280'), image('D4D22AQH', '800'), image('D4D22AQH', '160')]])
	})

	test('junta a mesma imagem vista duas vezes e limita a quantidade', () => {
		const urls = postImageUrls([
			{ src: image('AAAA', '800'), srcset: '' },
			{ src: image('AAAA', '1280'), srcset: '' },
			{ src: image('BBBB', '800'), srcset: '' },
			{ src: image('CCCC', '800'), srcset: '' },
		])

		expect(urls).toEqual([[image('AAAA', '1280'), image('AAAA', '800')], [image('BBBB', '800')]])
	})

	test('post sem imagem não tem URLs', () => {
		expect(postImageUrls([])).toEqual([])
		expect(postImageUrls([{ src: '', srcset: '' }])).toEqual([])
	})
})
