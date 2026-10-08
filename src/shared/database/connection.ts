import mongoose from 'mongoose'

import type { Logger } from '../logging/logger'
import { Job } from './job.model'
import { ScraperRun } from './scraper-run.model'
import { SeenPost } from './seen-post.model'
import { Settings } from './settings.model'

// Encerramento intencional: evita que o evento `disconnected` seja registrado como queda
let closing = false
let activeLogger: Logger | undefined

export async function connectDatabase(url: string, logger: Logger) {
	try {
		await mongoose.connect(url, { serverSelectionTimeoutMS: 10_000 })
	} catch (error) {
		throw new Error('Não foi possível conectar ao MongoDB (verifique MONGO_URL e se o container está rodando)', { cause: error })
	}
	await Promise.all([Job.init(), SeenPost.init(), Settings.init(), ScraperRun.init()])
	logger.info('Conectado ao MongoDB')

	mongoose.connection.on('disconnected', () => {
		if (!closing) logger.warn('Desconectado do MongoDB, o driver vai tentar reconectar')
	})
	mongoose.connection.on('reconnected', () => logger.info('Reconectado ao MongoDB'))

	activeLogger = logger
}

/** Fecha a conexão no encerramento; o aviso de queda fica só para desconexões inesperadas. */
export async function disconnectDatabase() {
	closing = true
	await mongoose.disconnect()

	activeLogger?.info('Conexão com o MongoDB encerrada')
}
