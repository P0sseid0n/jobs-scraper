import type { WebJob } from '../../api-types'
import { timeAgo } from '../lib/format'
import { useT } from '../stores/locale'
import { Badge } from './ui/Badge'

/** Selo das vagas corrigidas pelo site: os dados não são mais só os que a IA extraiu. */
export function CorrectedBadge({ job }: { job: Pick<WebJob, 'correctedAt'> }) {
	const t = useT()
	if (!job.correctedAt) return null

	return (
		<Badge
			tone="plain"
			bordered="dashed"
			className="border-lime-text text-lime-text"
			title={t.jobCard.correctedAgo(timeAgo(job.correctedAt))}
		>
			{t.jobCard.corrected}
		</Badge>
	)
}
