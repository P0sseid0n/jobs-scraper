import { z } from 'zod'

import { blockingCompany, MAX_BLOCKED_COMPANIES, normalizeCompany } from '@shared/contracts'
import { Job, SeenPost } from '@shared/database'
import type { Logger } from '@shared/logging'
import { readSettings, updateSettings } from '@shared/settings'

import type { WebBlockedCompanyJobs, WebRemovedJobs } from '../api-types'
import { HttpError, readJson } from './http'
import { LISTABLE_JOBS } from './jobs-query'

export const BlockCompanySchema = z.object({ company: z.string().trim().min(1).max(200) })

export const RemoveBlockedJobsSchema = BlockCompanySchema.extend({
	/** Só esta vaga (a empresa corrigida para uma bloqueada); sem ele, todas as vagas da empresa na lista. */
	postId: z.string().min(1).max(200).optional(),
})

/**
 * A lista com a empresa bloqueada e a entrada que a bloqueia: se outra entrada já pega a empresa ("Itaú" já bloqueia
 * "Banco Itaú S.A."), a lista fica como está.
 */
export function withBlockedCompany(blockedCompanies: string[], company: string) {
	const existing = blockingCompany(company, blockedCompanies)
	if (existing) return { blockedCompanies, entry: existing }

	return { blockedCompanies: [...blockedCompanies, company], entry: company }
}

/** A lista sem a entrada que bloqueia a empresa, e a entrada tirada (`null` se a empresa não estava bloqueada). */
export function withoutBlockedCompany(blockedCompanies: string[], company: string) {
	const entry = blockingCompany(company, blockedCompanies)
	return { blockedCompanies: blockedCompanies.filter(item => item !== entry), entry }
}

/** As empresas que saíram da lista, normalizadas como o `blockedBy` dos posts descartados. */
export function unblockedCompanies(before: string[], after: string[]) {
	const kept = new Set(after.map(normalizeCompany))
	return before.map(normalizeCompany).filter((name): name is string => name !== null && !kept.has(name))
}

/** As vagas da lista que a empresa bloqueada pega. */
async function listedJobsOf(entry: string, postId?: string) {
	const jobs = await Job.find(
		{ ...LISTABLE_JOBS, ...(postId && { postId }), company: { $type: 'string' } },
		{ postId: 1, company: 1 },
	).lean<{ postId: string; company: string }[]>()

	return jobs.filter(job => blockingCompany(job.company, [entry])).map(job => job.postId)
}

/**
 * `POST /api/blocked-companies` com `{ company }` (a empresa como está na vaga): bloqueia a empresa, e as próximas vagas
 * dela são descartadas na coleta. Responde a entrada que a bloqueia e quantas vagas dela estão na lista, para o site
 * oferecer removê-las (a remoção não é automática).
 */
export async function blockCompany(req: Request, { logger }: { logger: Logger }) {
	const { company } = BlockCompanySchema.parse(await readJson(req))
	if (!normalizeCompany(company)) throw new HttpError(400, 'Informe o nome da empresa')

	const current = await readSettings('post-processing')
	const { blockedCompanies, entry } = withBlockedCompany(current.blockedCompanies, company)

	if (blockedCompanies !== current.blockedCompanies) {
		if (blockedCompanies.length > MAX_BLOCKED_COMPANIES) {
			throw new HttpError(400, `Já há ${MAX_BLOCKED_COMPANIES} empresas bloqueadas: desbloqueie alguma em Configurações`)
		}
		await updateSettings('post-processing', { blockedCompanies })
		logger.info({ company: entry }, 'Empresa bloqueada pelo site')
	}

	return Response.json({ company: entry, jobs: (await listedJobsOf(entry)).length } satisfies WebBlockedCompanyJobs)
}

/**
 * `DELETE /api/blocked-companies` com `{ company }` (a empresa como está na vaga): desbloqueia a empresa, tirando da
 * lista a entrada que a pega, e esquece os posts que ela descartou. As vagas tiradas da lista continuam fora.
 */
export async function unblockCompany(req: Request, { logger }: { logger: Logger }) {
	const { company } = BlockCompanySchema.parse(await readJson(req))

	const current = await readSettings('post-processing')
	const { blockedCompanies, entry } = withoutBlockedCompany(current.blockedCompanies, company)

	if (entry) {
		await updateSettings('post-processing', { blockedCompanies })
		await forgetUnblockedPosts(current.blockedCompanies, blockedCompanies, logger)
		logger.info({ company: entry }, 'Empresa desbloqueada pelo site')
	}

	return Response.json({ company: null, jobs: 0 } satisfies WebBlockedCompanyJobs)
}

/**
 * `GET /api/blocked-companies/jobs?company=`: a entrada da lista que bloqueia a empresa (`null` se não está bloqueada)
 * e quantas vagas dela estão na lista. O site pergunta depois de corrigir a empresa de uma vaga.
 */
export async function blockedCompanyJobs(req: Request) {
	const { company } = BlockCompanySchema.parse({ company: new URL(req.url).searchParams.get('company') ?? '' })
	const { blockedCompanies } = await readSettings('post-processing')
	const entry = blockingCompany(company, blockedCompanies)

	return Response.json({ company: entry, jobs: entry ? (await listedJobsOf(entry)).length : 0 } satisfies WebBlockedCompanyJobs)
}

/**
 * `POST /api/blocked-companies/remove-jobs` com `{ company, postId? }`: tira da lista as vagas da empresa bloqueada (ou
 * só a vaga `postId`), sem apagar, como o "não é vaga". Desbloquear a empresa não as traz de volta. Responde as vagas
 * removidas.
 */
export async function removeBlockedJobs(req: Request, { logger }: { logger: Logger }) {
	const { company, postId } = RemoveBlockedJobsSchema.parse(await readJson(req))
	const { blockedCompanies } = await readSettings('post-processing')

	const entry = blockingCompany(company, blockedCompanies)
	if (!entry) throw new HttpError(409, 'Esta empresa não está bloqueada')

	const postIds = await listedJobsOf(entry, postId)
	if (postIds.length > 0) {
		await Job.updateMany({ ...LISTABLE_JOBS, postId: { ...LISTABLE_JOBS.postId, $in: postIds } }, { $set: { blockedCompany: true } })
		logger.info({ company: entry, jobs: postIds.length }, 'Vagas de empresa bloqueada tiradas da lista pelo site')
	}

	return Response.json({ postIds } satisfies WebRemovedJobs)
}

/**
 * Esquece os posts descartados pelas empresas que saíram da lista: se um deles reaparecer numa coleta, passa pela IA e
 * pelos filtros de novo e entra na lista como vaga nova (o mesmo que o scraper faz com as listas de vagas adiadas).
 */
export async function forgetUnblockedPosts(before: string[], after: string[], logger: Logger) {
	const companies = unblockedCompanies(before, after)
	if (companies.length === 0) return

	const { deletedCount } = await SeenPost.deleteMany({ outcome: 'blocked-company', blockedBy: { $in: companies } })
	logger.info({ companies, posts: deletedCount }, 'Empresas desbloqueadas: os posts descartados por elas serão processados de novo')
}
