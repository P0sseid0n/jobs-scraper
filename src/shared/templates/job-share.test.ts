import { describe, expect, test } from 'bun:test'

import { jobShareSubject, jobShareText, type ShareJob } from './job-share'

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
