import { useBlocker } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react'

import {
	DATE_POSTED_FILTERS,
	EXTRACTION_CHECKS,
	reviewChecksThreshold,
	SENIORITY_LEVELS,
	suggestedRoles,
	type SeniorityLevel,
} from '@shared/contracts'
import { LOCALES, type Messages } from '@shared/i18n'

import type { CredentialGroup, WebCredentials, WebSettings } from '../../api-types'
import { api, RequestError } from '../api'
import { AccountsSection } from '../components/AccountsSection'
import { AutoRunsSwitch } from '../components/AutoRunsSwitch'
import { CvLanguageChoice } from '../components/CvLanguageChoice'
import { DrawnCheck, Icon } from '../components/Icon'
import { LanguageSelect } from '../components/LanguageSelect'
import { MessageTemplateEditor } from '../components/MessageTemplateEditor'
import { Button } from '../components/ui/Button'
import { Combobox } from '../components/ui/Combobox'
import { ConfirmDialog } from '../components/ui/Dialog'
import { Disclosure } from '../components/ui/Disclosure'
import { FieldError, FieldHelp, FieldLabel } from '../components/ui/Field'
import { IconButton } from '../components/ui/IconButton'
import { Checkbox, Input, Range } from '../components/ui/Input'
import { KeywordInput } from '../components/ui/KeywordInput'
import { Notice } from '../components/ui/Notice'
import { Hero, Page, pageFrame } from '../components/ui/Page'
import { pill, PillGroup } from '../components/ui/Pill'
import { SectionCard } from '../components/ui/SectionCard'
import { SECTION_SCROLL_MARGIN, SectionNav } from '../components/ui/SectionNav'
import { SelectMenu, type SelectMenuOption } from '../components/ui/SelectMenu'
import { StatusDot } from '../components/ui/StatusDot'
import { Switch } from '../components/ui/Switch'
import { LEGEND, LIST, META } from '../components/ui/text'
import { cx } from '../lib/cx'
import { COMMON_LANGUAGES, formatInterval, formatList, languageLabel } from '../lib/format'
import { shakeInvalid } from '../lib/motion'
import {
	duplicateSimilarityHint,
	LIMITS,
	profileDraftOf,
	validateDraft,
	validateProfile,
	type SettingsDraft,
} from '../lib/settings-form'
import { useFlash } from '../lib/use-flash'
import { useLocale, useT } from '../stores/locale'
import { setMessageProfile, setMessageSettings } from '../stores/message-settings'
import { notify } from '../stores/toast'

type IntervalUnit = 'min' | 'h' | 'd'

/** As unidades do intervalo entre coletas, em minutos; o salvo é sempre em minutos. */
const INTERVAL_UNITS: Record<IntervalUnit, number> = { min: 1, h: 60, d: 24 * 60 }

/** A maior unidade que mostra o intervalo sem fração (1440 → dias, 90 → minutos). */
function intervalUnitOf(minutes: number): IntervalUnit {
	if (minutes % INTERVAL_UNITS.d === 0) return 'd'
	if (minutes % INTERVAL_UNITS.h === 0) return 'h'
	return 'min'
}

/**
 * Como o scraper divide o mínimo de vagas entre os termos ativos (`jobsPerTerm`): o resto vai para os primeiros
 * ("3 a 4 por termo"); com mais termos que vagas, só os primeiros buscam.
 */
function jobsPerTermLabel(t: Messages, minJobsPerRun: number, activeTerms: number) {
	const base = Math.floor(minJobsPerRun / activeTerms)
	if (base === 0) return t.settings.jobsPerTermFirst(minJobsPerRun)

	const count = minJobsPerRun % activeTerms === 0 ? `${base}` : t.settings.jobsRange(base, base + 1)
	return t.settings.jobsPerTerm(count, activeTerms)
}

