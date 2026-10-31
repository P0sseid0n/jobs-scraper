import type { z } from 'zod'

import { SETTINGS_SCHEMAS, systemLocale, type SettingsInput, type SettingsKey, type SettingsOf } from '../contracts/settings'
import { Settings } from '../database/settings.model'
import { setSystemLocale } from '../i18n'
import type { SettingsSeeds } from './settings-env'

/** Os valores do `.env` (guardados por `seedSettings`), usados sempre que um documento ainda não existe. */
let seeds: Partial<SettingsSeeds> = {}

/**
 * Grava os documentos que ainda não existem com os valores do `.env` e os guarda para quando um documento for apagado
 * depois. Os que já existem não mudam. Chamada por `startService` ao subir, antes de qualquer leitura.
 * @throws {Error} Se os valores do `.env` não passarem nos schemas; nesse caso nada é gravado.
 */
export async function seedSettings(envSeeds: SettingsSeeds) {
	const keys = Object.keys(SETTINGS_SCHEMAS) as SettingsKey[]
	const values = keys.map(key => {
		try {
			return parseSettings(key, envSeeds[key])
		} catch (error) {
			throw new Error(`Valores do .env inválidos para as configurações "${key}"`, { cause: error })
		}
	})

	seeds = envSeeds
	await Promise.all(
		keys.map((key, index) =>
			Settings.updateOne({ _id: key }, { $setOnInsert: { values: values[index], updatedAt: new Date() } }, { upsert: true }),
		),
	)
}

/** Lê as configurações de um serviço; se o documento não existir (foi apagado), recria com os valores do `.env`. */
export async function loadSettings<K extends SettingsKey>(key: K): Promise<SettingsOf<K>> {
	const document = await Settings.findOneAndUpdate(
		{ _id: key },
		{ $setOnInsert: { values: parseSettings(key, seeds[key] ?? {}), updatedAt: new Date() } },
		{ upsert: true, returnDocument: 'after', lean: true },
	)

	try {
		return parseSettings(key, document?.values)
	} catch (error) {
		throw new Error(`Configurações "${key}" inválidas no MongoDB (coleção settings)`, { cause: error })
	}
}

/** Lê as configurações sem criar o documento; sem ele, valem os valores do `.env` (ou, fora de um serviço, os padrões). */
export async function readSettings<K extends SettingsKey>(key: K): Promise<SettingsOf<K>> {
	const document = await Settings.findById(key).lean()

	return parseSettings(key, document?.values ?? seeds[key] ?? {})
}

/**
 * Altera parte das configurações (ponto de entrada para outras fontes), validando o resultado inteiro.
 * @throws {ZodError} Se o resultado for inválido; nesse caso nada é salvo.
 */
export async function updateSettings<K extends SettingsKey>(key: K, patch: Partial<SettingsInput<K>>): Promise<SettingsOf<K>> {
	const current = await Settings.findById(key).lean()
	const values = parseSettings(key, { ...(current?.values ?? seeds[key]), ...patch })

	await Settings.updateOne({ _id: key }, { values, updatedAt: new Date() }, { upsert: true })

	return values
}

/** Quanto o idioma escolhido no site demora a valer num serviço que não recebe a troca (o mesmo das credenciais). */
const LOCALE_REFRESH_MS = 30_000

/**
 * O idioma do sistema salvo vira o idioma atual do serviço (`t()`, mensagens do Discord e dos e-mails), relido a cada
 * 30 s para uma troca pelo site valer sem reiniciar. Chamada por `startService`; devolve a função que para a releitura.
 */
export async function followSystemLocale() {
	const refresh = async () => {
		try {
			setSystemLocale(systemLocale(await readSettings('language')))
		} catch {
			// sem o banco agora: fica o idioma de antes, e a próxima volta tenta de novo
		}
	}

	await refresh()
	const timer = setInterval(refresh, LOCALE_REFRESH_MS)
	return () => clearInterval(timer)
}

function parseSettings<K extends SettingsKey>(key: K, values: unknown): SettingsOf<K> {
	const schema = SETTINGS_SCHEMAS[key] as unknown as z.ZodType<SettingsOf<K>>

	return schema.parse(values)
}
