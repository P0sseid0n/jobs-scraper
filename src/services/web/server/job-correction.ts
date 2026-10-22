import { CORRECTABLE_FIELDS, JobCorrectionSchema, jobFields, type JobCorrection, type JobFields } from '@shared/contracts'
import { ExtractionFeedback, Job, type ExtractionFeedbackRecord } from '@shared/database'
import type { Logger } from '@shared/logging'

import type { WebJob } from '../api-types'
import { HttpError, readJson } from './http'
import { LISTABLE_JOBS, toWebJob, type JobDocument } from './jobs-query'

/**
 * Monta a correção da vaga: o `$set` do documento (valores corrigidos, data e, na primeira correção, a extração
 * original da IA) e o registro de feedback com o post, a saída da IA e os valores certos.
 * @throws {HttpError} 400 se nenhum valor enviado for diferente do atual.
 */
export function planCorrection(doc: JobDocument, correction: JobCorrection, now = new Date()) {
	const current = jobFields(doc)
	// Numa vaga já corrigida, a saída da IA é a guardada na primeira correção, não os valores atuais
	const aiOutput = doc.aiExtraction ?? current

	const changes: Partial<JobFields> = {}
	for (const field of CORRECTABLE_FIELDS) {
		const value = correction[field]
		if (value !== undefined && JSON.stringify(value) !== JSON.stringify(current[field])) Object.assign(changes, { [field]: value })
	}
	const correctedFields = Object.keys(changes)

	if (!correction.notAJob && correctedFields.length === 0) throw new HttpError(400, 'Nenhum valor mudou: a vaga já está assim')

	const set: Record<string, unknown> = { ...changes, correctedAt: now }
	if (!doc.aiExtraction) set.aiExtraction = current
	if (correction.notAJob) set.notAJob = true

	const feedback: ExtractionFeedbackRecord = {
		postId: doc.postId,
		kind: correction.notAJob ? 'not-a-job' : 'fields',
		post: {
			text: doc.rawContent,
			author: doc.author ?? null,
			url: doc.postLink ?? null,
			postedAt: doc.postedAt ?? null,
			sourcePostId: doc.sourcePostId ?? null,
		},
		aiOutput,
		expected: correction.notAJob ? null : { ...current, ...changes },
		correctedFields,
		model: doc.extractionModel ?? null,
		promptVersion: doc.promptVersion ?? null,
		createdAt: now,
	}

	return { set, feedback }
}

/**
 * `PATCH /api/jobs/:postId`: corrige campos da vaga ou a marca como "não é vaga" (sai da lista, sem apagar).
 * Responde a vaga atualizada; campos inválidos → 400 com o erro de cada um.
 */
export async function correctJob(req: Request & { params: { postId: string } }, { logger }: { logger: Logger }) {
	const { postId } = req.params
	const correction = JobCorrectionSchema.parse(await readJson(req))

	const doc = await Job.findOne({ ...LISTABLE_JOBS, postId }).lean<JobDocument>()
	if (!doc) throw new HttpError(404, 'Vaga não encontrada')

	const { set, feedback } = planCorrection(doc, correction)
	const updated = await Job.findOneAndUpdate({ postId }, { $set: set }, { returnDocument: 'after', lean: true })
	if (!updated) throw new HttpError(404, 'Vaga não encontrada')

	await ExtractionFeedback.create(feedback)
	logger.info({ postId, kind: feedback.kind, fields: feedback.correctedFields }, 'Vaga corrigida pelo site')

	return Response.json(toWebJob(updated as JobDocument) satisfies WebJob)
}
