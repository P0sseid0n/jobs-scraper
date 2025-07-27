import puppeteer from 'puppeteer'
import amqplib from 'amqplib'

process.loadEnvFile()

const searchFilters = {
	keywords: ['Front End', 'Vue'],
}

function wait(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function buildQueryString(filters: typeof searchFilters) {
	const params = new URLSearchParams()

	filters.keywords.unshift('vaga')

	if (filters.keywords) {
		params.append('keywords', filters.keywords.join(' '))
	}

	return '?' + params.toString()
}

;(async function () {
	const connection = await amqplib.connect('amqp://user:user@localhost')
	const channel = await connection.createChannel()

	const queue = 'post_processing'
	await channel.assertQueue(queue)

	const browser = await puppeteer.launch({ headless: false })
	const page = await browser.newPage()

	const searchPath = '/search/results/all'

	await page.goto('https://www.linkedin.com' + searchPath + buildQueryString(searchFilters))

	if (page.url().includes('/login')) {
		await page.waitForSelector('form.login__form')

		const email = process.env.LINKEDIN_EMAIL
		const password = process.env.LINKEDIN_PASSWORD

		if (!email || !password) {
			console.error('Please set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in your .env file')
			await browser.close()
			return
		}

		await page.type('form #username', email)
		await page.type('form #password', password)
		await page.click('form button[type="submit"]')

		while (!page.url().includes(searchPath)) {
			console.log('Waiting for login to complete...')
			await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 3000 }).catch(() => {})
		}

		console.log('Login successful, navigating to search results...')
		await page.waitForSelector('li.search-results__search-feed-update')
		console.log('Search results loaded, starting to scrape...')

		let totalScrapped = 0

		while (true) {
			console.log(`Scrolling... Attempt ${totalScrapped}`)

			try {
				const vagas = await page.evaluate(totalScrapped => {
					const vagas: string[] = []
					// TODO: Testar porque as vezes volta poucas vagas
					// TODO: Pegar data de postagem
					Array.from(document.querySelectorAll('.update-components-text.relative.update-components-update-v2__commentary'))
						.slice(totalScrapped)
						.forEach(el => {
							if (el instanceof HTMLDivElement) {
								vagas.push(el.innerText || '')
							} else {
								vagas.push(el.textContent || '')
							}
						})

					// TODO: Avaliar quanto deve ser feito o scroll
					window.scrollTo(0, document.body.scrollHeight)

					return vagas.map(item => item.replace(/\n/g, ''))
				}, totalScrapped)
				// TODO: Identificar quando acabar as vagas

				const loadMoreBtn = await page.$(
					'button.artdeco-button.artdeco-button--muted.artdeco-button--1.artdeco-button--full.artdeco-button--secondary.ember-view.scaffold-finite-scroll__load-button'
				)

				if (loadMoreBtn) {
					await loadMoreBtn.click()
				}

				totalScrapped += vagas.length

				console.log(`Found ${vagas.length} vagas in this scroll, total: ${totalScrapped}`)
				console.log(vagas)

				vagas.forEach(vaga => {
					console.log('Sending vaga to queue:', vaga)
					channel.sendToQueue(queue, Buffer.from(JSON.stringify(vaga)))
				})

				await wait(10_000)
			} catch (error) {
				console.error('Error while scraping:', error)
				break
			}
		}

		await browser.close()
	}
})()

// https://www.linkedin.com/jobs/search/?currentJobId=4275789186&f_TPR=r86400&f_WT=2&keywords=Front%20End%20NOT%20Estagio%20NOT%20Junior%20NOT%20Senior
