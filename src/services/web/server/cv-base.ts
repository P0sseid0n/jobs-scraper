import { z } from 'zod'

import {
	CV_BASE_TEX_MAX_BYTES,
	CV_FORM_DEFAULT_TITLES,
	CvBaseTexSchema,
	CvFormSchema,
	type CvBaseValidationRequest,
	type CvBaseValidationResult,
	type CvForm,
} from '@shared/contracts'
import { ACTIVE_CV_BASE, CvBaseVersion, type CvBaseVersionDocument } from '@shared/database'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'

import { formToLatex } from '../../cv-updater/resume/latex-from-form'
import { isSectionTitle } from '../../cv-updater/resume/latex-syntax'
import type { WebCvBase, WebCvBaseVersion, WebCvBaseVersionWithTex } from '../api-types'
import { CV_TIMEOUT_MS } from './cv-request.model'
import type { EventHub } from './event-hub'
import { HttpError, readJson } from './http'

const LIST_LIMIT = 30
/** Versões nunca ativadas somem do histórico depois desse tempo. */
const UNUSED_DAYS = 7
const SUMMARY = { tex: 0, pdf: 0, form: 0 } as const

export const CV_BASE_TIMEOUT_ERROR = 'O cv-updater não respondeu em 10 minutos. Confira se ele está rodando e envie de novo.'

/** Corpo do `POST /api/cv-base/versions` com o `.tex` enviado ou escrito no site. */
const TexVersionSchema = z.object({
	tex: CvBaseTexSchema,
	fileName: z.string().trim().min(1).max(200).nullable().default(null),
})

/** Corpo do `POST /api/cv-base/versions` com os dados do formulário. */
const FormVersionSchema = z.object({ form: CvFormSchema }).superRefine(({ form }, ctx) => {
	form.sections.forEach((section, index) => {
		if (isSectionTitle(section.kind, section.title)) return
		ctx.addIssue({
			code: 'custom',
			path: ['form', 'sections', index, 'title'],
			message: `O cv-updater não reconhece "${section.title}" como esta seção; use um sinônimo (ex.: ${CV_FORM_DEFAULT_TITLES[section.kind]}) ou deixe vazio.`,
		})
	})
})

/** Os dados do formulário guardados na versão, com os campos que vieram depois (título, rótulo) no padrão. */
export function storedForm(form: unknown): CvForm | null {
	if (!form) return null
	const parsed = CvFormSchema.safeParse(form)
	return parsed.success ? parsed.data : null
}

/**
 * O `.tex` da versão nova e de onde ele veio. Com `form`, o `.tex` é gerado dele (e os dados ficam na versão).
 * Escolhe o schema pelo corpo, em vez de uma união, para os erros apontarem os campos (`form.contact.name`).
 * @throws {ZodError} Corpo inválido. @throws {HttpError} `.tex` gerado grande demais.
 */
export function parseNewVersion(body: unknown): { tex: string; fileName: string | null; form: CvForm | null } {
	if (typeof body === 'object' && body !== null && 'form' in body) {
		const { form } = FormVersionSchema.parse(body)
		const tex = formToLatex(form)
		if (!CvBaseTexSchema.safeParse(tex).success) {
			throw new HttpError(400, `O currículo gerado passa de ${CV_BASE_TEX_MAX_BYTES / 1024} KB; encurte os textos`)
		}
		return { tex, fileName: null, form }
	}

	return { ...TexVersionSchema.parse(body), form: null }
}

type Deps = { queue: QueueClient; events: EventHub; logger: Logger }

type VersionSummary = Omit<CvBaseVersionDocument, 'tex' | 'pdf' | 'form'>

/** Converte o documento no formato da API; validações sem resposta há tempo demais aparecem como recusadas. */
export function toWebCvBaseVersion(doc: VersionSummary, now = new Date()): WebCvBaseVersion {
	const timedOut = doc.status === 'validating' && now.getTime() - doc.createdAt.getTime() > CV_TIMEOUT_MS

	return {
		versionId: doc.versionId,
		fileName: doc.fileName,
		fromForm: doc.fromForm ?? false,
		status: timedOut ? 'invalid' : doc.status,
		errors: timedOut ? [CV_BASE_TIMEOUT_ERROR] : doc.problems,
		pages: doc.pages,
		size: doc.size,
		createdAt: doc.createdAt.toISOString(),
		validatedAt: doc.validatedAt?.toISOString() ?? null,
		activatedAt: doc.activatedAt?.toISOString() ?? null,
		expiresAt: doc.expiresAt?.toISOString() ?? null,
	}
}

/** `GET /api/cv-base`: as versões mais recentes e a ativa (sem o `.tex` nem o PDF). */
export async function listCvBaseVersions() {
	const [recent, active] = await Promise.all([
		CvBaseVersion.find({}, SUMMARY).sort({ createdAt: -1 }).limit(LIST_LIMIT).lean<VersionSummary[]>(),
		CvBaseVersion.findOne(ACTIVE_CV_BASE.filter, SUMMARY).sort(ACTIVE_CV_BASE.sort).lean<VersionSummary>(),
	])

	const docs = active && !recent.some(doc => doc.versionId === active.versionId) ? [...recent, active] : recent
	const now = new Date()

	return Response.json({ versions: docs.map(doc => toWebCvBaseVersion(doc, now)) } satisfies WebCvBase)
}

