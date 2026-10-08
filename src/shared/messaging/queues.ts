/** Filas do pipeline: cada uma tem o nome do serviço que a consome. */
export const QUEUES = {
	postProcessing: 'post-processing',
	storage: 'storage',
	discord: 'discord',
	cvUpdater: 'cv-updater',
	/** Currículos prontos, consumidos pelo discord-bot para entregar ao usuário. */
	discordCv: 'discord-cv',
	/** Comandos para o scraper (ex.: "coletar agora" vindo de outras fontes). */
	scraper: 'scraper',
} as const
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

export function retryQueueName(queue: QueueName) {
	return `${queue}.retry`
}

export function deadLetterQueueName(queue: QueueName) {
	return `${queue}.dlq`
}
