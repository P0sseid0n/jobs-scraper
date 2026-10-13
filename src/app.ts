// Processo único da aplicação: post-processing, cv-updater, discord-bot e site, com uma só conexão com o RabbitMQ e o
// MongoDB. O scraper roda à parte (precisa do Chromium e não reinicia sozinho, para não arriscar a conta do LinkedIn).
import { z } from 'zod'

import { startService, type ModuleContext } from '@shared/service'

import { startCvUpdater } from './services/cv-updater'
import { startDiscordBot } from './services/discord-bot'
import { startPostProcessing } from './services/post-processing'
import { startWeb } from './services/web'

const MODULES = {
	'post-processing': startPostProcessing,
	'cv-updater': startCvUpdater,
	'discord-bot': startDiscordBot,
	web: startWeb,
} satisfies Record<string, (context: ModuleContext) => Promise<void>>

type ModuleName = keyof typeof MODULES
const MODULE_NAMES = Object.keys(MODULES) as ModuleName[]

const appEnv = {
	/** Módulos que este processo sobe, separados por vírgula; vazio sobe todos (ex.: `web,post-processing` sem Discord). */
	APP_MODULES: z
		.string()
		.default('')
		.transform(value =>
			value
				.split(',')
				.map(name => name.trim())
				.filter(Boolean),
		)
		.pipe(z.array(z.enum(MODULE_NAMES)))
		.transform(names => (names.length > 0 ? names : MODULE_NAMES)),
}

const { config, logger, queue } = await startService({ name: 'app', env: appEnv, database: true })

for (const name of config.APP_MODULES) {
	await MODULES[name]({ queue })
}

logger.info({ modules: config.APP_MODULES }, 'Aplicação no ar')
