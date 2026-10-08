import amqplib, { type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib'
import type { z } from 'zod'

import type { Logger } from '../logging/logger'
import { decideOnFailure, PermanentError } from './failure-policy'
import { deadLetterQueueName, retryQueueName, type QueueName } from './queues'

type QueueClientOptions = {
	url: string
	maxRetries: number
	retryDelayMs: number
	logger: Logger
}

type Consumer = {
	queue: QueueName
	schema: z.ZodType
	handler: (payload: unknown) => Promise<void>
	prefetch: number
	tag?: string
}

const RETRY_HEADER = 'x-retry'
const MAX_RECONNECT_DELAY_MS = 30_000

/**
 * Cliente RabbitMQ compartilhado pelos serviços:
 * - reconecta com backoff e registra os consumers de novo quando a conexão cai;
 * - publica mensagens persistentes com confirmação do broker;
 * - para cada fila `X` declara `X.retry` (espera com TTL e volta para `X`) e `X.dlq` (falhas definitivas);
 * - sempre faz ack/nack: sucesso → ack, erro transitório → retry com backoff, erro permanente ou retries esgotados → DLQ.
 */
export class QueueClient {
	private connection?: ChannelModel
	private channel?: ConfirmChannel
	private connecting?: Promise<void>
	private closing = false

	private readonly declared = new Set<QueueName>()
	private readonly consumers: Consumer[] = []
	private readonly inFlight = new Set<Promise<void>>()
	private readonly logger: Logger

	constructor(private readonly options: QueueClientOptions) {
		this.logger = options.logger.child({ component: 'queue' })
	}

	connect(): Promise<void> {
		this.connecting ??= this.connectWithRetry().finally(() => {
			this.connecting = undefined
		})

		return this.connecting
	}

	/** Declara a fila (com retry e DLQ). Idempotente; é refeito automaticamente após reconexões. */
	async assertQueue(queue: QueueName) {
		const channel = await this.getChannel()
		if (this.declared.has(queue)) return

		try {
			await assertTopology(channel, queue)
		} catch (error) {
			throw isPreconditionFailed(error) ? toPreconditionError(error) : error
		}

		this.declared.add(queue)
	}

	/** Publica uma mensagem persistente e espera a confirmação do broker. */
	async publish(queue: QueueName, payload: unknown) {
		await this.assertQueue(queue)
		const channel = await this.getChannel()

		channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
			persistent: true,
			contentType: 'application/json',
			timestamp: Date.now(),
		})

		await channel.waitForConfirms()
	}

	/** Consome a fila validando cada mensagem com `schema`. Se o handler terminar sem erro, a mensagem recebe ack. */
	async consume<S extends z.ZodType>(
		queue: QueueName,
		schema: S,
		handler: (payload: z.output<S>) => Promise<void>,
		options: { prefetch?: number } = {},
	) {
		await this.assertQueue(queue)

		const consumer: Consumer = {
			queue,
			schema,
			handler: handler as Consumer['handler'],
			prefetch: options.prefetch ?? 1,
		}
		this.consumers.push(consumer)
		await this.startConsumer(consumer)

		this.logger.info({ queue }, 'Aguardando mensagens')
	}

	/** Para de consumir, espera as mensagens em andamento terminarem e fecha a conexão. */
	async close() {
		this.closing = true
		const channel = this.channel

		if (channel) {
			for (const consumer of this.consumers) {
				if (consumer.tag) await channel.cancel(consumer.tag).catch(() => {})
			}
		}

		await Promise.allSettled(this.inFlight)
		await channel?.close().catch(() => {})
		await this.connection?.close().catch(() => {})

		this.logger.info('Conexão com o RabbitMQ encerrada')
	}

	// ----------------------------------------------------------------------------------------------- conexão

	private async connectWithRetry() {
		for (let attempt = 0; !this.closing; attempt++) {
			try {
				await this.openChannel()
				this.logger.info('Conectado ao RabbitMQ')
				return
			} catch (error) {
				if (isPreconditionFailed(error)) throw toPreconditionError(error)

				const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1_000 * 2 ** attempt)
				this.logger.warn({ err: error, attempt, delayMs: delay }, 'Falha ao conectar no RabbitMQ, tentando novamente')
				await Bun.sleep(delay)
			}
		}
	}

	private async openChannel() {
		const connection = await amqplib.connect(this.options.url)

		try {
			const channel = await connection.createConfirmChannel()

			connection.on('error', error => this.logger.error({ err: error }, 'Erro na conexão com o RabbitMQ'))
			connection.on('close', () => this.handleDisconnect(connection))
			channel.on('error', error => this.logger.error({ err: error }, 'Erro no canal do RabbitMQ'))

			// Um canal pode fechar sozinho (ex.: erro de protocolo) com a conexão ainda aberta: força a reconexão completa
			channel.on('close', () => {
				if (!this.closing && this.connection === connection) connection.close().catch(() => {})
			})

			for (const queue of this.declared) await assertTopology(channel, queue)

			this.connection = connection
			this.channel = channel

			for (const consumer of this.consumers) await this.startConsumer(consumer)
		} catch (error) {
			await connection.close().catch(() => {})
			throw error
		}
	}

	private handleDisconnect(connection: ChannelModel) {
		if (this.connection !== connection) return

		this.connection = undefined
		this.channel = undefined
		if (this.closing) return

		this.logger.warn('Conexão com o RabbitMQ perdida, reconectando...')
		this.connect().catch(error => this.logger.fatal({ err: error }, 'Não foi possível reconectar ao RabbitMQ'))
	}

	private async getChannel() {
		if (!this.channel) await this.connect()
		if (!this.channel) throw new Error('Canal do RabbitMQ indisponível')

		return this.channel
	}

	// ----------------------------------------------------------------------------------------------- consumo

	private async startConsumer(consumer: Consumer) {
		const channel = this.channel
		if (!channel) return // será iniciado ao reconectar

		await channel.prefetch(consumer.prefetch)

		const { consumerTag } = await channel.consume(consumer.queue, msg => {
			if (!msg) {
				this.logger.warn({ queue: consumer.queue }, 'Consumer cancelado pelo broker')
				return
			}

			const task = this.handleMessage(consumer, channel, msg).finally(() => this.inFlight.delete(task))
			this.inFlight.add(task)
		})

		consumer.tag = consumerTag
	}

	private async handleMessage(consumer: Consumer, channel: ConfirmChannel, msg: ConsumeMessage) {
		const retries = Number(msg.properties.headers?.[RETRY_HEADER] ?? 0)

		try {
			const payload = parseMessage(consumer, msg)
			await consumer.handler(payload)

			channel.ack(msg)
		} catch (error) {
			await this.handleFailure(consumer, channel, msg, error, retries)
		}
	}

	/** Erro transitório: reagenda na fila `.retry` com backoff. Erro permanente ou retries esgotados: DLQ. */
	private async handleFailure(consumer: Consumer, channel: ConfirmChannel, msg: ConsumeMessage, error: unknown, retries: number) {
		const logger = this.logger.child({ queue: consumer.queue, retries })
		const decision = decideOnFailure(error, retries, this.options)

		try {
			if (decision.action === 'dead-letter') {
				logger.error({ err: error }, 'Falha ao processar mensagem, enviando para a DLQ')
				channel.nack(msg, false, false)
				return
			}

			logger.warn({ err: error, delayMs: decision.delayMs }, 'Falha ao processar mensagem, agendando nova tentativa')

			channel.sendToQueue(retryQueueName(consumer.queue), msg.content, {
				...msg.properties,
				persistent: true,
				expiration: String(decision.delayMs),
				headers: { ...msg.properties.headers, [RETRY_HEADER]: retries + 1 },
			})
			await channel.waitForConfirms()

			channel.ack(msg)
		} catch (ackError) {
			// Canal caiu no meio do caminho: o broker devolve a mensagem para a fila sozinho
			logger.error({ err: ackError }, 'Não foi possível confirmar a mensagem; ela será reentregue')
		}
	}
}

function parseMessage(consumer: Consumer, msg: ConsumeMessage) {
	try {
		return consumer.schema.parse(JSON.parse(msg.content.toString()))
	} catch (error) {
		throw new PermanentError('Mensagem com formato inválido', { cause: error })
	}
}

/** Fila principal + `.retry` (volta para a principal depois do TTL) + `.dlq` (falhas definitivas). */
async function assertTopology(channel: ConfirmChannel, queue: QueueName) {
	await channel.assertQueue(deadLetterQueueName(queue), { durable: true })

	await channel.assertQueue(retryQueueName(queue), {
		durable: true,
		deadLetterExchange: '',
		deadLetterRoutingKey: queue,
	})

	await channel.assertQueue(queue, {
		durable: true,
		deadLetterExchange: '',
		deadLetterRoutingKey: deadLetterQueueName(queue),
	})
}

function isPreconditionFailed(error: unknown) {
	return error instanceof Error && 'code' in error && error.code === 406
}

function toPreconditionError(error: unknown) {
	return new Error(
		'A fila já existe no RabbitMQ com outra configuração (ex.: sem DLQ). Apague essa fila pelo painel em http://localhost:15672 e rode de novo.',
		{ cause: error },
	)
}
