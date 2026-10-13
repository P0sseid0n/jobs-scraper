/** Abertura da tela: título grande (a parte em mono vem em `<Hero.Mono>`), texto de apoio e, à direita, `aside`. */
export interface HeroProps {
	title: React.ReactNode
	lead: React.ReactNode
	aside?: React.ReactNode
}

export declare const Hero: React.ComponentType<HeroProps> & {
	Mono: React.ComponentType<{ children: React.ReactNode }>
}
