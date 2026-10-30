import { useBlocker } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react'

import {
	DATE_POSTED_FILTERS,
	EXTRACTION_CHECKS,
	PROFILE_AREAS,
	reviewChecksThreshold,
	SENIORITY_LEVELS,
	suggestedRoles,
	type DatePostedFilter,
	type SeniorityLevel,
} from '@shared/contracts'

import type { CredentialGroup, WebCredentials, WebSettings } from '../../api-types'
import { api, RequestError } from '../api'
import { AccountsSection } from '../components/AccountsSection'
import { AutoRunsSwitch } from '../components/AutoRunsSwitch'
import { DrawnCheck, Icon } from '../components/Icon'
import { MessageTemplateEditor } from '../components/MessageTemplateEditor'
import { Button } from '../components/ui/Button'
import { Combobox } from '../components/ui/Combobox'
import { ConfirmDialog } from '../components/ui/Dialog'
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
import { cx } from '../lib/cx'
import { DATE_POSTED_LABELS, formatInterval, LANGUAGE_NAMES, languageLabel } from '../lib/format'
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
import { setMessageProfile, setMessageSettings } from '../stores/message-settings'
import { notify } from '../stores/toast'

const LIST_FORMAT = new Intl.ListFormat('pt-BR')

const DATE_POSTED_OPTIONS: SelectMenuOption<DatePostedFilter>[] = DATE_POSTED_FILTERS.map(value => ({
	value,
	label: DATE_POSTED_LABELS[value],
}))

const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
	intern: 'Estágio',
	junior: 'Júnior',
	mid: 'Pleno',
	senior: 'Sênior',
	lead: 'Liderança',
}

/** `''` é "Não informar" (`seniority: null`). */
const SENIORITY_OPTIONS: SelectMenuOption<SeniorityLevel | ''>[] = [
	{ value: '', label: 'Não informar' },
	...SENIORITY_LEVELS.map(value => ({ value, label: SENIORITY_LABELS[value] })),
]

type IntervalUnit = 'min' | 'h' | 'd'

/** As unidades do intervalo entre coletas, em minutos; o salvo é sempre em minutos. */
const INTERVAL_UNITS: Record<IntervalUnit, number> = { min: 1, h: 60, d: 24 * 60 }

const INTERVAL_UNIT_OPTIONS: SelectMenuOption<IntervalUnit>[] = [
	{ value: 'min', label: 'minutos' },
	{ value: 'h', label: 'horas' },
	{ value: 'd', label: 'dias' },
]

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
function jobsPerTermLabel(minJobsPerRun: number, activeTerms: number) {
	const base = Math.floor(minJobsPerRun / activeTerms)
	if (base === 0) return `1 vaga em cada um dos ${minJobsPerRun} primeiros termos ativos`

	const count = minJobsPerRun % activeTerms === 0 ? `${base}` : `${base} a ${base + 1}`
	return `${count} por termo, com ${activeTerms} ${activeTerms === 1 ? 'termo ativo' : 'termos ativos'}`
}

/** Os atalhos do `SectionNav`: o `id` de cada seção da tela. */
const SECTIONS = [
	{ id: 'perfil', label: 'perfil' },
	{ id: 'coleta', label: 'coleta' },
	{ id: 'filtros', label: 'filtros' },
	{ id: 'mensagem', label: 'mensagem' },
	{ id: 'contas', label: 'contas' },
] as const

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
 * salvas vêm do loader da rota (`routes/configuracoes.tsx`). As contas ficam no fim, cada uma com o próprio botão de salvar.
 */
