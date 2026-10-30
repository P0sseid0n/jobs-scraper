import { describe, expect, test } from 'bun:test'

import { RemoveBlockedJobsSchema, unblockedCompanies, withBlockedCompany, withoutBlockedCompany } from './blocked-companies'

describe('withBlockedCompany', () => {
	test('acrescenta a empresa como está na vaga', () => {
		expect(withBlockedCompany(['Acme'], 'Banco Itaú S.A.')).toEqual({
			blockedCompanies: ['Acme', 'Banco Itaú S.A.'],
			entry: 'Banco Itaú S.A.',
		})
	})

	test('empresa já pega por outra entrada: a lista fica como está', () => {
		const blockedCompanies = ['Itaú']

		expect(withBlockedCompany(blockedCompanies, 'Banco Itaú S.A.')).toEqual({ blockedCompanies, entry: 'Itaú' })
		expect(withBlockedCompany(blockedCompanies, 'Banco Itaú S.A.').blockedCompanies).toBe(blockedCompanies)
	})
})

describe('withoutBlockedCompany', () => {
	test('tira a entrada que pega a empresa da vaga', () => {
		expect(withoutBlockedCompany(['Acme', 'Itaú'], 'Banco Itaú S.A.')).toEqual({ blockedCompanies: ['Acme'], entry: 'Itaú' })
	})

	test('empresa não bloqueada: a lista fica igual', () => {
		expect(withoutBlockedCompany(['Acme'], 'Stonehenge')).toEqual({ blockedCompanies: ['Acme'], entry: null })
	})
})

describe('unblockedCompanies', () => {
	test('as empresas que saíram da lista, normalizadas como o `blockedBy` dos posts', () => {
		expect(unblockedCompanies(['Acme Ltda.', 'Banco Itaú S.A.'], ['Acme Ltda.'])).toEqual(['banco itau'])
		expect(unblockedCompanies(['Acme'], ['Acme', 'Nova'])).toEqual([])
	})

	test('a mesma empresa com outra grafia não conta como desbloqueada', () => {
		expect(unblockedCompanies(['ACME LTDA'], ['Acme'])).toEqual([])
	})
})

test('POST /api/blocked-companies/remove-jobs pede a empresa e, opcionalmente, a vaga', () => {
	expect(RemoveBlockedJobsSchema.parse({ company: ' Acme ' })).toEqual({ company: 'Acme' })
	expect(RemoveBlockedJobsSchema.parse({ company: 'Acme', postId: 'p1' })).toEqual({ company: 'Acme', postId: 'p1' })
	expect(RemoveBlockedJobsSchema.safeParse({ company: ' ' }).success).toBe(false)
})
