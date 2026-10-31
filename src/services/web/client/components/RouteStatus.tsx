import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'

import type { Messages } from '@shared/i18n'

import { useT } from '../stores/locale'
import { Button } from './ui/Button'
import { card } from './ui/Card'
import { EmptyState } from './ui/EmptyState'
import { Page } from './ui/Page'
import { Skeleton } from './ui/Skeleton'

type PageWidth = 'wide' | 'medium' | 'narrow'

/** O `pendingComponent` das rotas: a tela ainda carregando (aparece se o loader demorar mais de 1 s). */
export function RoutePending({ width = 'wide' }: { width?: PageWidth }) {
	return (
		<Page width={width}>
			<Skeleton className={card({ className: 'min-h-60' })} aria-busy="true" />
		</Page>
	)
}

/** O `errorComponent` de uma rota: o loader falhou; "tentar de novo" roda o loader outra vez. */
export function routeError(title: keyof Messages['routes']['errors'], width: PageWidth = 'wide') {
	return function RouteError({ error }: ErrorComponentProps) {
		const router = useRouter()
		const t = useT()

		return (
			<Page width={width}>
				<EmptyState
					tone="error"
					title={t.routes.errors[title]}
					description={error.message}
					action={
						<Button variant="lime" onClick={() => router.invalidate()}>
							{t.routes.retry}
						</Button>
					}
				/>
			</Page>
		)
	}
}
