import { describe, expect, test } from 'bun:test'

import {
	BUILT_IN_VARIABLES,
	DEFAULT_TEMPLATE,
	fillTemplate,
	templateMessage,
	templateParts,
	templateTokens,
	templateValues,
	unresolvedMissing,
	type OwnVariable,
	type TemplateJob,
} from './message-template'

/** Uma vaga com todos os dados, como sai do post-processing. */
const JOB: TemplateJob = {
	title: 'Analista de Marketing Digital',
	company: 'Loja Azul',
	location: 'Belo Horizonte, MG',
	workMode: 'hibrido',
	necessaryKnowledge: ['Google Ads', 'SEO', 'Excel'],
	applyLink: 'https://lojaazul.com.br/vagas/42',
	postLink: 'https://www.linkedin.com/feed/update/urn:li:activity:1/',
	author: 'Ana Souza',
}

const PROFILE = { area: 'Marketing', targetRole: 'Analista de Marketing' }

const OWN: OwnVariable[] = [
	{ name: 'meu_nome', description: 'Seu nome', type: 'text', value: 'Carla Lima' },
	{ name: 'link_linkedin', description: 'Link do LinkedIn', type: 'link', value: 'https://linkedin.com/in/carla' },
]

describe('fillTemplate', () => {
	test('preenche todas as variáveis prontas', () => {
		const template = BUILT_IN_VARIABLES.map(variable => `${variable.name}={{${variable.name}}}`).join('\n')

		expect(fillTemplate(template, templateValues(JOB, PROFILE, [])).text).toBe(
			[
				'cargo=Analista de Marketing Digital',
				'empresa=Loja Azul',
				'local=Belo Horizonte, MG',
				'modalidade=híbrido',
				'tecnologias=Google Ads, SEO, Excel',
				'link_da_vaga=https://lojaazul.com.br/vagas/42',
				'autor_do_post=Ana Souza',
				'area=Marketing',
				'cargo_alvo=Analista de Marketing',
			].join('\n'),
		)
	})

	test('as variáveis próprias, de texto e de link (o link sai como a URL)', () => {
		const result = fillTemplate('Sou {{meu_nome}}. Perfil: {{link_linkedin}}', templateValues(JOB, PROFILE, OWN))

		expect(result).toEqual({ text: 'Sou Carla Lima. Perfil: https://linkedin.com/in/carla', fallbacks: [], missing: [] })
	})

	test('sem link de candidatura, o link da vaga é o do post', () => {
		const values = templateValues({ ...JOB, applyLink: null }, PROFILE, [])

		expect(fillTemplate('{{link_da_vaga}}', values).text).toBe(JOB.postLink!)
	})

	test('valor ausente sem fallback: fica marcado e entra em missing', () => {
		const values = templateValues({ ...JOB, company: null, location: '' }, PROFILE, [])

		expect(fillTemplate('Vaga na {{empresa}} ({{local}}), {{empresa}}', values)).toEqual({
			text: 'Vaga na [empresa] ([local]), [empresa]',
			fallbacks: [],
			missing: ['empresa', 'local'],
		})
	})

	test('valor ausente com o fallback das configurações', () => {
		const values = templateValues({ ...JOB, company: null }, PROFILE, [])

		expect(fillTemplate('Quero trabalhar na {{empresa}}.', values, { empresa: 'a sua empresa' })).toEqual({
			text: 'Quero trabalhar na a sua empresa.',
			fallbacks: ['empresa'],
			missing: [],
		})
	})

	test('o fallback escrito na variável vale mais que o das configurações', () => {
		const values = templateValues({ ...JOB, company: null }, PROFILE, [])

		expect(fillTemplate('{{empresa | sua equipe}}', values, { empresa: 'a sua empresa' })).toEqual({
			text: 'sua equipe',
			fallbacks: ['empresa'],
			missing: [],
		})
	})

	test('com o valor, o fallback não entra', () => {
		expect(fillTemplate('{{empresa | sua equipe}}', templateValues(JOB, PROFILE, []), { empresa: 'x' })).toEqual({
			text: 'Loja Azul',
			fallbacks: [],
			missing: [],
		})
	})

	test('aceita espaços dentro das chaves', () => {
		expect(fillTemplate('{{ empresa }} e {{  cargo|x  }}', templateValues(JOB, PROFILE, [])).text).toBe(
			'Loja Azul e Analista de Marketing Digital',
		)
	})

	test('texto sem variáveis fica igual', () => {
		const text = 'Olá! Envio meu currículo.\n\nObrigado!'

		expect(fillTemplate(text, templateValues(JOB, PROFILE, []))).toEqual({ text, fallbacks: [], missing: [] })
	})

	test('um {{ sem fechar fica no texto como está', () => {
		expect(fillTemplate('Vaga {{cargo na {{empresa}}', templateValues(JOB, PROFILE, [])).text).toBe('Vaga {{cargo na Loja Azul')
		expect(fillTemplate('fim {{', templateValues(JOB, PROFILE, [])).text).toBe('fim {{')
	})

	test('variável desconhecida fica no texto como está', () => {
		expect(fillTemplate('{{nao_existe}} {{cargo}}', templateValues(JOB, PROFILE, [])).text).toBe(
			'{{nao_existe}} Analista de Marketing Digital',
		)
	})
})

