import { describe, expect, test } from 'bun:test'

import type { ProcessedJob } from '@shared/contracts'

import { CONTACT_BUTTON_PREFIX } from './contact-reply'
import { buildJobCard, buildThreadName, pickForumTags, summarizePost } from './job-card'

const job: ProcessedJob = {
	postId: 'urn:li:share:7513649051440021505',
	rawContent: '𝐋𝐞𝐚𝐝 Engineer - Vue.js\n\n\n\nResponsabilidades: liderar o *front-end*.',
	title: 'Lead Engineer - Vue.js',
	company: 'CitiusTech',
	location: 'Pune',
	applyLink: null,
	necessaryKnowledge: ['Vue.js', 'TypeScript'],
	recruiterEmail: 'rh@citiustech.com',
	workMode: 'hibrido',
	contractTypes: ['clt', 'pj'],
	seniorities: ['pleno', 'senior'],
	aiJobConfidence: 85,
	postedAt: '2026-10-07T17:18:50.712Z',
	author: 'Mandar Wairkar',
	language: 'pt',
	sourcePostId: null,
	postLink: 'https://www.linkedin.com/feed/update/urn:li:share:7513649051440021505/',
}

describe('buildJobCard', () => {
	test('monta o embed com título clicável, campos e rodapé', () => {
		const embed = buildJobCard(job).embeds[0]!.toJSON()

		expect(embed.title).toBe('Lead Engineer - Vue.js')
		expect(embed.url).toBe(job.postLink!)
		expect(embed.color).toBe(0x3498db)
		expect(embed.footer?.text).toBe('Confiança da IA: 85%')
		expect(embed.timestamp).toBe('2026-10-07T17:18:50.712Z')
		expect(embed.fields?.map(field => field.name)).toEqual([
			'🏢 Empresa',
			'📍 Local',
			'🏠 Modalidade',
			'📊 Nível',
			'📄 Regime',
			'🕒 Publicada',
			'📧 Contato',
			'🛠️ Conhecimentos',
		])
		expect(embed.fields?.find(field => field.name === '🏠 Modalidade')?.value).toBe('Híbrido')
		expect(embed.fields?.find(field => field.name === '📊 Nível')?.value).toBe('Pleno/Sênior')
		expect(embed.fields?.find(field => field.name === '📄 Regime')?.value).toBe('CLT ou PJ')
		expect(embed.fields?.find(field => field.name === '🕒 Publicada')?.value).toBe('<t:1791393530:R>')
		expect(embed.fields?.at(-1)?.value).toBe('`Vue.js` `TypeScript`')
	})

	test('omite campos vazios em vez de mostrar placeholders', () => {
		const embed = buildJobCard({
			...job,
			company: null,
			location: null,
			workMode: null,
			contractTypes: null,
			seniorities: null,
			recruiterEmail: null,
		}).embeds[0]!.toJSON()

		expect(embed.fields?.map(field => field.name)).toEqual(['🕒 Publicada', '🛠️ Conhecimentos'])
		expect(embed.color).toBe(0x95a5a6)
	})

	test('botões de contato e do post (por último)', () => {
		const [row] = buildJobCard(job).components
		const buttons = row!.toJSON().components as { label?: string; url?: string; custom_id?: string }[]

		expect(buttons[0]).toMatchObject({ label: 'Contato do recrutador', custom_id: `${CONTACT_BUTTON_PREFIX}${job.postId}` })
		expect(buttons[1]).toMatchObject({ label: 'Ver post', url: job.postLink })
	})

	test('com site de candidatura: a candidatura primeiro, cada link no seu botão', () => {
		const [row] = buildJobCard({ ...job, applyLink: 'https://empresa.com/vagas/1' }).components
		const buttons = row!.toJSON().components as { label?: string; url?: string }[]

		expect(buttons.map(button => button.label)).toEqual(['Candidatar-se', 'Contato do recrutador', 'Ver post'])
		expect(buttons[0]).toMatchObject({ url: 'https://empresa.com/vagas/1' })
	})

	test('sem e-mail o botão gera só o currículo', () => {
		const [row] = buildJobCard({ ...job, postLink: null, recruiterEmail: null }).components
		const buttons = row!.toJSON().components as { label?: string; custom_id?: string }[]

		expect(buttons).toHaveLength(1)
		expect(buttons[0]).toMatchObject({ label: 'Gerar currículo', custom_id: `${CONTACT_BUTTON_PREFIX}${job.postId}` })
	})
})

describe('summarizePost', () => {
	test('normaliza negrito Unicode, junta linhas em branco, escapa markdown e corta', () => {
		expect(summarizePost(job.rawContent)).toBe('Lead Engineer - Vue.js\nResponsabilidades: liderar o \\*front-end\\*.')
		expect(summarizePost('a'.repeat(500), 400)).toHaveLength(400)
	})
})

describe('fórum', () => {
	test('nome do post com cargo e empresa', () => {
		expect(buildThreadName(job)).toBe('Lead Engineer - Vue.js · CitiusTech')
	})

	test('escolhe tags existentes que batem com modalidade, nível, regime e tecnologias', () => {
		const tags = [
			{ id: '1', name: 'Híbrido' },
			{ id: '2', name: 'Remoto' },
			{ id: '3', name: 'Vue' },
			{ id: '4', name: 'React' },
			{ id: '5', name: 'PJ' },
			{ id: '6', name: 'Estágio' },
			{ id: '7', name: 'Sênior' },
			{ id: '8', name: 'Júnior' },
		]
		expect(pickForumTags(job, tags)).toEqual(['1', '3', '5', '7'])
	})
})
