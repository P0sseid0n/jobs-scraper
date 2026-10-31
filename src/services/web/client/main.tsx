import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { setFavicon } from './components/ProjectIcon'
import { followPointerGlow } from './lib/pointer-glow'
import { redirectLegacyPath, router } from './router'
import { loadCvRequests } from './stores/cv'
import { connectLive } from './stores/live'
import { loadLocale } from './stores/locale'
import { importLocalSeen } from './stores/viewed'

import './stores/theme'
import './tailwind.css'

// Os endereços de antes das rotas em inglês (favoritos, links antigos) levam à tela de hoje
redirectLegacyPath()
setFavicon()
connectLive()
followPointerGlow()
void loadLocale()
void loadCvRequests()
void importLocalSeen()

createRoot(document.getElementById('app')!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
)
