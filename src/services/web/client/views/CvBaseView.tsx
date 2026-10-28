import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { CV_BASE_TEX_MAX_BYTES, type CvForm } from '@shared/contracts'

import type { WebCvBaseVersion } from '../../api-types'
import { api, cvBasePdfUrl, RequestError } from '../api'
import { CvBaseFormDialog } from '../components/CvBaseForm'
import { Icon } from '../components/Icon'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/Dialog'
import { Disclosure } from '../components/ui/Disclosure'
import { FieldError, FieldHelp, FieldLabel } from '../components/ui/Field'
import { iconButton } from '../components/ui/IconButton'
import { field } from '../components/ui/Input'
import { Notice } from '../components/ui/Notice'
import { Hero, Page } from '../components/ui/Page'
import { SECTION_TITLE } from '../components/ui/text'
import { activeVersion, formatKilobytes, texBytes, upsertVersion } from '../lib/cv-base'
import { CV_EXAMPLES, exampleDownloadUrl, type CvExample } from '../lib/cv-examples'
import { cleanForm, emptyForm, formProblems, sameForm } from '../lib/cv-form'
import { cx } from '../lib/cx'
import { formatDateTime } from '../lib/format'
import { connected, onLive } from '../stores/live'
import { notify } from '../stores/toast'

const SECTION_CARD = card({ size: 'lg', className: 'flex flex-col gap-5' })
const MAX_SIZE = formatKilobytes(CV_BASE_TEX_MAX_BYTES)

/** `activeForm`: os dados do formulário da versão ativa, quando ela veio dele. */
export type CvBaseData = { versions: WebCvBaseVersion[]; activeTex: string; activeForm: CvForm | null }

/** O texto no editor e o arquivo de onde veio (o nome vai junto só se o texto não foi mexido depois). */
type Source = { text: string; fileName: string | null }

/** O que vai substituir o editor ou o formulário, à espera da confirmação: uma versão ou um modelo. */
type Replacement = { version: WebCvBaseVersion } | { example: CvExample }

const origin = (version: WebCvBaseVersion) => (version.fromForm ? 'formulário' : (version.fileName ?? 'editado no site'))
/** Onde a versão abre para editar: no formulário, se veio dele; senão, o `.tex` no editor. */
const editLabel = (version: WebCvBaseVersion) => (version.fromForm ? 'editar no formulário' : 'editar o .tex')
const pagesLabel = (pages: number | null) => (pages === null ? null : `${pages} ${pages === 1 ? 'página' : 'páginas'}`)

/** A pré-visualização do PDF: embutida no computador; no celular, que não mostra PDF dentro da página, só o botão. */
function Preview({ version }: { version: WebCvBaseVersion }) {
	return (
		<iframe
			title={`Pré-visualização do currículo base de ${formatDateTime(version.createdAt)}`}
			src={cvBasePdfUrl(version.versionId)}
			className="hidden aspect-3/4 max-h-200 w-full rounded-sm border border-line bg-white md:block"
		/>
	)
}

function Errors({ version }: { version: WebCvBaseVersion }) {
	return (
		<Notice tone="danger" icon="alert">
			<p className="font-semibold">Versão recusada; o currículo base continua o mesmo.</p>
			<ul className="m-0 mt-1.5 flex list-disc flex-col gap-1 pl-4.5 font-mono text-xs break-words">
				{version.errors.map(error => (
					<li key={error}>{error}</li>
				))}
			</ul>
		</Notice>
	)
}

/**
 * "Currículo base": o `.tex` de onde saem os currículos ajustados. Uma versão nova (preenchida no formulário, enviada ou
 * editada aqui) é validada
 * pelo cv-updater e só depois pode ser ativada; o histórico permite voltar a uma anterior. Os dados iniciais vêm do
 * loader da rota (`routes/curriculos_.base.tsx`); o resto chega pelo stream (`cvBase`).
 */
