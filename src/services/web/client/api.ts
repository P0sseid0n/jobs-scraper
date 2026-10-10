import type {
	ApiError,
	JobFacets,
	JobsPage,
	RunsPage,
	ScraperStatus,
	SettingsKey,
	WebCvRequest,
	WebJob,
	WebSettings,
} from '../api-types'

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

export type JobFilters = {
	q: string
	workMode: string[]
	skills: string[]
	since: 'all' | '24h' | '7d' | '30d'
	hasEmail: boolean
	language: string
	minConfidence: number
}

export function jobsQueryString(filters: JobFilters, cursor?: string | null) {
	const params = new URLSearchParams()

	if (filters.q.trim()) params.set('q', filters.q.trim())
	if (filters.workMode.length) params.set('workMode', filters.workMode.join(','))
	if (filters.skills.length) params.set('skills', filters.skills.join(','))
	if (filters.since !== 'all') params.set('since', filters.since)
	if (filters.hasEmail) params.set('hasEmail', 'true')
	if (filters.language) params.set('language', filters.language)
	if (filters.minConfidence > 0) params.set('minConfidence', String(filters.minConfidence))
	if (cursor) params.set('cursor', cursor)

	return params.toString()
}

export const api = {
	jobs: (filters: JobFilters, cursor?: string | null) => request<JobsPage>(`/api/jobs?${jobsQueryString(filters, cursor)}`),
	facets: () => request<JobFacets>('/api/jobs/facets'),
	job: (postId: string) => request<WebJob>(`/api/jobs/${encodeURIComponent(postId)}`),

	requestCv: (postId: string) => request<WebCvRequest>(`/api/jobs/${encodeURIComponent(postId)}/cv`, { method: 'POST' }),
	cvRequests: () => request<WebCvRequest[]>('/api/cv'),
	cvRequest: (requestId: string) => request<WebCvRequest>(`/api/cv/${requestId}`),

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
