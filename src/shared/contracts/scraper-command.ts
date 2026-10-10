import { z } from 'zod'

export const SCRAPER_COMMANDS = ['run-now'] as const

/** Mensagem da fila `scraper`: comando para o scraper (ex.: "coletar agora" vindo de outras fontes). */
export const ScraperCommandSchema = z.object({
	command: z.enum(SCRAPER_COMMANDS),
	requestedBy: z.string().nullable().default(null),
	requestedAt: z.iso.datetime(),
})

export type ScraperCommand = z.infer<typeof ScraperCommandSchema>

/** Mensagem da fila `scraper-verification`: código de verificação (e-mail/SMS/app autenticador) pedido pelo LinkedIn no login. */
export const VerificationCodeSchema = z.object({
	code: z
		.string()
		.trim()
		.regex(/^\d{4,10}$/, 'O código de verificação tem só números (normalmente 6)'),
	requestedAt: z.iso.datetime(),
})

export type VerificationCode = z.infer<typeof VerificationCodeSchema>
