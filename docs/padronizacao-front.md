# Padronização do front

Auditoria de `src/services/web/client` (out/2026). Os caminhos abaixo são relativos a essa pasta; as linhas de CSS são de `styles.css`.

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
- **Acompanhar o tamanho:** registrar ao fim de cada fase quantas linhas o `styles.css` ainda tem (começou com 1.899).

| Fase | Linhas do `styles.css` ao final |
|---|---|
| Início | 1.899 |
| 1 | |
| 2 | |
| 3 | |
| 4 | |
| 5 | |
| 6 | |
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

- [ ] Mover o `:root` e o `:root[data-theme='dark']` do `styles.css` para o `tailwind.css`
- [ ] Criar os tokens novos e substituir os valores fixos (nos elementos migrados, pela classe: `bg-ok-dot`, `hover:bg-lime-hover`…)

### 1.2 Tokens de raio 🟢

Hoje existem `--radius` (14px) e `--radius-sm` (10px), mas há valores soltos:

- `12px`: `.search-field` (1015), `.cv-ready` (1196), `.chips-input` (1582), `.hint-box` (1631), `.toast` (1720)
- `16px`: `.cv-tray` (1269) · `18px`: `.status-card` (1392)
- `8px`: `.select` (429) · `6px`: `.sk` (708) · `5px`: `.pdf-icon` (688)
- `999px`: repetido em ~15 regras

- [ ] Definir no `@theme` a escala de raios: `--radius-xs: 6px`, `--radius-sm: 10px`, `--radius-md: 12px`, `--radius-lg: 14px`, `--radius-xl: 18px` e `--radius-pill: 999px` (resolve também o `rounded-sm` de 10px, que hoje sai do `--radius-sm` do `styles.css`)
- [ ] Trocar os valores soltos pelas classes `rounded-*` (o `16px` da bandeja vira `rounded-xl`) e remover `--radius`, `--radius-sm`, `--radius-card` e `--radius-field`

### 1.3 Hover do `IconButton` 🟢

Hoje cada caso tem o seu: `.icon-btn:hover` (354), `.icon-btn-sm:hover` (363, só a cor do texto), `.tray-close:hover` (1330), `.toast .icon-btn:hover` (1747) e `.kchip button:hover` (1622).

- [ ] Migrar `.icon-btn`, `.icon-btn-sm` e `.bordered` para classes do Tailwind dentro do `IconButton`, usando o hover do toast, que funciona em qualquer fundo: `hover:bg-current/12`
- [ ] Remover `.icon-btn*`, `.tray-close:hover` e `.toast .icon-btn:hover` do `styles.css`
- [ ] Migrar `.btn*` e `.outlined` para dentro do `Button` (a `transition` duplicada some junto)

### 1.4 Tamanhos forçados no CSS 🟢

- [ ] `App.tsx:188` (toast) e `components/CvTray.tsx:74` (bandeja): passar `size="sm"` no `IconButton`
- [ ] Remover `.toast .icon-btn { width/height }` (1734) e o tamanho de `.tray-close` (1324)

### 1.5 Elementos que já deveriam usar os componentes 🟢

- [ ] `views/JobPage.tsx:57` (`.back-link`) → `<Button variant="ghost" href="/" onClick={…}>`; remover `.back-link` (1156)
- [ ] `components/forms.tsx:83` (botão de remover do `.kchip`) → `IconButton`, criando o tamanho `xs` (26px); remover `.kchip button` (1611–1625)

### 1.6 Skeletons 🟢

- [ ] Trocar `.detail-skeleton`, `.status-skeleton`, `.table-skeleton` e `.settings-skeleton` (732) por um componente `Skeleton` com `min-h-60 animate-pulse`, e `.sk*` por classes do Tailwind

### 1.7 Reset de `fieldset` 🟢

- [ ] Levar o reset de `fieldset`/`legend` para o `@layer base` do `tailwind.css` e removê-lo de `.filter-group` (986) e `.settings-card fieldset` (1525)

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

- [ ] Criar `components/ui/Badge.tsx` (estilizado só com classes do Tailwind): `tone: 'neutral' | 'ok' | 'running' | 'danger' | 'muted'`, `size: 'sm' | 'md'`, `outlined?`
- [ ] Criar `components/ui/StatusDot.tsx`: `tone` igual ao do `Badge` e `glow?` (substitui `.unseen-dot` e o brilho do `pill-running`)
- [ ] Migrar `.chip`, `.tag`, `.contract-badge`, `.live-tag`, `.badge`, `.offline` e `.status-pill`, e apagar essas classes, `.dot`, `.status-dot`, `.unseen-dot`, `.run-*`, `.tag-*` e `.pill-idle/running/paused/failed` do `styles.css`
- [ ] Manter `.mode-badge`, que usa a cor própria da modalidade, como `Badge` com `style={{ '--mode': … }}`
- [ ] Usar um vocabulário único de status: `ok`, `running`, `muted`, `danger`

### 2.2 `TextLink` 🟢

Botões e links com cara de link, sem componente:

