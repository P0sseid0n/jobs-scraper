import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { MAX_OWN_VARIABLES, OWN_VARIABLE_LIMITS, type MessageSettings } from '@shared/contracts'
import { t } from '@shared/i18n'
import {
	JOB_VARIABLES,
	PROFILE_VARIABLES,
	templateParts,
	templateTokens,
	templateValues,
	VARIABLE_NAME,
	type TemplateJob,
	type TemplatePart,
	type TemplateToken,
} from '@shared/templates'

import { cx } from '../lib/cx'
import { insertVariable, type TemplateField } from '../lib/template-editor'
import { useT } from '../stores/locale'
import { variablePickerOpen } from '../stores/variable-picker'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { Dialog, DialogTitle } from './ui/Dialog'
import { Disclosure } from './ui/Disclosure'
import { FieldError, FieldHelp, FieldLabel } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { field, Input } from './ui/Input'
import { Pill, PillGroup } from './ui/Pill'
import { FIELDSET, LABEL, LIST } from './ui/text'
import { VariablePicker, type VariablePickerGroup } from './ui/VariablePicker'

type MessageTemplateEditorProps = {
	/** As configurações da mensagem no rascunho da tela. */
	message: MessageSettings
	/** O perfil no rascunho, para a prévia preencher `{{area}}` e `{{cargo_alvo}}`. */
	profile: { area: string; targetRole: string }
	/** Os erros por caminho do campo, como os da API ("template.body", "variables.0.name"). */
	errors: Record<string, string>
	/** Uma tentativa de salvar falhou: mostra também os erros das variáveis que a pessoa acabou de criar. */
	revealErrors: boolean
	/** Altera as configurações da mensagem no rascunho. */
	edit: (mutate: (message: MessageSettings) => void) => void
}

/** As duas vagas da prévia: uma com tudo e outra sem os dados que costumam faltar, para ver os fallbacks. */
const SAMPLES = ['complete', 'partial'] as const
type Sample = (typeof SAMPLES)[number]

/** A vaga de exemplo da prévia, com o cargo-alvo do perfil (assim ela parece uma vaga da área da pessoa). */
function sampleJob(sample: Sample, targetRole: string): TemplateJob {
	const example = t().messageEditor.sampleJob
	const job: TemplateJob = {
		title: targetRole.trim() || example.title,
		company: example.company,
		location: example.location,
		workMode: 'hibrido',
		necessaryKnowledge: example.skills,
		applyLink: 'https://lojaazul.com.br/vagas/42',
		postLink: 'https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000000/',
		author: 'Ana Souza',
	}

	return sample === 'complete' ? job : { ...job, company: null, location: null, author: null, applyLink: null }
}

const OPTIONAL_JOB_VARIABLES = JOB_VARIABLES.filter(variable => variable.optional)

/** Os exemplos da modal de variáveis próprias vazia (a descrição fica em `messageEditor.ownExamples`). */
const OWN_VARIABLE_EXAMPLES = [
	{ name: 'meu_nome', type: 'text' },
	{ name: 'meu_telefone', type: 'text' },
	{ name: 'link_github', type: 'link' },
	{ name: 'link_linkedin', type: 'link' },
] as const

/** As modais do editor: as variáveis próprias e os fallbacks, que ficam fora da tela para o modelo e a prévia caberem. */
type EditorDialog = 'variables' | 'fallbacks'

/**
 * O editor do modelo de mensagem, em Configurações › Mensagem: o assunto e a mensagem com o painel "Variáveis
 * disponíveis", a prévia numa vaga de exemplo e, em modais, as variáveis próprias e os fallbacks das que podem faltar.
 */
