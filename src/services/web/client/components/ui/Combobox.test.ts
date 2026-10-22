import { expect, test } from 'bun:test'

import { filterOptions } from './Combobox'

const AREAS = ['Logística', 'Marketing', 'Recursos Humanos']

test('filtra pelo trecho digitado, ignorando caixa e acentos', () => {
	expect(filterOptions(AREAS, 'logis')).toEqual(['Logística'])
	expect(filterOptions(AREAS, 'HUMANOS')).toEqual(['Recursos Humanos'])
})

test('sem texto, todas as opções; sem resultado, nenhuma', () => {
	expect(filterOptions(AREAS, '  ')).toEqual(AREAS)
	expect(filterOptions(AREAS, 'astronomia')).toEqual([])
})
