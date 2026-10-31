import { CONTRACT_TYPES, type ContractType, type ProcessedJob } from '@shared/contracts'
import { currentLocale, languageName, t } from '@shared/i18n'

import type { WebJob } from '../../api-types'

type WorkMode = NonNullable<ProcessedJob['workMode']> | 'none'

/** A cor de cada modalidade (as mesmas do card do Discord); o rótulo vem do catálogo (`format.workModes`). */
export const WORK_MODE_COLORS: Record<WorkMode, string> = {
	remoto: '#2ecc71',
	hibrido: '#3498db',
	presencial: '#e67e22',
	none: '#95a5a6',
}

export const WORK_MODE_KEYS = Object.keys(WORK_MODE_COLORS) as WorkMode[]

export const CONTRACT_TYPE_KEYS: (ContractType | 'none')[] = [...CONTRACT_TYPES, 'none']

export function workModeOf(job: Pick<WebJob, 'workMode'>) {
	const mode = job.workMode ?? 'none'
	return { label: t().format.workModes[mode], color: WORK_MODE_COLORS[mode] }
}

/** "CLT", ou "CLT ou PJ" quando o post aceita os dois; `null` se o post não diz. */
export function contractTypesLabel(job: Pick<WebJob, 'contractTypes'>) {
	const { contractTypes, or } = t().format
	return job.contractTypes?.length ? job.contractTypes.map(type => contractTypes[type]).join(` ${or} `) : null
}

/**
 * "Empresa · Local"; sem os dois, quem publicou o post (os rótulos vazios nunca aparecem). A empresa confidencial fica
 * fora do texto, em `confidential`: ela aparece com outro estilo, para não parecer o nome (ver `JobSubtitle`).
 */
export function jobSubtitle(job: Pick<WebJob, 'company' | 'companyConfidential' | 'location' | 'author'>) {
	const confidential = !job.company && job.companyConfidential
	const parts = [job.company, job.location].filter(Boolean)
	if (parts.length || confidential) return { confidential, text: parts.join(' · ') }

	return { confidential, text: job.author ? t().format.postBy(job.author) : '' }
}

/** A primeira data disponível: publicação do post ou entrada no sistema. */
export function jobDate(job: Pick<WebJob, 'postedAt' | 'createdAt'>) {
	return job.postedAt ?? job.createdAt
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 60 * 60],
	['month', 30 * 24 * 60 * 60],
	['week', 7 * 24 * 60 * 60],
	['day', 24 * 60 * 60],
	['hour', 60 * 60],
	['minute', 60],
]

/** "há 3 h", "ontem", "agora" (no idioma escolhido). */
export function timeAgo(iso: string, now = Date.now()) {
	const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
	const relative = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto', style: 'short' })

	for (const [unit, size] of UNITS) {
		if (Math.abs(seconds) >= size) return relative.format(Math.trunc(seconds / size), unit)
	}

	return t().format.now
}

/** Duração em "1h 20min", "4min 12s" ou "38s". */
export function formatDuration(ms: number) {
	const total = Math.max(0, Math.round(ms / 1000))
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const seconds = total % 60

	if (hours > 0) return `${hours}h${minutes ? ` ${minutes}min` : ''}`
	if (minutes > 0) return `${minutes}min${seconds ? ` ${seconds}s` : ''}`
	return `${seconds}s`
}

/** "hoje, 14:06", "ontem, 22:00" ou "08/10, 11:15" (no idioma escolhido). */
export function formatDateTime(iso: string, now = new Date()) {
	const locale = currentLocale()
	const date = new Date(iso)
	const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
	const days = Math.round((startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000))

	if (days === 0) return t().format.today(time)
	if (days === 1) return t().format.yesterday(time)
	return date.toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Intervalo em minutos por extenso: "a cada 4 h", "a cada 1 h 30 min", "a cada 2 dias". */
export function formatInterval(minutes: number) {
	const { format } = t()
	if (minutes % (24 * 60) === 0) return format.everyDays(minutes / (24 * 60))
	if (minutes < 60) return format.everyMinutes(minutes)

	return format.everyHours(Math.floor(minutes / 60), minutes % 60)
}

/** Números no formato do idioma escolhido ("1.234" ou "1,234"). */
export function formatNumber(value: number) {
	return value.toLocaleString(currentLocale())
}

/** Lista por extenso no idioma escolhido: "a, b e c" ou "a, b, and c". */
export function formatList(items: readonly string[], type: Intl.ListFormatType = 'conjunction') {
	return new Intl.ListFormat(currentLocale(), { type }).format(items)
}

/** Os idiomas oferecidos nos filtros e no perfil (ISO 639-1), além dos que já estiverem salvos. */
export const COMMON_LANGUAGES = ['pt', 'en', 'es', 'fr', 'de', 'it']

/** "Português (pt)", com o nome no idioma escolhido; sem nome conhecido, só o código. */
export function languageLabel(code: string) {
	const name = languageName(code)
	return name === code ? code : `${name} (${code})`
}

/** Só links http(s) viram botão (o campo vem da IA e pode trazer outra coisa). */
export function safeLink(link: string | null) {
	return link && /^https?:\/\//i.test(link) ? link : null
}

/**
 * O texto da página de uma vaga de post com várias, sem o cabeçalho "Vaga: …" / "Link: …" que o scraper põe para a
 * IA (o cargo e o link já aparecem no detalhe).
 */
export function listingPageText(rawContent: string) {
	return rawContent.replace(LISTING_PAGE_HEADER, '')
}

/**
 * Se o texto da vaga de um post com várias é o da página aberta pelo link dela. A vaga de uma lista sem links não tem
 * página: o texto é o do post, sem as linhas das outras vagas.
 */
export function isListingPageText(rawContent: string) {
	return LISTING_PAGE_HEADER.test(rawContent)
}

const LISTING_PAGE_HEADER = /^Vaga: .*\nLink: .*\n\n/
