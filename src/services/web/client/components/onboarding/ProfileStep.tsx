import { useEffect, useState } from 'react'

import { PROFILE_AREAS, SENIORITY_LEVELS, suggestedRoles, type SeniorityLevel } from '@shared/contracts'

import type { SearchSuggestions, WebSettings } from '../../../api-types'
import { api, RequestError } from '../../api'
import { cx } from '../../lib/cx'
import { LANGUAGE_NAMES, languageLabel } from '../../lib/format'
import { LIMITS, profileDraftOf, validateProfile, type ProfileDraft } from '../../lib/settings-form'
import { notify } from '../../stores/toast'
import { Icon } from '../Icon'
import { Button } from '../ui/Button'
import { Combobox } from '../ui/Combobox'
import { FieldError, FieldHelp, FieldLabel } from '../ui/Field'
import { Checkbox } from '../ui/Input'
import { KeywordInput } from '../ui/KeywordInput'
import { Notice } from '../ui/Notice'
import { Pill, pill, PillGroup } from '../ui/Pill'
import { Skeleton } from '../ui/Skeleton'
import { FIELDSET } from '../ui/text'
import { Rise, StepActions, StepHeading } from './parts'

const SENIORITY_NAMES: Record<SeniorityLevel, string> = {
	intern: 'Estágio',
	junior: 'Júnior',
	mid: 'Pleno',
	senior: 'Sênior',
	lead: 'Liderança',
}

/** O que vai para a busca: os termos e as palavras-chave, revisados pela pessoa antes de salvar. */
type SearchDraft = { searchTerms: string[]; requiredKeywords: string[]; excludedKeywords: string[] }

export type ProfileStepData = Pick<WebSettings, 'profile' | 'scraper' | 'post-processing'>

/**
 * Passo 1, em duas partes: sobre a pessoa (área, cargo-alvo, senioridade, idiomas) e o que procurar (os termos de busca
 * e as palavras-chave, sugeridos pela IA a partir do perfil, para revisar). Cada parte é salva ao continuar.
 */
export function ProfileStep({
	eyebrow,
	initial,
	onBack,
	onDone,
}: {
	eyebrow: string
	initial: ProfileStepData
	onBack?: () => void
	onDone: () => void
}) {
	// Perfil já salvo (pelo .env ou numa visita anterior): começa pela revisão da busca
	const [phase, setPhase] = useState<'about' | 'search'>(initial.profile.area && initial.profile.targetRole ? 'search' : 'about')
	const [profile, setProfile] = useState<ProfileDraft>(() => profileDraftOf(initial.profile))
	const [scraper, setScraper] = useState(initial.scraper)

	return phase === 'about' ? (
		<AboutYou
			key="about"
			eyebrow={eyebrow}
			profile={profile}
			onChange={setProfile}
			onBack={onBack}
			onSaved={() => setPhase('search')}
		/>
	) : (
		<WhatToSearch
			key="search"
			eyebrow={eyebrow}
			targetRole={profile.targetRole}
			scraper={scraper}
			processing={initial['post-processing']}
			onBack={() => setPhase('about')}
			onSaved={saved => {
				setScraper(saved)
				onDone()
			}}
		/>
	)
}

