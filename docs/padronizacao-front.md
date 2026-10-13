# Padronização do front

Auditoria de `src/services/web/client` (out/2026). Os caminhos abaixo são relativos a essa pasta; as linhas de CSS são do `styles.css` da auditoria (antes da fase 1) e servem para localizar a regra pelo nome.

Os componentes `Button`, `IconButton` e `Pill` (`components/ui`) já cobrem os botões principais. O que falta padronizar está nos links que viram botão, nas "cápsulas" pequenas, nos campos de formulário e nos valores fixos do CSS.

Legenda: 🟢 sem mudança visual · 🟡 muda o visual um pouco (mostrar antes de aplicar)

---

## Objetivo: trocar o `styles.css` por Tailwind

A padronização é também a migração para o Tailwind (já instalado: veja `tailwind.css` e o README do web). **Cada etapa troca classes do `styles.css` por classes do Tailwind, até o `styles.css` ficar vazio** e poder ser apagado.

Regras para todas as fases:

- **Trocar e apagar juntos:** ao migrar um elemento, a regra correspondente sai do `styles.css` na mesma mudança. Nenhuma etapa termina com a mesma coisa estilizada nos dois lugares.
- **Tokens vão para o `@theme`:** as variáveis do `:root` e do tema escuro saem do `styles.css` e passam para o `tailwind.css` (`@theme` e um bloco `[data-theme='dark']`), virando classes (`bg-ok-dot`, `rounded-pill`, `text-sm`…).
- **As classes ficam nos componentes:** o que se repete vira componente em `components/ui` (como `Button`, `IconButton` e `Pill`), com as classes do Tailwind dentro dele. Não usar `@apply` para recriar as classes antigas.
- **O que as classes não expressam vai para o `tailwind.css`:** `@keyframes`, pseudo-elementos complexos (`.switch::after`, `::backdrop`), `mask-image` e seletores com `:has()` viram `@utility` ou ficam no `tailwind.css`, nunca de volta no `styles.css`.
- **Conferir o visual a cada etapa:** comparar os estilos calculados antes e depois (vagas, currículos, coletas e configurações, nos dois temas), como foi feito na instalação do Tailwind.
- **Sem valores arbitrários:** nada de `text-[12.5px]`, `px-[18px]`, `min-h-[38px]`… Usar as classes da escala padrão do Tailwind (texto `text-xs`, `text-sm`, `text-base`…; espaços e tamanhos em passos de 2px, como `px-4.5` e `min-h-9.5`) e as classes prontas (`transition`, `rounded-full`, `ring-3`, `animate-pulse`, `w-2/3`). Quando o valor antigo não existir na escala, ir para o degrau igual ou logo acima: **na dúvida entre diminuir e aumentar, aumentar**.
- **Acompanhar o tamanho:** registrar ao fim de cada fase quantas linhas o `styles.css` ainda tem (começou com 1.899).

| Fase | Linhas do `styles.css` ao final |
|---|---|
| Início | 1.899 |
| 1 | 1.613 (com as 9 linhas pendentes de `.run-outcomes` e `.chip-ok`) |
| 2 | 1.364 |
| 3 | 1.126 |
| 4 | 1.097 |
| 5 | 1.039 |
| 6 | 52 (só a base, para a fase 7) |
| 7 | 0 (arquivo apagado) |

---

## Fase 1: ajustes rápidos

### 1.1 Tokens de cor 🟢

Trocar as cores fixas por tokens no `@theme` do `tailwind.css` (como `--color-*`, com versão no tema escuro quando precisar), e levar os tokens que já existem no `:root` do `styles.css` (linhas 3–57) para lá também:

| Valor fixo | Onde | Token novo |
|---|---|---|
| `#2ecc71` | `.pill-idle .dot` (842), `.status-ready` (1347), `.run-success .dot` (1456) | `--ok-dot` |
| `rgb(46 204 113 / 0.2)` e `/ 0.14` | `.tag-ok` (636), `.run-success` (1460) | `--ok-bg` |
| `#95a5a6` | `.pill-paused .dot` (851) | `--muted-dot` |
| `#ff6b5b` | `.status-failed` (1351) | `--danger-dot` |
| `#b9e632` | `.btn-lime:hover` (313) | `--lime-hover` |
| `#8fc20c` | `.range` (445) | `--lime-accent` |
| `rgb(200 245 66 / 0.35)` e `/ 0.3` | `.pill-running .dot` (847), `.unseen-dot` (1106) | `--lime-glow` |
| `#fff` | `.switch::after` (469) | `--switch-knob` |
| `rgb(20 22 19 / 0.45)` | `.dialog::backdrop` (1677) | `--backdrop` |

