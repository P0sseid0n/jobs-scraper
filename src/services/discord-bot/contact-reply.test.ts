import { describe, expect, test } from 'bun:test'

import type { JobPublished } from '@shared/contracts'
import { DEFAULT_TEMPLATE, templateMessage } from '@shared/templates'

import { buildContactReply, CONTACT_BUTTON_PREFIX, CV_PENDING_NOTE, emailFromEmbed, parseContactButton } from './contact-reply'
import { buildJobCard } from './job-card'

const job: JobPublished = {
	postId: 'urn:li:share:7513649051440021505',
	rawContent: '𝐋𝐞𝐚𝐝 Engineer - Vue.js\n\n\n\nResponsabilidades: liderar o *front-end*.',
	title: 'Lead Engineer - Vue.js',
	company: 'CitiusTech',
	companyConfidential: false,
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
	authorHeadline: null,
	language: 'pt',
	sourcePostId: null,
	postLink: 'https://www.linkedin.com/feed/update/urn:li:share:7513649051440021505/',
	imageCount: 0,
	imageText: null,
}

/** O modelo das configurações preenchido para a vaga, como o bot monta. */
function filled(template = DEFAULT_TEMPLATE, fallbacks: Record<string, string> = {}, data: Partial<JobPublished> = {}) {
	return templateMessage({ template, fallbacks, variables: [] }, { ...job, ...data }, { area: 'TI', targetRole: 'Dev' })
}

describe('botão de contato', () => {
	test('resposta traz e-mail, modelo de mensagem e aviso do currículo', () => {
		const reply = buildContactReply('rh@citiustech.com', filled(), { generatingCv: true })
		expect(reply).toContain('rh@citiustech.com')
		expect(reply).toContain('Mensagem do seu modelo para copiar:')
		expect(reply).toContain('Candidatura – Lead Engineer - Vue.js')
		expect(reply).toContain(CV_PENDING_NOTE)
	})

	test('a mensagem preenchida avisa o que usou fallback e o que faltou', () => {
		const template = { subject: '{{cargo}}', body: 'Vi a vaga na {{empresa}}, em {{local}}.' }
		const reply = buildContactReply('rh@acme.com', filled(template, { local: 'sua cidade' }, { company: null, location: null }), {
			generatingCv: false,
		})

		expect(reply).toContain('Mensagem do seu modelo para copiar:')
		expect(reply).toContain('Vi a vaga na [empresa], em sua cidade.')
		expect(reply).toContain('ℹ️ A vaga não tem {{local}}: entrou o texto do fallback.')
		expect(reply).toContain('⚠️ A vaga não tem {{empresa}}, e o modelo não tem fallback')
	})

	test('sem e-mail, só o aviso do currículo', () => {
		expect(buildContactReply(null, filled(), { generatingCv: true })).toBe(CV_PENDING_NOTE)
	})

	test('custom_id novo traz o postId; o antigo trazia o e-mail', () => {
		expect(parseContactButton(`${CONTACT_BUTTON_PREFIX}urn:li:share:1`)).toEqual({ legacyEmail: null, postId: 'urn:li:share:1' })
		expect(parseContactButton(`${CONTACT_BUTTON_PREFIX}rh@x.com`)).toEqual({ legacyEmail: 'rh@x.com', postId: null })
	})

	test('lê o e-mail do campo do card', () => {
		expect(emailFromEmbed(buildJobCard(job).embeds[0]!.toJSON().fields ?? [])).toBe('rh@citiustech.com')
	})
})
