import type { WebSettings } from '../../api-types'

export const LIMITS = {
	searchTerms: 10,
	termLength: 100,
	maxPostsPerRun: [1, 200],
	intervalMinutes: [1, 7 * 24 * 60],
	keywords: 50,
	keywordLength: 50,
	languages: 20,
} as const

/** Campos editáveis no formulário (o `paused` é salvo na hora, pelo interruptor). */
export type SettingsDraft = {
	scraper: Omit<WebSettings['scraper'], 'paused'>
	'post-processing': WebSettings['post-processing']
}

/**
 * As mesmas regras dos schemas do servidor, para mostrar o erro no campo antes de salvar.
 * Chaves = caminho do campo, como nos erros da API ("searchTerms.0.term").
 */
export function validateDraft(draft: SettingsDraft) {
	const errors: Record<string, string> = {}
	const { searchTerms, maxPostsPerRun, intervalMinutes } = draft.scraper
	const seen = new Set<string>()

	searchTerms.forEach((item, index) => {
		const term = item.term.trim()
		const key = term.toLowerCase()

		if (!term) errors[`searchTerms.${index}.term`] = 'Escreva o termo ou remova a linha'
		else if (term.length > LIMITS.termLength) errors[`searchTerms.${index}.term`] = `Use até ${LIMITS.termLength} caracteres`
		else if (seen.has(key)) errors[`searchTerms.${index}.term`] = 'Termo repetido'
		seen.add(key)
	})

	if (searchTerms.length === 0) errors.searchTerms = 'Adicione pelo menos um termo de busca'
	else if (searchTerms.length > LIMITS.searchTerms) errors.searchTerms = `Use no máximo ${LIMITS.searchTerms} termos`
	else if (!searchTerms.some(term => term.enabled)) errors.searchTerms = 'Pelo menos um termo de busca precisa estar ativo'

	if (!isIntIn(maxPostsPerRun, LIMITS.maxPostsPerRun)) errors.maxPostsPerRun = 'Use um número inteiro de 1 a 200'
	if (!isIntIn(intervalMinutes, LIMITS.intervalMinutes)) errors.intervalMinutes = 'Use um número inteiro de 1 a 10.080 (7 dias)'

	const processing = draft['post-processing']
	if (!(processing.minJobConfidence >= 0 && processing.minJobConfidence <= 100)) errors.minJobConfidence = 'Use um valor de 0 a 100'
	if (processing.allowedLanguages.length > LIMITS.languages) errors.allowedLanguages = `Escolha no máximo ${LIMITS.languages} idiomas`

	for (const field of ['requiredKeywords', 'excludedKeywords'] as const) {
		if (processing[field].length > LIMITS.keywords) errors[field] = `Use no máximo ${LIMITS.keywords} palavras`
	}

	return errors
}

function isIntIn(value: number, [min, max]: readonly [number, number]) {
	return Number.isInteger(value) && value >= min && value <= max
}

/** O primeiro erro de um campo ou dos campos dentro dele (ex.: "searchTerms" mostra "searchTerms.2.term"). */
export function errorFor(errors: Record<string, string>, field: string) {
	return errors[field] ?? Object.entries(errors).find(([path]) => path.startsWith(`${field}.`))?.[1] ?? null
}
