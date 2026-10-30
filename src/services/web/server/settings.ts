import { z } from 'zod'

import { SETTINGS_SCHEMAS, type PostProcessingSettings, type SettingsInput, type SettingsKey } from '@shared/contracts'
import type { Logger } from '@shared/logging'
import { readSettings, updateSettings } from '@shared/settings'

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

	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(400, 'Envie um objeto com os campos a alterar')

	const before = key === 'post-processing' ? (await readSettings(key)).blockedCompanies : []
	// Validado por inteiro em updateSettings, sobre os valores atuais (gravados do `.env` quando o site subiu)
	const saved = await updateSettings(key, patch as Partial<SettingsInput<typeof key>>)
	if (key === 'post-processing') await forgetUnblockedPosts(before, (saved as PostProcessingSettings).blockedCompanies, logger)

	return Response.json(saved)
}

function parseKey(value: string) {
	const key = SettingsKeySchema.safeParse(value)
	if (!key.success) throw new HttpError(404, `Configurações "${value}" não existem`)

	return key.data
}
