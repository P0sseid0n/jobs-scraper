export async function saveJson(filePath: string, data: any) {
	return await Bun.write(filePath, JSON.stringify(data, null, 2))
}

export async function loadJson(filePath: string) {
	return await Bun.file(filePath).json()
}
