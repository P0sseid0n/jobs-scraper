import { computed, defineComponent, onMounted, ref } from 'vue'

import { DATE_POSTED_FILTERS, type DatePostedFilter } from '@shared/contracts'

import type { WebSettings } from '../../api-types'
import { api, RequestError } from '../api'
import { KeywordInput, Switch } from '../components/forms'
import { Icon } from '../components/Icon'
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

/** Formulário das configurações do scraper e dos filtros das vagas; valem a partir da próxima coleta. */
export const SettingsView = defineComponent({
	name: 'SettingsView',
	setup() {
		const loaded = ref<WebSettings | null>(null)
		const draft = ref<SettingsDraft | null>(null)
		const loadError = ref<string | null>(null)
		const serverErrors = ref<Record<string, string>>({})
		const saveState = ref<SaveState>('idle')
		const saveMessage = ref('')
		const touched = ref(false)
		const newTerm = ref('')
		const savingPause = ref(false)

		async function load() {
			loadError.value = null
			try {
				const [scraper, processing] = await Promise.all([api.settings('scraper'), api.settings('post-processing')])
				loaded.value = { scraper, 'post-processing': processing }
				reset()
			} catch (error) {
				loadError.value = (error as Error).message
			}
		}

		function reset() {
			if (!loaded.value) return
			const { paused: _paused, ...scraper } = loaded.value.scraper
			// Cópia profunda (o structuredClone não aceita os proxies reativos do Vue)
			draft.value = JSON.parse(JSON.stringify({ scraper, 'post-processing': loaded.value['post-processing'] })) as SettingsDraft
			serverErrors.value = {}
			touched.value = false
			saveState.value = 'idle'
		}

		onMounted(load)

		const clientErrors = computed(() => (draft.value ? validateDraft(draft.value) : {}))
		const errors = computed(() => ({ ...serverErrors.value, ...(touched.value ? clientErrors.value : {}) }))

		const dirtyKeys = computed(() => {
			if (!draft.value || !loaded.value) return []
			const { paused: _paused, ...scraper } = loaded.value.scraper
			const keys: (keyof SettingsDraft)[] = []
			if (JSON.stringify(draft.value.scraper) !== JSON.stringify(scraper)) keys.push('scraper')
			if (JSON.stringify(draft.value['post-processing']) !== JSON.stringify(loaded.value['post-processing']))
				keys.push('post-processing')
			return keys
		})

		function change() {
			touched.value = true
			serverErrors.value = {}
			if (saveState.value !== 'saving') saveState.value = 'idle'
		}

		async function save() {
			if (!draft.value || !loaded.value) return
			touched.value = true
			if (Object.keys(clientErrors.value).length > 0) {
				saveState.value = 'error'
				saveMessage.value = 'Corrija os campos marcados antes de salvar.'
				return
			}

			saveState.value = 'saving'
			try {
				for (const key of dirtyKeys.value) {
					const saved = await api.saveSettings(key, draft.value[key])
					loaded.value = { ...loaded.value, [key]: saved }
				}
				reset()
				saveState.value = 'saved'
				saveMessage.value = 'Salvo. O scraper relê as configurações em até 30 s; os filtros valem para os próximos posts.'
			} catch (error) {
				saveState.value = 'error'
				serverErrors.value = error instanceof RequestError ? error.fields : {}
				saveMessage.value = (error as Error).message
			}
		}

		async function setPaused(paused: boolean) {
			if (!loaded.value) return
			savingPause.value = true
			try {
				const saved = await api.saveSettings('scraper', { paused })
				loaded.value = { ...loaded.value, scraper: { ...loaded.value.scraper, paused: saved.paused } }
				notify(paused ? 'Coletas automáticas pausadas' : 'Coletas automáticas retomadas')
			} catch (error) {
				notify(`Não consegui salvar: ${(error as Error).message}`, 'error')
			} finally {
				savingPause.value = false
			}
		}

		function addTerm(event: Event) {
			event.preventDefault()
			const term = newTerm.value.trim()
			if (!draft.value || !term) return

			draft.value.scraper.searchTerms.push({ term, enabled: true })
			newTerm.value = ''
			change()
		}

		function fieldError(path: string) {
			const message = errors.value[path]
			return message ? (
				<p class="field-error" id={`${path}-error`} role="alert">
					{message}
				</p>
			) : null
		}

		const numberInput = (value: number, onValue: (value: number) => void, id: string, attrs: Record<string, unknown>) => (
			<input
				id={id}
				class={['field mono', errors.value[id] && 'invalid']}
				type="number"
				inputmode="numeric"
				value={Number.isNaN(value) ? '' : value}
				aria-invalid={!!errors.value[id]}
				aria-describedby={errors.value[id] ? `${id}-error` : `${id}-help`}
				onInput={(event: Event) => {
					onValue((event.target as HTMLInputElement).valueAsNumber)
					change()
				}}
				{...attrs}
			/>
		)

		function renderScraper(d: SettingsDraft) {
			const terms = d.scraper.searchTerms

			return (
				<section class="card settings-card" aria-labelledby="scraper-title">
					<div class="row-between wrap">
						<h2 id="scraper-title" class="section-title">
							coleta <span class="mono muted xsmall">scraper</span>
						</h2>
						<span class="mono muted xsmall">
							{terms.length} / {LIMITS.searchTerms} termos
						</span>
					</div>

					<fieldset class="stack-sm">
						<legend class="field-label">termos de busca</legend>
						<ul class="stack-xs plain">
							{terms.map((term, index) => (
								<li key={index} class="term-row">
									<Switch
										checked={term.enabled}
										label={`Termo ${term.term || index + 1} ativo`}
										onChange={enabled => {
											term.enabled = enabled
											change()
										}}
									/>
									<input
										class={['field grow', !term.enabled && 'faded', errors.value[`searchTerms.${index}.term`] && 'invalid']}
										value={term.term}
										maxlength={LIMITS.termLength}
										aria-label={`Termo de busca ${index + 1}`}
										aria-invalid={!!errors.value[`searchTerms.${index}.term`]}
										onInput={(event: Event) => {
											term.term = (event.target as HTMLInputElement).value
											change()
										}}
									/>
									<button
										type="button"
										class="icon-btn bordered"
										aria-label={`Remover o termo ${term.term}`}
										onClick={() => {
											terms.splice(index, 1)
											change()
										}}
									>
										<Icon name="trash" />
									</button>
									{fieldError(`searchTerms.${index}.term`)}
								</li>
							))}
						</ul>
						<form class="row gap-sm" onSubmit={addTerm}>
							<input
								class="field grow"
								value={newTerm.value}
								maxlength={LIMITS.termLength}
								placeholder="novo termo, ex.: Front-end Nuxt"
								aria-label="Novo termo de busca"
								disabled={terms.length >= LIMITS.searchTerms}
								onInput={(event: Event) => (newTerm.value = (event.target as HTMLInputElement).value)}
							/>
							<button
								type="submit"
								class="btn btn-ghost"
								disabled={terms.length >= LIMITS.searchTerms || !newTerm.value.trim()}
							>
								<Icon name="plus" />
								adicionar
							</button>
						</form>
						{fieldError('searchTerms')}
						<p class="help">
							De 1 a 10 termos, até 100 caracteres, sem repetidos e ao menos um ativo. Os posts por coleta são divididos entre
							os termos ativos.
						</p>
					</fieldset>

					<div class="grid-3">
						<label class="stack-xs" for="datePosted">
							<span class="field-label">publicadas em</span>
							<select
								id="datePosted"
								class="field"
								value={d.scraper.datePosted}
								onChange={(event: Event) => {
									d.scraper.datePosted = (event.target as HTMLSelectElement).value as DatePostedFilter
									change()
								}}
							>
								{DATE_POSTED_FILTERS.map(value => (
									<option key={value} value={value}>
										{DATE_POSTED_LABELS[value]}
									</option>
								))}
							</select>
						</label>
						<div class="stack-xs">
							<label class="field-label" for="maxPostsPerRun">
								máx. de posts por coleta
							</label>
							{numberInput(d.scraper.maxPostsPerRun, value => (d.scraper.maxPostsPerRun = value), 'maxPostsPerRun', {
								min: 1,
								max: 200,
							})}
							{fieldError('maxPostsPerRun') ?? (
								<p class="help" id="maxPostsPerRun-help">
									de 1 a 200, somando todos os termos
								</p>
							)}
						</div>
						<div class="stack-xs">
							<label class="field-label" for="intervalMinutes">
								intervalo entre coletas (min)
							</label>
							{numberInput(d.scraper.intervalMinutes, value => (d.scraper.intervalMinutes = value), 'intervalMinutes', {
								min: 1,
								max: 10_080,
							})}
							{fieldError('intervalMinutes') ?? (
								<p class="help" id="intervalMinutes-help">
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
				<section class="card settings-card" aria-labelledby="processing-title">
					<h2 id="processing-title" class="section-title">
						filtros das vagas <span class="mono muted xsmall">pós-processamento</span>
					</h2>

					<label class="stack-xs" for="minJobConfidence">
						<span class="row-between">
							<span class="field-label">confiança mínima da IA</span>
							<span class="mono">{p.minJobConfidence}%</span>
						</span>
						<input
							id="minJobConfidence"
							class="range"
							type="range"
							min={0}
							max={100}
							value={p.minJobConfidence}
							onInput={(event: Event) => {
								p.minJobConfidence = Number((event.target as HTMLInputElement).value)
								change()
							}}
						/>
						<span class="help">Posts abaixo disso são descartados como “não é vaga”.</span>
					</label>

					<fieldset class="stack-sm">
						<legend class="field-label">idiomas aceitos</legend>
						<div class="pills">
							{languages.map(code => (
								<label key={code} class="check-pill">
									<input
										type="checkbox"
										class="checkbox"
										checked={p.allowedLanguages.includes(code)}
										onChange={(event: Event) => {
											const checked = (event.target as HTMLInputElement).checked
											p.allowedLanguages = checked
												? [...p.allowedLanguages, code]
												: p.allowedLanguages.filter(item => item !== code)
											change()
										}}
									/>
									{languageLabel(code)}
								</label>
							))}
						</div>
						{fieldError('allowedLanguages')}
						<p class="help">Nenhum marcado aceita todos os idiomas. O idioma é detectado no texto do post.</p>
					</fieldset>

					<div class="grid-2">
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
							<div class="stack-xs" key={field}>
								<span class="row-between">
									<label class="field-label" for={field}>
										{label}
									</label>
									<span class="mono muted xsmall">
										{p[field].length} / {LIMITS.keywords}
									</span>
								</span>
								<KeywordInput
									id={field}
									modelValue={p[field]}
									max={LIMITS.keywords}
									maxLength={LIMITS.keywordLength}
									invalid={!!errors.value[field]}
									describedBy={`${field}-help`}
									onUpdate:modelValue={(value: string[]) => {
										p[field] = value
										change()
									}}
								/>
								{fieldError(field) ?? (
									<p class="help" id={`${field}-help`}>
										{help}
									</p>
								)}
							</div>
						))}
					</div>

					<div class="hint-box">
						<span class="mono" aria-hidden="true">
							?
						</span>
						<p class="help">
							A comparação é por palavra inteira (“java” não pega “javascript”) e ignora maiúsculas, acentos, hífen e “.js”. Ou
							seja, “Vue.js” = “vue” e “Front-End” = “frontend”.
						</p>
					</div>
				</section>
			)
		}

		return () => {
			const d = draft.value
			const paused = loaded.value?.scraper.paused ?? false
			const dirty = dirtyKeys.value.length > 0

			return (
				<div class="page page-medium settings-page">
					<section class="hero">
						<div>
							<h1 class="display">
								configurações <span class="mono display-mono">da máquina.</span>
							</h1>
							<p class="muted lead">
								As mudanças valem a partir da próxima coleta, sem reiniciar nada. Os filtros não reprocessam vagas antigas.
							</p>
						</div>
					</section>

					{loadError.value && (
						<div class="card empty" role="alert">
							<p class="strong">Não consegui carregar as configurações</p>
							<p class="muted small">{loadError.value}</p>
							<button type="button" class="btn btn-lime" onClick={load}>
								tentar de novo
							</button>
						</div>
					)}
					{!loadError.value && !d && <div class="card skeleton settings-skeleton" aria-busy="true" />}

					{loaded.value && (
						<div class={['card pause-card', paused && 'paused']}>
							<div class="grow">
								<p class="strong">
									{paused
										? 'Coletas automáticas pausadas'
										: `Coletas automáticas ligadas · ${formatInterval(loaded.value.scraper.intervalMinutes)}`}
								</p>
								<p class="help">“Coletar agora” continua funcionando mesmo com as coletas pausadas.</p>
							</div>
							<div class="row gap-sm small">
								<label for="settings-paused">pausar coletas</label>
								<Switch
									id="settings-paused"
									checked={paused}
									label="Pausar coletas automáticas"
									disabled={savingPause.value}
									onChange={setPaused}
								/>
							</div>
						</div>
					)}

					{d && renderScraper(d)}
					{d && renderProcessing(d)}

					{d && (
						<div class="save-bar">
							<div class="save-bar-inner">
								<span
									role="status"
									class={[
										'mono small grow',
										saveState.value === 'error' && 'danger-text',
										saveState.value === 'saved' && 'ok-text',
									]}
								>
									{saveState.value === 'saving'
										? 'salvando…'
										: saveState.value !== 'idle'
											? saveMessage.value
											: dirty
												? 'alterações não salvas'
												: 'tudo salvo'}
								</span>
								<button type="button" class="btn btn-ghost" disabled={!dirty || saveState.value === 'saving'} onClick={reset}>
									descartar
								</button>
								<button
									type="button"
									class="btn btn-lime btn-lg"
									disabled={!dirty || saveState.value === 'saving'}
									onClick={save}
								>
									{saveState.value === 'saving' ? 'salvando…' : 'salvar alterações'}
								</button>
							</div>
						</div>
					)}
				</div>
			)
		}
	},
})
