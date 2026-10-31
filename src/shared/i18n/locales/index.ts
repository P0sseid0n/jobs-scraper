import { z } from 'zod'

import type { PartialMessages } from '../catalog'
import { en } from './en'
import { ptBR } from './pt-BR'

export type LocaleDefinition = {
	/** O nome do idioma nele mesmo, como aparece no seletor ("English", não "Inglês"). */
	name: string
	messages: PartialMessages
	/** As mensagens prontas do zod no idioma (`z.locales`). */
	zod: () => { localeError?: z.core.$ZodErrorMap }
	/** Quem traduziu (nome ou usuário do GitHub), para os créditos. */
	translators: string[]
}

/**
 * Os idiomas do sistema. Para adicionar um, crie o catálogo em `locales/<código>.ts` (pode começar incompleto) e
 * registre aqui; ver "Traduzir o site" no CONTRIBUTING.md.
 */
export const LOCALES = {
	'pt-BR': { name: 'Português (Brasil)', messages: ptBR, zod: z.locales.pt, translators: [] },
	en: { name: 'English', messages: en, zod: z.locales.en, translators: [] },
} satisfies Record<string, LocaleDefinition>

/** Um idioma do sistema, pelo código BCP 47 (o mesmo do `Intl` e do `<html lang>`). */
export type Locale = keyof typeof LOCALES

export const LOCALE_CODES = Object.keys(LOCALES) as [Locale, ...Locale[]]

/** O idioma dos textos escritos no código: o catálogo dele é o completo, que define as chaves. */
export const BASE_LOCALE: Locale = 'pt-BR'

/** Como traduzir o site (a seção "Traduzir o site" do CONTRIBUTING.md), aberto pelo "Ajude a traduzir" do seletor. */
export const TRANSLATE_GUIDE_URL = 'https://github.com/P0sseid0n/jobs-scraper/blob/main/CONTRIBUTING.md#traduzir-o-site'

/** Para onde caem os textos que faltam nos catálogos da comunidade (também completo). */
export const FALLBACK_LOCALE: Locale = 'en'
