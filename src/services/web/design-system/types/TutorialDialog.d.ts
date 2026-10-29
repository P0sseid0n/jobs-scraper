/**
 * O tutorial numa modal (`<dialog>` nativo: foco preso, Esc e o clique fora fecham). Abre ao montar, por cima da tela:
 * o que já foi digitado embaixo continua lá.
 */
export interface TutorialDialogProps {
	title: string
	intro?: React.ReactNode
	paths: TutorialPath[]
	path?: string
	highlight?: string
	scene?: (path: string, step: TutorialStep) => React.ReactNode
	/** No último passo: fecha a modal e chama `onClick` (ex.: leva o foco ao primeiro campo). */
	done?: { label: string; onClick: () => void }
	/** Também chamado no Esc e no clique fora. */
	onClose: () => void
}

export declare const TutorialDialog: React.ComponentType<TutorialDialogProps>
