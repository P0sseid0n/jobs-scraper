import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { Ollama } from 'ollama'

import { createLogger } from '@shared/logging'

import {
	buildMessageRequest,
	messageLanguage,
	messageSubject,
	parseMessageBody,
	requestApplicationMessage,
	validateMessageBody,
} from './application-message'
import { readResumeTex } from './resume/latex-reader'

const { model: cv } = readResumeTex(await Bun.file(path.join(import.meta.dir, './assets/cv.example.tex')).text())

const job = {
	title: 'Desenvolvedor(a) Front-end Pleno',
	company: 'Acme',
	necessaryKnowledge: ['Vue 3', 'TypeScript', 'Pinia'],
	rawContent: 'Vaga para Dev Front-end Pleno com Vue 3, TypeScript e Pinia. Envie o currículo para rh@acme.com',
	language: 'pt',
	recruiterEmail: 'rh@acme.com',
}

// No formato das respostas do modelo (texto do currículo de exemplo)
const goodBody = `Olá! Tudo bem?

Vi a vaga de Desenvolvedor(a) Front-end Pleno na Acme e tenho interesse. Trabalho com Vue.js e TypeScript no dia a dia e, no projeto Painel Exemplo, construí interfaces com foco em performance.

Envio meu currículo em anexo e fico à disposição para conversarmos. Obrigado!`

const log = createLogger('test')

describe('validateMessageBody', () => {
	test('aceita uma mensagem dentro das regras e limpa os espaços', () => {
		const result = validateMessageBody(`  ${goodBody.replace('Tudo bem?', 'Tudo   bem?')}\n\n\n`, cv, job)

		expect(result.rejected).toBeNull()
		expect(result.body).toBe(goodBody)
	})

	test('tira o assunto repetido na primeira linha', () => {
		expect(validateMessageBody(`Assunto: Candidatura – Dev\n\n${goodBody}`, cv, job).body).toBe(goodBody)
	})

	test('pode citar as tecnologias da vaga, mesmo as que o currículo não tinha', () => {
		expect(validateMessageBody(goodBody.replace('Vue.js e TypeScript', 'Vue 3, TypeScript e Pinia'), cv, job).rejected).toBeNull()
	})

	test('rejeita tecnologia que não está no currículo nem na vaga', () => {
		const result = validateMessageBody(goodBody.replace('Vue.js e TypeScript', 'Vue.js, Angular e Kubernetes'), cv, job)

		expect(result.rejected).toContain('Angular, Kubernetes')
	})

	test('rejeita competência da vaga que a pessoa não tem, em qualquer área', () => {
		const body = goodBody.replace('Vue.js e TypeScript', 'Vue.js, copywriting e Excel avançado')
		const result = validateMessageBody(body, cv, job, ['Copywriting', 'Excel avançado', 'HubSpot'])

		expect(result.rejected).toBe('it mentions skills the person does not have: Copywriting, Excel avançado')
	})

	test('"express" como verbo não é a tecnologia Express', () => {
		const english = `Hello,

I want to express how glad I was to see the Front-end Developer position at Acme. I work with Vue.js and TypeScript, and in the Painel Exemplo project I built fast interfaces.

My résumé is attached and I am available to talk. Thank you!`

		expect(validateMessageBody(english, cv, { necessaryKnowledge: ['Vue'] }).rejected).toBeNull()
	})

	test('rejeita placeholders, markdown, anos de experiência e tamanho fora do limite', () => {
		expect(validateMessageBody(goodBody.replace('Obrigado!', 'Obrigado! [Seu nome]'), cv, job).rejected).toContain('placeholder')
		expect(validateMessageBody(goodBody.replace('Vue.js e TypeScript', '**Vue.js** e TypeScript'), cv, job).rejected).toContain(
			'markdown',
		)
		expect(validateMessageBody(goodBody.replace('Trabalho com', 'Tenho 5 anos de experiência com'), cv, job).rejected).toContain(
			'years',
		)
		expect(validateMessageBody('Olá! Tenho interesse na vaga.', cv, job).rejected).toContain('length')
		expect(validateMessageBody(goodBody.repeat(3), cv, job).rejected).toContain('length')
		expect(validateMessageBody(null, cv, job).rejected).toContain('empty')
	})

	test('rejeita clichês em qualquer idioma, citando quais', () => {
		const body = goodBody
			.replace('e tenho interesse', 'e venho manifestar meu interesse')
			.replace('com foco em performance', 'para agregar valor')

		expect(validateMessageBody(body, cv, job).rejected).toBe('it uses clichés: "manifestar meu interesse", "agregar valor"')
	})

	test('a mensagem curta tem limite menor', () => {
		const short =
			'Olá! Tudo bem?\n\nVi a vaga de Front-end Pleno na Acme. Trabalho com Vue.js e TypeScript e envio meu currículo em anexo. Obrigado!'

		expect(validateMessageBody(short, cv, job, [], 'short').rejected).toBeNull()
		expect(validateMessageBody(short, cv, job).rejected).toContain('length')
		expect(validateMessageBody(goodBody.repeat(2), cv, job, [], 'short').rejected).toContain('outside 80-450')
	})
})

