import { useId, useRef, useState, type ReactNode } from 'react'

import { MAX_OWN_VARIABLES, OWN_VARIABLE_LIMITS, type MessageSettings } from '@shared/contracts'
import {
	formatApplicationBody,
	JOB_VARIABLES,
	PROFILE_VARIABLES,
	templateParts,
	templateTokens,
	templateValues,
	VARIABLE_NAME,
	type TemplateJob,
	type TemplatePart,
} from '@shared/templates'

import { cx } from '../lib/cx'
import { insertVariable, type TemplateField } from '../lib/template-editor'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { FieldError, FieldHelp, FieldLabel } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { field, Input } from './ui/Input'
import { Pill, PillGroup } from './ui/Pill'
import { FIELDSET, LABEL } from './ui/text'
import { VariablePicker, type VariablePickerGroup } from './ui/VariablePicker'

type MessageTemplateEditorProps = {
	/** As configurações da mensagem no rascunho da tela. */
	message: MessageSettings
	/** O perfil no rascunho, para a prévia preencher `{{area}}` e `{{cargo_alvo}}`. */
	profile: { area: string; targetRole: string }
	/** Os erros por caminho do campo, como os da API ("template.body", "variables.0.name"). */
	errors: Record<string, string>
	/** Altera as configurações da mensagem no rascunho. */
	edit: (mutate: (message: MessageSettings) => void) => void
}

/** As duas vagas da prévia: uma com tudo e outra sem os dados que costumam faltar, para ver os fallbacks. */
const SAMPLES = ['complete', 'partial'] as const
type Sample = (typeof SAMPLES)[number]

const SAMPLE_LABELS: Record<Sample, string> = { complete: 'com todos os dados', partial: 'sem empresa e local' }

/** A vaga de exemplo da prévia, com o cargo-alvo do perfil (assim ela parece uma vaga da área da pessoa). */
function sampleJob(sample: Sample, targetRole: string): TemplateJob {
	const job: TemplateJob = {
		title: targetRole.trim() || 'Analista de Marketing Digital',
		company: 'Loja Azul',
		location: 'Belo Horizonte, MG',
		workMode: 'hibrido',
		necessaryKnowledge: ['Excel', 'inglês intermediário'],
		applyLink: 'https://lojaazul.com.br/vagas/42',
		postLink: 'https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000000/',
		author: 'Ana Souza',
	}

	return sample === 'complete' ? job : { ...job, company: null, location: null, author: null, applyLink: null }
}

const OPTIONAL_JOB_VARIABLES = JOB_VARIABLES.filter(variable => variable.optional)

/**
 * O editor do modelo de mensagem, em Configurações › Mensagem: o assunto e a mensagem com o painel "Variáveis
 * disponíveis", as variáveis próprias, os fallbacks das variáveis que podem faltar e a prévia numa vaga de exemplo.
 */
