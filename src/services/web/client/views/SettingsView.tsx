import { useBlocker } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react'

import {
	DATE_POSTED_FILTERS,
	EXTRACTION_CHECKS,
	MESSAGE_DEFAULT_TONES,
	MESSAGE_LENGTHS,
	PROFILE_AREAS,
	reviewChecksThreshold,
	SENIORITY_LEVELS,
	suggestedRoles,
	type DatePostedFilter,
	type MessageDefaultTone,
	type MessageLength,
	type SeniorityLevel,
} from '@shared/contracts'

import type { WebCredentials, WebSettings } from '../../api-types'
import { api, RequestError } from '../api'
import { AccountsSection } from '../components/AccountsSection'
import { AutoRunsSwitch } from '../components/AutoRunsSwitch'
import { DrawnCheck, Icon } from '../components/Icon'
import { Button } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { Combobox } from '../components/ui/Combobox'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FieldError, FieldHelp, FieldLabel } from '../components/ui/Field'
import { IconButton } from '../components/ui/IconButton'
import { Checkbox, field, Input, Range } from '../components/ui/Input'
import { KeywordInput } from '../components/ui/KeywordInput'
import { Notice } from '../components/ui/Notice'
import { Hero, Page, pageFrame } from '../components/ui/Page'
import { pill, PillGroup } from '../components/ui/Pill'
import { SECTION_SCROLL_MARGIN, SectionNav } from '../components/ui/SectionNav'
import { SelectMenu, type SelectMenuOption } from '../components/ui/SelectMenu'
import { Switch } from '../components/ui/Switch'
import { StatusDot } from '../components/ui/StatusDot'
import { FIELDSET, SECTION_TITLE } from '../components/ui/text'
import { cx } from '../lib/cx'
import {
	DATE_POSTED_LABELS,
	formatInterval,
	LANGUAGE_NAMES,
	languageLabel,
	MESSAGE_LENGTH_LABELS,
	MESSAGE_TONE_LABELS,
} from '../lib/format'
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
import { setMessageSettings } from '../stores/message-settings'
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

/** O que cada tom padrão faz, mostrado embaixo das opções. */
const TONE_HELP: Record<MessageDefaultTone, string> = {
	auto: 'A IA escolhe pela vaga: formal para bancos, órgãos públicos e empresas tradicionais; descontraído para startups e posts informais; neutro no resto.',
	formal: '“Prezados,” e frases completas, sem exclamações; fecha com “Agradeço a atenção.”',
	neutral: '“Olá! Tudo bem?”, educado e direto; fecha com “Obrigado!”',
	casual: '“Oi, pessoal! Tudo bem?”, frases curtas como numa conversa, sem gírias nem emojis; fecha com “Abraço!”',
}

const LENGTH_HELP: Record<MessageLength, string> = {
	short: 'Umas 3 frases, para mandar por mensagem direta no LinkedIn.',
	medium: '2 ou 3 parágrafos, para o e-mail ao recrutador.',
}

