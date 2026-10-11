import { z } from 'zod'

/**
 * Para onde o resultado do currículo volta: a fila de quem pediu e um contexto que o cv-updater devolve sem
 * interpretar (ex.: o token da interação do Discord). Assim qualquer canal pode pedir currículo.
 */
const ReplyToSchema = z.object({
	queue: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'Nome de fila inválido'),
	context: z.record(z.string(), z.unknown()).default({}),
})

/** Mensagem da fila `cv-updater`: pedido de currículo ajustado para uma vaga. */
export const CvRequestSchema = z.object({
	postId: z.string().min(1),
	requestedBy: z.string().min(1),
	replyTo: ReplyToSchema,
	requestedAt: z.iso.datetime(),
})

export type CvRequest = z.infer<typeof CvRequestSchema>

/** E-mail de candidatura sugerido para a vaga (gerado pela IA no cv-updater). */
export const ApplicationMessageSchema = z.object({ subject: z.string().min(1), body: z.string().min(1) })
export type ApplicationMessage = z.infer<typeof ApplicationMessageSchema>

/** Mensagem da fila indicada em `replyTo.queue`: currículo gerado (ou o motivo da falha), com o contexto do pedido. */
export const CvResultSchema = z.object({
	postId: z.string().min(1),
	context: z.record(z.string(), z.unknown()),
	jobTitle: z.string().nullable(),
	file: z.object({ name: z.string().min(1), base64: z.string().min(1) }).nullable(),
	error: z.string().nullable(),
	/**
	 * E-mail de candidatura escrito para a vaga, quando ela tem e-mail de contato e a IA respondeu algo válido;
	 * `null` nos outros casos (os canais mostram o modelo padrão). O padrão aceita resultados de antes do campo.
	 */
	message: ApplicationMessageSchema.nullable().default(null),
})

export type CvResult = z.infer<typeof CvResultSchema>
