import type { WebJob } from '../../api-types'
import { contractTypesLabel } from '../lib/format'
import { Badge } from './ui/Badge'

/** Selo do regime de contratação ("CLT ou PJ"); some quando o post não diz, para não poluir o card. */
export function ContractTypeBadge({ job }: { job: Pick<WebJob, 'contractTypes'> }) {
	const label = contractTypesLabel(job)

	// Sem cor própria: a cor fica para a modalidade, que diferencia as vagas de relance
	return label ? <Badge bordered>{label}</Badge> : null
}
