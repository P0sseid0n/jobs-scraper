import { z } from 'zod'

export const discordEnv = {
	DISCORD_TOKEN: z.string().min(1),
	DISCORD_CHANNEL_ID: z.string().regex(/^\d+$/, 'deve ser o ID numérico do canal'),
}
