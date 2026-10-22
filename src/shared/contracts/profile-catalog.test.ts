import { expect, test } from 'bun:test'

import { PROFILE_AREAS, suggestedRoles } from './profile-catalog'
import { ProfileSettingsSchema } from './settings'

test('os cargos da área, ignorando caixa, acentos e espaços', () => {
	expect(suggestedRoles(' recursos humanos ')).toEqual(PROFILE_AREAS['Recursos Humanos']!)
	expect(suggestedRoles('logistica')).toContain('Analista de Logística')
})

test('área fora da lista não tem sugestões', () => {
	expect(suggestedRoles('Astronomia')).toEqual([])
	expect(suggestedRoles('')).toEqual([])
})

test('toda sugestão é aceita pelo schema do perfil', () => {
	for (const [area, roles] of Object.entries(PROFILE_AREAS)) {
		for (const targetRole of roles) expect(ProfileSettingsSchema.safeParse({ area, targetRole }).success).toBe(true)
	}
})
