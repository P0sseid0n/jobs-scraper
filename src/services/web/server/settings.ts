import { z } from 'zod'

import { SETTINGS_SCHEMAS, type SettingsInput, type SettingsKey } from '@shared/contracts'
import { readSettings, updateSettings } from '@shared/settings'

import { HttpError, readJson } from './http'

const SettingsKeySchema = z.enum(Object.keys(SETTINGS_SCHEMAS) as [SettingsKey, ...SettingsKey[]])

/** `GET /api/settings/:key` */
export async function getSettings(req: Request & { params: { key: string } }) {
	return Response.json(await readSettings(parseKey(req.params.key)))
}

/** `PUT /api/settings/:key`: altera parte das configurações; inválidas → 400 com o erro de cada campo, nada é salvo. */
export async function putSettings(req: Request & { params: { key: string } }) {
	const key = parseKey(req.params.key)
	const patch = await readJson(req)

	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(400, 'Envie um objeto com os campos a alterar')

	// Validado por inteiro em updateSettings. Se o serviço ainda não rodou, o documento nasce dos padrões + patch
	// (os valores iniciais do `.env` daquele serviço deixam de valer, como em qualquer edição)
	return Response.json(await updateSettings(key, patch as Partial<SettingsInput<typeof key>>))
}

function parseKey(value: string) {
	const key = SettingsKeySchema.safeParse(value)
	if (!key.success) throw new HttpError(404, `Configurações "${value}" não existem`)

	return key.data
}
