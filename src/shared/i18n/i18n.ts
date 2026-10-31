import { z } from 'zod'

import { catalogKeys, mergeCatalog, type Messages } from './catalog'
import { BASE_LOCALE, FALLBACK_LOCALE, LOCALE_CODES, LOCALES, type Locale } from './locales'

const cache = new Map<Locale, Messages>()

/** Os textos do idioma; os que faltam num catálogo da comunidade vêm do `en` (e, sem ele, do `pt-BR`). */
export function messagesFor(locale: Locale): Messages {
	let messages = cache.get(locale)
	if (!messages) {
		const base = LOCALES[BASE_LOCALE].messages as Messages
		const fallback = mergeCatalog(base, LOCALES[FALLBACK_LOCALE].messages)
		messages = locale === BASE_LOCALE ? base : mergeCatalog(fallback, LOCALES[locale].messages)
		cache.set(locale, messages)
	}

	return messages
}

const baseKeys = catalogKeys(LOCALES[BASE_LOCALE].messages)

/** As chaves do catálogo base que o idioma ainda não traduziu. */
export function missingKeys(locale: Locale) {
	const keys = new Set(catalogKeys(LOCALES[locale].messages))
	return baseKeys.filter(key => !keys.has(key))
}

/** Quanto do catálogo base o idioma já traduziu, de 0 a 100 (arredondado para baixo: 100 só se estiver completo). */
export function coverage(locale: Locale) {
	return Math.floor(((baseKeys.length - missingKeys(locale).length) / baseKeys.length) * 100)
}

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && LOCALE_CODES.includes(value as Locale)
}

/**
 * O primeiro idioma da lista (ex.: `navigator.languages`) que o sistema tem: o código exato ou, sem ele, o mesmo
 * idioma de outra região ("pt-PT" → "pt-BR", "en-US" → "en"). Sem nenhum, o `pt-BR`.
 */
export function resolveLocale(candidates: readonly string[]): Locale {
	for (const candidate of candidates) {
		const exact = LOCALE_CODES.find(code => code.toLowerCase() === candidate.toLowerCase())
		if (exact) return exact

		const language = localeForLanguage(candidate)
		if (language) return language
	}

	return BASE_LOCALE
}

/** O idioma do sistema para um idioma ISO 639-1 (o detectado num post: "en" → "en", "pt" → "pt-BR"), ou `null`. */
export function localeForLanguage(language: string): Locale | null {
	const code = language.toLowerCase().split('-')[0]
	return LOCALE_CODES.find(locale => locale.toLowerCase().split('-')[0] === code) ?? null
}

let systemLocale: Locale = BASE_LOCALE

/**
 * Guarda o idioma do sistema (o salvo nas configurações): nos serviços, é o idioma atual (`followSystemLocale`, ao
 * subir); no servidor do site, vale fora das requisições.
 */
export function setSystemLocale(locale: Locale) {
	systemLocale = locale
}

export function getSystemLocale() {
	return systemLocale
}

let source: () => Locale = getSystemLocale

/**
 * Define de onde vem o idioma atual: no site, o store do idioma escolhido; no servidor do site, o da requisição; nos
 * outros serviços, o do sistema (o padrão). Os textos de `t()` e as mensagens do zod saem dele.
 */
export function setLocaleSource(next: () => Locale) {
	source = next
}

export function currentLocale() {
	return source()
}

/** Os textos do idioma atual: `t().jobs.empty.title`. */
export function t() {
	return messagesFor(currentLocale())
}

/** As mensagens prontas do zod (campo obrigatório, tipo errado…) no idioma atual, lido a cada erro. */
export function localizeZodErrors() {
	const errorMaps = new Map(LOCALE_CODES.map(locale => [locale, LOCALES[locale].zod().localeError]))
	z.config({ localeError: issue => errorMaps.get(currentLocale())?.(issue) })
}

/** Erro do zod com o texto do idioma atual, lido na hora da validação: `z.string().min(1, message(m => m.x))`. */
export function message(pick: (messages: Messages) => string) {
	return { error: () => pick(t()) }
}

/** O nome do idioma ISO 639-1 no idioma atual, com a inicial maiúscula ("en" → "Inglês"); sem nome, o código. */
export function languageName(code: string, locale = currentLocale()) {
	try {
		const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code)
		return name && name !== code ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : code
	} catch {
		return code
	}
}
