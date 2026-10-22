import { describe, expect, test } from 'bun:test'

import { encodeCursor, HttpError } from './http'
import { buildJobsFilter, escapeRegExp, JobsQuerySchema, LISTABLE_JOBS, toWebJob } from './jobs-query'

const NOW = new Date('2026-10-10T12:00:00.000Z')

function filterFor(params: Record<string, string>) {
	return buildJobsFilter(JobsQuerySchema.parse(params), NOW).$and
}

describe('JobsQuerySchema', () => {
	test('listas separadas por vírgula e padrões', () => {
		expect(JobsQuerySchema.parse({ workMode: 'remoto, none', skills: 'Vue.js,,TypeScript' })).toMatchObject({
			workMode: ['remoto', 'none'],
			skills: ['Vue.js', 'TypeScript'],
			since: 'all',
			hasEmail: false,
			limit: 30,
		})
	})

	test('rejeita modalidade, regime e limite inválidos', () => {
		expect(JobsQuerySchema.safeParse({ workMode: 'home office' }).success).toBe(false)
		expect(JobsQuerySchema.safeParse({ contractType: 'temporario' }).success).toBe(false)
		expect(JobsQuerySchema.safeParse({ limit: '500' }).success).toBe(false)
	})
})

describe('buildJobsFilter', () => {
	test('sem filtros, só as vagas que a interface consegue mostrar', () => {
		expect(filterFor({})).toEqual([LISTABLE_JOBS])
	})

	test('"none" vira as vagas sem modalidade', () => {
		expect(filterFor({ workMode: 'remoto,none' })).toContainEqual({ workMode: { $in: ['remoto', null] } })
	})

	test('regime: qualquer um dos escolhidos; "none" inclui vagas sem o campo', () => {
		expect(filterFor({ contractType: 'clt,pj' })).toContainEqual({ $or: [{ contractTypes: { $in: ['clt', 'pj'] } }] })
		expect(filterFor({ contractType: 'pj,none' })).toContainEqual({
			$or: [{ contractTypes: { $in: ['pj'] } }, { contractTypes: null }, { contractTypes: { $size: 0 } }],
		})
		expect(filterFor({ contractType: 'none' })).toContainEqual({ $or: [{ contractTypes: null }, { contractTypes: { $size: 0 } }] })
	})

	test('busca escapa caracteres especiais e procura em cargo, empresa, tecnologias e texto', () => {
		const [, search] = filterFor({ q: 'C++ (sênior)' }) as [unknown, { $or: { title: RegExp }[] }]

		expect(search.$or).toHaveLength(4)
		expect(search.$or[0]!.title.test('Dev C++ (Sênior)')).toBe(true)
	})

	test('tecnologias: todas, palavra inteira, sem diferenciar maiúsculas', () => {
		const [, skills] = filterFor({ skills: 'vue.js' }) as [unknown, { necessaryKnowledge: { $all: RegExp[] } }]
		const [pattern] = skills.necessaryKnowledge.$all

		expect(pattern!.test('Vue.js')).toBe(true)
		expect(pattern!.test('Vue.jsx')).toBe(false)
	})

	test('período, e-mail e idioma', () => {
		const conditions = filterFor({ since: '24h', hasEmail: 'true', language: 'pt' })

		expect(conditions).toContainEqual({ createdAt: { $gte: new Date('2026-10-09T12:00:00.000Z') } })
		expect(conditions).toContainEqual({ recruiterEmail: { $nin: [null, ''] } })
		expect(conditions).toContainEqual({ language: 'pt' })
	})

	test('vistas: "true" só as abertas no site; "false" as não vistas, incluindo as salvas antes do campo', () => {
		expect(filterFor({ viewed: 'true' })).toContainEqual({ viewedAt: { $type: 'date' } })
		expect(filterFor({ viewed: 'false' })).toContainEqual({ viewedAt: null })
		expect(filterFor({})).toEqual([LISTABLE_JOBS])
		expect(JobsQuerySchema.safeParse({ viewed: 'sim' }).success).toBe(false)
	})

	test('cursor: depois do último item (data, com o _id desempatando)', () => {
		const at = new Date('2026-10-09T10:00:00.000Z')
		const cursor = encodeCursor({ at, id: '6ac9a547e4a3ee550b03ecd3' })
		const [, after] = filterFor({ cursor }) as [unknown, { $or: Record<string, unknown>[] }]

		expect(after.$or[0]).toEqual({ createdAt: { $lt: at } })
		expect(String((after.$or[1] as { _id: { $lt: unknown } })._id.$lt)).toBe('6ac9a547e4a3ee550b03ecd3')
	})

	test('cursor que não veio da API vira 400', () => {
		expect(() => filterFor({ cursor: 'lixo' })).toThrow(HttpError)
	})
})

describe('toWebJob', () => {
	// Vaga salva antes do campo `contractTypes` (o documento não o tem): regime não informado
	const doc = {
		postId: 'abc',
		rawContent: 'texto',
		title: null,
		company: null,
		location: null,
		applyLink: null,
		necessaryKnowledge: [],
		recruiterEmail: 'rh@x.com',
		workMode: null,
		postedAt: null,
		author: null,
		language: null,
		sourcePostId: null,
		postLink: null,
		createdAt: NOW,
	}

	test('preenche os campos opcionais com null e lista de tecnologias vazia vira null', () => {
		expect(toWebJob(doc)).toMatchObject({
			title: 'Vaga sem título',
			// Vaga salva antes dos checks da extração
			extractionChecks: [],
			necessaryKnowledge: null,
			contractTypes: null,
			createdAt: NOW.toISOString(),
			correctedAt: null,
			viewedAt: null,
		})
	})

	test('data em que a vaga foi vista', () => {
		expect(toWebJob({ ...doc, viewedAt: NOW }).viewedAt).toBe(NOW.toISOString())
	})

	test('mantém os regimes da vaga', () => {
		expect(toWebJob({ ...doc, contractTypes: ['clt', 'pj'] }).contractTypes).toEqual(['clt', 'pj'])
		expect(toWebJob({ ...doc, contractTypes: [] }).contractTypes).toBeNull()
	})
})

test('escapeRegExp', () => {
	expect(new RegExp(escapeRegExp('a.b*c')).test('a.b*c')).toBe(true)
	expect(new RegExp(escapeRegExp('a.b')).test('axb')).toBe(false)
})
