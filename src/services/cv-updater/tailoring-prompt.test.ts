import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { readResumeTex } from './resume/latex-reader'
import { buildRetryMessage, buildTailoringRequest } from './tailoring-prompt'

const { model: cv } = readResumeTex(await Bun.file(path.join(import.meta.dir, './assets/cv.example.tex')).text())

const job = {
	title: 'Dev Front-end',
	company: 'Acme',
	necessaryKnowledge: ['Vue 3', 'TypeScript', 'CSS3/SCSS', 'Angular', 'REST APIs'],
	rawContent: 'Vaga',
}

describe('prompt', () => {
	test('lista as techs a adicionar e restringe as categorias às do currículo', () => {
		const { messages, format, toAdd } = buildTailoringRequest(cv, job)

		expect(toAdd).toEqual(['Angular'])
		expect(messages.at(-1)?.content).toContain('## Skills to add\nAngular')
		expect(JSON.stringify(format)).toContain('"Ferramentas & DevOps"')
		expect(JSON.stringify(format)).toContain('"skip"')
	})

	test('a IA vê formação, certificações e idiomas de um currículo de outra área', async () => {
		const neutral = readResumeTex(await Bun.file(path.join(import.meta.dir, './assets/cv.neutral.example.tex')).text())
		const { messages } = buildTailoringRequest(neutral.model, { ...job, title: 'Enfermeira UTI', necessaryKnowledge: ['ACLS'] })

		expect(messages.at(-1)?.content).toContain('Other sections: Formação: Universidade Exemplo - Bacharelado em Enfermagem')
		expect(messages.at(-1)?.content).toContain('Certificações e Cursos: Suporte Avançado de Vida em Cardiologia (ACLS)')
	})

	test('com o perfil, manda área e cargo-alvo; sem perfil, não manda a seção', () => {
		const { messages } = buildTailoringRequest(cv, job, { area: 'Marketing', targetRole: 'Analista de Marketing Digital' })
		expect(messages.at(-1)?.content).toStartWith(
			'## Candidate profile\nField: Marketing\nTarget role: Analista de Marketing Digital\n\n',
		)

		expect(buildTailoringRequest(cv, job).messages.at(-1)?.content).not.toContain('Candidate profile')
	})

	test('não supõe que a pessoa é dev', () => {
		const system = buildTailoringRequest(cv, job).messages[0]?.content ?? ''

		expect(system).toContain("a professional's résumé")
		expect(system).not.toContain('developer')
		expect(system).toContain('Never invent skills, tools')
	})

	test('vaga de marketing: competências que faltam não entram como itens a adicionar', () => {
		const marketingJob = {
			title: 'Analista de Marketing Digital',
			company: 'Acme',
			necessaryKnowledge: ['Gestão de tráfego pago', 'Copywriting', 'Atendimento humanizado', 'HubSpot'],
			rawContent: 'Vaga de marketing',
		}
		const marketing = {
			...cv,
			skills: [{ category: 'Marketing', items: ['Tráfego pago (Google Ads, Meta Ads)', 'SEO'] }],
			projects: [],
		}
		const { messages, toAdd } = buildTailoringRequest(marketing, marketingJob)

		expect(toAdd).toEqual([])
		expect(messages.at(-1)?.content).toContain('## Skills to add\nnone')
		expect(messages.at(-1)?.content).not.toContain('Projects:')
	})

	test('pede nova versão com o motivo da rejeição', () => {
		expect(buildRetryMessage('tamanho 600').content).toContain('Your summary was rejected: tamanho 600')
	})
})
