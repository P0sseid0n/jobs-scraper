import { useId, type ReactNode } from 'react'

import { CV_FORM_MAX_ITEMS, CV_FORM_SECTIONS, type CvForm, type CvFormSection, type CvFormSectionKind } from '@shared/contracts'

import { EMPTY_ENTRY, emptySection, moveItem, SECTION_LABELS } from '../lib/cv-form'
import { cx } from '../lib/cx'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { card } from './ui/Card'
import { FieldError, FieldHelp, FieldLabel } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { field, Input } from './ui/Input'
import { KeywordInput } from './ui/KeywordInput'
import { LABEL } from './ui/text'

type Props = {
	form: CvForm
	/** Caminho do campo → mensagem (`formProblems` ou os erros da API sem o prefixo `form.`). */
	problems: Record<string, string>
	onChange: (form: CvForm) => void
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

/**
 * O currículo base em formulário, para quem não sabe LaTeX: contato e seções que dá para adicionar, tirar e
 * reordenar. O cv-updater gera o `.tex` a partir dos dados (`resume/latex-from-form.ts`). Controlado: cada mudança
 * chega em `onChange` com o formulário inteiro.
 */
export function CvBaseForm({ form, problems, onChange }: Props) {
	const id = useId()
	const missing = CV_FORM_SECTIONS.filter(kind => !form.sections.some(section => section.kind === kind))

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
			<fieldset className="grid gap-4 md:grid-cols-2">
				<legend className={cx(LABEL, 'mb-3')}>contato_</legend>
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
			</fieldset>
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
										<FieldLabel htmlFor={toolsId}>Ferramentas</FieldLabel>
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

		const label = SECTION_LABELS[section.kind]

		return (
			<li key={section.kind}>
				<section className={card({ size: 'md', className: 'flex flex-col gap-4' })} aria-labelledby={`${sectionId}-title`}>
					<div className="flex items-center justify-between gap-3">
						<h4 id={`${sectionId}-title`} className="font-semibold">
							{label}
						</h4>
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
					</div>
					{body}
				</section>
			</li>
		)
	}

	return (
		<div className="flex flex-col gap-6">
			{renderContact()}

			<div className="flex flex-col gap-3">
				<h3 className={LABEL}>seções_</h3>
				<FieldHelp>
					Na ordem do PDF; use as setas para mudar. Itens vazios ficam de fora. Precisa de pelo menos uma experiência ou formação.
				</FieldHelp>
				{problems.sections && <FieldError>{problems.sections}</FieldError>}
				<ul className="m-0 flex list-none flex-col gap-3 p-0">{form.sections.map(renderSection)}</ul>
			</div>

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