export function MessageTemplateEditor({ message, profile, errors, edit, revealErrors }: MessageTemplateEditorProps) {
	const t = useT()
	const m = t.messageEditor
	const fallbackExamples: Record<string, string> = m.fallbackExamples
	const ids = { subject: useId(), body: useId(), warning: useId(), own: useId() }
	const subjectRef = useRef<HTMLInputElement>(null)
	const bodyRef = useRef<HTMLTextAreaElement>(null)
	const mirrorRef = useRef<HTMLDivElement>(null)
	const subjectMirrorRef = useRef<HTMLDivElement>(null)
	// O último campo focado recebe a variável clicada no painel; sem nenhum ainda, ela entra no fim da mensagem
	const [lastField, setLastField] = useState<TemplateField | null>(null)
	const [sample, setSample] = useState<Sample>('partial')
	const [dialog, setDialog] = useState<EditorDialog | null>(null)
	// As variáveis recém-criadas (pelo índice): sem erro até a pessoa sair da linha delas ou tentar salvar
	const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set())

	const { template, fallbacks, variables } = message
	const ownVariables = variables.filter(variable => VARIABLE_NAME.test(variable.name.trim()))

	/** Insere `{{nome}}` no último campo focado, na posição do cursor, e devolve o foco a ele com o cursor depois da variável. */
	function insert(name: string) {
		const target: TemplateField = lastField ?? 'body'
		const element = target === 'subject' ? subjectRef.current : bodyRef.current
		const selection =
			lastField && element ? { start: element.selectionStart ?? element.value.length, end: element.selectionEnd ?? 0 } : null
		const { value, cursor } = insertVariable(template[target], name, selection)

		edit(next => {
			next.template[target] = value
		})
		setLastField(target)
		requestAnimationFrame(() => {
			element?.focus()
			element?.setSelectionRange(cursor, cursor)
		})
	}

	// As variáveis que podem faltar, usadas sem fallback (nem nas configurações, nem na própria variável)
	const withoutFallback = (text: string) =>
		templateTokens(text).filter(
			token =>
				OPTIONAL_JOB_VARIABLES.some(variable => variable.name === token.name) && !token.fallback && !fallbacks[token.name]?.trim(),
		)
	const unsafe = [...new Set([...withoutFallback(template.subject), ...withoutFallback(template.body)].map(token => token.name))]
	const bodyWarnings = withoutFallback(template.body)

	// Os erros de cada modal, para o atalho que a abre avisar (a modal fechada não mostra o campo errado)
	const errorsIn = (root: string) =>
		Object.keys(errors).some(path => (path === root || path.startsWith(`${root}.`)) && !hiddenError(path))
	const fallbackCount = OPTIONAL_JOB_VARIABLES.filter(variable => fallbacks[variable.name]?.trim()).length
	const dialogErrors = errorsIn('variables') || errorsIn('fallbacks')

	// Depois de uma tentativa de salvar, nenhuma linha é mais nova: os erros dela ficam à vista
	useEffect(() => {
		if (revealErrors) setFresh(new Set())
	}, [revealErrors])

	// Com erro numa modal, o painel abre: é nele que ficam os atalhos com o selo "corrigir"
	useEffect(() => {
		if (dialogErrors) variablePickerOpen.set(true)
	}, [dialogErrors])

	/** O erro é de uma variável recém-criada, que a pessoa ainda não terminou de preencher. */
	function hiddenError(path: string) {
		const [root, index] = path.split('.')
		return !revealErrors && root === 'variables' && index !== undefined && fresh.has(Number(index))
	}

	const groups: VariablePickerGroup[] = [
		{
			label: m.fromJob,
			action: {
				label: m.fallbacks,
				detail: `${fallbackCount}/${OPTIONAL_JOB_VARIABLES.length}`,
				detailLabel: m.fallbacksDefined(fallbackCount, OPTIONAL_JOB_VARIABLES.length),
				invalid: errorsIn('fallbacks'),
				onClick: () => setDialog('fallbacks'),
			},
			variables: JOB_VARIABLES.map(variable => {
				const fallback = fallbacks[variable.name]?.trim()
				return {
					name: variable.name,
					description: variable.description,
					type: variable.type,
					mayBeMissing: variable.optional && !fallback,
					hint: fallback ? m.fallbackHint(variable.name.replaceAll('_', ' '), fallback) : undefined,
				}
			}),
		},
		{
			label: m.fromProfile,
			variables: PROFILE_VARIABLES.map(({ name, description, type }) => ({ name, description, type })),
		},
		{
			label: m.yours,
			variables: ownVariables.map(variable => ({
				name: variable.name.trim(),
				description: variable.description.trim() || (variable.type === 'link' ? m.yourLink : m.yourText),
				type: variable.type,
			})),
			action: {
				label: variables.length ? m.edit : m.create,
				icon: variables.length ? undefined : 'plus',
				invalid: errorsIn('variables'),
				onClick: () => setDialog('variables'),
			},
			// Sem nenhuma (nem rascunho com erro), o grupo vira o botão tracejado de criar
			empty: variables.length ? undefined : m.createEmpty,
		},
	]

	const values = templateValues(sampleJob(sample, profile.targetRole), profile, ownVariables)
	const subjectParts = templateParts(template.subject, values, fallbacks)
	const bodyParts = templateParts(template.body, values, fallbacks)
	const previewParts = [...subjectParts, ...bodyParts]
	const previewFallbacks = [...new Set(previewParts.filter(part => part.kind === 'fallback').map(part => part.name!))]
	const previewMissing = [...new Set(previewParts.filter(part => part.kind === 'missing').map(part => part.name!))]

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-1.5">
				<FieldLabel htmlFor={ids.subject}>{m.subject}</FieldLabel>
				{/* As variáveis ficam destacadas atrás do texto, como na mensagem; o espelho rola na horizontal com o campo */}
				<div className="relative">
					<div
						ref={subjectMirrorRef}
						aria-hidden="true"
						className={field({
							className:
								'pointer-events-none absolute inset-0 flex items-center overflow-hidden border-transparent whitespace-pre text-transparent',
						})}
					>
						<span>{highlight(template.subject, withoutFallback(template.subject))}</span>
					</div>
					<Input
						ref={subjectRef}
						id={ids.subject}
						value={template.subject}
						invalid={!!errors['template.subject']}
						aria-describedby={errors['template.subject'] ? `${ids.subject}-error` : undefined}
						onFocus={() => setLastField('subject')}
						onScroll={event => {
							if (subjectMirrorRef.current) subjectMirrorRef.current.scrollLeft = event.currentTarget.scrollLeft
						}}
						onChange={event => {
							const value = event.target.value
							edit(next => {
								next.template.subject = value
							})
						}}
						className="relative w-full bg-transparent"
					/>
				</div>
				{errors['template.subject'] && <FieldError id={`${ids.subject}-error`}>{errors['template.subject']}</FieldError>}
			</div>

			<div className="flex flex-col gap-1.5">
				<FieldLabel htmlFor={ids.body}>{m.message}</FieldLabel>
				{/* As variáveis ficam destacadas atrás do texto (um espelho do campo, com o texto transparente), que rola junto
				 * com ele; as que podem faltar e ainda não têm fallback, em laranja */}
				<div className="relative">
					<div
						ref={mirrorRef}
						aria-hidden="true"
						className={field({
							className:
								'pointer-events-none absolute inset-0 overflow-hidden border-transparent py-2.5 leading-relaxed whitespace-pre-wrap wrap-break-word text-transparent',
						})}
					>
						{highlight(template.body, bodyWarnings)}
						{'\n'}
					</div>
					<textarea
						ref={bodyRef}
						id={ids.body}
						rows={9}
						value={template.body}
						aria-invalid={!!errors['template.body'] || undefined}
						aria-describedby={cx(errors['template.body'] && `${ids.body}-error`, unsafe.length > 0 && ids.warning) || undefined}
						onFocus={() => setLastField('body')}
						onScroll={event => {
							if (mirrorRef.current) mirrorRef.current.scrollTop = event.currentTarget.scrollTop
						}}
						onChange={event => {
							const value = event.target.value
							edit(next => {
								next.template.body = value
							})
						}}
						className={field({
							invalid: !!errors['template.body'],
							className: 'relative block w-full resize-y bg-transparent py-2.5 leading-relaxed field-sizing-content min-h-56',
						})}
					/>
				</div>
				{errors['template.body'] && <FieldError id={`${ids.body}-error`}>{errors['template.body']}</FieldError>}
				{unsafe.length > 0 && (
					<p id={ids.warning} className="flex items-start gap-1.5 text-sm text-warn">
						<Icon name="alert" size={14} className="mt-0.5" />
						<span>
							{m.unsafe(unsafe.map(name => `{{${name}}}`).join(', '), unsafe[0]!)}
							<button
								type="button"
								className="underline underline-offset-3 hover:text-ink"
								onClick={() => setDialog('fallbacks')}
							>
								{m.setFallback}
							</button>
						</span>
					</p>
				)}
			</div>

			<VariablePicker groups={groups} onInsert={insert} linkDisabled={lastField === 'subject'} howTo={<HowTo />} />

			{dialog === 'variables' && (
				<EditorDialogBox
					title={m.yourVariables}
					help={m.yourVariablesHelp}
					// Fechada a modal, as linhas novas que ficaram para trás mostram o que falta
					onClose={() => {
						setDialog(null)
						setFresh(new Set())
					}}
				>
					{renderOwnVariables()}
				</EditorDialogBox>
			)}
			{dialog === 'fallbacks' && (
				<EditorDialogBox
					title={m.fallbacksTitle}
					help={
						<>
							{m.fallbacksHelpBefore}
							<code className="font-mono text-lime-text">{m.fallbackExample}</code>
							{m.fallbacksHelpAfter}
						</>
					}
					onClose={() => setDialog(null)}
				>
					{renderFallbacks()}
				</EditorDialogBox>
			)}

			{/* A prévia numa vaga de exemplo: mostra onde o fallback entrou e o que ficaria faltando */}
			<section aria-label={m.previewLabel} className="flex flex-col gap-3 rounded-sm border border-line p-3.5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className={LABEL}>{m.previewTitle}</span>
					<PillGroup role="group" aria-label={m.sampleLabel}>
						{SAMPLES.map(option => (
							<Pill key={option} pressed={sample === option} onClick={() => setSample(option)}>
								{m.samples[option]}
							</Pill>
						))}
					</PillGroup>
				</div>
				<p className="m-0 text-sm font-semibold wrap-break-word">{renderParts(subjectParts)}</p>
				<p className="m-0 max-w-prose text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{renderParts(bodyParts)}</p>
				<p role="status" className="m-0 text-xs text-muted">
					{previewMissing.length === 0 && previewFallbacks.length === 0
						? m.allFilled
						: [
								previewFallbacks.length > 0 && m.previewFallbacks(previewFallbacks.map(name => `{{${name}}}`).join(', ')),
								previewMissing.length > 0 && m.previewMissing(previewMissing.map(name => `{{${name}}}`).join(', ')),
							]
								.filter(Boolean)
								.join(' ')}
				</p>
			</section>
		</div>
	)

	function renderOwnVariables() {
		return (
			<div className={FIELDSET}>
				{variables.length === 0 && (
					<div className="flex flex-col gap-2 rounded-sm border border-dashed border-line p-3.5">
						<p className="text-sm text-muted">{m.noVariables}</p>
						<ul className={cx(LIST, 'flex flex-wrap gap-2')}>
							{OWN_VARIABLE_EXAMPLES.map(example => (
								<li key={example.name}>
									<button
										type="button"
										onClick={() => addVariable(example)}
										className="flex min-h-8 items-center gap-2 rounded-sm border border-line px-2.5 text-sm transition hover:bg-surface-2"
									>
										<span className="font-mono text-lime-text">{`{{${example.name}}}`}</span>
										{example.type === 'link' && <Icon name="link" size={13} className="text-muted" />}
										<span className="text-muted">{m.ownExamples[example.name]}</span>
									</button>
								</li>
							))}
						</ul>
					</div>
				)}
				{variables.length > 0 && (
					<ul className={cx(LIST, 'flex flex-col gap-3')}>
						{variables.map((variable, index) => {
							const path = `variables.${index}`
							const at = (key: string) => (hiddenError(`${path}.${key}`) ? undefined : errors[`${path}.${key}`])
							const rowError = at('name') ?? at('value') ?? at('description')
							const fieldId = (key: string) => `${ids.own}-${index}-${key}`

							return (
								<li
									key={index}
									className="flex flex-col gap-2.5 rounded-sm border border-line p-3"
									// Ao sair da linha, ela deixa de ser nova: os erros dela passam a aparecer
									onBlur={event => {
										if (!event.currentTarget.contains(event.relatedTarget)) settle(index)
									}}
								>
									<div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
										<div className="flex flex-col gap-1">
											<label htmlFor={fieldId('name')} className={LABEL}>
												{m.name}
											</label>
											<Input
												id={fieldId('name')}
												aria-label={m.nameLabel(index + 1)}
												className="font-mono"
												placeholder={m.namePlaceholder}
												maxLength={OWN_VARIABLE_LIMITS.name}
												value={variable.name}
												invalid={!!at('name')}
												onChange={event => {
													const value = event.target.value
													edit(next => {
														next.variables[index]!.name = value
													})
												}}
											/>
										</div>
										<div className="flex flex-col gap-1">
											<label htmlFor={fieldId('description')} className={LABEL}>
												{m.description}
											</label>
											<Input
												id={fieldId('description')}
												aria-label={m.descriptionLabel(index + 1)}
												placeholder={m.descriptionPlaceholder}
												maxLength={OWN_VARIABLE_LIMITS.description}
												value={variable.description}
												invalid={!!at('description')}
												onChange={event => {
													const value = event.target.value
													edit(next => {
														next.variables[index]!.description = value
													})
												}}
											/>
										</div>
									</div>
									<div className="flex items-end gap-2.5 max-sm:flex-wrap">
										<div className="flex shrink-0 flex-col gap-1">
											<span className={LABEL} aria-hidden>
												{m.type}
											</span>
											<PillGroup role="group" aria-label={m.typeLabel(index + 1)} className="flex-nowrap">
												{(['text', 'link'] as const).map(type => (
													<Pill
														key={type}
														pressed={variable.type === type}
														onClick={() =>
															edit(next => {
																next.variables[index]!.type = type
															})
														}
													>
														{type === 'link' && <Icon name="link" size={13} />}
														{type === 'text' ? m.text : m.link}
													</Pill>
												))}
											</PillGroup>
										</div>
										<div className="flex grow flex-col gap-1">
											<label htmlFor={fieldId('value')} className={LABEL}>
												{m.value}
											</label>
											<Input
												id={fieldId('value')}
												aria-label={m.valueLabel(index + 1)}
												className={cx(variable.type === 'link' && 'font-mono')}
												placeholder={variable.type === 'link' ? m.linkPlaceholder : m.textPlaceholder}
												maxLength={OWN_VARIABLE_LIMITS.value}
												value={variable.value}
												invalid={!!at('value')}
												onChange={event => {
													const value = event.target.value
													edit(next => {
														next.variables[index]!.value = value
													})
												}}
											/>
										</div>
										<IconButton
											label={m.deleteVariable(variable.name || String(index + 1))}
											onClick={() => removeVariable(index)}
										>
											<Icon name="trash" />
										</IconButton>
									</div>
									{rowError && <FieldError>{rowError}</FieldError>}
								</li>
							)
						})}
					</ul>
				)}
				{errors.variables && <FieldError>{errors.variables}</FieldError>}
				<Button
					variant="ghost"
					size="sm"
					className="self-start"
					disabled={variables.length >= MAX_OWN_VARIABLES}
					onClick={() => addVariable()}
				>
					<Icon name="plus" size={14} />
					{m.addVariable}
				</Button>
			</div>
		)
	}

	/** Cria uma variável (vazia ou de um exemplo) e leva o foco ao primeiro campo que falta preencher. */
	function addVariable(example?: (typeof OWN_VARIABLE_EXAMPLES)[number]) {
		const index = variables.length
		edit(next => {
			next.variables.push({
				name: example?.name ?? '',
				description: example ? m.ownExamples[example.name] : '',
				type: example?.type ?? 'text',
				value: '',
			})
		})
		setFresh(previous => new Set(previous).add(index))
		requestAnimationFrame(() => document.getElementById(`${ids.own}-${index}-${example ? 'value' : 'name'}`)?.focus())
	}

	/** Apaga a variável; as novas depois dela descem um índice. */
	function removeVariable(index: number) {
		edit(next => {
			next.variables.splice(index, 1)
		})
		setFresh(previous => new Set([...previous].filter(item => item !== index).map(item => (item > index ? item - 1 : item))))
	}

	/** A linha deixa de ser nova (a pessoa saiu dela). */
	function settle(index: number) {
		setFresh(previous => {
			if (!previous.has(index)) return previous
			const next = new Set(previous)
			next.delete(index)
			return next
		})
	}

	function renderFallbacks() {
		// As que o modelo usa ficam à vista (são as que valem a pena definir); as outras, recolhidas
		const tokens = new Set([...templateTokens(template.subject), ...templateTokens(template.body)].map(token => token.name))
		const used = OPTIONAL_JOB_VARIABLES.filter(variable => tokens.has(variable.name))
		const others = OPTIONAL_JOB_VARIABLES.filter(variable => !tokens.has(variable.name))
		const othersDefined = others.filter(variable => fallbacks[variable.name]?.trim()).length
		const partial = templateValues(sampleJob('partial', profile.targetRole), profile, ownVariables)

		return (
			<div className="flex flex-col gap-5">
				{used.length > 0 ? (
					<div className="flex flex-col gap-2">
						<span className={LABEL}>{m.inYourTemplate}</span>
						{renderFallbackFields(used)}
					</div>
				) : (
					<p className="rounded-sm border border-dashed border-line p-3.5 text-sm text-muted">{m.noOptional}</p>
				)}

				{others.length > 0 && (
					<Disclosure
						summary={
							<>
								{used.length > 0 ? m.otherVariables : m.defineAnyway} ({others.length})
								{othersDefined > 0 && m.withFallback(othersDefined)}
							</>
						}
						// Com erro num campo recolhido, ela já abre: o erro não fica escondido
						defaultOpen={others.some(variable => errors[`fallbacks.${variable.name}`])}
					>
						<div className="pt-2">{renderFallbackFields(others)}</div>
					</Disclosure>
				)}

				{/* O efeito na hora, numa vaga sem os dados que costumam faltar (a prévia da tela fica atrás da modal); sem
				 * nenhuma variável que pode faltar no modelo, ela sairia igual à mensagem e não mostraria nada */}
				{used.length > 0 && (
					<section aria-label={m.partialPreviewLabel} className="flex flex-col gap-2 rounded-sm bg-surface-2 p-3.5">
						<span className={LABEL}>{m.partialPreviewTitle(m.samples.partial)}</span>
						<p className="m-0 text-sm font-semibold wrap-break-word">
							{renderParts(templateParts(template.subject, partial, fallbacks))}
						</p>
						<p className="m-0 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
							{renderParts(templateParts(template.body, partial, fallbacks))}
						</p>
					</section>
				)}
			</div>
		)
	}

	/** Os campos de fallback, em grade: o nome em cima e a descrição embaixo, como no painel, e um exemplo no placeholder. */
	function renderFallbackFields(list: typeof OPTIONAL_JOB_VARIABLES) {
		return (
			<div className="grid grid-cols-2 gap-x-5 gap-y-4 max-md:grid-cols-1">
				{list.map(variable => {
					const id = `fallback-${variable.name}`
					const error = errors[`fallbacks.${variable.name}`]

					return (
						<div key={variable.name} className="flex flex-col gap-1.5">
							<div className="flex flex-col gap-0.5">
								<FieldLabel htmlFor={id} className="flex items-center gap-1.5">
									<span className="font-mono text-lime-text">{`{{${variable.name}}}`}</span>
									{variable.type === 'link' && (
										<>
											<Icon name="link" size={13} className="text-muted" />
											<span className="sr-only">{m.linkType}</span>
										</>
									)}
								</FieldLabel>
								<span id={`${id}-description`} className="text-xs text-muted">
									{variable.description}
								</span>
							</div>
							<Input
								id={id}
								className={cx(variable.type === 'link' && 'font-mono')}
								placeholder={fallbackExamples[variable.name] && m.example(fallbackExamples[variable.name]!)}
								value={fallbacks[variable.name] ?? ''}
								invalid={!!error}
								aria-describedby={cx(`${id}-description`, error && `${id}-error`)}
								onChange={event => {
									const value = event.target.value
									edit(next => {
										if (value.trim()) next.fallbacks[variable.name] = value
										else delete next.fallbacks[variable.name]
									})
								}}
							/>
							{error && <FieldError id={`${id}-error`}>{error}</FieldError>}
						</div>
					)
				})}
			</div>
		)
	}
}

