import { CV_FORM_MAX_ITEMS, type CvForm, type CvFormSection, type CvFormSectionKind } from '@shared/contracts'

/** Nome de cada seção no formulário (os títulos do PDF ficam no cv-updater, `FORM_SECTION_TITLES`). */
export const SECTION_LABELS: Record<CvFormSectionKind, string> = {
	summary: 'Apresentação',
	skills: 'Habilidades',
	experience: 'Experiência profissional',
	education: 'Formação',
	certifications: 'Certificações e cursos',
	languages: 'Idiomas',
	projects: 'Projetos',
}

type EntryOf<K extends CvFormSectionKind> = Extract<CvFormSection, { kind: K; entries: unknown[] }>['entries'][number]

/** Um item vazio de cada lista, para o botão de adicionar. */
export const EMPTY_ENTRY = {
	experience: (): EntryOf<'experience'> => ({ role: '', company: '', period: '', bullets: [] }),
	education: (): EntryOf<'education'> => ({ course: '', institution: '', period: '' }),
	certifications: (): EntryOf<'certifications'> => ({ name: '', issuer: '', year: '' }),
	languages: (): EntryOf<'languages'> => ({ language: '', level: '' }),
	projects: (): EntryOf<'projects'> => ({ name: '', url: '', description: '', technologies: [] }),
	skillGroup: () => ({ category: '', items: [] as string[] }),
}

/** A seção nova, já com um item para preencher. */
export function emptySection(kind: CvFormSectionKind): CvFormSection {
	switch (kind) {
		case 'summary':
			return { kind, text: '' }
		case 'skills':
			return { kind, groups: [EMPTY_ENTRY.skillGroup()] }
		default:
			return { kind, entries: [EMPTY_ENTRY[kind]()] } as CvFormSection
	}
}

/** O formulário de quem começa do zero: as seções mais comuns, na ordem do modelo neutro. */
export function emptyForm(): CvForm {
	return {
		contact: { name: '', headline: '', location: '', email: '', phone: '', links: [] },
		sections: (['summary', 'skills', 'experience', 'education'] as const).map(emptySection),
	}
}

/** A lista com o item `index` trocado de lugar com o vizinho (`-1`: sobe; `1`: desce). */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1) {
	const target = index + delta
	if (target < 0 || target >= items.length) return [...items]

	const next = [...items]
	;[next[index], next[target]] = [next[target]!, next[index]!]
	return next
}

const lines = (values: readonly string[]) => values.map(value => value.trim()).filter(Boolean)

const filled = (entry: Record<string, string | string[]>) =>
	Object.values(entry).some(value => (Array.isArray(value) ? lines(value).length > 0 : value.trim() !== ''))

/** O formulário como vai para o servidor: textos aparados, sem linhas em branco nem itens vazios. */
export function cleanForm(form: CvForm): CvForm {
	return {
		contact: { ...form.contact, links: lines(form.contact.links) },
		sections: form.sections.map((section): CvFormSection => {
			switch (section.kind) {
				case 'summary':
					return { ...section, text: section.text.trim() }
				case 'skills':
					return {
						...section,
						groups: section.groups.map(group => ({ ...group, items: lines(group.items) })).filter(group => group.items.length),
					}
				case 'experience':
					return {
						...section,
						entries: section.entries.map(entry => ({ ...entry, bullets: lines(entry.bullets) })).filter(filled),
					}
				default:
					return { ...section, entries: (section.entries as Record<string, string | string[]>[]).filter(filled) } as CvFormSection
			}
		}),
	}
}

/**
 * Os problemas que impedem salvar, como os erros da API: caminho do campo → mensagem. A validação do cv-updater
 * pede experiência ou formação; avisar aqui evita a volta até ele.
 */
export function formProblems(form: CvForm) {
	const problems: Record<string, string> = {}
	const clean = cleanForm(form)

	if (!clean.contact.name.trim()) problems['contact.name'] = 'Preencha o nome.'
	if (clean.contact.links.length > CV_FORM_MAX_ITEMS) problems['contact.links'] = `No máximo ${CV_FORM_MAX_ITEMS} links.`

	const hasBase = clean.sections.some(
		section => (section.kind === 'experience' || section.kind === 'education') && section.entries.length,
	)
	if (!hasBase) problems.sections = 'Preencha pelo menos uma experiência ou uma formação.'

	// No formulário como está (não no limpo), para o caminho apontar o item da tela
	form.sections.forEach((section, index) => {
		if (section.kind !== 'experience') return
		section.entries.forEach((entry, entryIndex) => {
			if (lines(entry.bullets).length > CV_FORM_MAX_ITEMS) {
				problems[`sections.${index}.entries.${entryIndex}.bullets`] = `No máximo ${CV_FORM_MAX_ITEMS} tópicos.`
			}
		})
	})

	return problems
}

/** Se dois formulários têm o mesmo conteúdo (para saber se há mudanças não validadas). */
export function sameForm(a: CvForm, b: CvForm) {
	return JSON.stringify(cleanForm(a)) === JSON.stringify(cleanForm(b))
}
