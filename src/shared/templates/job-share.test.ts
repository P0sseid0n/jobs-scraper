import { describe, expect, test } from 'bun:test'

import {
	jobShareCard,
	jobShareFileName,
	jobShareSubject,
	jobShareText,
	SHARE_DESCRIPTION_MAX,
	type ShareCardOptions,
	type ShareJob,
} from './job-share'

/** Uma vaga com todos os dados, como sai do post-processing. */
const JOB: ShareJob = {
	title: 'Desenvolvedor Front-end React',
	company: 'Loja Azul',
	location: 'Belo Horizonte, MG',
	workMode: 'hibrido',
	contractTypes: ['clt'],
	necessaryKnowledge: ['React', 'TypeScript', 'Next.js'],
	applyLink: 'https://lojaazul.gupy.io/jobs/8123456',
	recruiterEmail: 'vagas@lojaazul.com.br',
	postLink: 'https://www.linkedin.com/feed/update/urn:li:activity:7381234567890123456/',
	rawContent: [
		'Estamos contratando! #vagas #react',
		'',
		'',
		'',
		'A Loja Azul procura uma pessoa   desenvolvedora front-end para o time de e-commerce.',
		'Inscreva-se: https://lojaazul.gupy.io/jobs/8123456',
	].join('\n'),
	postedAt: '2026-10-27T14:30:00.000Z',
}

describe('jobShareText', () => {
	test('vaga completa: cargo e empresa, detalhes, tecnologias, candidatura e post', () => {
		expect(jobShareText(JOB)).toBe(
			[
				'*Desenvolvedor Front-end React* — Loja Azul',
				'CLT · Híbrido · Belo Horizonte, MG',
				'Tecnologias: React, TypeScript e Next.js',
				'',
				'Candidatura: https://lojaazul.gupy.io/jobs/8123456',
				'Post original: https://www.linkedin.com/feed/update/urn:li:activity:7381234567890123456/',
			].join('\n'),
		)
	})

	test('sem empresa, o cargo fica sozinho na primeira linha', () => {
		const text = jobShareText({ ...JOB, company: null })

		expect(text.split('\n')[0]).toBe('*Desenvolvedor Front-end React*')
		expect(text).not.toContain('Empresa')
	})

	test('sem link de candidatura, vai o e-mail do recrutador', () => {
		const text = jobShareText({ ...JOB, applyLink: null })

		expect(text).toContain('Candidatura: envie o currículo para vagas@lojaazul.com.br')
		expect(text).toContain('Post original:')
	})

	test('sem link nem e-mail, só o post original', () => {
		const text = jobShareText({ ...JOB, applyLink: null, recruiterEmail: null })

		expect(text).not.toContain('Candidatura')
		expect(text.endsWith('\n\nPost original: https://www.linkedin.com/feed/update/urn:li:activity:7381234567890123456/')).toBe(true)
	})

	test('sem nenhum link, o texto sai sem a seção de candidatura', () => {
		const text = jobShareText({ ...JOB, applyLink: null, recruiterEmail: null, postLink: null })

		expect(text).toBe(
			[
				'*Desenvolvedor Front-end React* — Loja Azul',
				'CLT · Híbrido · Belo Horizonte, MG',
				'Tecnologias: React, TypeScript e Next.js',
			].join('\n'),
		)
	})

	test('vários regimes: "CLT ou PJ"', () => {
		expect(jobShareText({ ...JOB, contractTypes: ['clt', 'pj'], workMode: 'remoto', location: null })).toContain(
			'\nCLT ou PJ · Remoto\n',
		)
	})

	test('muitas tecnologias: as 5 primeiras e quantas faltam', () => {
		const necessaryKnowledge = ['Java', 'Spring Boot', 'Kafka', 'PostgreSQL', 'Docker', 'Kubernetes', 'AWS', 'Terraform']

		expect(jobShareText({ ...JOB, necessaryKnowledge })).toContain(
			'Tecnologias: Java, Spring Boot, Kafka, PostgreSQL, Docker e mais 3',
		)
	})

	test('vaga só com o cargo: nenhum rótulo vazio', () => {
		const empty: ShareJob = {
			title: 'Estágio em Dados',
			company: null,
			location: null,
			workMode: null,
			contractTypes: null,
			necessaryKnowledge: [],
			applyLink: null,
			recruiterEmail: null,
			postLink: null,
			rawContent: '',
			postedAt: null,
		}

		expect(jobShareText(empty)).toBe('*Estágio em Dados*')
		expect(jobShareText({ ...empty, title: null })).toBe('*Vaga*')
	})

	test('asteriscos do cargo não quebram o negrito do WhatsApp', () => {
		expect(jobShareText({ ...JOB, title: '*URGENTE* Analista de Dados', company: null }).split('\n')[0]).toBe(
			'*URGENTE Analista de Dados*',
		)
	})

	test('nenhum link para a máquina local nem que não seja http(s)', () => {
		for (const applyLink of [
			'http://localhost:3000/vagas/1',
			'http://192.168.1.2:3000/vagas/1',
			'http://10.0.0.5/x',
			'javascript:alert(1)',
		]) {
			const text = jobShareText({ ...JOB, applyLink, postLink: 'http://127.0.0.1:3000/' })

			expect(text).not.toContain(applyLink)
			expect(text).not.toContain('127.0.0.1')
			// Sem o link, a candidatura cai no e-mail
			expect(text).toContain('envie o currículo para vagas@lojaazul.com.br')
		}
	})
})