const SETTINGS_CARD = card({ size: 'lg', className: cx('flex flex-col gap-6.5', SECTION_SCROLL_MARGIN) })

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
export function SettingsView({ initial, credentials }: { initial: WebSettings; credentials: WebCredentials }) {
	const [loaded, setLoaded] = useState<WebSettings | null>(initial)
	const [draft, setDraft] = useState<SettingsDraft | null>(() => draftOf(initial))
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
	const [saveState, setSaveState] = useState<SaveState>('idle')
	const [saveMessage, setSaveMessage] = useState<{ title: string; detail?: string }>({ title: '' })
	const [touched, setTouched] = useState(false)
	const [newTerm, setNewTerm] = useState('')
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
				// A assinatura entra nas mensagens para copiar das outras telas sem recarregar
				if (key === 'message') setMessageSettings(current.message)
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
			<section id="perfil" className={SETTINGS_CARD} aria-labelledby="profile-title">
				<h2 id="profile-title" className={SECTION_TITLE}>
					perfil <span className="font-mono text-xs font-normal text-muted">profissional</span>
				</h2>

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
			</section>
		)
	}

	function renderScraper(d: SettingsDraft) {
		const terms = d.scraper.searchTerms

		return (
			<section id="coleta" className={SETTINGS_CARD} aria-labelledby="scraper-title">
				<div className="flex items-center justify-between gap-3 flex-wrap">
					<h2 id="scraper-title" className={SECTION_TITLE}>
						coleta <span className="font-mono text-xs font-normal text-muted">scraper</span>
					</h2>
					<span className="font-mono text-muted text-xs">
						{terms.length} / {LIMITS.searchTerms} termos
					</span>
				</div>

				<fieldset className="flex flex-col gap-2.5">
					<legend className="mb-2.5 p-0 text-sm font-medium">termos de busca</legend>
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
							placeholder="novo termo, ex.: Analista de Marketing"
							aria-label="Novo termo de busca"
							disabled={terms.length >= LIMITS.searchTerms}
							onChange={event => setNewTerm(event.target.value)}
						/>
						<Button variant="ghost" type="submit" disabled={terms.length >= LIMITS.searchTerms || !newTerm.trim()}>
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
						Até 10 termos, com até 100 caracteres e sem repetidos. As vagas por coleta são divididas entre os termos ativos.
					</FieldHelp>
				</fieldset>

				<div className="grid grid-cols-3 gap-5 max-md:grid-cols-1">
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="datePosted">publicadas em</FieldLabel>
						<SelectMenu
							id="datePosted"
							value={d.scraper.datePosted}
							options={DATE_POSTED_OPTIONS}
							onChange={value =>
								edit(next => {
									next.scraper.datePosted = value
								})
							}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="minJobsPerRun">mín. de vagas por coleta</FieldLabel>
						{numberInput(d.scraper.minJobsPerRun, (next, value) => (next.scraper.minJobsPerRun = value), 'minJobsPerRun', {
							min: 1,
							max: 50,
						})}
						{fieldError('minJobsPerRun') ?? (
							<FieldHelp id="minJobsPerRun-help">
								de 1 a 50, somando todos os termos; a coleta só para antes se as buscas acabarem
							</FieldHelp>
						)}
					</div>
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="intervalMinutes">intervalo entre coletas (min)</FieldLabel>
						{numberInput(d.scraper.intervalMinutes, (next, value) => (next.scraper.intervalMinutes = value), 'intervalMinutes', {
							min: 1,
							max: 10_080,
						})}
						{fieldError('intervalMinutes') ?? (
							<FieldHelp id="intervalMinutes-help">
								{Number.isInteger(d.scraper.intervalMinutes) && d.scraper.intervalMinutes > 0
									? `${formatInterval(d.scraper.intervalMinutes)} · máx. 7 dias`
									: 'máx. 7 dias'}
							</FieldHelp>
						)}
					</div>
				</div>
			</section>
		)
	}

	function renderProcessing(d: SettingsDraft) {
		const p = d['post-processing']
		const languages = [...new Set([...Object.keys(LANGUAGE_NAMES), ...p.allowedLanguages])]

		return (
			<section id="filtros" className={SETTINGS_CARD} aria-labelledby="processing-title">
				<h2 id="processing-title" className={SECTION_TITLE}>
					filtros das vagas <span className="font-mono text-xs font-normal text-muted">pós-processamento</span>
				</h2>

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
			</section>
		)
	}

	function renderMessage(d: SettingsDraft) {
		const message = d.message

		/** Os campos de texto livre do card (o exemplo e a assinatura), com o contador de caracteres. */
		const textField = (key: 'styleSample' | 'signature', label: string, rows: number, placeholder: string, help: string) => {
			const length = message[key].trim().length

			return (
				<div className="flex flex-col gap-1.5">
					<span className="flex items-center justify-between gap-3">
						<FieldLabel htmlFor={key}>{label}</FieldLabel>
						<span className={cx('font-mono text-xs', length > LIMITS[key] ? 'text-danger' : 'text-muted')}>
							{length} / {LIMITS[key]}
						</span>
					</span>
					<textarea
						id={key}
						rows={rows}
						value={message[key]}
						placeholder={placeholder}
						aria-invalid={!!errors[key] || undefined}
						aria-describedby={errors[key] ? `${key}-error` : `${key}-help`}
						onChange={event => {
							const value = event.target.value
							edit(next => {
								next.message[key] = value
							})
						}}
						className={field({ invalid: !!errors[key], className: 'resize-y py-2.5 leading-relaxed' })}
					/>
					{fieldError(key) ?? <FieldHelp id={`${key}-help`}>{help}</FieldHelp>}
				</div>
			)
		}

		return (
			<section id="mensagem" className={SETTINGS_CARD} aria-labelledby="message-title">
				<h2 id="message-title" className={SECTION_TITLE}>
					mensagem de candidatura <span className="font-mono text-xs font-normal text-muted">IA</span>
				</h2>

				{/* Tom e tamanho lado a lado, como na vaga; o tom tem 4 opções e a ajuda mais longa, por isso 2/3 */}
				<div className="grid grid-cols-3 gap-5 max-md:grid-cols-1">
					<fieldset className={cx(FIELDSET, 'col-span-2 min-w-0 max-md:col-span-1')}>
						<legend className="mb-2.5 p-0 text-sm font-medium">tom</legend>
						<PillGroup>
							{MESSAGE_DEFAULT_TONES.map(tone => (
								<label key={tone} className={pill({ className: 'cursor-pointer' })}>
									<input
										type="radio"
										name="message-tone"
										className="sr-only"
										checked={message.tone === tone}
										onChange={() =>
											edit(next => {
												next.message.tone = tone
											})
										}
									/>
									{MESSAGE_TONE_LABELS[tone]}
								</label>
							))}
						</PillGroup>
						<FieldHelp>{TONE_HELP[message.tone]}</FieldHelp>
					</fieldset>

					<fieldset className={cx(FIELDSET, 'min-w-0')}>
						<legend className="mb-2.5 p-0 text-sm font-medium">tamanho</legend>
						<PillGroup>
							{MESSAGE_LENGTHS.map(length => (
								<label key={length} className={pill({ className: 'cursor-pointer' })}>
									<input
										type="radio"
										name="message-length"
										className="sr-only"
										checked={message.length === length}
										onChange={() =>
											edit(next => {
												next.message.length = length
											})
										}
									/>
									{MESSAGE_LENGTH_LABELS[length]}
								</label>
							))}
						</PillGroup>
						<FieldHelp>{LENGTH_HELP[message.length]}</FieldHelp>
					</fieldset>
				</div>

				{textField(
					'styleSample',
					'seu jeito de escrever',
					5,
					'Opcional. Cole uma mensagem que você já mandou para um recrutador.',
					'A IA imita a saudação, as expressões e o fechamento do texto, sem copiar fatos ou empresas dele. Links ficam de fora: eles vão na assinatura.',
				)}

				{textField(
					'signature',
					'assinatura',
					3,
					'Opcional. Ex.: GitHub: https://github.com/voce',
					'Vai no fim de toda mensagem para copiar, exatamente como está, sem passar pela IA: links do GitHub, LinkedIn ou portfólio.',
				)}

				<Notice tone="info" icon="info">
					<p className="text-sm">
						Em qualquer tom, expressões batidas como “agregar valor”, “soluções inovadoras” e “manifestar meu interesse” são
						recusadas, e a IA escreve de novo. Vale para as próximas mensagens; numa vaga, dá para trocar o tom e o tamanho da
						mensagem já gerada.
					</p>
				</Notice>
			</section>
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
							? `Há alterações não salvas${dirty ? ' nas configurações e' : ''} na conta do ${LIST_FORMAT.format(dirtyAccounts)}; elas vão se perder.`
							: 'As alterações nas configurações ainda não foram salvas e vão se perder.'
					}
					confirmLabel="sair sem salvar"
					cancelLabel="continuar editando"
					onConfirm={blocker.proceed}
					onCancel={blocker.reset}
				/>
			)}

			{loaded && (
				// Ligado = coletando (como os outros interruptores da tela); pausado, o card fica neutro, sem o lime de "rodando"
				<div className={card({ size: 'md', className: 'flex flex-wrap items-center gap-4' })}>
					<div className="grow">
						<p className="flex items-center gap-2 font-semibold">
							<StatusDot tone={paused ? 'muted' : 'lime'} glow={!paused} />
							{paused
								? 'Coletas automáticas pausadas'
								: `Coletas automáticas ligadas · ${formatInterval(loaded.scraper.intervalMinutes)}`}
						</p>

						<FieldHelp>
							{paused
								? '“Coletar agora” continua funcionando: uma coleta pedida à mão roda mesmo com as automáticas pausadas.'
								: 'Desligue para pausar: o intervalo para de contar até você religar.'}
						</FieldHelp>
					</div>
					<AutoRunsSwitch id="settings-paused" paused={paused} disabled={savingPause} onPausedChange={setPaused} />
				</div>
			)}

			{draft && <SectionNav sections={SECTIONS} label="Seções das configurações" />}
			{draft && renderProfile(draft)}
			{draft && renderScraper(draft)}
			{draft && renderProcessing(draft)}
			{draft && renderMessage(draft)}
			<AccountsSection id="contas" className={SECTION_SCROLL_MARGIN} initial={credentials} onDirtyChange={setDirtyAccounts} />

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
												? `conta do ${LIST_FORMAT.format(dirtyAccounts)} não salva`
												: 'tudo salvo'}
							</p>
							{/* O "salvar alterações" não leva as contas: cada uma tem o próprio botão */}
							{dirtyAccounts.length > 0 && (saveState === 'idle' || saveState === 'saving') && (
								<p className="text-xs text-muted">
									{dirty ? `e a conta do ${LIST_FORMAT.format(dirtyAccounts)}: ` : ''}use o “salvar” da conta, em contas
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
