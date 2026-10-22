import { useBlocker } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react'

import { DATE_POSTED_FILTERS, SENIORITY_LEVELS, type DatePostedFilter, type SeniorityLevel } from '@shared/contracts'

import type { WebSettings } from '../../api-types'
import { api, RequestError } from '../api'
import { Icon } from '../components/Icon'
import { Button } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FieldError, FieldHelp, FieldLabel } from '../components/ui/Field'
import { IconButton } from '../components/ui/IconButton'
import { Checkbox, Input, Range, Select } from '../components/ui/Input'
import { KeywordInput } from '../components/ui/KeywordInput'
import { Hero, Page } from '../components/ui/Page'
import { pill, PillGroup } from '../components/ui/Pill'
import { Switch, SwitchField } from '../components/ui/Switch'
import { SECTION_TITLE } from '../components/ui/text'
import { cx } from '../lib/cx'
import { formatInterval, LANGUAGE_NAMES, languageLabel } from '../lib/format'
import { LIMITS, profileDraftOf, validateDraft, validateProfile, type SettingsDraft } from '../lib/settings-form'
import { notify } from '../stores/toast'

const DATE_POSTED_LABELS: Record<DatePostedFilter, string> = {
	'past-24h': 'Últimas 24h',
	'past-week': 'Última semana',
	'past-month': 'Último mês',
	any: 'Qualquer data',
}

const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
	intern: 'Estágio',
	junior: 'Júnior',
	mid: 'Pleno',
	senior: 'Sênior',
	lead: 'Liderança',
}

const SETTINGS_CARD = card({ className: 'flex flex-col gap-6.5 p-7 max-md:p-4.5' })

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** O rascunho editável das configurações (o `paused` é salvo na hora, fora do formulário). */
function draftOf(settings: WebSettings): SettingsDraft {
	const { paused: _paused, ...scraper } = settings.scraper
	return structuredClone({ scraper, 'post-processing': settings['post-processing'], profile: profileDraftOf(settings.profile) })
}

/**
 * Formulário do perfil profissional, das configurações do scraper e dos filtros das vagas; valem a partir da próxima coleta. As configurações
 * salvas vêm do loader da rota (`routes/configuracoes.tsx`).
 */
