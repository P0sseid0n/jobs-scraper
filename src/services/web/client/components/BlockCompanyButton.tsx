import { useEffect, useRef, useState } from 'react'

import type { WebBlockedCompanyJobs, WebJob } from '../../api-types'
import { api } from '../api'
import { removeJob } from '../stores/jobs'
import { useT } from '../stores/locale'
import { notify } from '../stores/toast'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { Dialog, DialogTitle } from './ui/Dialog'
import { IconButton } from './ui/IconButton'

const DIALOG_ACTIONS = 'flex flex-wrap items-center justify-end gap-2 pt-2'

/**
 * Se a empresa da vaga está bloqueada e quantas vagas dela estão na lista, consultado ao abrir o detalhe (e de novo
 * quando a empresa é corrigida). `company: null` = sem empresa ou confidencial: não há o que bloquear. Sem a resposta,
 * a empresa fica como não bloqueada (bloquear de novo não a repete na lista).
 */
export function useCompanyBlock(job: Pick<WebJob, 'company' | 'companyConfidential'>) {
	const company = job.companyConfidential ? null : job.company
	// `null` enquanto a consulta não volta; `status.company: null` = não bloqueada
	const [status, setStatus] = useState<WebBlockedCompanyJobs | null>(null)

	useEffect(() => {
		setStatus(null)
		if (!company) return
		let current = true
		api.blockedCompanyJobs(company).then(
			result => current && setStatus(result),
			() => current && setStatus({ company: null, jobs: 0 }),
		)
		return () => {
			current = false
		}
	}, [company])

	return { company, status, setStatus }
}

export type CompanyBlock = ReturnType<typeof useCompanyBlock>

/**
 * O bloquear colado no nome da empresa, no detalhe da vaga (como o copiar ao lado do que copia). Bloqueada, o ícone fica
 * vermelho. No toque, sem a dica do mouse, a palavra aparece ao lado do ícone.
 */
export function BlockCompanyButton({ block, onClick }: { block: CompanyBlock; onClick: () => void }) {
	const t = useT().blockCompany
	if (!block.company) return null
	const blocked = block.status?.company ?? null

	return (
		<IconButton
			label={blocked ? t.blockedLabel(block.company) : t.blockLabel(block.company)}
			size="xs"
			tone={blocked ? 'danger' : 'muted'}
			className="ml-1 align-middle pointer-coarse:w-auto pointer-coarse:grid-flow-col pointer-coarse:gap-1 pointer-coarse:px-1.5"
			aria-haspopup="dialog"
			onClick={onClick}
		>
			<Icon name="block" size={14} />
			<span className="hidden font-mono text-xs pointer-coarse:inline">{blocked ? t.blocked : t.block}</span>
		</IconButton>
	)
}

/**
 * A modal do bloquear. Livre, a empresa pede confirmação (o ícone fica colado no nome e um toque sem querer a
 * bloquearia) e, bloqueada, oferece tirar da lista as vagas dela: a remoção não é automática. Já bloqueada, oferece
 * desbloquear ou tirar as vagas que ainda estão na lista.
 */
export function BlockCompanyDialog({
	job,
	block,
	onClose,
	onRemoved,
}: {
	job: Pick<WebJob, 'postId'>
	block: CompanyBlock
	onClose: () => void
	/** A vaga aberta saiu da lista junto com as outras da empresa. */
	onRemoved: () => void
}) {
	const t = useT().blockCompany
	const ref = useRef<HTMLDialogElement>(null)
	// Acabou de bloquear: o título confirma o bloqueio, e fechar avisa no toast
	const [justBlocked, setJustBlocked] = useState(false)
	const [busy, setBusy] = useState<'block' | 'unblock' | 'remove' | null>(null)

	const company = block.company
	if (!company) return null

	const blocked = block.status?.company ?? null
	const jobs = block.status?.jobs ?? 0
	const close = () => ref.current?.close()

	async function run(action: NonNullable<typeof busy>, work: () => Promise<void>) {
		if (busy) return
		setBusy(action)
		try {
			await work()
		} catch (error) {
			notify(t.failed(t.actions[action], (error as Error).message), 'error')
		} finally {
			setBusy(null)
		}
	}

	const blockCompany = () =>
		run('block', async () => {
			block.setStatus(await api.blockCompany(company))
			setJustBlocked(true)
		})

	const unblock = () =>
		run('unblock', async () => {
			block.setStatus(await api.unblockCompany(company))
			notify(t.unblockedToast(blocked ?? company))
			close()
		})

	const removeJobs = () =>
		run('remove', async () => {
			const { postIds } = await api.removeBlockedJobs(company)
			notify(t.removedToast(postIds.length))
			block.setStatus({ company: blocked, jobs: 0 })
			// Sem o aviso de bloqueada ao fechar: o de vagas tiradas já confirma
			setJustBlocked(false)
			close()
			for (const postId of postIds) if (postId !== job.postId) removeJob(postId)
			if (postIds.includes(job.postId)) onRemoved()
		})

	function closed() {
		if (justBlocked && blocked) notify(t.blockedToast(blocked))
		onClose()
	}

	return (
		<Dialog ref={ref} onClose={closed}>
			<div className="flex flex-col gap-2.5 px-5 pt-4 pb-5">
				<DialogTitle>
					{!blocked ? t.confirmTitle(company) : justBlocked ? t.blockedTitle(blocked) : t.isBlockedTitle(blocked)}
				</DialogTitle>

				{!blocked ? (
					<>
						<p className="text-sm text-muted">{t.confirmText}</p>
						<div className={DIALOG_ACTIONS}>
							<Button variant="ghost" onClick={close}>
								{t.cancel}
							</Button>
							<Button variant="danger" disabled={busy !== null} onClick={() => void blockCompany()}>
								{busy === 'block' ? t.blocking : t.block}
							</Button>
						</div>
					</>
				) : (
					<>
						<p className="text-sm text-muted">
							{justBlocked ? t.justBlocked : t.alreadyBlocked} {t.jobsInList(jobs)}
						</p>
						<div className={DIALOG_ACTIONS}>
							{/* Longe do remover: desbloquear é a ação oposta */}
							{!justBlocked && (
								<Button variant="ghost" className="mr-auto" disabled={busy !== null} onClick={() => void unblock()}>
									{busy === 'unblock' ? t.unblocking : t.unblock}
								</Button>
							)}
							<Button variant="ghost" onClick={close}>
								{jobs === 0 ? t.close : t.keep}
							</Button>
							{jobs > 0 && (
								<Button variant="danger" disabled={busy !== null} onClick={() => void removeJobs()}>
									{busy === 'remove' ? t.removing : t.remove(jobs)}
								</Button>
							)}
						</div>
					</>
				)}
			</div>
		</Dialog>
	)
}
