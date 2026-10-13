import { useEffect, useState } from 'react'

import type { WebJob } from '../../api-types'
import { isJobRouteId } from '../../job-route-id'
import { api } from '../api'
import { Icon } from '../components/Icon'
import { JobDetail } from '../components/JobDetail'
import { Button } from '../components/ui/Button'
import { goBack, onLinkClick } from '../router'
import { jobsStore } from '../stores/jobs'
import { markSeen } from '../stores/seen'

/**
 * A vaga de `/vagas/:id` (id curto, ver `jobRouteId`), marcada como vista: a da lista já carregada ou, se ela não
 * estiver lá (link direto para uma vaga antiga), buscada na API. Com `routeId` nulo, não faz nada.
 */
export function useJob(routeId: string | null) {
	const [job, setJob] = useState<WebJob | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let active = true
		setError(null)
		if (!routeId) {
			setJob(null)
			return
		}

		const known = jobsStore.get().jobs.find(item => isJobRouteId(item.postId, routeId)) ?? null
		setJob(known)
		if (known) markSeen(known.postId)
		else {
			api.job(routeId).then(
				found => {
					if (!active) return
					markSeen(found.postId)
					setJob(found)
				},
				(cause: Error) => active && setError(cause.message),
			)
		}

		return () => {
			active = false
		}
	}, [routeId])

	return { job, error }
}

/** Página da vaga no celular. No desktop, `/vagas/:id` abre a lista com a vaga no painel ao lado (`JobsView`). */
export function JobPage({ routeId }: { routeId: string }) {
	const { job, error } = useJob(routeId)

	return (
		<div className="page page-narrow">
			<a
				className="back-link"
				href="/"
				onClick={event => {
					event.preventDefault()
					goBack('/')
				}}
			>
				<Icon name="back" />
				vagas
			</a>
			{error && (
				<div className="card empty" role="alert">
					<p className="strong">{error}</p>
					<Button variant="lime" href="/" onClick={onLinkClick}>
						ver todas as vagas
					</Button>
				</div>
			)}
			{!error && !job && <div className="card skeleton detail-skeleton" aria-busy="true" />}
			{job && (
				<article className="card detail-page">
					<JobDetail job={job} />
				</article>
			)}
		</div>
	)
}
