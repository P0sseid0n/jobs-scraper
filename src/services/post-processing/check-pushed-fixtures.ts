/**
 * Hook de pre-push (`.husky/pre-push`): bloqueia o push se algum commit enviado tem, em `fixtures/extraction-cases.json`,
 * um caso com o texto ainda não reescrito à mão (`anonymized: false`) ou com dados pessoais. Confere todo commit
 * enviado que mexe no arquivo, não só o último: o histórico também fica público.
 * Lê da entrada as linhas que o git passa ao hook: `<ref local> <sha local> <ref remota> <sha remoto>`.
 */
import { relative } from 'node:path'

import { ExtractionCaseSchema } from './extraction-eval'
import { DEFAULT_FIXTURES_PATH, fixtureProblems } from './feedback-fixtures'

const NO_COMMIT = /^0+$/
const fixturesPath = relative(git('rev-parse', '--show-toplevel'), DEFAULT_FIXTURES_PATH).replaceAll('\\', '/')

function git(...args: string[]) {
	const result = Bun.spawnSync(['git', ...args])
	if (!result.success) throw new Error(`git ${args.join(' ')}: ${result.stderr.toString().trim()}`)
	return result.stdout.toString().trim()
}

/** Commits enviados que mexem nas fixtures; numa branch nova, os que nenhuma branch remota tem. */
function commitsTouchingFixtures(localSha: string, remoteSha: string) {
	const range = NO_COMMIT.test(remoteSha) ? [localSha, '--not', '--remotes'] : [`${remoteSha}..${localSha}`]
	return git('rev-list', ...range, '--', fixturesPath)
		.split('\n')
		.filter(Boolean)
}

function problemsAt(sha: string) {
	const file = Bun.spawnSync(['git', 'show', `${sha}:${fixturesPath}`])
	// Commit que apaga o arquivo
	if (!file.success) return []

	const parsed = ExtractionCaseSchema.array().safeParse(JSON.parse(file.stdout.toString()))
	if (!parsed.success) return [{ postId: '(arquivo inteiro)', problems: ['formato inválido'] }]
	return fixtureProblems(parsed.data)
}

const commits = new Set<string>()
for (const line of (await Bun.stdin.text()).split('\n')) {
	const [, localSha, , remoteSha] = line.trim().split(/\s+/)
	// Push que apaga a branch remota: nada é enviado
	if (!localSha || !remoteSha || NO_COMMIT.test(localSha)) continue
	for (const sha of commitsTouchingFixtures(localSha, remoteSha)) commits.add(sha)
}

let blocked = false
for (const sha of commits) {
	for (const { postId, problems } of problemsAt(sha)) {
		blocked = true
		console.error(`✗ ${sha.slice(0, 7)} ${postId}: ${problems.join(', ')}`)
	}
}

if (blocked) {
	console.error(`
Push bloqueado: ${fixturesPath} tem casos com o texto real do post (o repositório é público).
Reescreva o texto à mão e marque "anonymized": true (veja src/services/post-processing/README.md).
Se o problema está num commit antigo, corrija o histórico antes de enviar. Para enviar mesmo assim: git push --no-verify`)
	process.exit(1)
}
