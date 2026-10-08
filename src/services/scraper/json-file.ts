/** Salva `data` como JSON formatado, criando os diretórios que faltarem. */
export async function saveJson(filePath: string, data: unknown) {
	return await Bun.write(filePath, JSON.stringify(data, null, 2))
}

/** Lê um JSON, ou devolve `fallback` se o arquivo não existir. */
export async function loadJson<T>(filePath: string, fallback: T): Promise<unknown> {
	const file = Bun.file(filePath)
	if (!(await file.exists())) return fallback
	return await file.json()
}
