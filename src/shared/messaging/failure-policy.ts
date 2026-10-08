/** Erro que não adianta tentar de novo (payload inválido, por exemplo): a mensagem vai direto para a DLQ. */
export class PermanentError extends Error {
	override name = 'PermanentError'
}

export type FailureDecision = { action: 'retry'; delayMs: number } | { action: 'dead-letter' }

/** Decide entre retry (backoff exponencial: delay, 2×, 4×…) e DLQ para uma mensagem que falhou. */
export function decideOnFailure(error: unknown, retries: number, opts: { maxRetries: number; retryDelayMs: number }): FailureDecision {
	if (error instanceof PermanentError || retries >= opts.maxRetries) return { action: 'dead-letter' }
	return { action: 'retry', delayMs: opts.retryDelayMs * 2 ** retries }
}