/** `GET /api/cv-base/versions/:versionId`: a versão com o `.tex`. */
export async function getCvBaseVersion(req: Request & { params: { versionId: string } }) {
	const doc = await CvBaseVersion.findOne({ versionId: req.params.versionId }, { pdf: 0 }).lean<Omit<CvBaseVersionDocument, 'pdf'>>()
	if (!doc) throw new HttpError(404, 'Versão do currículo base não encontrada')

	return Response.json({ ...toWebCvBaseVersion(doc), tex: doc.tex, form: storedForm(doc.form) } satisfies WebCvBaseVersionWithTex)
}

/** `GET /api/cv-base/versions/:versionId/pdf`: a pré-visualização compilada na validação. */
export async function getCvBasePdf(req: Request & { params: { versionId: string } }) {
	// Sem `.lean()`: com ele o `pdf` vem como `Binary` do BSON (ver getCvPdf)
	const doc = await CvBaseVersion.findOne({ versionId: req.params.versionId }, { pdf: 1 })
	if (!doc?.pdf) throw new HttpError(404, 'Pré-visualização não encontrada (a versão ainda está validando ou não compilou)')

	return new Response(new Blob([new Uint8Array(doc.pdf)]), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': 'inline; filename="Curriculo-base.pdf"',
			'Cache-Control': 'private, no-cache',
		},
	})
}

/**
 * `POST /api/cv-base/versions`: guarda o `.tex` (enviado ou gerado do formulário) como uma versão nova e pede a
 * validação ao cv-updater; responde 202. A versão só pode ser ativada depois de validada.
 */
export async function createCvBaseVersion(req: Request, { queue, events, logger }: Deps) {
	const source = parseNewVersion(await readJson(req))
	const now = new Date()

	const doc = await CvBaseVersion.create({
		versionId: crypto.randomUUID(),
		tex: source.tex,
		size: Buffer.byteLength(source.tex),
		fileName: source.fileName,
		form: source.form,
		fromForm: source.form !== null,
		status: 'validating',
		createdAt: now,
		expiresAt: new Date(now.getTime() + UNUSED_DAYS * 24 * 60 * 60 * 1000),
	})

	const request: CvBaseValidationRequest = {
		validationId: doc.versionId,
		tex: doc.tex,
		replyTo: { queue: QUEUES.webCvBase, context: {} },
		requestedAt: now.toISOString(),
	}
	await queue.publish(QUEUES.cvUpdaterBase, request)

	const version = toWebCvBaseVersion(doc.toObject())
	events.broadcast('cvBase', version)
	logger.info(
		{ versionId: doc.versionId, size: doc.size, fromForm: doc.fromForm },
		'Validação de currículo base solicitada pelo site',
	)

	return Response.json(version satisfies WebCvBaseVersion, { status: 202 })
}

/** `POST /api/cv-base/versions/:versionId/activate`: torna a versão (já validada) o currículo base. */
export async function activateCvBaseVersion(
	req: Request & { params: { versionId: string } },
	{ events, logger }: Omit<Deps, 'queue'>,
) {
	const { versionId } = req.params

	const doc = await CvBaseVersion.findOneAndUpdate(
		{ versionId, status: 'valid' },
		{ activatedAt: new Date(), expiresAt: null },
		{ returnDocument: 'after', projection: SUMMARY, lean: true },
	)

	if (!doc) {
		const exists = await CvBaseVersion.exists({ versionId })
		throw exists
			? new HttpError(409, 'Só uma versão validada, sem erros, pode virar o currículo base')
			: new HttpError(404, 'Versão do currículo base não encontrada')
	}

	const version = toWebCvBaseVersion(doc)
	events.broadcast('cvBase', version)
	logger.info({ versionId }, 'Currículo base trocado pelo site')

	return Response.json(version satisfies WebCvBaseVersion)
}

/** Consumidor da fila `web-cv-base`: guarda o resultado da validação e avisa os navegadores conectados. */
export async function saveCvBaseValidation(result: CvBaseValidationResult, { events, logger }: Omit<Deps, 'queue'>) {
	const valid = result.errors.length === 0 && result.pdf !== null

	const doc = await CvBaseVersion.findOneAndUpdate(
		{ versionId: result.validationId },
		{
			status: valid ? 'valid' : 'invalid',
			problems: valid ? [] : result.errors.length ? result.errors : ['O cv-updater não devolveu a pré-visualização.'],
			pages: result.pages,
			pdf: result.pdf ? Buffer.from(result.pdf, 'base64') : null,
			validatedAt: new Date(),
		},
		{ returnDocument: 'after', projection: SUMMARY, lean: true },
	)

	if (!doc) {
		logger.warn({ versionId: result.validationId }, 'Versão do currículo base não encontrada (expirou?), ignorando')
		return
	}

	events.broadcast('cvBase', toWebCvBaseVersion(doc))
	logger.info({ versionId: doc.versionId, status: doc.status, pages: doc.pages }, 'Validação do currículo base recebida')
}
