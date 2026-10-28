import type { WebJob } from '../../api-types'
import { workModeOf } from '../lib/format'
import { Badge } from './ui/Badge'
import { StatusDot } from './ui/StatusDot'

/**
 * Selo da modalidade: a cor fica no ponto e na borda, o texto mantém o contraste do tema. Sem modalidade, só o texto
 * apagado: o dado que falta não disputa atenção com os que vieram (o ⚠ dos checks já avisa).
 */
export function WorkModeBadge({ job }: { job: Pick<WebJob, 'workMode'> }) {
	const mode = workModeOf(job)

	if (!job.workMode) {
		return (
			<Badge tone="plain" className="text-muted">
				{mode.label}
			</Badge>
		)
	}

	return (
		<Badge tone="plain" bordered style={{ borderColor: mode.color }}>
			<StatusDot style={{ background: mode.color }} />
			{mode.label}
		</Badge>
	)
}