- [x] Mover o `:root` e o `:root[data-theme='dark']` do `styles.css` para o `tailwind.css`
- [x] Criar os tokens novos e substituir os valores fixos (nos elementos migrados, pela classe: `bg-ok-dot`, `hover:bg-lime-hover`…)

### 1.2 Tokens de raio 🟢

Hoje existem `--radius` (14px) e `--radius-sm` (10px), mas há valores soltos:

- `12px`: `.search-field` (1015), `.cv-ready` (1196), `.chips-input` (1582), `.hint-box` (1631), `.toast` (1720)
- `16px`: `.cv-tray` (1269) · `18px`: `.status-card` (1392)
- `8px`: `.select` (429) · `6px`: `.sk` (708) · `5px`: `.pdf-icon` (688)
- `999px`: repetido em ~15 regras

- [x] Definir no `@theme` a escala de raios: `--radius-xs: 6px`, `--radius-sm: 10px`, `--radius-md: 12px`, `--radius-lg: 14px`, `--radius-xl: 18px` e `--radius-pill: 999px` (resolve também o `rounded-sm` de 10px, que hoje sai do `--radius-sm` do `styles.css`)
- [x] Trocar os valores soltos pelas classes `rounded-*` (o `16px` da bandeja vira `rounded-xl`) e remover `--radius`, `--radius-sm`, `--radius-card` e `--radius-field`

### 1.3 Hover do `IconButton` 🟢

Hoje cada caso tem o seu: `.icon-btn:hover` (354), `.icon-btn-sm:hover` (363, só a cor do texto), `.tray-close:hover` (1330), `.toast .icon-btn:hover` (1747) e `.kchip button:hover` (1622).

- [x] Migrar `.icon-btn`, `.icon-btn-sm` e `.bordered` para classes do Tailwind dentro do `IconButton`, usando o hover do toast, que funciona em qualquer fundo: `hover:bg-current/12`
- [x] Remover `.icon-btn*`, `.tray-close:hover` e `.toast .icon-btn:hover` do `styles.css`
- [x] Migrar `.btn*` e `.outlined` para dentro do `Button` (a `transition` duplicada some junto)

### 1.4 Tamanhos forçados no CSS 🟢

- [x] `App.tsx:188` (toast) e `components/CvTray.tsx:74` (bandeja): passar `size="sm"` no `IconButton`
- [x] Remover `.toast .icon-btn { width/height }` (1734) e o tamanho de `.tray-close` (1324)

### 1.5 Elementos que já deveriam usar os componentes 🟢

- [x] `views/JobPage.tsx:57` (`.back-link`) → `<Button variant="ghost" href="/" onClick={…}>`; remover `.back-link` (1156)
- [x] `components/forms.tsx:83` (botão de remover do `.kchip`) → `IconButton`, criando o tamanho `xs` (26px); remover `.kchip button` (1611–1625)

### 1.6 Skeletons 🟢

- [x] Trocar `.detail-skeleton`, `.status-skeleton`, `.table-skeleton` e `.settings-skeleton` (732) por um componente `Skeleton` com `min-h-60 animate-pulse`, e `.sk*` por classes do Tailwind

### 1.7 Reset de `fieldset` 🟢

- [x] Levar o reset de `fieldset`/`legend` para o `@layer base` do `tailwind.css` e removê-lo de `.filter-group` (986) e `.settings-card fieldset` (1525)

### Notas da fase 1

