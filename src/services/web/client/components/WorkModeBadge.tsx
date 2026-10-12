import type { CSSProperties } from 'react'

import type { WebJob } from '../../api-types'
import { workModeOf } from '../lib/format'

/** Selo da modalidade: a cor fica no ponto e na borda, o texto mantém o contraste do tema. */
export function WorkModeBadge({ job }: { job: Pick<WebJob, 'workMode'> }) {
	const mode = workModeOf(job)

	return (
		<span className="mode-badge mono" style={{ '--mode': mode.color } as CSSProperties}>
			<span className="dot" />
			{mode.label}
		</span>
	)
}
