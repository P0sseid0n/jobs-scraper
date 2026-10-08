import type { ScraperRunTrigger } from '@shared/database'
import { onShutdown, shutdown } from '@shared/lifecycle'
import { QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'
import { loadSettings } from '@shared/settings'

import { scraperEnv } from './config'
import { markInterruptedRuns, recordRun } from './run-history'
import { settingsSeedFromEnv } from './schedule'
import { runOnSchedule } from './scheduler'
import { closeActiveBrowser, scrapeOnce } from './scrape-run'

const { config, logger, queue } = await startService({ name: 'scraper', env: scraperEnv, database: true })

onShutdown(closeActiveBrowser)
await queue.assertQueue(QUEUES.postProcessing)
await markInterruptedRuns()

const settingsSeed = settingsSeedFromEnv(config)

try {
	logger.info('🚀 Iniciando scraper')

	// Intervalo 0 no .env: uma coleta e termina. Senão, fica rodando (agenda + "coletar agora").
	if (config.SCRAPER_INTERVAL_MINUTES === 0) {
		const { failed } = await collect('once')
		await shutdown(logger, failed ? 1 : 0)
	}

	await runOnSchedule({ queue, logger, loadSettings: loadScraperSettings, collect: trigger => collect(trigger).then(() => {}) })
} catch (error) {
	logger.fatal({ err: error }, 'Erro no scraper')
	await shutdown(logger, 1)
}

/** Faz uma coleta com as configurações atuais do banco e a registra no histórico. */
async function collect(trigger: ScraperRunTrigger) {
	const settings = await loadScraperSettings()

	return recordRun(trigger, () => scrapeOnce({ config, settings, queue, logger }))
}

function loadScraperSettings() {
	return loadSettings('scraper', settingsSeed)
}
