import { describe, expect, test } from 'bun:test'

import { checkPostLanguage } from './post-language'

const PORTUGUESE = `🚀 Estamos contratando! Vaga para Desenvolvedor Front-end Pleno na nossa equipe de produto.
Você vai trabalhar com Vue.js, TypeScript e Pinia, criando interfaces acessíveis e testadas.
Requisitos: experiência com APIs REST, Git e testes unitários. Diferenciais: Nuxt e Tailwind.
Modelo híbrido em São Paulo, contratação CLT. Envie seu currículo para vagas@empresa.com.br #vagas #frontend`

const PORTUGUESE_WITH_ENGLISH_TERMS = `Hiring! Front-end Developer Sênior para squad de pagamentos. Stack: Vue 3, Nuxt, Pinia,
Tailwind, Vitest e Storybook. Modelo híbrido em São Paulo, com dois dias no escritório por semana.
Requisitos: experiência com REST APIs, CI/CD e boas práticas de acessibilidade. Interessados podem mandar
o CV para talent@acme.io com o assunto "Front-end Sênior".`

const ENGLISH = `🚀 We're hiring a Senior Frontend Engineer to join our remote team in Europe. You will build
modern, scalable and accessible interfaces with Vue.js and TypeScript, working closely with designers and
backend engineers. Requirements: 5+ years of experience, strong testing skills and good communication.
Apply at https://acme.io/jobs/123 #hiring #vuejs`

describe('checkPostLanguage', () => {
	test('aceita post em português', () => {
		expect(checkPostLanguage(PORTUGUESE, ['pt'])).toEqual({ language: 'pt', rejection: null })
	})

	test('termos técnicos em inglês não mudam o idioma de um post em português', () => {
		expect(checkPostLanguage(PORTUGUESE_WITH_ENGLISH_TERMS, ['pt'])).toEqual({ language: 'pt', rejection: null })
	})

	test('descarta post em idioma fora dos aceitos', () => {
		expect(checkPostLanguage(ENGLISH, ['pt'])).toEqual({ language: 'en', rejection: 'idioma en fora dos aceitos (pt)' })
	})

	test('lista vazia aceita qualquer idioma', () => {
		expect(checkPostLanguage(ENGLISH, []).rejection).toBeNull()
		expect(checkPostLanguage(ENGLISH, ['pt', 'en']).rejection).toBeNull()
	})

	test('texto curto demais (ignorando links, e-mails e hashtags) fica sem idioma e segue', () => {
		const short = 'Vaga Dev Vue | Remoto | PJ https://acme.io/jobs/123 vagas@acme.io #vagas #vue #frontend'

		expect(checkPostLanguage(short, ['pt'])).toEqual({ language: null, rejection: null })
	})

	test('idioma aceito que o detector não conhece: não descarta', () => {
		expect(checkPostLanguage(ENGLISH, ['ja']).rejection).toBeNull()
	})
})
