import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { readResumeTex } from '../resume/latex-reader'
import type { ResumeContent } from '../resume/resume.types'
import {
	matchJobSkills,
	mentionsSkill,
	missingJobSkills,
	normalizeSkill,
	skillAliases,
	skillsToAdd,
	unsupportedJobSkills,
} from './skill-matching'

const { model: cv } = readResumeTex(await Bun.file(path.join(import.meta.dir, '../assets/cv.example.tex')).text())
const { model: nursing } = readResumeTex(await Bun.file(path.join(import.meta.dir, '../assets/cv.neutral.example.tex')).text())

const marketing: ResumeContent = {
	summary: 'Analista de marketing digital com foco em aquisição.',
	skills: [
		{ category: 'Marketing digital', items: ['Tráfego pago (Google Ads, Meta Ads)', 'SEO', 'Atendimento humanizado ao cliente'] },
		{ category: 'Ferramentas', items: ['Google Analytics', 'RD Station', 'Pacote Office'] },
	],
	projects: [],
	experience: [{ header: 'Agência Exemplo', bullets: ['Gestão de campanhas de tráfego pago para e-commerce.'] }],
	otherSections: [],
	fullText: 'Gestão de campanhas de tráfego pago para e-commerce.',
}

const job = {
	title: 'Dev Front-end',
	company: 'Acme',
	necessaryKnowledge: ['Vue 3', 'TypeScript', 'CSS3/SCSS', 'Angular', 'REST APIs'],
	rawContent: 'Vaga',
}

describe('associação de habilidades', () => {
	test('normaliza versões, ".js" e acentos', () => {
		expect(normalizeSkill('Vue 3')).toBe('vue')
		expect(normalizeSkill('Vue.js')).toBe('vue')
		expect(normalizeSkill('Node.JS')).toBe('node')
		expect(normalizeSkill('ReactJS')).toBe('react')
		expect(normalizeSkill('NestJS')).toBe('nest')
		expect(normalizeSkill('JavaScript ES6+')).toBe('javascript')
		expect(normalizeSkill('C#')).toBe('c#')
	})

	test('itens compostos geram vários nomes', () => {
		expect([...skillAliases('CSS (SASS/SCSS)')]).toEqual(expect.arrayContaining(['css', 'sass', 'scss']))
		expect([...skillAliases('JavaScript / TypeScript')]).toEqual(expect.arrayContaining(['javascript', 'typescript']))
	})

	test('associa as tecnologias da vaga (inclusive compostas) aos itens do currículo', () => {
		expect(matchJobSkills(cv, job.necessaryKnowledge)).toEqual(['Vue.js', 'JavaScript / TypeScript', 'CSS (SASS/SCSS)'])
	})

	test('detecta o que a vaga pede e não está em nenhum lugar do currículo', () => {
		// "REST APIs" não é uma habilidade listada, mas aparece na experiência ("APIs REST")
		expect(missingJobSkills(cv, job.necessaryKnowledge)).toEqual(['Angular'])
	})

	test('"Java" não casa com "JavaScript"', () => {
		expect(matchJobSkills(cv, ['Java'])).toEqual([])
	})

	test('o texto do currículo conta palavras inteiras: "Java" e "Go" faltam mesmo com "JavaScript" e "Google"', () => {
		const withGoogle = { ...cv, fullText: `${cv.fullText} Integração com Google GenAI e APIs RESTful.` }

		expect(missingJobSkills(withGoogle, ['Java', 'Go', 'REST'])).toEqual(['Java', 'Go'])
		expect(skillsToAdd(withGoogle, { ...job, necessaryKnowledge: ['Java', 'React'] })).toEqual(['Java'])
	})
})

describe('competências de outras áreas', () => {
	test('casa requisitos com as palavras do item, em qualquer ordem de tamanho', () => {
		const jobSkills = ['Gestão de tráfego pago', 'Atendimento humanizado', 'Excel', 'Meta Ads', 'SEO', 'Pacote Office']

		expect(matchJobSkills(marketing, jobSkills)).toEqual([
			'Tráfego pago (Google Ads, Meta Ads)',
			'Atendimento humanizado ao cliente',
			'SEO',
			'Pacote Office',
		])
	})

	test('aceita o plural e ignora preposições', () => {
		const jobSkills = ['Protocolo de segurança do paciente', 'Ventilação mecânica', 'Tasy', 'Administração de medicamentos']

		expect(matchJobSkills(nursing, jobSkills)).toEqual([
			'protocolos de segurança do paciente',
			'Ventilação mecânica',
			'Prontuário eletrônico (MV, Tasy)',
			'administração de medicamentos',
		])
	})

	test('não inventa competências que faltam no currículo', () => {
		const job = {
			title: 'Analista de Marketing',
			company: null,
			rawContent: 'Vaga',
			necessaryKnowledge: ['Copywriting', 'HubSpot', 'Excel'],
		}

		expect(skillsToAdd(marketing, job)).toEqual([])
		expect(skillsToAdd(nursing, { ...job, necessaryKnowledge: ['Atendimento humanizado', 'COREN ativo'] })).toEqual([])
	})

	test('só adiciona tecnologias do catálogo, com o nome do catálogo', () => {
		const job = {
			title: 'Dev',
			company: null,
			rawContent: 'Vaga',
			necessaryKnowledge: ['Next', 'Storybook', 'Figma', 'Agile/Scrum'],
		}

		expect(skillsToAdd(cv, job)).toEqual(['Next.js', 'Storybook'])
	})
})

describe('requisitos que a pessoa não tem', () => {
	test('são os que faltam no currículo, fora as tecnologias do catálogo (essas entram)', () => {
		const job = {
			title: 'Analista de Marketing',
			company: null,
			rawContent: 'Vaga',
			necessaryKnowledge: ['Gestão de tráfego pago', 'Copywriting', 'Excel avançado', 'SEO', 'Python'],
		}

		expect(unsupportedJobSkills(marketing, job)).toEqual(['Copywriting', 'Excel avançado'])
	})

	test('o texto cita o requisito quando tem todas as palavras dele', () => {
		expect(mentionsSkill('Domínio de Excel avançado e relatórios.', 'Excel avançado')).toBe(true)
		expect(mentionsSkill('Relatórios em Excel.', 'Excel avançado')).toBe(false)
		expect(mentionsSkill('Experiência com protocolos de segurança.', 'Protocolo de segurança')).toBe(true)
	})
})
