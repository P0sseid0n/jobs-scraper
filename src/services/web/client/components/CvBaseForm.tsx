import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import {
	CV_FORM_DEFAULT_TITLES,
	CV_FORM_MAX_ITEMS,
	CV_FORM_SECTIONS,
	CV_FORM_TOOLS_LABELS,
	type CvForm,
	type CvFormSection,
	type CvFormSectionKind,
} from '@shared/contracts'

import {
	cleanForm,
	EMPTY_ENTRY,
	emptySection,
	formProblems,
	formSteps,
	moveItem,
	problemStep,
	SECTION_LABELS,
	stepProblems,
	type FormStep,
} from '../lib/cv-form'
import { cx } from '../lib/cx'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { DIALOG } from './ui/Dialog'
import { FieldError, FieldHelp, FieldLabel } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { field, Input } from './ui/Input'
import { KeywordInput } from './ui/KeywordInput'
import { SelectMenu } from './ui/SelectMenu'
import { LABEL } from './ui/text'

type Props = {
	form: CvForm
	/** Erros da API, com o caminho do campo sem o prefixo `form.` (os do próprio formulário vêm de `formProblems`). */
	serverProblems: Record<string, string>
	submitting: boolean
	onChange: (form: CvForm) => void
	onSubmit: () => void
	onClose: () => void
}

/** Os itens da seção que viram caixas (grupos de habilidades ou entradas); a apresentação não tem. */
function itemsOf(section: CvFormSection): unknown[] {
	if ('groups' in section) return section.groups
	return 'entries' in section ? section.entries : []
}

/** Uma lista editável: o item na posição e as funções que a seção usa para mexer nela. */
type ListControls = { move: (index: number, delta: -1 | 1) => void; remove: (index: number) => void; count: number }

/** Itens adicionados pelo nome (ex.: "experiência") nos botões e rótulos. */
const ENTRY_NAMES: Record<Exclude<CvFormSectionKind, 'summary'>, string> = {
	skills: 'grupo',
	experience: 'experiência',
	education: 'formação',
	certifications: 'certificação ou curso',
	languages: 'idioma',
	projects: 'projeto',
}

/** Plural dos itens, para o resumo da revisão ("3 experiências"). */
const ENTRY_PLURALS: Record<Exclude<CvFormSectionKind, 'summary'>, string> = {
	skills: 'grupos',
	experience: 'experiências',
	education: 'formações',
	certifications: 'certificações ou cursos',
	languages: 'idiomas',
	projects: 'projetos',
}

const STEP_NAMES: Record<FormStep, string> = { contact: 'Contato', sections: 'Seções', review: 'Revisar', ...SECTION_LABELS }

/** O que cada etapa pede, abaixo do título dela. */
const STEP_HELP: Partial<Record<FormStep, string>> = {
	contact: 'Os dados do topo do currículo. Só o nome é obrigatório.',
	sections: 'Escolha as seções e a ordem em que aparecem no PDF. Cada seção incluída vira uma etapa.',
	review: 'Confira o que entra no currículo. O cv-updater gera o PDF para você ver antes de ativar.',
}

/**
 * O currículo base em formulário, para quem não sabe LaTeX, numa modal com etapas: contato, escolha das seções, uma
 * etapa por seção e a revisão. O cv-updater gera o `.tex` a partir dos dados (`resume/latex-from-form.ts`). Controlado:
 * cada mudança chega em `onChange` com o formulário inteiro, então fechar a modal não perde o que foi preenchido.
 */
