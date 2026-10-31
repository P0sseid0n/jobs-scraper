import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { CV_BASE_TEX_MAX_BYTES, type CvForm } from '@shared/contracts'
import { t } from '@shared/i18n'

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
import { SectionCard } from '../components/ui/SectionCard'
import { StatusLine } from '../components/ui/StatusLine'
import { LIST, META, SECTION_TITLE } from '../components/ui/text'
import { activeVersion, formatKilobytes, texBytes, upsertVersion } from '../lib/cv-base'
import { cvExamples, exampleDownloadUrl, type CvExample } from '../lib/cv-examples'
import { cleanForm, emptyForm, formProblems, sameForm } from '../lib/cv-form'
import { cx } from '../lib/cx'
import { formatDateTime } from '../lib/format'
import { leaveDuringImport, useCvImport } from '../lib/use-cv-import'
import { connected, onLive } from '../stores/live'
import { useT } from '../stores/locale'
import { notify } from '../stores/toast'

const MAX_SIZE = formatKilobytes(CV_BASE_TEX_MAX_BYTES)

/** `activeForm`: os dados do formulário da versão ativa, quando ela veio dele. */
export type CvBaseData = { versions: WebCvBaseVersion[]; activeTex: string; activeForm: CvForm | null }

/** O texto no editor e o arquivo de onde veio (o nome vai junto só se o texto não foi mexido depois). */
type Source = { text: string; fileName: string | null }

/** O que vai substituir o editor ou o formulário, à espera da confirmação: uma versão, um modelo ou um PDF importado. */
type Replacement = { version: WebCvBaseVersion } | { example: CvExample } | { pdf: true }

const origin = (version: WebCvBaseVersion) => (version.fromForm ? t().cvBase.form : (version.fileName ?? t().cvBase.editedOnSite))
/** Onde a versão abre para editar: no formulário, se veio dele; senão, o `.tex` no editor. */
const editLabel = (version: WebCvBaseVersion) => (version.fromForm ? t().cvBase.editInForm : t().cvBase.editTex)
const pagesLabel = (pages: number | null) => (pages === null ? null : t().cvBase.pages(pages))

/** A pré-visualização do PDF: embutida no computador; no celular, que não mostra PDF dentro da página, só o botão. */
function Preview({ version }: { version: WebCvBaseVersion }) {
	return (
		<iframe
			title={t().cvBase.previewOf(formatDateTime(version.createdAt))}
			src={cvBasePdfUrl(version.versionId)}
			className="hidden aspect-3/4 max-h-200 w-full rounded-sm border border-line bg-white md:block"
		/>
	)
}