export function SettingsView({
	initial,
	credentials,
	account,
}: {
	initial: WebSettings
	credentials: WebCredentials
	/** A aba de contas que abre selecionada (`?conta=` na URL). */
	account?: CredentialGroup
}) {
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
			setSaveMessage({ title: 'Não salvo', detail: 'Corrija os campos marcados antes de salvar.' })
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
			setSaveMessage({
				title: 'Salvo',
				detail: 'O scraper relê as configurações em até 30 s; os filtros valem para os próximos posts.',
			})
		} catch (error) {
			setSaveState('error')
			setServerErrors(error instanceof RequestError ? error.fields : {})
			setSaveMessage({ title: 'Não foi possível salvar', detail: (error as Error).message })
			shakeInvalid(() => document.getElementById('main'))
		}
	}

	async function setPaused(paused: boolean) {
		if (!loaded) return
		setSavingPause(true)
		try {
			const saved = await api.saveSettings('scraper', { paused })
			setLoaded(current => current && { ...current, scraper: { ...current.scraper, paused: saved.paused } })
			notify(paused ? 'Coletas automáticas pausadas' : 'Coletas automáticas retomadas')
		} catch (error) {
			notify(`Não consegui salvar: ${(error as Error).message}`, 'error')
		} finally {
			setSavingPause(false)
		}
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
		const languages = [...new Set([...Object.keys(LANGUAGE_NAMES), ...profile.languages])]
		const suggestions = { area: Object.keys(PROFILE_AREAS), targetRole: suggestedRoles(profile.area) }

		return (
			<SectionCard id="perfil" className={SECTION_SCROLL_MARGIN} title="perfil" tag="profissional">
				<div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
					{(
						[
							['area', 'área', 'ex.: Marketing, Enfermagem, Desenvolvimento de software', LIMITS.area],
							['targetRole', 'cargo-alvo', 'ex.: Analista de Marketing Digital', LIMITS.targetRole],
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
										? 'Escolha uma das sugestões ou digite a sua.'
										: suggestions.targetRole.length > 0
											? `Sugestões para ${profile.area.trim()}, ou digite o seu.`
											: profile.area.trim()
												? `Sem sugestões para ${profile.area.trim()}: digite o cargo que você procura.`
												: 'Escolha a área para ver sugestões de cargo, ou digite o seu.'}
								</FieldHelp>
							)}
						</div>
					))}
				</div>

				<div className="flex flex-col gap-1.5">
					<FieldLabel htmlFor="seniority">senioridade</FieldLabel>
					<SelectMenu
						id="seniority"
						className="max-w-80 max-md:max-w-none"
						value={profile.seniority ?? ''}
						options={SENIORITY_OPTIONS}
						onChange={value =>
							edit(next => {
								next.profile.seniority = value || null
							})
						}
					/>
				</div>

				<fieldset className="flex flex-col gap-2.5">
					<legend className="mb-2.5 p-0 text-sm font-medium">idiomas em que trabalha</legend>
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

				<FieldHelp>
					Usado para buscar e ler vagas da sua área. Enquanto área e cargo-alvo estão vazios, o sistema continua supondo vagas de
					desenvolvimento.
				</FieldHelp>
			</SectionCard>
		)
	}

	function renderScraper(d: SettingsDraft) {
		const terms = d.scraper.searchTerms
		const full = terms.length >= LIMITS.searchTerms
		const activeTerms = terms.filter(term => term.enabled).length
		const { minJobsPerRun, intervalMinutes } = d.scraper

		return (
			<SectionCard id="coleta" className={SECTION_SCROLL_MARGIN} title="coleta" tag="scraper">
				{loaded && (
					// Salvo na hora, fora do formulário. Ligado = coletando (como os outros interruptores da tela); pausado, fica
					// neutro, sem o lime de "rodando"
					<section aria-label="Coletas automáticas" className="flex flex-col gap-1.5 rounded-sm bg-surface-2 p-3.5">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<p className="flex items-center gap-2 font-semibold">
								<StatusDot tone={paused ? 'muted' : 'lime'} glow={!paused} />
								{paused
									? 'Coletas automáticas pausadas'
									: `Coletas automáticas ligadas · ${formatInterval(loaded.scraper.intervalMinutes)}`}
							</p>
							<AutoRunsSwitch id="settings-paused" paused={paused} disabled={savingPause} onPausedChange={setPaused} />
						</div>
						<FieldHelp>
							{paused
								? '“Coletar agora” continua funcionando: uma coleta pedida à mão roda mesmo com as automáticas pausadas.'
								: 'Desligue para pausar: o intervalo para de contar até você religar. Vale na hora, sem salvar.'}
						</FieldHelp>
					</section>
				)}

				<fieldset className="flex flex-col gap-2.5">
					<legend className="mb-2.5 flex w-full items-center justify-between gap-3 p-0 text-sm font-medium">
						termos de busca
						<span className={cx('font-mono text-xs font-normal', full ? 'text-warn' : 'text-muted')}>
							{terms.length} / {LIMITS.searchTerms}
						</span>
					</legend>
					<ul className="flex flex-col gap-1.5 m-0 list-none p-0">
						{terms.map((term, index) => (
							<li key={index} className="flex flex-wrap items-center gap-2.5">
								<Switch
									checked={term.enabled}
									label={`Termo ${term.term || index + 1} ativo`}
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
									aria-label={`Termo de busca ${index + 1}`}
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
									label={`Remover o termo ${term.term}`}
									bordered
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
							placeholder={
								full
									? `limite de ${LIMITS.searchTerms} termos: remova um para adicionar`
									: 'novo termo, ex.: Analista de Marketing'
							}
							aria-label="Novo termo de busca"
							disabled={full}
							onChange={event => setNewTerm(event.target.value)}
						/>
						<Button variant="ghost" type="submit" disabled={full || !newTerm.trim()}>
							<Icon name="plus" />
							adicionar
						</Button>
					</form>
					{fieldError('searchTerms')}
					{!terms.some(term => term.enabled) && (
						<Notice tone="warn" icon="alert">
							<p className="text-sm">Sem nenhum termo ativo, o scraper fica em espera e não coleta.</p>
						</Notice>
					)}
					<FieldHelp>
						Até {LIMITS.searchTerms} termos, com até {LIMITS.termLength} caracteres e sem repetidos.
					</FieldHelp>
				</fieldset>

				<div className="grid grid-cols-3 gap-5 max-md:grid-cols-1">
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="datePosted">publicadas em</FieldLabel>
						<SelectMenu
							id="datePosted"
							value={d.scraper.datePosted}
							options={DATE_POSTED_OPTIONS}
							describedBy="datePosted-help"
							onChange={value =>
								edit(next => {
									next.scraper.datePosted = value
								})
							}
						/>
						<FieldHelp id="datePosted-help">se faltarem vagas, a coleta amplia o período até qualquer data</FieldHelp>
					</div>
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="minJobsPerRun">mín. de vagas por coleta</FieldLabel>
						{numberInput(minJobsPerRun, (next, value) => (next.scraper.minJobsPerRun = value), 'minJobsPerRun', {
							min: LIMITS.minJobsPerRun[0],
							max: LIMITS.minJobsPerRun[1],
						})}
						{fieldError('minJobsPerRun') ?? (
							<FieldHelp id="minJobsPerRun-help">
								de {LIMITS.minJobsPerRun[0]} a {LIMITS.minJobsPerRun[1]}, somando os termos
								{Number.isInteger(minJobsPerRun) && activeTerms > 0 && ` · ${jobsPerTermLabel(minJobsPerRun, activeTerms)}`}
							</FieldHelp>
						)}
					</div>
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="intervalMinutes">intervalo entre coletas</FieldLabel>
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
								label="Unidade do intervalo"
								value={intervalUnit}
								options={INTERVAL_UNIT_OPTIONS}
								onChange={setIntervalUnit}
							/>
						</div>
						{fieldError('intervalMinutes') ?? (
							<FieldHelp id="intervalMinutes-help">
								{Number.isInteger(intervalMinutes) && intervalMinutes > 0
									? `${formatInterval(intervalMinutes)} · máx. 7 dias`
									: 'máx. 7 dias'}
							</FieldHelp>
						)}
					</div>
				</div>
			</SectionCard>
		)
	}

	function renderProcessing(d: SettingsDraft) {
		const p = d['post-processing']
		const languages = [...new Set([...Object.keys(LANGUAGE_NAMES), ...p.allowedLanguages])]

		return (
			<SectionCard id="filtros" className={SECTION_SCROLL_MARGIN} title="filtros das vagas" tag="pós-processamento">
				<div className="flex flex-col gap-1.5">
					<span className="flex items-center justify-between gap-3">
						<FieldLabel htmlFor="reviewChecksPercent">pedir para conferir o post a partir de</FieldLabel>
						<span className="font-mono">{p.reviewChecksPercent}%</span>
					</span>
					<Range
						id="reviewChecksPercent"
						aria-describedby="reviewChecksPercent-help"
						min={1}
						max={100}
						value={p.reviewChecksPercent}
						aria-valuetext={`${p.reviewChecksPercent}% dos checks`}
						onChange={event => {
							const value = Number(event.target.value)
							edit(next => {
								next['post-processing'].reviewChecksPercent = value
							})
						}}
					/>
					<FieldHelp id="reviewChecksPercent-help">
						{reviewChecksThreshold(p.reviewChecksPercent)} de {EXTRACTION_CHECKS.length} checks da extração (campos que a IA
						citou sem estarem no post). Daí em diante, a vaga fica em vermelho e pede para conferir o post original e reportar.
					</FieldHelp>
				</div>

				<fieldset className="flex flex-col gap-2.5">
					<legend className="mb-2.5 p-0 text-sm font-medium">idiomas aceitos</legend>
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
					<FieldHelp>Nenhum marcado aceita todos os idiomas. O idioma é detectado no texto do post.</FieldHelp>
				</fieldset>

				<div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
					{(
						[
							[
								'requiredKeywords',
								'palavras obrigatórias',
								'A vaga precisa citar ao menos uma no cargo ou nas tecnologias. Vazio desliga o filtro.',
							],
							[
								'excludedKeywords',
								'palavras excluídas',
								'A vaga é descartada se citar qualquer uma no cargo ou nas tecnologias.',
							],
						] as const
					).map(([field, label, help]) => (
						<div className="flex flex-col gap-1.5" key={field}>
							<span className="flex items-center justify-between gap-3">
								<FieldLabel htmlFor={field}>{label}</FieldLabel>
								<span className="font-mono text-muted text-xs">
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
					<p className="text-sm">
						A comparação é por palavra inteira (“java” não pega “javascript”) e ignora maiúsculas, acentos, hífen e “.js”. Ou
						seja, “Vue.js” = “vue” e “Front-End” = “frontend”.
					</p>
				</Notice>

				<div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
					<div className="flex flex-col gap-1.5">
						<span className="flex items-center justify-between gap-3">
							<FieldLabel htmlFor="duplicateSimilarityPercent">agrupar repostagens a partir de</FieldLabel>
							<span className="font-mono">{p.duplicateSimilarityPercent}%</span>
						</span>
						<Range
							id="duplicateSimilarityPercent"
							aria-describedby="duplicateSimilarityPercent-help"
							min={1}
							max={100}
							value={p.duplicateSimilarityPercent}
							aria-valuetext={`${p.duplicateSimilarityPercent}% de texto em comum`}
							onChange={event => {
								const value = Number(event.target.value)
								edit(next => {
									next['post-processing'].duplicateSimilarityPercent = value
								})
							}}
						/>
						<FieldHelp id="duplicateSimilarityPercent-help">
							{duplicateSimilarityHint(p.duplicateSimilarityPercent)} É quanto do texto dois posts da mesma empresa e cargo têm
							em comum.
						</FieldHelp>
					</div>
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="duplicateWindowDays">procurar repostagens em (dias)</FieldLabel>
						{numberInput(
							p.duplicateWindowDays,
							(next, value) => (next['post-processing'].duplicateWindowDays = value),
							'duplicateWindowDays',
							{ min: 1, max: 365 },
						)}
						{fieldError('duplicateWindowDays') ?? (
							<FieldHelp id="duplicateWindowDays-help">
								de 1 a 365; a vaga nova é comparada com as salvas nesse período
							</FieldHelp>
						)}
					</div>
				</div>
			</SectionCard>
		)
	}

	function renderMessage(d: SettingsDraft) {
		const message = d.message

		return (
			<SectionCard
				id="mensagem"
				className={SECTION_SCROLL_MARGIN}
				title="mensagem de candidatura"
				description={
					<>
						A mensagem de toda vaga sai do seu modelo, com as variáveis trocadas pelos dados da vaga. Na vaga, “melhorar com a
						IA” reescreve o texto preenchido no tom e no tamanho que você escolher.
					</>
				}
			>
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
						configurações <Hero.Mono>da máquina.</Hero.Mono>
					</>
				}
				lead="As mudanças valem a partir da próxima coleta, sem reiniciar nada. Os filtros não reprocessam vagas antigas."
			/>

			{blocker.status === 'blocked' && (
				<ConfirmDialog
					title="Sair sem salvar?"
					description={
						dirtyAccounts.length > 0
							? `Há alterações não salvas${dirty ? ' nas configurações e' : ''} na ${LIST_FORMAT.format(dirtyAccounts)}; elas vão se perder.`
							: 'As alterações nas configurações ainda não foram salvas e vão se perder.'
					}
					confirmLabel="sair sem salvar"
					cancelLabel="continuar editando"
					onConfirm={blocker.proceed}
					onCancel={blocker.reset}
				/>
			)}

			{draft && <SectionNav sections={SECTIONS} label="Seções das configurações" />}
			{draft && renderProfile(draft)}
			{draft && renderScraper(draft)}
			{draft && renderProcessing(draft)}
			{draft && renderMessage(draft)}
			<AccountsSection
				id="contas"
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
									? 'salvando…'
									: saveState !== 'idle'
										? saveMessage.title
										: dirty
											? 'alterações não salvas'
											: dirtyAccounts.length > 0
												? `${LIST_FORMAT.format(dirtyAccounts)} não salva`
												: 'tudo salvo'}
							</p>
							{/* O "salvar alterações" não leva as contas: cada uma tem o próprio botão */}
							{dirtyAccounts.length > 0 && (saveState === 'idle' || saveState === 'saving') && (
								<p className="text-xs text-muted">
									{dirty ? `e a ${LIST_FORMAT.format(dirtyAccounts)}: ` : ''}use o “salvar” da conta, em contas
								</p>
							)}
							{(saveState === 'saved' || saveState === 'error') && saveMessage.detail && (
								<p className={cx('text-xs', saveState === 'saved' && 'text-muted')}>{saveMessage.detail}</p>
							)}
						</div>
						<div className="flex items-center gap-3 ml-auto">
							<Button variant="ghost" disabled={!dirty || saveState === 'saving'} onClick={() => reset()}>
								descartar
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
										salvando…
									</>
								) : savedFlash ? (
									<>
										<DrawnCheck />
										salvo
									</>
								) : (
									'salvar alterações'
								)}
							</Button>
						</div>
					</div>
				</div>
			)}
		</Page>
	)
}
