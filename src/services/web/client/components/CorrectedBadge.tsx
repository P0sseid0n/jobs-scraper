import type { WebJob } from '../../api-types'
import { timeAgo } from '../lib/format'

/** Selo das vagas corrigidas pelo site: os dados não são mais só os que a IA extraiu. */
export function CorrectedBadge({ job }: { job: Pick<WebJob, 'correctedAt'> }) {
	if (!job.correctedAt) return null

	return (
		<span className="corrected-badge mono" title={`corrigida ${timeAgo(job.correctedAt)}`}>
			corrigida
		</span>
	)
}
