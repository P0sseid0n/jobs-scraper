import { Ollama } from 'ollama'
import { z } from 'zod'

import {
	CvBaseValidationResultSchema,
	CvImportResultSchema,
	CvResultSchema,
	JobAppliedChangeSchema,
	MailResultSchema,
	ProcessedJobSchema,
	ScraperRunEventSchema,
} from '@shared/contracts'
import { isDatabaseConnected, Job } from '@shared/database'
import { onShutdown } from '@shared/lifecycle'
import { EXCHANGES, QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'
import { readSettings } from '@shared/settings'

import type { ApiError } from './api-types'
import app from './client/index.html'
import { webEnv } from './config'
import { blockCompany, blockedCompanyJobs, removeBlockedJobs, unblockCompany } from './server/blocked-companies'
import { getCredentials, putCredentials, removeCredentials, testCredentials } from './server/credentials'
import { getCvPdf, getCvRequest, listCvRequests, requestCv, saveCvResult } from './server/cv'
import {
	activateCvBaseVersion,
	createCvBaseVersion,
	getCvBasePdf,
	getCvBaseVersion,
	listCvBaseVersions,
	saveCvBaseValidation,
} from './server/cv-base'
import { CvImports, getCvImport, requestCvImport, saveCvImportResult } from './server/cv-import'
import { EventHub } from './server/event-hub'
import { handler, HttpError } from './server/http'
import { appliedSimilar, setJobAppliedRoute } from './server/job-applied'
import { correctJob } from './server/job-correction'
import { ungroupRepost } from './server/job-reposts'
import { setJobsViewed, setJobViewed } from './server/job-viewed'
import { getJob, getJobImage, getRawJob, jobFacets, listJobs } from './server/jobs'
import { toWebJob, type JobDocument } from './server/jobs-query'
import { getLinkedinLogin, requestLinkedinLogin, sendVerificationCode } from './server/linkedin-login'
import { listJobMails, mailSetup, saveMailResult, sendJobMail } from './server/mail'
import { improveJobMessage } from './server/message-rewrite'
import { listRuns, requestRun, scraperStatus } from './server/scraper'
import { getSettings, putSettings } from './server/settings'
import { searchSuggestions, setupStatus } from './server/setup'

const { config, logger, queue } = await startService({ name: 'web', env: webEnv, database: true })
const ai = { ollama: new Ollama({ host: config.OLLAMA_HOST }), model: config.OLLAMA_MODEL }

// Os erros de validação vão para a interface: mensagens do zod em português
z.config(z.locales.pt())

const events = new EventHub()
onShutdown(() => events.close())
const cvImports = new CvImports()

await queue.assertQueue(QUEUES.cvUpdater)
await queue.assertQueue(QUEUES.cvUpdaterBase)
await queue.assertQueue(QUEUES.cvUpdaterImport)
await queue.assertQueue(QUEUES.scraper)
await queue.assertQueue(QUEUES.mailer)

// A fila `web` assina o evento `job-published`, como a do Discord: o site recebe todas as vagas novas
await queue.consume(
	QUEUES.web,
	ProcessedJobSchema,
	async job => {
		// O post-processing salva antes de publicar: o documento traz o `createdAt`
		const saved = await Job.findOne({ postId: job.postId }).lean<JobDocument>()
		const { reviewChecksPercent } = await readSettings('post-processing')
		events.broadcast('job', toWebJob(saved ?? job, reviewChecksPercent))
	},
	{ bindTo: EXCHANGES.jobPublished, prefetch: 10 },
)

await queue.consume(QUEUES.webCv, CvResultSchema, result => saveCvResult(result, { events, logger }))
await queue.consume(QUEUES.webCvBase, CvBaseValidationResultSchema, result => saveCvBaseValidation(result, { events, logger }))
await queue.consume(QUEUES.webCvImport, CvImportResultSchema, result =>
	saveCvImportResult(result, { imports: cvImports, events, logger }),
)
// Candidatura marcada pelo botão do Discord: o banco já mudou, os navegadores abertos ficam sabendo
await queue.consume(QUEUES.webMail, MailResultSchema, result => saveMailResult(result, { events, logger }))
await queue.consume(QUEUES.webApplied, JobAppliedChangeSchema, async change => events.broadcast('applied', change))
// Coleta que começou ou terminou: os navegadores abertos consultam o status na hora (a consulta periódica continua de garantia)
await queue.consume(QUEUES.webScraperRun, ScraperRunEventSchema, async event => events.broadcast('scraperRun', event), {
	bindTo: EXCHANGES.scraperRun,
})

// Com o MongoDB já fora do ar a rota responde na hora, sem esperar o mongoose desistir da reconexão (~10 s);
// a queda no meio de uma consulta fica com o `handler`
const api = <R extends Request>(fn: (req: R) => Promise<Response> | Response) =>
	handler<R>(logger, req => {
		if (!isDatabaseConnected()) throw new HttpError(503, 'Banco de dados fora do ar')
		return fn(req)
	})

// A primeira chamada depois de subir carrega o modelo no Ollama, o que passa dos 10 s em que o Bun fecha uma conexão
// sem resposta (na CPU, bem mais): as rotas que esperam a IA aguentam até 4 min
const AI_TIMEOUT_SECONDS = 240
const suggestSearchTerms = api(() => searchSuggestions(ai, logger))
const improveMessage = api<Request & { params: { postId: string } }>(req => improveJobMessage(req, { ai, logger }))

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
		'/api/jobs/viewed': { PUT: api(req => setJobsViewed(req, { events })) },
		'/api/jobs/:postId': { GET: api(getJob), PATCH: api(req => correctJob(req, { logger })) },
		'/api/jobs/:postId/viewed': { PUT: api(req => setJobViewed(req, { events })) },
		'/api/jobs/:postId/applied': { PUT: api(req => setJobAppliedRoute(req, { events })) },
		'/api/jobs/:postId/applied-similar': { GET: api(appliedSimilar) },
		'/api/jobs/:postId/raw': { GET: api(getRawJob) },
		'/api/jobs/:postId/reposts/:repostId': { DELETE: api(req => ungroupRepost(req, { queue, logger })) },
		'/api/jobs/:postId/images/:index': { GET: api(getJobImage) },
		'/api/jobs/:postId/cv': { POST: api(req => requestCv(req, { queue, events, logger })) },
		'/api/jobs/:postId/mail': { POST: api(req => sendJobMail(req, { queue, events, logger })) },
		'/api/jobs/:postId/mails': { GET: api(listJobMails) },
		'/api/jobs/:postId/message': {
			POST: (req, srv) => {
				srv.timeout(req, AI_TIMEOUT_SECONDS)
				return improveMessage(req)
			},
		},
		'/api/mail': { GET: api(mailSetup) },
		'/api/cv': { GET: api(listCvRequests) },
		'/api/cv/:requestId': { GET: api(getCvRequest) },
		'/api/cv/:requestId/pdf': { GET: api(getCvPdf) },
		'/api/cv-base': { GET: api(listCvBaseVersions) },
		'/api/cv-base/versions': { POST: api(req => createCvBaseVersion(req, { queue, events, logger })) },
		'/api/cv-base/versions/:versionId': { GET: api(getCvBaseVersion) },
		'/api/cv-base/versions/:versionId/pdf': { GET: api(getCvBasePdf) },
		'/api/cv-base/versions/:versionId/activate': { POST: api(req => activateCvBaseVersion(req, { events, logger })) },
		'/api/cv-base/imports': { POST: api(req => requestCvImport(req, { imports: cvImports, queue, logger })) },
		'/api/cv-base/imports/:importId': { GET: api(req => getCvImport(req, cvImports)) },
		'/api/scraper/status': { GET: api(() => scraperStatus({ skipOnboarding: config.SKIP_ONBOARDING })) },
		'/api/scraper/runs': { GET: api(listRuns) },
		'/api/scraper/run': { POST: api(() => requestRun(queue)) },
		'/api/settings/:key': { GET: api(getSettings), PUT: api(req => putSettings(req, { logger })) },
		'/api/blocked-companies': {
			POST: api(req => blockCompany(req, { logger })),
			DELETE: api(req => unblockCompany(req, { logger })),
		},
		'/api/blocked-companies/jobs': { GET: api(blockedCompanyJobs) },
		'/api/blocked-companies/remove-jobs': { POST: api(req => removeBlockedJobs(req, { logger })) },
		'/api/credentials': { GET: api(getCredentials) },
		'/api/credentials/:group': { PUT: api(putCredentials), DELETE: api(removeCredentials) },
		'/api/credentials/:group/test': { POST: api(testCredentials) },
		'/api/linkedin/login': { GET: api(getLinkedinLogin), POST: api(() => requestLinkedinLogin(queue)) },
		'/api/linkedin/verification-code': { POST: api(req => sendVerificationCode(req, queue)) },
		'/api/setup': { GET: api(() => setupStatus({ skipOnboarding: config.SKIP_ONBOARDING, cvTexFile: config.CV_TEX_FILE })) },
		'/api/setup/suggestions': {
			POST: (req, srv) => {
				srv.timeout(req, AI_TIMEOUT_SECONDS)
				return suggestSearchTerms(req)
			},
		},
		'/api/*': Response.json({ error: 'Rota da API não encontrada' } satisfies ApiError, { status: 404 }),
		// O resto é a aplicação (as rotas do navegador são resolvidas no cliente)
		'/*': app,
	},
})

onShutdown(() => server.stop())

logger.info({ url: server.url.href }, '🌐 Site no ar')