export function SettingsView({ initial }: { initial: WebSettings }) {
	const [loaded, setLoaded] = useState<WebSettings | null>(initial)
	const [draft, setDraft] = useState<SettingsDraft | null>(() => draftOf(initial))
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
	const [saveState, setSaveState] = useState<SaveState>('idle')
	const [saveMessage, setSaveMessage] = useState<{ title: string; detail?: string }>({ title: '' })
	const [touched, setTouched] = useState(false)
	const [newTerm, setNewTerm] = useState('')
	const [savingPause, setSavingPause] = useState(false)

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
		return (['profile', 'scraper', 'post-processing'] as const).filter(
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
		shouldBlockFn: () => dirty && saveState !== 'saving',
		enableBeforeUnload: () => dirty,
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
			return
		}

		setSaveState('saving')
		let current = loaded
		try {
			for (const key of dirtyKeys) {
				const saved = await api.saveSettings(key, draft[key])
				current = { ...current, [key]: saved }
				setLoaded(current)
			}
			reset(current)
			setSaveState('saved')
			setSaveMessage({
				title: 'Salvo',
				detail: 'O scraper relê as configurações em até 30 s; os filtros valem para os próximos posts.',
			})
		} catch (error) {
			setSaveState('error')
			setServerErrors(error instanceof RequestError ? error.fields : {})
			setSaveMessage({ title: 'Não foi possível salvar', detail: (error as Error).message })
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

		return (
			<section className={SETTINGS_CARD} aria-labelledby="profile-title">
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
							<Input
								id={field}
								value={profile[field]}
								maxLength={maxLength}
								placeholder={placeholder}
								invalid={!!errors[field]}
								aria-describedby={errors[field] ? `${field}-error` : undefined}
								onChange={event => {
									const value = event.target.value
									edit(next => {
										next.profile[field] = value
									})
								}}
							/>
							{fieldError(field)}
						</div>
					))}
				</div>

				<div className="flex flex-col gap-1.5">
					<FieldLabel htmlFor="seniority">senioridade</FieldLabel>
					<Select
						id="seniority"
						className="max-w-80 max-md:max-w-none"
						value={profile.seniority ?? ''}
						onChange={event => {
							const value = (event.target.value || null) as SeniorityLevel | null
							edit(next => {
								next.profile.seniority = value
							})
						}}
					>
						<option value="">Não informar</option>
						{SENIORITY_LEVELS.map(value => (
							<option key={value} value={value}>
								{SENIORITY_LABELS[value]}
							</option>
						))}
					</Select>
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
			<section className={SETTINGS_CARD} aria-labelledby="scraper-title">
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
							placeholder="novo termo, ex.: Front-end Nuxt"
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
					<FieldHelp>
						De 1 a 10 termos, até 100 caracteres, sem repetidos e ao menos um ativo. Os posts por coleta são divididos entre os
						termos ativos.
					</FieldHelp>
				</fieldset>

				<div className="grid grid-cols-3 gap-5 max-md:grid-cols-1">
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="datePosted">publicadas em</FieldLabel>
						<Select
							id="datePosted"
							value={d.scraper.datePosted}
							onChange={event => {
								const value = event.target.value as DatePostedFilter
								edit(next => {
									next.scraper.datePosted = value
								})
							}}
						>
							{DATE_POSTED_FILTERS.map(value => (
								<option key={value} value={value}>
									{DATE_POSTED_LABELS[value]}
								</option>
							))}
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<FieldLabel htmlFor="maxPostsPerRun">máx. de posts por coleta</FieldLabel>
						{numberInput(d.scraper.maxPostsPerRun, (next, value) => (next.scraper.maxPostsPerRun = value), 'maxPostsPerRun', {
							min: 1,
							max: 200,
						})}
						{fieldError('maxPostsPerRun') ?? <FieldHelp id="maxPostsPerRun-help">de 1 a 200, somando todos os termos</FieldHelp>}
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
			<section className={SETTINGS_CARD} aria-labelledby="processing-title">
				<h2 id="processing-title" className={SECTION_TITLE}>
					filtros das vagas <span className="font-mono text-xs font-normal text-muted">pós-processamento</span>
				</h2>

				<div className="flex flex-col gap-1.5">
					<span className="flex items-center justify-between gap-3">
						<FieldLabel htmlFor="minJobConfidence">confiança mínima da IA</FieldLabel>
						<span className="font-mono">{p.minJobConfidence}%</span>
					</span>
					<Range
						id="minJobConfidence"
						aria-describedby="minJobConfidence-help"
						min={0}
						max={100}
						value={p.minJobConfidence}
						aria-valuetext={`${p.minJobConfidence}%`}
						onChange={event => {
							const value = Number(event.target.value)
							edit(next => {
								next['post-processing'].minJobConfidence = value
							})
						}}
					/>
					<FieldHelp id="minJobConfidence-help">Posts abaixo disso são descartados como “não é vaga”.</FieldHelp>
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

				<div className="flex gap-3 rounded-md bg-surface-2 px-4 py-3.5">
					<span className="font-mono" aria-hidden="true">
						?
					</span>
					<FieldHelp className="text-ink">
						A comparação é por palavra inteira (“java” não pega “javascript”) e ignora maiúsculas, acentos, hífen e “.js”. Ou
						seja, “Vue.js” = “vue” e “Front-End” = “frontend”.
					</FieldHelp>
				</div>
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
					description="As alterações nas configurações ainda não foram salvas e vão se perder."
					confirmLabel="sair sem salvar"
					cancelLabel="continuar editando"
					onConfirm={blocker.proceed}
					onCancel={blocker.reset}
				/>
			)}

			{loaded && (
				<div className={card({ className: cx('flex flex-wrap items-center gap-4 px-5 py-4.5', paused && 'bg-lime-soft') })}>
					<div className="grow">
						<p className="font-semibold">
							{paused
								? 'Coletas automáticas pausadas'
								: `Coletas automáticas ligadas · ${formatInterval(loaded.scraper.intervalMinutes)}`}
						</p>

						<FieldHelp>“Coletar agora” continua funcionando mesmo com as coletas pausadas.</FieldHelp>
					</div>
					<SwitchField id="settings-paused" title="pausar coletas" checked={paused} disabled={savingPause} onChange={setPaused} />
				</div>
			)}

			{draft && renderProfile(draft)}
			{draft && renderScraper(draft)}
			{draft && renderProcessing(draft)}

			{draft && (
				<div data-save-bar className="fixed inset-x-0 bottom-0 z-25 border-t border-line bg-bg max-md:bottom-safe-16">
					<div className="mx-auto flex max-w-270 flex-wrap items-center gap-3 px-6 py-3 max-md:px-4">
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
											: 'tudo salvo'}
							</p>
							{(saveState === 'saved' || saveState === 'error') && saveMessage.detail && (
								<p className={cx('text-xs', saveState === 'saved' && 'text-muted')}>{saveMessage.detail}</p>
							)}
						</div>
						<div className="flex items-center gap-3 ml-auto">
							<Button variant="ghost" disabled={!dirty || saveState === 'saving'} onClick={() => reset()}>
								descartar
							</Button>
							<Button variant="lime" size="lg" disabled={!dirty || saveState === 'saving'} onClick={save}>
								{saveState === 'saving' ? 'salvando…' : 'salvar alterações'}
							</Button>
						</div>
					</div>
				</div>
			)}
		</Page>
	)
}