/**
 * A modal de uma parte do editor (`<dialog>` nativo: foco preso, Esc fecha). As mudanças vão direto ao rascunho da tela,
 * então fechar não perde nada; o "salvar" continua sendo o das Configurações.
 */
function EditorDialogBox({
	title,
	help,
	onClose,
	children,
}: {
	title: string
	help: ReactNode
	onClose: () => void
	children: ReactNode
}) {
	const ref = useRef<HTMLDialogElement>(null)
	const m = useT().messageEditor

	return (
		// Aberta, vira coluna: o meio rola e o topo e o rodapé ficam à vista
		<Dialog ref={ref} onClose={onClose} className="w-180 open:flex open:flex-col">
			<div className="flex flex-col gap-1 border-b border-line px-5 pt-4 pb-3.5">
				<DialogTitle closable>{title}</DialogTitle>
				<FieldHelp>{help}</FieldHelp>
			</div>
			<div className="min-h-0 grow overflow-y-auto px-5 py-4">{children}</div>
			{/* O "pronto" só fecha: quem salva é o "salvar alterações" da tela */}
			<div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
				<p className="text-xs text-muted">{m.draftNote}</p>
				<Button variant="lime" className="shrink-0" onClick={() => ref.current?.close()}>
					{m.done}
				</Button>
			</div>
		</Dialog>
	)
}

