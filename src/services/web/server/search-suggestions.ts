import type { Message, Ollama } from 'ollama'
import { z } from 'zod'

import { MAX_SEARCH_TERMS, type ProfileSettings, type SeniorityLevel } from '@shared/contracts'
import type { Logger } from '@shared/logging'

import type { SearchSuggestions } from '../api-types'

/** Perfil com o mínimo para sugerir (ver `isProfileComplete`). */
export type SuggestionProfile = Pick<ProfileSettings, 'seniority' | 'languages'> & { area: string; targetRole: string }

// Termos de busca e palavras-chave para a pessoa revisar (no onboarding) antes de salvar nas configurações
export type { SearchSuggestions }

// Poucos de cada, para a revisão ser rápida e o filtro de palavras obrigatórias não ficar estreito demais
const MAX_SUGGESTED_TERMS = Math.min(5, MAX_SEARCH_TERMS)
const MAX_SUGGESTED_KEYWORDS = 12
// Os limites dos schemas das configurações (`ScraperSettingsSchema` e `PostProcessingSettingsSchema`)
const TERM_MAX_LENGTH = 100
const KEYWORD_MAX_LENGTH = 50

// Palavras do cargo-alvo que não entram nas obrigatórias ("Analista de Marketing" → "analista", "marketing")
const ROLE_STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'of', 'and', 'in', 'for', 'the'])

/**
 * Palavras que aparecem em vagas de qualquer área e, sozinhas, não dizem a área: cargos genéricos, adjetivos e palavras
 * de rotina. Como basta a vaga citar uma obrigatória, elas deixavam passar vagas de fora ("Advogado de direito digital"
 * num perfil de marketing). Saem das obrigatórias quando vêm sozinhas; num termo composto ("marketing digital") ficam.
 * Sem acentos, comparadas com `genericKey`.
 */
const GENERIC_KEYWORDS = new Set([
	// Cargos e níveis
	...['analista', 'assistente', 'auxiliar', 'coordenador', 'coordenadora', 'gerente', 'supervisor', 'supervisora'],
	...['especialista', 'consultor', 'consultora', 'tecnico', 'tecnica', 'diretor', 'diretora', 'lider', 'lideranca'],
	...['estagiario', 'estagiaria', 'estagio', 'trainee', 'aprendiz', 'profissional', 'colaborador', 'executivo'],
	...['analyst', 'assistant', 'coordinator', 'manager', 'specialist', 'consultant', 'technician'],
	...['director', 'lead', 'leader', 'intern', 'internship', 'associate', 'officer', 'executive', 'professional'],
	...['asistente', 'coordinador', 'coordinadora', 'practicante'],
	// Adjetivos e palavras de rotina
	...['digital', 'dados', 'analise', 'analises', 'plano', 'planejamento', 'estrategia', 'gestao', 'projeto', 'projetos'],
	...['processos', 'resultados', 'relatorios', 'indicadores', 'organizacao', 'atendimento', 'negocios'],
	...['data', 'analysis', 'plan', 'planning', 'strategy', 'management', 'project', 'projects', 'reports', 'business'],
	...['datos', 'analisis', 'gestion', 'proyecto', 'proyectos'],
])

/** Formato tolerante para ler a resposta; o schema enviado ao modelo é o mesmo, sem os padrões. */
const SuggestionsSchema = z.object({
	searchTerms: z.array(z.string()).default([]),
	requiredKeywords: z.array(z.string()).default([]),
	excludedKeywords: z.array(z.string()).default([]),
})

const OUTPUT_FORMAT = z.toJSONSchema(
	z.object({ searchTerms: z.array(z.string()), requiredKeywords: z.array(z.string()), excludedKeywords: z.array(z.string()) }),
)

const SENIORITY_NAMES: Record<SeniorityLevel, string> = {
	intern: 'intern',
	junior: 'junior',
	mid: 'mid-level',
	senior: 'senior',
	lead: 'lead',
}

// Prompt em inglês, como os outros: modelos pequenos seguem melhor. Os valores saem nos idiomas do perfil.
const SYSTEM_PROMPT = `You help a job seeker set up a tool that searches LinkedIn POSTS (not the jobs board) for job openings and filters them by keywords.

Return JSON with:
- searchTerms: ${MAX_SUGGESTED_TERMS} or fewer short search phrases (1 to 4 words) that recruiters write in LinkedIn posts about openings for this role: the role title and its common variations and synonyms. Write them in the person's languages, as people write them in posts (e.g. "Analista de Marketing", "Social Media"). No hashtags, no quotes, no boolean operators.
- requiredKeywords: up to ${MAX_SUGGESTED_KEYWORDS} single words or short terms (1 or 2 words) that the TITLE or the listed requirements of a relevant opening would contain and that, ALONE, identify this field or function: the field itself and its core tools, methods or licenses (e.g. for digital marketing: "marketing", "tráfego pago", "seo", "google ads"). An opening is kept if it cites ANY ONE of them, so a word that also appears in openings of other fields lets wrong openings in. Never use generic job titles (analyst, assistant, coordinator, manager, specialist), generic adjectives (digital) or routine words of any job (data, analysis, plan, strategy, management, projects, reports). Lowercase.
- excludedKeywords: up to 5 words that clearly mark openings of a neighbouring role the person does NOT want (e.g. for a nurse: "veterinário"). Never a word that also appears in a relevant title. [] if unsure. Lowercase.

Never repeat an item, and never include seniority words (junior, pleno, senior) or work modes (remote, hybrid) in any list.`

