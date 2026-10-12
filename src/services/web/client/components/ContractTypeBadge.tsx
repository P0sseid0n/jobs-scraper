import type { WebJob } from '../../api-types'
import { contractTypesLabel } from '../lib/format'

/** Selo do regime de contratação ("CLT ou PJ"); some quando o post não diz, para não poluir o card. */
export function ContractTypeBadge({ job }: { job: Pick<WebJob, 'contractTypes'> }) {
	const label = contractTypesLabel(job)

	return label ? <span className="contract-badge mono">{label}</span> : null
}
