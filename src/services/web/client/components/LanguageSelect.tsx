import { coverage, LOCALE_CODES, LOCALES, TRANSLATE_GUIDE_URL, type Locale } from '@shared/i18n'

import { changeLocale, useLocale, useT } from '../stores/locale'
import { notify } from '../stores/toast'
import { SelectMenu } from './ui/SelectMenu'
import { TextLink } from './ui/TextLink'

/**
 * O seletor do idioma do sistema: troca a tela na hora e salva nas configurações. Os idiomas sem tradução completa
 * mostram quanto já foi traduzido, e embaixo fica o convite para traduzir.
 */
export function LanguageSelect({
	id,
	size,
	invite = true,
	className,
}: {
	id: string
	size?: 'sm' | 'md'
	/** O "Ajude a traduzir" embaixo do seletor (no cabeçalho, sem espaço, fica de fora). */
	invite?: boolean
	className?: string
}) {
	const t = useT()
	const current = useLocale()

	const options = LOCALE_CODES.map(code => {
		const percent = coverage(code)
		return { value: code, label: percent < 100 ? t.language.partial(LOCALES[code].name, percent) : LOCALES[code].name }
	})

	function change(next: Locale) {
		changeLocale(next).catch((error: Error) => notify(t.language.saveFailed(error.message), 'error'))
	}

	return (
		<div className={className}>
			<SelectMenu id={id} size={size} value={current} options={options} label={t.language.label} onChange={change} />
			{invite && (
				<TextLink href={TRANSLATE_GUIDE_URL} external size="xs" className="mt-2 inline-block">
					{t.language.helpTranslate}
				</TextLink>
			)}
		</div>
	)
}
