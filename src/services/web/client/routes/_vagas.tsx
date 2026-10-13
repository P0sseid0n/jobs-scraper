import { createFileRoute, Outlet, stripSearchParams, useParams } from '@tanstack/react-router'

import { routeError, RoutePending } from '../components/RouteStatus'
import { DEFAULT_FILTERS, jobFiltersSearch } from '../lib/job-filters'
import { useWideLayout } from '../lib/media'
import { loadJobsFor } from '../stores/jobs'
import { JobsView } from '../views/JobsView'

/**
 * A lista de vagas (`/`) e a vaga aberta (`/vagas/$id`). Os filtros ficam na URL e valem para as duas. No desktop é a
 * mesma lista, com a vaga no painel ao lado (o `<Outlet />`): por ser um layout, ela continua montada ao trocar de vaga,
 * sem piscar nem perder a rolagem. No celular, a vaga tem página própria.
 */
export const Route = createFileRoute('/_vagas')({
	validateSearch: jobFiltersSearch,
	// Os valores padrão não aparecem na URL
	search: { middlewares: [stripSearchParams(DEFAULT_FILTERS)] },
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => loadJobsFor(deps),
	pendingComponent: () => <RoutePending />,
	errorComponent: routeError('Não consegui carregar as vagas'),
	component: JobsLayout,
})

function JobsLayout() {
	const { id } = useParams({ strict: false })
	const wide = useWideLayout()

	if (id && !wide) return <Outlet />
	return <JobsView selectedRouteId={id ?? null} detail={wide && <Outlet />} />
}
