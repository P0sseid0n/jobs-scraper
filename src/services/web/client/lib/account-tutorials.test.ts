import { describe, expect, test } from 'bun:test'

import type { CredentialGroup } from '../../api-types'
import { ACCOUNT_TUTORIALS, accountTutorial } from './account-tutorials'
import { SMTP_PROVIDER_OPTIONS } from './smtp-presets'

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

	test('cada opção do provedor do e-mail tem o seu caminho no tutorial', () => {
		const paths = ACCOUNT_TUTORIALS.smtp.paths.map(path => path.id)
		expect(paths).toEqual(SMTP_PROVIDER_OPTIONS.map(option => option.id))
	})

	test('no onboarding, o tutorial do LinkedIn fica sem os passos do cookie li_at (o campo só existe nas Configurações)', () => {
		const ids = (where: 'onboarding' | 'settings') => accountTutorial('linkedin', where).paths[0]!.steps.map(step => step.id)
		expect(ids('settings')).toContain('li-at')
		expect(ids('onboarding')).not.toContain('li-at')
		expect(ids('onboarding')).not.toContain('li-at-when')
		expect(accountTutorial('smtp', 'onboarding')).toEqual(accountTutorial('smtp', 'settings'))
	})
})
