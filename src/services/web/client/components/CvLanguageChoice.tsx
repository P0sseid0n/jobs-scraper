import { useState } from 'react'

import { CV_LANGUAGE_MODES, systemLocale, type CvLanguageMode } from '@shared/contracts'
import { LOCALES } from '@shared/i18n'

import { api } from '../api'
import { useLocale, useT } from '../stores/locale'
import { notify } from '../stores/toast'
import { FieldHelp } from './ui/Field'
import { LEGEND } from './ui/text'

/**
 * O idioma do currículo ajustado: o do sistema ou o da vaga (nas configurações e no passo do currículo do onboarding).
 * Salvo na hora, como o idioma do sistema; se o salvar falhar, volta à escolha de antes.
 */
export function CvLanguageChoice({ initial }: { initial: CvLanguageMode }) {
	const t = useT().language.cvLanguage
	const locale = useLocale()
	const [mode, setMode] = useState(initial)
	const systemName = LOCALES[systemLocale({ locale })].name

	async function save(next: CvLanguageMode) {
		const before = mode
		setMode(next)
		try {
			await api.saveSettings('language', { cvLanguage: next })
		} catch (error) {
			setMode(before)
			notify(t.saveFailed((error as Error).message), 'error')
		}
	}

	return (
		<fieldset className="flex flex-col gap-2.5">
			<legend className={LEGEND}>{t.label}</legend>
			<FieldHelp>{t.description}</FieldHelp>
			<div className="flex flex-col gap-2">
				{CV_LANGUAGE_MODES.map(option => (
					<label key={option} className="flex cursor-pointer items-start gap-2.5 text-sm">
						<input
							type="radio"
							name="cv-language"
							className="mt-1 accent-ink dark:accent-lime"
							checked={mode === option}
							onChange={() => void save(option)}
						/>
						<span>
							<span className="block font-medium">{t[option]}</span>
							<span className="block text-muted">{option === 'system' ? t.systemDetail(systemName) : t.jobDetail}</span>
						</span>
					</label>
				))}
			</div>
		</fieldset>
	)
}
