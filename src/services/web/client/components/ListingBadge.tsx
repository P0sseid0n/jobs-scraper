import type { WebJob } from '../../api-types'
import { useT } from '../stores/locale'
import { Badge } from './ui/Badge'

/** Selo das vagas de um post com várias: os dados vêm da página aberta pelo link dela, ou da linha dela no post. */
export function ListingBadge({ job }: { job: Pick<WebJob, 'sourcePostId'> }) {
	const t = useT()
	if (!job.sourcePostId) return null

	return (
		<Badge tone="plain" bordered className="text-muted" title={t.jobCard.listingTitle}>
			{t.jobCard.listing}
		</Badge>
	)
}
