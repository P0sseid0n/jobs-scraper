import type { WebJob } from '../../api-types'
import { setViewed, useViewed } from '../stores/viewed'
import { TextLink } from './ui/TextLink'

/** Marca à mão a vaga como vista ou, já vista, como não vista (abrir o detalhe já a marca). */
export function ViewedLink({ job, className }: { job: Pick<WebJob, 'postId' | 'viewedAt'>; className?: string }) {
	const viewed = useViewed(job)

	return (
		<TextLink className={className} onClick={() => void setViewed(job, !viewed)}>
			{viewed ? 'marcar como não vista' : 'marcar como vista'}
		</TextLink>
	)
}
