O site do jobs-scraper: vagas de front-end coletadas do LinkedIn, lidas por uma IA e mostradas numa lista com filtros, o detalhe de cada vaga, o acompanhamento das coletas e as configurações. A interface é clara e direta, em português, com um único acento de cor (o lime) sobre neutros esverdeados.

## Texto

- Português do Brasil, frases curtas, sem ponto de exclamação e sem emoji.
- Botões, pills, links e rótulos em **minúsculas**: "gerar currículo", "limpar filtros", "tentar de novo", "mostrar post completo". Títulos começam com maiúscula ("Nenhuma vaga com esses filtros", "Sair sem salvar?").
- Rótulos de seção e de filtro em mono, minúsculos e em `color-muted` (`LABEL`): "modalidade", "regime", "período".
- Fale da vaga, não do sistema: "Não consegui carregar as vagas", "A IA citou o que não está escrito no post".
- Números e contadores em mono (`PILL_COUNT`, badges).

## Cores

- O fundo da página é `color-bg`; cards, campos e painéis ficam em `color-surface` com borda `color-line`; o rebaixado (hover, faixas) é `color-surface-2`.
- Texto principal em `color-ink`, secundário em `color-muted`. Links sublinhados em `color-ink`, que viram `color-lime-text` no hover.
- `color-lime` é a marca: o botão principal (Button `lime`, texto `color-lime-ink`), pontos de status ao vivo e destaques. Uma ação lime por área; o resto é `ghost`.
- Estados: aviso em `color-warn` sobre `color-warn-bg`; erro em `color-danger` sobre `color-danger-bg`; sucesso em `color-ok` sobre `color-ok-bg`. Sempre com texto ou ícone junto, nunca só a cor.
- A superfície invertida (a classe `inverted`, sobre `color-inv-bg`) destaca uma coisa só: o card de vaga selecionado, o card da coleta, a bandeja de currículos. Ela redefine os tokens por dentro, então os componentes ali já saem na versão escura.
- O tema escuro troca os mesmos tokens (`data-theme="dark"` no `<html>`); `color-lime` não muda.
- O contorno de foco é `color-focus` (2px, afastado 2px), com pelo menos 3:1 sobre as superfícies nos dois temas.

## Tipografia

- Geist para a interface (`sans`) e Geist Mono para rótulos, números e badges (`mono`), as duas do Google Fonts.
- O padrão da interface é `ui` (14px). Texto corrido em `body` (16px). Metadados e badges em `small` (12px).
- Títulos: `hero` uma vez por tela (com a parte final em mono, `Hero.Mono`), `title` no detalhe, `section-title` nas seções, `card-title` nos cards.

## Espaço, raios e sombra

- Escala padrão do Tailwind, de 4px em 4px (`spacing`): `gap-1.5` entre pills e badges, `gap-2.5` dentro de um campo, `gap-4` a `gap-7` entre blocos. O `Page` já dá as margens e o `gap-7` entre os blocos da tela. O padding de um card vem de `card({ size })`: `lg` (`p-7`) nas seções com formulário e na vaga aberta, `md` (`px-5 py-4.5`) nas faixas de destaque e nos cards de vaga, `sm` (`px-4 py-3.5`) nos itens de lista.
- Raios: `radius-pill` em botões, pills e badges; `radius-sm` nos campos; `radius-md` nos avisos; `radius-lg` em cards e modais.
- Bordas finas (`color-line`) em vez de sombras. Só o que flutua (modal, toast, bandeja) tem sombra: `elevation`.
- Desktop-first: no celular (até 860px, `max-md:`) as colunas viram uma, a lista e o detalhe viram páginas separadas e os filtros ficam recolhidos num card, abertos pelo botão "filtros".

## Ícones

- Use o componente `Icon` pelo nome (`search`, `mail`, `external`, `file`, `copy`, `check`, `close`, `download`, `moon`, `sun`, `back`, `alert`, `refresh`, `briefcase`, `settings`, `filter`, `trash`, `plus`, `flag`, `spinner`): traço de 1.8, 24×24 reduzido para 16px, na cor do texto.
- Botão só com ícone é `IconButton`, sempre com `label`. Sem emoji.
- Não há logo: o nome do produto aparece em texto.

## Componentes e classes

- Os componentes estão em `window.JobsScraperUI` (React 18). O estilo vem do `bundle.css`: o Tailwind 4 compilado do site, com o preflight, os tokens (`--color-*`, `--radius-*`, `--font-sans`, `--font-mono`) e as classes que o site usa.
- Além delas, o `bundle.css` traz utilitários comuns da escala padrão para o layout em volta dos componentes: `flex`, `grid`, `grid-cols-1` a `6`, `gap-*`, `p-*`, `m-*`, `w-*`, `max-w-*`, `text-xs` a `text-5xl`, `font-*`, `bg-*`/`text-*`/`border-*` com os tokens (`bg-surface`, `text-muted`, `border-line`), `rounded-*` e os prefixos `max-md:`, `md:` e `lg:`. No layout, prefira essas classes ou `var(--color-*)`; nunca cores soltas.
- Para um elemento que não é um componente mas deve ter a cara de um, use as funções de classe: `badge()` (ex.: `<li className={badge()}>`), `pill()`, `field()`, `card()` e `pageFrame()` (a largura e as margens do `Page`, para uma barra fixa ou o cabeçalho), e as constantes `LABEL`, `SECTION_TITLE`, `FIELDSET` e `PILL_COUNT`.
- Junte classes com `cx` (resolve conflitos entre classes do Tailwind).
- **Carregando:** um campo cujo conteúdo ainda não chegou usa o `FieldScan` (uma onda desfocada, no `lime-soft` (perto do tom do fundo) e um pouco inclinada, que atravessa o campo de cima para baixo e de baixo para cima, como um scanner, com o que está acontecendo escrito no centro), nunca um spinner ou um "carregando…" dentro dele; uma área inteira (lista, card) usa o `Skeleton`.
