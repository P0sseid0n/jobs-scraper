import { cx } from '../../lib/cx'

/**
 * O padrão de carregamento dos campos: uma linha horizontal sobe e desce pelo campo, como um scanner, enquanto o
 * conteúdo dele não chega. Vai por cima do campo (`absolute inset-0` no `className`, dentro de um contêiner `relative`)
 * ou no lugar dele (com a altura no `className`). `label` diz o que carrega, para o leitor de tela. Com movimento
 * reduzido, a linha fica parada e pulsa.
 */
export function FieldScan({ label, className }: { label: string; className?: string }) {
	return (
		<div role="status" className={cx('pointer-events-none relative overflow-hidden', className)}>
			<span className="sr-only">{label}</span>
			<span
				aria-hidden="true"
				className="absolute inset-x-0 top-1/2 h-0.5 bg-lime-accent shadow-glow animate-field-scan motion-reduce:animate-pulse"
			/>
		</div>
	)
}
