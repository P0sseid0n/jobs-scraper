import { expect, test } from 'bun:test'

import { LOCALE_CODES, messagesFor } from '../i18n'
import { suggestedRoles } from './profile-catalog'
import { ProfileSettingsSchema } from './settings'

const areas = messagesFor('pt-BR').profile.areas

test('os cargos da área, ignorando caixa, acentos e espaços', () => {
	expect(suggestedRoles(areas, ' recursos humanos ')).toEqual(areas.find(item => item.area === 'Recursos Humanos')!.roles)
	expect(suggestedRoles(areas, 'logistica')).toContain('Analista de Logística')
})

test('área fora da lista não tem sugestões', () => {
	expect(suggestedRoles(areas, 'Astronomia')).toEqual([])
	expect(suggestedRoles(areas, '')).toEqual([])
})

test('toda sugestão, em todos os idiomas, é aceita pelo schema do perfil', () => {
	for (const locale of LOCALE_CODES) {
		for (const { area, roles } of messagesFor(locale).profile.areas) {
			for (const targetRole of roles) expect(ProfileSettingsSchema.safeParse({ area, targetRole }).success).toBe(true)
		}
	}
})
