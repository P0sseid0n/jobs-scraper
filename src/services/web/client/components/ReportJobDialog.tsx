import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import type { CorrectableField } from '@shared/contracts'

import type { WebJob } from '../../api-types'
import { api, RequestError } from '../api'
import { cx } from '../lib/cx'
import { CONTRACT_TYPES, WORK_MODES } from '../lib/format'
import { correctionBody, draftFromJob, type CorrectionDraft } from '../lib/job-correction'
import { notify } from '../stores/toast'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { DIALOG } from './ui/Dialog'
import { FieldError, FieldLabel } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { Input, Select } from './ui/Input'
import { KeywordInput } from './ui/KeywordInput'
import { Pill, PillGroup } from './ui/Pill'
import { FIELDSET, LABEL } from './ui/text'

/** Campos da vaga que podem ter vindo errados da extração da IA. */
export const REPORTABLE_FIELDS = {
	title: 'cargo',
	company: 'empresa',
	location: 'local',
	workMode: 'modalidade',
	contractTypes: 'regime',
	necessaryKnowledge: 'tecnologias',
	recruiterEmail: 'e-mail',
	applyLink: 'link de candidatura',
} as const satisfies Record<CorrectableField, string>

export type ReportableField = keyof typeof REPORTABLE_FIELDS

/** O que o usuário apontou: campos errados ou que o post nem é vaga (as duas coisas nunca juntas). */
export type JobReport = { kind: 'fields'; fields: ReportableField[] } | { kind: 'not-a-job' }

/** Liga ou desliga um campo; escolher um campo desfaz o "não é vaga". */
export function toggleReportField(report: JobReport | null, field: ReportableField): JobReport | null {
	const fields = report?.kind === 'fields' ? report.fields : []
	const next = fields.includes(field) ? fields.filter(item => item !== field) : [...fields, field]
	return next.length ? { kind: 'fields', fields: next } : null
}

const DIALOG_ACTIONS = 'flex justify-end gap-2 pt-2'

const CONTRACT_OPTIONS = (Object.keys(CONTRACT_TYPES) as (keyof typeof CONTRACT_TYPES)[]).filter(type => type !== 'none')
const WORK_MODE_OPTIONS = (Object.keys(WORK_MODES) as (keyof typeof WORK_MODES)[]).filter(mode => mode !== 'none')
const MAX_SKILLS = 30

/**
 * Modal para dizer o que saiu errado na vaga (`<dialog>` nativo: foco preso, Esc fecha). Primeiro escolhe os campos
 * errados (ou "não é vaga"); depois corrige os campos escolhidos. A correção vai para a vaga e para o feedback que
 * avalia o prompt da IA.
 */
