import { activeSearchTerms, ScraperCommandSchema, type ScraperRunEvent, type ScraperSettings } from '@shared/contracts'
import { consecutiveShortRuns, type ScraperRunTrigger } from '@shared/database'
import type { Logger } from '@shared/logging'
import { EXCHANGES, QUEUES, type QueueClient } from '@shared/messaging'

import { NO_LINKEDIN_ACCOUNT } from './login'
import { lastRunStartedAt } from './run-history'
import { AWAITING_FIRST_RUN, nextRunAt, NO_SEARCH_TERMS, waitingReason } from './schedule'

type SchedulerOptions = {
	queue: QueueClient
	logger: Logger
	loadSettings: () => Promise<ScraperSettings>
	/** Se há conta do LinkedIn (site ou `.env`), relida a cada volta como as configurações. */
	hasAccount: () => Promise<boolean>
	/** Se a instalação nunca coletou e a primeira coleta espera o pedido do site (fim do onboarding). */
	awaitingFirstRun: () => Promise<boolean>
	collect: (trigger: ScraperRunTrigger) => Promise<void>
}

// Releitura das configurações: mudanças feitas por outras fontes valem em até 30 s, sem reiniciar o serviço
const POLL_MS = 30_000

/**
 * Mantém o scraper rodando: coleta quando o intervalo vence (sem pausa) ou quando chega um "coletar agora". O
 * intervalo estica depois de coletas que terminaram abaixo do mínimo de vagas (ver `intervalStretch`).
 * Relê as configurações e a conta a cada volta e ignora pedidos durante uma coleta (o do site recebe a resposta, aceito ou
 * ignorado, no evento `scraper-run`). Sem termos de busca ativos ou sem
 * conta do LinkedIn, espera a configuração sem coletar; numa instalação nova, a primeira coleta espera o pedido do
 * site. Nunca retorna.
 */
export async function runOnSchedule({
	queue,
	logger,
	loadSettings,
	hasAccount,
	awaitingFirstRun,
	collect,
}: SchedulerOptions): Promise<never> {
	const wakeUp = createWakeUp()
	let running = false
	let manualRequested = false
	let lastAnnouncement = ''

	// A resposta ao pedido do site, que espera por ela: se não der para publicar, o site desiste sozinho no prazo dele
	const reply = (requestId: string | null, phase: 'accepted' | 'ignored') =>
		requestId &&
		queue
			.publishEvent(EXCHANGES.scraperRun, { requestId, phase } satisfies ScraperRunEvent)
			.catch(error => logger.debug({ err: error, requestId }, 'Resposta ao "coletar agora" não publicada'))

	await queue.consume(QUEUES.scraper, ScraperCommandSchema, async command => {
		if (running) {
			logger.info({ requestedBy: command.requestedBy }, 'Coleta manual ignorada: já há uma coleta em andamento')
			await reply(command.requestId, 'ignored')
			return
		}

		logger.info({ requestedBy: command.requestedBy }, '▶️ Coleta manual solicitada')
		manualRequested = true
		wakeUp.wake()
		await reply(command.requestId, 'accepted')
	})

	while (true) {
		try {
			const settings = await loadSettings()
			const waiting = waitingReason({
				paused: settings.paused,
				activeSearchTerms: activeSearchTerms(settings).length,
				hasAccount: await hasAccount(),
				awaitingFirstRun: await awaitingFirstRun(),
			})
			const next = nextRunAt(await lastRunStartedAt(), settings.intervalMinutes, await consecutiveShortRuns())
			// O pedido manual vai para a coleta mesmo sem termos ou conta: ela registra o motivo de não buscar nada
			const trigger = manualRequested ? 'manual' : !waiting && Date.now() >= next.getTime() ? 'schedule' : null

			if (trigger) {
				manualRequested = false
				running = true
				await collect(trigger).finally(() => {
					running = false
				})
				continue
			}

			const announcement = waiting ?? next.toISOString()
			if (announcement !== lastAnnouncement) {
				lastAnnouncement = announcement
				if (waiting === 'paused') logger.info('⏸️ Coletas automáticas pausadas')
				else if (waiting === 'no-terms') logger.warn(NO_SEARCH_TERMS)
				else if (waiting === 'no-account') logger.warn(NO_LINKEDIN_ACCOUNT)
				else if (waiting === 'first-run') logger.info(AWAITING_FIRST_RUN)
				else logger.info({ at: next.toLocaleString('pt-BR') }, '⏰ Próxima coleta agendada')
			}

			await wakeUp.sleep(waiting ? POLL_MS : Math.min(POLL_MS, next.getTime() - Date.now()))
		} catch (error) {
			logger.error({ err: error }, 'Erro na coleta; tentando de novo mais tarde')
			await wakeUp.sleep(POLL_MS)
		}
	}
}

/**
 * Cria uma espera interrompível: `sleep(ms)` termina pelo tempo ou por `wake()`, o que vier primeiro.
 * Fora de uma espera, `wake()` não faz nada.
 */
function createWakeUp() {
	// Encerra a espera em andamento; `undefined` quando não há nenhuma
	let wake: (() => void) | undefined

	return {
		sleep(ms: number) {
			return new Promise<void>(resolve => {
				const timer = setTimeout(done, ms)

				/** Encerra a espera (pelo timer ou pelo `wake`); chamar duas vezes é inofensivo. */
				function done() {
					clearTimeout(timer)
					wake = undefined
					resolve()
				}

				wake = done
			})
		},

		wake() {
			wake?.()
		},
	}
}
