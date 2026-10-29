import { describe, expect, test } from 'bun:test'

import { buildCvDeliveryContent } from './cv-delivery'

const file = { name: 'Curriculo.pdf', base64: 'JVBERi0=' }
const message = {
	subject: 'Candidatura – Dev Vue',
	body: 'Olá! Tudo bem?\n\nVi a vaga de Dev Vue na Acme e tenho interesse.',
	tone: null,
	length: null,
}

describe('buildCvDeliveryContent', () => {
	test('com a mensagem da IA: o aviso e a mensagem num bloco para copiar', () => {
		const content = buildCvDeliveryContent({ file, jobTitle: 'Dev Vue', error: null, message })

		expect(content).toStartWith('📄 Currículo ajustado para **Dev Vue**')
		expect(content).toContain('```\nAssunto: Candidatura – Dev Vue\n\nOlá! Tudo bem?')
		expect(content).toEndWith('tenho interesse.\n```')
	})

	test('a assinatura vai no fim da mensagem, dentro do bloco para copiar', () => {
		const content = buildCvDeliveryContent(
			{ file, jobTitle: 'Dev Vue', error: null, message },
			'🔗 GitHub: https://github.com/exemplo',
		)

		expect(content).toEndWith('tenho interesse.\n\n🔗 GitHub: https://github.com/exemplo\n```')
	})

	test('sem mensagem (vaga sem e-mail ou IA falhou), só o aviso', () => {
		expect(buildCvDeliveryContent({ file, jobTitle: 'Dev Vue', error: null, message: null })).toBe(
			'📄 Currículo ajustado para **Dev Vue**',
		)
	})

	test('sem a mensagem da IA, o modelo que ficou sem um valor explica a falta do botão de envio', () => {
		const content = buildCvDeliveryContent({ file, jobTitle: 'Dev Vue', error: null, message: null }, '', {
			fallbacks: ['local'],
			missing: ['empresa'],
		})

		expect(content).toStartWith('📄 Currículo ajustado para **Dev Vue**\n⚠️ A vaga não tem {{empresa}}')
		expect(content).toContain('O envio desta vaga fica no site')
		expect(content).not.toContain('{{local}}')
	})

	test('crases no texto não quebram o bloco, e mensagem longa demais fica de fora', () => {
		const withTicks = buildCvDeliveryContent({ file, jobTitle: 'Dev', error: null, message: { ...message, body: 'usa ```code```' } })
		expect(withTicks.match(/```/g)).toHaveLength(2)

		const long = buildCvDeliveryContent({ file, jobTitle: 'Dev', error: null, message: { ...message, body: 'a'.repeat(2000) } })
		expect(long).toBe('📄 Currículo ajustado para **Dev**')
	})

	test('falha na geração', () => {
		expect(buildCvDeliveryContent({ file: null, jobTitle: 'Dev', error: 'LaTeX não compilou', message: null })).toBe(
			'⚠️ Não consegui gerar o currículo: LaTeX não compilou',
		)
	})
})
