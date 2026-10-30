import type { WebJob } from '../../api-types'
import { jobSubtitle } from '../lib/format'

/**
 * "Empresa · Local" da vaga (`jobSubtitle`). A empresa confidencial aparece em itálico: é um aviso do post, não o nome
 * da empresa.
 */
export function JobSubtitle({ job }: { job: Pick<WebJob, 'company' | 'companyConfidential' | 'location' | 'author'> }) {
	const { confidential, text } = jobSubtitle(job)

	return (
		<>
			{confidential && <span className="italic">Empresa confidencial</span>}
			{confidential && text && ' · '}
			{text}
		</>
	)
}