function AboutYou({
	eyebrow,
	profile,
	onChange,
	onBack,
	onSaved,
}: {
	eyebrow: string
	profile: ProfileDraft
	onChange: (profile: ProfileDraft) => void
	onBack?: () => void
	onSaved: () => void
}) {
	const [tried, setTried] = useState(false)
	const [saving, setSaving] = useState(false)
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

	const errors = { ...serverErrors, ...(tried ? validateProfile(profile) : {}) }
	const roles = suggestedRoles(profile.area)
	const languages = [...new Set([...Object.keys(LANGUAGE_NAMES), ...profile.languages])]

	function edit(patch: Partial<ProfileDraft>) {
		onChange({ ...profile, ...patch })
		setServerErrors({})
	}

	async function save() {
		setTried(true)
		if (Object.keys(validateProfile(profile)).length) return

		setSaving(true)
		try {
			await api.saveSettings('profile', {
				area: profile.area.trim(),
				targetRole: profile.targetRole.trim(),
				seniority: profile.seniority,
				languages: profile.languages,
			})
			onSaved()
		} catch (error) {
			if (error instanceof RequestError) setServerErrors(error.fields)
			notify(`Não consegui salvar: ${(error as Error).message}`, 'error')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="flex flex-col gap-9">
			<StepHeading
				eyebrow={eyebrow}
				title="Em que área você trabalha?"
				lead="Assim a gente procura vagas do seu jeito, e não de outra área. Pode escolher uma sugestão ou escrever do seu jeito."
			/>

			<Rise order={3} className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
				<div className="flex flex-col gap-1.5">
					<FieldLabel htmlFor="onboarding-area">sua área</FieldLabel>
					<Combobox
						id="onboarding-area"
						value={profile.area}
						options={Object.keys(PROFILE_AREAS)}
						maxLength={LIMITS.area}
						placeholder="ex.: Marketing, Enfermagem"
						invalid={!!errors.area}
						describedBy={errors.area ? 'onboarding-area-error' : undefined}
						onChange={area => edit({ area })}
					/>
					{errors.area && <FieldError id="onboarding-area-error">{errors.area}</FieldError>}
				</div>
				<div className="flex flex-col gap-1.5">
					<FieldLabel htmlFor="onboarding-role">a vaga que você quer</FieldLabel>
					<Combobox
						id="onboarding-role"
						value={profile.targetRole}
						options={roles}
						maxLength={LIMITS.targetRole}
						placeholder="ex.: Analista de Marketing Digital"
						invalid={!!errors.targetRole}
						describedBy={errors.targetRole ? 'onboarding-role-error' : 'onboarding-role-help'}
						onChange={targetRole => edit({ targetRole })}
					/>
					{errors.targetRole ? (
						<FieldError id="onboarding-role-error">{errors.targetRole}</FieldError>
					) : (
						<FieldHelp id="onboarding-role-help">
							{roles.length > 0
								? `Algumas ideias para ${profile.area.trim()} aparecem ao clicar.`
								: 'O nome do cargo, como aparece nas vagas.'}
						</FieldHelp>
					)}
				</div>
			</Rise>

			<Rise order={4}>
				<fieldset className={FIELDSET}>
					<legend className="mb-2.5 p-0 text-sm font-medium">seu nível de experiência</legend>
					<PillGroup>
						{[...SENIORITY_LEVELS, null].map(level => (
							<Pill key={level ?? 'none'} pressed={profile.seniority === level} onClick={() => edit({ seniority: level })}>
								{level ? SENIORITY_NAMES[level] : 'Prefiro não dizer'}
							</Pill>
						))}
					</PillGroup>
				</fieldset>
			</Rise>

			<Rise order={5}>
				<fieldset className={FIELDSET}>
					<legend className="mb-2.5 p-0 text-sm font-medium">idiomas em que você trabalha</legend>
					<PillGroup>
						{languages.map(code => (
							<label key={code} className={pill({ className: 'cursor-pointer' })}>
								<Checkbox
									checked={profile.languages.includes(code)}
									onChange={event =>
										edit({
											languages: event.target.checked
												? [...profile.languages, code]
												: profile.languages.filter(item => item !== code),
										})
									}
								/>
								{languageLabel(code)}
							</label>
						))}
					</PillGroup>
					{errors.languages && <FieldError>{errors.languages}</FieldError>}
				</fieldset>
			</Rise>

			<StepActions onBack={onBack} order={6}>
				<Button variant="lime" size="lg" disabled={saving} onClick={save}>
					{saving ? 'salvando…' : 'continuar'}
				</Button>
			</StepActions>
		</div>
	)
}

function WhatToSearch({
	eyebrow,
	targetRole,
	scraper,
	processing,
	onBack,
	onSaved,
}: {
	eyebrow: string
	targetRole: string
	scraper: WebSettings['scraper']
	processing: WebSettings['post-processing']
	onBack: () => void
	onSaved: (scraper: WebSettings['scraper']) => void
}) {
	const existing = scraper.searchTerms.filter(term => term.enabled).map(term => term.term)
	// Com termos já salvos, começa por eles; senão, pede as sugestões à IA
	const [draft, setDraft] = useState<SearchDraft | null>(() =>
		existing.length
			? { searchTerms: existing, requiredKeywords: processing.requiredKeywords, excludedKeywords: processing.excludedKeywords }
			: null,
	)
	const [fromAi, setFromAi] = useState(true)
	const [suggesting, setSuggesting] = useState(false)
	const [saving, setSaving] = useState(false)
	const [tried, setTried] = useState(false)

	async function suggest() {
		setSuggesting(true)
		try {
			const suggestions: SearchSuggestions = await api.searchSuggestions()
			setDraft({
				searchTerms: suggestions.searchTerms,
				requiredKeywords: suggestions.requiredKeywords,
				excludedKeywords: suggestions.excludedKeywords,
			})
			setFromAi(suggestions.fromAi)
		} catch (error) {
			notify(`Não consegui sugerir: ${(error as Error).message}`, 'error')
			setDraft(current => current ?? { searchTerms: [targetRole], requiredKeywords: [], excludedKeywords: [] })
			setFromAi(false)
		} finally {
			setSuggesting(false)
		}
	}

	useEffect(() => {
		if (!draft) void suggest()
	}, [])

	async function save() {
		setTried(true)
		if (!draft || draft.searchTerms.length === 0) return

		setSaving(true)
		try {
			// Os termos desligados em Configurações ficam guardados, desligados, depois dos revisados aqui
			const shown = new Set(draft.searchTerms.map(term => term.toLowerCase()))
			const kept = scraper.searchTerms.filter(term => !term.enabled && !shown.has(term.term.toLowerCase()))
			const searchTerms = [...draft.searchTerms.map(term => ({ term, enabled: true })), ...kept].slice(0, LIMITS.searchTerms)

			const saved = await api.saveSettings('scraper', { searchTerms })
			await api.saveSettings('post-processing', {
				requiredKeywords: draft.requiredKeywords,
				excludedKeywords: draft.excludedKeywords,
			})
			onSaved(saved)
		} catch (error) {
			notify(`Não consegui salvar: ${(error as Error).message}`, 'error')
		} finally {
			setSaving(false)
		}
	}

	const edit = (patch: Partial<SearchDraft>) => setDraft(current => current && { ...current, ...patch })

	return (
		<div className="flex flex-col gap-9">
			<StepHeading
				eyebrow={eyebrow}
				title={
					<>
						É isso que vamos <span className="font-mono font-normal">procurar.</span>
					</>
				}
				lead="Separamos algumas buscas e palavras a partir do seu cargo. Tire o que não fizer sentido e adicione o que faltar: dá para mudar depois."
			/>

			{suggesting || !draft ? (
				<Rise order={3} className="flex flex-col gap-4">
					<p className="flex items-center gap-2 text-sm" role="status">
						<Icon name="spinner" />
						Pensando nas melhores buscas para {targetRole.trim() || 'você'}… pode levar alguns segundos.
					</p>
					<div className="flex flex-wrap gap-2" aria-hidden="true">
						{[28, 36, 24, 32, 20].map((width, index) => (
							<Skeleton key={index} className={cx('h-8 rounded-pill bg-surface-2', WIDTHS[width])} />
						))}
					</div>
					<Skeleton className="h-24 rounded-md bg-surface-2" aria-hidden="true" />
				</Rise>
			) : (
				<>
					{!fromAi && (
						<Rise order={3}>
							<Notice tone="warn" icon="alert">
								<p className="text-sm">
									A IA não respondeu agora, então sugerimos só o seu cargo. Adicione outras formas de escrever a vaga, ou
									tente de novo.
								</p>
							</Notice>
						</Rise>
					)}

					<Rise order={3} className="flex flex-col gap-1.5">
						<span className="flex items-center justify-between gap-3">
							<FieldLabel htmlFor="onboarding-terms">o que buscar nos posts do LinkedIn</FieldLabel>
							<span className="font-mono text-xs text-muted">
								{draft.searchTerms.length} / {LIMITS.searchTerms}
							</span>
						</span>
						<KeywordInput
							id="onboarding-terms"
							value={draft.searchTerms}
							max={LIMITS.searchTerms}
							maxLength={LIMITS.termLength}
							keepCase
							invalid={tried && draft.searchTerms.length === 0}
							describedBy="onboarding-terms-help"
							onChange={searchTerms => edit({ searchTerms })}
						/>
						{tried && draft.searchTerms.length === 0 ? (
							<FieldError>Coloque pelo menos uma busca.</FieldError>
						) : (
							<FieldHelp id="onboarding-terms-help">
								Cada uma vira uma busca, como se você digitasse no LinkedIn. Use o nome da vaga do jeito que as empresas
								escrevem.
							</FieldHelp>
						)}
					</Rise>

					<Rise order={4} className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
						<div className="flex flex-col gap-1.5">
							<FieldLabel htmlFor="onboarding-required">a vaga precisa falar de pelo menos uma</FieldLabel>
							<KeywordInput
								id="onboarding-required"
								value={draft.requiredKeywords}
								max={LIMITS.keywords}
								maxLength={LIMITS.keywordLength}
								describedBy="onboarding-required-help"
								onChange={requiredKeywords => edit({ requiredKeywords })}
							/>
							<FieldHelp id="onboarding-required-help">
								Vaga sem nenhuma destas palavras no cargo ou nos requisitos é deixada de fora.
							</FieldHelp>
						</div>
						<div className="flex flex-col gap-1.5">
							<FieldLabel htmlFor="onboarding-excluded">esconder vagas que falem de</FieldLabel>
							<KeywordInput
								id="onboarding-excluded"
								value={draft.excludedKeywords}
								max={LIMITS.keywords}
								maxLength={LIMITS.keywordLength}
								describedBy="onboarding-excluded-help"
								onChange={excludedKeywords => edit({ excludedKeywords })}
							/>
							<FieldHelp id="onboarding-excluded-help">
								Para tirar vagas parecidas que não são para você. Pode deixar vazio.
							</FieldHelp>
						</div>
					</Rise>
				</>
			)}

			<StepActions onBack={onBack} order={5}>
				<Button variant="ghost" disabled={suggesting || saving} onClick={suggest}>
					<Icon name="refresh" />
					sugerir de novo
				</Button>
				<Button variant="lime" size="lg" disabled={suggesting || saving || !draft} onClick={save}>
					{saving ? 'salvando…' : 'continuar'}
				</Button>
			</StepActions>
		</div>
	)
}

// As larguras dos chips de carregamento, com as classes inteiras para o Tailwind encontrar
const WIDTHS: Record<number, string> = { 20: 'w-20', 24: 'w-24', 28: 'w-28', 32: 'w-32', 36: 'w-36' }
