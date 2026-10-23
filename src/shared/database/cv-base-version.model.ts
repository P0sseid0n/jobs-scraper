import mongoose, { Schema } from 'mongoose'

import type { CvForm } from '../contracts/cv-form'

export const CV_BASE_STATUSES = ['validating', 'valid', 'invalid'] as const
export type CvBaseStatus = (typeof CV_BASE_STATUSES)[number]

export type CvBaseVersionDocument = {
	versionId: string
	tex: string
	/** Tamanho do `.tex` em bytes, para a lista não precisar carregar o texto. */
	size: number
	/** Nome do arquivo enviado; `null` quando o texto foi escrito ou editado no site. */
	fileName: string | null
	/** Dados do formulário de onde o `.tex` foi gerado, para reabrir e editar; `null` nas versões escritas em LaTeX. */
	form: CvForm | null
	/** Se veio do formulário, para a lista não precisar carregar o `form`; ausente nas versões de antes do campo. */
	fromForm?: boolean
	status: CvBaseStatus
	/** Por que a versão foi recusada (seções que faltam, erros do LaTeX). */
	problems: string[]
	pages: number | null
	/** Pré-visualização compilada pelo cv-updater. */
	pdf: Buffer | null
	createdAt: Date
	validatedAt: Date | null
	/** Quando virou o currículo base pela última vez; a ativa é a de data mais recente. */
	activatedAt: Date | null
	/** Versões nunca ativadas são apagadas pelo MongoDB nessa data; ao ativar, vira `null` e a versão fica. */
	expiresAt: Date | null
}

/**
 * Versões do currículo base enviadas pelo site. Trocar a versão ativa (ou voltar para uma anterior) é só atualizar
 * o `activatedAt` dela: uma única escrita, sem momento em que nenhuma está ativa.
 */
const cvBaseVersionSchema = new Schema<CvBaseVersionDocument>(
	{
		versionId: { type: String, required: true, unique: true },
		tex: { type: String, required: true },
		size: { type: Number, required: true },
		fileName: { type: String, default: null },
		form: { type: Schema.Types.Mixed, default: null },
		fromForm: { type: Boolean, default: false },
		status: { type: String, enum: CV_BASE_STATUSES, required: true },
		problems: { type: [String], default: [] },
		pages: { type: Number, default: null },
		pdf: { type: Buffer, default: null },
		createdAt: { type: Date, required: true },
		validatedAt: { type: Date, default: null },
		activatedAt: { type: Date, default: null },
		expiresAt: { type: Date, default: null },
	},
	{ versionKey: false },
)

cvBaseVersionSchema.index({ activatedAt: -1 })
cvBaseVersionSchema.index({ createdAt: -1 })
cvBaseVersionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const CvBaseVersion = mongoose.model('CvBaseVersion', cvBaseVersionSchema, 'cv_base_versions')

/** Filtro e ordem que acham a versão ativa: a última ativada. */
export const ACTIVE_CV_BASE = { filter: { activatedAt: { $ne: null } }, sort: { activatedAt: -1 } } as const

/** A versão ativa do currículo base (só o `.tex` e o id), ou `null` se nenhuma foi ativada pelo site. */
export function findActiveCvBase() {
	return CvBaseVersion.findOne(ACTIVE_CV_BASE.filter, { versionId: 1, tex: 1 })
		.sort(ACTIVE_CV_BASE.sort)
		.lean<Pick<CvBaseVersionDocument, 'versionId' | 'tex'>>()
}
