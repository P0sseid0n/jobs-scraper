/**
 * Os números que a paginação mostra: a primeira, a última e as vizinhas da atual, com "…" onde pula páginas (uma
 * página só no buraco aparece no lugar do "…", que não economizaria nada). Ex.: 1 … 4 5 6 … 12.
 */
export function pageItems(page: number, pages: number): (number | 'gap-start' | 'gap-end')[] {
	const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter(item => item >= 1 && item <= pages).sort((a, b) => a - b)
	const items: (number | 'gap-start' | 'gap-end')[] = []

	for (const item of shown) {
		const previous = items.at(-1)
		if (typeof previous === 'number' && item - previous === 2) items.push(previous + 1)
		else if (typeof previous === 'number' && item - previous > 2) items.push(item < page ? 'gap-start' : 'gap-end')
		items.push(item)
	}
	return items
}