/**
 * O texto do campo com as variáveis destacadas, para o espelho atrás dele: em verde, e em laranja as que podem faltar e
 * não têm fallback (`warnings`).
 */
function highlight(text: string, warnings: TemplateToken[]) {
	const nodes: ReactNode[] = []
	let last = 0
	for (const token of templateTokens(text)) {
		const warn = warnings.some(warning => warning.start === token.start)
		nodes.push(text.slice(last, token.start))
		nodes.push(
			<mark key={token.start} className={cx('rounded-xs text-transparent', warn ? 'bg-warn-bg' : 'bg-lime-soft')}>
				{text.slice(token.start, token.end)}
			</mark>,
		)
		last = token.end
	}
	nodes.push(text.slice(last))

	return nodes
}

/** O texto preenchido da prévia: o fallback em verde e o que faltou em laranja (com o nome para o leitor de tela). */
function renderParts(parts: TemplatePart[]) {
	return parts.map((part, index) => {
		const key = `${index}-${part.kind}`
		if (part.kind === 'fallback') {
			return (
				<mark
					key={key}
					title={t().messageEditor.fallbackOf(part.name ?? '')}
					className="rounded-xs bg-lime-soft px-0.5 text-lime-text"
				>
					{part.text}
				</mark>
			)
		}
		if (part.kind === 'missing') {
			return (
				<mark key={key} title={t().messageEditor.jobLacks(part.name ?? '')} className="rounded-xs bg-warn-bg px-0.5 text-warn">
					{part.text}
				</mark>
			)
		}
		return part.text
	})
}

