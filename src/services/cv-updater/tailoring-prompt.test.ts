import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { readResumeTex } from './resume/latex-reader'
import { buildRetryMessage, buildTailoringRequest } from './tailoring-prompt'

const { model: cv } = readResumeTex(await Bun.file(path.join(import.meta.dir, './assets/cv.example.tex')).text())

const job = {
	title: 'Dev Front-end',
	company: 'Acme',
	necessary_knowledge: ['Vue 3', 'TypeScript', 'CSS3/SCSS', 'Angular', 'REST APIs'],
	rawContent: 'Vaga',
}

describe('prompt', () => {
	test('lista as techs a adicionar e restringe as categorias às do currículo', () => {
		const { messages, format, toAdd } = buildTailoringRequest(cv, job)

		expect(toAdd).toEqual(['Angular'])
		expect(messages.at(-1)?.content).toContain('## Skills to add\nAngular')
		expect(JSON.stringify(format)).toContain('"Ferramentas & DevOps"')
		expect(JSON.stringify(format)).toContain('"skip"')
	})

	test('pede nova versão com o motivo da rejeição', () => {
		expect(buildRetryMessage('tamanho 600').content).toContain('Your summary was rejected: tamanho 600')
	})
})