export function CvBaseFormDialog({ form, serverProblems, submitting, onChange, onSubmit, onClose }: Props) {
	const id = useId()
	const ref = useRef<HTMLDialogElement>(null)
	const body = useRef<HTMLDivElement>(null)
	const [step, setStep] = useState<FormStep>('contact')
	/** Etapas em que a pessoa já tentou avançar: só nelas os problemas aparecem, para não acusar o que vem depois. */
	const [tried, setTried] = useState<ReadonlySet<FormStep>>(new Set())
	const missing = CV_FORM_SECTIONS.filter(kind => !form.sections.some(section => section.kind === kind))

	const steps = formSteps(form)
	const index = Math.max(steps.indexOf(step), 0)
	const current = steps[index]!
	const allProblems = { ...serverProblems, ...formProblems(form) }
	const problems = Object.fromEntries(
		Object.entries(allProblems).filter(([path]) => current === 'review' || tried.has(problemStep(path, form))),
	)

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	// Os erros do servidor (ao gerar) levam à etapa do primeiro campo errado
	useEffect(() => {
		const [first] = Object.keys(serverProblems)
		if (first) goTo(problemStep(first, form))
	}, [serverProblems])

	function goTo(next: FormStep) {
		setStep(next)
		body.current?.scrollTo({ top: 0 })
	}

	/** Avança se a etapa não tem problemas; o "falta experiência ou formação" só pesa na revisão. */
	function next() {
		const { sections: _, ...blocking } = stepProblems(current, formProblems(form), form)
		if (Object.keys(blocking).length) {
			setTried(previous => new Set(previous).add(current))
			return
		}
		goTo(steps[index + 1]!)
	}

	/** Aplica a mudança numa cópia, como no formulário de configurações. */
	function update(change: (draft: CvForm) => void) {
		const draft = structuredClone(form)
		change(draft)
		onChange(draft)
	}

	const updateSection = (index: number, change: (section: CvFormSection) => void) => update(draft => change(draft.sections[index]!))

	function renderContact() {
		const contact = form.contact
		const text = (key: Exclude<keyof CvForm['contact'], 'links'>, label: string, placeholder: string, autoComplete: string) => (
			<TextField
				id={`${id}-contact-${key}`}
				label={label}
				value={contact[key]}
				placeholder={placeholder}
				autoComplete={autoComplete}
				error={problems[`contact.${key}`]}
				onChange={value =>
					update(draft => {
						draft.contact[key] = value
					})
				}
			/>
		)

		return (
			<div className="grid gap-4 md:grid-cols-2">
				{text('name', 'Nome', 'Maria Souza', 'name')}
				{text('headline', 'Cargo ou título', 'Enfermeira | COREN-SP 000.000', 'organization-title')}
				{text('location', 'Cidade', 'São Paulo, SP', 'address-level2')}
				{text('email', 'E-mail', 'maria@example.com', 'email')}
				{text('phone', 'Telefone', '(11) 90000-0000', 'tel')}
				<LinesField
					id={`${id}-contact-links`}
					label="Links"
					help="Um por linha: LinkedIn, portfólio, site. No PDF, aparecem sem o https://."
					rows={2}
					value={contact.links}
					error={problems['contact.links']}
					onChange={links =>
						update(draft => {
							draft.contact.links = links
						})
					}
				/>
			</div>
		)
	}

	function renderSection(section: CvFormSection, index: number) {
		const sectionId = `${id}-section-${section.kind}`
		const at = (path: string) => problems[`sections.${index}.${path}`]
		const list = (count: number): ListControls => ({
			count,
			move: (item, delta) =>
				updateSection(index, draft => {
					const items = itemsOf(draft)
					items.splice(0, items.length, ...moveItem(items, item, delta))
				}),
			remove: item => updateSection(index, draft => void itemsOf(draft).splice(item, 1)),
		})

		let body: ReactNode
		switch (section.kind) {
			case 'summary':
				body = (
					<TextField
						id={`${sectionId}-text`}
						label="Texto"
						labelHidden
						multiline
						rows={4}
						value={section.text}
						placeholder="Quem você é, a experiência principal e no que é forte, em duas ou três frases."
						help="O cv-updater reescreve a apresentação para cada vaga."
						onChange={value =>
							updateSection(index, draft => {
								;(draft as typeof section).text = value
							})
						}
					/>
				)
				break
			case 'skills':
				body = (
					<EntryList
						name={ENTRY_NAMES.skills}
						controls={list(section.groups.length)}
						onAdd={() => updateSection(index, draft => void (draft as typeof section).groups.push(EMPTY_ENTRY.skillGroup()))}
					>
						{section.groups.map((group, item) => {
							const set = <F extends keyof typeof group>(key: F, value: (typeof group)[F]) =>
								updateSection(index, draft => {
									;(draft as typeof section).groups[item]![key] = value
								})
							const itemsId = `${sectionId}-${item}-items`

							return (
								<div key={item} className="flex flex-col gap-4">
									<TextField
										id={`${sectionId}-${item}-category`}
										label="Categoria"
										value={group.category}
										placeholder="Assistência, Gestão, Sistemas..."
										onChange={value => set('category', value)}
									/>
									<div className="flex flex-col gap-1.5">
										<FieldLabel htmlFor={itemsId}>Itens</FieldLabel>
										<KeywordInput
											id={itemsId}
											value={group.items}
											max={CV_FORM_MAX_ITEMS}
											maxLength={100}
											keepCase
											onChange={items => set('items', items)}
										/>
									</div>
								</div>
							)
						})}
					</EntryList>
				)
				break
			case 'experience':
				body = (
					<EntryList
						name={ENTRY_NAMES.experience}
						controls={list(section.entries.length)}
						onAdd={() => updateSection(index, draft => void (draft as typeof section).entries.push(EMPTY_ENTRY.experience()))}
					>
						{section.entries.map((entry, item) => {
							const set = <F extends keyof typeof entry>(key: F, value: (typeof entry)[F]) =>
								updateSection(index, draft => {
									;(draft as typeof section).entries[item]![key] = value
								})
							const prefix = `${sectionId}-${item}`

							return (
								<div key={item} className="grid gap-4 md:grid-cols-2">
									<TextField
										id={`${prefix}-role`}
										label="Cargo"
										value={entry.role}
										placeholder="Enfermeira Assistencial"
										onChange={value => set('role', value)}
									/>
									<TextField
										id={`${prefix}-company`}
										label="Empresa"
										value={entry.company}
										placeholder="Hospital Exemplo"
										onChange={value => set('company', value)}
									/>
									<TextField
										id={`${prefix}-period`}
										label="Período"
										value={entry.period}
										placeholder="Março 2021 - Presente"
										onChange={value => set('period', value)}
									/>
									<LinesField
										id={`${prefix}-bullets`}
										label="Tópicos"
										help="Um por linha: o que você fez e os resultados. O cv-updater reordena pela vaga."
										rows={4}
										value={entry.bullets}
										error={at(`entries.${item}.bullets`)}
										onChange={bullets => set('bullets', bullets)}
									/>
								</div>
							)
						})}
					</EntryList>
				)
				break
			case 'education':
				body = (
					<EntryList
						name={ENTRY_NAMES.education}
						controls={list(section.entries.length)}
						onAdd={() => updateSection(index, draft => void (draft as typeof section).entries.push(EMPTY_ENTRY.education()))}
					>
						{section.entries.map((entry, item) => {
							const set = <F extends keyof typeof entry>(key: F, value: (typeof entry)[F]) =>
								updateSection(index, draft => {
									;(draft as typeof section).entries[item]![key] = value
								})
							const prefix = `${sectionId}-${item}`

							return (
								<div key={item} className="grid gap-4 md:grid-cols-3">
									<TextField
										id={`${prefix}-course`}
										label="Curso"
										value={entry.course}
										placeholder="Bacharelado em Enfermagem"
										onChange={value => set('course', value)}
									/>
									<TextField
										id={`${prefix}-institution`}
										label="Instituição"
										value={entry.institution}
										placeholder="Universidade Exemplo"
										onChange={value => set('institution', value)}
									/>
									<TextField
										id={`${prefix}-period`}
										label="Período"
										value={entry.period}
										placeholder="2014 - 2018"
										onChange={value => set('period', value)}
									/>
								</div>
							)
						})}
					</EntryList>
				)
				break
			case 'certifications':
				body = (
					<EntryList
						name={ENTRY_NAMES.certifications}
						controls={list(section.entries.length)}
						onAdd={() =>
							updateSection(index, draft => void (draft as typeof section).entries.push(EMPTY_ENTRY.certifications()))
						}
					>
						{section.entries.map((entry, item) => {
							const set = <F extends keyof typeof entry>(key: F, value: (typeof entry)[F]) =>
								updateSection(index, draft => {
									;(draft as typeof section).entries[item]![key] = value
								})
							const prefix = `${sectionId}-${item}`

							return (
								<div key={item} className="grid gap-4 md:grid-cols-3">
									<TextField
										id={`${prefix}-name`}
										label="Nome"
										value={entry.name}
										placeholder="Suporte Avançado de Vida (ACLS)"
										onChange={value => set('name', value)}
									/>
									<TextField
										id={`${prefix}-issuer`}
										label="Instituição"
										value={entry.issuer}
										placeholder="opcional"
										onChange={value => set('issuer', value)}
									/>
									<TextField
										id={`${prefix}-year`}
										label="Ano"
										value={entry.year}
										placeholder="2023"
										onChange={value => set('year', value)}
									/>
								</div>
							)
						})}
					</EntryList>
				)
				break
			case 'languages':
				body = (
					<EntryList
						name={ENTRY_NAMES.languages}
						controls={list(section.entries.length)}
						onAdd={() => updateSection(index, draft => void (draft as typeof section).entries.push(EMPTY_ENTRY.languages()))}
					>
						{section.entries.map((entry, item) => {
							const set = <F extends keyof typeof entry>(key: F, value: (typeof entry)[F]) =>
								updateSection(index, draft => {
									;(draft as typeof section).entries[item]![key] = value
								})
							const prefix = `${sectionId}-${item}`

							return (
								<div key={item} className="grid gap-4 md:grid-cols-2">
									<TextField
										id={`${prefix}-language`}
										label="Idioma"
										value={entry.language}
										placeholder="Inglês"
										onChange={value => set('language', value)}
									/>
									<TextField
										id={`${prefix}-level`}
										label="Nível"
										value={entry.level}
										placeholder="intermediário"
										onChange={value => set('level', value)}
									/>
								</div>
							)
						})}
					</EntryList>
				)
				break
			case 'projects':
				body = (
					<EntryList
						name={ENTRY_NAMES.projects}
						controls={list(section.entries.length)}
						onAdd={() => updateSection(index, draft => void (draft as typeof section).entries.push(EMPTY_ENTRY.projects()))}
					>
						{section.entries.map((entry, item) => {
							const set = <F extends keyof typeof entry>(key: F, value: (typeof entry)[F]) =>
								updateSection(index, draft => {
									;(draft as typeof section).entries[item]![key] = value
								})
							const prefix = `${sectionId}-${item}`
							const toolsId = `${prefix}-technologies`

							return (
								<div key={item} className="grid gap-4 md:grid-cols-2">
									<TextField id={`${prefix}-name`} label="Nome" value={entry.name} onChange={value => set('name', value)} />
									<TextField
										id={`${prefix}-url`}
										label="Link"
										value={entry.url}
										placeholder="opcional"
										onChange={value => set('url', value)}
									/>
									<TextField
										id={`${prefix}-description`}
										label="Descrição"
										multiline
										rows={2}
										className="md:col-span-2"
										value={entry.description}
										onChange={value => set('description', value)}
									/>
									<div className="flex flex-col gap-1.5 md:col-span-2">
										<FieldLabel htmlFor={toolsId}>{section.toolsLabel}</FieldLabel>
										<KeywordInput
											id={toolsId}
											value={entry.technologies}
											max={CV_FORM_MAX_ITEMS}
											maxLength={100}
											keepCase
											onChange={technologies => set('technologies', technologies)}
										/>
									</div>
								</div>
							)
						})}
					</EntryList>
				)
				break
		}

		const defaultTitle = CV_FORM_DEFAULT_TITLES[section.kind]

		return (
			<div className="flex flex-col gap-5">
				<div className="grid gap-4 md:grid-cols-2">
					<TextField
						id={`${sectionId}-title`}
						label="Título no PDF"
						value={section.title}
						placeholder={defaultTitle}
						help={`Vazio usa "${defaultTitle}". Outro título precisa ser um sinônimo que o cv-updater reconhece.`}
						error={at('title')}
						onChange={value =>
							updateSection(index, draft => {
								draft.title = value
							})
						}
					/>
					{section.kind === 'projects' && (
						<div className="flex flex-col gap-1.5">
							<FieldLabel htmlFor={`${sectionId}-tools-label`}>Rótulo das ferramentas</FieldLabel>
							<SelectMenu
								id={`${sectionId}-tools-label`}
								value={section.toolsLabel}
								options={CV_FORM_TOOLS_LABELS.map(label => ({ value: label, label }))}
								describedBy={`${sectionId}-tools-label-help`}
								onChange={toolsLabel =>
									updateSection(index, draft => {
										;(draft as typeof section).toolsLabel = toolsLabel
									})
								}
							/>
							<FieldHelp id={`${sectionId}-tools-label-help`}>
								A linha abaixo de cada projeto: "{section.toolsLabel}: ...".
							</FieldHelp>
						</div>
					)}
				</div>
				{body}
			</div>
		)
	}

	function renderSections() {
		return (
			<div className="flex flex-col gap-5">
				<ol className="m-0 flex list-none flex-col gap-2 p-0">
					{form.sections.map((section, index) => {
						const label = SECTION_LABELS[section.kind]
						return (
							<li key={section.kind} className="flex items-center gap-3 rounded-md border border-line px-4 py-2.5">
								<span className="w-5 shrink-0 font-mono text-xs text-muted">{index + 1}</span>
								<span className="flex min-w-0 grow flex-col">
									<span className="font-medium">{label}</span>
									<span className="truncate text-xs text-muted">
										no PDF: {section.title.trim() || CV_FORM_DEFAULT_TITLES[section.kind]}
									</span>
								</span>
								<MoveButtons
									name={`a seção ${label}`}
									index={index}
									count={form.sections.length}
									onMove={delta =>
										update(draft => {
											draft.sections = moveItem(draft.sections, index, delta)
										})
									}
									onRemove={() => update(draft => void draft.sections.splice(index, 1))}
								/>
							</li>
						)
					})}
				</ol>
				{form.sections.length === 0 && <FieldHelp>Nenhuma seção: adicione pelo menos experiência ou formação.</FieldHelp>}

				{missing.length > 0 && (
					<div className="flex flex-col gap-2">
						<span className={LABEL}>adicionar seção</span>
						<div className="flex flex-wrap gap-2">
							{missing.map(kind => (
								<Button
									key={kind}
									variant="ghost"
									size="sm"
									onClick={() => update(draft => void draft.sections.push(emptySection(kind)))}
								>
									<Icon name="plus" size={14} />
									{SECTION_LABELS[kind]}
								</Button>
							))}
						</div>
					</div>
				)}
			</div>
		)
	}

	function renderReview() {
		const clean = cleanForm(form)
		const entries = Object.entries(allProblems)

		return (
			<div className="flex flex-col gap-5">
				<dl className="m-0 flex flex-col gap-2">
					<ReviewRow label="Contato" onEdit={() => goTo('contact')}>
						{[clean.contact.name.trim() || 'sem nome', clean.contact.headline, clean.contact.email].filter(Boolean).join(' · ')}
					</ReviewRow>
					{clean.sections.map(section => {
						const count = itemsOf(section).length
						const summary =
							section.kind === 'summary'
								? section.text && `${section.text.length} caracteres`
								: count && `${count} ${count === 1 ? ENTRY_NAMES[section.kind] : ENTRY_PLURALS[section.kind]}`

						return (
							<ReviewRow
								key={section.kind}
								label={section.title || CV_FORM_DEFAULT_TITLES[section.kind]}
								onEdit={() => goTo(section.kind)}
							>
								{summary || <span className="text-muted">vazia: fica de fora do PDF</span>}
							</ReviewRow>
						)
					})}
				</dl>

				{entries.length > 0 && (
					<div role="alert" className="flex flex-col gap-2 rounded-md border border-danger px-4 py-3">
						<p className="text-sm font-semibold text-danger">Corrija antes de gerar:</p>
						<ul className="m-0 flex list-none flex-col gap-1.5 p-0">
							{entries.map(([path, message]) => {
								const target = problemStep(path, form)
								return (
									<li key={path} className="flex flex-wrap items-center justify-between gap-2 text-sm">
										<span>
											<span className="font-medium">{STEP_NAMES[target]}:</span> {message}
										</span>
										<Button variant="ghost" size="xs" onClick={() => goTo(target)}>
											corrigir
										</Button>
									</li>
								)
							})}
						</ul>
					</div>
				)}
			</div>
		)
	}

	function renderStep() {
		if (current === 'contact') return renderContact()
		if (current === 'sections') return renderSections()
		if (current === 'review') return renderReview()

		const sectionIndex = form.sections.findIndex(section => section.kind === current)
		return renderSection(form.sections[sectionIndex]!, sectionIndex)
	}

	return (
		<dialog
			ref={ref}
			// Aberta, vira coluna: o meio rola e o topo (etapas) e o rodapé (voltar/próximo) ficam à vista
			className={cx(DIALOG, 'w-3xl open:flex open:flex-col')}
			aria-labelledby={`${id}-title`}
			// Fechar não perde nada: os dados ficam na tela de trás até gerar
			onClose={onClose}
		>
			<div className="flex flex-col gap-3 border-b border-line px-6 pt-5 pb-4 max-md:px-4.5">
				<div className="flex items-center justify-between gap-3">
					<h2 id={`${id}-title`} className="text-lg font-bold">
						currículo pelo formulário
					</h2>
					<IconButton label="Fechar" size="sm" onClick={() => ref.current?.close()}>
						<Icon name="close" size={16} />
					</IconButton>
				</div>
				<nav aria-label="Etapas">
					<ol className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 max-md:hidden">
						{steps.map((item, position) => (
							<li key={item}>
								<button
									type="button"
									aria-current={item === current ? 'step' : undefined}
									className={cx(
										'font-mono text-xs transition hover:text-ink',
										item === current ? 'font-semibold text-ink' : position < index ? 'text-ink' : 'text-muted',
									)}
									onClick={() => goTo(item)}
								>
									{position + 1}. {STEP_NAMES[item].toLowerCase()}
								</button>
							</li>
						))}
					</ol>
					<p className="font-mono text-xs text-muted md:hidden">
						etapa {index + 1} de {steps.length}: {STEP_NAMES[current].toLowerCase()}
					</p>
				</nav>
				<div className="h-1 overflow-hidden rounded-pill bg-surface-2" aria-hidden>
					<div
						className="h-full rounded-pill bg-lime transition-all duration-500 ease-glide motion-reduce:transition-none"
						style={{ width: `${((index + 1) / steps.length) * 100}%` }}
					/>
				</div>
			</div>

			<div ref={body} className="flex min-h-0 grow flex-col gap-4 overflow-y-auto px-6 py-5 max-md:px-4.5">
				<div className="flex flex-col gap-1">
					<h3 className="text-xl font-semibold">{STEP_NAMES[current]}</h3>
					{STEP_HELP[current] && <FieldHelp>{STEP_HELP[current]}</FieldHelp>}
				</div>
				{renderStep()}
			</div>

			<div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4 max-md:px-4.5">
				<Button variant="ghost" disabled={index === 0} onClick={() => goTo(steps[index - 1]!)}>
					<Icon name="back" size={14} />
					voltar
				</Button>
				{current === 'review' ? (
					<Button variant="lime" disabled={submitting || Object.keys(allProblems).length > 0} onClick={onSubmit}>
						{submitting ? 'enviando…' : 'gerar e validar'}
					</Button>
				) : (
					<Button variant="lime" onClick={next}>
						próximo
					</Button>
				)}
			</div>
		</dialog>
	)
}

