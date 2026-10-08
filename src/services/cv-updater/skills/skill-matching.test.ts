import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { readResumeTex } from '../resume/latex-reader'
import { matchJobSkills, missingJobSkills, normalizeSkill, skillAliases } from './skill-matching'

const { model: cv } = readResumeTex(await Bun.file(path.join(import.meta.dir, '../assets/cv.example.tex')).text())

const job = {
	title: 'Dev Front-end',
	company: 'Acme',
	necessary_knowledge: ['Vue 3', 'TypeScript', 'CSS3/SCSS', 'Angular', 'REST APIs'],
	rawContent: 'Vaga',
}

describe('associação de habilidades', () => {
	test('normaliza versões, ".js" e acentos', () => {
		expect(normalizeSkill('Vue 3')).toBe('vue')
		expect(normalizeSkill('Vue.js')).toBe('vue')
		expect(normalizeSkill('Node.JS')).toBe('node')
		expect(normalizeSkill('JavaScript ES6+')).toBe('javascript')
		expect(normalizeSkill('C#')).toBe('c#')
	})

	test('itens compostos geram vários nomes', () => {
		expect([...skillAliases('CSS (SASS/SCSS)')]).toEqual(expect.arrayContaining(['css', 'sass', 'scss']))
		expect([...skillAliases('JavaScript / TypeScript')]).toEqual(expect.arrayContaining(['javascript', 'typescript']))
	})

	test('associa as tecnologias da vaga (inclusive compostas) aos itens do currículo', () => {
		expect(matchJobSkills(cv, job.necessary_knowledge)).toEqual(['Vue.js', 'JavaScript / TypeScript', 'CSS (SASS/SCSS)'])
	})

	test('detecta o que a vaga pede e não está em nenhum lugar do currículo', () => {
		// "REST APIs" não é uma habilidade listada, mas aparece na experiência ("APIs REST")
		expect(missingJobSkills(cv, job.necessary_knowledge)).toEqual(['Angular'])
	})
})
