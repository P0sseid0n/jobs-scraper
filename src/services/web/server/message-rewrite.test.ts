import { describe, expect, test } from 'bun:test'
import type { Ollama } from 'ollama'

import { createLogger } from '@shared/logging'

import { buildRewriteRequest, requestRewrite, validateRewrite } from './message-rewrite'

const job = {
	title: 'Desenvolvedor(a) Front-end Pleno',
	company: 'Acme',
	necessaryKnowledge: ['Vue 3', 'TypeScript', 'Pinia'],
	rawContent: 'Vaga para Dev Front-end Pleno com Vue 3, TypeScript e Pinia na Acme. Envie o currículo para rh@acme.com',
	language: 'pt',
}

// O modelo da pessoa preenchido para a vaga
const message = `Olá! Tudo bem?

Vi a vaga de Desenvolvedor(a) Front-end Pleno na Acme e tenho interesse. Trabalho com Vue.js e TypeScript no dia a dia e, no projeto Painel Exemplo, construí interfaces com foco em performance.

Envio meu currículo em anexo e fico à disposição para conversarmos. Obrigado!`

const formalBody = `Prezados,

Vi a vaga de Desenvolvedor(a) Front-end Pleno na Acme. Trabalho com Vue.js e TypeScript e, no projeto Painel Exemplo, construí interfaces com foco em performance.

Envio meu currículo em anexo e fico à disposição para conversar. Agradeço a atenção.`

const log = createLogger('test')

describe('buildRewriteRequest', () => {
	test('manda a mensagem atual, a vaga e o estilo pedido', () => {
		const { messages } = buildRewriteRequest(message, job, 'pt', { tone: 'formal', length: 'short', direct: true })

		expect(messages[0]?.content).toContain('- Tone formal:')
		expect(messages[0]?.content).toContain('LinkedIn direct message')
		expect(messages[0]?.content).toContain('Make it more direct')
		expect(messages.at(-1)?.content).toContain(`## Current message\n${message}`)
		expect(messages.at(-1)?.content).toContain('Required skills: Vue 3, TypeScript, Pinia')
	})

	test('sem "mais direta", a regra não vai', () => {
		const { messages } = buildRewriteRequest(message, job, 'en', { tone: 'casual', length: 'medium', direct: false })

		expect(messages[0]?.content).not.toContain('more direct')
		expect(messages.at(-1)?.content).toStartWith('## Message language\nEnglish')
	})
})

describe('validateRewrite', () => {
	test('aceita a versão com os mesmos fatos em outro tom', () => {
		expect(validateRewrite(formalBody, message, job, 'medium')).toEqual({ body: formalBody, rejected: null })
	})

	test('pode citar o que está na vaga, mas não inventar tecnologia', () => {
		expect(
			validateRewrite(formalBody.replace('Vue.js e TypeScript', 'Vue.js, TypeScript e Pinia'), message, job, 'medium').rejected,
		).toBeNull()
		expect(
			validateRewrite(formalBody.replace('Vue.js e TypeScript', 'Vue.js, TypeScript e Kubernetes'), message, job, 'medium')
				.rejected,
		).toBe('it adds names that are not in the current message or the job: Kubernetes')
	})

	test('as regras de qualquer mensagem também valem (clichês, tamanho)', () => {
		expect(
			validateRewrite(formalBody.replace('e fico à disposição', 'para agregar valor e fico à disposição'), message, job, 'medium')
				.rejected,
		).toBe('it uses clichés: "agregar valor"')
		expect(validateRewrite(formalBody.repeat(2), message, job, 'short').rejected).toContain('length')
	})

	test('mantém os links do texto de antes (as variáveis de link do modelo)', () => {
		const withLink = `${message} Portfólio: https://carla.dev/projetos.`
		const kept = `${formalBody} Portfólio: https://carla.dev/projetos`

		expect(validateRewrite(kept, withLink, job, 'medium').rejected).toBeNull()
		expect(validateRewrite(formalBody, withLink, job, 'medium').rejected).toBe(
			'it drops or changes links of the current message: https://carla.dev/projetos',
		)
	})

	test('os anos de experiência só passam se a pessoa já os tinha escrito', () => {
		const years = formalBody.replace('Trabalho com', 'Há 3 anos trabalho com')

		expect(validateRewrite(years, message, job, 'medium').rejected).toBe('it claims years of experience')
		expect(validateRewrite(years, `${message} Tenho 3 anos de experiência.`, job, 'medium').rejected).toBeNull()
	})
})

describe('requestRewrite', () => {
	function fakeOllama(...bodies: (string | Error)[]) {
		const calls: unknown[] = []
		const ollama = {
			chat: async (request: unknown) => {
				calls.push(request)
				const next = bodies.shift()
				if (next instanceof Error) throw next
				return { message: { content: JSON.stringify({ body: next }) } }
			},
		} as unknown as Ollama

		return { ollama, calls }
	}

	const style = { tone: 'formal', length: 'medium', direct: false } as const

	test('devolve o texto reescrito', async () => {
		const { ollama } = fakeOllama(formalBody)

		expect(await requestRewrite({ ollama, model: 'm' }, message, job, style, log)).toBe(formalBody)
	})

	test('pede outra versão quando recusa; null se todas forem recusadas ou a IA falhar', async () => {
		const invented = formalBody.replace('Vue.js', 'Angular')
		const retried = fakeOllama(invented, formalBody)

		expect(await requestRewrite({ ollama: retried.ollama, model: 'm' }, message, job, style, log)).toBe(formalBody)
		expect(retried.calls).toHaveLength(2)
		expect(
			await requestRewrite({ ollama: fakeOllama(invented, invented, invented).ollama, model: 'm' }, message, job, style, log),
		).toBeNull()
		expect(
			await requestRewrite({ ollama: fakeOllama(new Error('timeout')).ollama, model: 'm' }, message, job, style, log),
		).toBeNull()
	})
})
