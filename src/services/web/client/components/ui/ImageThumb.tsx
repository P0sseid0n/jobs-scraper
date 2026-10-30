import type { CSSProperties, ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
import { PRESS } from './press'

type ImageThumbProps = {
	/** O que o clique faz, para o leitor de tela e a dica do mouse ("ampliar imagem 1 de 3 do post"). */
	label: string
	/** Abre a imagem grande (em geral, o `ImageViewer`). */
	onOpen: () => void
	/** Ainda não dá para ampliar (a imagem grande não existe): sem zoom nem clique. */
	disabled?: boolean
	/** Borda, raio e fundo da moldura; o tamanho vem da imagem de dentro ou daqui. */
	className?: string
	style?: CSSProperties
	/** A imagem: um `<img>` ou o que for desenhado no lugar dela (a prévia da imagem da vaga é o próprio card). */
	children: ReactNode
}

/**
 * Miniatura de imagem que amplia no clique: no hover (ou com o foco do teclado), a miniatura inteira cresce de leve, com
 * a moldura, e aparece o ícone de ampliar no canto; apertada, afunda como os botões. O botão cobre a miniatura por cima,
 * para a imagem de dentro poder ser qualquer coisa (um `<button>` só aceita texto e imagem dentro). Quem a contém precisa
 * de uns 4px de folga em volta, ou o crescimento é cortado.
 */
export function ImageThumb({ label, onOpen, disabled = false, className, style, children }: ImageThumbProps) {
	return (
		<div
			className={cx(
				'group relative overflow-hidden',
				!disabled && PRESS,
				!disabled && 'hover:scale-103 has-focus-visible:scale-103 motion-reduce:hover:scale-100',
				className,
			)}
			style={style}
		>
			{children}
			<button
				type="button"
				className="absolute inset-0 cursor-zoom-in -outline-offset-2 disabled:cursor-default"
				aria-label={label}
				title={label}
				aria-haspopup="dialog"
				disabled={disabled}
				onClick={onOpen}
			/>
			{!disabled && (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute right-2 bottom-2 grid size-7 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-has-focus-visible:opacity-100 pointer-coarse:hidden"
				>
					<Icon name="expand" size={14} />
				</span>
			)}
		</div>
	)
}
