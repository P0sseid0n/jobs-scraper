import { CV_IMPORT_PDF_MAX_BYTES, type CvImportRequest, type CvImportResult } from '@shared/contracts'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'

import type { WebCvImport } from '../api-types'
import { CV_TIMEOUT_MS } from './cv-request.model'
import type { EventHub } from './event-hub'
import { HttpError } from './http'

export const CV_IMPORT_TIMEOUT_ERROR = 'O cv-updater não leu o PDF em 10 minutos. Confira se ele está rodando e envie de novo.'

const MAX_SIZE_MB = CV_IMPORT_PDF_MAX_BYTES / 1024 / 1024

/**
 * As importações em andamento e as respondidas há pouco, só em memória: o PDF e o formulário lido não vão para o banco
 * (só a versão que a pessoa salvar depois). Reiniciar o site perde as em andamento; quem importava envia de novo.
 */
export class CvImports {
	private readonly imports = new Map<string, WebCvImport & { createdAt: number }>()

	start(now = Date.now()) {
		this.sweep(now)
		const importId = crypto.randomUUID()
		this.imports.set(importId, { importId, status: 'pending', form: null, error: null, createdAt: now })
		return importId
	}

	/** Guarda o resultado; `null` se a importação não existe mais (expirou ou o site reiniciou). */
	finish(result: CvImportResult): WebCvImport | null {
		const current = this.imports.get(result.importId)
		if (!current) return null

		const done: WebCvImport = {
			importId: result.importId,
			status: result.form ? 'done' : 'failed',
			form: result.form,
			error: result.form ? null : (result.error ?? 'O cv-updater não devolveu o formulário.'),
		}
		this.imports.set(result.importId, { ...done, createdAt: current.createdAt })
		return done
	}

	/** A importação como a API devolve; sem resposta há tempo demais, aparece como falha. */
	get(importId: string, now = Date.now()): WebCvImport | null {
		this.sweep(now)
		const found = this.imports.get(importId)
		if (!found) return null

		const { createdAt, ...current } = found
		if (current.status === 'pending' && now - createdAt > CV_TIMEOUT_MS) {
			return { ...current, status: 'failed', error: CV_IMPORT_TIMEOUT_ERROR }
		}
		return current
	}

	/** Esquece as importações de mais de duas vezes o tempo limite: quem esperava já desistiu ou recebeu. */
	private sweep(now: number) {
		for (const [importId, entry] of this.imports) {
			if (now - entry.createdAt > 2 * CV_TIMEOUT_MS) this.imports.delete(importId)
		}
	}
}

type Deps = { imports: CvImports; queue: QueueClient; events: EventHub; logger: Logger }

/**
 * `POST /api/cv-base/imports`: o PDF do currículo no corpo (`application/pdf`). Pede ao cv-updater que preencha o
 * formulário com ele e responde 202 com o id; o resultado chega pelo stream (`cvImport`) ou pelo `GET`.
 */
export async function requestCvImport(req: Request, { imports, queue, logger }: Omit<Deps, 'events'>) {
	const declared = Number(req.headers.get('Content-Length'))
	if (declared > CV_IMPORT_PDF_MAX_BYTES) throw new HttpError(413, `O PDF passa de ${MAX_SIZE_MB} MB`)

	const pdf = Buffer.from(await req.arrayBuffer())
	if (pdf.length === 0) throw new HttpError(400, 'Envie o PDF do currículo')
	if (pdf.length > CV_IMPORT_PDF_MAX_BYTES) throw new HttpError(413, `O PDF passa de ${MAX_SIZE_MB} MB`)

	const importId = imports.start()
	const request: CvImportRequest = {
		importId,
		pdf: pdf.toString('base64'),
		replyTo: { queue: QUEUES.webCvImport, context: {} },
		requestedAt: new Date().toISOString(),
	}
	await queue.publish(QUEUES.cvUpdaterImport, request)

	logger.info({ importId, bytes: pdf.length }, 'Importação de currículo em PDF solicitada pelo site')
	return Response.json(imports.get(importId) satisfies WebCvImport | null, { status: 202 })
}

/** `GET /api/cv-base/imports/:importId`: a importação, para quem perdeu o evento do stream. */
export function getCvImport(req: Request & { params: { importId: string } }, imports: CvImports) {
	const found = imports.get(req.params.importId)
	if (!found) throw new HttpError(404, 'Importação não encontrada (o site reiniciou ou ela expirou). Envie o PDF de novo.')

	return Response.json(found satisfies WebCvImport)
}

/** Consumidor da fila `web-cv-import`: guarda o resultado e avisa os navegadores conectados. */
export async function saveCvImportResult(result: CvImportResult, { imports, events, logger }: Omit<Deps, 'queue'>) {
	const done = imports.finish(result)
	if (!done) {
		logger.warn({ importId: result.importId }, 'Importação de currículo não encontrada (expirou?), ignorando')
		return
	}

	events.broadcast('cvImport', done)
	logger.info({ importId: done.importId, status: done.status }, 'Importação de currículo recebida')
}
