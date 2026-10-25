import { useCanGoBack, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import type { WebJob } from '../../api-types'
import { Icon } from '../components/Icon'
import { JobDetail, JobDetailSkeleton } from '../components/JobDetail'
import { ButtonLink } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Page } from '../components/ui/Page'
import { prepareMorphBack } from '../lib/job-morph'
import { jobsStore } from '../stores/jobs'

/**
 * Página da vaga no celular (a rota `/vagas/$id` carrega a vaga). No desktop, a mesma rota abre a lista com a vaga no
 * painel ao lado. Sem `job`, mostra o carregamento ou, com `error`, a falha.
 */
export function JobPage({ job, error }: { job?: WebJob; error?: string }) {
	let content: ReactNode
	if (job) {
		content = (
			// O card da vaga na lista cresce até esta caixa, e "voltar" a encolhe até ele (`lib/job-morph.ts`)
			<article data-vt="card" className={card({ size: 'lg', className: 'vt-job-card' })}>
				<JobDetail job={job} />
			</article>
		)
	} else if (error) {
		content = (
			<EmptyState
				tone="error"
				title={error}
				action={
					<ButtonLink variant="lime" to="/" search={() => jobsStore.get().filters}>
						ver todas as vagas
					</ButtonLink>
				}
			/>
		)
	} else {
		content = (
			<div className={card({ size: 'lg' })}>
				<JobDetailSkeleton />
			</div>
		)
	}

	return (
		<Page width="narrow">
			<BackToList postId={job?.postId} />
			{content}
		</Page>
	)
}

/** Volta para a tela anterior do site (com a rolagem); aberta direto por um link, vai para a lista. */
function BackToList({ postId }: { postId?: string }) {
	const router = useRouter()
	const canGoBack = useCanGoBack()

	return (
		<ButtonLink
			variant="ghost"
			to="/"
			search={() => jobsStore.get().filters}
			replace
			className="self-start"
			onClick={event => {
				if (!canGoBack) return
				event.preventDefault()
				if (postId) prepareMorphBack(postId)
				router.history.back()
			}}
		>
			<Icon name="back" />
			vagas
		</ButtonLink>
	)
}
