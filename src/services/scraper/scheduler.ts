import { ScraperCommandSchema, type ScraperSettings } from '@shared/contracts'
import type { ScraperRunTrigger } from '@shared/database'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'

import { lastRunStartedAt } from './run-history'
import { nextRunAt } from './schedule'

type SchedulerOptions = {
	queue: QueueClient
	logger: Logger
	loadSettings: () => Promise<ScraperSettings>
	collect: (trigger: ScraperRunTrigger) => Promise<void>
}

// Releitura das configurações: mudanças feitas por outras fontes valem em até 30 s, sem reiniciar o serviço
const POLL_MS = 30_000

/**
 * Mantém o scraper rodando: coleta quando o intervalo vence (sem pausa) ou quando chega um "coletar agora".
 * Relê as configurações a cada volta e ignora pedidos durante uma coleta. Nunca retorna.
 */
export async function runOnSchedule({ queue, logger, loadSettings, collect }: SchedulerOptions): Promise<never> {
	const wakeUp = createWakeUp()
	let running = false
	let manualRequested = false
	let lastAnnouncement = ''

	await queue.consume(QUEUES.scraper, ScraperCommandSchema, async command => {
		if (running) {
			logger.info({ requestedBy: command.requestedBy }, 'Coleta manual ignorada: já há uma coleta em andamento')
			return
		}

		logger.info({ requestedBy: command.requestedBy }, '▶️ Coleta manual solicitada')
		manualRequested = true
		wakeUp.wake()
	})

	while (true) {
		try {
			const settings = await loadSettings()
			const next = nextRunAt(await lastRunStartedAt(), settings.intervalMinutes)
			const trigger = manualRequested ? 'manual' : !settings.paused && Date.now() >= next.getTime() ? 'schedule' : null

			if (trigger) {
				manualRequested = false
				running = true
				await collect(trigger).finally(() => {
					running = false
				})
				continue
			}

			const announcement = settings.paused ? 'paused' : next.toISOString()
			if (announcement !== lastAnnouncement) {
				lastAnnouncement = announcement
				if (settings.paused) logger.info('⏸️ Coletas automáticas pausadas')
				else logger.info({ at: next.toLocaleString('pt-BR') }, '⏰ Próxima coleta agendada')
			}

			await wakeUp.sleep(settings.paused ? POLL_MS : Math.min(POLL_MS, next.getTime() - Date.now()))
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
