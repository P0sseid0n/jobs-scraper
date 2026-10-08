import { DiscordAPIError } from 'discord.js'

import { PermanentError } from '@shared/messaging'

/** Erros 4xx da API (exceto rate limit, que o discord.js já trata) não se resolvem tentando de novo: vão para a DLQ. */
export function toQueueError(error: unknown) {
	if (error instanceof DiscordAPIError && error.status >= 400 && error.status < 500 && error.status !== 429) {
		return new PermanentError(`Discord recusou a mensagem (${error.status} ${error.code}): ${error.message}`, { cause: error })
	}

	return error
}

/** Token de interação expirado (mais de 15 min) ou inválido. */
export function isExpiredInteraction(error: unknown) {
	return error instanceof DiscordAPIError && [401, 404].includes(error.status)
}
