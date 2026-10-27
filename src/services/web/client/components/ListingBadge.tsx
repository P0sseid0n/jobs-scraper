import type { WebJob } from '../../api-types'
import { Badge } from './ui/Badge'

/** Selo das vagas de um post com várias: os dados vêm da página aberta pelo link dela, ou da linha dela no post. */
export function ListingBadge({ job }: { job: Pick<WebJob, 'sourcePostId'> }) {
	if (!job.sourcePostId) return null

	return (
		<Badge
			tone="plain"
			bordered
			className="text-muted"
			title="Veio de um post com várias vagas: os dados são da página aberta pelo link dela ou, sem link próprio, da linha dela no post"
		>
			de uma lista
		</Badge>
	)
}
