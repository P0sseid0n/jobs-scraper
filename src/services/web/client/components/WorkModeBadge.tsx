import { defineComponent, type PropType } from 'vue'

import type { WebJob } from '../../api-types'
import { workModeOf } from '../lib/format'

/** Selo da modalidade: a cor fica no ponto e na borda, o texto mantém o contraste do tema. */
export const WorkModeBadge = defineComponent({
	name: 'WorkModeBadge',
	props: { job: { type: Object as PropType<Pick<WebJob, 'workMode'>>, required: true } },
	setup(props) {
		return () => {
			const mode = workModeOf(props.job)

			return (
				<span class="mode-badge mono" style={{ '--mode': mode.color }}>
					<span class="dot" />
					{mode.label}
				</span>
			)
		}
	},
})
