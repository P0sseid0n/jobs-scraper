import type { JobCorrectionInput } from '@shared/contracts'

import type {
	ApiError,
	JobFacets,
	JobsPage,
	JobsViewedChange,
	RunsPage,
	ScraperStatus,
	SettingsKey,
	WebCvBase,
	WebCvBaseVersion,
	WebCvBaseVersionWithTex,
	WebCvRequest,
	WebJob,
	WebSettings,
} from '../api-types'
import type { JobFilters } from './lib/job-filters'

/** Erro de uma chamada à API, com a mensagem do servidor e, em erros de validação, a de cada campo. */
export class RequestError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly fields: Record<string, string> = {},
	) {
		super(message)
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	let response: Response

	try {
		response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
	} catch {
		throw new RequestError('Sem conexão com o servidor do site', 0)
	}

	const body = (await response.json().catch(() => null)) as unknown

	if (!response.ok) {
		const error = (body ?? {}) as Partial<ApiError>
		throw new RequestError(error.error ?? `Erro ${response.status}`, response.status, error.fields)
	}

	return body as T
}

export type { JobFilters }

export function jobsQueryString(filters: JobFilters, cursor?: string | null) {
	const params = new URLSearchParams()

	if (filters.q.trim()) params.set('q', filters.q.trim())
	if (filters.workMode.length) params.set('workMode', filters.workMode.join(','))
	if (filters.contractType.length) params.set('contractType', filters.contractType.join(','))
	if (filters.skills.length) params.set('skills', filters.skills.join(','))
	if (filters.since !== 'all') params.set('since', filters.since)
	if (filters.hasEmail) params.set('hasEmail', 'true')
	if (filters.unviewed) params.set('viewed', 'false')
	if (filters.language) params.set('language', filters.language)
	if (filters.minConfidence > 0) params.set('minConfidence', String(filters.minConfidence))
	if (cursor) params.set('cursor', cursor)

	return params.toString()
}

export const api = {
	jobs: (filters: JobFilters, cursor?: string | null) => request<JobsPage>(`/api/jobs?${jobsQueryString(filters, cursor)}`),
	facets: () => request<JobFacets>('/api/jobs/facets'),
	job: (postId: string) => request<WebJob>(`/api/jobs/${encodeURIComponent(postId)}`),
	/** Corrige campos da vaga ou a marca como "não é vaga"; devolve a vaga atualizada. */
	correctJob: (postId: string, correction: JobCorrectionInput) =>
		request<WebJob>(`/api/jobs/${encodeURIComponent(postId)}`, { method: 'PATCH', body: JSON.stringify(correction) }),
	/** Marca a vaga como vista ou não vista; devolve a data como ficou no banco (`null`: não vista). */
	setViewed: (postId: string, viewed: boolean) =>
		request<{ postId: string; viewedAt: string | null }>(`/api/jobs/${encodeURIComponent(postId)}/viewed`, {
			method: 'PUT',
			body: JSON.stringify({ viewed }),
		}),
	/** Marca ou desmarca várias vagas; devolve só as que mudaram. */
	setJobsViewed: (postIds: string[], viewed: boolean) =>
		request<JobsViewedChange>('/api/jobs/viewed', { method: 'PUT', body: JSON.stringify({ postIds, viewed }) }),
	/** O documento da vaga no MongoDB, para depuração. */
	rawJob: (postId: string) => request<Record<string, unknown>>(`/api/jobs/${encodeURIComponent(postId)}/raw`),

	requestCv: (postId: string) => request<WebCvRequest>(`/api/jobs/${encodeURIComponent(postId)}/cv`, { method: 'POST' }),
	cvRequests: () => request<WebCvRequest[]>('/api/cv'),
	cvRequest: (requestId: string) => request<WebCvRequest>(`/api/cv/${requestId}`),

	cvBase: () => request<WebCvBase>('/api/cv-base'),
	cvBaseVersion: (versionId: string) => request<WebCvBaseVersionWithTex>(`/api/cv-base/versions/${versionId}`),
	/** Guarda o `.tex` como versão nova e pede a validação; o resultado chega pelo stream (`cvBase`). */
	createCvBaseVersion: (tex: string, fileName: string | null) =>
		request<WebCvBaseVersion>('/api/cv-base/versions', { method: 'POST', body: JSON.stringify({ tex, fileName }) }),
	/** Torna a versão (já validada) o currículo base; também serve para voltar a uma anterior. */
	activateCvBaseVersion: (versionId: string) =>
		request<WebCvBaseVersion>(`/api/cv-base/versions/${versionId}/activate`, { method: 'POST' }),

	scraperStatus: () => request<ScraperStatus>('/api/scraper/status'),
	runs: (cursor?: string | null) => request<RunsPage>(`/api/scraper/runs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
	runNow: () => request<{ requested: true }>('/api/scraper/run', { method: 'POST' }),

	settings: <K extends SettingsKey>(key: K) => request<WebSettings[K]>(`/api/settings/${key}`),
	saveSettings: <K extends SettingsKey>(key: K, patch: Partial<WebSettings[K]>) =>
		request<WebSettings[K]>(`/api/settings/${key}`, { method: 'PUT', body: JSON.stringify(patch) }),
}

export function cvPdfUrl(requestId: string, download = false) {
	return `/api/cv/${requestId}/pdf${download ? '?download=1' : ''}`
}

export function cvBasePdfUrl(versionId: string) {
	return `/api/cv-base/versions/${versionId}/pdf`
}