- **`tailwind-merge`:** o `cx` (`lib/cx.ts`) passou a usá-lo. Sem ele, um `className` que conflita com as classes do componente (ex.: `hidden` contra o `inline-flex` do `Button`) dependia da ordem das regras no CSS gerado. Valores do `@theme` que ele não reconhece sozinho (como `rounded-pill`) são ensinados em `lib/cx.ts`.
- **Hover com borda:** o antigo `.outlined` virou a constante `OUTLINED` (`components/ui/outlined.ts`), usada por `Button`, `IconButton`, `Pill` e `check-pill`.
- **Card selecionado:** passou a redefinir também `--color-ink`; com isso o `.job-card.selected .btn-ghost` saiu.
- **Regras de contexto que miravam `.btn`:** `.empty .btn` e `.job-card-actions .btn` passaram a mirar `:is(a, button)`; saem com o `EmptyState` (fase 2) e com o layout das vagas (fase 6).
- **Cores das modalidades:** ficaram em `lib/format.ts`, porque espelham as do card do Discord.
- **Pequenas mudanças de raio:** a bandeja de currículos foi de 16px para 18px (`rounded-xl`) e o ícone de PDF de 5px para 6px (`rounded-xs`). O brilho do ponto de vaga nova passou de 30% para 35%, igual ao do status "coletando".
- **Botão de reportar:** a regra antiga pedia uma borda mais escura (`--muted` a 70%), mas ela perdia para a `.icon-btn.bordered` e nunca apareceu. A migração manteve o visual de hoje (borda `--line`); decidir se a borda destacada deve valer.

---

## Fase 2: componentes novos

### 2.1 `Badge` e `StatusDot` 🟡

Hoje há 9 versões da mesma cápsula pequena, cada uma com padding e fonte próprios:

| Classe | Padding | Fonte | Uso |
|---|---|---|---|
| `.chip` (572) | 3px 9px | 11.5 | tecnologias, destinos dos posts |
| `.tag` (619) | 3px 10px | 11.5 | status da coleta |
| `.mode-badge` (585) | 3px 9px | 11.5 | modalidade |
| `.contract-badge` (601) | 3px 9px | 11.5 | regime |
| `.live-tag` (959) | 3px 8px | 10 | "ao vivo" |
| `.badge` (1755) | 1px 6px | 10 | contador na navegação de baixo |
| `.kchip` (1601) | 2px 2px 2px 10px | 12 | palavras-chave removíveis |
| `.status-pill` (828) | 7px 12px | 12 | status do scraper no cabeçalho |
| `.offline` (859) | 4px 8px | 11.5 | aviso de offline |

Os nomes de status também variam: `tag-ok` / `run-success` / `pill-idle` para "ok", e `tag-lime` / `run-running` / `pill-running` para "em andamento".

E os pontos de status são três classes: `.dot` (547), `.status-dot` (1334) e `.unseen-dot` (1100, uma `.dot` com brilho).

- [x] Criar `components/ui/Badge.tsx` (estilizado só com classes do Tailwind): `tone: 'neutral' | 'ok' | 'running' | 'danger' | 'muted'`, `size: 'sm' | 'md'`, `outlined?`
- [x] Criar `components/ui/StatusDot.tsx`: `tone` igual ao do `Badge` e `glow?` (substitui `.unseen-dot` e o brilho do `pill-running`)
- [x] Migrar `.chip`, `.tag`, `.contract-badge`, `.live-tag`, `.badge`, `.offline` e `.status-pill`, e apagar essas classes, `.dot`, `.status-dot`, `.unseen-dot`, `.run-*`, `.tag-*` e `.pill-idle/running/paused/failed` do `styles.css`
- [x] Manter `.mode-badge`, que usa a cor própria da modalidade, como `Badge` com `style={{ '--mode': … }}`
- [x] Usar um vocabulário único de status: `ok`, `running`, `muted`, `danger`

### 2.2 `TextLink` 🟢

Botões e links com cara de link, sem componente:

- `<button className="link-btn">`: `views/RunsView.tsx:370`, `components/JobDetail.tsx:166`, `:193` e `:207`
- `<a className="link">`: `views/RunsView.tsx:337`, `components/JobDetail.tsx:131` e `:186`

- [x] Criar `components/ui/TextLink.tsx`: `<a>` com `href` e `<button>` sem ele, como o `Button`
- [x] Migrar os 7 usos e apagar `.link` e `.link-btn` do `styles.css`

### 2.3 `EmptyState` 🟡

O bloco `card empty` (título forte, texto, botão) aparece 9 vezes: `App.tsx:94`, `views/JobsView.tsx:203`, `:216`, `:224`, `:347`, `views/CvsView.tsx:90`, `views/JobPage.tsx:69`, `views/RunsView.tsx:258` e `:377`, `views/SettingsView.tsx:441`.

O erro de carregamento aparece de dois jeitos:
- `card empty` com botão lime: vagas, configurações, status do scraper
- `notice-danger` com `link-btn`: currículos (`views/CvsView.tsx:84`), histórico (`views/RunsView.tsx:368`)