export function CvBaseView({ initial }: { initial: CvBaseData }) {
	const [versions, setVersions] = useState(initial.versions)
	const [text, setText] = useState(initial.activeTex)
	const [source, setSource] = useState<Source>(() => ({
		text: initial.activeTex,
		fileName: activeVersion(initial.versions)?.fileName ?? null,
	}))
	/** O texto que já está numa versão (enviado ou carregado de uma): sem mudanças, sair da tela não pede confirmação. */
	const [savedText, setSavedText] = useState(initial.activeTex)
	const [form, setForm] = useState(() => initial.activeForm ?? emptyForm())
	/** O formulário que já está numa versão, como o `savedText`. */
	const [savedForm, setSavedForm] = useState(form)
	/** A modal com as etapas do formulário; fechada, o rascunho continua em `form`. */
	const [formOpen, setFormOpen] = useState(false)
	const [serverProblems, setServerProblems] = useState<Record<string, string>>({})
	const [candidateId, setCandidateId] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)
	const [activating, setActivating] = useState<string | null>(null)
	const [replaceWith, setReplaceWith] = useState<Replacement | null>(null)
	const fileInput = useRef<HTMLInputElement>(null)
	const editor = useRef<HTMLTextAreaElement>(null)

	const active = activeVersion(versions)
	const candidate = versions.find(version => version.versionId === candidateId) ?? null
	const size = texBytes(text)
	const tooBig = size > CV_BASE_TEX_MAX_BYTES
	const dirty = text !== savedText
	const formDirty = !sameForm(form, savedForm)

	useEffect(() => {
		const stop = onLive('cvBase', version => setVersions(current => upsertVersion(current, version)))
		return () => void stop()
	}, [])

	// Ao voltar para a tela, o router recarrega por trás: as versões novas entram sem apagar o editor
	useEffect(() => {
		setVersions(current => initial.versions.reduce(upsertVersion, current))
	}, [initial])

	// Sem o stream (conexão caiu), consulta as versões a cada 10 s enquanto alguma está validando
	const validating = versions.some(version => version.status === 'validating')
	useEffect(() => {
		if (!validating) return

		const timer = setInterval(async () => {
			if (connected.get()) return
			try {
				const { versions: fresh } = await api.cvBase()
				setVersions(current => fresh.reduce(upsertVersion, current))
			} catch {
				// tenta de novo na próxima volta
			}
		}, 10_000)

		return () => clearInterval(timer)
	}, [validating])

	const blocker = useBlocker({
		shouldBlockFn: () => (dirty || formDirty) && !submitting,
		enableBeforeUnload: () => dirty || formDirty,
		withResolver: true,
	})

	async function loadFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return

		if (file.size > CV_BASE_TEX_MAX_BYTES) {
			notify(`O arquivo tem ${formatKilobytes(file.size)}; o limite é ${MAX_SIZE}.`, 'error')
			return
		}

		const content = await file.text()
		setText(content)
		setSource({ text: content, fileName: file.name })
		editor.current?.focus()
	}

	async function submit() {
		setSubmitting(true)
		try {
			const version = await api.createCvBaseVersion(text, text === source.text ? source.fileName : null)
			setVersions(current => upsertVersion(current, version))
			setCandidateId(version.versionId)
			setSavedText(text)
		} catch (error) {
			notify(`Não consegui enviar o .tex: ${(error as Error).message}`, 'error')
		} finally {
			setSubmitting(false)
		}
	}

	async function submitForm() {
		setServerProblems({})
		// A modal só libera o botão sem problemas; a checagem fica para o caso de algo escapar dela
		if (Object.keys(formProblems(form)).length) return

		setSubmitting(true)
		try {
			const version = await api.createCvBaseVersionFromForm(cleanForm(form))
			setVersions(current => upsertVersion(current, version))
			setCandidateId(version.versionId)
			setSavedForm(form)
			setFormOpen(false)
		} catch (error) {
			// Os erros de campo da API vêm como "form.contact.name"; o formulário usa o caminho sem o prefixo
			if (error instanceof RequestError) {
				setServerProblems(
					Object.fromEntries(Object.entries(error.fields).map(([path, message]) => [path.replace(/^form./, ''), message])),
				)
			}
			notify(`Não consegui enviar o formulário: ${(error as Error).message}`, 'error')
		} finally {
			setSubmitting(false)
		}
	}

	async function activate(version: WebCvBaseVersion) {
		setActivating(version.versionId)
		try {
			const updated = await api.activateCvBaseVersion(version.versionId)
			setVersions(current => upsertVersion(current, updated))
			notify('Currículo base trocado: o próximo currículo gerado já usa esta versão.')
		} catch (error) {
			notify(`Não consegui ativar a versão: ${(error as Error).message}`, 'error')
		} finally {
			setActivating(null)
		}
	}

	/**
	 * Carrega a versão para editar: no formulário, se veio dele; senão, o `.tex` no editor. Pede confirmação antes se o
	 * que vai ser trocado tem mudanças.
	 */
	async function edit(version: WebCvBaseVersion, confirmed = false) {
		if ((version.fromForm ? formDirty : dirty) && !confirmed) {
			setReplaceWith({ version })
			return
		}
		setReplaceWith(null)

		try {
			const loaded = await api.cvBaseVersion(version.versionId)
			setCandidateId(null)
			if (loaded.form) {
				setForm(loaded.form)
				setSavedForm(loaded.form)
				setFormOpen(true)
				return
			}

			setText(loaded.tex)
			setSource({ text: loaded.tex, fileName: version.fileName })
			setSavedText(loaded.tex)
			focusEditor()
		} catch (error) {
			notify(`Não consegui carregar a versão: ${(error as Error).message}`, 'error')
		}
	}

	/** Põe um modelo no editor (pede confirmação antes se o editor tem mudanças); ele ainda precisa ser validado. */
	function loadExample(example: CvExample, confirmed = false) {
		if (dirty && !confirmed) {
			setReplaceWith({ example })
			return
		}
		setReplaceWith(null)

		setText(example.tex)
		setSource({ text: example.tex, fileName: example.fileName })
		setCandidateId(null)
		focusEditor()
	}

	function focusEditor() {
		editor.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
		editor.current?.focus({ preventScroll: true })
	}

	const replacesForm = !!replaceWith && 'version' in replaceWith && replaceWith.version.fromForm

	/** `ghost` no histórico: lá ativar é raro (e sem conferir a prévia); o lime fica para a versão que acabou de validar. */
	const activateButton = (version: WebCvBaseVersion, size: 'sm' | 'md' = 'md', variant: 'lime' | 'ghost' = 'lime') => (
		<Button variant={variant} size={size} disabled={activating !== null} onClick={() => activate(version)}>
			{activating === version.versionId ? 'ativando…' : 'ativar esta versão'}
		</Button>
	)

	function renderActive() {
		return (
			<section className={SECTION_CARD} aria-labelledby="cv-base-active">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 id="cv-base-active" className={SECTION_TITLE}>
						versão ativa
					</h2>
					{active && (
						<div className="flex gap-2">
							<Button variant="ghost" size="sm" onClick={() => edit(active)}>
								{editLabel(active)}
							</Button>
							<Button variant="ghost" size="sm" href={cvBasePdfUrl(active.versionId)} external>
								abrir PDF
							</Button>
						</div>
					)}
				</div>

				{active ? (
					<>
						<p className="font-mono text-xs text-muted">
							{[
								`ativada ${formatDateTime(active.activatedAt!)}`,
								origin(active),
								pagesLabel(active.pages),
								formatKilobytes(active.size),
							]
								.filter(Boolean)
								.join(' · ')}
						</p>
						<Preview version={active} />
					</>
				) : (
					<Notice tone="warn" icon="file">
						Nenhuma versão ativada pelo site: o cv-updater usa o arquivo <code className="font-mono">data/cv/cv.tex</code> (
						<code className="font-mono">CV_TEX_FILE</code>). Preencha o formulário ou envie o seu .tex abaixo para trocar o
						currículo pelo site.
					</Notice>
				)}
			</section>
		)
	}

	function renderCandidate(version: WebCvBaseVersion) {
		if (version.status === 'validating') {
			return (
				<p role="status" className="flex items-center gap-2 text-sm text-muted">
					<Icon name="spinner" size={16} />
					Validando no cv-updater…
				</p>
			)
		}
		if (version.status === 'invalid') return <Errors version={version} />

		// Depois de ativada, a prévia já aparece em "versão ativa": aqui fica só a confirmação
		if (version.versionId === active?.versionId) {
			return (
				<p role="status" className="flex items-center gap-2 text-sm text-ok">
					<Icon name="check" size={16} />
					Esta versão é o currículo base.
				</p>
			)
		}

		return (
			<div className="flex flex-col gap-3.5">
				<div className="flex flex-wrap items-center gap-3">
					<p role="status" className="flex grow items-center gap-2 text-sm text-ok">
						<Icon name="check" size={16} />
						{`Compilou sem erros${version.pages ? ` (${pagesLabel(version.pages)})` : ''}. Confira a prévia e ative.`}
					</p>
					<Button variant="ghost" href={cvBasePdfUrl(version.versionId)} external>
						abrir PDF
					</Button>
					{activateButton(version)}
				</div>
				{version.pages !== null && version.pages > 1 && (
					<Notice tone="warn" icon="alert">
						O currículo base tem {version.pages} páginas. Cada currículo ajustado precisa caber em uma: o cv-updater tira
						projetos e volta à apresentação original até caber, e pode não conseguir.
					</Notice>
				)}
				<Preview version={version} />
			</div>
		)
	}

	function renderExamples() {
		const intro = 'Comece por um modelo: troque os dados pelos seus e valide.'
		const list = (
			<ul className="m-0 flex list-none flex-col gap-2.5 p-0">
				{CV_EXAMPLES.map(example => {
					const download = `baixar ${example.fileName}`

					return (
						<li key={example.fileName} className={card({ size: 'sm', className: 'flex flex-col gap-1.5' })}>
							<div className="flex items-center justify-between gap-3">
								<span className="flex min-w-0 items-baseline gap-2">
									<span className="shrink-0 font-semibold">{example.title}</span>
									<span aria-hidden className="text-muted">
										·
									</span>
									<span className="truncate font-mono text-xs text-muted">{example.fileName}</span>
								</span>
								<a
									href={exampleDownloadUrl(example)}
									download={example.fileName}
									aria-label={download}
									title={download}
									className={iconButton({ size: 'xs', className: 'shrink-0 text-muted hover:text-ink' })}
								>
									<Icon name="download" size={14} />
								</a>
							</div>
							<div className="flex flex-wrap items-center gap-3.5">
								<p className="min-w-0 grow basis-60 text-sm text-muted">{example.description}</p>
								<div className="flex flex-wrap gap-2">
									<Button variant="ghost" size="sm" onClick={() => loadExample(example)}>
										usar no editor
									</Button>
									<Button variant="ghost" size="sm" href={example.pdfUrl} external>
										ver PDF
									</Button>
								</div>
							</div>
						</li>
					)
				})}
			</ul>
		)

		// Com uma versão ativa, os modelos (para começar do zero) ficam recolhidos depois do editor
		if (active) {
			return (
				<Disclosure
					variant="card"
					summary={
						<span className="flex flex-col gap-1.5">
							<h2 className={SECTION_TITLE}>começar de um modelo</h2>
							<span className="text-sm text-muted">{intro}</span>
						</span>
					}
				>
					{list}
				</Disclosure>
			)
		}

		return (
			<section className={SECTION_CARD} aria-labelledby="cv-base-examples">
				<div className="flex flex-col gap-1.5">
					<h2 id="cv-base-examples" className={SECTION_TITLE}>
						modelos
					</h2>
					<p className="text-sm text-muted">{intro}</p>
				</div>
				{list}
			</section>
		)
	}

	function renderEditor() {
		return (
			<section className={SECTION_CARD} aria-labelledby="cv-base-new">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 id="cv-base-new" className={SECTION_TITLE}>
						nova versão
					</h2>
					<div className="flex flex-wrap gap-2">
						<Button variant="ghost" size="sm" onClick={() => setFormOpen(true)}>
							preencher com formulário
						</Button>
						<Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
							<Icon name="file" size={14} />
							carregar .tex
						</Button>
					</div>
					<input ref={fileInput} type="file" accept=".tex,text/x-tex,application/x-tex" hidden onChange={loadFile} />
				</div>

				{formDirty && (
					<p className="font-mono text-xs text-muted">
						formulário com alterações não validadas: {form.contact.name.trim() || 'sem nome'} · {form.sections.length}{' '}
						{form.sections.length === 1 ? 'seção' : 'seções'}
					</p>
				)}

				<div className="flex flex-col gap-1.5">
					<span className="flex items-center justify-between gap-3">
						<FieldLabel htmlFor="cv-base-tex">.tex do currículo</FieldLabel>
						<span className={cx('font-mono text-xs', tooBig ? 'text-danger' : 'text-muted')}>
							{formatKilobytes(size)} / {MAX_SIZE}
						</span>
					</span>
					<textarea
						id="cv-base-tex"
						ref={editor}
						value={text}
						rows={18}
						spellCheck={false}
						placeholder="Cole aqui o .tex do seu currículo, carregue o arquivo ou preencha com o formulário (sem precisar saber LaTeX)."
						aria-invalid={tooBig || undefined}
						aria-describedby={tooBig ? 'cv-base-tex-error' : 'cv-base-tex-help'}
						onChange={event => setText(event.target.value)}
						className={field({ invalid: tooBig, className: 'resize-y py-2.5 font-mono text-xs leading-relaxed' })}
					/>
					{tooBig ? (
						<FieldError id="cv-base-tex-error">O .tex passa do limite de {MAX_SIZE}.</FieldError>
					) : (
						<>
							<FieldHelp id="cv-base-tex-help">
								Precisa de pelo menos uma seção de experiência ou de formação; o cv-updater compila antes de você poder ativar.
							</FieldHelp>
							<Disclosure summary="ver o que o .tex precisa ter">
								<FieldHelp>
									Resumo, competências e projetos são opcionais. Os títulos aceitam sinônimos (Resumo, Sobre, Competências,
									Experiência...), em português ou em inglês, como nos modelos.
								</FieldHelp>
							</Disclosure>
						</>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-3">
					{/* Sem mudanças, o texto já está numa versão: validar de novo só repetiria ela no histórico */}
					<Button variant="lime" size="lg" disabled={submitting || tooBig || !text.trim() || !dirty} onClick={submit}>
						{submitting ? 'enviando…' : 'validar'}
					</Button>
					{text.trim() && (
						<span className="font-mono text-xs text-muted">
							{dirty ? 'alterações não validadas' : 'sem alterações para validar'}
						</span>
					)}
				</div>

				{candidate && renderCandidate(candidate)}
			</section>
		)
	}

	function renderHistory() {
		return (
			<section className={SECTION_CARD} aria-labelledby="cv-base-history">
				<h2 id="cv-base-history" className={SECTION_TITLE}>
					histórico
				</h2>
				<ul className="m-0 flex list-none flex-col gap-2.5 p-0">
					{versions.map(version => {
						const isActive = version.versionId === active?.versionId

						return (
							<li
								key={version.versionId}
								className={card({
									failed: version.status === 'invalid',
									size: 'sm',
									className: 'flex flex-wrap items-center gap-3.5',
								})}
							>
								<div className="flex min-w-0 grow basis-60 flex-col gap-0.5">
									<span className="flex flex-wrap items-center gap-2">
										<span className="truncate font-semibold">{formatDateTime(version.createdAt)}</span>
										{isActive && (
											<Badge tone="lime" size="sm">
												ativa
											</Badge>
										)}
										{version.status === 'validating' && (
											<Badge tone="running" size="sm">
												validando
											</Badge>
										)}
										{version.status === 'invalid' && (
											<Badge tone="danger" size="sm">
												recusada
											</Badge>
										)}
									</span>
									<span className="truncate font-mono text-xs text-muted">
										{[origin(version), pagesLabel(version.pages), formatKilobytes(version.size)].filter(Boolean).join(' · ')}
									</span>
									{version.status === 'invalid' && (
										<span className="line-clamp-2 text-sm break-words text-danger">{version.errors[0]}</span>
									)}
								</div>
								<div className="flex flex-wrap gap-2">
									<Button variant="ghost" size="sm" onClick={() => edit(version)}>
										{editLabel(version)}
									</Button>
									{version.status === 'valid' && (
										<Button variant="ghost" size="sm" href={cvBasePdfUrl(version.versionId)} external>
											PDF
										</Button>
									)}
									{version.status === 'valid' && !isActive && activateButton(version, 'sm', 'ghost')}
								</div>
							</li>
						)
					})}
				</ul>
				<FieldHelp>Versões que nunca foram ativadas saem do histórico depois de 7 dias.</FieldHelp>
			</section>
		)
	}

	return (
		<Page width="medium">
			<ButtonLink variant="ghost" size="sm" className="self-start" to="/curriculos">
				<Icon name="back" size={14} />
				meus currículos
			</ButtonLink>
			<Hero
				title={
					<>
						currículo <Hero.Mono>base.</Hero.Mono>
					</>
				}
				lead="O .tex de onde saem todos os currículos, no site e no Discord. Monte pelo formulário ou envie o seu; cada versão nova é compilada antes de poder ser ativada."
			/>

			{blocker.status === 'blocked' && (
				<ConfirmDialog
					title="Sair sem validar?"
					description="O texto do editor ainda não foi enviado e vai se perder."
					confirmLabel="sair sem validar"
					cancelLabel="continuar editando"
					onConfirm={blocker.proceed}
					onCancel={blocker.reset}
				/>
			)}
			{replaceWith && (
				<ConfirmDialog
					title={replacesForm ? 'Trocar o formulário?' : 'Trocar o texto do editor?'}
					description={
						replacesForm
							? 'O formulário tem alterações que ainda não foram validadas e vai ser trocado pelo da versão escolhida.'
							: `O texto do editor ainda não foi enviado e vai ser trocado pelo ${'version' in replaceWith ? 'da versão escolhida' : 'do modelo'}.`
					}
					confirmLabel={replacesForm ? 'trocar o formulário' : 'trocar o texto'}
					cancelLabel="continuar editando"
					onConfirm={() => ('version' in replaceWith ? edit(replaceWith.version, true) : loadExample(replaceWith.example, true))}
					onCancel={() => setReplaceWith(null)}
				/>
			)}

			{formOpen && (
				<CvBaseFormDialog
					form={form}
					serverProblems={serverProblems}
					submitting={submitting}
					onChange={setForm}
					onSubmit={submitForm}
					onClose={() => setFormOpen(false)}
				/>
			)}

			{renderActive()}
			{!active && renderExamples()}
			{renderEditor()}
			{active && renderExamples()}
			{versions.length > 0 && renderHistory()}
		</Page>
	)
}
