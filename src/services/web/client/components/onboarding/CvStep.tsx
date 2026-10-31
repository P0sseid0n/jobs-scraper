import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { CV_BASE_TEX_MAX_BYTES, CV_IMPORT_PDF_MAX_BYTES, type CvLanguageMode } from '@shared/contracts'

import type { WebCvBaseVersion } from '../../../api-types'
import { api, cvBasePdfUrl, RequestError } from '../../api'
import { activeVersion, formatKilobytes, upsertVersion } from '../../lib/cv-base'
import { cleanForm, emptyForm, formProblems, sameForm } from '../../lib/cv-form'
import { leaveDuringImport, useCvImport } from '../../lib/use-cv-import'
import { onLive } from '../../stores/live'
import { useT } from '../../stores/locale'
import { notify } from '../../stores/toast'
import { CvBaseFormDialog } from '../CvBaseForm'
import { CvLanguageChoice } from '../CvLanguageChoice'
import { Icon } from '../Icon'
import { Button } from '../ui/Button'
import { card } from '../ui/Card'
import { ConfirmDialog } from '../ui/Dialog'
import { FieldHelp } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { StatusLine } from '../ui/StatusLine'
import { ChoiceCard, Rise, StepHeading, useStepBar, useSubSteps } from './parts'

// Sem o stream (conexão caiu), consulta as versões enquanto a nova é validada
const POLL_MS = 4_000

/** A prévia do PDF: dentro da página no computador; no celular, que não mostra PDF embutido, só o botão de abrir. */
function Preview({ version }: { version: WebCvBaseVersion }) {
	const t = useT()
	return (
		<div className="flex flex-col gap-3">
			<iframe
				title={t.cvStep.previewTitle}
				src={cvBasePdfUrl(version.versionId)}
				className="hidden aspect-3/4 max-h-150 w-full rounded-sm border border-line bg-white md:block"
			/>
			<Button variant="ghost" className="self-start md:hidden" href={cvBasePdfUrl(version.versionId)} external>
				{t.cvStep.openPdf}
			</Button>
		</div>
	)
}

/**
 * Passo 3: o currículo base, pelo formulário (o mesmo de Currículos › Currículo base) ou por um `.tex`. A versão nova é
 * validada pelo cv-updater, que gera a prévia; "usar este currículo e continuar" a ativa e já segue para o próximo passo.
 */