- `<button className="link-btn">`: `views/RunsView.tsx:370`, `components/JobDetail.tsx:166`, `:193` e `:207`
- `<a className="link">`: `views/RunsView.tsx:337`, `components/JobDetail.tsx:131` e `:186`

- [ ] Criar `components/ui/TextLink.tsx`: `<a>` com `href` e `<button>` sem ele, como o `Button`
- [ ] Migrar os 7 usos e apagar `.link` e `.link-btn` do `styles.css`

### 2.3 `EmptyState` 🟡

O bloco `card empty` (título forte, texto, botão) aparece 9 vezes: `App.tsx:94`, `views/JobsView.tsx:203`, `:216`, `:224`, `:347`, `views/CvsView.tsx:90`, `views/JobPage.tsx:69`, `views/RunsView.tsx:258` e `:377`, `views/SettingsView.tsx:441`.

O erro de carregamento aparece de dois jeitos:
- `card empty` com botão lime: vagas, configurações, status do scraper
- `notice-danger` com `link-btn`: currículos (`views/CvsView.tsx:84`), histórico (`views/RunsView.tsx:368`)

E o ícone de alerta só existe em `views/JobsView.tsx:204`.

- [ ] Criar `components/ui/EmptyState.tsx`: `title`, `description?`, `action?`, `tone?: 'neutral' | 'error'` (com `error`, mostra o ícone e usa `role="alert"`)
- [ ] Escolher um formato só para "não consegui carregar X" com "tentar de novo" e aplicar nos 5 lugares
- [ ] Apagar `.empty`, `.notice*` e `.alert` do `styles.css` (o `FailureAlert` de `views/RunsView.tsx:40` passa a usar o `EmptyState` de erro ou um `Notice` com Tailwind)

---

## Fase 3: formulários 🟡

- **Dois selects:** `.select` nos filtros (`views/JobsView.tsx:160`; raio 8px, fonte 12.5, padding 6/8) e `.field` nas configurações (`views/SettingsView.tsx:253`; 44px, raio 10px)
- **Raio dos campos:** `.field` 10px, `.search-field` e `.chips-input` 12px
- **`.check-pill`:** em `views/SettingsView.tsx:342` tem cara de `Pill`, mas com outro tamanho (40px contra 34px, fonte 13 contra 12.5, padding 8/14 contra 6/12)
- **"Pausar coletas automáticas":** aparece em `views/RunsView.tsx:318` (rótulo com descrição, `row-between`) e em `views/SettingsView.tsx:461` (rótulo curto, `row gap-sm small`)

- [ ] Criar `components/ui/Input.tsx` e `components/ui/Select.tsx` (com `size: 'sm' | 'md'`), estilizados com Tailwind, e usar nos lugares de `.field`, `.search-field`, `.chips-input` e `.select`
- [ ] Deixar `.check-pill` com o tamanho do `Pill` (migrado para Tailwind junto com ele)
- [ ] Migrar `Switch`, `KeywordInput`, `.checkbox`, `.range`, `.field-label`, `.field-error` e `.help` para Tailwind (o `.switch::after` pode virar um elemento ou um `@utility` no `tailwind.css`)
- [ ] Criar um componente `SwitchField` (rótulo, descrição opcional, `Switch`) e usar nos dois lugares
- [ ] Apagar do `styles.css` todas as regras de controles de formulário (271–553)

---

## Fase 4: superfícies escuras 🟢

O card de vaga selecionado (`.job-card.selected`, 1053) redefine os tokens (`--muted`, `--line`, `--surface-2`) e todo o resto se ajusta. Já o `.status-card` e o `.cv-tray` usam classes avulsas:

- `.on-dark-muted` (1403) e `.tray-muted` (1309), que são iguais
- `.btn-tray` (1316), variante `tray` do `Button`
- `.tray-close` (1324)
- `.status-card .btn:disabled` (1397)
- `.job-card.selected .btn-ghost` (1062)

- [ ] Criar no `tailwind.css` o `@utility inverted`, que redefine `--bg`, `--surface`, `--surface-2`, `--ink`, `--muted` e `--line` para os valores `--inv-*` (assim `bg-surface`, `text-muted` etc. se ajustam dentro dele)
- [ ] Aplicar `inverted` no card selecionado, no card de status da coleta e na bandeja de currículos
- [ ] Trocar `.on-dark-muted` e `.tray-muted` por `.muted`
- [ ] Remover a variante `tray` do `Button` (vira `ghost` com `size="sm"`) e as regras listadas acima

---

## Fase 5: escala de fontes 🟡

São 16 tamanhos em uso: 9, 10, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 20, 24, 28. Só `.small` (13) e `.xsmall` (11.5) viraram classe; `.help` usa 12.5, `.field-error` usa 12 e `.btn-xs` usa 12.

Proposta de escala:

