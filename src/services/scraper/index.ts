import { activeSearchTerms, JobLookupSchema, LoginTestRequestSchema, VerificationCodeSchema } from '@shared/contracts'
import { neverCollected, type ScraperRunTrigger } from '@shared/database'
import { onShutdown, shutdown } from '@shared/lifecycle'
import { QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'
import { loadCredentials, loadSettings } from '@shared/settings'

import { BrowserLock } from './browser-lock'
import { scraperEnv } from './config'
import { JobLookupWorker } from './job-lookup'
import { NO_LINKEDIN_ACCOUNT } from './login'
import { testLinkedinLogin } from './login-test'
import { markInterruptedRuns, recordRun } from './run-history'
import { NO_SEARCH_TERMS, waitingReason } from './schedule'
import { runOnSchedule } from './scheduler'
import { closeActiveBrowser, scrapeOnce } from './scrape-run'
import { submitVerificationCode } from './verification-inbox'

const { config, logger, queue } = await startService({ name: 'scraper', env: scraperEnv, database: true })

// Na coleta única sem configuração, de quanto em quanto tempo relê os termos e a conta (como a agenda)
const CONFIGURATION_POLL_MS = 30_000

// A coleta e as vagas de posts com várias usam o LinkedIn uma de cada vez
const browserLock = new BrowserLock()
const lookups = new JobLookupWorker({ config, queue, logger, lock: browserLock })

onShutdown(closeActiveBrowser)
onShutdown(() => lookups.close())
await queue.assertQueue(QUEUES.postProcessing)
await markInterruptedRuns()

// Código de verificação do login (`bun scraper:verify <código>`): chega a qualquer momento, inclusive no meio de uma coleta
await queue.consume(QUEUES.scraperVerification, VerificationCodeSchema, async ({ code }) => {
	if (submitVerificationCode(code)) logger.info('🔢 Código de verificação recebido')
	else logger.warn('Código de verificação ignorado: nenhum login está esperando um código')
})

// Teste do login pedido pelo site (onboarding e Configurações › Contas): usa o navegador na vez dele, como a coleta
await queue.consume(QUEUES.scraperLoginTest, LoginTestRequestSchema, () =>
	browserLock.run(async () => {
		await lookups.close()
		await testLinkedinLogin({ config, logger })
	}),
)

// Vagas de posts com várias (enviadas pelo post-processing): cada uma é aberta no navegador, com pausa entre elas
await queue.consume(QUEUES.scraperLookup, JobLookupSchema, lookup => lookups.handle(lookup))

try {
	logger.info('🚀 Iniciando scraper')

	// Intervalo 0 no .env: uma coleta e termina. Senão, fica rodando (agenda + "coletar agora").
	if (config.SCRAPER_INTERVAL_MINUTES === 0) {
		await waitForConfiguration()
		const { failed } = await collect('once')
		await shutdown(logger, failed ? 1 : 0)
	}

	await runOnSchedule({
		queue,
		logger,
		loadSettings: loadScraperSettings,
		hasAccount: hasLinkedinAccount,
		awaitingFirstRun: async () => !config.SKIP_ONBOARDING && (await neverCollected()),
		collect: trigger => collect(trigger).then(() => {}),
	})
} catch (error) {
	logger.fatal({ err: error }, 'Erro no scraper')
	await shutdown(logger, 1)
}

/**
 * Faz uma coleta com as configurações atuais do banco e a registra no histórico. Sem termos de busca ativos ou sem
 * conta do LinkedIn, só registra o motivo no log (não é falha nem entra no histórico): o site mostra o que falta.
 */
async function collect(trigger: ScraperRunTrigger) {
	const settings = await loadScraperSettings()

	if (activeSearchTerms(settings).length === 0) {
		logger.warn({ trigger }, NO_SEARCH_TERMS)
		return { failed: false }
	}

	if (!(await hasLinkedinAccount())) {
		logger.warn({ trigger }, NO_LINKEDIN_ACCOUNT)
		return { failed: false }
	}

	return browserLock.run(async () => {
		await lookups.close()
		const plan = { terms: activeSearchTerms(settings), minJobs: settings.minJobsPerRun }
		return recordRun(trigger, plan, onTerm => scrapeOnce({ config, settings, queue, logger, onTerm }))
	})
}

/**
 * Na coleta única, espera ter termos de busca e conta do LinkedIn em vez de encerrar sem coletar: quem configura pelo
 * onboarding do site vê a primeira coleta rodar ao terminar, e o teste do login continua atendido enquanto isso.
 */
async function waitForConfiguration() {
	let announced = false

	while (true) {
		const settings = await loadScraperSettings()
		const waiting = waitingReason({
			paused: false,
			activeSearchTerms: activeSearchTerms(settings).length,
			hasAccount: await hasLinkedinAccount(),
		})
		if (!waiting) return

		if (!announced) {
			announced = true
			logger.warn(waiting === 'no-terms' ? NO_SEARCH_TERMS : NO_LINKEDIN_ACCOUNT)
			logger.info('A coleta única começa assim que a configuração for salva pelo site')
		}
		await Bun.sleep(CONFIGURATION_POLL_MS)
	}
}

function loadScraperSettings() {
	return loadSettings('scraper')
}

/** Lida a cada coleta (e pela agenda): a conta salva pelo site vale sem reiniciar o serviço. */
async function hasLinkedinAccount() {
	return (await loadCredentials('linkedin')) !== null
}
