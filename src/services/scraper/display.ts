/**
 * Diz se dá para abrir uma janela do navegador. No Linux depende de um servidor gráfico (no Docker não há);
 * no Windows e no macOS sempre dá.
 */
export function canOpenWindow(platform: NodeJS.Platform = process.platform, env: Record<string, string | undefined> = process.env) {
	if (platform !== 'linux') return true

	return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY)
}
