import type { z } from 'zod'

import { SETTINGS_SCHEMAS, type SettingsInput, type SettingsKey, type SettingsOf } from '../contracts/settings'
import { Settings } from '../database/settings.model'

/**
 * Lê as configurações de um serviço; na primeira vez, cria o documento com `seed` (valores do `.env`).
 * Depois valem os do banco; campos ausentes recebem o padrão do schema.
 */
export async function loadSettings<K extends SettingsKey>(key: K, seed: Partial<SettingsInput<K>> = {}): Promise<SettingsOf<K>> {
	const document = await Settings.findOneAndUpdate(
		{ _id: key },
		{ $setOnInsert: { values: parseSettings(key, seed), updatedAt: new Date() } },
		{ upsert: true, returnDocument: 'after', lean: true },
	)

	try {
		return parseSettings(key, document?.values)
	} catch (error) {
		throw new Error(`Configurações "${key}" inválidas no MongoDB (coleção settings)`, { cause: error })
	}
}

/**
 * Altera parte das configurações (ponto de entrada para outras fontes), validando o resultado inteiro.
 * @throws {ZodError} Se o resultado for inválido; nesse caso nada é salvo.
 */
export async function updateSettings<K extends SettingsKey>(key: K, patch: Partial<SettingsInput<K>>): Promise<SettingsOf<K>> {
	const current = await Settings.findById(key).lean()
	const values = parseSettings(key, { ...current?.values, ...patch })

	await Settings.updateOne({ _id: key }, { values, updatedAt: new Date() }, { upsert: true })

	return values
}

function parseSettings<K extends SettingsKey>(key: K, values: unknown): SettingsOf<K> {
	const schema = SETTINGS_SCHEMAS[key] as unknown as z.ZodType<SettingsOf<K>>

	return schema.parse(values)
}
