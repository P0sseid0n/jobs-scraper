import { z } from 'zod'

/** Token de uma interação do Discord: permite responder (follow-up) ao clique por até 15 minutos. */
const DiscordInteractionSchema = z.object({ applicationId: z.string().min(1), token: z.string().min(1) })

/** Mensagem da fila `cv-updater`: pedido de currículo ajustado para uma vaga. */
export const CvRequestSchema = z.object({
	postId: z.string().min(1),
	requestedBy: z.string().min(1),
	interaction: DiscordInteractionSchema,
	requestedAt: z.iso.datetime(),
})
export type CvRequest = z.infer<typeof CvRequestSchema>

/** Mensagem da fila `discord-cv`: currículo gerado (ou o motivo da falha) para o bot entregar. */
export const CvResultSchema = z.object({
	postId: z.string().min(1),
	interaction: DiscordInteractionSchema,
	jobTitle: z.string().nullable(),
	file: z.object({ name: z.string().min(1), base64: z.string().min(1) }).nullable(),
	error: z.string().nullable(),
})
export type CvResult = z.infer<typeof CvResultSchema>
