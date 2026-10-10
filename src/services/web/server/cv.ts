import { z } from 'zod'

import type { CvRequest, CvResult } from '@shared/contracts'
import { Job } from '@shared/database'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'

import type { WebCvRequest } from '../api-types'
import { CV_TIMEOUT_MS, CvRequestRecord, toWebCvRequest } from './cv-request.model'
import type { EventHub } from './event-hub'
import { HttpError } from './http'
import { LISTABLE_JOBS } from './jobs-query'

const LIST_LIMIT = 100
const WITHOUT_PDF = { pdf: 0 } as const

/** Contexto que o site manda no `replyTo` do pedido: o id do pedido, para achar o registro quando o PDF voltar. */
const WebReplyContextSchema = z.object({ requestId: z.uuid() })

type Deps = { queue: QueueClient; events: EventHub; logger: Logger }

/**
 * `POST /api/jobs/:postId/cv`: pede o currículo ao cv-updater e responde 202 com o pedido.
 * Se já houver um pedido em andamento para a mesma vaga, devolve esse em vez de gerar outro.
 */
export async function requestCv(req: Request & { params: { postId: string } }, { queue, events, logger }: Deps) {
	const { postId } = req.params

	const job = await Job.findOne({ ...LISTABLE_JOBS, postId }, { title: 1, company: 1 }).lean()
	if (!job) throw new HttpError(404, 'Vaga não encontrada')

	const pending = await CvRequestRecord.findOne(
		{ postId, status: 'pending', requestedAt: { $gt: new Date(Date.now() - CV_TIMEOUT_MS) } },
		WITHOUT_PDF,
	).lean()
	if (pending) return Response.json(toWebCvRequest(pending) satisfies WebCvRequest, { status: 202 })

	const record = await CvRequestRecord.create({
		requestId: crypto.randomUUID(),
		postId,
		jobTitle: job.title ?? null,
		company: job.company ?? null,
		status: 'pending',
		requestedAt: new Date(),
	})

	const request: CvRequest = {
		postId,
		requestedBy: 'web',
		replyTo: { queue: QUEUES.webCv, context: { requestId: record.requestId } },
		requestedAt: record.requestedAt.toISOString(),
	}
	await queue.publish(QUEUES.cvUpdater, request)

	const result = toWebCvRequest(record.toObject())
	events.broadcast('cv', result)
	logger.info({ postId, requestId: record.requestId }, 'Currículo ajustado solicitado pelo site')

	return Response.json(result satisfies WebCvRequest, { status: 202 })
}

/** `GET /api/cv`: pedidos mais recentes primeiro (sem os PDFs). */
export async function listCvRequests() {
	const docs = await CvRequestRecord.find({}, WITHOUT_PDF).sort({ requestedAt: -1 }).limit(LIST_LIMIT).lean()
	const now = new Date()

	return Response.json(docs.map(doc => toWebCvRequest(doc, now)) satisfies WebCvRequest[])
}

/** `GET /api/cv/:requestId`: status do pedido (alternativa ao SSE). */
export async function getCvRequest(req: Request & { params: { requestId: string } }) {
	const doc = await CvRequestRecord.findOne({ requestId: req.params.requestId }, WITHOUT_PDF).lean()
	if (!doc) throw new HttpError(404, 'Pedido de currículo não encontrado')

	return Response.json(toWebCvRequest(doc) satisfies WebCvRequest)
}

/** `GET /api/cv/:requestId/pdf`: o PDF gerado; com `?download=1`, como anexo. */
export async function getCvPdf(req: Request & { params: { requestId: string } }) {
	const doc = await CvRequestRecord.findOne({ requestId: req.params.requestId, status: 'ready' }, { pdf: 1, fileName: 1 }).lean()
	if (!doc?.pdf) throw new HttpError(404, 'Currículo não encontrado ou ainda não gerado')

	const download = new URL(req.url).searchParams.has('download')
	const fileName = doc.fileName ?? 'Curriculo.pdf'

	return new Response(new Blob([new Uint8Array(doc.pdf)]), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${fileName.replace(/[^\w.-]/g, '_')}"`,
			'Cache-Control': 'private, max-age=86400',
		},
	})
}

/** Consumidor da fila `web-cv`: guarda o PDF (ou o erro) e avisa os navegadores conectados. */
export async function saveCvResult(result: CvResult, { events, logger }: Omit<Deps, 'queue'>) {
	const context = WebReplyContextSchema.safeParse(result.context)
	if (!context.success) {
		logger.warn({ postId: result.postId }, 'Resultado de currículo sem o id do pedido do site, ignorando')
		return
	}

	const doc = await CvRequestRecord.findOneAndUpdate(
		{ requestId: context.data.requestId },
		{
			status: result.file ? 'ready' : 'failed',
			fileName: result.file?.name ?? null,
			pdf: result.file ? Buffer.from(result.file.base64, 'base64') : null,
			error: result.file ? null : (result.error ?? 'Erro desconhecido no cv-updater'),
			finishedAt: new Date(),
		},
		{ returnDocument: 'after', projection: WITHOUT_PDF, lean: true },
	)

	if (!doc) {
		logger.warn({ requestId: context.data.requestId }, 'Pedido de currículo não encontrado (expirou?), ignorando')
		return
	}

	events.broadcast('cv', toWebCvRequest(doc))
	logger.info({ postId: result.postId, requestId: doc.requestId, status: doc.status }, 'Resultado do currículo recebido')
}
