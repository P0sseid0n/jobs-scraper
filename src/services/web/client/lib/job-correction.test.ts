import { expect, test } from 'bun:test'

import type { WebJob } from '../../api-types'
import { correctionBody, draftFromJob } from './job-correction'

const job = {
	title: 'Front-end',
	company: null,
	location: 'São Paulo',
	workMode: null,
	contractTypes: ['clt'],
	necessaryKnowledge: null,
	recruiterEmail: 'rh@acme.com',
	applyLink: null,
} as WebJob

test('o rascunho começa com os valores da vaga, com vazio no lugar de null', () => {
	expect(draftFromJob(job)).toEqual({
		title: 'Front-end',
		company: '',
		location: 'São Paulo',
		workMode: null,
		contractTypes: ['clt'],
		necessaryKnowledge: [],
		recruiterEmail: 'rh@acme.com',
		applyLink: '',
	})
})

test('o corpo do PATCH leva só os campos escolhidos', () => {
	const draft = { ...draftFromJob(job), company: 'Acme', location: 'Campinas' }
	expect(correctionBody(draft, ['company', 'workMode'])).toEqual({ company: 'Acme', workMode: null })
})