E o ícone de alerta só existe em `views/JobsView.tsx:204`.

- [x] Criar `components/ui/EmptyState.tsx`: `title`, `description?`, `action?`, `tone?: 'neutral' | 'error'` (com `error`, mostra o ícone e usa `role="alert"`)
- [x] Escolher um formato só para "não consegui carregar X" com "tentar de novo" e aplicar nos 5 lugares
- [x] Apagar `.empty`, `.notice*` e `.alert` do `styles.css` (o `FailureAlert` de `views/RunsView.tsx:40` passa a usar o `EmptyState` de erro ou um `Notice` com Tailwind)

### Notas da fase 2

- **`tailwind-variants`:** as variantes dos componentes de `ui` são declaradas com `tv()` (exportado por `lib/cx.ts`, com a mesma configuração do `tailwind-merge` do `cx`). `Button`, `IconButton` e `Pill` passaram a usá-lo também. O `Pill` ainda aponta para as classes `pill*` do `styles.css` (fase 3).
- **Componentes novos:** `Badge` (e `BadgeList`, a lista que quebra linha; use `badge()` direto no `className` de um `<li>` ou `<a>`), `StatusDot`, `TextLink`, `EmptyState` e `Notice` (avisos dentro da tela: currículo que falhou, IA em dúvida e a falha da última coleta).
- **Status:** os pontos usam `ok`, `lime`, `muted`, `danger` e `current`; os badges usam `ok`, `running`, `danger` e `muted` (mais `neutral`, `lime` e `plain`). O card escuro de coletas redefine `--color-line` e `--color-ok-bg` para os badges dele, até a fase 4.
- **Erros de carregamento:** todos viraram `EmptyState` com o ícone de alerta e "tentar de novo" (vagas, currículos, configurações e histórico); o status do scraper não tem botão, porque ele já é consultado de novo a cada 30 s. Os currículos ganharam o "tentar de novo", que não existia.
- **Pequenas mudanças:** os badges de status e o aviso "offline" ficaram com o padding dos outros (3px 9px, antes 3px 10px e 4px 8px).
- **Link "ir para o post ↗":** tinha a classe `muted`, mas ela perdia para a cor do `.link` e o link sempre apareceu na cor do texto. A migração manteve assim; decidir se ele deve ficar discreto (`text-muted`).

---

## Fase 3: formulários 🟡

- **Dois selects:** `.select` nos filtros (`views/JobsView.tsx:160`; raio 8px, fonte 12.5, padding 6/8) e `.field` nas configurações (`views/SettingsView.tsx:253`; 44px, raio 10px)
- **Raio dos campos:** `.field` 10px, `.search-field` e `.chips-input` 12px
- **`.check-pill`:** em `views/SettingsView.tsx:342` tem cara de `Pill`, mas com outro tamanho (40px contra 34px, fonte 13 contra 12.5, padding 8/14 contra 6/12)
- **"Pausar coletas automáticas":** aparece em `views/RunsView.tsx:318` (rótulo com descrição, `row-between`) e em `views/SettingsView.tsx:461` (rótulo curto, `row gap-sm small`)

- [x] Criar `components/ui/Input.tsx` e `components/ui/Select.tsx` (com `size: 'sm' | 'md'`), estilizados com Tailwind, e usar nos lugares de `.field`, `.search-field`, `.chips-input` e `.select`
- [x] Deixar `.check-pill` com o tamanho do `Pill` (migrado para Tailwind junto com ele)
- [x] Migrar `Switch`, `KeywordInput`, `.checkbox`, `.range`, `.field-label`, `.field-error` e `.help` para Tailwind (o `.switch::after` pode virar um elemento ou um `@utility` no `tailwind.css`)
- [x] Criar um componente `SwitchField` (rótulo, descrição opcional, `Switch`) e usar nos dois lugares
- [x] Apagar do `styles.css` todas as regras de controles de formulário (271–553)

### Notas da fase 3

