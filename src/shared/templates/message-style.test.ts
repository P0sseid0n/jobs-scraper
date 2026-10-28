import { describe, expect, test } from 'bun:test'

import {
	cleanMessageBody,
	fillSampleName,
	messageStyleRules,
	messageTextProblem,
	newProperNouns,
	sampleName,
	styleSampleSection,
} from './message-style'

// A mensagem de exemplo de uma pessoa real (links trocados)
const sample = `Olá! Me chamo Matheus e gostaria de me candidatar à vaga Engenheiro de Dados Senior.
Vi a oportunidade no LinkedIn e me interessei bastante.
Segue ele em anexo. Fico à disposição para conversar!

🔗 GitHub: https://github.com/exemplo
💼 LinkedIn: https://linkedin.com/in/exemplo`

// O texto que motivou as regras de estilo, gerado pela IA para uma vaga real (empresa e projeto trocados)
const clicheBody = `Olá! Tudo bem?

Escrevo para manifestar meu interesse na vaga de Engenheiro(a) de Software Sênior na Acme. Minha experiência em Java, React e Next.js, além do projeto Painel Exemplo, me permite contribuir com a construção de soluções inovadoras. Possuo familiaridade com Docker e CI/CD, tecnologias que se alinham com os requisitos da posição.

Estou disponível para discutir como minhas habilidades e experiência podem agregar valor à equipe. Agradeço a atenção.`

describe('messageTextProblem', () => {
	test('aponta todos os clichês do texto', () => {
		expect(messageTextProblem(clicheBody, 'medium')).toBe(
			'it uses clichés: "manifestar meu interesse", "soluções inovadoras", "agregar valor", "se alinham com os requisitos", "me permite contribuir"',
		)
	})

	test('"expressar meu interesse" é o mesmo clichê (a IA trocou o verbo ao reescrever)', () => {
		expect(messageTextProblem(clicheBody.replace('manifestar', 'expressar'), 'medium')).toContain('"manifestar meu interesse"')
	})

	test('clichês em inglês também', () => {
		const body = `Hello,

I am writing to express my strong interest in the Developer role at Acme. I am passionate about clean code and I am a team player who can add value in a fast-paced environment.

My résumé is attached. Thank you!`

		expect(messageTextProblem(body, 'medium')).toBe(
			'it uses clichés: "express my interest", "I am writing to", "passionate about", "add value", "team player", "fast-paced"',
		)
	})

	test('aceita um texto sem clichês, no tamanho certo', () => {
		const body = `Prezados,

Vi a vaga de Engenheiro(a) de Software Sênior na Acme. Trabalho com Java e React, e no projeto Painel Exemplo montei a esteira de CI/CD com Docker.

Envio meu currículo em anexo e fico à disposição para conversar. Agradeço a atenção.`

		expect(messageTextProblem(body, 'medium')).toBeNull()
		expect(messageTextProblem(body, 'short')).toBeNull()
		expect(messageTextProblem(body.repeat(2), 'short')).toBe(`length ${body.repeat(2).length} is outside 80-450 characters`)
	})
})

describe('messageStyleRules', () => {
	test('um tom fixo traz só a regra dele', () => {
		const rules = messageStyleRules('casual', 'medium')

		expect(rules).toStartWith('- Tone casual:')
		expect(rules).toContain('"Oi, pessoal! Tudo bem?"')
		expect(rules).not.toContain('Prezados')
	})

	test('o automático explica os três tons para a IA escolher', () => {
		const rules = messageStyleRules('auto', 'short')

		expect(rules).toContain('return it in "tone"')
		for (const greeting of ['Prezados,', 'Olá! Tudo bem?', 'Oi, pessoal! Tudo bem?']) expect(rules).toContain(greeting)
		expect(rules).toContain('at most 350 characters')
	})
})

describe('mensagem de exemplo', () => {
	test('com exemplo, a abertura e o fechamento vêm dele, não do tom', () => {
		const rules = messageStyleRules('neutral', 'medium', sample)

		expect(rules).toContain(
			'Open like the sample does ("Olá! Me chamo Matheus e gostaria de me candidatar à vaga Engenheiro de Dados Senior.")',
		)
		expect(rules).toContain('Close like the sample does ("Segue ele em anexo. Fico à disposição para conversar!")')
		expect(rules).not.toContain('Greet with')
	})

	test('as linhas com link ficam de fora (a IA copiaria o link)', () => {
		const [section] = styleSampleSection(sample)

		expect(section).toEndWith('Segue ele em anexo. Fico à disposição para conversar!')
		expect(section).not.toContain('https://')
	})

	test('o nome com que a pessoa se apresenta preenche o "[Nome]" do modelo', () => {
		expect(sampleName(sample)).toBe('Matheus')
		expect(sampleName('My name is Ana and I saw the role.')).toBe('Ana')
		expect(fillSampleName('Olá! Me chamo [Nome] e vi a vaga. [Seu nome]', sample)).toBe('Olá! Me chamo Matheus e vi a vaga. Matheus')
		// Sem nome no exemplo, o placeholder fica (e a validação recusa)
		expect(fillSampleName('Me chamo [Nome].', 'Oi! Vi a vaga.')).toBe('Me chamo [Nome].')
	})
})

describe('newProperNouns', () => {
	const previous =
		'Olá! Tudo bem?\n\nVi a vaga de Dev na Acme. Trabalho com Vue.js e TypeScript no projeto Painel Exemplo.\n\nObrigado!'

	test('nomes que já estavam na mensagem ou na vaga, saudações e começos de frase passam', () => {
		const body =
			'Prezados,\n\nVi a vaga de Dev na Acme. No projeto Painel Exemplo, usei Vue.js e TypeScript; também conheço Pinia, citado na vaga.\n\nAgradeço a atenção.'

		expect(newProperNouns(body, [previous, 'Vue 3, Pinia'])).toEqual([])
	})

	test('acusa tecnologias e empresas inventadas, mesmo no começo da frase quando têm maiúscula no meio', () => {
		const body = 'Oi, pessoal! Trabalho com Vue.js e Kubernetes na Globex. GraphQL também faz parte do meu dia a dia.'

		expect(newProperNouns(body, [previous])).toEqual(['Kubernetes', 'Globex', 'GraphQL'])
	})
})

test('cleanMessageBody tira o assunto repetido e os espaços extras', () => {
	expect(cleanMessageBody('Assunto: Candidatura\n\n  Olá!   Tudo bem?\n\n\n\nObrigado!  ')).toBe('Olá! Tudo bem?\n\nObrigado!')
})
