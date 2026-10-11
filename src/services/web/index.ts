import { z } from 'zod'

import { CvResultSchema, ProcessedJobSchema } from '@shared/contracts'
import { Job } from '@shared/database'
import { onShutdown } from '@shared/lifecycle'
import { EXCHANGES, QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'

import type { ApiError } from './api-types'
import app from './client/index.html'
import { webEnv } from './config'
import { getCvPdf, getCvRequest, listCvRequests, requestCv, saveCvResult } from './server/cv'
import { EventHub } from './server/event-hub'
import { handler } from './server/http'
import { getJob, jobFacets, listJobs } from './server/jobs'
import { toWebJob, type JobDocument } from './server/jobs-query'
import { listRuns, requestRun, scraperStatus } from './server/scraper'
import { getSettings, putSettings } from './server/settings'

const { config, logger, queue } = await startService({ name: 'web', env: webEnv, database: true })

// Os erros de validação vão para a interface: mensagens do zod em português
z.config(z.locales.pt())

const events = new EventHub()
onShutdown(() => events.close())

await queue.assertQueue(QUEUES.cvUpdater)
await queue.assertQueue(QUEUES.scraper)

// A fila `web` assina o evento `job-published`, como a do Discord: o site recebe todas as vagas novas
await queue.consume(
	QUEUES.web,
	ProcessedJobSchema,
	async job => {
		// O storage salva antes de publicar: o documento traz o `createdAt`
		const saved = await Job.findOne({ postId: job.postId }).lean<JobDocument>()
		events.broadcast('job', toWebJob(saved ?? job))
	},
	{ bindTo: EXCHANGES.jobPublished, prefetch: 10 },
)

await queue.consume(QUEUES.webCv, CvResultSchema, result => saveCvResult(result, { events, logger }))

const api = <R extends Request>(fn: (req: R) => Promise<Response> | Response) => handler(logger, fn)

const server = Bun.serve({
	hostname: config.WEB_HOST,
	port: config.WEB_PORT,
	development: process.env.NODE_ENV !== 'production' && { hmr: true, console: true },
	routes: {
		'/api/jobs': { GET: api(listJobs) },
		'/api/jobs/facets': { GET: api(jobFacets) },
		'/api/jobs/stream': {
			GET: (req, srv) => {
				// SSE: a conexão fica aberta sem tráfego entre os eventos (o heartbeat é a cada 20 s)
				srv.timeout(req, 0)
				return events.subscribe(req.signal)
			},
		},
		'/api/jobs/:postId': { GET: api(getJob) },
		'/api/jobs/:postId/cv': { POST: api(req => requestCv(req, { queue, events, logger })) },
		'/api/cv': { GET: api(listCvRequests) },
		'/api/cv/:requestId': { GET: api(getCvRequest) },
		'/api/cv/:requestId/pdf': { GET: api(getCvPdf) },
		'/api/scraper/status': { GET: api(scraperStatus) },
		'/api/scraper/runs': { GET: api(listRuns) },
		'/api/scraper/run': { POST: api(() => requestRun(queue)) },
		'/api/settings/:key': { GET: api(getSettings), PUT: api(putSettings) },
		'/api/*': Response.json({ error: 'Rota da API não encontrada' } satisfies ApiError, { status: 404 }),
		// O resto é a aplicação (as rotas do navegador são resolvidas no cliente)
		'/*': app,
	},
})

onShutdown(() => server.stop())

logger.info({ url: server.url.href }, '🌐 Site no ar')
