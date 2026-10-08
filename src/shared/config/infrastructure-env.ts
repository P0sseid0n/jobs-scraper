import { z } from 'zod'

export const rabbitmqEnv = {
	RABBITMQ_URL: z.string().startsWith('amqp'),
	QUEUE_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
	QUEUE_RETRY_DELAY_MS: z.coerce.number().int().positive().default(5_000),
}

export const mongoEnv = {
	MONGO_URL: z.string().startsWith('mongodb'),
}

export const ollamaEnv = {
	OLLAMA_HOST: z.url().default('http://localhost:11434'),
	OLLAMA_MODEL: z.string().min(1).default('gemma3:4b'),
}
