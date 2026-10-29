import { useId, type ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { useStore } from '../../lib/store'
import { variablePickerOpen } from '../../stores/variable-picker'
import { Icon, type IconName } from '../Icon'
import { badge } from './Badge'
import { Button } from './Button'
import { Disclosure } from './Disclosure'
import { pill } from './Pill'
import { StatusDot } from './StatusDot'
import { LABEL } from './text'

/** Uma variável do painel: o nome (sem as chaves), a descrição curta e o tipo. */
export type VariablePickerItem = {
	name: string
	description: string
	/** `link`: só funciona na mensagem; ganha a marca de link e fica desativada com `linkDisabled`. */
	type: 'text' | 'link'
	/** Pode faltar e ainda não tem fallback: ganha o ponto de alerta, explicado uma vez ("nem toda vaga tem") ao lado do grupo. */
	mayBeMissing?: boolean
	/** Uma dica abaixo da descrição (ex.: o fallback: "sem empresa na vaga: a sua empresa"). */
	hint?: string
}

/** O atalho de um grupo, ao lado do nome dele (ex.: "editar" nas variáveis próprias, que abre a modal delas). */
export type VariablePickerAction = {
	label: string
	onClick: () => void
	/** O ícone antes do rótulo (ex.: `plus` em "criar"). */
	icon?: IconName
	/** Um complemento depois do rótulo (ex.: "2/6"). */
	detail?: string
	/** O complemento por extenso, só para o leitor de tela (ex.: "2 de 6 definidos"). */
	detailLabel?: string
	/** Há erro no que o atalho abre: ganha o selo "corrigir". */
	invalid?: boolean
}

/** Um grupo do painel ("da vaga", "do perfil", "suas"); grupo vazio e sem atalho não aparece. */
export type VariablePickerGroup = {
	label: string
	variables: VariablePickerItem[]
	action?: VariablePickerAction
	/** O grupo sem variáveis vira um botão tracejado com este texto, que faz o mesmo que o atalho (e o substitui). */
	empty?: string
}

type VariablePickerProps = {
	groups: VariablePickerGroup[]
	/** Chamado com o nome da variável clicada: quem usa insere `{{nome}}` no último campo focado e devolve o foco a ele. */
	onInsert: (name: string) => void
	/** O campo de destino não aceita link (o assunto): as variáveis de link ficam desativadas, com a dica "só na mensagem". */
	linkDisabled?: boolean
	/** O mini-tutorial, aberto pelo link "como funciona" no fim do painel. */
	howTo?: ReactNode
	className?: string
}

/**
 * O painel "Variáveis disponíveis" de um editor de modelo: as variáveis em grade (duas colunas, uma no celular),
 * agrupadas, cada uma um botão que insere a variável (nome em cima, descrição embaixo, e um "+" no hover e no foco).
 * O clique não tira o foco do campo (o cursor fica onde estava); pelo teclado, Tab chega aos itens e Enter ou Espaço
 * inserem. O título mostra e esconde o painel (lembrado entre visitas).
 */
export function VariablePicker({ groups, onInsert, linkDisabled = false, howTo, className }: VariablePickerProps) {
	const titleId = useId()
	const listId = useId()
	const open = useStore(variablePickerOpen)

	return (
		<section aria-labelledby={titleId} className={cx('flex flex-col gap-3 rounded-sm bg-surface-2 p-3.5', className)}>
			<div className="flex flex-col gap-0.5">
				<h3 id={titleId} className="text-sm font-semibold">
					<button
						type="button"
						aria-expanded={open}
						aria-controls={listId}
						// O clique não tira o foco do campo: abrir o painel e clicar na variável a põe onde o cursor estava
						onMouseDown={event => event.preventDefault()}
						onClick={() => variablePickerOpen.set(!open)}
						className="flex w-full items-center justify-between gap-3 text-left hover:text-ink"
					>
						Variáveis disponíveis
						<Icon
							name="chevron"
							size={14}
							className={cx('text-muted transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')}
						/>
					</button>
				</h3>
				<p className="text-xs text-muted">
					{open
						? 'Clique para inserir no último campo selecionado.'
						: 'Abra para inserir uma variável com um clique, criar as suas ou definir os fallbacks.'}
				</p>
			</div>

			<div id={listId} hidden={!open} className="flex flex-col gap-3">
				{groups
					.filter(group => group.variables.length > 0 || group.action)
					.map(group => {
						const emptyAction = group.variables.length === 0 && group.empty ? group.action : undefined

						return (
							<div key={group.label} className="flex flex-col gap-1">
								<div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
									<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
										<span className={LABEL}>{group.label}</span>
										{group.variables.some(variable => variable.mayBeMissing) && (
											<span className="flex items-center gap-1.5 text-xs text-muted">
												<StatusDot className="text-warn" />
												nem toda vaga tem
											</span>
										)}
									</span>
									{group.action && !emptyAction && (
										<Button
											variant="ghost"
											size="sm"
											aria-haspopup="dialog"
											// O clique não tira o foco do campo: ao fechar a modal, o cursor volta para onde estava
											onMouseDown={event => event.preventDefault()}
											onClick={group.action.onClick}
										>
											{group.action.icon && <Icon name={group.action.icon} size={14} />}
											{group.action.label}
											{group.action.detail && (
												<span aria-hidden={group.action.detailLabel ? true : undefined} className="font-mono text-muted">
													{group.action.detail}
												</span>
											)}
											{group.action.detailLabel && <span className="sr-only">{group.action.detailLabel}</span>}
											{group.action.invalid && <span className={badge({ tone: 'warn', size: 'xs' })}>corrigir</span>}
										</Button>
									)}
								</div>
								{emptyAction && (
									<button
										type="button"
										aria-haspopup="dialog"
										onMouseDown={event => event.preventDefault()}
										onClick={emptyAction.onClick}
										className={pill({ shape: 'row', className: 'w-full gap-2 border-dashed bg-transparent text-muted hover:text-ink' })}
									>
										<Icon name="plus" size={14} />
										{group.empty}
									</button>
								)}
								<ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-0.5 p-0 max-sm:grid-cols-1">
									{group.variables.map(variable => {
										const disabled = linkDisabled && variable.type === 'link'

										return (
											<li key={variable.name} className="min-w-0">
												<button
													type="button"
													disabled={disabled}
													// O clique não tira o foco do campo: a variável entra onde o cursor está
													onMouseDown={event => event.preventDefault()}
													onClick={() => onInsert(variable.name)}
													className={cx(
														'group flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition',
														'hover:bg-surface focus-visible:bg-surface disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent',
													)}
												>
													<span className="flex min-w-0 flex-1 flex-col gap-0.5">
														<span className="flex max-w-full items-center gap-1.5">
															<span className="font-mono break-all text-lime-text">{`{{${variable.name}}}`}</span>
															{variable.type === 'link' && (
																<>
																	<Icon name="link" size={13} className="text-muted" />
																	<span className="sr-only">(link)</span>
																</>
															)}
															{variable.mayBeMissing && (
																<>
																	<StatusDot className="text-warn" />
																	<span className="sr-only">(nem toda vaga tem)</span>
																</>
															)}
														</span>
														<span className="text-xs text-muted">{variable.description}</span>
														{(disabled || variable.hint) && (
															<span className="text-xs text-muted">{disabled ? 'só na mensagem' : variable.hint}</span>
														)}
													</span>
													{!disabled && (
														<Icon
															name="plus"
															size={14}
															className="text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
														/>
													)}
												</button>
											</li>
										)
									})}
								</ul>
							</div>
						)
					})}

				{howTo && <Disclosure summary="como funciona">{howTo}</Disclosure>}
			</div>
		</section>
	)
}
