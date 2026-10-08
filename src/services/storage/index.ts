import { ProcessedJobSchema, type ProcessedJob } from '@shared/contracts'
import { Job } from '@shared/database'
import { QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'

import { missingRequiredFields } from './job-validation'

// Salvar no Mongo é rápido e o upsert é idempotente: dá para processar várias mensagens em paralelo
const PREFETCH = 10

const { logger, queue } = await startService({ name: 'storage', database: true })

await queue.consume(QUEUES.storage, ProcessedJobSchema, saveJob, { prefetch: PREFETCH })

/** Salva a vaga (uma única vez) e a encaminha ao Discord. */
async function saveJob(data: ProcessedJob) {
	const log = logger.child({ postId: data.postId })

	const missing = missingRequiredFields(data)
	if (missing.length > 0) {
		log.warn({ missing }, 'Vaga sem os campos obrigatórios, descartando')
		return
	}

	// Upsert idempotente: a mesma vaga nunca é salva duas vezes, mesmo se a mensagem for reprocessada
	const job = await Job.findOneAndUpdate({ postId: data.postId }, { $setOnInsert: data }, { upsert: true, returnDocument: 'after' })

	if (job.notifiedAt) {
		log.info('Vaga já salva e anunciada anteriormente, ignorando')
		return
	}

	await queue.publish(QUEUES.discord, data)
	await Job.updateOne({ postId: data.postId }, { notifiedAt: new Date() })

	log.info('Vaga salva no MongoDB e enviada para o Discord')
}
