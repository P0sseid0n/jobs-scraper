import { useEffect, useMemo, useState, type FormEvent, type InputHTMLAttributes } from 'react'

import { DATE_POSTED_FILTERS, type DatePostedFilter } from '@shared/contracts'

import type { WebSettings } from '../../api-types'
import { api, RequestError } from '../api'
import { KeywordInput, Switch } from '../components/forms'
import { Icon } from '../components/Icon'
import { cx } from '../lib/cx'
import { formatInterval, LANGUAGE_NAMES, languageLabel } from '../lib/format'
import { LIMITS, validateDraft, type SettingsDraft } from '../lib/settings-form'
import { notify } from '../stores/toast'

const DATE_POSTED_LABELS: Record<DatePostedFilter, string> = {
	'past-24h': 'Últimas 24h',
	'past-week': 'Última semana',
	'past-month': 'Último mês',
	any: 'Qualquer data',
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** O rascunho editável das configurações (o `paused` é salvo na hora, fora do formulário). */
function draftOf(settings: WebSettings): SettingsDraft {
	const { paused: _paused, ...scraper } = settings.scraper
	return structuredClone({ scraper, 'post-processing': settings['post-processing'] })
}

/** Formulário das configurações do scraper e dos filtros das vagas; valem a partir da próxima coleta. */
export function SettingsView() {
	const [loaded, setLoaded] = useState<WebSettings | null>(null)
	const [draft, setDraft] = useState<SettingsDraft | null>(null)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
	const [saveState, setSaveState] = useState<SaveState>('idle')
	const [saveMessage, setSaveMessage] = useState('')
	const [touched, setTouched] = useState(false)
	const [newTerm, setNewTerm] = useState('')
	const [savingPause, setSavingPause] = useState(false)

	async function load() {
		setLoadError(null)
		try {
			const [scraper, processing] = await Promise.all([api.settings('scraper'), api.settings('post-processing')])
			const settings = { scraper, 'post-processing': processing }
			setLoaded(settings)
			reset(settings)
		} catch (error) {
			setLoadError((error as Error).message)
		}
	}

	function reset(settings = loaded) {
		if (!settings) return
		setDraft(draftOf(settings))
		setServerErrors({})
		setTouched(false)
		setSaveState('idle')
	}

	useEffect(() => {
		void load()
	}, [])

	const clientErrors = useMemo(() => (draft ? validateDraft(draft) : {}), [draft])
	const errors: Record<string, string> = { ...serverErrors, ...(touched ? clientErrors : {}) }

	const dirtyKeys = useMemo(() => {
		if (!draft || !loaded) return []
		const saved = draftOf(loaded)
		return (['scraper', 'post-processing'] as const).filter(key => JSON.stringify(draft[key]) !== JSON.stringify(saved[key]))
	}, [draft, loaded])

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
			setSaveMessage('Corrija os campos marcados antes de salvar.')
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
			setSaveMessage('Salvo. O scraper relê as configurações em até 30 s; os filtros valem para os próximos posts.')
		} catch (error) {
			setSaveState('error')
			setServerErrors(error instanceof RequestError ? error.fields : {})
			setSaveMessage((error as Error).message)
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

	function fieldError(path: string) {
		const message = errors[path]
		return message ? (
			<p className="field-error" id={`${path}-error`} role="alert">
				{message}
			</p>
		) : null
	}

	const numberInput = (
		value: number,
		onValue: (draft: SettingsDraft, value: number) => void,
		id: string,
		attrs: InputHTMLAttributes<HTMLInputElement>,
	) => (
		<input
			id={id}
			className={cx('field mono', errors[id] && 'invalid')}
			type="number"
			inputMode="numeric"
			value={Number.isNaN(value) ? '' : value}
			aria-invalid={!!errors[id]}
			aria-describedby={errors[id] ? `${id}-error` : `${id}-help`}
			onChange={event => {
				const number = event.target.valueAsNumber
				edit(d => onValue(d, number))
			}}
			{...attrs}
		/>
	)

	function renderScraper(d: SettingsDraft) {
		const terms = d.scraper.searchTerms

		return (
			<section className="card settings-card" aria-labelledby="scraper-title">
				<div className="row-between wrap">
					<h2 id="scraper-title" className="section-title">
						coleta <span className="mono muted xsmall">scraper</span>
					</h2>
					<span className="mono muted xsmall">
						{terms.length} / {LIMITS.searchTerms} termos
					</span>
				</div>

				<fieldset className="stack-sm">
					<legend className="field-label">termos de busca</legend>
					<ul className="stack-xs plain">
						{terms.map((term, index) => (
							<li key={index} className="term-row">
								<Switch
									checked={term.enabled}
									label={`Termo ${term.term || index + 1} ativo`}
									onChange={enabled =>
										edit(next => {
											next.scraper.searchTerms[index]!.enabled = enabled
										})
									}
								/>
								<input
									className={cx('field grow', !term.enabled && 'faded', errors[`searchTerms.${index}.term`] && 'invalid')}
									value={term.term}
									maxLength={LIMITS.termLength}
									aria-label={`Termo de busca ${index + 1}`}
									aria-invalid={!!errors[`searchTerms.${index}.term`]}
									onChange={event => {
										const value = event.target.value
										edit(next => {
											next.scraper.searchTerms[index]!.term = value
										})
									}}
								/>
								<button
									type="button"
									className="icon-btn bordered"
									aria-label={`Remover o termo ${term.term}`}
									onClick={() =>
										edit(next => {
											next.scraper.searchTerms.splice(index, 1)
										})
									}
								>
									<Icon name="trash" />
								</button>
								{fieldError(`searchTerms.${index}.term`)}
							</li>
						))}
					</ul>
					<form className="row gap-sm" onSubmit={addTerm}>
						<input
							className="field grow"
							value={newTerm}
							maxLength={LIMITS.termLength}
							placeholder="novo termo, ex.: Front-end Nuxt"
							aria-label="Novo termo de busca"
							disabled={terms.length >= LIMITS.searchTerms}
							onChange={event => setNewTerm(event.target.value)}
						/>
						<button type="submit" className="btn btn-ghost" disabled={terms.length >= LIMITS.searchTerms || !newTerm.trim()}>
							<Icon name="plus" />
							adicionar
						</button>
					</form>
					{fieldError('searchTerms')}
					<p className="help">
						De 1 a 10 termos, até 100 caracteres, sem repetidos e ao menos um ativo. Os posts por coleta são divididos entre os
						termos ativos.
					</p>
				</fieldset>

				<div className="grid-3">
					<label className="stack-xs" htmlFor="datePosted">
						<span className="field-label">publicadas em</span>
						<select
							id="datePosted"
							className="field"
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
						</select>
					</label>
					<div className="stack-xs">
						<label className="field-label" htmlFor="maxPostsPerRun">
							máx. de posts por coleta
						</label>
						{numberInput(d.scraper.maxPostsPerRun, (next, value) => (next.scraper.maxPostsPerRun = value), 'maxPostsPerRun', {
							min: 1,
							max: 200,
						})}
						{fieldError('maxPostsPerRun') ?? (
							<p className="help" id="maxPostsPerRun-help">
								de 1 a 200, somando todos os termos
							</p>
						)}
					</div>
					<div className="stack-xs">
						<label className="field-label" htmlFor="intervalMinutes">
							intervalo entre coletas (min)
						</label>
						{numberInput(d.scraper.intervalMinutes, (next, value) => (next.scraper.intervalMinutes = value), 'intervalMinutes', {
							min: 1,
							max: 10_080,
						})}
						{fieldError('intervalMinutes') ?? (
							<p className="help" id="intervalMinutes-help">
								{Number.isInteger(d.scraper.intervalMinutes) && d.scraper.intervalMinutes > 0
									? `${formatInterval(d.scraper.intervalMinutes)} · máx. 7 dias`
									: 'máx. 7 dias'}
							</p>
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
			<section className="card settings-card" aria-labelledby="processing-title">
				<h2 id="processing-title" className="section-title">
					filtros das vagas <span className="mono muted xsmall">pós-processamento</span>
				</h2>

				<label className="stack-xs" htmlFor="minJobConfidence">
					<span className="row-between">
						<span className="field-label">confiança mínima da IA</span>
						<span className="mono">{p.minJobConfidence}%</span>
					</span>
					<input
						id="minJobConfidence"
						className="range"
						type="range"
						min={0}
						max={100}
						value={p.minJobConfidence}
						onChange={event => {
							const value = Number(event.target.value)
							edit(next => {
								next['post-processing'].minJobConfidence = value
							})
						}}
					/>
					<span className="help">Posts abaixo disso são descartados como “não é vaga”.</span>
				</label>

				<fieldset className="stack-sm">
					<legend className="field-label">idiomas aceitos</legend>
					<div className="pills">
						{languages.map(code => (
							<label key={code} className="check-pill">
								<input
									type="checkbox"
									className="checkbox"
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
					</div>
					{fieldError('allowedLanguages')}
					<p className="help">Nenhum marcado aceita todos os idiomas. O idioma é detectado no texto do post.</p>
				</fieldset>

				<div className="grid-2">
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
						<div className="stack-xs" key={field}>
							<span className="row-between">
								<label className="field-label" htmlFor={field}>
									{label}
								</label>
								<span className="mono muted xsmall">
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
							{fieldError(field) ?? (
								<p className="help" id={`${field}-help`}>
									{help}
								</p>
							)}
						</div>
					))}
				</div>

				<div className="hint-box">
					<span className="mono" aria-hidden="true">
						?
					</span>
					<p className="help">
						A comparação é por palavra inteira (“java” não pega “javascript”) e ignora maiúsculas, acentos, hífen e “.js”. Ou
						seja, “Vue.js” = “vue” e “Front-End” = “frontend”.
					</p>
				</div>
			</section>
		)
	}

	const paused = loaded?.scraper.paused ?? false
	const dirty = dirtyKeys.length > 0

	return (
		<div className="page page-medium settings-page">
			<section className="hero">
				<div>
					<h1 className="display">
						configurações <span className="mono display-mono">da máquina.</span>
					</h1>
					<p className="muted lead">
						As mudanças valem a partir da próxima coleta, sem reiniciar nada. Os filtros não reprocessam vagas antigas.
					</p>
				</div>
			</section>

			{loadError && (
				<div className="card empty" role="alert">
					<p className="strong">Não consegui carregar as configurações</p>
					<p className="muted small">{loadError}</p>
					<button type="button" className="btn btn-lime" onClick={load}>
						tentar de novo
					</button>
				</div>
			)}
			{!loadError && !draft && <div className="card skeleton settings-skeleton" aria-busy="true" />}

			{loaded && (
				<div className={cx('card pause-card', paused && 'paused')}>
					<div className="grow">
						<p className="strong">
							{paused
								? 'Coletas automáticas pausadas'
								: `Coletas automáticas ligadas · ${formatInterval(loaded.scraper.intervalMinutes)}`}
						</p>
						<p className="help">“Coletar agora” continua funcionando mesmo com as coletas pausadas.</p>
					</div>
					<div className="row gap-sm small">
						<label htmlFor="settings-paused">pausar coletas</label>
						<Switch
							id="settings-paused"
							checked={paused}
							label="Pausar coletas automáticas"
							disabled={savingPause}
							onChange={setPaused}
						/>
					</div>
				</div>
			)}

			{draft && renderScraper(draft)}
			{draft && renderProcessing(draft)}

			{draft && (
				<div className="save-bar">
					<div className="save-bar-inner">
						<span
							role="status"
							className={cx('mono small grow', saveState === 'error' && 'danger-text', saveState === 'saved' && 'ok-text')}
						>
							{saveState === 'saving'
								? 'salvando…'
								: saveState !== 'idle'
									? saveMessage
									: dirty
										? 'alterações não salvas'
										: 'tudo salvo'}
						</span>
						<button type="button" className="btn btn-ghost" disabled={!dirty || saveState === 'saving'} onClick={() => reset()}>
							descartar
						</button>
						<button type="button" className="btn btn-lime btn-lg" disabled={!dirty || saveState === 'saving'} onClick={save}>
							{saveState === 'saving' ? 'salvando…' : 'salvar alterações'}
						</button>
					</div>
				</div>
			)}
		</div>
	)
}
