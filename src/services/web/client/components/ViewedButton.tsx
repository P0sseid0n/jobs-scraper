import type { WebJob } from '../../api-types'
import { setViewed, useViewed } from '../stores/viewed'
import { Icon } from './Icon'
import { IconButton } from './ui/IconButton'

/** Marca à mão a vaga como vista ou, já vista, como não vista (o olho cortado desfaz). */
export function ViewedButton({
	job,
	size,
	className,
}: {
	job: Pick<WebJob, 'postId' | 'viewedAt'>
	size?: 'sm' | 'md'
	className?: string
}) {
	const viewed = useViewed(job)

	return (
		<IconButton
			label={viewed ? 'marcar como não vista' : 'marcar como vista'}
			size={size}
			bordered
			className={className}
			onClick={() => void setViewed(job, !viewed)}
		>
			<Icon name={viewed ? 'eye-off' : 'eye'} size={size === 'sm' ? 15 : 16} />
		</IconButton>
	)
}
