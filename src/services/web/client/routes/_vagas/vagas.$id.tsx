import { createFileRoute, type ErrorComponentProps } from '@tanstack/react-router'
import { useEffect } from 'react'

import { isJobRouteId } from '../../../job-route-id'
import { api } from '../../api'
import { JobDetail, JobDetailSkeleton } from '../../components/JobDetail'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useWideLayout } from '../../lib/media'
import { jobsStore, useJobs } from '../../stores/jobs'
import { markViewed } from '../../stores/viewed'
import { JobPage } from '../../views/JobPage'
import { DetailPanel } from '../../views/JobsView'

/** A vaga da lista já carregada (na hora) ou, se ela não estiver lá (link direto para uma vaga antiga), a da API. */
const findLoaded = (id: string) => jobsStore.get().jobs.find(job => isJobRouteId(job.postId, id))

export const Route = createFileRoute('/_vagas/vagas/$id')({
	staticData: { title: 'Vaga' },
	loader: ({ params }) => findLoaded(params.id) ?? api.job(params.id),
	pendingComponent: JobPending,
	errorComponent: JobError,
	component: OpenJob,
})

/** No desktop, o painel ao lado da lista; no celular, a página da vaga. */
function OpenJob() {
	const loaded = Route.useLoaderData()
	const wide = useWideLayout()
	// A da lista acompanha as mudanças (correção pelo site, vaga que chegou em tempo real)
	const job = useJobs().jobs.find(item => item.postId === loaded.postId) ?? loaded

	// Abrir a vaga a marca como vista; só ao trocar de vaga, para não marcar de novo a que foi desmarcada aqui
	useEffect(() => {
		markViewed(job.postId)
	}, [job.postId])

	if (!wide) return <JobPage job={job} />
	return (
		<DetailPanel>
			<JobDetail job={job} />
		</DetailPanel>
	)
}

function JobPending() {
	const wide = useWideLayout()

	if (!wide) return <JobPage />
	return (
		<DetailPanel>
			<JobDetailSkeleton />
		</DetailPanel>
	)
}

function JobError({ error }: ErrorComponentProps) {
	const wide = useWideLayout()

	if (!wide) return <JobPage error={error.message} />
	return (
		<DetailPanel>
			<EmptyState
				bare
				tone="error"
				title={error.message}
				action={
					<ButtonLink variant="lime" to="/" search={() => jobsStore.get().filters}>
						ver todas as vagas
					</ButtonLink>
				}
			/>
		</DetailPanel>
	)
}
