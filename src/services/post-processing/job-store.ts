import {
	CORRECTABLE_FIELDS,
	jobFields,
	needsReview,
	ProcessedJobSchema,
	type CorrectableField,
	type JobPublished,
	type PostImage,
	type ProcessedJob,
} from '@shared/contracts'
import { Job, replaceJobImages, saveJobImages, type JobExtractionSource, type JobRepost } from '@shared/database'
import type { Logger } from '@shared/logging'
import { EXCHANGES, type QueueClient } from '@shared/messaging'
import { readSettings } from '@shared/settings'

import { findDuplicate, type DuplicateCandidate } from './job-duplicates'
import { missingRequiredFields } from './job-validation'

type Deps = { queue: QueueClient; logger: Logger }

/**
 * Salva a vaga (uma única vez) e publica o evento `job-published`, que cada canal (ex.: o discord-bot) recebe. A
 * repostagem de uma vaga recente (ver `findOriginal`) é salva apontando para a original e não é anunciada.
 * `source` diz qual modelo e prompt extraíram a vaga (usado na avaliação das correções feitas pelo site). As imagens
 * do post são guardadas antes do anúncio: os canais as leem do banco, porque as URLs do LinkedIn expiram.
 * @returns `false` se a vaga foi descartada por falta de campos obrigatórios.
 */
export async function saveJob(data: ProcessedJob, { queue, logger }: Deps, source?: JobExtractionSource, images: PostImage[] = []) {
	const log = logger.child({ postId: data.postId })

	const missing = missingRequiredFields(data)
	if (missing.length > 0) {
		log.warn({ missing }, 'Vaga sem os campos obrigatórios, descartando')
		return false
	}

	// Antes da vaga: se ela for salva, as imagens já estão lá quando um canal as pedir
	await saveJobImages(data.postId, images)

	// Reprocessada, a vaga mantém o agrupamento da primeira vez
	const alreadySaved = await Job.exists({ postId: data.postId })
	const original = alreadySaved ? null : await findOriginal(data)

	// Upsert idempotente: a mesma vaga nunca é salva duas vezes, mesmo se a mensagem for reprocessada
	const job = await Job.findOneAndUpdate(
		{ postId: data.postId },
		{ $setOnInsert: { ...data, ...source, duplicateOf: original?.postId ?? null } },
		{ upsert: true, returnDocument: 'after' },
	)

	if (job.duplicateOf) {
		await addRepost(job.duplicateOf, data)
		log.info({ duplicateOf: job.duplicateOf, reason: original?.reason }, 'Repostagem de uma vaga já salva: agrupada, sem anúncio')
		return true
	}

	if (job.notifiedAt) {
		log.info('Vaga já salva e anunciada anteriormente, ignorando')
		return true
	}

	await announce(data, queue)
	log.info('Vaga salva no MongoDB e publicada para os canais')
	return true
}

/**
 * Atualiza a vaga salva com a extração nova ("processar de novo" do site). Fica o que não é da extração: vista,
 * candidatura, agrupamento, anúncio (a vaga não é anunciada de novo) e os campos corrigidos pelo site, que continuam
 * com o valor da pessoa; a extração nova vira a da IA (`aiExtraction`) para as próximas correções. As imagens só são
 * trocadas quando o post as trouxe.
 * @returns Os campos corrigidos mantidos, `missing` se a nova extração não tem os campos obrigatórios ou `null` se a
 * vaga não existe mais.
 */
export async function updateJob(data: ProcessedJob, source: JobExtractionSource, images: PostImage[]) {
	const saved = await Job.findOne({ postId: data.postId }).lean()
	if (!saved) return null
	if (missingRequiredFields(data).length > 0) return 'missing'

	const set: Record<string, unknown> = { ...data, ...source }
	let keptFields: CorrectableField[] = []

	if (saved.aiExtraction) {
		const current = jobFields(saved)
		const aiExtraction = jobFields(saved.aiExtraction)
		keptFields = CORRECTABLE_FIELDS.filter(field => JSON.stringify(current[field]) !== JSON.stringify(aiExtraction[field]))

		for (const field of keptFields) set[field] = saved[field]
		set.aiExtraction = jobFields(data)
		set.extractionChecks = data.extractionChecks.filter(check => !(keptFields as string[]).includes(check))
		if (keptFields.includes('company') && saved.company) set.companyConfidential = false
	}

	if (images.length > 0) await replaceJobImages(data.postId, images)
	else Object.assign(set, { imageCount: saved.imageCount ?? 0, imageText: saved.imageText ?? null })

	await Job.updateOne({ postId: data.postId }, { $set: set })
	return { keptFields }
}

/**
 * Vaga salva numa tentativa anterior cujo anúncio falhou (o post volta pelo retry da fila): anuncia de novo sem
 * chamar a IA outra vez. Devolve `false` se o post ainda não tem vaga salva.
 */
export async function resumeSavedJob(postId: string, { queue, logger }: Deps) {
	const saved = await Job.findOne({ postId }).lean()
	if (!saved) return false

	// A repostagem nunca é anunciada: a original já foi
	if (!saved.notifiedAt && !saved.duplicateOf) {
		await announce(ProcessedJobSchema.parse(saved), queue)
		logger.info({ postId }, 'Vaga salva anteriormente publicada para os canais')
	}

	return true
}

/** Publica a vaga com o aviso de conferir o post calculado pelo limite de checks em vigor agora. */
async function announce(job: ProcessedJob, queue: QueueClient) {
	const { reviewChecksPercent } = await readSettings('post-processing')
	const event: JobPublished = { ...job, needsReview: needsReview(job.extractionChecks, reviewChecksPercent) }

	await queue.publishEvent(EXCHANGES.jobPublished, event)
	await Job.updateOne({ postId: job.postId }, { notifiedAt: new Date() })
}

/** Quantas vagas recentes, no máximo, são comparadas com a nova. */
const MAX_CANDIDATES = 2_000

/**
 * A vaga original de que `job` é repostagem, entre as salvas nos últimos `duplicateWindowDays` dias que aparecem no
 * site (nem repostagem, nem marcada como "não é vaga" ou "outro idioma", nem removida por ser de uma empresa
 * bloqueada). `null` se nenhuma é a mesma vaga.
 */
async function findOriginal(job: ProcessedJob) {
	const { duplicateSimilarityPercent, duplicateWindowDays } = await readSettings('post-processing')
	const since = new Date(Date.now() - duplicateWindowDays * 24 * 60 * 60 * 1000)

	const candidates = await Job.find(
		{
			postId: { $type: 'string', $ne: job.postId },
			title: { $type: 'string' },
			duplicateOf: null,
			notAJob: { $ne: true },
			wrongLanguage: { $ne: true },
			blockedCompany: { $ne: true },
			createdAt: { $gte: since },
		},
		{ postId: 1, title: 1, company: 1, applyLink: 1, rawContent: 1, sourcePostId: 1 },
	)
		.sort({ createdAt: -1 })
		.limit(MAX_CANDIDATES)
		.lean<DuplicateCandidate[]>()

	return findDuplicate(job, candidates, duplicateSimilarityPercent / 100)
}

/** Guarda o post da repostagem na vaga original (uma vez só, mesmo se a mensagem for reprocessada). */
async function addRepost(originalPostId: string, job: ProcessedJob) {
	const repost: JobRepost = {
		postId: job.postId,
		author: job.author,
		postLink: job.postLink,
		postedAt: job.postedAt,
		createdAt: new Date(),
	}

	await Job.updateOne({ postId: originalPostId, 'reposts.postId': { $ne: job.postId } }, { $push: { reposts: repost } })
}
