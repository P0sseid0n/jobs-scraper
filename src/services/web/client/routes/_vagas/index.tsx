import { createFileRoute } from '@tanstack/react-router'

import { JobDetail } from '../../components/JobDetail'
import { useWideLayout } from '../../lib/media'
import { useJobs } from '../../stores/jobs'
import { DetailPanel } from '../../views/JobsView'

// A lista é o layout `_vagas`; aqui, no desktop, o painel ao lado mostra a primeira vaga
export const Route = createFileRoute('/_vagas/')({ staticData: { title: 'Vagas' }, component: FirstJob })

function FirstJob() {
	const wide = useWideLayout()
	const job = useJobs().jobs[0]

	if (!wide || !job) return null
	return (
		<DetailPanel>
			<JobDetail job={job} />
		</DetailPanel>
	)
}
