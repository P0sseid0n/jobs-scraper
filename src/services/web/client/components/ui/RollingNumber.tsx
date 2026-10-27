import { cx } from '../../lib/cx'

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * Número que rola como um odômetro quando muda: cada algarismo é uma coluna de 0 a 9 que desliza até o novo. As
 * colunas contam da direita (as unidades continuam as mesmas quando o número ganha uma casa). O leitor de tela lê o
 * número inteiro, uma vez.
 */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
	const text = value.toLocaleString('pt-BR')
	const chars = [...text]

	return (
		<span className={cx('inline-flex tabular-nums', className)}>
			<span className="sr-only">{text}</span>
			{chars.map((char, index) => {
				const key = chars.length - index
				const digit = DIGITS.indexOf(char)
				if (digit < 0) {
					return (
						<span key={key} aria-hidden="true">
							{char}
						</span>
					)
				}

				return (
					<span key={key} aria-hidden="true" className="relative inline-block h-lh overflow-hidden">
						{/* Ocupa a largura de um algarismo; a coluna fica por cima */}
						<span className="invisible">0</span>
						<span
							className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-700 ease-glide motion-reduce:transition-none"
							style={{ transform: `translateY(${-digit * 10}%)` }}
						>
							{DIGITS.map(item => (
								<span key={item}>{item}</span>
							))}
						</span>
					</span>
				)
			})}
		</span>
	)
}
