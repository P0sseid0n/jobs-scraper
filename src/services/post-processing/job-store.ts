import { ProcessedJobSchema, type ProcessedJob } from '@shared/contracts'
import { Job, type JobExtractionSource } from '@shared/database'
import type { Logger } from '@shared/logging'
import { EXCHANGES, type QueueClient } from '@shared/messaging'

import { missingRequiredFields } from './job-validation'

type Deps = { queue: QueueClient; logger: Logger }

/**
 * Salva a vaga (uma única vez) e publica o evento `job-published`, que cada canal (ex.: o discord-bot) recebe.
 * `source` diz qual modelo e prompt extraíram a vaga (usado na avaliação das correções feitas pelo site).
 * @returns `false` se a vaga foi descartada por falta de campos obrigatórios.
 */
export async function saveJob(data: ProcessedJob, { queue, logger }: Deps, source?: JobExtractionSource) {
	const log = logger.child({ postId: data.postId })

	const missing = missingRequiredFields(data)
	if (missing.length > 0) {
		log.warn({ missing }, 'Vaga sem os campos obrigatórios, descartando')
		return false
	}

	// Upsert idempotente: a mesma vaga nunca é salva duas vezes, mesmo se a mensagem for reprocessada
	const job = await Job.findOneAndUpdate(
		{ postId: data.postId },
		{ $setOnInsert: { ...data, ...source } },
		{ upsert: true, returnDocument: 'after' },
	)

	if (job.notifiedAt) {
		log.info('Vaga já salva e anunciada anteriormente, ignorando')
		return true
	}

	await announce(data, queue)
	log.info('Vaga salva no MongoDB e publicada para os canais')
	return true
}

/**
 * Vaga salva numa tentativa anterior cujo anúncio falhou (o post volta pelo retry da fila): anuncia de novo sem
 * chamar a IA outra vez. Devolve `false` se o post ainda não tem vaga salva.
 */
export async function resumeSavedJob(postId: string, { queue, logger }: Deps) {
	const saved = await Job.findOne({ postId }).lean()
	if (!saved) return false

	if (!saved.notifiedAt) {
		await announce(ProcessedJobSchema.parse(saved), queue)
		logger.info({ postId }, 'Vaga salva anteriormente publicada para os canais')
	}

	return true
}

async function announce(job: ProcessedJob, queue: QueueClient) {
	await queue.publishEvent(EXCHANGES.jobPublished, job)
	await Job.updateOne({ postId: job.postId }, { notifiedAt: new Date() })
}
