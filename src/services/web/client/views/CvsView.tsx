import { Link } from '@tanstack/react-router'

import type { WebCvBaseVersion, WebCvRequest } from '../../api-types'
import { cvPdfUrl } from '../api'
import { Icon } from '../components/Icon'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Hero, Page } from '../components/ui/Page'
import { PdfIcon } from '../components/ui/PdfIcon'
import { LABEL } from '../components/ui/text'
import { activeVersion } from '../lib/cv-base'
import { formatDateTime } from '../lib/format'
import { jobParams } from '../router'
import { requestCv, useCvRequests } from '../stores/cv'
import { notify } from '../stores/toast'

async function retry(request: WebCvRequest) {
	try {
		await requestCv(request)
	} catch (error) {
		notify(`Não consegui pedir o currículo: ${(error as Error).message}`, 'error')
	}
}

function CvItem({ request }: { request: WebCvRequest }) {
	const meta = [request.company, formatDateTime(request.finishedAt ?? request.requestedAt)].filter(Boolean).join(' · ')

	return (
		<li className={card({ failed: request.status === 'failed', className: 'flex items-center gap-3.5 px-4 py-3.5' })}>
			<PdfIcon dashed={request.status === 'pending'}>
				{request.status === 'pending' ? <Icon name="spinner" size={14} /> : request.status === 'failed' ? 'erro' : 'PDF'}
			</PdfIcon>
			<div className="grow min-w-0 flex flex-col gap-0.5">
				<Link
					className="font-semibold block truncate no-underline hover:underline"
					to="/vagas/$id"
					params={jobParams(request.postId)}
				>
					{request.jobTitle ?? 'Vaga'}
				</Link>
				<span className="font-mono text-muted text-xs">
					{request.status === 'pending' ? `gerando · pedido ${formatDateTime(request.requestedAt)}` : meta}
				</span>
				{request.status === 'failed' && <span className="text-sm text-danger">{request.error}</span>}
			</div>
			{request.status === 'ready' && (
				<div className="flex gap-2">
					<Button variant="ghost" href={cvPdfUrl(request.requestId)} external>
						abrir
					</Button>
					<Button variant="lime" href={cvPdfUrl(request.requestId, true)} download={request.fileName ?? undefined}>
						<Icon name="download" size={14} />
						baixar
					</Button>
				</div>
			)}
			{request.status === 'failed' && (
				<Button variant="ghost" onClick={() => retry(request)}>
					tentar de novo
				</Button>
			)}
		</li>
	)
}

/** O currículo base em uso, com o caminho para trocá-lo; `versions` é `null` se não deu para carregar. */
function CvBaseCard({ versions }: { versions: WebCvBaseVersion[] | null }) {
	const active = versions && activeVersion(versions)
	const validating = versions?.some(version => version.status === 'validating')

	const detail = !versions
		? 'Não consegui carregar as versões do currículo base.'
		: active
			? [`versão de ${formatDateTime(active.activatedAt!)}`, active.fileName ?? 'editada no site'].join(' · ')
			: 'usando o arquivo data/cv/cv.tex'

	return (
		<section className={card({ className: 'flex flex-wrap items-center gap-3.5 px-5 py-4.5' })} aria-labelledby="cv-base-title">
			<div className="flex min-w-0 grow flex-col gap-0.5">
				<span className="flex flex-wrap items-center gap-2">
					<h2 id="cv-base-title" className="font-semibold">
						currículo base
					</h2>
					{validating && (
						<Badge tone="running" size="sm">
							validando
						</Badge>
					)}
				</span>
				<span className="font-mono text-xs text-muted">{detail}</span>
			</div>
			<ButtonLink variant="ghost" to="/curriculos/base">
				alterar
			</ButtonLink>
		</section>
	)
}

/** "Meus currículos": o currículo base e os PDFs gerados pelo site, para baixar de novo sem gerar outro. */
export function CvsView({ baseVersions }: { baseVersions: WebCvBaseVersion[] | null }) {
	// A lista vem do loader da rota (`routes/curriculos.tsx`), que também cuida do carregamento e do erro
	const { requests } = useCvRequests()

	const pending = requests.filter(request => request.status === 'pending')
	const done = requests.filter(request => request.status !== 'pending')

	return (
		<Page width="medium">
			<Hero
				title={
					<>
						meus <Hero.Mono>currículos.</Hero.Mono>
					</>
				}
				lead="Um PDF de uma página por vaga, ajustado ao que ela pede."
			/>

			<CvBaseCard versions={baseVersions} />

			{requests.length === 0 && (
				<EmptyState
					title="Nenhum currículo gerado pelo site ainda"
					description="Em qualquer vaga, clique em “gerar currículo”. Ele fica pronto em até ~1 minuto."
					action={
						<ButtonLink variant="lime" to="/">
							ver vagas
						</ButtonLink>
					}
				/>
			)}

			{pending.length > 0 && (
				<section className="flex flex-col gap-2.5">
					<h2 className={LABEL}>em andamento_</h2>
					<ul className="flex flex-col gap-2.5 m-0 list-none p-0">
						{pending.map(request => (
							<CvItem key={request.requestId} request={request} />
						))}
					</ul>
				</section>
			)}
			{done.length > 0 && (
				<section className="flex flex-col gap-2.5">
					<h2 className={LABEL}>gerados_</h2>
					<ul className="flex flex-col gap-2.5 m-0 list-none p-0">
						{done.map(request => (
							<CvItem key={request.requestId} request={request} />
						))}
					</ul>
				</section>
			)}
		</Page>
	)
}
