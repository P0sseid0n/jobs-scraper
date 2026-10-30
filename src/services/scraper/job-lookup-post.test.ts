import { describe, expect, test } from 'bun:test'

import type { JobLookup } from '@shared/contracts'

import { listingPageText, lookupToRawPost } from './job-lookup-post'

const lookup: JobLookup = {
	postId: 'hash-do-link',
	sourcePostId: 'urn:li:activity:1',
	sourcePostUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:1/',
	title: 'Junior pleno front end engineer remote',
	link: 'https://lnkd.in/eQUCFcXh',
	text: '📄 Junior pleno front end engineer remote\n🔗 Candidate-se: https://lnkd.in/eQUCFcXh',
	author: 'Agregador de Vagas',
	authorIsCompany: true,
	postedAt: null,
	requestedAt: '2026-10-11T12:00:00.000Z',
	reprocessId: null,
}

const DESCRIPTION = 'Buscamos uma pessoa para construir interfaces com Vue 3, Pinia e TypeScript. '.repeat(3).trim()

describe('lookupToRawPost', () => {
	test('usa o texto da página e a URL limpa da vaga no LinkedIn', () => {
		const post = lookupToRawPost(lookup, {
			url: 'https://www.linkedin.com/jobs/view/frontend-engineer-at-acme-4012345678/?trk=public&refId=abc',
			text: `Frontend Engineer\nAcme · Brasil (Remoto)\n\n\n\n${DESCRIPTION}`,
		})

		expect(post.text).toBe(
			`Vaga: Junior pleno front end engineer remote\nLink: https://lnkd.in/eQUCFcXh\n\nFrontend Engineer\nAcme · Brasil (Remoto)\n\n${DESCRIPTION}`,
		)
		expect(post.jobLink).toBe('https://www.linkedin.com/jobs/view/4012345678/')
		// O `url` continua sendo o post no LinkedIn (vira o `postLink` da vaga)
		expect(post).toMatchObject({
			postId: 'hash-do-link',
			url: 'https://www.linkedin.com/feed/update/urn:li:activity:1/',
			sourcePostId: 'urn:li:activity:1',
			author: 'Agregador de Vagas',
			authorIsCompany: true,
		})
	})

	test('fora do LinkedIn, a candidatura é o link curto da lista', () => {
		expect(lookupToRawPost(lookup, { url: 'https://empresa.com/vagas/1?utm_source=x', text: DESCRIPTION }).jobLink).toBe(lookup.link)
	})

	test('sem a página, com ela vazia, num redirecionamento, num captcha ou no convite de um grupo, usa as linhas do post sobre a vaga', () => {
		const captcha = { url: 'https://br.thebigjobsite.com/x', text: 'First we just need to check you are not a robot' }
		// Página real de um agregador no meio da contagem: longa, mas o texto é só o rodapé do site
		const redirect = {
			url: 'https://www.netvagas.com.br/l-redirect/?url=x',
			text: `Redirecionando em 1…\n\nVocê será levado automaticamente para o destino.\n\nIr agora\n\n${'Buscar vagas · Cadastre-se grátis · Ajuda ao candidato · '.repeat(5)}`,
		}
		// Convite de grupo: a página é o menu do WhatsApp, longa o bastante para passar por vaga
		const groupInvite = {
			url: 'https://chat.whatsapp.com/AbC123',
			text: `Programadores Javascript\nGroup chat invite\nOpen app\nContinue to WhatsApp Web\n\n${'Features · Privacy · Help Center · For Business · '.repeat(5)}`,
		}

		for (const page of [null, { url: lookup.link, text: '  \n ' }, captcha, redirect, groupInvite]) {
			expect(lookupToRawPost(lookup, page).text).toBe(`Vaga: ${lookup.title}\nLink: ${lookup.link}\n\n${lookup.text}`)
			// O "processar de novo" vê que a página não serviu, para não trocá-la pelas linhas do post
			expect(listingPageText(page)).toBeNull()
		}
	})

	test('leva o pedido do "processar de novo" ao post-processing', () => {
		const page = { url: 'https://empresa.com/vagas/1', text: DESCRIPTION }

		expect(listingPageText(page)).toBe(DESCRIPTION)
		expect(lookupToRawPost({ ...lookup, reprocessId: 'pedido-1' }, page).reprocessId).toBe('pedido-1')
		expect(lookupToRawPost(lookup, page).reprocessId).toBeNull()
	})
})
