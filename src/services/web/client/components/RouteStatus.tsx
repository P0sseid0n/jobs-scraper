import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'

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
export function routeError(title: string, width: PageWidth = 'wide') {
	return function RouteError({ error }: ErrorComponentProps) {
		const router = useRouter()

		return (
			<Page width={width}>
				<EmptyState
					tone="error"
					title={title}
					description={error.message}
					action={
						<Button variant="lime" onClick={() => router.invalidate()}>
							tentar de novo
						</Button>
					}
				/>
			</Page>
		)
	}
}
