import { describe, expect, test } from 'bun:test'

import type { JobPublished } from '@shared/contracts'

import { CONTACT_BUTTON_PREFIX } from './contact-reply'
import { APPLIED_BUTTON_PREFIX, buildJobCard, buildThreadName, pickForumTags, summarizePost, withAppliedButton } from './job-card'

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
	contractTypes: ['clt', 'pj'],
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

describe('buildJobCard', () => {
	test('a imagem do post vai como anexo e aparece no embed', async () => {
		const data = await Bun.file(new URL('../post-processing/fixtures/images/vaga-detalhes-na-imagem.jpg', import.meta.url)).bytes()
		const card = buildJobCard({ ...job, imageCount: 1 }, { mimeType: 'image/jpeg', data: Buffer.from(data) })

		expect(card.embeds[0]!.toJSON().image?.url).toBe('attachment://vaga.jpg')
		expect(card.files.map(file => file.name)).toEqual(['vaga.jpg'])
	})

	test('sem imagem, não há anexo', () => {
		const card = buildJobCard(job)

		expect(card.embeds[0]!.toJSON().image).toBeUndefined()
		expect(card.files).toEqual([])
	})

	test('monta o embed com título clicável e campos', () => {
		const embed = buildJobCard(job).embeds[0]!.toJSON()

		expect(embed.title).toBe('Lead Engineer - Vue.js')
		expect(embed.url).toBe(job.postLink!)
		expect(embed.color).toBe(0x3498db)
		// Sem checks da extração, sem rodapé
		expect(embed.footer).toBeUndefined()
		expect(embed.timestamp).toBe('2026-10-07T17:18:50.712Z')
		expect(embed.fields?.map(field => field.name)).toEqual([
			'🏢 Empresa',
			'📍 Local',
			'🏠 Modalidade',
			'📄 Regime',
			'🕒 Publicada',
			'📧 Contato',
			'🛠️ Conhecimentos',
		])
		expect(embed.fields?.find(field => field.name === '🏠 Modalidade')?.value).toBe('Híbrido')
		expect(embed.fields?.find(field => field.name === '📄 Regime')?.value).toBe('CLT ou PJ')
		expect(embed.fields?.find(field => field.name === '🕒 Publicada')?.value).toBe('<t:1791393530:R>')
		expect(embed.fields?.at(-1)?.value).toBe('`Vue.js` `TypeScript`')
	})

	test('rodapé com os checks da extração; com o aviso de conferir, barra vermelha e pede para reportar', () => {
		const few = buildJobCard({ ...job, extractionChecks: ['workMode', 'necessaryKnowledge'] }).embeds[0]!.toJSON()
		expect(few.footer?.text).toBe('⚠ 2/6 · a conferir no post: modalidade, tecnologias')
		expect(few.color).toBe(0x3498db)

		const many = buildJobCard({
			...job,
			extractionChecks: ['title', 'company', 'workMode', 'applyLink'],
			needsReview: true,
		}).embeds[0]!.toJSON()
		expect(many.footer?.text).toBe(
			'⚠ 4/6 · a conferir no post: cargo, empresa, modalidade, link. Confira o post original e reporte a vaga no site.',
		)
		expect(many.color).toBe(0xe74c3c)
	})

	test('omite campos vazios em vez de mostrar placeholders', () => {
		const embed = buildJobCard({
			...job,
			company: null,
			location: null,
			workMode: null,
			contractTypes: null,
			recruiterEmail: null,
		}).embeds[0]!.toJSON()

		expect(embed.fields?.map(field => field.name)).toEqual(['🕒 Publicada', '🛠️ Conhecimentos'])
		expect(embed.color).toBe(0x95a5a6)
	})

	test('botões de contato, da candidatura e do post (por último)', () => {
		const [row] = buildJobCard(job).components
		const buttons = row!.toJSON().components as { label?: string; url?: string; custom_id?: string }[]

		expect(buttons[0]).toMatchObject({ label: 'Contato do recrutador', custom_id: `${CONTACT_BUTTON_PREFIX}${job.postId}` })
		expect(buttons[1]).toMatchObject({ label: 'Já me candidatei', custom_id: `${APPLIED_BUTTON_PREFIX}${job.postId}` })
		expect(buttons[2]).toMatchObject({ label: 'Ver post', url: job.postLink })
	})

	test('marcada a candidatura, só o botão dela muda', () => {
		const rows = buildJobCard(job).components.map(row => row.toJSON())
		const [marked] = withAppliedButton(rows, job.postId, true)
		const buttons = marked!.components as { label?: string; custom_id?: string }[]

		expect(buttons.map(button => button.label)).toEqual(['Contato do recrutador', 'Candidatura enviada', 'Ver post'])
		expect(withAppliedButton(rows, job.postId, false)).toEqual(rows)
	})

	test('com site de candidatura: a candidatura primeiro, cada link no seu botão', () => {
		const [row] = buildJobCard({ ...job, applyLink: 'https://empresa.com/vagas/1' }).components
		const buttons = row!.toJSON().components as { label?: string; url?: string }[]

		expect(buttons.map(button => button.label)).toEqual(['Candidatar-se', 'Contato do recrutador', 'Já me candidatei', 'Ver post'])
		expect(buttons[0]).toMatchObject({ url: 'https://empresa.com/vagas/1' })
	})

	test('sem e-mail o botão gera só o currículo', () => {
		const [row] = buildJobCard({ ...job, postLink: null, recruiterEmail: null }).components
		const buttons = row!.toJSON().components as { label?: string; custom_id?: string }[]

		expect(buttons.map(button => button.label)).toEqual(['Gerar currículo', 'Já me candidatei'])
		expect(buttons[0]).toMatchObject({ custom_id: `${CONTACT_BUTTON_PREFIX}${job.postId}` })
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

	test('escolhe tags existentes que batem com modalidade, regime e tecnologias', () => {
		const tags = [
			{ id: '1', name: 'Híbrido' },
			{ id: '2', name: 'Remoto' },
			{ id: '3', name: 'Vue' },
			{ id: '4', name: 'React' },
			{ id: '5', name: 'PJ' },
			{ id: '6', name: 'Estágio' },
		]
		expect(pickForumTags(job, tags)).toEqual(['1', '3', '5'])
	})
})
