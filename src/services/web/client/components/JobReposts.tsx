import { useState } from 'react'

import type { WebJob } from '../../api-types'
import { api, RequestError } from '../api'
import { cx } from '../lib/cx'
import { safeLink, timeAgo } from '../lib/format'
import { useT } from '../stores/locale'
import { notify } from '../stores/toast'
import { LABEL, LIST, META } from './ui/text'
import { TextLink } from './ui/TextLink'

/**
 * Os outros posts da mesma vaga ("também postada por …"), agrupados nela pelo post-processing. "Não é a mesma vaga"
 * desfaz o agrupamento: o post vira uma vaga própria, que chega à lista pelo stream.
 */
export function JobReposts({ job, onUngrouped }: { job: WebJob; onUngrouped: (job: WebJob) => void }) {
	const t = useT()
	const [ungrouping, setUngrouping] = useState<string | null>(null)

	if (job.reposts.length === 0) return null

	async function ungroup(repostId: string) {
		setUngrouping(repostId)
		try {
			onUngrouped(await api.ungroupRepost(job.postId, repostId))
			notify(t.reposts.ungrouped)
		} catch (error) {
			notify(error instanceof RequestError ? error.message : t.reposts.ungroupFailed, 'error')
		} finally {
			setUngrouping(null)
		}
	}

	return (
		<section className="flex flex-col gap-2.5" aria-label={t.reposts.label}>
			<h3 className={LABEL}>{t.reposts.title}</h3>
			<ul className={cx(LIST, 'flex flex-col gap-2')}>
				{job.reposts.map(repost => {
					const link = safeLink(repost.postLink)

					return (
						<li key={repost.postId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
							<span className="min-w-0">
								{repost.author ?? t.reposts.unknownAuthor}
								{repost.postedAt && <span className={META}> · {timeAgo(repost.postedAt)}</span>}
							</span>
							<span className="flex items-center gap-3">
								{link && (
									<TextLink size="xs" mono href={link} external>
										{t.reposts.goToPost}
									</TextLink>
								)}
								<TextLink size="xs" mono disabled={ungrouping !== null} onClick={() => ungroup(repost.postId)}>
									{ungrouping === repost.postId ? t.reposts.ungrouping : t.reposts.notSame}
								</TextLink>
							</span>
						</li>
					)
				})}
			</ul>
		</section>
	)
}
