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
	link: 'https://www.linkedin.com/feed/update/urn:li:share:7513649051440021505/',
	necessary_knowledge: ['Vue.js', 'TypeScript'],
	recruiter_email: 'rh@citiustech.com',
	workMode: 'hibrido',
	aiJobConfidence: 85,
	postedAt: '2026-10-07T17:18:50.712Z',
	author: 'Mandar Wairkar',
}

describe('buildJobCard', () => {
	test('monta o embed com título clicável, campos e rodapé', () => {
		const embed = buildJobCard(job).embeds[0]!.toJSON()

		expect(embed.title).toBe('Lead Engineer - Vue.js')
		expect(embed.url).toBe(job.link!)
		expect(embed.color).toBe(0x3498db)
		expect(embed.footer?.text).toBe('Confiança da IA: 85%')
		expect(embed.timestamp).toBe('2026-10-07T17:18:50.712Z')
		expect(embed.fields?.map(field => field.name)).toEqual([
			'🏢 Empresa',
			'📍 Local',
			'🏠 Modalidade',
			'🕒 Publicada',
			'📧 Contato',
			'🛠️ Conhecimentos',
		])
		expect(embed.fields?.find(field => field.name === '🏠 Modalidade')?.value).toBe('Híbrido')
		expect(embed.fields?.find(field => field.name === '🕒 Publicada')?.value).toBe('<t:1791393530:R>')
		expect(embed.fields?.at(-1)?.value).toBe('`Vue.js` `TypeScript`')
	})

	test('omite campos vazios em vez de mostrar placeholders', () => {
		const embed = buildJobCard({
			...job,
			company: null,
			location: null,
			workMode: null,
			recruiter_email: null,
		}).embeds[0]!.toJSON()

		expect(embed.fields?.map(field => field.name)).toEqual(['🕒 Publicada', '🛠️ Conhecimentos'])
		expect(embed.color).toBe(0x95a5a6)
	})

	test('botões de link e de contato', () => {
		const [row] = buildJobCard(job).components
		const buttons = row!.toJSON().components as { label?: string; url?: string; custom_id?: string }[]

		expect(buttons[0]).toMatchObject({ label: 'Ver post', url: job.link })
		expect(buttons[1]).toMatchObject({ label: 'Contato do recrutador', custom_id: `${CONTACT_BUTTON_PREFIX}${job.postId}` })
	})

	test('sem e-mail o botão gera só o currículo', () => {
		const [row] = buildJobCard({ ...job, link: null, recruiter_email: null }).components
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

	test('escolhe tags existentes que batem com modalidade e tecnologias', () => {
		const tags = [
			{ id: '1', name: 'Híbrido' },
			{ id: '2', name: 'Remoto' },
			{ id: '3', name: 'Vue' },
			{ id: '4', name: 'React' },
		]
		expect(pickForumTags(job, tags)).toEqual(['1', '3'])
	})
})
