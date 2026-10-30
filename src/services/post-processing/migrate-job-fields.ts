/**
 * Atualiza as vagas salvas para o formato atual dos campos (pode rodar mais de uma vez):
 * - `necessary_knowledge` e `recruiter_email` viram `necessaryKnowledge` e `recruiterEmail`;
 * - `link` se divide em `postLink` (o post no LinkedIn) e `applyLink` (o site de candidatura);
 * - `sourcePostUrl` (vagas de posts com várias) vira o `postLink`;
 * - `aiJobConfidence` sai (das vagas, das correções e das configurações) e entra `extractionChecks`. Das vagas antigas
 *   só dá para refazer o check do cargo: os outros dependem da resposta original da IA, que não foi guardada;
 * - o `recruiterEmail` que não é e-mail (o telefone que o modelo devolvia no campo) vira `null`.
 * Uso: bun db:migrate-jobs
 */
import { loadConfig, mongoEnv } from '@shared/config'
import { MailAddressSchema } from '@shared/contracts'
import { connectDatabase, disconnectDatabase, ExtractionFeedback, Job, Settings } from '@shared/database'
import { createLogger } from '@shared/logging'

import { legacyLinkFields } from './legacy-job-links'
import { titleInPost } from './model-response'

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

let checked = 0
for await (const doc of jobs.find({ extractionChecks: { $exists: false } })) {
	// Numa vaga corrigida, o cargo que a IA extraiu fica em `aiExtraction`
	const title: unknown = doc.aiExtraction?.title ?? doc.title
	const extractionChecks = typeof title === 'string' && !titleInPost(title, String(doc.rawContent ?? '')) ? ['title'] : []

	await jobs.updateOne({ _id: doc._id }, { $set: { extractionChecks }, $unset: { aiJobConfidence: '' } })
	checked++
}

// O mailer recusa o envio para eles, e o site oferecia o contato por e-mail
let invalidEmails = 0
for await (const doc of jobs.find({ recruiterEmail: { $type: 'string' } }, { projection: { recruiterEmail: 1 } })) {
	if (MailAddressSchema.safeParse(doc.recruiterEmail).success) continue

	await jobs.updateOne({ _id: doc._id }, { $set: { recruiterEmail: null } })
	invalidEmails++
}

await ExtractionFeedback.collection.updateMany(
	{ 'aiOutput.aiJobConfidence': { $exists: true } },
	{ $unset: { 'aiOutput.aiJobConfidence': '' } },
)
await Settings.collection.updateMany({ 'values.minJobConfidence': { $exists: true } }, { $unset: { 'values.minJobConfidence': '' } })

logger.info({ renamed: renamed.modifiedCount, split, checked, invalidEmails }, '✅ Vagas migradas')
await disconnectDatabase()
