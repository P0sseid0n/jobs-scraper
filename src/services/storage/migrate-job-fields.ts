/**
 * Atualiza as vagas salvas para o formato atual dos campos (pode rodar mais de uma vez):
 * - `necessary_knowledge` e `recruiter_email` viram `necessaryKnowledge` e `recruiterEmail`;
 * - `link` se divide em `postLink` (o post no LinkedIn) e `applyLink` (o site de candidatura);
 * - `sourcePostUrl` (vagas de posts com várias) vira o `postLink`.
 * Uso: bun db:migrate-jobs
 */
import { loadConfig, mongoEnv } from '@shared/config'
import { connectDatabase, disconnectDatabase, Job } from '@shared/database'
import { createLogger } from '@shared/logging'

import { legacyLinkFields } from './legacy-job-links'

const logger = createLogger('migrate-jobs')
const { MONGO_URL } = loadConfig(mongoEnv)

await connectDatabase(MONGO_URL, logger)

// Direto na coleção: o modelo não conhece mais os campos antigos
const jobs = Job.collection

const renamed = await jobs.updateMany(
	{ $or: [{ necessary_knowledge: { $exists: true } }, { recruiter_email: { $exists: true } }] },
	{ $rename: { necessary_knowledge: 'necessaryKnowledge', recruiter_email: 'recruiterEmail' } },
)

let split = 0
for await (const doc of jobs.find({ $or: [{ link: { $exists: true } }, { sourcePostUrl: { $exists: true } }] })) {
	const { postLink, applyLink } = legacyLinkFields(doc)

	await jobs.updateOne({ _id: doc._id }, { $set: { postLink, applyLink }, $unset: { link: '', sourcePostUrl: '' } })
	split++
}

logger.info({ renamed: renamed.modifiedCount, split }, '✅ Vagas migradas')
await disconnectDatabase()
