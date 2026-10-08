import { z } from 'zod'

export const SCRAPER_COMMANDS = ['run-now'] as const

/** Mensagem da fila `scraper`: comando para o scraper (ex.: "coletar agora" vindo de outras fontes). */
export const ScraperCommandSchema = z.object({
	command: z.enum(SCRAPER_COMMANDS),
	requestedBy: z.string().nullable().default(null),
	requestedAt: z.iso.datetime(),
})

export type ScraperCommand = z.infer<typeof ScraperCommandSchema>
