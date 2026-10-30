import { cx } from '../../lib/cx'

/**
 * O padrão de carregamento dos campos e de tudo o que está sendo gerado na hora (a IA escrevendo); o `Skeleton` fica para
 * os dados que vêm do servidor, e o que já aparece pronto não ganha onda por cima. Uma onda larga e desfocada, num tom perto do fundo e um pouco inclinada (o lado
 * direito mais alto), atravessa o campo de cima para baixo e de baixo para cima, como um scanner, enquanto o conteúdo dele não chega, com o
 * que está acontecendo (`label`) escrito no centro. Vai por cima do campo (`absolute inset-0` no `className`, dentro de
 * um contêiner `relative`) ou no lugar dele (com a altura no `className`). O campo esperando fica só de leitura
 * (`readOnly`, `aria-busy`), não desligado: o visual de desligado é para o que não se pode usar, não para o que ainda está
 * chegando. Com movimento reduzido, a onda fica parada
 * no meio e pulsa.
 */
export function FieldScan({ label, className }: { label: string; className?: string }) {
	return (
		<div
			role="status"
			className={cx('pointer-events-none relative flex items-center justify-center overflow-hidden p-4', className)}
		>
			{/*
			 * Mais larga que o campo (`-inset-x-8`) para a inclinação não mostrar as pontas; o `lime-soft`, o tom suave de
			 * destaque, fica perto do fundo nos dois temas
			 */}
			<span
				aria-hidden="true"
				className="absolute -inset-x-8 top-1/5 h-3/5 -rotate-2 bg-linear-to-b from-transparent via-lime-soft to-transparent blur-md animate-field-scan motion-reduce:animate-pulse"
			/>
			{/* Por cima da onda (vem depois dela), para a onda passar por trás do texto */}
			<span className="relative text-center text-sm text-muted">{label}</span>
		</div>
	)
}
