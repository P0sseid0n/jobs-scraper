import { defineComponent, ref, watch } from 'vue'

import type { WebJob } from '../../api-types'
import { api } from '../api'
import { Icon } from '../components/Icon'
import { JobDetail } from '../components/JobDetail'
import { goBack, onLinkClick } from '../router'
import { jobs } from '../stores/jobs'
import { markSeen } from '../stores/seen'

/** Página da vaga: o detalhe no celular, e o destino de links diretos (ex.: o indicador de currículos). */
export const JobPage = defineComponent({
	name: 'JobPage',
	props: { postId: { type: String, required: true } },
	setup(props) {
		const job = ref<WebJob | null>(null)
		const error = ref<string | null>(null)

		watch(
			() => props.postId,
			async postId => {
				markSeen(postId)
				error.value = null
				job.value = jobs.value.find(item => item.postId === postId) ?? null
				if (job.value) return

				try {
					job.value = await api.job(postId)
				} catch (cause) {
					error.value = (cause as Error).message
				}
			},
			{ immediate: true },
		)

		return () => (
			<div class="page page-narrow">
				<a
					class="back-link"
					href="/"
					onClick={(event: MouseEvent) => {
						event.preventDefault()
						goBack('/')
					}}
				>
					<Icon name="back" />
					vagas
				</a>
				{error.value && (
					<div class="card empty" role="alert">
						<p class="strong">{error.value}</p>
						<a class="btn btn-lime" href="/" onClick={onLinkClick}>
							ver todas as vagas
						</a>
					</div>
				)}
				{!error.value && !job.value && <div class="card skeleton detail-skeleton" aria-busy="true" />}
				{job.value && (
					<article class="card detail-page">
						<JobDetail job={job.value} />
					</article>
				)}
			</div>
		)
	},
})
