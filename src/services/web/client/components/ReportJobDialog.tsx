import { useEffect, useRef, useState } from 'react'

import type { WebJob } from '../../api-types'
import { cx } from '../lib/cx'
import { notify } from '../stores/toast'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
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
} as const

export type ReportableField = keyof typeof REPORTABLE_FIELDS

/** O que o usuário apontou: campos errados ou que o post nem é vaga (as duas coisas nunca juntas). */
export type JobReport = { kind: 'fields'; fields: ReportableField[] } | { kind: 'not-a-job' }

/** Liga ou desliga um campo; escolher um campo desfaz o "não é vaga". */
export function toggleReportField(report: JobReport | null, field: ReportableField): JobReport | null {
	const fields = report?.kind === 'fields' ? report.fields : []
	const next = fields.includes(field) ? fields.filter(item => item !== field) : [...fields, field]
	return next.length ? { kind: 'fields', fields: next } : null
}

/** Modal para dizer o que saiu errado na vaga (`<dialog>` nativo: foco preso, Esc fecha). */
export function ReportJobDialog({ job, onClose }: { job: WebJob; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null)
	const [report, setReport] = useState<JobReport | null>(null)

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	function submit() {
		// O envio (PATCH /api/jobs/:postId) entra com a correção dos campos; por ora a modal só reúne as opções
		notify('A correção pelo site ainda não está disponível')
		ref.current?.close()
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, o Esc já fecha o <dialog>
		<dialog
			ref={ref}
			className="w-120 rounded-lg border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-backdrop"
			aria-labelledby="report-title"
			onClose={onClose}
			// Clique no fundo escurecido (fora do conteúdo) fecha
			onClick={event => event.target === ref.current && ref.current.close()}
		>
			<div className="flex flex-col gap-2.5 px-5 pt-4 pb-5">
				<div className="flex items-center justify-between gap-3">
					<h2 className="m-0 text-lg" id="report-title">
						O que saiu errado?
					</h2>
					<IconButton label="Fechar" onClick={() => ref.current?.close()}>
						<Icon name="close" />
					</IconButton>
				</div>
				<p className="text-muted text-sm block truncate">{job.title}</p>

				<fieldset className={FIELDSET}>
					<legend className={cx(LABEL, 'mb-2.5')}>dados errados_</legend>
					<PillGroup>
						{(Object.keys(REPORTABLE_FIELDS) as ReportableField[]).map(field => (
							<Pill
								key={field}
								pressed={report?.kind === 'fields' && report.fields.includes(field)}
								onClick={() => setReport(toggleReportField(report, field))}
							>
								{REPORTABLE_FIELDS[field]}
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

				<div className="flex justify-end gap-2 pt-2">
					<Button variant="ghost" onClick={() => ref.current?.close()}>
						cancelar
					</Button>
					<Button variant="lime" disabled={!report} onClick={submit}>
						continuar
					</Button>
				</div>
			</div>
		</dialog>
	)
}
