import { z } from 'zod'

export const SCRAPER_COMMANDS = ['run-now'] as const

/** Mensagem da fila `scraper`: comando para o scraper (ex.: "coletar agora" vindo de outras fontes). */
export const ScraperCommandSchema = z.object({
	command: z.enum(SCRAPER_COMMANDS),
	requestedBy: z.string().nullable().default(null),
	requestedAt: z.iso.datetime(),
	/** Com ele, o scraper responde no evento `scraper-run` se atendeu o pedido (o site espera essa resposta). */
	requestId: z.string().min(1).nullable().default(null),
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

/** Mensagem da fila `scraper-login-test`: o site pediu para testar o login do LinkedIn com a conta salva. */
export const LoginTestRequestSchema = z.object({ requestedAt: z.iso.datetime() })

export type LoginTestRequest = z.infer<typeof LoginTestRequestSchema>
