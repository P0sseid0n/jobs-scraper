import { z } from 'zod'

import {
	CONTRACT_TYPES,
	CORRECTABLE_FIELDS,
	jobFields,
	WORK_MODES,
	type CorrectableField,
	type JobFields,
	type RawPost,
} from '@shared/contracts'
import { FEEDBACK_KINDS } from '@shared/database'

import type { AiJobOutput } from './extraction-output'
import { buildProcessedJob } from './job-extraction'
import { rejectionReason } from './model-response'

const FieldsSchema = z.object({
	title: z.string().nullable(),
	company: z.string().nullable(),
	location: z.string().nullable(),
	workMode: z.enum(WORK_MODES).nullable(),
	contractTypes: z.array(z.enum(CONTRACT_TYPES)).nullable(),
	necessaryKnowledge: z.array(z.string()).nullable(),
	recruiterEmail: z.string().nullable(),
	applyLink: z.string().nullable(),
}) satisfies z.ZodType<JobFields>

/**
 * Caso de avaliação: uma correção feita pelo site (coleção `extraction_feedback`) ou uma fixture versionada
 * (`fixtures/extraction-cases.json`, já sem dados pessoais).
 */
export const ExtractionCaseSchema = z.object({
	postId: z.string().min(1),
	kind: z.enum(FEEDBACK_KINDS),
	post: z.object({
		text: z.string().min(1),
		author: z.string().nullable(),
		url: z.string().nullable(),
		postedAt: z.string().nullable(),
		sourcePostId: z.string().nullable(),
	}),
	aiOutput: FieldsSchema.extend({ aiJobConfidence: z.number() }),
	expected: FieldsSchema.nullable(),
	correctedFields: z.array(z.string()),
	model: z.string().nullable(),
	promptVersion: z.string().nullable(),
})
export type ExtractionCase = z.infer<typeof ExtractionCaseSchema>

/** Fica a correção mais recente de cada post (`cases` em ordem cronológica): ela tem os valores certos finais. */
export function latestPerPost<T extends { postId: string }>(cases: T[]) {
	return [...new Map(cases.map(item => [item.postId, item])).values()]
}

/**
 * O post como o scraper o mandou, para rodar a extração de novo. O link de candidatura que não está no texto veio
 * de fora dele: da lista de vagas (`jobLink`, vaga com `sourcePostId`) ou do cartão anexado (`attachedLink`).
 */
export function caseToRawPost(item: ExtractionCase): RawPost {
	const link = item.aiOutput.applyLink
	const outsideText = link && !item.post.text.normalize('NFKC').includes(link) ? link : null

	return {
		postId: item.postId,
		text: item.post.text,
		url: item.post.url,
		author: item.post.author,
		postedAt: item.post.postedAt,
		scrapedAt: new Date(0).toISOString(),
		sourcePostId: item.post.sourcePostId,
		jobLink: item.post.sourcePostId ? outsideText : null,
		attachedLink: item.post.sourcePostId ? null : outsideText,
	}
}

/** Resultado da extração de um caso: se o post passaria como vaga e os campos que sairiam. */
export type CaseRun = { isJob: boolean; fields: JobFields | null }

/** Aplica à resposta do modelo as mesmas regras do post-processing (confiança mínima e regras do texto). */
export function runFromModel(item: ExtractionCase, aiJob: AiJobOutput | null, minConfidence: number): CaseRun {
	return {
		isJob: rejectionReason(aiJob, minConfidence) === null,
		fields: aiJob ? jobFields(buildProcessedJob(caseToRawPost(item), aiJob, null)) : null,
	}
}

/** Compara sem diferenciar maiúsculas, espaços e acentos compostos; listas sem ordem. */
export function sameFieldValue(field: CorrectableField, expected: unknown, actual: unknown) {
	return JSON.stringify(normalizeValue(field, expected)) === JSON.stringify(normalizeValue(field, actual))
}

function normalizeValue(field: CorrectableField, value: unknown): unknown {
	if (value === null || value === undefined) return null
	if (Array.isArray(value)) {
		const items = [...new Set(value.map(item => normalizeValue(field, item)))].sort()
		return items.length > 0 ? items : null
	}

	const text = String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
	return field === 'applyLink' ? text.replace(/\/+$/, '') : text
}

export type Score = { correct: number; total: number }
export type EvalReport = {
	cases: number
	/** Acerto em dizer se o post é vaga (todos os casos). */
	isJob: { original: Score; current: Score }
	/** Acerto por campo, nos casos de vaga com os valores corrigidos. */
	fields: Record<CorrectableField, { original: Score; current: Score }>
}

/**
 * Acerto por campo da extração original (a salva na vaga, antes da correção) e da atual (prompt e modelo de agora),
 * contra os valores corrigidos pelo site.
 */
export function scoreCases(results: { item: ExtractionCase; run: CaseRun }[]): EvalReport {
	const empty = () => ({ original: { correct: 0, total: 0 }, current: { correct: 0, total: 0 } })
	const report: EvalReport = {
		cases: results.length,
		isJob: empty(),
		fields: Object.fromEntries(CORRECTABLE_FIELDS.map(field => [field, empty()])) as EvalReport['fields'],
	}

	for (const { item, run } of results) {
		const expectedIsJob = item.kind !== 'not-a-job'
		// A extração original virou vaga (foi salva): erra justamente nos "não é vaga"
		count(report.isJob.original, expectedIsJob)
		count(report.isJob.current, run.isJob === expectedIsJob)

		if (!item.expected) continue
		for (const field of CORRECTABLE_FIELDS) {
			const expected = item.expected[field]
			count(report.fields[field].original, sameFieldValue(field, expected, item.aiOutput[field]))
			// Sem resposta do modelo, todos os campos contam como errados
			count(report.fields[field].current, run.fields !== null && sameFieldValue(field, expected, run.fields[field]))
		}
	}

	return report
}

function count(score: Score, correct: boolean) {
	score.total++
	if (correct) score.correct++
}

/** Tabela do acerto por campo, para o terminal. */
export function formatReport(report: EvalReport) {
	const rows = [
		['campo', 'original', 'atual', 'casos'],
		['é vaga?', percent(report.isJob.original), percent(report.isJob.current), String(report.isJob.current.total)],
		...CORRECTABLE_FIELDS.map(field => {
			const { original, current } = report.fields[field]
			return [field, percent(original), percent(current), String(current.total)]
		}),
	]
	const widths = rows[0]!.map((_, column) => Math.max(...rows.map(row => row[column]!.length)))

	return rows
		.map(row => row.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!))).join('  '))
		.join('\n')
}

function percent({ correct, total }: Score) {
	return total === 0 ? '–' : `${Math.round((correct / total) * 100)}% (${correct})`
}
