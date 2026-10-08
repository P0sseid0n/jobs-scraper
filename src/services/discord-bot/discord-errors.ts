import { DiscordAPIError } from 'discord.js'

import { PermanentError } from '@shared/messaging'

/** Marca erros 4xx do Discord (exceto rate limit) como permanentes, para irem direto à DLQ. */
export function toQueueError(error: unknown) {
	if (error instanceof DiscordAPIError && error.status >= 400 && error.status < 500 && error.status !== 429) {
		return new PermanentError(`Discord recusou a mensagem (${error.status} ${error.code}): ${error.message}`, { cause: error })
	}

	return error
}

/** Diz se o token da interação expirou (mais de 15 min) ou é inválido. */
export function isExpiredInteraction(error: unknown) {
	return error instanceof DiscordAPIError && [401, 404].includes(error.status)
}