/** O mini-tutorial do "como funciona", com um exemplo de modelo e o resultado preenchido. */
function HowTo() {
	const { howTo: h, fallbackExample } = useT().messageEditor
	return (
		<div className="flex flex-col gap-2 text-sm text-ink">
			<p className="m-0">
				{h.writeBefore}
				<code className="font-mono text-lime-text">{'{{empresa}}'}</code>
				{h.writeAfter}
			</p>
			<p className="m-0">
				<strong>{h.fallbackTitle}</strong>
				{h.fallbackText}
				<code className="font-mono text-lime-text">{fallbackExample}</code>
				{h.fallbackAfter}
			</p>
			<p className="m-0">
				{h.missingBefore}
				<code className="font-mono">[empresa]</code>
				{h.missingAfter}
			</p>
			<div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
				<div className="flex flex-col gap-1 rounded-sm bg-surface p-2.5">
					<span className={LABEL}>{h.template}</span>
					<span className="font-mono text-xs">{h.templateExample}</span>
				</div>
				<div className="flex flex-col gap-1 rounded-sm bg-surface p-2.5">
					<span className={LABEL}>{h.result}</span>
					<span className="text-xs">
						{h.resultBefore}
						<mark className="rounded-xs bg-lime-soft px-0.5 text-lime-text">{h.resultFallback}</mark>
						{h.resultMiddle}
						<mark className="rounded-xs bg-warn-bg px-0.5 text-warn">[local]</mark>
						{h.resultAfter}
					</span>
				</div>
			</div>
		</div>
	)
}
