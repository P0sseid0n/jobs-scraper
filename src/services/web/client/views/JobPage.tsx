import { useEffect, useState } from 'react'

import type { WebJob } from '../../api-types'
import { api } from '../api'
import { Icon } from '../components/Icon'
import { JobDetail } from '../components/JobDetail'
import { goBack, onLinkClick } from '../router'
import { jobsStore } from '../stores/jobs'
import { markSeen } from '../stores/seen'

/** Página da vaga: o detalhe no celular, e o destino de links diretos (ex.: o indicador de currículos). */
export function JobPage({ postId }: { postId: string }) {
	const [job, setJob] = useState<WebJob | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let active = true
		markSeen(postId)
		setError(null)

		const known = jobsStore.get().jobs.find(item => item.postId === postId) ?? null
		setJob(known)
		if (!known) {
			api.job(postId).then(
				found => active && setJob(found),
				(cause: Error) => active && setError(cause.message),
			)
		}

		return () => {
			active = false
		}
	}, [postId])

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
					<a className="btn btn-lime" href="/" onClick={onLinkClick}>
						ver todas as vagas
					</a>
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
