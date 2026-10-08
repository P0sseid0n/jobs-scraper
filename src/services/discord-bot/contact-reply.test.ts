import { describe, expect, test } from 'bun:test'

import type { ProcessedJob } from '@shared/contracts'

import { buildContactReply, CONTACT_BUTTON_PREFIX, CV_PENDING_NOTE, emailFromEmbed, parseContactButton } from './contact-reply'
import { buildJobCard } from './job-card'

const job: ProcessedJob = {
	postId: 'urn:li:share:7513649051440021505',
	rawContent: '𝐋𝐞𝐚𝐝 Engineer - Vue.js\n\n\n\nResponsabilidades: liderar o *front-end*.',
	title: 'Lead Engineer - Vue.js',
	company: 'CitiusTech',
	location: 'Pune',
	link: 'https://www.linkedin.com/feed/update/urn:li:share:7513649051440021505/',
	necessary_knowledge: ['Vue.js', 'TypeScript'],
	recruiter_email: 'rh@citiustech.com',
	workMode: 'hibrido',
	aiJobConfidence: 85,
	postedAt: '2026-10-07T17:18:50.712Z',
	author: 'Mandar Wairkar',
}

describe('botão de contato', () => {
	test('resposta traz e-mail, modelo de mensagem e aviso do currículo', () => {
		const reply = buildContactReply('rh@citiustech.com', 'Lead Engineer', { generatingCv: true })
		expect(reply).toContain('rh@citiustech.com')
		expect(reply).toContain('Candidatura – Lead Engineer')
		expect(reply).toContain(CV_PENDING_NOTE)
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