| Token | Tamanho | Absorve |
|---|---|---|
| `--text-2xs` | 10px | 9, 10 |
| `--text-xs` | 11.5px | 11, 11.5 |
| `--text-sm` | 12.5px | 12, 12.5 |
| `--text-md` | 13.5px | 13, 13.5, 14 |
| `--text-base` | 15px | 15, 16 |
| `--text-lg` | 18px | 17, 18 |
| `--text-xl` | 20px | 20 |
| `--text-2xl` | 24px | 24 |
| `--text-3xl` | 28px | 28 |

- [ ] Definir a escala no `@theme` (`--text-2xs` … `--text-3xl`), substituindo a escala padrão do Tailwind, para que `text-xs`, `text-sm` etc. sigam esses valores
- [ ] Trocar `.small`, `.xsmall`, `.label`, `.help` e os `font-size` fixos pelas classes `text-*`
- [ ] Revisar telas, principalmente cards de vaga, tabela de coletas e configurações

Os espaçamentos também não seguem uma escala (gaps de 2, 3, 6, 7, 8, 10, 12, 14, 16, 20, 22, 24, 26, 28, 40). A escala do Tailwind (múltiplos de 4px) resolve isso conforme cada elemento for migrado: arredondar para o valor mais próximo (`gap-1.5`, `gap-2.5`, `gap-3`…) e usar valor arbitrário (`gap-[7px]`) só quando a diferença aparecer na tela.

---

## Fase 6: o resto do `styles.css` 🟢

O que sobra depois das fases anteriores é o layout de cada tela. Migrar seção por seção do `styles.css`, apagando cada uma ao terminar:

- [ ] **Utilitários** (113–270): `.mono`, `.muted`, `.strong`, `.row`, `.row-between`, `.stack-*`, `.grow`, `.ellipsis`, `.plain`, `.sr-only` etc. viram `font-mono`, `text-muted`, `font-semibold`, `flex items-center`, `flex flex-col gap-*`, `truncate`, `list-none`… Fazer por último dentro da fase, porque estão em quase todo arquivo
- [ ] **Superfícies** (555–697): `.card`, `.pdf-icon` → componente `Card` e classes
- [ ] **Layout** (746–937): `.topbar`, `.topnav`, `.navlink`, `.logo`, `.page*`, `.hero`, `.display`, `.lead`, `.stats`, `.section-title` (em `App.tsx` e nas views; `.page` e `.hero` podem virar componentes `Page` e `Hero`)
- [ ] **Vagas** (939–1259): `.new-jobs`, `.jobs-layout`, `.filters*`, `.job-list`, `.job-card*`, `.detail-*`, `.cv-ready`, `.copy-field`, `.message-box`, `.raw-post` (o `mask-image` do post recolhido vira `mask-b-from-60%` ou um `@utility`)
- [ ] **Currículos** (1261–1376): `.cv-tray*`, `.cv-row`, `.row-actions`
- [ ] **Coletas** (1378–1510): `.status-grid`, `.status-card`, `.runs-table`, `.terms-*`, `.run-outcomes`, `.chip-ok`
- [ ] **Configurações** (1512–1662): `.settings-*`, `.pause-card`, `.term-row`, `.grid-2/3`, `.hint-box`, `.save-bar*` (o `.app:has(.save-bar) .cv-tray` vira `has-[.save-bar]:` ou fica no `tailwind.css`)
- [ ] **Modal e avisos** (1664–1764): `.dialog*`, `.toasts`, `.toast*`, `.report-btn`, `.bottomnav`, `.badge`
- [ ] **Responsivo** (1766–1899): definir os breakpoints no `@theme` (`--breakpoint-md: 860px`, `--breakpoint-lg: 1100px`) e trocar os `@media (max-width: …)` por variantes nos elementos. O CSS atual é desktop-first (`max-width`); usar `max-md:` para não ter que inverter tudo

## Fase 7: apagar o `styles.css` 🟡

- [ ] Mover a base que sobrar (`body`, reset de `h1`–`p`, `a`, `button`, `:focus-visible`, `@keyframes spin/pulse`, `prefers-reduced-motion`) para o `@layer base` do `tailwind.css`, ou ligar o preflight do Tailwind (`@import 'tailwindcss/preflight.css' layer(base)`) e manter só o que for diferente dele
- [ ] Conferir que o `styles.css` está vazio, apagar o arquivo e remover o `@import './styles.css'` do `tailwind.css`
- [ ] Atualizar o README do web (a frase sobre o `styles.css` na camada `components`)

---

## Detalhes de texto 🟢

- [ ] Rótulos `.label` terminam com `_` ("contato_", "agenda_"); faltam em `components/JobDetail.tsx:156` e `:219`
- [ ] O sufixo mono do `.section-title` às vezes é `muted xsmall` (`views/SettingsView.tsx:179`, `:313`) e às vezes não (`views/RunsView.tsx:362`); escolher um
- [ ] Maiúscula nos `label` dos `IconButton`: "Fechar", "Dispensar", "Alternar tema…" contra "reportar problema na vaga" (`components/JobDetail.tsx:78`); padronizar com inicial maiúscula, já que vira `aria-label` e dica do mouse