describe('jobShareSubject', () => {
	test('cargo — empresa; sem empresa, só o cargo', () => {
		expect(jobShareSubject(JOB)).toBe('Desenvolvedor Front-end React — Loja Azul')
		expect(jobShareSubject({ title: 'Analista de Dados', company: null })).toBe('Analista de Dados')
		expect(jobShareSubject({ title: null, company: null })).toBe('Vaga')
	})
})

/** As opções da imagem como a modal abre: QR code e tecnologias ligados. */
const ALL: ShareCardOptions = { qr: true, skills: true, description: true }

describe('jobShareCard', () => {
	test('vaga completa: os dados do card e o QR para a candidatura', () => {
		expect(jobShareCard(JOB, ALL)).toEqual({
			title: 'Desenvolvedor Front-end React',
			company: 'Loja Azul',
			contractTypes: 'CLT',
			workMode: { value: 'hibrido', label: 'Híbrido' },
			location: 'Belo Horizonte, MG',
			skills: ['React', 'TypeScript', 'Next.js'],
			moreSkills: 0,
			description:
				'Estamos contratando!\n\nA Loja Azul procura uma pessoa desenvolvedora front-end para o time de e-commerce.\nInscreva-se:',
			postedAt: 'publicada em 27/10/2026',
			qr: { link: 'https://lojaazul.gupy.io/jobs/8123456', caption: 'Candidate-se' },
		})
	})

	test('sem empresa, sem regime e sem modalidade: os campos ficam vazios, sem rótulo no lugar', () => {
		const card = jobShareCard({ ...JOB, company: '  ', contractTypes: [], workMode: null, location: null }, ALL)

		expect(card.company).toBeNull()
		expect(card.contractTypes).toBeNull()
		expect(card.workMode).toBeNull()
		expect(card.location).toBeNull()
		expect(card.title).toBe('Desenvolvedor Front-end React')
	})

	test('sem cargo, o título é "Vaga"; dois regimes viram "CLT ou PJ"', () => {
		const card = jobShareCard({ ...JOB, title: null, contractTypes: ['clt', 'pj'] }, ALL)

		expect(card.title).toBe('Vaga')
		expect(card.contractTypes).toBe('CLT ou PJ')
	})

	test('a data do post no horário de Brasília; sem data, nada no lugar', () => {
		// 01:30 UTC do dia 1º ainda é dia 31 em Brasília
		expect(jobShareCard({ ...JOB, postedAt: '2026-11-01T01:30:00.000Z' }, ALL).postedAt).toBe('publicada em 31/10/2026')
		expect(jobShareCard({ ...JOB, postedAt: null }, ALL).postedAt).toBeNull()
	})

	test('sem tecnologias, a lista fica vazia', () => {
		expect(jobShareCard({ ...JOB, necessaryKnowledge: [] }, ALL)).toMatchObject({ skills: [], moreSkills: 0 })
		expect(jobShareCard({ ...JOB, necessaryKnowledge: null }, ALL)).toMatchObject({ skills: [], moreSkills: 0 })
	})

	test('as tecnologias param no mesmo limite do texto e contam as que sobraram', () => {
		const necessaryKnowledge = ['React', 'TypeScript', ' ', 'Next.js', 'Node.js', 'GraphQL', 'Docker', 'AWS']

		expect(jobShareCard({ ...JOB, necessaryKnowledge }, ALL)).toMatchObject({
			skills: ['React', 'TypeScript', 'Next.js', 'Node.js', 'GraphQL'],
			moreSkills: 2,
		})
	})

	test('sem link de candidatura, o QR leva ao post original (o e-mail do recrutador não vira QR)', () => {
		expect(jobShareCard({ ...JOB, applyLink: null }, ALL).qr).toEqual({ link: JOB.postLink!, caption: 'Ver vaga' })
	})

	test('sem nenhum link público, não há QR', () => {
		expect(jobShareCard({ ...JOB, applyLink: null, postLink: null }, ALL).qr).toBeNull()
		expect(jobShareCard({ ...JOB, applyLink: 'http://localhost:3000/vagas/1', postLink: 'http://192.168.1.2/x' }, ALL).qr).toBeNull()
	})

	test('um link local de candidatura dá lugar ao post original', () => {
		expect(jobShareCard({ ...JOB, applyLink: 'http://127.0.0.1:3000/vagas/1' }, ALL).qr?.link).toBe(JOB.postLink!)
	})

	test('com o QR e as tecnologias desligados na modal, os dois somem e o resto fica', () => {
		const card = jobShareCard(JOB, { qr: false, skills: false, description: false })

		expect(card).toMatchObject({
			qr: null,
			skills: [],
			moreSkills: 0,
			description: null,
			title: 'Desenvolvedor Front-end React',
			company: 'Loja Azul',
		})
		expect(jobShareCard(JOB, { ...ALL, skills: false }).qr?.caption).toBe('Candidate-se')
		expect(jobShareCard(JOB, { ...ALL, qr: false }).skills).toHaveLength(3)
		expect(jobShareCard(JOB, { ...ALL, qr: false, skills: false }).description).toStartWith('Estamos contratando!')
	})
})

