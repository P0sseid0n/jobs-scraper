import { describe, expect, test } from 'bun:test'

import { splitMultiJobPost } from './multi-job-post'

// Post real de agregador (resumido)
const AGGREGATOR_POST = `🚨 10 VAGAS EM TODO BRASIL:

📄 Technical operations manager remote sensing monitoring rs m latin america
🔗 Candidate-se: https://lnkd.in/e5c5H3-v

📄 Junior pleno front end engineer remote
🔗 Candidate-se: https://lnkd.in/eQUCFcXh

📄 Hubspot administrator remote
🔗 Candidate-se: https://lnkd.in/eCgCzEZy

📄 Technical project manager data center remote
🔗 Candidate-se: https://lnkd.in/ecGCDe7s

📄 Technical project manager data center remote
🔗 Candidate-se: https://lnkd.in/eWUZnNCq`

describe('splitMultiJobPost', () => {
	test('separa cada vaga do post de agregador com o cargo e o link, sem o cabeçalho da lista', () => {
		const listings = splitMultiJobPost(AGGREGATOR_POST)

		expect(listings?.some(listing => listing.text.includes('10 VAGAS'))).toBe(false)
		expect(listings?.[1]).toEqual({
			title: 'Junior pleno front end engineer remote',
			link: 'https://lnkd.in/eQUCFcXh',
			text: '📄 Junior pleno front end engineer remote\n🔗 Candidate-se: https://lnkd.in/eQUCFcXh',
		})
	})

	test('o mesmo cargo repetido com outro link vira uma vaga só', () => {
		const titles = splitMultiJobPost(AGGREGATOR_POST)?.map(listing => listing.title)

		expect(titles).toEqual([
			'Technical operations manager remote sensing monitoring rs m latin america',
			'Junior pleno front end engineer remote',
			'Hubspot administrator remote',
			'Technical project manager data center remote',
		])
	})

	test('aceita uma vaga por linha, com o link no fim e numeração', () => {
		const post = `Vagas da semana
1. Desenvolvedor Vue Pleno - https://lnkd.in/a1
2) Analista de Dados: https://lnkd.in/b2.
3. QA Sênior | https://lnkd.in/c3`

		expect(splitMultiJobPost(post)).toEqual([
			{ title: 'Desenvolvedor Vue Pleno', link: 'https://lnkd.in/a1', text: '1. Desenvolvedor Vue Pleno - https://lnkd.in/a1' },
			{ title: 'Analista de Dados', link: 'https://lnkd.in/b2', text: '2) Analista de Dados: https://lnkd.in/b2.' },
			{ title: 'QA Sênior', link: 'https://lnkd.in/c3', text: '3. QA Sênior | https://lnkd.in/c3' },
		])
	})

	test('blocos sem linha em branco entre eles: o cabeçalho não entra na primeira vaga', () => {
		const post = `Vagas em São Paulo
Dev Front-end
Candidate-se: https://lnkd.in/a1
Dev Back-end
Candidate-se: https://lnkd.in/b2
Dev Mobile
Candidate-se: https://lnkd.in/c3`

		const listings = splitMultiJobPost(post)

		expect(listings?.map(listing => listing.title)).toEqual(['Dev Front-end', 'Dev Back-end', 'Dev Mobile'])
		expect(listings?.[0]?.text).toBe('Dev Front-end\nCandidate-se: https://lnkd.in/a1')
	})

	test('post de uma vaga só, mesmo com alguns links, não é dividido', () => {
		const post = `Estamos contratando Desenvolvedor(a) Front-end Vue!

Requisitos: Vue 3, TypeScript e testes.
Candidate-se: https://empresa.com/vagas/123
Conheça a empresa: https://empresa.com`

		expect(splitMultiJobPost(post)).toBeNull()
	})

	test('vários links na mesma linha não são divididos', () => {
		const post = `Links: https://a.com https://b.com
Outros: https://c.com https://d.com
Mais: https://e.com https://f.com`

		expect(splitMultiJobPost(post)).toBeNull()
	})
})
