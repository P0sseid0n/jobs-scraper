import { z } from 'zod'

import {
	SETTINGS_SCHEMAS,
	systemLocale,
	type LanguageSettings,
	type PostProcessingSettings,
	type SettingsInput,
	type SettingsKey,
} from '@shared/contracts'
import { LOCALE_CODES, setSystemLocale, t } from '@shared/i18n'
import type { Logger } from '@shared/logging'
import { readSettings, updateSettings } from '@shared/settings'
import { defaultTemplate } from '@shared/templates'

import { forgetUnblockedPosts } from './blocked-companies'
import { HttpError, readJson } from './http'

const SettingsKeySchema = z.enum(Object.keys(SETTINGS_SCHEMAS) as [SettingsKey, ...SettingsKey[]])

/** `GET /api/settings/:key` */
export async function getSettings(req: Request & { params: { key: string } }) {
	return Response.json(await readSettings(parseKey(req.params.key)))
}

/**
 * `PUT /api/settings/:key`: altera parte das configurações; inválidas → 400 com o erro de cada campo, nada é salvo.
 * Desbloquear uma empresa esquece os posts que ela descartou na coleta.
 */
export async function putSettings(req: Request & { params: { key: string } }, { logger }: { logger: Logger }) {
	const key = parseKey(req.params.key)
	const patch = await readJson(req)

	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(400, t().api.objectExpected)

	const before = key === 'post-processing' ? (await readSettings(key)).blockedCompanies : []
	const beforeLocale = key === 'language' ? systemLocale(await readSettings('language')) : null
	// Validado por inteiro em updateSettings, sobre os valores atuais (gravados do `.env` quando o site subiu)
	const saved = await updateSettings(key, patch as Partial<SettingsInput<typeof key>>)
	if (key === 'post-processing') await forgetUnblockedPosts(before, (saved as PostProcessingSettings).blockedCompanies, logger)
	if (key === 'language') await followLocale(beforeLocale, saved as LanguageSettings, logger)

	return Response.json(saved)
}

/**
 * O idioma do sistema mudou: o servidor passa a usá-lo fora das requisições e o modelo de mensagem, se ainda é o padrão
 * de algum idioma (a pessoa não o editou), troca pelo padrão do idioma novo.
 */
async function followLocale(before: string | null, saved: LanguageSettings, logger: Logger) {
	const locale = systemLocale(saved)
	setSystemLocale(locale)
	if (before === locale) return

	const { template } = await readSettings('message')
	const untouched = LOCALE_CODES.some(code => {
		const original = defaultTemplate(code)
		return original.subject === template.subject && original.body === template.body
	})
	if (!untouched) return

	await updateSettings('message', { template: defaultTemplate(locale) })
	logger.info({ locale }, 'Modelo de mensagem padrão trocado pelo do idioma novo')
}

function parseKey(value: string) {
	const key = SettingsKeySchema.safeParse(value)
	if (!key.success) throw new HttpError(404, t().api.settingsNotFound(value))

	return key.data
}
