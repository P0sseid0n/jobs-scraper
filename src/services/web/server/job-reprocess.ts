import type { JobLookup, JobReprocessResult, PostReread, RawPost } from '@shared/contracts'
import { Job, loadJobImages } from '@shared/database'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'
import { readSettings } from '@shared/settings'

import { listingPostId } from '../../post-processing/multi-job-post'
import type { WebReprocessRequest, WebReprocessResult } from '../api-types'
import type { EventHub } from './event-hub'
import { HttpError } from './http'
import { toWebJob, type JobDocument } from './jobs-query'

/** O começo do texto de uma vaga de lista (ver `lookupToRawPost`): o cargo e o link dela na lista. */
const LISTING_HEADER = /^Vaga: (.+)\nLink: (\S+)/

/**
 * `POST /api/jobs/:postId/reprocess` ("processar de novo"): manda a vaga pelo caminho em que ela entrou, para ser lida e
 * extraída de novo. A vaga de uma lista com links volta ao scraper, que abre a página dela; a vaga avulsa também, que
 * lê o post de novo; a de uma lista com um link só (o texto já é o do post) vai direto ao post-processing. O
 * post-processing atualiza a vaga em vez de pulá-la, e o resultado chega pelo evento `reprocess` do stream, com o
 * `reprocessId` devolvido aqui. As filas são as do "processar de novo", à frente das da coleta. Sem ninguém atendendo
 * as filas, recusa na hora (também com o scraper ou o post-processing de uma versão sem elas).
 */
export async function reprocessJob(
	req: Request & { params: { postId: string } },
	{ queue, logger }: { queue: QueueClient; logger: Logger },
) {
	const job = await Job.findOne({ postId: req.params.postId }).lean<JobDocument>()
	if (!job) throw new HttpError(404, 'Vaga não encontrada')

	const reprocessId = crypto.randomUUID()
	const listing = job.sourcePostId ? job.rawContent.match(LISTING_HEADER) : null

	if (listing && listingPostId(listing[2]!) === job.postId) {
		await requireConsumers(queue, QUEUES.scraperLookupReprocess)

		const lookup: JobLookup = {
			postId: job.postId,
			sourcePostId: job.sourcePostId!,
			sourcePostUrl: job.postLink ?? null,
			title: listing[1]!,
			link: listing[2]!,
			text: job.rawContent,
			author: job.author ?? null,
			// A vaga não guarda se o autor do post de origem é uma página de empresa
			authorIsCompany: false,
			authorHeadline: job.authorHeadline ?? null,
			postedAt: job.postedAt ?? null,
			requestedAt: new Date().toISOString(),
			reprocessId,
		}
		await queue.publish(QUEUES.scraperLookupReprocess, lookup)
	} else if (job.sourcePostId) {
		await requireConsumers(queue)

		const post: RawPost = {
			postId: job.postId,
			text: job.rawContent,
			url: job.postLink ?? null,
			author: job.author ?? null,
			authorIsCompany: false,
			authorHeadline: job.authorHeadline ?? null,
			postedAt: job.postedAt ?? null,
			scrapedAt: new Date().toISOString(),
			sourcePostId: job.sourcePostId,
			jobLink: null,
			// O cartão anexado do post de origem não fica na vaga: o link dela faz o papel dele
			attachedLink: job.applyLink ?? null,
			images: await loadJobImages(job.postId),
			reprocessId,
		}
		await queue.publish(QUEUES.postProcessingReprocess, post)
	} else {
		if (!job.postLink || !job.postId.startsWith('urn:li:')) {
			throw new HttpError(409, 'A vaga não tem o link do post no LinkedIn para ler de novo')
		}
		await requireConsumers(queue, QUEUES.scraperPost)

		const reread: PostReread = { postId: job.postId, url: job.postLink, postedAt: job.postedAt ?? null, reprocessId }
		await queue.publish(QUEUES.scraperPost, reread)
	}

	logger.info({ postId: job.postId, reprocessId }, '🔁 Vaga enviada para ser processada de novo')
	return Response.json({ reprocessId } satisfies WebReprocessRequest, { status: 202 })
}

/** Recusa se o post-processing (e o scraper, quando a fila é dele) não está rodando: o pedido ficaria parado na fila. */
async function requireConsumers(queue: QueueClient, scraperQueue?: string) {
	if (scraperQueue && (await queue.consumerCount(scraperQueue)) === 0) {
		throw new HttpError(503, 'O scraper não está rodando: inicie-o para processar a vaga de novo')
	}
	if ((await queue.consumerCount(QUEUES.postProcessingReprocess)) === 0) {
		throw new HttpError(503, 'O post-processing não está rodando: inicie-o para processar a vaga de novo')
	}
}

/** Repassa o resultado do "processar de novo" aos navegadores, com a vaga como ficou no banco. */
export async function broadcastReprocessResult(result: JobReprocessResult, { events }: { events: EventHub }) {
	const doc = result.status === 'updated' ? await Job.findOne({ postId: result.postId }).lean<JobDocument>() : null
	const { reviewChecksPercent } = await readSettings('post-processing')

	events.broadcast('reprocess', { ...result, job: doc ? toWebJob(doc, reviewChecksPercent) : null } satisfies WebReprocessResult)
}
