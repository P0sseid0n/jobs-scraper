import { describe, expect, test } from 'bun:test'

import { relevanceRejection } from './job-relevance'

const filter = { requiredKeywords: ['vue', 'front-end', 'javascript', 'typescript'], excludedKeywords: [] }

describe('relevanceRejection', () => {
	test('aceita vaga que cita uma palavra obrigatória no cargo ou nos conhecimentos', () => {
		expect(relevanceRejection({ title: 'Desenvolvedor Frontend Pleno', necessaryKnowledge: null }, filter)).toBeNull()
		expect(relevanceRejection({ title: 'Dev Pleno', necessaryKnowledge: ['Vue.js', 'Pinia'] }, filter)).toBeNull()
		expect(relevanceRejection({ title: 'Desenvolvedor Front End', necessaryKnowledge: null }, filter)).toBeNull()
	})

	test('descarta vaga sem nenhuma palavra obrigatória', () => {
		const golang = { title: 'Desenvolvedor(a) Pleno (Golang)', necessaryKnowledge: ['Golang', 'Kafka', 'AWS'] }

		expect(relevanceRejection(golang, filter)).toContain('nenhuma das palavras obrigatórias')
	})

	test('palavra excluída descarta mesmo com uma obrigatória', () => {
		const job = { title: 'Desenvolvedor Fullstack', necessaryKnowledge: ['Java', 'Vue.js'] }

		expect(relevanceRejection(job, { ...filter, excludedKeywords: ['java'] })).toBe('cita "java", que está nas palavras excluídas')
	})

	test('exclui .NET em todas as grafias comuns', () => {
		const dotnet = { ...filter, excludedKeywords: ['.net', 'asp.net', 'dotnet'] }

		for (const skill of ['.NET Core', '.NET', 'ASP.NET Core', 'dotnet']) {
			expect(relevanceRejection({ title: 'Dev Front-end', necessaryKnowledge: [skill] }, dotnet)).not.toBeNull()
		}
		expect(relevanceRejection({ title: 'Dev Front-end', necessaryKnowledge: ['Vue.js', 'Node.js'] }, dotnet)).toBeNull()
	})

	test('compara palavras inteiras: "java" não casa com "javascript"', () => {
		const job = { title: 'Desenvolvedor Front-end', necessaryKnowledge: ['JavaScript'] }

		expect(relevanceRejection(job, { requiredKeywords: [], excludedKeywords: ['java'] })).toBeNull()
	})

	test('palavras-chave com mais de uma palavra', () => {
		const job = { title: 'Dev Mobile', necessaryKnowledge: ['React Native'] }

		expect(relevanceRejection(job, { requiredKeywords: ['react native'], excludedKeywords: [] })).toBeNull()
		expect(
			relevanceRejection(
				{ title: 'Dev React', necessaryKnowledge: null },
				{ requiredKeywords: ['react native'], excludedKeywords: [] },
			),
		).not.toBeNull()
	})

	test('listas vazias desligam o filtro', () => {
		expect(
			relevanceRejection({ title: 'Dev Golang', necessaryKnowledge: null }, { requiredKeywords: [], excludedKeywords: [] }),
		).toBeNull()
	})
})