/** Os atalhos do `SectionNav`: o `id` de cada seção da tela (o nome fica em `settings.sections`). */
const SECTIONS = ['language', 'profile', 'search', 'filters', 'message', 'accounts'] as const

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** O rascunho editável das configurações (o `paused` é salvo na hora, fora do formulário). */
function draftOf(settings: WebSettings): SettingsDraft {
	const { paused: _paused, ...scraper } = settings.scraper
	return structuredClone({
		scraper,
		'post-processing': settings['post-processing'],
		profile: profileDraftOf(settings.profile),
		message: settings.message,
	})
}

/**
 * Formulário do perfil profissional, das configurações do scraper e dos filtros das vagas; valem a partir da próxima coleta. As configurações
 * salvas vêm do loader da rota (`routes/settings.tsx`). As contas ficam no fim, cada uma com o próprio botão de salvar.
 */
export function SettingsView({
	initial,
	credentials,
	account,
}: {
	initial: WebSettings
	credentials: WebCredentials
	/** A aba de contas que abre selecionada (`?account=` na URL). */
	account?: CredentialGroup
}) {
	const t = useT()
	const s = t.settings
	const locale = useLocale()
	const [loaded, setLoaded] = useState<WebSettings | null>(initial)
	const [draft, setDraft] = useState<SettingsDraft | null>(() => draftOf(initial))
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
	const [saveState, setSaveState] = useState<SaveState>('idle')
	const [saveMessage, setSaveMessage] = useState<{ title: string; detail?: string }>({ title: '' })
	const [touched, setTouched] = useState(false)
	const [newTerm, setNewTerm] = useState('')
	const [intervalUnit, setIntervalUnit] = useState(() => intervalUnitOf(initial.scraper.intervalMinutes))
	const [savingPause, setSavingPause] = useState(false)
	const [savedFlash, flashSaved] = useFlash()
	// As contas têm o próprio salvar; a barra de baixo e o aviso de sair contam com elas também
	const [dirtyAccounts, setDirtyAccounts] = useState<string[]>([])

	function reset(settings = loaded) {
		if (!settings) return
		setDraft(draftOf(settings))
		setServerErrors({})
		setTouched(false)
		setSaveState('idle')
	}

	const dirtyKeys = useMemo(() => {
		if (!draft || !loaded) return []
		const saved = draftOf(loaded)
		return (['profile', 'scraper', 'post-processing', 'message'] as const).filter(
			key => JSON.stringify(draft[key]) !== JSON.stringify(saved[key]),
		)
	}, [draft, loaded])

	const dirty = dirtyKeys.length > 0

	// O perfil nasce vazio: só é validado (e salvo) se a pessoa mexer nele
	const clientErrors = useMemo(
		() => (draft ? { ...validateDraft(draft), ...(dirtyKeys.includes('profile') ? validateProfile(draft.profile) : {}) } : {}),
		[draft, dirtyKeys],
	)
	const errors: Record<string, string> = { ...serverErrors, ...(touched ? clientErrors : {}) }

	// Ao voltar para a tela, o router mostra o loader da visita anterior e recarrega por trás: quando os dados novos
	// chegam, passam a ser os salvos (senão um salvar seguinte reenviaria os valores antigos). O rascunho só é trocado
	// se não houver alterações, para não apagar o que já foi digitado.
	const shownInitial = useRef(initial)
	useEffect(() => {
		if (shownInitial.current === initial || saveState === 'saving') return
		shownInitial.current = initial

		setLoaded(initial)
		if (!dirty) reset(initial)
	}, [initial])

	// Sair da tela (ou fechar a aba) com alterações não salvas pede confirmação
	const blocker = useBlocker({
		shouldBlockFn: () => (dirty && saveState !== 'saving') || dirtyAccounts.length > 0,
		enableBeforeUnload: () => dirty || dirtyAccounts.length > 0,
		withResolver: true,
	})

	/** Altera o rascunho (numa cópia) e marca o formulário como mexido. */
	function edit(mutate: (draft: SettingsDraft) => void) {
		setDraft(current => {
			if (!current) return current
			const next = structuredClone(current)
			mutate(next)
			return next
		})
		setTouched(true)
		setServerErrors({})
		if (saveState !== 'saving') setSaveState('idle')
	}

	async function save() {
		if (!draft || !loaded) return
		setTouched(true)
		if (Object.keys(clientErrors).length > 0) {
			setSaveState('error')
			setSaveMessage({ title: s.notSaved, detail: s.fixFields })
			shakeInvalid(() => document.getElementById('main'))
			return
		}

		setSaveState('saving')
		let current = loaded
		try {
			for (const key of dirtyKeys) {
				const saved = await api.saveSettings(key, draft[key])
				current = { ...current, [key]: saved }
				// O modelo e o perfil (das variáveis) entram nas mensagens das outras telas sem recarregar
				if (key === 'message') setMessageSettings(current.message)
				if (key === 'profile') setMessageProfile(current.profile)
				setLoaded(current)
			}
			reset(current)
			setSaveState('saved')
			flashSaved()
			setSaveMessage({ title: s.saved, detail: s.savedDetail })
		} catch (error) {
			setSaveState('error')
			setServerErrors(error instanceof RequestError ? error.fields : {})
			setSaveMessage({ title: s.saveFailed, detail: (error as Error).message })
			shakeInvalid(() => document.getElementById('main'))
		}
	}

	async function setPaused(paused: boolean) {
		if (!loaded) return
		setSavingPause(true)
		try {
			const saved = await api.saveSettings('scraper', { paused })
			setLoaded(current => current && { ...current, scraper: { ...current.scraper, paused: saved.paused } })
			notify(paused ? s.paused : s.resumed)
		} catch (error) {
			notify(t.actions.saveFailed((error as Error).message), 'error')
		} finally {
			setSavingPause(false)
		}
	}

	function renderLanguage() {
		const translators = LOCALES[locale].translators as string[]

		return (
			<SectionCard id="language" className={SECTION_SCROLL_MARGIN} title={s.languageTitle} tag={s.languageTag}>
				<div className="flex flex-col gap-1.5">
					<FieldLabel htmlFor="settings-locale">{t.language.label}</FieldLabel>
					<LanguageSelect id="settings-locale" className="max-w-80 max-md:max-w-none" />
					<FieldHelp>{t.language.description}</FieldHelp>
					{translators.length > 0 && <FieldHelp>{t.language.translatedBy(formatList(translators))}</FieldHelp>}
				</div>

				<CvLanguageChoice initial={initial.language.cvLanguage} />
			</SectionCard>
		)
	}

	function addTerm(event: FormEvent) {
		event.preventDefault()
		const term = newTerm.trim()
		if (!draft || !term) return

		edit(d => {
			d.scraper.searchTerms.push({ term, enabled: true })
		})
		setNewTerm('')
	}

	function fieldError(path: string, className?: string) {
		const message = errors[path]
		return message ? (
			<FieldError id={`${path}-error`} className={className}>
				{message}
			</FieldError>
		) : null
	}

	const numberInput = (
		value: number,
		onValue: (draft: SettingsDraft, value: number) => void,
		id: string,
		attrs: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
	) => (
		<Input
			id={id}
			className="font-mono"
			type="number"
			inputMode="numeric"
			value={Number.isNaN(value) ? '' : value}
			invalid={!!errors[id]}
			aria-describedby={errors[id] ? `${id}-error` : `${id}-help`}
			onChange={event => {
				const number = event.target.valueAsNumber
				edit(d => onValue(d, number))
			}}
			{...attrs}
		/>
	)

	function renderProfile(d: SettingsDraft) {
		const profile = d.profile
		const languages = [...new Set([...COMMON_LANGUAGES, ...profile.languages])]
		const suggestions = { area: t.profile.areas.map(item => item.area), targetRole: suggestedRoles(t.profile.areas, profile.area) }
		/** `''` é "Não informar" (`seniority: null`). */
		const seniorityOptions: SelectMenuOption<SeniorityLevel | ''>[] = [
			{ value: '', label: s.seniorityNone },
			...SENIORITY_LEVELS.map(value => ({ value, label: t.profile.seniority[value] })),
		]

		return (
			<SectionCard id="profile" className={SECTION_SCROLL_MARGIN} title={s.profileTitle} tag={s.profileTag}>
				<div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
					{(
						[
							['area', s.area, s.areaPlaceholder, LIMITS.area],
							['targetRole', s.targetRole, s.targetRolePlaceholder, LIMITS.targetRole],
						] as const
					).map(([field, label, placeholder, maxLength]) => (
						<div className="flex flex-col gap-1.5" key={field}>
							<FieldLabel htmlFor={field}>{label}</FieldLabel>
							<Combobox
								id={field}
								value={profile[field]}
								options={suggestions[field]}
								maxLength={maxLength}
								placeholder={placeholder}
								invalid={!!errors[field]}
								describedBy={errors[field] ? `${field}-error` : `${field}-help`}
								onChange={value =>
									edit(next => {
										next.profile[field] = value
									})
								}
							/>
							{fieldError(field) ?? (
								<FieldHelp id={`${field}-help`}>
									{field === 'area'
										? s.areaHelp
										: suggestions.targetRole.length > 0
											? s.roleSuggestions(profile.area.trim())
											: profile.area.trim()
												? s.roleNoSuggestions(profile.area.trim())
												: s.roleNoArea}
								</FieldHelp>
							)}
						</div>
					))}
				</div>

				<div className="flex flex-col gap-1.5">
					<FieldLabel htmlFor="seniority">{s.seniority}</FieldLabel>
					<SelectMenu
						id="seniority"
						className="max-w-80 max-md:max-w-none"
						value={profile.seniority ?? ''}
						options={seniorityOptions}
						onChange={value =>
							edit(next => {
								next.profile.seniority = value || null
							})
						}
					/>
				</div>

				<fieldset className="flex flex-col gap-2.5">
					<legend className={LEGEND}>{s.profileLanguages}</legend>
					<PillGroup>
						{languages.map(code => (
							<label key={code} className={pill({ className: 'cursor-pointer' })}>
								<Checkbox
									checked={profile.languages.includes(code)}
									onChange={event => {
										const checked = event.target.checked
										edit(next => {
											const current = next.profile.languages
											next.profile.languages = checked ? [...current, code] : current.filter(item => item !== code)
										})
									}}
								/>
								{languageLabel(code)}
							</label>
						))}
					</PillGroup>
					{fieldError('languages')}
				</fieldset>

				<FieldHelp>{s.profileHelp}</FieldHelp>
			</SectionCard>
		)
	}

	function renderScraper(d: SettingsDraft) {
		const terms = d.scraper.searchTerms
		const full = terms.length >= LIMITS.searchTerms
		const activeTerms = terms.filter(term => term.enabled).length
		const { minJobsPerRun, intervalMinutes } = d.scraper

		return (
			<SectionCard id="search" className={SECTION_SCROLL_MARGIN} title={s.runsTitle} tag="scraper">
				{loaded && (
					// Salvo na hora, fora do formulário. Ligado = coletando (como os outros interruptores da tela); pausado, fica
					// neutro, sem o lime de "rodando"
					<section aria-label={s.autoRuns} className="flex flex-col gap-1.5 rounded-sm bg-surface-2 p-3.5">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<p className="flex items-center gap-2 font-semibold">
								<StatusDot tone={paused ? 'muted' : 'lime'} glow={!paused} />
								{paused ? s.paused : s.autoRunsOn(formatInterval(loaded.scraper.intervalMinutes))}
							</p>
							<AutoRunsSwitch id="settings-paused" paused={paused} disabled={savingPause} onPausedChange={setPaused} />
						</div>
						<FieldHelp>{paused ? s.pausedHelp : s.onHelp}</FieldHelp>
					</section>
				)}

				<fieldset className="flex flex-col gap-2.5">
					<legend className={cx(LEGEND, 'flex w-full items-center justify-between gap-3')}>
						{s.searchTerms}
						<span className={cx('font-mono text-xs font-normal', full ? 'text-warn' : 'text-muted')}>
							{terms.length} / {LIMITS.searchTerms}
						</span>
					</legend>
					<ul className={cx(LIST, 'flex flex-col gap-1.5')}>
						{terms.map((term, index) => (
							<li key={index} className="flex flex-wrap items-center gap-2.5">
								<Switch
									checked={term.enabled}
									label={s.termActive(term.term || String(index + 1))}
									onChange={enabled =>
										edit(next => {
											next.scraper.searchTerms[index]!.enabled = enabled
										})
									}
								/>
								<Input
									className={cx('grow', !term.enabled && 'opacity-55')}
									value={term.term}
									maxLength={LIMITS.termLength}
									aria-label={s.termLabel(index + 1)}
									invalid={!!errors[`searchTerms.${index}.term`]}
									onChange={event => {
										const value = event.target.value
										edit(next => {
											next.scraper.searchTerms[index]!.term = value
										})
									}}
								/>
								<IconButton
									className={cx(!term.enabled && 'opacity-55')}
									label={s.removeTerm(term.term)}
									variant="ghost"
									onClick={() =>
										edit(next => {
											next.scraper.searchTerms.splice(index, 1)
										})
									}
								>
									<Icon name="trash" />
								</IconButton>
								{fieldError(`searchTerms.${index}.term`, 'basis-full pl-13.5 max-md:pl-0')}
							</li>
						))}
					</ul>
					<form className="flex items-center gap-2.5" onSubmit={addTerm}>
						<Input
							className="grow"
							value={newTerm}
							maxLength={LIMITS.termLength}
							placeholder={full ? s.termsFull(LIMITS.searchTerms) : s.newTermPlaceholder}
							aria-label={s.newTerm}
							disabled={full}
							onChange={event => setNewTerm(event.target.value)}
						/>
						<Button variant="ghost" type="submit" disabled={full || !newTerm.trim()}>
							<Icon name="plus" />
							{s.add}
						</Button>
					</form>
					{fieldError('searchTerms')}
					{!terms.some(term => term.enabled) && (
						<Notice tone="warn" icon="alert">
							<p>{s.noActiveTerms}</p>
						</Notice>
					)}
					<FieldHelp>{s.termsHelp(LIMITS.searchTerms, LIMITS.termLength)}</FieldHelp>
				</fieldset>

				<div className="grid grid-cols-3 gap-5 max-md:grid-cols-1">
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="datePosted">{s.datePosted}</FieldLabel>
						<SelectMenu
							id="datePosted"
							value={d.scraper.datePosted}
							options={DATE_POSTED_FILTERS.map(value => ({ value, label: t.format.datePosted[value] }))}
							describedBy="datePosted-help"
							onChange={value =>
								edit(next => {
									next.scraper.datePosted = value
								})
							}
						/>
						<FieldHelp id="datePosted-help">{s.datePostedHelp}</FieldHelp>
					</div>
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="minJobsPerRun">{s.minJobs}</FieldLabel>
						{numberInput(minJobsPerRun, (next, value) => (next.scraper.minJobsPerRun = value), 'minJobsPerRun', {
							min: LIMITS.minJobsPerRun[0],
							max: LIMITS.minJobsPerRun[1],
						})}
						{fieldError('minJobsPerRun') ?? (
							<FieldHelp id="minJobsPerRun-help">
								{s.minJobsHelp(LIMITS.minJobsPerRun[0], LIMITS.minJobsPerRun[1])}
								{Number.isInteger(minJobsPerRun) && activeTerms > 0 && ` · ${jobsPerTermLabel(t, minJobsPerRun, activeTerms)}`}
							</FieldHelp>
						)}
					</div>
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="intervalMinutes">{s.interval}</FieldLabel>
						{/* O número na unidade escolhida (trocar a unidade mantém a duração: 1 dia vira 24 h); salvo em minutos */}
						<div className="flex gap-2.5">
							{numberInput(
								// Até 2 casas: 100 min em horas aparece 1,67 (e volta a 100 ao editar)
								Math.round((intervalMinutes / INTERVAL_UNITS[intervalUnit]) * 100) / 100,
								(next, value) => (next.scraper.intervalMinutes = Math.round(value * INTERVAL_UNITS[intervalUnit])),
								'intervalMinutes',
								{
									className: 'min-w-0 grow font-mono',
									min: LIMITS.intervalMinutes[0] / INTERVAL_UNITS[intervalUnit],
									max: LIMITS.intervalMinutes[1] / INTERVAL_UNITS[intervalUnit],
									step: 'any',
								},
							)}
							<SelectMenu
								id="intervalUnit"
								className="w-28 shrink-0"
								label={s.intervalUnit}
								value={intervalUnit}
								options={(Object.keys(INTERVAL_UNITS) as IntervalUnit[]).map(value => ({
									value,
									label: s.intervalUnits[value],
								}))}
								onChange={setIntervalUnit}
							/>
						</div>
						{fieldError('intervalMinutes') ?? (
							<FieldHelp id="intervalMinutes-help">
								{Number.isInteger(intervalMinutes) && intervalMinutes > 0
									? s.intervalMax(formatInterval(intervalMinutes))
									: s.maxSevenDays}
							</FieldHelp>
						)}
					</div>
				</div>
			</SectionCard>
		)
	}

	function renderProcessing(d: SettingsDraft) {
		const p = d['post-processing']
		const languages = [...new Set([...COMMON_LANGUAGES, ...p.allowedLanguages])]

		return (
			<SectionCard id="filters" className={SECTION_SCROLL_MARGIN} title={s.filtersTitle} tag={s.filtersTag}>
				<div className="flex flex-col gap-1.5">
					<span className="flex items-center justify-between gap-3">
						<FieldLabel htmlFor="reviewChecksPercent">{s.reviewFrom}</FieldLabel>
						<span className="font-mono">{p.reviewChecksPercent}%</span>
					</span>
					<Range
						id="reviewChecksPercent"
						aria-describedby="reviewChecksPercent-help"
						min={1}
						max={100}
						value={p.reviewChecksPercent}
						aria-valuetext={s.reviewValue(p.reviewChecksPercent)}
						onChange={event => {
							const value = Number(event.target.value)
							edit(next => {
								next['post-processing'].reviewChecksPercent = value
							})
						}}
					/>
					<FieldHelp id="reviewChecksPercent-help">
						{s.reviewHelp(reviewChecksThreshold(p.reviewChecksPercent), EXTRACTION_CHECKS.length)}
					</FieldHelp>
				</div>

				<fieldset className="flex flex-col gap-2.5">
					<legend className={LEGEND}>{s.allowedLanguages}</legend>
					<PillGroup>
						{languages.map(code => (
							<label key={code} className={pill({ className: 'cursor-pointer' })}>
								<Checkbox
									checked={p.allowedLanguages.includes(code)}
									onChange={event => {
										const checked = event.target.checked
										edit(next => {
											const allowed = next['post-processing'].allowedLanguages
											next['post-processing'].allowedLanguages = checked
												? [...allowed, code]
												: allowed.filter(item => item !== code)
										})
									}}
								/>
								{languageLabel(code)}
							</label>
						))}
					</PillGroup>
					{fieldError('allowedLanguages')}
					<FieldHelp>{s.allowedLanguagesHelp}</FieldHelp>
				</fieldset>

				<div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
					{(
						[
							['requiredKeywords', s.required, s.requiredHelp],
							['excludedKeywords', s.excluded, s.excludedHelp],
						] as const
					).map(([field, label, help]) => (
						<div className="flex flex-col gap-1.5" key={field}>
							<span className="flex items-center justify-between gap-3">
								<FieldLabel htmlFor={field}>{label}</FieldLabel>
								<span className={META}>
									{p[field].length} / {LIMITS.keywords}
								</span>
							</span>
							<KeywordInput
								id={field}
								value={p[field]}
								max={LIMITS.keywords}
								maxLength={LIMITS.keywordLength}
								invalid={!!errors[field]}
								describedBy={`${field}-help`}
								onChange={value =>
									edit(next => {
										next['post-processing'][field] = value
									})
								}
							/>
							{fieldError(field) ?? <FieldHelp id={`${field}-help`}>{help}</FieldHelp>}
						</div>
					))}
				</div>

				<Notice tone="info" icon="info">
					<p>{s.matching}</p>
				</Notice>

				{/* Começa fechada: a lista cresce com o tempo e quase nunca é editada aqui */}
				<Disclosure summary={s.blockedSummary(p.blockedCompanies.length)}>
					<div className="mt-3 flex flex-col gap-1.5 text-ink">
						<span className="flex items-center justify-between gap-3">
							<FieldLabel htmlFor="blockedCompanies">{s.blocked}</FieldLabel>
							<span className={META}>
								{p.blockedCompanies.length} / {LIMITS.blockedCompanies}
							</span>
						</span>
						<KeywordInput
							id="blockedCompanies"
							value={p.blockedCompanies}
							max={LIMITS.blockedCompanies}
							maxLength={LIMITS.companyLength}
							keepCase
							invalid={!!errors.blockedCompanies}
							describedBy="blockedCompanies-help"
							onChange={value =>
								edit(next => {
									next['post-processing'].blockedCompanies = value
								})
							}
						/>
						{fieldError('blockedCompanies') ?? (
							<FieldHelp id="blockedCompanies-help">
								{p.blockedCompanies.length === 0 ? s.noBlocked : ''}
								{s.blockedHelp}
							</FieldHelp>
						)}
					</div>
				</Disclosure>

				<div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
					<div className="flex flex-col gap-1.5">
						<span className="flex items-center justify-between gap-3">
							<FieldLabel htmlFor="duplicateSimilarityPercent">{s.groupFrom}</FieldLabel>
							<span className="font-mono">{p.duplicateSimilarityPercent}%</span>
						</span>
						<Range
							id="duplicateSimilarityPercent"
							aria-describedby="duplicateSimilarityPercent-help"
							min={1}
							max={100}
							value={p.duplicateSimilarityPercent}
							aria-valuetext={s.groupValue(p.duplicateSimilarityPercent)}
							onChange={event => {
								const value = Number(event.target.value)
								edit(next => {
									next['post-processing'].duplicateSimilarityPercent = value
								})
							}}
						/>
						<FieldHelp id="duplicateSimilarityPercent-help">
							{duplicateSimilarityHint(p.duplicateSimilarityPercent)} {s.groupHelp}
						</FieldHelp>
					</div>
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="duplicateWindowDays">{s.window}</FieldLabel>
						{numberInput(
							p.duplicateWindowDays,
							(next, value) => (next['post-processing'].duplicateWindowDays = value),
							'duplicateWindowDays',
							{ min: 1, max: 365 },
						)}
						{fieldError('duplicateWindowDays') ?? <FieldHelp id="duplicateWindowDays-help">{s.windowHelp}</FieldHelp>}
					</div>
				</div>
			</SectionCard>
		)
	}

	function renderMessage(d: SettingsDraft) {
		const message = d.message

		return (
			<SectionCard id="message" className={SECTION_SCROLL_MARGIN} title={s.messageTitle} description={s.messageDescription}>
				<MessageTemplateEditor
					message={message}
					profile={d.profile}
					errors={errors}
					revealErrors={saveState === 'error'}
					edit={mutate => edit(next => mutate(next.message))}
				/>
			</SectionCard>
		)
	}

	const paused = loaded?.scraper.paused ?? false

	return (
		<Page width="medium" className="pb-40">
			<Hero
				title={
					<>
						{s.heroTitle} <Hero.Mono>{s.heroTitleMono}</Hero.Mono>
					</>
				}
				lead={s.heroLead}
			/>

			{blocker.status === 'blocked' && (
				<ConfirmDialog
					title={s.leaveTitle}
					description={dirtyAccounts.length > 0 ? s.leaveAccounts(dirty, formatList(dirtyAccounts)) : s.leaveSettings}
					confirmLabel={s.leave}
					cancelLabel={s.keepEditing}
					onConfirm={blocker.proceed}
					onCancel={blocker.reset}
				/>
			)}

			{draft && <SectionNav sections={SECTIONS.map(id => ({ id, label: s.sections[id] }))} label={s.sectionsNav} />}
			{renderLanguage()}
			{draft && renderProfile(draft)}
			{draft && renderScraper(draft)}
			{draft && renderProcessing(draft)}
			{draft && renderMessage(draft)}
			<AccountsSection
				id="accounts"
				className={SECTION_SCROLL_MARGIN}
				initial={credentials}
				initialGroup={account}
				onDirtyChange={setDirtyAccounts}
			/>

			{draft && (
				<div data-save-bar className="fixed inset-x-0 bottom-0 z-25 border-t border-line bg-bg max-md:bottom-safe-16">
					<div className={pageFrame({ width: 'medium', className: 'flex flex-wrap items-center gap-3 py-3' })}>
						<div
							role="status"
							className={cx(
								'font-mono min-w-48 flex-1',
								saveState === 'error' && 'text-danger',
								saveState === 'saved' && 'text-ok',
							)}
						>
							<p className="text-sm">
								{saveState === 'saving'
									? s.saving
									: saveState !== 'idle'
										? saveMessage.title
										: dirty
											? s.unsaved
											: dirtyAccounts.length > 0
												? s.accountsUnsaved(formatList(dirtyAccounts))
												: s.allSaved}
							</p>
							{/* O "salvar alterações" não leva as contas: cada uma tem o próprio botão */}
							{dirtyAccounts.length > 0 && (saveState === 'idle' || saveState === 'saving') && (
								<p className="text-xs text-muted">{s.accountsHint(dirty, formatList(dirtyAccounts))}</p>
							)}
							{(saveState === 'saved' || saveState === 'error') && saveMessage.detail && (
								<p className={cx('text-xs', saveState === 'saved' && 'text-muted')}>{saveMessage.detail}</p>
							)}
						</div>
						<div className="flex items-center gap-3 ml-auto">
							<Button variant="ghost" disabled={!dirty || saveState === 'saving'} onClick={() => reset()}>
								{s.discard}
							</Button>
							{/* Salvo, o botão mostra o check desenhado por um instante antes de voltar (e não apaga nesse meio-tempo) */}
							<Button
								variant="lime"
								size="lg"
								disabled={(!dirty && !savedFlash) || saveState === 'saving'}
								onClick={savedFlash ? undefined : save}
							>
								{saveState === 'saving' ? (
									<>
										<Icon name="spinner" />
										{s.saving}
									</>
								) : savedFlash ? (
									<>
										<DrawnCheck />
										{s.savedButton}
									</>
								) : (
									s.saveChanges
								)}
							</Button>
						</div>
					</div>
				</div>
			)}
		</Page>
	)
}
