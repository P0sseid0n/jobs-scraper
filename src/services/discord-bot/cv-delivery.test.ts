import { describe, expect, test } from 'bun:test'

import { buildCvDeliveryContent } from './cv-delivery'

const file = { name: 'Curriculo.pdf', base64: 'JVBERi0=' }

describe('buildCvDeliveryContent', () => {
	test('com o modelo completo, só o aviso (a mensagem já veio no clique)', () => {
		expect(buildCvDeliveryContent({ file, jobTitle: 'Dev Vue', error: null }, { missing: [] })).toBe(
			'📄 Currículo ajustado para **Dev Vue**',
		)
		expect(buildCvDeliveryContent({ file, jobTitle: 'Dev Vue', error: null })).toBe('📄 Currículo ajustado para **Dev Vue**')
	})

	test('o modelo que ficou sem um valor explica a falta do botão de envio', () => {
		const content = buildCvDeliveryContent({ file, jobTitle: 'Dev Vue', error: null }, { missing: ['empresa'] })

		expect(content).toStartWith('📄 Currículo ajustado para **Dev Vue**\n⚠️ A vaga não tem {{empresa}}')
		expect(content).toContain('O envio desta vaga fica no site')
	})

	test('falha na geração', () => {
		expect(buildCvDeliveryContent({ file: null, jobTitle: 'Dev', error: 'LaTeX não compilou' })).toBe(
			'⚠️ Não consegui gerar o currículo: LaTeX não compilou',
		)
	})
})