/** Uma linha da revisão: o nome da seção, o resumo do que foi preenchido e o atalho para a etapa dela. */
function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
	return (
		<div className="flex items-center gap-3 rounded-md border border-line px-4 py-2.5">
			<dt className="w-40 shrink-0 font-medium max-md:w-28">{label}</dt>
			<dd className="m-0 min-w-0 grow truncate text-sm">{children}</dd>
			<Button variant="ghost" size="xs" onClick={onEdit}>
				editar
			</Button>
		</div>
	)
}

/** Os itens de uma seção, cada um numa caixa com as setas e o remover, e o botão de adicionar no fim. */
function EntryList({
	name,
	controls,
	onAdd,
	children,
}: {
	name: string
	controls: ListControls
	onAdd: () => void
	children: ReactNode[]
}) {
	return (
		<div className="flex flex-col gap-3">
			{children.map((child, index) => (
				<div key={index} className="flex flex-col gap-3 rounded-md border border-line p-4">
					<div className="flex items-center justify-between gap-3">
						<span className={LABEL}>
							{name} {index + 1}
						</span>
						<MoveButtons
							name={`${name} ${index + 1}`}
							index={index}
							count={controls.count}
							onMove={delta => controls.move(index, delta)}
							onRemove={() => controls.remove(index)}
						/>
					</div>
					{child}
				</div>
			))}
			<Button variant="ghost" size="sm" className="self-start" disabled={controls.count >= CV_FORM_MAX_ITEMS} onClick={onAdd}>
				<Icon name="plus" size={14} />
				adicionar {name}
			</Button>
		</div>
	)
}