describe('pedido à IA', () => {
	test('idioma do post: inglês só quando o post é em inglês', () => {
		expect(messageLanguage('en')).toBe('en')
		expect(messageLanguage('pt')).toBe('pt')
		expect(messageLanguage(null)).toBe('pt')
	})

	test('assunto fixo com o cargo', () => {
		expect(messageSubject('Dev Vue', 'pt')).toBe('Candidatura – Dev Vue')
		expect(messageSubject('Vue Developer', 'en')).toBe('Application – Vue Developer')
		expect(messageSubject(null, 'pt')).toBe('Candidatura – a vaga')
	})

	test('manda a vaga, o currículo ajustado e o idioma', () => {
		const { messages, format } = buildMessageRequest(cv, job, 'pt')
		const content = messages.at(-1)?.content ?? ''

		expect(content).toContain('## Message language\nBrazilian Portuguese')
		expect(content).toContain('Company: Acme')
		expect(content).toContain('Painel Exemplo')
		expect(format.required).toEqual(['body'])
	})

	test('não supõe que a pessoa é dev e manda o perfil e o que falta no currículo', () => {
		const { messages } = buildMessageRequest({ ...cv, projects: [] }, job, 'pt', {
			profile: { area: 'Enfermagem', targetRole: 'Enfermeira UTI' },
			unsupportedSkills: ['Hemodiálise'],
		})

		expect(messages[0]?.content).not.toContain('developer')
		expect(messages.at(-1)?.content).toContain('## Candidate profile\nField: Enfermagem\nTarget role: Enfermeira UTI')
		expect(messages.at(-1)?.content).toEndWith('## Not in the résumé\nHemodiálise')
		expect(messages.at(-1)?.content).not.toContain('Projects:')
	})

	test('manda o tom, o tamanho e a mensagem de exemplo das configurações', () => {
		const { messages, format } = buildMessageRequest(cv, job, 'pt', {
			style: { tone: 'formal', length: 'short', styleSample: 'Oi! Vi a vaga e achei a cara do que faço.' },
		})

		expect(messages[0]?.content).toContain('- Tone formal:')
		// Com exemplo, a saudação é a da pessoa, não a fixa do tom
		expect(messages[0]?.content).not.toContain('"Prezados,"')
		expect(messages[0]?.content).toContain('Open like the sample does ("Oi! Vi a vaga e achei a cara do que faço.")')
		expect(messages[0]?.content).toContain('LinkedIn direct message')
		expect(messages[0]?.content).toContain('"agregar valor"')
		expect(messages.at(-1)?.content).toContain('## Writing sample\n')
		expect(messages.at(-1)?.content).toContain('Oi! Vi a vaga e achei a cara do que faço.')
		expect(format.required).toEqual(['body'])
	})

	test('no tom automático, a IA escolhe e devolve o tom', () => {
		const { messages, format } = buildMessageRequest(cv, job, 'pt', { style: { tone: 'auto', length: 'medium', styleSample: '' } })

		expect(messages[0]?.content).toContain('Choose the tone that fits the job post')
		expect(messages.at(-1)?.content).not.toContain('Writing sample')
		expect(format.required).toEqual(['tone', 'body'])
	})

	test('lê o corpo da resposta, ou null se não for o JSON esperado', () => {
		expect(parseMessageBody(JSON.stringify({ body: 'Olá' }))).toBe('Olá')
		expect(parseMessageBody('não é json')).toBeNull()
		expect(parseMessageBody('{"texto": "Olá"}')).toBeNull()
	})
})

describe('requestApplicationMessage', () => {
	/** Simula o Ollama devolvendo as respostas na ordem. */
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

	test('devolve o assunto e o corpo quando a resposta passa nas validações', async () => {
		const { ollama } = fakeOllama(goodBody)

		expect(await requestApplicationMessage({ ollama, model: 'm' }, cv, job, {}, log)).toEqual({
			subject: 'Candidatura – Desenvolvedor(a) Front-end Pleno',
			body: goodBody,
			tone: 'neutral',
			length: 'medium',
		})
	})

	test('no tom automático, guarda o tom escolhido pela IA (neutro se vier outro)', async () => {
		const style = { tone: 'auto', length: 'medium', styleSample: '' } as const
		const reply = (tone: string) =>
			({ chat: async () => ({ message: { content: JSON.stringify({ tone, body: goodBody }) } }) }) as unknown as Ollama

		expect((await requestApplicationMessage({ ollama: reply('casual'), model: 'm' }, cv, job, { style }, log))?.tone).toBe('casual')
		expect((await requestApplicationMessage({ ollama: reply('chique'), model: 'm' }, cv, job, { style }, log))?.tone).toBe('neutral')
	})

	test('o "[Nome]" que o modelo põe vira o nome com que a pessoa se apresenta no exemplo', async () => {
		const style = { tone: 'neutral', length: 'medium', styleSample: 'Olá! Me chamo Matheus e quero a vaga.' } as const
		const { ollama } = fakeOllama(goodBody.replace('Olá! Tudo bem?', 'Olá! Me chamo [Nome].'))

		expect((await requestApplicationMessage({ ollama, model: 'm' }, cv, job, { style }, log))?.body).toStartWith(
			'Olá! Me chamo Matheus.',
		)
	})

	test('pede outra versão uma vez quando a primeira é rejeitada', async () => {
		const { ollama, calls } = fakeOllama(goodBody.replace('Obrigado!', 'Obrigado! [Seu nome]'), goodBody)

		expect((await requestApplicationMessage({ ollama, model: 'm' }, cv, job, {}, log))?.body).toBe(goodBody)
		expect(calls).toHaveLength(2)
	})

	test('null (modelo padrão) quando as duas versões são rejeitadas ou a IA falha', async () => {
		const rejected = goodBody.replace('Trabalho com', 'Tenho 5 anos de experiência com')

		expect(
			await requestApplicationMessage({ ollama: fakeOllama(rejected, rejected).ollama, model: 'm' }, cv, job, {}, log),
		).toBeNull()
		expect(
			await requestApplicationMessage({ ollama: fakeOllama(new Error('timeout')).ollama, model: 'm' }, cv, job, {}, log),
		).toBeNull()
	})
})
