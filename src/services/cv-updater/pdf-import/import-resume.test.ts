import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { Ollama } from 'ollama'

import { createLogger } from '@shared/logging'

import { importResumePdf } from './import-resume'
import { PdfImportError } from './pdf-text'

const log = createLogger('test')
const neutralPdf = new Uint8Array(await Bun.file(path.join(import.meta.dir, '../assets/cv.neutral.example.pdf')).arrayBuffer())

/** O modelo simulado: devolve as respostas na ordem e guarda os pedidos. */
function fakeAi(...responses: (string | Error)[]) {
	const requests: { messages: { role: string; content: string }[]; options: Record<string, unknown> }[] = []
	const ollama = {
		chat: async (request: (typeof requests)[number]) => {
			requests.push(structuredClone(request))
			const response = responses.shift()
			if (response instanceof Error) throw response
			return { message: { content: response } }
		},
	}
	return { ai: { ollama: ollama as unknown as Ollama, model: 'test' }, requests }
}

const nursing = {
	contact: {
		name: 'Maria Souza',
		headline: 'Enfermeira | COREN-SP 000.000',
		location: 'São Paulo, SP',
		email: 'maria@example.com',
		phone: '(11) 90000-0000',
		links: ['https://linkedin.com/in/maria'],
	},
	summary:
		'Enfermeira com experiência em clínica médica e terapia intensiva. Focada em assistência humanizada, segurança do paciente e trabalho em equipe multiprofissional.',
	skills: [{ category: 'Sistemas', items: ['Prontuário eletrônico (MV, Tasy)', 'Pacote Office'] }],
	experience: [
		{
			role: 'Enfermeira - Clínica Médica',
			company: 'Clínica Exemplo',
			period: 'Janeiro 2019 - Fevereiro 2021',
			bullets: ['Admissão, evolução e alta de pacientes internados.'],
		},
	],
	education: [{ course: 'Bacharelado em Enfermagem', institution: 'Universidade Exemplo', period: '2014 - 2018' }],
	certifications: [{ name: 'Suporte Básico de Vida (BLS)', issuer: '', year: '2022' }],
	languages: [{ language: 'Inglês', level: 'intermediário' }],
	projects: [],
}

describe('importResumePdf', () => {
	test('um currículo de outra área preenche formação e certificações, sem projetos', async () => {
		const { ai, requests } = fakeAi(JSON.stringify(nursing))
		const form = await importResumePdf(ai, neutralPdf, log)

		expect(form.contact.name).toBe('Maria Souza')
		expect(form.sections.map(section => section.kind)).toEqual([
			'summary',
			'skills',
			'experience',
			'education',
			'certifications',
			'languages',
		])
		expect(form.sections.find(section => section.kind === 'certifications')).toEqual({
			kind: 'certifications',
			title: '',
			entries: [{ name: 'Suporte Básico de Vida (BLS)', issuer: '', year: '2022' }],
		})
		// O texto e os links do PDF vão para o modelo, com contexto para o currículo inteiro
		expect(requests[0]?.messages[1]?.content).toContain('Maria Souza\nEnfermeira | COREN-SP 000.000')
		expect(requests[0]?.messages[1]?.content).toContain('## Links in the résumé\nhttps://linkedin.com/in/maria')
		expect(requests[0]?.options.num_ctx).toBe(16_384)
	})

	test('resposta fora do formato ganha mais uma tentativa, com o motivo', async () => {
		const { ai, requests } = fakeAi('{"contact": ', JSON.stringify(nursing))
		const form = await importResumePdf(ai, neutralPdf, log)

		expect(form.contact.name).toBe('Maria Souza')
		expect(requests).toHaveLength(2)
		expect(requests[1]?.messages.at(-1)?.content).toContain('Your answer could not be read: invalid JSON')
	})

	test('duas respostas fora do formato ou a IA fora do ar viram um erro claro', async () => {
		await expect(importResumePdf(fakeAi('nada', '{"skills": "x"}').ai, neutralPdf, log)).rejects.toThrow(
			new PdfImportError('A IA não conseguiu ler o currículo. Tente de novo ou preencha o formulário.'),
		)
		await expect(importResumePdf(fakeAi(new Error('ECONNREFUSED')).ai, neutralPdf, log)).rejects.toThrow(/Ollama está rodando/)
	})

	test('sem experiência nem formação no que ficou, o PDF não é currículo', async () => {
		// O modelo devolveu tudo vazio, ou só coisas que não estão no PDF
		const invented = { ...nursing, experience: [{ role: 'Gerente', company: 'Acme', period: '', bullets: [] }], education: [] }
		await expect(importResumePdf(fakeAi(JSON.stringify(invented)).ai, neutralPdf, log)).rejects.toThrow(/não parece um currículo/)
		await expect(importResumePdf(fakeAi('{}').ai, neutralPdf, log)).rejects.toThrow(/não parece um currículo/)
	})

	test('o PDF que não pode ser lido nem chega ao modelo', async () => {
		const { ai, requests } = fakeAi(JSON.stringify(nursing))
		await expect(importResumePdf(ai, new TextEncoder().encode('oi'), log)).rejects.toThrow(PdfImportError)
		expect(requests).toHaveLength(0)
	})
})