- **Componentes:** `Input`, `Select`, `SearchInput`, `Checkbox` e `Range` (`ui/Input.tsx`, com o `field()` para contêineres que fazem papel de campo), `FieldLabel`, `FieldHelp` e `FieldError` (`ui/Field.tsx`), `Switch` e `SwitchField` (`ui/Switch.tsx`) e `KeywordInput` (`ui/KeywordInput.tsx`). O `components/forms.tsx` saiu. O `Pill` passou a ser só Tailwind, com `PillGroup`, `pill()` (para o `<label>` com checkbox dos idiomas) e `PILL_COUNT`.
- **Lint:** o `biome.json` ensina à regra `noLabelWithoutControl` quais componentes são campos e que o `FieldLabel` é um rótulo; o `htmlFor` do `FieldLabel` é obrigatório.
- **Mudanças visuais (aprovadas antes do commit):**
  - campo de busca: raio de 12px para 10px e texto de 13,5px para 14px, como os outros campos;
  - campo de palavras-chave: raio de 12px para 10px;
  - select de idioma dos filtros: raio de 8px para 10px;
  - idiomas aceitos: do tamanho das pills dos filtros (34px de altura, antes 40px);
  - "pausar coletas" nas configurações: com o mesmo `SwitchField` das coletas (texto em negrito ao lado do interruptor).
- **Escala padrão do Tailwind nos componentes de `ui`:** os valores arbitrários saíram (veja a regra no início). Com isso, textos e tamanhos cresceram até o degrau padrão: botões e pills de 12,5–13px para 14px (`text-sm`), badges de 10–11,5px para 12px (`text-xs`), paddings ímpares para o par de cima (ex.: 3px para 4px nos badges) e o switch de 26px para 28px de altura. O `animate-pulse` voltou à duração padrão (2 s).

---

## Fase 4: superfícies escuras 🟢

O card de vaga selecionado (`.job-card.selected`, 1053) redefine os tokens (`--muted`, `--line`, `--surface-2`) e todo o resto se ajusta. Já o `.status-card` e o `.cv-tray` usam classes avulsas:

- `.on-dark-muted` (1403) e `.tray-muted` (1309), que são iguais
- `.btn-tray` (1316), variante `tray` do `Button`
- `.tray-close` (1324)
- `.status-card .btn:disabled` (1397)
- `.job-card.selected .btn-ghost` (1062)

- [x] Criar no `tailwind.css` o `@utility inverted`, que redefine `--bg`, `--surface`, `--surface-2`, `--ink`, `--muted` e `--line` para os valores `--inv-*` (assim `bg-surface`, `text-muted` etc. se ajustam dentro dele)
- [x] Aplicar `inverted` no card selecionado, no card de status da coleta e na bandeja de currículos
- [x] Trocar `.on-dark-muted` e `.tray-muted` por `.muted`
- [x] Remover a variante `tray` do `Button` (vira `ghost` com `size="sm"`) e as regras listadas acima

### Notas da fase 4

- **`inverted`:** além dos tokens da lista, também define o fundo e a cor do texto, e troca `--color-ok-bg` pela versão mais forte (o badge "ociosa" do card da coleta). O fundo das superfícies internas (`--color-surface-2`) virou o token `--color-inv-surface-2`.
- **No lugar de `.muted`:** os textos discretos usam `text-muted` do Tailwind, que dentro do `inverted` já sai claro. O botão desativado do card da coleta usa `disabled:bg-line disabled:text-muted`.
- **Bandeja de currículos:** os botões "baixar" e "tentar de novo" passaram a ter o hover dos botões com borda (antes não tinham hover).
- **Tema escuro:** continua por tokens (os mesmos `--color-*` com outros valores), como faz o shadcn/ui, mas declarado com `@variant dark` dentro do `:root` (`tailwind.css`): os tokens e as classes `dark:` usam a mesma definição de tema escuro. O `dark:` nas classes fica para quando o elemento muda de comportamento entre os temas (ex.: o `Switch`), e não só de cor.
- **Sem mudança visual:** conferido nas quatro telas e nos dois temas, com a bandeja aberta nos três estados (pronto, falhou e gerando).

---

## Fase 5: escala de fontes 🟡

São 16 tamanhos em uso: 9, 10, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 20, 24, 28. Só `.small` (13) e `.xsmall` (11.5) viraram classe; `.help` usa 12.5, `.field-error` usa 12 e `.btn-xs` usa 12.

**Usar a escala padrão do Tailwind, sem criar uma própria**, mesmo que os textos cresçam. Cada tamanho vai para o degrau padrão igual ou logo acima (na dúvida entre diminuir e aumentar, aumentar):

