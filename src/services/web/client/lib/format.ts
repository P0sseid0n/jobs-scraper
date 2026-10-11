import type { ProcessedJob } from '@shared/contracts'

import type { WebJob } from '../../api-types'

type WorkMode = NonNullable<ProcessedJob['workMode']> | 'none'

/** Rótulo e cor de cada modalidade (as mesmas cores do card do Discord). */
export const WORK_MODES: Record<WorkMode, { label: string; color: string }> = {
	remoto: { label: 'Remoto', color: '#2ecc71' },
	hibrido: { label: 'Híbrido', color: '#3498db' },
	presencial: { label: 'Presencial', color: '#e67e22' },
	none: { label: 'Sem modalidade', color: '#95a5a6' },
}

export function workModeOf(job: Pick<WebJob, 'workMode'>) {
	return WORK_MODES[job.workMode ?? 'none']
}

/** "Empresa · Local"; sem os dois, quem publicou o post (os rótulos vazios nunca aparecem). */
export function jobSubtitle(job: Pick<WebJob, 'company' | 'location' | 'author'>) {
	const parts = [job.company, job.location].filter(Boolean)
	if (parts.length) return parts.join(' · ')

	return job.author ? `post de ${job.author}` : ''
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

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' })

/** "há 3 h", "ontem", "agora". */
export function timeAgo(iso: string, now = Date.now()) {
	const seconds = Math.round((new Date(iso).getTime() - now) / 1000)

	for (const [unit, size] of UNITS) {
		if (Math.abs(seconds) >= size) return relative.format(Math.trunc(seconds / size), unit)
	}

	return 'agora'
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

const dateTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** "hoje, 14:06", "ontem, 22:00" ou "08/10, 11:15". */
export function formatDateTime(iso: string, now = new Date()) {
	const date = new Date(iso)
	const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
	const days = Math.round((startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000))

	if (days === 0) return `hoje, ${time}`
	if (days === 1) return `ontem, ${time}`
	return dateTime.format(date)
}

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Intervalo em minutos por extenso: "a cada 4 h", "a cada 1 h 30 min", "a cada 2 dias". */
export function formatInterval(minutes: number) {
	if (minutes % (24 * 60) === 0) {
		const days = minutes / (24 * 60)
		return `a cada ${days} ${days === 1 ? 'dia' : 'dias'}`
	}
	if (minutes < 60) return `a cada ${minutes} min`

	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	return `a cada ${hours} h${rest ? ` ${rest} min` : ''}`
}

export const LANGUAGE_NAMES: Record<string, string> = {
	pt: 'Português',
	en: 'Inglês',
	es: 'Espanhol',
	fr: 'Francês',
	de: 'Alemão',
	it: 'Italiano',
}

export function languageLabel(code: string) {
	return LANGUAGE_NAMES[code] ? `${LANGUAGE_NAMES[code]} (${code})` : code
}

/** Só links http(s) viram botão (o campo vem da IA e pode trazer outra coisa). */
export function safeLink(link: string | null) {
	return link && /^https?:\/\//i.test(link) ? link : null
}

/** Falhas de login do LinkedIn pedem ação manual (captcha/2FA): a interface mostra como alerta. */
export function isLoginFailure(error: string | null) {
	return !!error && /login|captcha|2fa|verifica/i.test(error)
}
