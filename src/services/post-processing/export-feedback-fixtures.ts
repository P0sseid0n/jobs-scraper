/**
 * Exporta as correções feitas pelo site (coleção `extraction_feedback`) como casos de avaliação versionados, sem
 * dados pessoais (`fixtures/extraction-cases.json`). Pode rodar mais de uma vez: o mesmo post é atualizado.
 * Os casos novos saem com `anonymized: false`: reescreva o texto deles à mão e marque `anonymized: true` antes do
 * commit (o teste das fixtures cobra isso). Um caso já marcado não é substituído.
 * Uso: bun eval:export-fixtures
 */
import { loadConfig, mongoEnv } from '@shared/config'
import { connectDatabase, disconnectDatabase, ExtractionFeedback } from '@shared/database'
import { createLogger } from '@shared/logging'

import { ExtractionCaseSchema, latestPerPost } from './extraction-eval'
import { anonymizeCase, DEFAULT_FIXTURES_PATH, findPersonalData, mergeFixtures, readFixtures } from './feedback-fixtures'

const logger = createLogger('export-fixtures')
const { MONGO_URL } = loadConfig(mongoEnv)

await connectDatabase(MONGO_URL, logger)
const docs = await ExtractionFeedback.find().sort({ createdAt: 1 }).lean()
await disconnectDatabase()

const exported = latestPerPost(docs.map(doc => ExtractionCaseSchema.parse(doc))).map(anonymizeCase)
const leaks = exported.filter(item => findPersonalData(item).length > 0)
if (leaks.length > 0) {
	logger.fatal({ postIds: leaks.map(item => item.postId) }, 'Casos ainda com dados pessoais depois da anonimização; nada foi salvo')
	process.exit(1)
}

const { fixtures, kept } = mergeFixtures(await readFixtures(DEFAULT_FIXTURES_PATH), exported)
await Bun.write(DEFAULT_FIXTURES_PATH, `${JSON.stringify(fixtures, null, '\t')}\n`)

logger.info(
	{
		exported: exported.length - kept.length,
		kept: kept.length,
		toRewrite: fixtures.filter(item => !item.anonymized).length,
		total: fixtures.length,
		file: DEFAULT_FIXTURES_PATH,
	},
	'✅ Casos exportados; reescreva os que têm anonymized: false antes do commit',
)