export function CvStep({
	eyebrow,
	initialVersions,
	initialCvLanguage,
	fromFile,
	onBack,
	onNext,
}: {
	eyebrow: string
	initialVersions: WebCvBaseVersion[]
	initialCvLanguage: CvLanguageMode
	/** O cv-updater já tem o currículo pelo arquivo `CV_TEX_FILE`, sem versão ativada pelo site. */
	fromFile: boolean
	onBack: () => void
	onNext: () => void
}) {
	const t = useT()
	const [versions, setVersions] = useState(initialVersions)
	const [candidateId, setCandidateId] = useState<string | null>(null)
	const [form, setForm] = useState(emptyForm)
	const [formOpen, setFormOpen] = useState(false)
	const [importedFrom, setImportedFrom] = useState<string | null>(null)
	const [serverProblems, setServerProblems] = useState<Record<string, string>>({})
	const [submitting, setSubmitting] = useState(false)
	const [activating, setActivating] = useState(false)
	const fileInput = useRef<HTMLInputElement>(null)
	const pdfInput = useRef<HTMLInputElement>(null)
	const cvImport = useCvImport((imported, fileName) => {
		setForm(imported)
		setImportedFrom(fileName)
		setServerProblems({})
		setFormOpen(true)
	})

	// O "voltar" e as etapas também mudam a rota (`?step=`): o bloqueio cobre todas as saídas durante a leitura
	const blocker = useBlocker({
		shouldBlockFn: () => cvImport.importing,
		enableBeforeUnload: () => cvImport.importing,
		withResolver: true,
	})

	const active = activeVersion(versions)
	const candidate = versions.find(version => version.versionId === candidateId) ?? null
	const ready = !!active || fromFile

	useEffect(() => {
		const stop = onLive('cvBase', version => setVersions(current => upsertVersion(current, version)))
		return () => void stop()
	}, [])

	const validating = candidate?.status === 'validating'
	useEffect(() => {
		if (!validating) return

		const timer = setInterval(async () => {
			try {
				const { versions: fresh } = await api.cvBase()
				setVersions(current => fresh.reduce(upsertVersion, current))
			} catch {
				// tenta de novo na próxima volta
			}
		}, POLL_MS)
		return () => clearInterval(timer)
	}, [validating])

	/** Abre o formulário; se o currículo ativo veio dele, começa com os dados dele. */
	async function openForm() {
		if (active?.fromForm && sameForm(form, emptyForm())) {
			try {
				const loaded = await api.cvBaseVersion(active.versionId)
				if (loaded.form) setForm(loaded.form)
			} catch {
				// abre vazio
			}
		}
		setFormOpen(true)
	}

	async function submitForm() {
		setServerProblems({})
		if (Object.keys(formProblems(form)).length) return

		setSubmitting(true)
		try {
			const version = await api.createCvBaseVersionFromForm(cleanForm(form))
			setVersions(current => upsertVersion(current, version))
			setCandidateId(version.versionId)
			setImportedFrom(null)
			setFormOpen(false)
		} catch (error) {
			if (error instanceof RequestError) {
				setServerProblems(
					Object.fromEntries(Object.entries(error.fields).map(([path, message]) => [path.replace(/^form./, ''), message])),
				)
			}
			notify(t.cvStep.formFailed((error as Error).message), 'error')
		} finally {
			setSubmitting(false)
		}
	}

	async function loadFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return

		if (file.size > CV_BASE_TEX_MAX_BYTES) {
			notify(t.cvStep.fileTooLarge(formatKilobytes(file.size), formatKilobytes(CV_BASE_TEX_MAX_BYTES)), 'error')
			return
		}

		setSubmitting(true)
		try {
			const version = await api.createCvBaseVersion(await file.text(), file.name)
			setVersions(current => upsertVersion(current, version))
			setCandidateId(version.versionId)
		} catch (error) {
			notify(t.cvStep.fileFailed((error as Error).message), 'error')
		} finally {
			setSubmitting(false)
		}
	}

	function loadPdf(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (file) void cvImport.start(file)
	}

	async function activate(version: WebCvBaseVersion) {
		setActivating(true)
		try {
			const updated = await api.activateCvBaseVersion(version.versionId)
			setVersions(current => upsertVersion(current, updated))
			setCandidateId(null)
			onNext()
		} catch (error) {
			notify(t.cvStep.activateFailed((error as Error).message), 'error')
		} finally {
			setActivating(false)
		}
	}

	function renderCandidate(version: WebCvBaseVersion) {
		if (version.status === 'validating') {
			return (
				<div className={card({ size: 'lg', className: 'flex flex-col items-center gap-3 py-12 text-center' })} role="status">
					<Icon name="spinner" size={28} className="text-lime-text" />
					<p className="text-base font-semibold">{t.cvStep.building}</p>
					<FieldHelp className="max-w-100">{t.cvStep.buildingHelp}</FieldHelp>
				</div>
			)
		}

		if (version.status === 'invalid') {
			return (
				<Notice tone="danger" icon="alert" size="lg">
					<p className="font-semibold">{t.cvStep.invalid}</p>
					<ul className="m-0 mt-1.5 flex list-disc flex-col gap-1 pl-4.5 text-sm break-words">
						{version.errors.map(error => (
							<li key={error}>{error}</li>
						))}
					</ul>
					<p className="mt-2 text-sm">{version.fromForm ? t.cvStep.fixInForm : t.cvStep.fixFile}</p>
				</Notice>
			)
		}

		return (
			<div className="flex flex-col gap-4 animate-panel-in motion-reduce:animate-none">
				<StatusLine tone="ok" icon="check">
					{t.cvStep.ready}
				</StatusLine>
				{version.pages !== null && version.pages > 1 && (
					<Notice tone="warn" icon="alert">
						<p>{t.cvStep.pages(version.pages)}</p>
					</Notice>
				)}
				<Preview version={version} />
			</div>
		)
	}

	const choices = cvImport.importing ? (
		<div className={card({ size: 'lg', className: 'flex flex-col items-center gap-3 py-12 text-center' })} role="status">
			<Icon name="spinner" size={28} className="text-lime-text" />
			<p className="text-base font-semibold">{t.cvStep.reading}</p>
			<FieldHelp className="max-w-100">{t.cvStep.readingHelp}</FieldHelp>
		</div>
	) : (
		<div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
			<ChoiceCard title={t.cvStep.formTitle} description={t.cvStep.formDescription} badge={t.cvStep.easiest} onClick={openForm} />
			<ChoiceCard
				title={t.cvStep.pdfTitle}
				description={t.cvStep.pdfDescription(CV_IMPORT_PDF_MAX_BYTES / 1024 / 1024)}
				onClick={() => pdfInput.current?.click()}
			/>
			<ChoiceCard
				title={t.cvStep.texTitle}
				description={t.cvStep.texDescription(formatKilobytes(CV_BASE_TEX_MAX_BYTES))}
				onClick={() => fileInput.current?.click()}
			/>
		</div>
	)

	const editCandidate = () => (candidate?.fromForm ? openForm() : fileInput.current?.click())
	const reviewing = candidate?.status === 'valid' && candidate.versionId !== active?.versionId

	// Onde está o envio: escolher como, o PDF sendo gerado, conferir e usar. Com um currículo já salvo, tudo feito
	const stage = !candidate ? 0 : candidate.status === 'validating' ? 1 : 2
	useSubSteps({
		items: t.cvStep.subSteps.map((label, index) => ({
			label,
			done: index < stage || (ready && !candidate),
		})),
		current: ready && !candidate ? -1 : stage,
	})

	useStepBar({
		onBack,
		secondary:
			candidate?.status === 'invalid'
				? [{ label: candidate.fromForm ? t.cvStep.fixForm : t.cvStep.otherFile, onClick: editCandidate }]
				: reviewing
					? [{ label: t.cvStep.changeSomething, onClick: editCandidate }]
					: [],
		primary: reviewing
			? {
					label: activating ? t.actions.saving : t.cvStep.useAndContinue,
					disabled: activating,
					onClick: () => candidate && activate(candidate),
				}
			: { label: t.actions.continue, disabled: !ready || validating || submitting || cvImport.importing, onClick: onNext },
	})

	return (
		<div className="flex flex-col gap-9">
			<StepHeading eyebrow={eyebrow} title={t.cvStep.title} lead={t.cvStep.lead} />

			<input ref={fileInput} type="file" accept=".tex,text/x-tex,application/x-tex" hidden onChange={loadFile} />
			<input ref={pdfInput} type="file" accept=".pdf,application/pdf" hidden onChange={loadPdf} />

			{candidate ? (
				<Rise order={3}>{renderCandidate(candidate)}</Rise>
			) : ready ? (
				<Rise order={3} className="flex flex-col gap-4">
					<StatusLine tone="ok" icon="check">
						{active ? t.cvStep.alreadySaved : t.cvStep.alreadyInFile}
					</StatusLine>
					{active && <Preview version={active} />}
					<p className="text-sm text-muted">{t.cvStep.replace}</p>
					{choices}
				</Rise>
			) : (
				<Rise order={3}>{choices}</Rise>
			)}

			<Rise order={4}>
				<CvLanguageChoice initial={initialCvLanguage} />
			</Rise>

			{blocker.status === 'blocked' && (
				<ConfirmDialog {...leaveDuringImport()} onConfirm={blocker.proceed} onCancel={blocker.reset} />
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
		</div>
	)
}