| Classe padrão | Tamanho | Absorve |
|---|---|---|
| `text-xs` | 12px | 9, 10, 11, 11.5, 12 |
| `text-sm` | 14px | 12.5, 13, 13.5, 14 |
| `text-base` | 16px | 15, 16 |
| `text-lg` | 18px | 17, 18 |
| `text-xl` | 20px | 20 |
| `text-2xl` | 24px | 24 |
| `text-3xl` | 30px | 28 |

Os componentes de `components/ui` já usam essa escala (desde a fase 3). Falta o que ainda está no `styles.css`:

- [x] Trocar `.small`, `.xsmall`, `.label`, `.mono` com tamanho e os `font-size` fixos do `styles.css` pelas classes `text-*` da tabela (o `body` vai de 15px para `text-base`, 16px)
- [x] Não criar `--text-*` no `@theme`: a escala é a padrão
- [x] Revisar telas, principalmente cards de vaga, tabela de coletas e configurações

Os espaçamentos seguem a mesma regra: a escala padrão do Tailwind (`gap-1.5`, `px-2.5`, `min-h-9.5`…, em passos de 2px), arredondando para cima os valores ímpares (3px vira `1`, 7px vira `2`, 9px vira `2.5`).

### Notas da fase 5

- **Sem `font-size` no `styles.css`:** os 30 tamanhos viraram classes no JSX (e o do `body`, `class="text-base"` no `index.html`). As regras `.small`, `.xsmall` e `.label` saíram; o rótulo mono virou a constante `LABEL` (`components/ui/text.ts`).
- **Altura da linha:** as classes `text-*` trazem a altura de linha padrão. Onde o CSS antigo definia uma própria, ela virou a classe padrão de cima: 1,6 → `leading-relaxed` (post e mensagem), 1,3 → `leading-snug` (cargo no card) e 1,2 → `leading-tight` (cargo no detalhe).
- **Título das telas:** o `clamp(32px, 4.4vw, 44px)` virou `text-4xl md:text-5xl` (36px no celular, 48px a partir de 861px).
- **Regras vazias removidas:** `.job-sub`, `.status-clock` e `.term-sent` só tinham o tamanho da fonte.
- **Para a fase 6:** no celular, um cargo com palavra longa ("DESENVOLVEDOR(A)") passa da coluna do título no card de vaga (já acontecia antes desta fase); e o slider dos filtros passa 2px da largura por causa da margem padrão do navegador.

---

## Fase 6: o resto do `styles.css` 🟢

O que sobra depois das fases anteriores é o layout de cada tela. Migrar seção por seção do `styles.css`, apagando cada uma ao terminar:

- [x] **Utilitários** (113–270): `.mono`, `.muted`, `.strong`, `.row`, `.row-between`, `.stack-*`, `.grow`, `.ellipsis`, `.plain`, `.sr-only` etc. viram `font-mono`, `text-muted`, `font-semibold`, `flex items-center`, `flex flex-col gap-*`, `truncate`, `list-none`… Fazer por último dentro da fase, porque estão em quase todo arquivo
- [x] **Superfícies** (555–697): `.card`, `.pdf-icon` → componente `Card` e classes
- [x] **Layout** (746–937): `.topbar`, `.topnav`, `.navlink`, `.logo`, `.page*`, `.hero`, `.display`, `.lead`, `.stats`, `.section-title` (em `App.tsx` e nas views; `.page` e `.hero` podem virar componentes `Page` e `Hero`)
- [x] **Vagas** (939–1259): `.new-jobs`, `.jobs-layout`, `.filters*`, `.job-list`, `.job-card*`, `.detail-*`, `.cv-ready`, `.copy-field`, `.message-box`, `.raw-post` (o `mask-image` do post recolhido vira `mask-b-from-60%` ou um `@utility`)
- [x] **Currículos** (1261–1376): `.cv-tray*`, `.cv-row`, `.row-actions`
- [x] **Coletas** (1378–1510): `.status-grid`, `.status-card`, `.runs-table`, `.terms-*`, `.run-outcomes`, `.chip-ok`
- [x] **Configurações** (1512–1662): `.settings-*`, `.pause-card`, `.term-row`, `.grid-2/3`, `.hint-box`, `.save-bar*` (o `.app:has(.save-bar) .cv-tray` vira `has-[.save-bar]:` ou fica no `tailwind.css`)
- [x] **Modal e avisos** (1664–1764): `.dialog*`, `.toasts`, `.toast*`, `.report-btn`, `.bottomnav`, `.badge`
- [x] **Responsivo** (1766–1899): definir os breakpoints no `@theme` (`--breakpoint-md: 860px`, `--breakpoint-lg: 1100px`) e trocar os `@media (max-width: …)` por variantes nos elementos. O CSS atual é desktop-first (`max-width`); usar `max-md:` para não ter que inverter tudo