/** Subir, descer e remover um item ou uma seção (`name` completa o rótulo: "Subir a seção Formação"). */
function MoveButtons({
	name,
	index,
	count,
	onMove,
	onRemove,
}: {
	name: string
	index: number
	count: number
	onMove: (delta: -1 | 1) => void
	onRemove: () => void
}) {
	return (
		<div className="flex shrink-0 gap-1">
			<IconButton
				label={`Subir ${name}`}
				size="sm"
				className="text-muted hover:text-ink"
				disabled={index === 0}
				onClick={() => onMove(-1)}
			>
				<Icon name="chevron" size={16} className="rotate-180" />
			</IconButton>
			<IconButton
				label={`Descer ${name}`}
				size="sm"
				className="text-muted hover:text-ink"
				disabled={index === count - 1}
				onClick={() => onMove(1)}
			>
				<Icon name="chevron" size={16} />
			</IconButton>
			<IconButton label={`Remover ${name}`} size="sm" className="text-muted hover:text-danger" onClick={onRemove}>
				<Icon name="trash" size={16} />
			</IconButton>
		</div>
	)
}

type TextFieldProps = {
	id: string
	label: string
	/** O rótulo só para o leitor de tela (o título da seção já diz o que é). */
	labelHidden?: boolean
	value: string
	placeholder?: string
	help?: string
	error?: string
	multiline?: boolean
	rows?: number
	autoComplete?: string
	className?: string
	onChange: (value: string) => void
}

