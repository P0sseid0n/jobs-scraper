import { expect, test } from 'bun:test'

import { isLegacyLoginFailure } from './scraper'

test('coleta antiga que parou no login é reconhecida pela mensagem', () => {
	expect(isLegacyLoginFailure('Login não concluído (checkpoint). O LinkedIn pediu verificação (captcha/2FA)')).toBe(true)
	expect(isLegacyLoginFailure('A verificação do LinkedIn não foi concluída a tempo')).toBe(true)
	expect(isLegacyLoginFailure('Todas as buscas falharam')).toBe(false)
	expect(isLegacyLoginFailure(null)).toBe(false)
})
