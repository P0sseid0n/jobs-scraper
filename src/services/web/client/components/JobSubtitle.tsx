import type { ReactNode } from 'react'

import type { WebJob } from '../../api-types'
import { jobSubtitle } from '../lib/format'

/**
 * "Empresa · Local" da vaga (`jobSubtitle`). A empresa confidencial aparece em itálico: é um aviso do post, não o nome
 * da empresa. `companyAction` (no detalhe, o bloquear) vai colado no nome da empresa, como o copiar ao lado do que copia.
 */
export function JobSubtitle({
	job,
	companyAction,
}: {
	job: Pick<WebJob, 'company' | 'companyConfidential' | 'location' | 'author'>
	companyAction?: ReactNode
}) {
	const { confidential, text } = jobSubtitle(job)

	if (companyAction && job.company) {
		// A última palavra não se separa do botão: numa quebra de linha, ele não fica sozinho no começo da outra
		const lastSpace = job.company.lastIndexOf(' ') + 1
		return (
			<>
				{job.company.slice(0, lastSpace)}
				<span className="whitespace-nowrap">
					{job.company.slice(lastSpace)}
					{companyAction}
				</span>
				{job.location && ` · ${job.location}`}
			</>
		)
	}

	return (
		<>
			{confidential && <span className="italic">Empresa confidencial</span>}
			{confidential && text && ' · '}
			{text}
		</>
	)
}