/** Rótulo, campo (de uma linha ou de várias) e a ajuda ou o erro abaixo. */
function TextField({
	id,
	label,
	labelHidden,
	value,
	placeholder,
	help,
	error,
	multiline,
	rows,
	autoComplete,
	className,
	onChange,
}: TextFieldProps) {
	const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined

	return (
		<div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
			<FieldLabel htmlFor={id} className={labelHidden ? 'sr-only' : undefined}>
				{label}
			</FieldLabel>
			{multiline ? (
				<textarea
					id={id}
					value={value}
					rows={rows}
					placeholder={placeholder}
					aria-invalid={!!error || undefined}
					aria-describedby={describedBy}
					onChange={event => onChange(event.target.value)}
					className={field({ invalid: !!error, className: 'resize-y py-2.5 leading-relaxed' })}
				/>
			) : (
				<Input
					id={id}
					value={value}
					placeholder={placeholder}
					autoComplete={autoComplete}
					invalid={!!error}
					aria-describedby={describedBy}
					onChange={event => onChange(event.target.value)}
				/>
			)}
			{error ? <FieldError id={`${id}-error`}>{error}</FieldError> : help && <FieldHelp id={`${id}-help`}>{help}</FieldHelp>}
		</div>
	)
}

/** Lista de textos editada como linhas de um campo (tópicos, links); as linhas em branco saem ao salvar. */
function LinesField({
	value,
	onChange,
	...props
}: Omit<TextFieldProps, 'value' | 'onChange' | 'multiline'> & { value: string[]; onChange: (value: string[]) => void }) {
	return (
		<TextField
			{...props}
			multiline
			className={cx('md:col-span-full', props.className)}
			value={value.join('\n')}
			onChange={text => onChange(text.split('\n'))}
		/>
	)
}