### Notas da fase 6

- **Componentes novos:** `Page` e `Hero` (`ui/Page.tsx`, a moldura e a abertura das quatro telas), `card()` (`ui/Card.tsx`, a caixa com borda, com `failed` para o contorno vermelho) e `PdfIcon`. Constantes em `ui/text.ts`: `FIELDSET` (grupo de opções) e `SECTION_TITLE`.
- **No `tailwind.css`:** `bottom-safe-*` e `pb-safe-*` (área segura do iPhone), `grid-cols-fill-*` (a grade de termos), `max-h-half-screen` (a lista da bandeja), `max-h-below-topbar` (o painel da vaga), a variante `with-save-bar:` (no lugar do `.app:has(.save-bar) .cv-tray`; a barra leva `data-save-bar`) e o token `shadow-float`.
- **Arredondamentos visíveis:** o desfoque do cabeçalho foi de 10px para 12px (`backdrop-blur-md`), o espaçamento das letras dos títulos grandes para `tracking-tight` (−0,025em, antes −0,02em) e o dos cargos para o normal (antes −0,01em), as células da tabela de coletas de 13px para 14px de padding e a bandeja sobe 152px (antes 150px) com a barra de salvar no celular. O ícone girando deixa de girar com "reduzir movimento" (antes só ficava mais lento).
- **Bug antigo corrigido:** a linha de currículo pronto recebia a classe `cv-ready` (de `` cv-${status} ``), o mesmo nome da caixa verde "currículo pronto" do detalhe da vaga; por isso as linhas prontas ficavam com fundo verde-claro sem querer. Agora são cards brancos como as outras.
- **Pendências da fase 5 resolvidas:** o cargo com palavra longa quebra a linha (`wrap-break-word`) em vez de passar da coluna no celular, e o slider dos filtros perdeu a margem padrão do navegador (`m-0`), que o fazia passar 2px da largura.
- **Conferido:** comparando com a versão do commit anterior (servida ao lado, com os mesmos dados), as quatro telas nos dois temas e três telas no celular (390px), elemento por elemento.
- **Links para outra aba:** `Button` e `TextLink` ganharam a prop `external` (só junto com `href`): abre em outra aba com `rel="noopener noreferrer"` (`NEW_TAB`, em `ui/link.ts`) e mostra o indicador, o ícone de link externo no botão e "↗" no link de texto. Os sete links que repetiam `target`/`rel` (e o ícone) passaram a usá-la; o "abrir" da lista de currículos e o "pré-visualizar" ganharam o indicador.

## Fase 7: apagar o `styles.css` 🟡

- [ ] Mover a base que sobrar (`body`, reset de `h1`–`p`, `a`, `button`, `:focus-visible`, `@keyframes spin/pulse`, `prefers-reduced-motion`) para o `@layer base` do `tailwind.css`, ou ligar o preflight do Tailwind (`@import 'tailwindcss/preflight.css' layer(base)`) e manter só o que for diferente dele
- [ ] Conferir que o `styles.css` está vazio, apagar o arquivo e remover o `@import './styles.css'` do `tailwind.css`
- [ ] Atualizar o README do web (a frase sobre o `styles.css` na camada `components`)

---

## Detalhes de texto 🟢

- [ ] Rótulos `.label` terminam com `_` ("contato_", "agenda_"); faltam em `components/JobDetail.tsx:156` e `:219`
- [ ] O sufixo mono do `.section-title` às vezes é `muted xsmall` (`views/SettingsView.tsx:179`, `:313`) e às vezes não (`views/RunsView.tsx:362`); escolher um
- [ ] Maiúscula nos `label` dos `IconButton`: "Fechar", "Dispensar", "Alternar tema…" contra "reportar problema na vaga" (`components/JobDetail.tsx:78`); padronizar com inicial maiúscula, já que vira `aria-label` e dica do mouse
