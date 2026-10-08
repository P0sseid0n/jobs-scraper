import { onShutdown, shutdown } from '@shared/lifecycle'
import { QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'

import { scraperEnv } from './config'
import { closeActiveBrowser, scrapeOnce } from './scrape-run'

const { config, logger, queue } = await startService({ name: 'scraper', env: scraperEnv })

onShutdown(closeActiveBrowser)
await queue.assertQueue(QUEUES.postProcessing)

try {
	await run()
	await shutdown(logger)
} catch (error) {
	logger.fatal({ err: error }, 'Erro no scraper')
	await shutdown(logger, 1)
}

/** Uma coleta só (SCRAPER_INTERVAL_MINUTES=0) ou uma a cada N minutos. */
async function run() {
	logger.info('🚀 Iniciando scraper')

	if (config.SCRAPER_INTERVAL_MINUTES === 0) {
		await scrapeOnce({ config, queue, logger })
		return
	}

	while (true) {
		try {
			await scrapeOnce({ config, queue, logger })
		} catch (error) {
			logger.error({ err: error }, 'Erro na coleta; tentando de novo no próximo ciclo')
		}

		logger.info({ minutes: config.SCRAPER_INTERVAL_MINUTES }, '⏰ Próxima coleta agendada')
		await Bun.sleep(config.SCRAPER_INTERVAL_MINUTES * 60_000)
	}
}
