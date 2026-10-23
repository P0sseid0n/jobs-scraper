import { expect, test } from 'bun:test'
import { ZodError } from 'zod'

import { CV_BASE_TIMEOUT_ERROR, parseNewVersion, toWebCvBaseVersion } from './cv-base'
import { CV_TIMEOUT_MS } from './cv-request.model'
import { fieldErrors, HttpError } from './http'

const createdAt = new Date('2026-10-22T12:00:00.000Z')
const doc = {
	versionId: 'v1',
	size: 9000,
	fileName: 'cv.tex',
	status: 'validating' as const,
	problems: [],
	pages: null,
	createdAt,
	validatedAt: null,
	activatedAt: null,
	expiresAt: new Date('2026-10-29T12:00:00.000Z'),
}

test('versão validando dentro do prazo continua validando', () => {
	expect(toWebCvBaseVersion(doc, new Date(createdAt.getTime() + 60_000)).status).toBe('validating')
})

test('sem resposta do cv-updater no prazo, aparece como recusada com o motivo', () => {
	const version = toWebCvBaseVersion(doc, new Date(createdAt.getTime() + CV_TIMEOUT_MS + 1))

	expect(version).toMatchObject({ status: 'invalid', errors: [CV_BASE_TIMEOUT_ERROR], createdAt: createdAt.toISOString() })
})

test('os problemas da validação vão como erros da versão', () => {
	const version = toWebCvBaseVersion({ ...doc, status: 'invalid', problems: ['Falta a seção \\section*{Projetos}.'] })

	expect(version.errors).toEqual(['Falta a seção \\section*{Projetos}.'])
})

test('versão do formulário: gera o .tex e guarda os dados', () => {
	const form = {
		contact: { name: 'Maria', headline: '', location: '', email: '', phone: '', links: [] },
		sections: [{ kind: 'education' as const, entries: [{ course: 'Enfermagem', institution: 'Universidade', period: '2018' }] }],
	}
	const version = parseNewVersion({ form })

	expect(version.fileName).toBeNull()
	expect(version.form).toEqual(form)
	expect(version.tex).toContain('\\textbf{Universidade} - Enfermagem \\hfill 2018')
	expect(toWebCvBaseVersion({ ...doc, fileName: null, fromForm: true }).fromForm).toBe(true)
})

test('versão do formulário inválida aponta o campo', () => {
	const form = { contact: { name: ' ', headline: '', location: '', email: '', phone: '', links: [] }, sections: [] }

	try {
		parseNewVersion({ form })
		throw new Error('deveria recusar')
	} catch (error) {
		expect(error).toBeInstanceOf(ZodError)
		expect(fieldErrors(error as ZodError)).toEqual({ 'form.contact.name': 'Preencha o nome' })
	}
})

test('versão do formulário grande demais é recusada', () => {
	const bullets = Array.from({ length: 20 }, () => 'x'.repeat(500))
	const entries = Array.from({ length: 20 }, () => ({ role: 'Cargo', company: 'Empresa', period: '2020', bullets }))
	const form = {
		contact: { name: 'Maria', headline: '', location: '', email: '', phone: '', links: [] },
		sections: [{ kind: 'experience', entries }],
	}

	expect(() => parseNewVersion({ form })).toThrow(HttpError)
})

test('versão enviada como .tex não tem dados do formulário', () => {
	expect(parseNewVersion({ tex: '\\documentclass{article}', fileName: 'cv.tex' })).toEqual({
		tex: '\\documentclass{article}',
		fileName: 'cv.tex',
		form: null,
	})
	expect(toWebCvBaseVersion(doc).fromForm).toBe(false)
})