describe('jobShareCard: descrição', () => {
	test('um texto longo é cortado no fim de uma palavra, com reticências', () => {
		const rawContent = 'Buscamos alguém com experiência em React, testes e acessibilidade. '.repeat(20)
		const description = jobShareCard({ ...JOB, rawContent }, ALL).description!

		expect(description.length).toBeLessThanOrEqual(SHARE_DESCRIPTION_MAX + 1)
		expect(description).toEndWith('…')
		expect(description).not.toMatch(/[\s.,]…$/)
		expect(rawContent).toContain(description.slice(0, -1))
	})

	test('um texto só de links e hashtags (ou vazio) não vira descrição', () => {
		expect(jobShareCard({ ...JOB, rawContent: '#vaga #frontend\nhttps://lojaazul.gupy.io/jobs/1' }, ALL).description).toBeNull()
		expect(jobShareCard({ ...JOB, rawContent: '' }, ALL).description).toBeNull()
	})
})

describe('jobShareFileName', () => {
	test('cargo e empresa, sem acentos nem símbolos', () => {
		expect(jobShareFileName({ title: 'Dev Back-end (Sênior)', company: 'Empresa X' })).toBe('vaga-dev-back-end-senior-empresa-x.png')
		expect(jobShareFileName({ title: 'Desenvolvedor Front-end React', company: null })).toBe(
			'vaga-desenvolvedor-front-end-react.png',
		)
		expect(jobShareFileName({ title: null, company: null })).toBe('vaga.png')
	})

	test('um cargo enorme não passa do limite nem termina em hífen', () => {
		const name = jobShareFileName({ title: 'Analista '.repeat(20), company: 'Loja Azul' })

		expect(name.length).toBeLessThanOrEqual(84)
		expect(name).toMatch(/^vaga-analista-[a-z-]*[a-z]\.png$/)
	})
})
