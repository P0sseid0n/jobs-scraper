/** Um passo do tutorial: o que fazer, em uma linha, e o detalhe de onde clicar. */
export interface TutorialStep {
	/** Liga o passo a quem aponta para ele (ex.: o teste que falhou destaca o passo da senha de app). */
	id: string
	title: string
	text?: string
	/** A página do serviço onde o passo acontece; abre em outra aba. */
	link?: { href: string; label: string }
	/** Os valores para copiar no formulário ou no serviço (ex.: servidor e porta). */
	values?: { label: string; value: string }[]
}

/** Um caminho do tutorial (ex.: Gmail ou Outlook); com mais de um, cada caminho vira uma aba. */
export interface TutorialPath {
	id: string
	label: string
	/** Um aviso antes dos passos: para quem o caminho não serve (ex.: as contas pessoais da Microsoft). */
	notice?: string
	steps: TutorialStep[]
}

/**
 * O passo a passo para configurar algo fora do site: um passo por vez, na horizontal, com a animação do passo de um
 * lado e, do outro, o que fazer e o link para a página certa do serviço. Os números no topo levam a qualquer passo; com
 * mais de um caminho, as abas escolhem o caminho (ou quem usa, com `path`).
 */
export interface TutorialProps {
	/** Prefixo dos ids das abas e dos passos, e o `id` da seção (focável): único na tela. */
	id: string
	title: string
	intro?: React.ReactNode
	paths: TutorialPath[]
	/** O caminho escolhido fora do tutorial (ex.: o provedor da conta de e-mail): sem as abas. Sem ele, as abas escolhem. */
	path?: string
	/** O passo em destaque: vai para ele, com o foco, ao mudar (ex.: o teste que falhou aponta o passo que resolve). */
	highlight?: string
	/** A animação do passo, ao lado do texto (acima dele, no estreito); sem ela, só o texto. */
	scene?: (path: string, step: TutorialStep) => React.ReactNode
	/** Mostra o botão de fechar; o Esc dentro do tutorial também fecha. */
	onClose?: () => void
	className?: string
}

export declare const Tutorial: React.ComponentType<TutorialProps>
