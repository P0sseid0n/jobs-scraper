import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { CV_BASE_TEX_MAX_BYTES } from '@shared/contracts'

import type { WebCvBaseVersion } from '../../api-types'
import { api, cvBasePdfUrl } from '../api'
import { Icon } from '../components/Icon'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FieldError, FieldHelp, FieldLabel } from '../components/ui/Field'
import { iconButton } from '../components/ui/IconButton'
import { field } from '../components/ui/Input'
import { Notice } from '../components/ui/Notice'
import { Hero, Page } from '../components/ui/Page'
import { LABEL, SECTION_TITLE } from '../components/ui/text'
import { activeVersion, formatKilobytes, texBytes, upsertVersion } from '../lib/cv-base'
import { CV_EXAMPLES, exampleDownloadUrl, type CvExample } from '../lib/cv-examples'
import { cx } from '../lib/cx'
import { formatDateTime } from '../lib/format'
import { connected, onLive } from '../stores/live'
import { notify } from '../stores/toast'

const SECTION_CARD = card({ size: 'lg', className: 'flex flex-col gap-5' })
const MAX_SIZE = formatKilobytes(CV_BASE_TEX_MAX_BYTES)

export type CvBaseData = { versions: WebCvBaseVersion[]; activeTex: string }

/** O texto no editor e o arquivo de onde veio (o nome vai junto só se o texto não foi mexido depois). */
type Source = { text: string; fileName: string | null }

/** O que vai substituir o texto do editor, à espera da confirmação: o `.tex` de uma versão ou um modelo. */
type Replacement = { version: WebCvBaseVersion } | { example: CvExample }

const origin = (version: WebCvBaseVersion) => version.fileName ?? 'editado no site'
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
 * "Currículo base": o `.tex` de onde saem os currículos ajustados. Uma versão nova (enviada ou editada aqui) é validada
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
		shouldBlockFn: () => dirty && !submitting,
		enableBeforeUnload: () => dirty,
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

	/** Carrega o `.tex` de uma versão no editor (pede confirmação antes se o editor tem mudanças). */
	async function edit(version: WebCvBaseVersion, confirmed = false) {
		if (dirty && !confirmed) {
			setReplaceWith({ version })
			return
		}
		setReplaceWith(null)

		try {
			const { tex } = await api.cvBaseVersion(version.versionId)
			setText(tex)
			setSource({ text: tex, fileName: version.fileName })
			setSavedText(tex)
			setCandidateId(null)
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

	const activateButton = (version: WebCvBaseVersion, size: 'sm' | 'md' = 'md') => (
		<Button variant="lime" size={size} disabled={activating !== null} onClick={() => activate(version)}>
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
								editar
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
						<code className="font-mono">CV_TEX_FILE</code>). Envie o seu .tex abaixo para trocar o currículo pelo site.
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
		return (
			<section className={SECTION_CARD} aria-labelledby="cv-base-examples">
				<div className="flex flex-col gap-1.5">
					<h2 id="cv-base-examples" className={SECTION_TITLE}>
						modelos
					</h2>
					<p className="text-sm text-muted">Comece por um modelo: troque os dados pelos seus e valide.</p>
				</div>
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
										<Button variant="lime" size="sm" onClick={() => loadExample(example)}>
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
					<Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
						<Icon name="file" size={14} />
						carregar .tex
					</Button>
					<input ref={fileInput} type="file" accept=".tex,text/x-tex,application/x-tex" hidden onChange={loadFile} />
				</div>

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
						placeholder="Cole aqui o .tex do seu currículo ou carregue o arquivo."
						aria-invalid={tooBig || undefined}
						aria-describedby={tooBig ? 'cv-base-tex-error' : 'cv-base-tex-help'}
						onChange={event => setText(event.target.value)}
						className={field({ invalid: tooBig, className: 'resize-y py-2.5 font-mono text-xs leading-relaxed' })}
					/>
					{tooBig ? (
						<FieldError id="cv-base-tex-error">O .tex passa do limite de {MAX_SIZE}.</FieldError>
					) : (
						<FieldHelp id="cv-base-tex-help">
							Precisa de pelo menos uma seção de experiência ou de formação, como nos modelos. Resumo, competências e projetos
							são opcionais. Os títulos aceitam sinônimos (Resumo, Sobre, Competências, Experiência...), em português ou em
							inglês. O cv-updater compila antes de você poder ativar.
						</FieldHelp>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<Button variant="lime" size="lg" disabled={submitting || tooBig || !text.trim()} onClick={submit}>
						{submitting ? 'enviando…' : 'validar'}
					</Button>
					{dirty && <span className="font-mono text-xs text-muted">alterações não validadas</span>}
				</div>

				{candidate && renderCandidate(candidate)}
			</section>
		)
	}

	function renderHistory() {
		return (
			<section className="flex flex-col gap-2.5" aria-labelledby="cv-base-history">
				<h2 id="cv-base-history" className={LABEL}>
					histórico_
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
										editar
									</Button>
									{version.status === 'valid' && (
										<Button variant="ghost" size="sm" href={cvBasePdfUrl(version.versionId)} external>
											PDF
										</Button>
									)}
									{version.status === 'valid' && !isActive && activateButton(version, 'sm')}
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
				lead="O .tex de onde saem todos os currículos, no site e no Discord. Cada versão nova é compilada antes de poder ser ativada."
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
					title="Trocar o texto do editor?"
					description={`O texto do editor ainda não foi enviado e vai ser trocado pelo ${'version' in replaceWith ? 'da versão escolhida' : 'do modelo'}.`}
					confirmLabel="trocar o texto"
					cancelLabel="continuar editando"
					onConfirm={() => ('version' in replaceWith ? edit(replaceWith.version, true) : loadExample(replaceWith.example, true))}
					onCancel={() => setReplaceWith(null)}
				/>
			)}

			{renderActive()}
			{renderExamples()}
			{renderEditor()}
			{versions.length > 0 && renderHistory()}
		</Page>
	)
}
