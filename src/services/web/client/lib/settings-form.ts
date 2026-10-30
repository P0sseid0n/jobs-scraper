import { MessageSettingsSchema } from '@shared/contracts'

import type { WebSettings } from '../../api-types'

export const LIMITS = {
	searchTerms: 10,
	termLength: 100,
	minJobsPerRun: [1, 50],
	intervalMinutes: [1, 7 * 24 * 60],
	duplicateWindowDays: [1, 365],
	keywords: 50,
	keywordLength: 50,
	languages: 20,
	area: 80,
	targetRole: 100,
	profileLanguages: 10,
} as const

/** O perfil no formulário: área e cargo-alvo ainda não preenchidos ficam como texto vazio. */
export type ProfileDraft = Omit<WebSettings['profile'], 'area' | 'targetRole'> & { area: string; targetRole: string }

/** Campos editáveis no formulário (o `paused` é salvo na hora, pelo interruptor). */
export type SettingsDraft = {
	scraper: Omit<WebSettings['scraper'], 'paused'>
	'post-processing': WebSettings['post-processing']
	profile: ProfileDraft
	message: WebSettings['message']
}

export function profileDraftOf(profile: WebSettings['profile']): ProfileDraft {
	return { ...profile, area: profile.area ?? '', targetRole: profile.targetRole ?? '' }
}

/**
 * As mesmas regras dos schemas do servidor, para mostrar o erro no campo antes de salvar.
 * Chaves = caminho do campo, como nos erros da API ("searchTerms.0.term").
 */
export function validateDraft(draft: SettingsDraft) {
	const errors: Record<string, string> = {}
	const { searchTerms, minJobsPerRun, intervalMinutes } = draft.scraper
	const seen = new Set<string>()

	searchTerms.forEach((item, index) => {
		const term = item.term.trim()
		const key = term.toLowerCase()

		if (!term) errors[`searchTerms.${index}.term`] = 'Escreva o termo ou remova a linha'
		else if (term.length > LIMITS.termLength) errors[`searchTerms.${index}.term`] = `Use até ${LIMITS.termLength} caracteres`
		else if (seen.has(key)) errors[`searchTerms.${index}.term`] = 'Termo repetido'
		seen.add(key)
	})

	// Sem termos ativos é válido: o scraper fica em espera (a tela avisa)
	if (searchTerms.length > LIMITS.searchTerms) errors.searchTerms = `Use no máximo ${LIMITS.searchTerms} termos`

	if (!isIntIn(minJobsPerRun, LIMITS.minJobsPerRun)) errors.minJobsPerRun = 'Use um número inteiro de 1 a 50'
	if (!isIntIn(intervalMinutes, LIMITS.intervalMinutes)) errors.intervalMinutes = 'Use de 1 minuto a 7 dias'

	const processing = draft['post-processing']
	if (processing.allowedLanguages.length > LIMITS.languages) errors.allowedLanguages = `Escolha no máximo ${LIMITS.languages} idiomas`

	for (const field of ['requiredKeywords', 'excludedKeywords'] as const) {
		if (processing[field].length > LIMITS.keywords) errors[field] = `Use no máximo ${LIMITS.keywords} palavras`
	}

	if (!isIntIn(processing.duplicateWindowDays, LIMITS.duplicateWindowDays))
		errors.duplicateWindowDays = 'Use um número inteiro de 1 a 365'

	// O modelo, as variáveis próprias e os fallbacks: as regras do próprio schema, com as mesmas mensagens do servidor
	for (const [path, message] of Object.entries(messageTemplateErrors(draft.message))) errors[path] ??= message

	return errors
}

/** Os erros do modelo de mensagem (`template.body`, `variables.0.name`, `fallbacks.empresa`…), pelo schema compartilhado. */
export function messageTemplateErrors(message: SettingsDraft['message']) {
	const errors: Record<string, string> = {}
	const result = MessageSettingsSchema.safeParse(message)
	if (result.success) return errors

	for (const issue of result.error.issues) {
		const [root] = issue.path
		if (root !== 'template' && root !== 'variables' && root !== 'fallbacks') continue
		errors[issue.path.join('.')] ??= issue.message
	}

	return errors
}

/**
 * As regras do perfil, à parte porque ele nasce vazio: só vale validar quando a pessoa mexe nele (aí área e cargo-alvo
 * passam a ser obrigatórios, como no servidor depois de preenchidos).
 */
export function validateProfile(profile: ProfileDraft) {
	const errors: Record<string, string> = {}
	const area = profile.area.trim()
	const targetRole = profile.targetRole.trim()

	if (!area) errors.area = 'Informe a área'
	else if (area.length > LIMITS.area) errors.area = `Use até ${LIMITS.area} caracteres`

	if (!targetRole) errors.targetRole = 'Informe o cargo-alvo'
	else if (targetRole.length > LIMITS.targetRole) errors.targetRole = `Use até ${LIMITS.targetRole} caracteres`

	if (profile.languages.length === 0) errors.languages = 'Escolha pelo menos um idioma'
	else if (profile.languages.length > LIMITS.profileLanguages)
		errors.languages = `Escolha no máximo ${LIMITS.profileLanguages} idiomas`

	return errors
}

function isIntIn(value: number, [min, max]: readonly [number, number]) {
	return Number.isInteger(value) && value >= min && value <= max
}

/** O primeiro erro de um campo ou dos campos dentro dele (ex.: "searchTerms" mostra "searchTerms.2.term"). */
export function errorFor(errors: Record<string, string>, field: string) {
	return errors[field] ?? Object.entries(errors).find(([path]) => path.startsWith(`${field}.`))?.[1] ?? null
}

/**
 * O que a semelhança mínima para agrupar repostagens faz na prática, pela faixa escolhida. As faixas vêm dos pares de
 * posts dos testes de `job-duplicates.ts`: uma repostagem com outra abertura, emojis, hashtags e uma linha a mais fica
 * por volta de 80%; outra vaga da mesma empresa escrita no mesmo modelo de post, por volta de 40%.
 */
export function duplicateSimilarityHint(percent: number) {
	if (percent < 30) return 'Muito solto: pode juntar vagas diferentes da mesma empresa.'
	if (percent < 50) return 'Solto: agrupa repostagens bem reescritas, mas pode juntar vagas diferentes.'
	if (percent < 70) return 'Equilibrado (recomendado): agrupa repostagens com pequenas mudanças no texto.'
	if (percent < 90) return 'Rígido: repostagens com parte do texto reescrita ficam separadas.'
	return 'Muito rígido: só agrupa textos quase iguais.'
}