export function ReportJobDialog({
	job,
	onClose,
	onCorrected,
	onRemoved,
}: {
	job: WebJob
	onClose: () => void
	/** A vaga com os campos corrigidos, como o servidor salvou. */
	onCorrected: (job: WebJob) => void
	/** A vaga foi marcada como "não é vaga" e saiu da lista. */
	onRemoved: () => void
}) {
	const ref = useRef<HTMLDialogElement>(null)
	const [report, setReport] = useState<JobReport | null>(null)
	const [step, setStep] = useState<'choose' | 'edit'>('choose')
	const [draft, setDraft] = useState<CorrectionDraft>(() => draftFromJob(job))
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	const close = () => ref.current?.close()

	async function save(event?: FormEvent) {
		event?.preventDefault()
		if (!report || saving) return

		setSaving(true)
		setErrors({})
		try {
			if (report.kind === 'not-a-job') {
				await api.correctJob(job.postId, { notAJob: true })
				notify('Vaga tirada da lista. Obrigado: a correção ajuda a avaliar a IA.')
				onRemoved()
			} else {
				onCorrected(await api.correctJob(job.postId, correctionBody(draft, report.fields)))
				notify('Vaga corrigida')
			}
			close()
		} catch (error) {
			const fields = error instanceof RequestError ? error.fields : {}
			setErrors(fields)
			// Erros de campo já aparecem no formulário
			if (Object.keys(fields).length === 0) notify(`Não consegui salvar: ${(error as Error).message}`, 'error')
		} finally {
			setSaving(false)
		}
	}

	function next() {
		if (report?.kind === 'fields') setStep('edit')
		else void save()
	}

	const edit = (patch: Partial<CorrectionDraft>) => setDraft(current => ({ ...current, ...patch }))

	/** Um campo do formulário com o rótulo e o erro do servidor; `group` (opções em pills) vira um `<fieldset>`. */
	function field(
		name: ReportableField,
		input: (props: { id: string; invalid: boolean; describedBy?: string }) => ReactNode,
		group = false,
	) {
		const id = `correct-${name}`
		const error = errors[name] ?? Object.entries(errors).find(([path]) => path.startsWith(`${name}.`))?.[1]
		const content = (
			<>
				{input({ id, invalid: !!error, describedBy: error ? `${id}-error` : undefined })}
				{error && <FieldError id={`${id}-error`}>{error}</FieldError>}
			</>
		)

		return group ? (
			<fieldset className="flex flex-col gap-1.5" key={name}>
				<legend className="mb-1.5 p-0 text-sm font-medium">{REPORTABLE_FIELDS[name]}</legend>
				{content}
			</fieldset>
		) : (
			<div className="flex flex-col gap-1.5" key={name}>
				<FieldLabel htmlFor={id}>{REPORTABLE_FIELDS[name]}</FieldLabel>
				{content}
			</div>
		)
	}

	const textInput = (name: 'title' | 'company' | 'location' | 'recruiterEmail' | 'applyLink', type = 'text') =>
		field(name, ({ id, invalid, describedBy }) => (
			<Input
				id={id}
				type={type}
				invalid={invalid}
				value={draft[name]}
				placeholder={name === 'title' ? undefined : 'vazio = não informado'}
				maxLength={name === 'applyLink' ? 2000 : 200}
				aria-describedby={describedBy}
				onChange={event => edit({ [name]: event.target.value })}
			/>
		))

	const inputs: Record<ReportableField, () => ReactNode> = {
		title: () => textInput('title'),
		company: () => textInput('company'),
		location: () => textInput('location'),
		workMode: () =>
			field('workMode', ({ id, invalid, describedBy }) => (
				<Select
					id={id}
					invalid={invalid}
					value={draft.workMode ?? ''}
					aria-describedby={describedBy}
					onChange={event => edit({ workMode: (event.target.value || null) as CorrectionDraft['workMode'] })}
				>
					<option value="">não informada</option>
					{WORK_MODE_OPTIONS.map(mode => (
						<option key={mode} value={mode}>
							{WORK_MODES[mode].label}
						</option>
					))}
				</Select>
			)),
		contractTypes: () =>
			field(
				'contractTypes',
				({ id, describedBy }) => (
					<PillGroup id={id} aria-describedby={describedBy}>
						{CONTRACT_OPTIONS.map(type => (
							<Pill
								key={type}
								pressed={draft.contractTypes.includes(type)}
								onClick={() =>
									edit({
										contractTypes: draft.contractTypes.includes(type)
											? draft.contractTypes.filter(item => item !== type)
											: [...draft.contractTypes, type],
									})
								}
							>
								{CONTRACT_TYPES[type]}
							</Pill>
						))}
					</PillGroup>
				),
				true,
			),
		necessaryKnowledge: () =>
			field('necessaryKnowledge', ({ id, invalid, describedBy }) => (
				<KeywordInput
					id={id}
					value={draft.necessaryKnowledge}
					max={MAX_SKILLS}
					maxLength={60}
					keepCase
					invalid={invalid}
					describedBy={describedBy}
					onChange={necessaryKnowledge => edit({ necessaryKnowledge })}
				/>
			)),
		recruiterEmail: () => textInput('recruiterEmail', 'email'),
		applyLink: () => textInput('applyLink', 'url'),
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, o Esc já fecha o <dialog>
		<dialog
			ref={ref}
			className={DIALOG}
			aria-labelledby="report-title"
			onClose={onClose}
			// Clique no fundo escurecido (fora do conteúdo) fecha
			onClick={event => event.target === ref.current && ref.current.close()}
		>
			<div className="flex flex-col gap-2.5 px-5 pt-4 pb-5">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-lg font-bold" id="report-title">
						{step === 'edit' ? 'Corrigir a vaga' : 'O que saiu errado?'}
					</h2>
					<IconButton label="Fechar" onClick={close}>
						<Icon name="close" />
					</IconButton>
				</div>
				<p className="text-muted text-sm block truncate">{job.title}</p>

				{step === 'edit' && report?.kind === 'fields' ? (
					<form className="flex flex-col gap-2.5" onSubmit={save} noValidate>
						{(Object.keys(REPORTABLE_FIELDS) as ReportableField[])
							.filter(name => report.fields.includes(name))
							.map(name => inputs[name]())}
						{errors._ && <FieldError>{errors._}</FieldError>}
						<div className={DIALOG_ACTIONS}>
							<Button variant="ghost" onClick={() => setStep('choose')}>
								voltar
							</Button>
							<Button variant="lime" type="submit" disabled={saving}>
								{saving ? 'salvando…' : 'salvar correção'}
							</Button>
						</div>
					</form>
				) : (
					<>
						<fieldset className={FIELDSET}>
							<legend className={cx(LABEL, 'mb-2.5')}>dados errados_</legend>
							<PillGroup>
								{(Object.keys(REPORTABLE_FIELDS) as ReportableField[]).map(name => (
									<Pill
										key={name}
										pressed={report?.kind === 'fields' && report.fields.includes(name)}
										onClick={() => setReport(toggleReportField(report, name))}
									>
										{REPORTABLE_FIELDS[name]}
									</Pill>
								))}
							</PillGroup>
						</fieldset>

						<div className={cx('text-center', LABEL)}>ou</div>

						<Pill
							shape="row"
							pressed={report?.kind === 'not-a-job'}
							onClick={() => setReport(report?.kind === 'not-a-job' ? null : { kind: 'not-a-job' })}
						>
							<span className="grow">não é vaga</span>
							<span className="text-xs">sai da lista, sem apagar</span>
						</Pill>

						<div className={DIALOG_ACTIONS}>
							<Button variant="ghost" onClick={close}>
								cancelar
							</Button>
							<Button variant="lime" disabled={!report || saving} onClick={next}>
								{report?.kind === 'not-a-job' ? (saving ? 'salvando…' : 'tirar da lista') : 'continuar'}
							</Button>
						</div>
					</>
				)}
			</div>
		</dialog>
	)
}