/**
 * Sugere termos de busca e palavras-chave a partir do cargo-alvo e da área do perfil, para a pessoa revisar. O
 * cargo-alvo é sempre o primeiro termo e as palavras dele que dizem a área, as primeiras obrigatórias; se a IA falhar,
 * só eles são sugeridos.
 */
export async function suggestSearchSettings(
	ai: { ollama: Ollama; model: string },
	profile: SuggestionProfile,
	log: Logger,
): Promise<SearchSuggestions> {
	try {
		const response = await ai.ollama.chat({
			model: ai.model,
			messages: buildSuggestionMessages(profile),
			format: OUTPUT_FORMAT,
			options: { temperature: 0.2 },
		})

		return { ...normalizeSuggestions(SuggestionsSchema.parse(JSON.parse(response.message.content)), profile), fromAi: true }
	} catch (error) {
		log.warn({ err: error }, 'Falha ao pedir à IA os termos de busca; sugerindo só o cargo-alvo')
		return { ...normalizeSuggestions({ searchTerms: [], requiredKeywords: [], excludedKeywords: [] }, profile), fromAi: false }
	}
}

export function buildSuggestionMessages(profile: SuggestionProfile): Message[] {
	const content = [
		`Field: ${profile.area}`,
		`Target role: ${profile.targetRole}`,
		profile.seniority && `Seniority: ${SENIORITY_NAMES[profile.seniority]}`,
		`Languages (ISO 639-1): ${profile.languages.join(', ')}`,
	]
		.filter(Boolean)
		.join('\n')

	return [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content },
	]
}

/**
 * Deixa a resposta dentro das regras das configurações: sem vazios, repetidos (ignorando caixa) ou itens longos demais,
 * com o cargo-alvo como primeiro termo e sem palavra excluída que também seja obrigatória. As palavras do cargo-alvo
 * abrem as obrigatórias: o modelo às vezes as esquece, e aí a vaga com o próprio cargo seria descartada. Palavras
 * genéricas (`GENERIC_KEYWORDS`) sozinhas saem das obrigatórias.
 */
export function normalizeSuggestions(raw: z.output<typeof SuggestionsSchema>, profile: SuggestionProfile) {
	const searchTerms = uniqueItems([profile.targetRole, ...raw.searchTerms], TERM_MAX_LENGTH).slice(0, MAX_SUGGESTED_TERMS)
	const requiredKeywords = uniqueItems([...roleKeywords(profile.targetRole), ...raw.requiredKeywords], KEYWORD_MAX_LENGTH, true)
		.filter(keyword => !GENERIC_KEYWORDS.has(genericKey(keyword)))
		.slice(0, MAX_SUGGESTED_KEYWORDS)
	const excludedKeywords = uniqueItems(raw.excludedKeywords, KEYWORD_MAX_LENGTH, true)
		.filter(keyword => !requiredKeywords.includes(keyword))
		.slice(0, 5)

	return { searchTerms, requiredKeywords, excludedKeywords }
}

/**
 * As palavras do cargo-alvo que dizem a área ("Analista de Marketing Digital" → "marketing"). Se nenhuma diz
 * ("Analista de Dados"), vai o cargo inteiro, que o filtro compara como sequência de até 3 palavras.
 */
function roleKeywords(targetRole: string) {
	const words = targetRole.split(/[\s/,()]+/).filter(word => word.length > 1 && !ROLE_STOPWORDS.has(word.toLowerCase()))
	const specific = words.filter(word => !GENERIC_KEYWORDS.has(genericKey(word)))
	if (specific.length > 0) return specific

	const role = targetRole.trim()
	return role.split(/\s+/).length <= 3 ? [role] : []
}

/** Sem acentos e em minúsculas, como em `GENERIC_KEYWORDS`. */
function genericKey(keyword: string) {
	return keyword
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
}

function uniqueItems(items: string[], maxLength: number, lowercase = false) {
	const seen = new Set<string>()

	return items
		.map(item => item.trim().replace(/^["'#]+|["']+$/g, ''))
		.map(item => (lowercase ? item.toLowerCase() : item))
		.filter(item => {
			const key = item.toLowerCase()
			if (!item || item.length > maxLength || seen.has(key)) return false
			seen.add(key)
			return true
		})
}
