import { expect, test } from 'bun:test'

import { toggleReportField } from './ReportJobDialog'

test('liga e desliga campos, e sem nenhum volta a não ter relato', () => {
	const one = toggleReportField(null, 'company')
	expect(one).toEqual({ kind: 'fields', fields: ['company'] })

	const two = toggleReportField(one, 'workMode')
	expect(two).toEqual({ kind: 'fields', fields: ['company', 'workMode'] })

	expect(toggleReportField(toggleReportField(two, 'company'), 'workMode')).toBeNull()
})

test('escolher um campo desfaz o "não é vaga" e o "outro idioma"', () => {
	expect(toggleReportField({ kind: 'not-a-job' }, 'title')).toEqual({ kind: 'fields', fields: ['title'] })
	expect(toggleReportField({ kind: 'wrong-language' }, 'title')).toEqual({ kind: 'fields', fields: ['title'] })
})