function Errors({ version }: { version: WebCvBaseVersion }) {
	return (
		<Notice tone="danger" icon="alert">
			<p className="font-semibold">{t().cvBase.rejected}</p>
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
 * loader da rota (`routes/resumes_.base.tsx`); o resto chega pelo stream (`cvBase`).
 */
export function CvBaseView({ initial }: { initial: CvBaseData }) {
	const b = useT().cvBase
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
	/** O PDF de onde o formulário foi preenchido, enquanto ele não vira uma versão (a modal lembra de revisar). */
	const [importedFrom, setImportedFrom] = useState<string | null>(null)
	const [serverProblems, setServerProblems] = useState<Record<string, string>>({})
	const [candidateId, setCandidateId] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)
	const [activating, setActivating] = useState<string | null>(null)
	const [replaceWith, setReplaceWith] = useState<Replacement | null>(null)
	const fileInput = useRef<HTMLInputElement>(null)
	const pdfInput = useRef<HTMLInputElement>(null)
	const editor = useRef<HTMLTextAreaElement>(null)
	const cvImport = useCvImport((imported, fileName) => {
		setForm(imported)
		setImportedFrom(fileName)
		setServerProblems({})
		setCandidateId(null)
		setFormOpen(true)
	})

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
		shouldBlockFn: () => ((dirty || formDirty) && !submitting) || cvImport.importing,
		enableBeforeUnload: () => dirty || formDirty || cvImport.importing,
		withResolver: true,
	})

	async function loadFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return

		if (file.size > CV_BASE_TEX_MAX_BYTES) {
			notify(b.fileTooLarge(formatKilobytes(file.size), MAX_SIZE), 'error')
			return
		}

		const content = await file.text()
		setText(content)
		setSource({ text: content, fileName: file.name })
		editor.current?.focus()
	}

	/** Escolhe o PDF a importar; antes, pede confirmação se o formulário tem mudanças (ele vai ser trocado). */
	function importPdf(confirmed = false) {
		if (formDirty && !confirmed) {
			setReplaceWith({ pdf: true })
			return
		}
		setReplaceWith(null)
		pdfInput.current?.click()
	}

	/** Volta o formulário ao da versão (fechar a modal guarda o rascunho, inclusive o lido do PDF). */
	function discardForm() {
		setForm(savedForm)
		setImportedFrom(null)
		setServerProblems({})
	}

	function loadPdf(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (file) void cvImport.start(file)
	}

	async function submit() {
		setSubmitting(true)
		try {
			const version = await api.createCvBaseVersion(text, text === source.text ? source.fileName : null)
			setVersions(current => upsertVersion(current, version))
			setCandidateId(version.versionId)
			setSavedText(text)
		} catch (error) {
			notify(b.texFailed((error as Error).message), 'error')
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
			setImportedFrom(null)
			setFormOpen(false)
		} catch (error) {
			// Os erros de campo da API vêm como "form.contact.name"; o formulário usa o caminho sem o prefixo
			if (error instanceof RequestError) {
				setServerProblems(
					Object.fromEntries(Object.entries(error.fields).map(([path, message]) => [path.replace(/^form./, ''), message])),
				)
			}
			notify(b.formFailed((error as Error).message), 'error')
		} finally {
			setSubmitting(false)
		}
	}

	async function activate(version: WebCvBaseVersion) {
		setActivating(version.versionId)
		try {
			const updated = await api.activateCvBaseVersion(version.versionId)
			setVersions(current => upsertVersion(current, updated))
			notify(b.activated)
		} catch (error) {
			notify(b.activateFailed((error as Error).message), 'error')
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
				setImportedFrom(null)
				setFormOpen(true)
				return
			}

			setText(loaded.tex)
			setSource({ text: loaded.tex, fileName: version.fileName })
			setSavedText(loaded.tex)
			focusEditor()
		} catch (error) {
			notify(b.loadFailed((error as Error).message), 'error')
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

	const replacesForm = !!replaceWith && ('pdf' in replaceWith || ('version' in replaceWith && replaceWith.version.fromForm))

	/** `ghost` no histórico: lá ativar é raro (e sem conferir a prévia); o lime fica para a versão que acabou de validar. */
	const activateButton = (version: WebCvBaseVersion, size: 'sm' | 'md' = 'md', variant: 'lime' | 'ghost' = 'lime') => (
		<Button variant={variant} size={size} disabled={activating !== null} onClick={() => activate(version)}>
			{activating === version.versionId ? b.activating : b.activate}
		</Button>
	)

	function renderActive() {
		return (
			<SectionCard
				title={b.activeVersion}
				aside={
					active && (
						<div className="flex gap-2">
							<Button variant="ghost" size="sm" onClick={() => edit(active)}>
								{editLabel(active)}
							</Button>
							<Button variant="ghost" size="sm" href={cvBasePdfUrl(active.versionId)} external>
								{b.openPdf}
							</Button>
						</div>
					)
				}
			>
				{active ? (
					<>
						<p className={META}>
							{[
								b.activatedAt(formatDateTime(active.activatedAt!)),
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
						{b.noActiveBefore}
						<code className="font-mono">data/cv/cv.tex</code> (<code className="font-mono">CV_TEX_FILE</code>
						{b.noActiveAfter}
					</Notice>
				)}
			</SectionCard>
		)
	}

	function renderCandidate(version: WebCvBaseVersion) {
		if (version.status === 'validating') {
			return (
				<StatusLine tone="muted" icon="spinner">
					{b.validating}
				</StatusLine>
			)
		}
		if (version.status === 'invalid') return <Errors version={version} />

		// Depois de ativada, a prévia já aparece em "versão ativa": aqui fica só a confirmação
		if (version.versionId === active?.versionId) {
			return (
				<StatusLine tone="ok" icon="check">
					{b.isBase}
				</StatusLine>
			)
		}

		return (
			<div className="flex flex-col gap-3.5">
				<div className="flex flex-wrap items-center gap-3">
					<StatusLine tone="ok" icon="check" className="grow">
						{b.compiled(pagesLabel(version.pages))}
					</StatusLine>
					<Button variant="ghost" href={cvBasePdfUrl(version.versionId)} external>
						{b.openPdf}
					</Button>
					{activateButton(version)}
				</div>
				{version.pages !== null && version.pages > 1 && (
					<Notice tone="warn" icon="alert">
						{b.multiPage(version.pages)}
					</Notice>
				)}
				<Preview version={version} />
			</div>
		)
	}

	function renderExamples() {
		const intro = b.examplesIntro
		const list = (
			<ul className={cx(LIST, 'flex flex-col gap-2.5')}>
				{cvExamples().map(example => {
					const download = b.downloadExample(example.fileName)

					return (
						<li key={example.fileName} className={card({ size: 'sm', className: 'flex flex-col gap-1.5' })}>
							<div className="flex items-center justify-between gap-3">
								<span className="flex min-w-0 items-baseline gap-2">
									<span className="shrink-0 font-semibold">{example.title}</span>
									<span aria-hidden className="text-muted">
										·
									</span>
									<span className={cx(META, 'truncate')}>{example.fileName}</span>
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
										{b.useInEditor}
									</Button>
									<Button variant="ghost" size="sm" href={example.pdfUrl} external>
										{b.seePdf}
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
							<h2 className={SECTION_TITLE}>{b.startFromExample}</h2>
							<span className="text-sm text-muted">{intro}</span>
						</span>
					}
				>
					{list}
				</Disclosure>
			)
		}

		return (
			<SectionCard title={b.examples} description={intro}>
				{list}
			</SectionCard>
		)
	}

	function renderEditor() {
		return (
			<SectionCard
				title={b.newVersion}
				aside={
					<div className="flex flex-wrap gap-2">
						<Button variant="ghost" size="sm" onClick={() => setFormOpen(true)}>
							{b.fillForm}
						</Button>
						<Button variant="ghost" size="sm" disabled={cvImport.importing} onClick={() => importPdf()}>
							<Icon name={cvImport.importing ? 'spinner' : 'file'} size={14} />
							{cvImport.importing ? b.readingPdf : b.importPdf}
						</Button>
						<input ref={pdfInput} type="file" accept=".pdf,application/pdf" hidden onChange={loadPdf} />
						<Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
							<Icon name="file" size={14} />
							{b.loadTex}
						</Button>
						<input ref={fileInput} type="file" accept=".tex,text/x-tex,application/x-tex" hidden onChange={loadFile} />
					</div>
				}
			>
				{cvImport.importing && (
					<StatusLine tone="muted" icon="spinner">
						{b.readingPdfHelp}
					</StatusLine>
				)}
				{formDirty && (
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className={META}>{b.formDirty(form.contact.name.trim() || b.noName, form.sections.length)}</p>
						<Button variant="ghost" size="xs" onClick={discardForm}>
							{b.discard}
						</Button>
					</div>
				)}

				<div className="flex flex-col gap-1.5">
					<span className="flex items-center justify-between gap-3">
						<FieldLabel htmlFor="cv-base-tex">{b.tex}</FieldLabel>
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
						placeholder={b.texPlaceholder}
						aria-invalid={tooBig || undefined}
						aria-describedby={tooBig ? 'cv-base-tex-error' : 'cv-base-tex-help'}
						onChange={event => setText(event.target.value)}
						className={field({ invalid: tooBig, className: 'resize-y py-2.5 font-mono text-xs leading-relaxed' })}
					/>
					{tooBig ? (
						<FieldError id="cv-base-tex-error">{b.texTooLarge(MAX_SIZE)}</FieldError>
					) : (
						<>
							<FieldHelp id="cv-base-tex-help">{b.texHelp}</FieldHelp>
							<Disclosure summary={b.texNeeds}>
								<FieldHelp>{b.texNeedsHelp}</FieldHelp>
							</Disclosure>
						</>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-3">
					{/* Sem mudanças, o texto já está numa versão: validar de novo só repetiria ela no histórico */}
					<Button variant="lime" size="lg" disabled={submitting || tooBig || !text.trim() || !dirty} onClick={submit}>
						{submitting ? b.sending : b.validate}
					</Button>
					{text.trim() && <span className={META}>{dirty ? b.unvalidated : b.nothingToValidate}</span>}
				</div>

				{candidate && renderCandidate(candidate)}
			</SectionCard>
		)
	}

	function renderHistory() {
		return (
			<SectionCard title={b.history}>
				<ul className={cx(LIST, 'flex flex-col gap-2.5')}>
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
												{b.active}
											</Badge>
										)}
										{version.status === 'validating' && (
											<Badge tone="running" size="sm">
												{b.validatingBadge}
											</Badge>
										)}
										{version.status === 'invalid' && (
											<Badge tone="danger" size="sm">
												{b.rejectedBadge}
											</Badge>
										)}
									</span>
									<span className={cx(META, 'truncate')}>
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
				<FieldHelp>{b.historyHelp}</FieldHelp>
			</SectionCard>
		)
	}

	return (
		<Page width="medium">
			<ButtonLink variant="ghost" size="sm" className="self-start" to="/resumes">
				<Icon name="back" size={14} />
				{b.myCvs}
			</ButtonLink>
			<Hero
				title={
					<>
						{b.heroTitle} <Hero.Mono>{b.heroTitleMono}</Hero.Mono>
					</>
				}
				lead={b.heroLead}
			/>

			{blocker.status === 'blocked' && cvImport.importing && (
				<ConfirmDialog {...leaveDuringImport()} onConfirm={blocker.proceed} onCancel={blocker.reset} />
			)}
			{blocker.status === 'blocked' && !cvImport.importing && (
				<ConfirmDialog
					title={b.leaveTitle}
					description={dirty && formDirty ? b.leaveBoth : formDirty ? b.leaveForm : b.leaveText}
					confirmLabel={b.leave}
					cancelLabel={b.keepEditing}
					onConfirm={blocker.proceed}
					onCancel={blocker.reset}
				/>
			)}
			{replaceWith && (
				<ConfirmDialog
					title={replacesForm ? b.replaceFormTitle : b.replaceTextTitle}
					description={
						replacesForm
							? 'pdf' in replaceWith
								? b.replaceFormByPdf
								: b.replaceFormByVersion
							: 'version' in replaceWith
								? b.replaceTextByVersion
								: b.replaceTextByExample
					}
					confirmLabel={'pdf' in replaceWith ? b.choosePdf : replacesForm ? b.replaceForm : b.replaceText}
					cancelLabel={b.keepEditing}
					onConfirm={() =>
						'pdf' in replaceWith
							? importPdf(true)
							: 'version' in replaceWith
								? edit(replaceWith.version, true)
								: loadExample(replaceWith.example, true)
					}
					onCancel={() => setReplaceWith(null)}
				/>
			)}

			{formOpen && (
				<CvBaseFormDialog
					form={form}
					serverProblems={serverProblems}
					submitting={submitting}
					importedFrom={importedFrom}
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
