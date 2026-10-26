import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { setFavicon } from './components/ProjectIcon'
import { followPointerGlow } from './lib/pointer-glow'
import { router } from './router'
import { loadCvRequests } from './stores/cv'
import { connectLive } from './stores/live'
import { importLocalSeen } from './stores/viewed'

import './stores/theme'
import './tailwind.css'

setFavicon()
connectLive()
followPointerGlow()
void loadCvRequests()
void importLocalSeen()

createRoot(document.getElementById('app')!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
)
