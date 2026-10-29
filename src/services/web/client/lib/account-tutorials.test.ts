import { describe, expect, test } from 'bun:test'

import type { CredentialGroup } from '../../api-types'
import { ACCOUNT_TUTORIALS, tutorialPathFor } from './account-tutorials'

/** Os passos que o teste de cada conta aponta na falha (`step`, em `server/credential-checks.ts`). */
const CHECK_STEPS: Partial<Record<CredentialGroup, string[]>> = {
	discord: ['token', 'invite', 'channel'],
	github: ['token', 'username'],
	smtp: ['app-password'],
}

describe('ACCOUNT_TUTORIALS', () => {
	test('os passos apontados pelo teste existem em todos os caminhos da conta', () => {
		for (const [group, steps] of Object.entries(CHECK_STEPS)) {
			for (const path of ACCOUNT_TUTORIALS[group as CredentialGroup].paths) {
				expect(path.steps.map(step => step.id)).toEqual(expect.arrayContaining(steps))
			}
		}
	})

	test('ids sem repetição em cada caminho e links https', () => {
		for (const tutorial of Object.values(ACCOUNT_TUTORIALS)) {
			for (const path of tutorial.paths) {
				const ids = path.steps.map(step => step.id)
				expect(new Set(ids).size).toBe(ids.length)
				for (const step of path.steps) if (step.link) expect(step.link.href).toStartWith('https://')
			}
		}
	})

	test('o e-mail pessoal da Microsoft abre o caminho do Outlook', () => {
		expect(tutorialPathFor('smtp', { user: 'ana@hotmail.com' })).toBe('outlook')
		expect(tutorialPathFor('smtp', { user: 'ana@gmail.com' })).toBeUndefined()
		expect(tutorialPathFor('discord', {})).toBeUndefined()
	})
})
