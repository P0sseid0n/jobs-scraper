import { describe, expect, test } from 'bun:test'

import type { JobPublished } from '@shared/contracts'

import { buildContactReply, CONTACT_BUTTON_PREFIX, CV_PENDING_NOTE, emailFromEmbed, parseContactButton } from './contact-reply'
import { buildJobCard } from './job-card'

const job: JobPublished = {
	postId: 'urn:li:share:7513649051440021505',
	rawContent: '𝐋𝐞𝐚𝐝 Engineer - Vue.js\n\n\n\nResponsabilidades: liderar o *front-end*.',
	title: 'Lead Engineer - Vue.js',
	company: 'CitiusTech',
	location: 'Pune',
	applyLink: null,
	necessaryKnowledge: ['Vue.js', 'TypeScript'],
	recruiterEmail: 'rh@citiustech.com',
	workMode: 'hibrido',
	contractTypes: null,
	extractionChecks: [],
	needsReview: false,
	postedAt: '2026-10-07T17:18:50.712Z',
	author: 'Mandar Wairkar',
	language: 'pt',
	sourcePostId: null,
	postLink: 'https://www.linkedin.com/feed/update/urn:li:share:7513649051440021505/',
	imageCount: 0,
	imageText: null,
}

describe('botão de contato', () => {
	test('resposta traz e-mail, modelo de mensagem e aviso do currículo', () => {
		const reply = buildContactReply('rh@citiustech.com', 'Lead Engineer', { generatingCv: true })
		expect(reply).toContain('rh@citiustech.com')
		expect(reply).toContain('Candidatura – Lead Engineer')
		expect(reply).toContain(CV_PENDING_NOTE)
	})

	test('o modelo de mensagem leva a assinatura das configurações', () => {
		const reply = buildContactReply('rh@acme.com', 'Dev', { generatingCv: false, signature: 'GitHub: https://github.com/exemplo' })

		expect(reply).toContain('Obrigado!\n\nGitHub: https://github.com/exemplo\n```')
	})

	test('sem e-mail, só o aviso do currículo', () => {
		expect(buildContactReply(null, 'Dev', { generatingCv: true })).toBe(CV_PENDING_NOTE)
	})

	test('custom_id novo traz o postId; o antigo trazia o e-mail', () => {
		expect(parseContactButton(`${CONTACT_BUTTON_PREFIX}urn:li:share:1`)).toEqual({ legacyEmail: null, postId: 'urn:li:share:1' })
		expect(parseContactButton(`${CONTACT_BUTTON_PREFIX}rh@x.com`)).toEqual({ legacyEmail: 'rh@x.com', postId: null })
	})

	test('lê o e-mail do campo do card', () => {
		expect(emailFromEmbed(buildJobCard(job).embeds[0]!.toJSON().fields ?? [])).toBe('rh@citiustech.com')
	})
})
