import { useState } from 'react'

import type { WebJob } from '../../api-types'
import { api, RequestError } from '../api'
import { safeLink, timeAgo } from '../lib/format'
import { notify } from '../stores/toast'
import { LABEL } from './ui/text'
import { TextLink } from './ui/TextLink'

/**
 * Os outros posts da mesma vaga ("também postada por …"), agrupados nela pelo post-processing. "Não é a mesma vaga"
 * desfaz o agrupamento: o post vira uma vaga própria, que chega à lista pelo stream.
 */
export function JobReposts({ job, onUngrouped }: { job: WebJob; onUngrouped: (job: WebJob) => void }) {
	const [ungrouping, setUngrouping] = useState<string | null>(null)

	if (job.reposts.length === 0) return null

	async function ungroup(repostId: string) {
		setUngrouping(repostId)
		try {
			onUngrouped(await api.ungroupRepost(job.postId, repostId))
			notify('Separada: o post virou uma vaga própria')
		} catch (error) {
			notify(error instanceof RequestError ? error.message : 'Não consegui separar a vaga', 'error')
		} finally {
			setUngrouping(null)
		}
	}

	return (
		<section className="flex flex-col gap-2.5" aria-label="Também postada por">
			<h3 className={LABEL}>também postada por</h3>
			<ul className="m-0 flex list-none flex-col gap-2 p-0">
				{job.reposts.map(repost => {
					const link = safeLink(repost.postLink)

					return (
						<li key={repost.postId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
							<span className="min-w-0">
								{repost.author ?? 'autor desconhecido'}
								{repost.postedAt && <span className="font-mono text-muted text-xs"> · {timeAgo(repost.postedAt)}</span>}
							</span>
							<span className="flex items-center gap-3">
								{link && (
									<TextLink className="text-xs font-mono" href={link} external>
										ir para o post
									</TextLink>
								)}
								<TextLink className="text-xs font-mono" disabled={ungrouping !== null} onClick={() => ungroup(repost.postId)}>
									{ungrouping === repost.postId ? 'separando…' : 'não é a mesma vaga'}
								</TextLink>
							</span>
						</li>
					)
				})}
			</ul>
		</section>
	)
}
