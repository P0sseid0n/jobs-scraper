import { useId, type ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { useStore } from '../../lib/store'
import { variablePickerOpen } from '../../stores/variable-picker'
import { Icon } from '../Icon'
import { badge } from './Badge'
import { Disclosure } from './Disclosure'
import { LABEL } from './text'

/** Uma variável do painel: o nome (sem as chaves), a descrição curta e o tipo. */
export type VariablePickerItem = {
	name: string
	description: string
	/** `link`: só funciona na mensagem; ganha a marca de link e fica desativada com `linkDisabled`. */
	type: 'text' | 'link'
	/** Pode faltar e ainda não tem fallback: mostra o selo "nem toda vaga tem". */
	mayBeMissing?: boolean
	/** Uma dica abaixo da descrição (ex.: o fallback: "sem empresa na vaga: a sua empresa"). */
	hint?: string
}

/** Um grupo do painel ("da vaga", "do perfil", "suas"); grupo vazio não aparece. */
export type VariablePickerGroup = { label: string; variables: VariablePickerItem[] }

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
 * agrupadas, cada uma um botão que insere a variável. O clique não tira o foco do campo (o cursor fica onde estava);
 * pelo teclado, Tab chega aos itens e Enter ou Espaço inserem. O título mostra e esconde o painel (lembrado entre visitas).
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
						? 'Clique para inserir no último campo selecionado. Variáveis de link funcionam apenas na mensagem.'
						: 'Abra para inserir uma variável com um clique.'}
				</p>
			</div>

			<div id={listId} hidden={!open} className="flex flex-col gap-3">
				{groups
					.filter(group => group.variables.length > 0)
					.map(group => (
						<div key={group.label} className="flex flex-col gap-1">
							<span className={LABEL}>{group.label}</span>
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
													'flex w-full min-w-0 flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm transition',
													'hover:bg-surface focus-visible:bg-surface disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent',
												)}
											>
												<span className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1">
													<span className="font-mono break-all text-lime-text">{`{{${variable.name}}}`}</span>
													{variable.type === 'link' && (
														<>
															<Icon name="link" size={13} className="text-muted" />
															<span className="sr-only">(link)</span>
														</>
													)}
													<span className="text-muted">{variable.description}</span>
													{variable.mayBeMissing && (
														<span className={badge({ tone: 'warn', size: 'xs' })}>nem toda vaga tem</span>
													)}
												</span>
												{(disabled || variable.hint) && (
													<span className="text-xs text-muted">{disabled ? 'só na mensagem' : variable.hint}</span>
												)}
											</button>
										</li>
									)
								})}
							</ul>
						</div>
					))}

				{howTo && <Disclosure summary="como funciona">{howTo}</Disclosure>}
			</div>
		</section>
	)
}
