import { createFileRoute, Outlet, stripSearchParams, useParams } from '@tanstack/react-router'

import { routeError } from '../components/RouteStatus'
import { DEFAULT_FILTERS, jobFiltersSearch } from '../lib/job-filters'
import { useWideLayout } from '../lib/media'
import { loadJobsFor } from '../stores/jobs'
import { JobsPending, JobsView } from '../views/JobsView'

/**
 * A lista de vagas (`/`) e a vaga aberta (`/jobs/$id`). Os filtros ficam na URL e valem para as duas. No desktop é a
 * mesma lista, com a vaga no painel ao lado (o `<Outlet />`): por ser um layout, ela continua montada ao trocar de vaga,
 * sem piscar nem perder a rolagem. No celular, a vaga tem página própria.
 */
export const Route = createFileRoute('/_jobs')({
	validateSearch: jobFiltersSearch,
	// Os valores padrão não aparecem na URL
	search: { middlewares: [stripSearchParams(DEFAULT_FILTERS)] },
	loaderDeps: ({ search }) => search,
	// Chegando por `/jobs/$id` (link, recarregar, outra tela), a lista vem até a vaga. O `$id` é da rota filha e o
	// loader do layout só recebe os próprios parâmetros: o id sai do caminho da URL
	loader: ({ deps, cause, location }) => loadJobsFor(deps, cause === 'enter' ? openJobId(location.pathname) : undefined),
	pendingComponent: JobsPending,
	errorComponent: routeError('jobs'),
	component: JobsLayout,
})

function openJobId(pathname: string) {
	const id = /^\/jobs\/([^/]+)/.exec(pathname)?.[1]
	return id && decodeURIComponent(id)
}

function JobsLayout() {
	const { id } = useParams({ strict: false })
	const wide = useWideLayout()

	if (id && !wide) return <Outlet />
	return <JobsView selectedRouteId={id ?? null} detail={wide && <Outlet />} />
}