export function MessageTemplateEditor({ message, profile, errors, edit }: MessageTemplateEditorProps) {
	const ids = { subject: useId(), body: useId(), warning: useId() }
	const subjectRef = useRef<HTMLInputElement>(null)
	const bodyRef = useRef<HTMLTextAreaElement>(null)
	const mirrorRef = useRef<HTMLDivElement>(null)
	// O último campo focado recebe a variável clicada no painel; sem nenhum ainda, ela entra no fim da mensagem
	const [lastField, setLastField] = useState<TemplateField | null>(null)
	const [sample, setSample] = useState<Sample>('partial')

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

	const groups: VariablePickerGroup[] = [
		{
			label: 'da vaga',
			variables: JOB_VARIABLES.map(variable => {
				const fallback = fallbacks[variable.name]?.trim()
				return {
					...variable,
					mayBeMissing: variable.optional && !fallback,
					hint: fallback ? `sem ${variable.name.replaceAll('_', ' ')} na vaga: ${fallback}` : undefined,
				}
			}),
		},
		{ label: 'do perfil', variables: [...PROFILE_VARIABLES] },
		{
			label: 'suas',
			variables: ownVariables.map(variable => ({
				name: variable.name.trim(),
				description: variable.description.trim() || (variable.type === 'link' ? 'Seu link' : 'Seu texto'),
				type: variable.type,
			})),
		},
	]

	const values = templateValues(sampleJob(sample, profile.targetRole), profile, ownVariables)
	const subjectParts = templateParts(template.subject, values, fallbacks)
	const bodyParts = templateParts(formatApplicationBody({ subject: '', body: template.body }, message.signature), values, fallbacks)
	const previewParts = [...subjectParts, ...bodyParts]
	const previewFallbacks = [...new Set(previewParts.filter(part => part.kind === 'fallback').map(part => part.name!))]
	const previewMissing = [...new Set(previewParts.filter(part => part.kind === 'missing').map(part => part.name!))]

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-1.5">
				<FieldLabel htmlFor={ids.subject}>assunto</FieldLabel>
				<Input
					ref={subjectRef}
					id={ids.subject}
					value={template.subject}
					invalid={!!errors['template.subject']}
					aria-describedby={errors['template.subject'] ? `${ids.subject}-error` : undefined}
					onFocus={() => setLastField('subject')}
					onChange={event => {
						const value = event.target.value
						edit(next => {
							next.template.subject = value
						})
					}}
				/>
				{errors['template.subject'] && <FieldError id={`${ids.subject}-error`}>{errors['template.subject']}</FieldError>}
			</div>

			<div className="flex flex-col gap-1.5">
				<FieldLabel htmlFor={ids.body}>mensagem</FieldLabel>
				{/* As variáveis que podem faltar e ainda não têm fallback ficam destacadas atrás do texto (um espelho do campo,
				 * com o texto transparente), que rola junto com ele */}
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
							{unsafe.map(name => `{{${name}}}`).join(', ')}: nem toda vaga tem. Sem fallback, a mensagem dessas vagas fica com
							um buraco marcado ([{unsafe[0]}]) e o envio espera você completar.
						</span>
					</p>
				)}
			</div>

			<VariablePicker groups={groups} onInsert={insert} linkDisabled={lastField === 'subject'} howTo={<HowTo />} />

			{renderOwnVariables()}
			{renderFallbacks()}

			{/* A prévia numa vaga de exemplo: mostra onde o fallback entrou e o que ficaria faltando */}
			<section aria-label="Prévia da mensagem" className="flex flex-col gap-3 rounded-sm border border-line p-3.5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className={LABEL}>prévia numa vaga de exemplo</span>
					<PillGroup role="group" aria-label="Vaga de exemplo">
						{SAMPLES.map(option => (
							<Pill key={option} pressed={sample === option} onClick={() => setSample(option)}>
								{SAMPLE_LABELS[option]}
							</Pill>
						))}
					</PillGroup>
				</div>
				<p className="m-0 text-sm font-semibold wrap-break-word">{renderParts(subjectParts)}</p>
				<p className="m-0 max-w-prose text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{renderParts(bodyParts)}</p>
				<p role="status" className="m-0 text-xs text-muted">
					{previewMissing.length === 0 && previewFallbacks.length === 0
						? 'Tudo preenchido com os dados da vaga.'
						: [
								previewFallbacks.length > 0 &&
									`Fallback em ${previewFallbacks.map(name => `{{${name}}}`).join(', ')} (em verde).`,
								previewMissing.length > 0 &&
									`Faltaria ${previewMissing.map(name => `{{${name}}}`).join(', ')} (em laranja): a modal avisa e não envia até você completar.`,
							]
								.filter(Boolean)
								.join(' ')}
				</p>
			</section>
		</div>
	)

	function renderOwnVariables() {
		return (
			<fieldset className={FIELDSET}>
				<legend className="mb-2.5 p-0 text-sm font-medium">suas variáveis</legend>
				<FieldHelp>
					Valores fixos que entram em toda mensagem, como o seu nome, o contato ou links. Use minúsculas sem acento e _ no nome
					(ex.: meu_nome, link_github). As de link só funcionam na mensagem.
				</FieldHelp>
				{variables.length > 0 && (
					<ul className="m-0 flex list-none flex-col gap-3 p-0">
						{variables.map((variable, index) => {
							const path = `variables.${index}`
							const rowError = errors[`${path}.name`] ?? errors[`${path}.value`] ?? errors[`${path}.description`]

							return (
								<li key={index} className="flex flex-col gap-1.5 rounded-sm border border-line p-3">
									<div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
										<Input
											aria-label={`Nome da variável ${index + 1}`}
											className="font-mono"
											placeholder="meu_nome"
											maxLength={OWN_VARIABLE_LIMITS.name}
											value={variable.name}
											invalid={!!errors[`${path}.name`]}
											onChange={event => {
												const value = event.target.value
												edit(next => {
													next.variables[index]!.name = value
												})
											}}
										/>
										<Input
											aria-label={`Descrição da variável ${index + 1}`}
											placeholder="Seu nome"
											maxLength={OWN_VARIABLE_LIMITS.description}
											value={variable.description}
											invalid={!!errors[`${path}.description`]}
											onChange={event => {
												const value = event.target.value
												edit(next => {
													next.variables[index]!.description = value
												})
											}}
										/>
									</div>
									<div className="flex items-center gap-2.5 max-sm:flex-wrap">
										<PillGroup role="group" aria-label={`Tipo da variável ${index + 1}`} className="shrink-0 flex-nowrap">
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
													{type === 'text' ? 'texto' : 'link'}
												</Pill>
											))}
										</PillGroup>
										<Input
											aria-label={`Valor da variável ${index + 1}`}
											className={cx('grow', variable.type === 'link' && 'font-mono')}
											placeholder={variable.type === 'link' ? 'https://github.com/voce' : 'Carla Lima'}
											maxLength={OWN_VARIABLE_LIMITS.value}
											value={variable.value}
											invalid={!!errors[`${path}.value`]}
											onChange={event => {
												const value = event.target.value
												edit(next => {
													next.variables[index]!.value = value
												})
											}}
										/>
										<IconButton
											label={`Apagar a variável ${variable.name || index + 1}`}
											onClick={() =>
												edit(next => {
													next.variables.splice(index, 1)
												})
											}
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
					onClick={() =>
						edit(next => {
							next.variables.push({ name: '', description: '', type: 'text', value: '' })
						})
					}
				>
					<Icon name="plus" size={14} />
					adicionar variável
				</Button>
			</fieldset>
		)
	}

	function renderFallbacks() {
		return (
			<fieldset className={FIELDSET}>
				<legend className="mb-2.5 p-0 text-sm font-medium">quando a vaga não tem</legend>
				<FieldHelp>
					O texto que entra no lugar da variável quando a IA não achou o dado no post. Vazio, a variável fica marcada na mensagem
					e o envio espera você completar.
				</FieldHelp>
				<div className="grid grid-cols-2 gap-x-5 gap-y-3 max-md:grid-cols-1">
					{OPTIONAL_JOB_VARIABLES.map(variable => {
						const id = `fallback-${variable.name}`
						const error = errors[`fallbacks.${variable.name}`]

						return (
							<div key={variable.name} className="flex flex-col gap-1.5">
								<FieldLabel htmlFor={id}>
									<span className="font-mono text-lime-text">{`{{${variable.name}}}`}</span>{' '}
									<span className="font-normal text-muted">{variable.description}</span>
								</FieldLabel>
								<Input
									id={id}
									placeholder={`sem fallback: fica [${variable.name}]`}
									value={fallbacks[variable.name] ?? ''}
									invalid={!!error}
									aria-describedby={error ? `${id}-error` : undefined}
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
			</fieldset>
		)
	}
}

/** O texto do campo com as variáveis destacadas (as que podem faltar e não têm fallback), para o espelho atrás dele. */
function highlight(text: string, tokens: { start: number; end: number }[]) {
	const nodes: ReactNode[] = []
	let last = 0
	for (const token of tokens) {
		nodes.push(text.slice(last, token.start))
		nodes.push(
			<mark key={token.start} className="rounded-xs bg-warn-bg text-transparent">
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
				<mark key={key} title={`fallback de {{${part.name}}}`} className="rounded-xs bg-lime-soft px-0.5 text-lime-text">
					{part.text}
				</mark>
			)
		}
		if (part.kind === 'missing') {
			return (
				<mark key={key} title={`a vaga não tem {{${part.name}}}`} className="rounded-xs bg-warn-bg px-0.5 text-warn">
					{part.text}
				</mark>
			)
		}
		return part.text
	})
}

/** O mini-tutorial do "como funciona", com um exemplo de modelo e o resultado preenchido. */
function HowTo() {
	return (
		<div className="flex flex-col gap-2 text-sm text-ink">
			<p className="m-0">
				Escreva a variável entre chaves duplas, como <code className="font-mono text-lime-text">{'{{empresa}}'}</code>. Ao abrir o
				contato de uma vaga, ela vira o dado da vaga.
			</p>
			<p className="m-0">
				<strong>Fallback</strong> é o texto usado quando a vaga não tem o dado. Defina em “quando a vaga não tem”, abaixo, ou na
				própria variável, depois de uma barra: <code className="font-mono text-lime-text">{'{{empresa | a sua empresa}}'}</code> (o
				da variável vale mais).
			</p>
			<p className="m-0">
				Sem o dado e sem fallback, a variável fica marcada na mensagem, como <code className="font-mono">[empresa]</code>, e o
				envio espera você completar ou apagar o trecho.
			</p>
			<div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
				<div className="flex flex-col gap-1 rounded-sm bg-surface p-2.5">
					<span className={LABEL}>modelo</span>
					<span className="font-mono text-xs">{'Vi a vaga de {{cargo}} na {{empresa | sua empresa}}, em {{local}}.'}</span>
				</div>
				<div className="flex flex-col gap-1 rounded-sm bg-surface p-2.5">
					<span className={LABEL}>numa vaga sem empresa e sem local</span>
					<span className="text-xs">
						Vi a vaga de Analista de Marketing na{' '}
						<mark className="rounded-xs bg-lime-soft px-0.5 text-lime-text">sua empresa</mark>, em{' '}
						<mark className="rounded-xs bg-warn-bg px-0.5 text-warn">[local]</mark>.
					</span>
				</div>
			</div>
		</div>
	)
}
