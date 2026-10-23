import { describe, expect, test } from 'bun:test'

import { pageItems } from './pagination'

describe('pageItems', () => {
	test('poucas páginas: todas, sem "…"', () => {
		expect(pageItems(1, 1)).toEqual([1])
		expect(pageItems(2, 4)).toEqual([1, 2, 3, 4])
	})

	test('no meio: a primeira, as vizinhas da atual e a última, com "…" dos dois lados', () => {
		expect(pageItems(6, 12)).toEqual([1, 'gap-start', 5, 6, 7, 'gap-end', 12])
	})

	test('perto das pontas: só um "…"', () => {
		expect(pageItems(1, 12)).toEqual([1, 2, 'gap-end', 12])
		expect(pageItems(12, 12)).toEqual([1, 'gap-start', 11, 12])
	})

	test('uma página só no buraco aparece no lugar do "…"', () => {
		expect(pageItems(4, 12)).toEqual([1, 2, 3, 4, 5, 'gap-end', 12])
		expect(pageItems(9, 12)).toEqual([1, 'gap-start', 8, 9, 10, 11, 12])
	})
})
