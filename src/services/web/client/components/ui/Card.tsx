import { tv } from '../../lib/cx'

/** A caixa com borda das telas (`<section className={card({ size: 'lg' })}>`); o espaçamento interno vem de `size`. */
export const card = tv({
	base: 'rounded-lg border border-line bg-surface shadow-soft',
	variants: {
		/**
		 * `lg`: seções com formulário e a vaga aberta. `md`: faixas de destaque e os cards da lista de vagas. `sm`: itens de
		 * uma lista (currículos, versões, termos da coleta). Sem `size`, sem padding (tabela, esqueleto, estado vazio).
		 */
		size: { lg: 'p-7 max-md:p-4.5', md: 'px-5 py-4.5 max-md:p-4', sm: 'px-4 py-3.5' },
		/** Contorno vermelho: o item falhou (currículo, termo da coleta). */
		failed: { true: 'border-danger' },
	},
})
