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

/** O que o currículo da vaga mudou em relação ao currículo base (o site mostra o ajuste). */
export const CvChangesSchema = z.object({
	/** Tecnologias da vaga que entraram no currículo. */
	addedSkills: z.array(z.string()),
	/** Habilidades do currículo base que saíram por não terem relação com a vaga. */
	removedSkills: z.array(z.string()),
	/** A apresentação reescrita para a vaga; `null` quando ficou a do currículo base. */
	summary: z.object({ before: z.string(), after: z.string() }).nullable(),
	/** Os projetos que ficaram no PDF, na ordem em que aparecem. */
	projects: z.array(z.string()),
})
export type CvChanges = z.infer<typeof CvChangesSchema>

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
	/** O ajuste feito para a vaga, com o currículo gerado; `null` na falha. O padrão aceita resultados de antes do campo. */
	changes: CvChangesSchema.nullable().default(null),
	/**
	 * De qual currículo base o PDF saiu: `versionId` da versão ativa no banco, ou `null` para o arquivo. `null` na falha;
	 * o padrão aceita resultados de antes do campo.
	 */
	base: z.object({ versionId: z.string().nullable() }).nullable().default(null),
})

export type CvResult = z.infer<typeof CvResultSchema>

/** Tamanho máximo do `.tex` do currículo base (um currículo tem por volta de 10 KB). */
export const CV_BASE_TEX_MAX_BYTES = 200 * 1024

/** O `.tex` do currículo base, com o limite de tamanho em bytes (UTF-8). */
export const CvBaseTexSchema = z
	.string()
	.refine(tex => tex.trim().length > 0, 'O .tex está vazio')
	.refine(tex => new TextEncoder().encode(tex).length <= CV_BASE_TEX_MAX_BYTES, `O .tex passa de ${CV_BASE_TEX_MAX_BYTES / 1024} KB`)

/**
 * Mensagem da fila `cv-updater-base`: validar um `.tex` candidato a currículo base (interpretar, conferir as seções e
 * compilar). O resultado vai para `replyTo.queue`, como nos pedidos de currículo.
 */
export const CvBaseValidationRequestSchema = z.object({
	validationId: z.string().min(1),
	tex: CvBaseTexSchema,
	replyTo: ReplyToSchema,
	requestedAt: z.iso.datetime(),
})

export type CvBaseValidationRequest = z.infer<typeof CvBaseValidationRequestSchema>

/** Resultado da validação: sem `errors`, o `.tex` pode virar o currículo base; `pdf` (base64) é a pré-visualização. */
export const CvBaseValidationResultSchema = z.object({
	validationId: z.string().min(1),
	context: z.record(z.string(), z.unknown()),
	errors: z.array(z.string()),
	pages: z.number().int().nullable(),
	pdf: z.string().min(1).nullable(),
})

export type CvBaseValidationResult = z.infer<typeof CvBaseValidationResultSchema>
