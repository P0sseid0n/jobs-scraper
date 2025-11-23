export default interface AiJsonResponse {
	title: string | null
	company: string | null
	location: string | null
	link: string | null
	necessary_knowledge: Array<string> | null
	recruiter_email: string | null
	rawContent: string
	aiJobConfidence: number
}
