import { describe, expect, test } from 'bun:test'

import { buildMailConfirmation, confirmationRow, MAIL_BUTTON_PREFIX, mailResultContent, sendApplicationRow } from './mail-reply'

const mail = {
	to: 'rh@acme.com.br',
	subject: 'Candidatura – Desenvolvedor Vue',
	body: 'Olá! Tudo bem?\n\nEnvio meu currículo em anexo.',
	fileName: 'Curriculo-Acme-Desenvolvedor-Vue.pdf',
	lastSentAt: null,
}

describe('confirmação do envio no Discord', () => {
	test('mostra o e-mail como vai sair e lembra que só envia confirmando', () => {
		const content = buildMailConfirmation(mail)

		expect(content).toContain('**Para:** rh@acme.com.br')
		expect(content).toContain('**Assunto:** Candidatura – Desenvolvedor Vue')
		expect(content).toContain('Envio meu currículo em anexo.')
		expect(content).toContain('📎 Curriculo-Acme-Desenvolvedor-Vue.pdf')
		expect(content).toContain('Confirmar envio')
		expect(content).not.toContain('já recebeu')
	})

	test('avisa quando a vaga já recebeu candidatura por e-mail', () => {
		const content = buildMailConfirmation({ ...mail, lastSentAt: new Date('2026-10-20T12:00:00Z') })

		expect(content.startsWith('⚠️ **Esta vaga já recebeu sua candidatura por e-mail**')).toBe(true)
	})

	test('corpo longo aparece cortado, sem passar do limite do Discord', () => {
		const content = buildMailConfirmation({ ...mail, body: 'palavra '.repeat(1000) })

		expect(content.length).toBeLessThanOrEqual(2000)
		expect(content).toContain('o texto completo vai no e-mail')
	})

	test('diz quais variáveis do modelo a vaga não tinha e usaram o fallback', () => {
		expect(buildMailConfirmation({ ...mail, fallbacks: ['empresa', 'local'] })).toContain(
			'ℹ️ A vaga não tem {{empresa}} e {{local}}: entrou o texto do fallback.',
		)
		expect(buildMailConfirmation(mail)).not.toContain('fallback')
	})

	test('três crases no corpo não fecham o bloco antes da hora', () => {
		expect(buildMailConfirmation({ ...mail, body: 'a ``` b' })).toContain("a ''' b")
	})

	test('os botões carregam o fileId; o de confirmar vira "Enviar de novo" no reenvio', () => {
		expect(sendApplicationRow('f1').components[0]).toMatchObject({
			custom_id: `${MAIL_BUTTON_PREFIX}f1`,
			label: 'Enviar candidatura',
		})
		expect(sendApplicationRow('f1', true).components[0]).toMatchObject({ label: 'Tentar de novo' })
		expect(confirmationRow('f1', false).components.map(button => ('label' in button ? button.label : null))).toEqual([
			'Confirmar envio',
			'Cancelar',
		])
		expect(confirmationRow('f1', true).components[0]).toMatchObject({ custom_id: 'mail-send:f1', label: 'Enviar de novo' })
	})

	test('o resultado diz se saiu ou por que falhou', () => {
		expect(mailResultContent({ status: 'sent', error: null }, 'rh@acme.com.br')).toContain(
			'✅ Candidatura enviada para **rh@acme.com.br**',
		)
		expect(mailResultContent({ status: 'failed', error: 'O servidor recusou o login.' }, 'rh@acme.com.br')).toContain(
			'falhou: O servidor recusou o login.',
		)
	})
})
