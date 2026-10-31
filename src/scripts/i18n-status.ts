/**
 * Quanto cada idioma do site já foi traduzido e quais textos faltam, para quem traduz saber o que fazer:
 *
 *   bun i18n:status            a cobertura de cada idioma
 *   bun i18n:status <código>   a cobertura e as chaves que faltam no idioma (ex.: bun i18n:status es)
 *
 * As chaves são os caminhos no catálogo base (`src/shared/i18n/locales/pt-BR.ts`): "jobs.empty.title" é o texto
 * `jobs: { empty: { title } }`. Ver "Traduzir o site" no CONTRIBUTING.md.
 */
import { BASE_LOCALE, coverage, isLocale, LOCALE_CODES, LOCALES, missingKeys } from '@shared/i18n'

const code = Bun.argv[2]

if (code === undefined) {
	for (const locale of LOCALE_CODES) {
		const missing = missingKeys(locale).length
		const detail = locale === BASE_LOCALE ? 'base' : missing ? `faltam ${missing}` : 'completo'
		console.log(`${locale.padEnd(8)}${LOCALES[locale].name.padEnd(24)}${`${coverage(locale)}%`.padStart(5)}  ${detail}`)
	}
	console.log('\nAs chaves que faltam num idioma: bun i18n:status <código>')
} else if (!isLocale(code)) {
	console.error(
		`"${code}" não é um idioma do site (${LOCALE_CODES.join(', ')}). Para criar um, veja "Traduzir o site" no CONTRIBUTING.md.`,
	)
	process.exit(1)
} else {
	const missing = missingKeys(code)
	console.log(`${LOCALES[code].name} (${code}): ${coverage(code)}% traduzido`)
	if (missing.length === 0) console.log('Nenhuma chave faltando.')
	else
		console.log(
			`\nFaltam ${missing.length} chaves (por enquanto, aparecem em inglês):\n${missing.map(key => `  ${key}`).join('\n')}`,
		)
}
