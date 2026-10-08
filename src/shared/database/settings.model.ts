import mongoose, { Schema } from 'mongoose'

import type { SettingsKey } from '../contracts/settings'

type SettingsDocument = {
	_id: SettingsKey
	values: Record<string, unknown>
	updatedAt: Date
}

/** Um documento por serviço (`_id` = chave em SETTINGS_SCHEMAS); `values` é validado pelo schema da chave. */
const settingsSchema = new Schema<SettingsDocument>(
	{
		_id: { type: String, required: true },
		values: { type: Schema.Types.Mixed, required: true },
		updatedAt: { type: Date, required: true },
	},
	{ versionKey: false, minimize: false },
)

export const Settings = mongoose.model('Settings', settingsSchema, 'settings')
