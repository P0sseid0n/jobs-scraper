/** Filas do pipeline: cada uma tem o nome do serviço que a consome. */
export const QUEUES = {
	postProcessing: 'post-processing',
	storage: 'storage',
	/** Vagas para o discord-bot publicar (ligada à exchange `job-published`). */
	discord: 'discord',
	cvUpdater: 'cv-updater',
	/** Currículos prontos para o discord-bot entregar (é o `replyTo.queue` dos pedidos dele). */
	discordCv: 'discord-cv',
	/** Comandos para o scraper (ex.: "coletar agora" vindo de outras fontes). */
	scraper: 'scraper',
	/** Vagas para o site repassar ao navegador em tempo real (ligada à exchange `job-published`). */
	web: 'web',
	/** Currículos prontos pedidos pelo site (é o `replyTo.queue` dos pedidos dele). */
	webCv: 'web-cv',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

/**
 * Eventos (exchanges fanout): cada canal interessado liga a própria fila na exchange e recebe todas as mensagens.
 * Quem publica não sabe quais canais existem.
 */
export const EXCHANGES = {
	/** Vaga nova salva no banco, pronta para ser divulgada. */
	jobPublished: 'job-published',
} as const

export type ExchangeName = (typeof EXCHANGES)[keyof typeof EXCHANGES]

export function retryQueueName(queue: string) {
	return `${queue}.retry`
}

export function deadLetterQueueName(queue: string) {
	return `${queue}.dlq`
}
