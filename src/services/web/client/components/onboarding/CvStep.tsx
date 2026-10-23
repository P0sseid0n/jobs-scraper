import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { CV_BASE_TEX_MAX_BYTES } from '@shared/contracts'

import type { WebCvBaseVersion } from '../../../api-types'
import { api, cvBasePdfUrl, RequestError } from '../../api'
import { activeVersion, formatKilobytes, upsertVersion } from '../../lib/cv-base'
import { cleanForm, emptyForm, formProblems, sameForm } from '../../lib/cv-form'
import { onLive } from '../../stores/live'
import { notify } from '../../stores/toast'
import { CvBaseFormDialog } from '../CvBaseForm'
import { Icon } from '../Icon'
import { Button } from '../ui/Button'
import { card } from '../ui/Card'
import { FieldHelp } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { ChoiceCard, Rise, StepHeading, useStepBar, useSubSteps } from './parts'

// Sem o stream (conexão caiu), consulta as versões enquanto a nova é validada
const POLL_MS = 4_000

/** A prévia do PDF: dentro da página no computador; no celular, que não mostra PDF embutido, só o botão de abrir. */
function Preview({ version }: { version: WebCvBaseVersion }) {
	return (
		<div className="flex flex-col gap-3">
			<iframe
				title="Prévia do currículo"
				src={cvBasePdfUrl(version.versionId)}
				className="hidden aspect-3/4 max-h-150 w-full rounded-sm border border-line bg-white md:block"
			/>
			<Button variant="ghost" className="self-start md:hidden" href={cvBasePdfUrl(version.versionId)} external>
				abrir o PDF
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
	fromFile,
	onBack,
	onNext,
}: {
	eyebrow: string
	initialVersions: WebCvBaseVersion[]
	/** O cv-updater já tem o currículo pelo arquivo `CV_TEX_FILE`, sem versão ativada pelo site. */
	fromFile: boolean
	onBack: () => void
	onNext: () => void
}) {
	const [versions, setVersions] = useState(initialVersions)
	const [candidateId, setCandidateId] = useState<string | null>(null)
	const [form, setForm] = useState(emptyForm)
	const [formOpen, setFormOpen] = useState(false)
	const [serverProblems, setServerProblems] = useState<Record<string, string>>({})
	const [submitting, setSubmitting] = useState(false)
	const [activating, setActivating] = useState(false)
	const fileInput = useRef<HTMLInputElement>(null)

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
			setFormOpen(false)
		} catch (error) {
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

	async function loadFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return

		if (file.size > CV_BASE_TEX_MAX_BYTES) {
			notify(`O arquivo tem ${formatKilobytes(file.size)}; o limite é ${formatKilobytes(CV_BASE_TEX_MAX_BYTES)}.`, 'error')
			return
		}

		setSubmitting(true)
		try {
			const version = await api.createCvBaseVersion(await file.text(), file.name)
			setVersions(current => upsertVersion(current, version))
			setCandidateId(version.versionId)
		} catch (error) {
			notify(`Não consegui enviar o arquivo: ${(error as Error).message}`, 'error')
		} finally {
			setSubmitting(false)
		}
	}

	async function activate(version: WebCvBaseVersion) {
		setActivating(true)
		try {
			const updated = await api.activateCvBaseVersion(version.versionId)
			setVersions(current => upsertVersion(current, updated))
			setCandidateId(null)
			onNext()
		} catch (error) {
			notify(`Não consegui usar este currículo: ${(error as Error).message}`, 'error')
		} finally {
			setActivating(false)
		}
	}

	function renderCandidate(version: WebCvBaseVersion) {
		if (version.status === 'validating') {
			return (
				<div className={card({ size: 'lg', className: 'flex flex-col items-center gap-3 py-12 text-center' })} role="status">
					<Icon name="spinner" size={28} className="text-lime-text" />
					<p className="text-base font-semibold">Montando o PDF do seu currículo…</p>
					<FieldHelp className="max-w-100">
						Costuma levar alguns segundos. Na primeira vez pode passar de um minuto, porque o gerador baixa o que precisa.
					</FieldHelp>
				</div>
			)
		}

		if (version.status === 'invalid') {
			return (
				<Notice tone="danger" icon="alert" size="lg">
					<p className="font-semibold">Esse currículo não deu certo.</p>
					<ul className="m-0 mt-1.5 flex list-disc flex-col gap-1 pl-4.5 text-sm break-words">
						{version.errors.map(error => (
							<li key={error}>{error}</li>
						))}
					</ul>
					<p className="mt-2 text-sm">
						{version.fromForm ? 'Abra o formulário para corrigir.' : 'Corrija o arquivo e envie de novo.'}
					</p>
				</Notice>
			)
		}

		return (
			<div className="flex flex-col gap-4 animate-panel-in motion-reduce:animate-none">
				<p role="status" className="flex items-center gap-2 text-sm text-ok">
					<Icon name="check" />
					Ficou pronto! Dê uma olhada e, se estiver bom, use este currículo.
				</p>
				{version.pages !== null && version.pages > 1 && (
					<Notice tone="warn" icon="alert">
						<p className="text-sm">
							Ele tem {version.pages} páginas. Cada currículo ajustado precisa caber em uma, então alguns projetos podem sair.
						</p>
					</Notice>
				)}
				<Preview version={version} />
			</div>
		)
	}

	const choices = (
		<div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
			<ChoiceCard
				title="Preencher com a gente"
				description="Um formulário simples, em etapas: contato, experiências, formação. A gente monta o PDF."
				badge="mais fácil"
				onClick={openForm}
			/>
			<ChoiceCard
				title="Já tenho um arquivo .tex"
				description={`Envie o seu currículo em LaTeX (até ${formatKilobytes(CV_BASE_TEX_MAX_BYTES)}).`}
				onClick={() => fileInput.current?.click()}
			/>
		</div>
	)

	const editCandidate = () => (candidate?.fromForm ? openForm() : fileInput.current?.click())
	const reviewing = candidate?.status === 'valid' && candidate.versionId !== active?.versionId

	// Onde está o envio: escolher como, o PDF sendo gerado, conferir e usar. Com um currículo já salvo, tudo feito
	const stage = !candidate ? 0 : candidate.status === 'validating' ? 1 : 2
	useSubSteps({
		items: ['Escolher como', 'Gerar o PDF', 'Conferir e usar'].map((label, index) => ({
			label,
			done: index < stage || (ready && !candidate),
		})),
		current: ready && !candidate ? -1 : stage,
	})

	useStepBar({
		onBack,
		secondary:
			candidate?.status === 'invalid'
				? [{ label: candidate.fromForm ? 'corrigir no formulário' : 'enviar outro arquivo', onClick: editCandidate }]
				: reviewing
					? [{ label: 'mudar algo', onClick: editCandidate }]
					: [],
		primary: reviewing
			? {
					label: activating ? 'salvando…' : 'usar este currículo e continuar',
					disabled: activating,
					onClick: () => candidate && activate(candidate),
				}
			: { label: 'continuar', disabled: !ready || validating || submitting, onClick: onNext },
	})

	return (
		<div className="flex flex-col gap-9">
			<StepHeading
				eyebrow={eyebrow}
				title="Agora, o seu currículo"
				lead="É dele que saem os currículos ajustados para cada vaga. Pode preencher um formulário ou enviar o arquivo que você já tem."
			/>

			<input ref={fileInput} type="file" accept=".tex,text/x-tex,application/x-tex" hidden onChange={loadFile} />

			{candidate ? (
				<Rise order={3}>{renderCandidate(candidate)}</Rise>
			) : ready ? (
				<Rise order={3} className="flex flex-col gap-4">
					<p className="flex items-center gap-2 text-sm text-ok" role="status">
						<Icon name="check" />
						{active ? 'Você já tem um currículo salvo.' : 'Você já tem um currículo no arquivo data/cv/cv.tex.'}
					</p>
					{active && <Preview version={active} />}
					<p className="text-sm text-muted">Quer trocar? Escolha um jeito:</p>
					{choices}
				</Rise>
			) : (
				<Rise order={3}>{choices}</Rise>
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
		</div>
	)
}
