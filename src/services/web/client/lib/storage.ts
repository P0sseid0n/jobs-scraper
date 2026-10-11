/** localStorage que nunca lança (aba anônima, armazenamento bloqueado): sem ele, a interface só esquece as preferências. */
export const storage = {
	get<T>(key: string, fallback: T): T {
		try {
			const value = localStorage.getItem(key)
			return value === null ? fallback : (JSON.parse(value) as T)
		} catch {
			return fallback
		}
	},

	set(key: string, value: unknown) {
		try {
			localStorage.setItem(key, JSON.stringify(value))
		} catch {
			// preferência não salva; segue funcionando
		}
	},
}
