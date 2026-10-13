import type { WebJob } from '../../api-types'
import { workModeOf } from '../lib/format'
import { Badge } from './ui/Badge'
import { StatusDot } from './ui/StatusDot'

/** Selo da modalidade: a cor fica no ponto e na borda, o texto mantém o contraste do tema. */
export function WorkModeBadge({ job }: { job: Pick<WebJob, 'workMode'> }) {
	const mode = workModeOf(job)

	return (
		<Badge tone="plain" bordered style={{ borderColor: mode.color }}>
			<StatusDot style={{ background: mode.color }} />
			{mode.label}
		</Badge>
	)
}
