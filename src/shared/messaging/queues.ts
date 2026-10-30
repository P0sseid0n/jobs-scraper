/** Filas do pipeline: cada uma tem o nome do serviço que a consome. */
export const QUEUES = {
	postProcessing: 'post-processing',
	/** Legada: vagas enviadas ao antigo serviço storage; o post-processing esvazia e depois ela sai. */
	storage: 'storage',
	/** Vagas para o discord-bot publicar (ligada à exchange `job-published`). */
	discord: 'discord',
	cvUpdater: 'cv-updater',
	/**
	 * Validações do currículo base, também consumidas pelo cv-updater. Ficam fora da `cv-updater` para não esperar um
	 * currículo em geração: validar é só compilar, leva segundos.
	 */
	cvUpdaterBase: 'cv-updater-base',
	/** Currículos em PDF para preencher o formulário do currículo base, também consumidos pelo cv-updater. */
	cvUpdaterImport: 'cv-updater-import',
	/** Currículos prontos para o discord-bot entregar (é o `replyTo.queue` dos pedidos dele). */
	discordCv: 'discord-cv',
	/** Comandos para o scraper (ex.: "coletar agora" vindo de outras fontes). */
	scraper: 'scraper',
	/** Códigos de verificação do login do LinkedIn, enviados por `bun scraper:verify <código>`. */
	scraperVerification: 'scraper-verification',
	/** Testes do login do LinkedIn pedidos pelo site (fora da `scraper`, para funcionar também na coleta única). */
	scraperLoginTest: 'scraper-login-test',
	/** Vagas de posts com várias vagas, para o scraper abrir o link de cada uma (`JobLookup`). */
	scraperLookup: 'scraper-lookup',
	/** Posts para o scraper ler de novo, pedidos pelo "processar de novo" do site (`PostReread`). */
	scraperPost: 'scraper-post',
	/** Vagas para o site repassar ao navegador em tempo real (ligada à exchange `job-published`). */
	web: 'web',
	/** Currículos prontos pedidos pelo site (é o `replyTo.queue` dos pedidos dele). */
	webCv: 'web-cv',
	/** Validações do currículo base pedidas pelo site (é o `replyTo.queue` delas). */
	webCvBase: 'web-cv-base',
	/** Currículos em PDF lidos para o formulário, pedidos pelo site (é o `replyTo.queue` deles). */
	webCvImport: 'web-cv-import',
	/** Coletas que começaram ou terminaram, para o site atualizar na hora (ligada à exchange `scraper-run`). */
	webScraperRun: 'web-scraper-run',
	/** Candidaturas marcadas fora do site (o botão do Discord), para o site avisar os navegadores abertos. */
	webApplied: 'web-applied',
	/** Resultados do "processar de novo" de uma vaga, do scraper e do post-processing (`JobReprocessResult`). */
	webReprocess: 'web-reprocess',
	/** Candidaturas para o mailer enviar por e-mail (`MailRequest`). */
	mailer: 'mailer',
	/** Resultados dos envios pedidos pelo site (é o `replyTo.queue` dos pedidos dele). */
	webMail: 'web-mail',
	/** Resultados dos envios pedidos pelo Discord (é o `replyTo.queue` dos pedidos dele). */
	discordMail: 'discord-mail',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

/**
 * Eventos (exchanges fanout): cada canal interessado liga a própria fila na exchange e recebe todas as mensagens.
 * Quem publica não sabe quais canais existem.
 */
export const EXCHANGES = {
	/** Vaga nova salva no banco, pronta para ser divulgada. */
	jobPublished: 'job-published',
	/** Coleta que começou ou terminou (`ScraperRunEvent`). */
	scraperRun: 'scraper-run',
} as const

export type ExchangeName = (typeof EXCHANGES)[keyof typeof EXCHANGES]

export function retryQueueName(queue: string) {
	return `${queue}.retry`
}

export function deadLetterQueueName(queue: string) {
	return `${queue}.dlq`
}
