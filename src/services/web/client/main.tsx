import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { setFavicon } from './components/ProjectIcon'
import { router } from './router'
import { loadCvRequests } from './stores/cv'
import { connectLive } from './stores/live'

import './stores/theme'
import './tailwind.css'

setFavicon()
connectLive()
void loadCvRequests()

createRoot(document.getElementById('app')!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
)
