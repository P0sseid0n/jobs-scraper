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
 * O passo a passo para configurar algo fora do site, em passos numerados, com o link para a página certa de cada
 * serviço. Com mais de um caminho, as abas escolhem o caminho.
 */
export interface TutorialProps {
	/** Prefixo dos ids das abas e dos passos, e o `id` da seção (focável): único na tela. */
	id: string
	title: string
	intro?: React.ReactNode
	paths: TutorialPath[]
	/** O caminho que abre escolhido (o primeiro, sem ele); acompanha quando muda. */
	path?: string
	/** O passo em destaque: recebe o foco e fica à vista ao mudar. */
	highlight?: string
	/** Mostra o botão de fechar; o Esc dentro do tutorial também fecha. */
	onClose?: () => void
	className?: string
}

export declare const Tutorial: React.ComponentType<TutorialProps>
