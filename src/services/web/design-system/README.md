# 🎨 design-system

O design system do site no Claude Design: os componentes de `client/components/ui`, o `Icon` e os tokens do `tailwind.css`, publicados como um artefato do tipo "Design System" e instalados no canvas de telas do site. No canvas, as telas montam os componentes de verdade (`window.JobsScraperUI`), então uma mudança desenhada lá corresponde a um componente e a uma prop daqui.

[← voltar ao README do web](../README.md)

- **Design system:** https://claude.ai/artifact/BbaqNEDtnsCWNgWFEJbwNz
- **Canvas das telas:** https://claude.ai/artifact/RtdQpvaxRxkEfJWfAaZHPx (instala o design system em `project/ds/jobsscraperui/`)

## Gerar

```sh
bun design-system
```

Gera `dist/` (fora do git):

- `bundle.js`: um script clássico que põe os componentes em `window.JobsScraperUI` e usa o React da página (o canvas tem React 18);
- `bundle.css`: o `tailwind.css` compilado, com os tokens, o preflight, as classes do site e utilitários comuns para o layout das telas (lista em `ds.css`);
- `index.d.ts`: as props de cada componente, de `types/`;
- `artifact/project/`: os arquivos do design system prontos para publicar (README, tokens, bundle, prévias e orientações de cada componente, capa).

Publicar `dist/artifact/project/` no design system e copiar `bundle.js`, `bundle.css` e `tokens.json` para o canvas é feito pelo Claude Code, com a ferramenta de artefatos.

## Arquivos

- `index.ts`: o que o design system expõe. `ButtonLink` e `RouteLink` ficam de fora porque só funcionam dentro do TanStack Router; no canvas, use `Button` com `href` e `TextLink`.
- `types/<Comp>.d.ts`: o contrato de cada componente (`<Comp>Props`), que o agente de design lê. Escrito à mão a partir do componente: **atualize junto quando mudar as props**. Cada arquivo vira um item do cabeçalho do `bundle.js`.
- `tokens.json`: os tokens no formato do design system (cores dos dois temas, tipografia, raios, sombra, breakpoints), com os mesmos valores do `@theme` do `tailwind.css`: **atualize junto quando mudar um token**.
- `brand.md`: o README do design system (texto, cores, tipografia, espaço, ícones, como usar as classes).
- `guides.ts` e `make-previews.ts`: as orientações e as prévias ao vivo de cada componente.
- `cover.html`: a capa do design system.

## Do canvas para o código

As telas do canvas marcam com `data-ds` os trechos que correspondem a algo do código e não são um componente montado (por exemplo `Header`, `Page`, `Hero`, `JobCard`, `JobDetail`, `WorkModeBadge`, `CvTray`, `card`, `LABEL`, `FIELDSET`, `SECTION_TITLE`). Os `x-import` com `JobsScraperUI.<Comp>` são os componentes de `components/ui`, e os atributos deles são as props.