describe('templateParts', () => {
	test('separa o texto, os valores, os fallbacks e o que faltou', () => {
		const values = templateValues({ ...JOB, company: null, location: null }, PROFILE, [])

		expect(templateParts('Oi {{cargo}}, {{empresa}} em {{local}}!', values, { empresa: 'sua empresa' })).toEqual([
			{ kind: 'text', text: 'Oi ' },
			{ kind: 'value', text: 'Analista de Marketing Digital', name: 'cargo' },
			{ kind: 'text', text: ', ' },
			{ kind: 'fallback', text: 'sua empresa', name: 'empresa' },
			{ kind: 'text', text: ' em ' },
			{ kind: 'missing', text: '[local]', name: 'local' },
			{ kind: 'text', text: '!' },
		])
	})
})

describe('templateTokens', () => {
	test('o nome e o fallback, sem os espaços das pontas', () => {
		expect(templateTokens('a {{ empresa | a sua empresa }} b {{cargo}}')).toEqual([
			{ name: 'empresa', fallback: 'a sua empresa', start: 2, end: 31 },
			{ name: 'cargo', fallback: null, start: 34, end: 43 },
		])
	})
})

describe('templateMessage', () => {
	test('o modelo padrão preenchido é a mensagem fixa de antes', () => {
		const settings = { template: DEFAULT_TEMPLATE, fallbacks: {}, variables: [] }

		expect(templateMessage(settings, JOB, PROFILE)).toEqual({
			subject: 'Candidatura – Analista de Marketing Digital',
			body: 'Olá! Tudo bem?\n\nVi a publicação sobre Analista de Marketing Digital no LinkedIn e tenho interesse na oportunidade.\nEnvio em anexo meu currículo e fico à disposição para conversarmos.\n\nObrigado!',
			fallbacks: [],
			missing: [],
		})
	})

	test('junta o que usou fallback e o que faltou no assunto e na mensagem', () => {
		const settings = {
			template: { subject: '{{cargo}} – {{empresa}}', body: '{{empresa}} em {{local}}, {{modalidade}}' },
			fallbacks: { local: 'sua cidade' },
			variables: [],
		}
		const result = templateMessage(settings, { ...JOB, company: null, location: null, workMode: null }, PROFILE)

		expect(result.fallbacks).toEqual(['local'])
		expect(result.missing).toEqual(['empresa', 'modalidade'])
	})
})

describe('unresolvedMissing', () => {
	test('só as marcas que ainda estão no texto', () => {
		expect(unresolvedMissing(['empresa', 'local'], 'Vaga na [empresa]', 'em Belo Horizonte')).toEqual(['empresa'])
		expect(unresolvedMissing(['empresa'], 'Vaga na Loja Azul')).toEqual([])
	})
})
