import { useCanGoBack, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import type { WebJob } from '../../api-types'
import { Icon } from '../components/Icon'
import { JobDetail } from '../components/JobDetail'
import { ButtonLink } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Page } from '../components/ui/Page'
import { Skeleton } from '../components/ui/Skeleton'
import { jobsStore } from '../stores/jobs'

/**
 * Página da vaga no celular (a rota `/vagas/$id` carrega a vaga). No desktop, a mesma rota abre a lista com a vaga no
 * painel ao lado. Sem `job`, mostra o carregamento ou, com `error`, a falha.
 */
export function JobPage({ job, error }: { job?: WebJob; error?: string }) {
	let content: ReactNode
	if (job) {
		content = (
			<article className={card({ size: 'lg' })}>
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
		content = <Skeleton className={card({ className: 'min-h-60' })} aria-busy="true" />
	}

	return (
		<Page width="narrow">
			<BackToList />
			{content}
		</Page>
	)
}

/** Volta para a tela anterior do site (com a rolagem); aberta direto por um link, vai para a lista. */
function BackToList() {
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
				router.history.back()
			}}
		>
			<Icon name="back" />
			vagas
		</ButtonLink>
	)
}
