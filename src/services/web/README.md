# 🌐 web

O site: mais um canal, ao lado do Discord, com o que o Discord não faz bem. Busca e filtros no histórico, acompanhamento das coletas e edição das configurações. Abre em http://localhost:3000 (`WEB_PORT`). Não tem login: a porta fica só em `127.0.0.1` (`WEB_HOST`).

[← voltar ao README principal](../../../README.md)

## Telas

- **Vagas:** as mais recentes, com busca (cargo, empresa, tecnologias e texto do post) e filtros por modalidade, regime, tecnologias, período, e-mail, idioma e confiança mínima. No desktop, o detalhe abre ao lado; no celular, numa página própria. Vagas novas chegam em tempo real e aparecem num aviso "N vagas novas", sem reordenar a lista sob o cursor.
- **Detalhe:** todos os campos, o post original, o e-mail com botão de copiar e a mensagem de candidatura (a gerada pela IA ou o modelo padrão).
- **Correção:** a bandeira do detalhe abre "o que saiu errado?". Escolhidos os campos errados (cargo, empresa, local, modalidade, regime, tecnologias, e-mail, link de candidatura), um formulário corrige os valores, validados pelos mesmos schemas da API (`PATCH /api/jobs/:postId`). A vaga passa a usar os valores certos na lista, nos filtros e nos próximos currículos, e ganha o selo "corrigida". "Não é vaga" tira a vaga da lista sem apagar o documento. Na primeira correção, a extração original da IA fica na vaga (`aiExtraction`, visível no JSON de depuração), e cada correção vai para a coleção `extraction_feedback`, usada pelo [`bun eval:extraction`](../post-processing/README.md#avaliar-a-extração). O card já publicado no Discord não muda.
- **Currículos:** "gerar currículo" em qualquer vaga. O pedido segue em segundo plano, com um indicador no canto para os pedidos da sessão. Os PDFs ficam em `web_cv_requests` por 90 dias e aparecem em "Meus currículos".
- **Coletas:** coleta em andamento, próxima agendada, "coletar agora", pausa e histórico por termo. Falhas de login do LinkedIn aparecem como alerta.
- **Configurações:** formulário das [configurações](../../shared/README.md#configurações-em-tempo-de-execução), com as mesmas validações dos schemas. Os erros da API voltam por campo.

## Como funciona

- **Servidor** (`index.ts`, `server/`): `Bun.serve` com as rotas de `/api` e a aplicação. As vagas novas chegam pela fila `web` (ligada no evento `job-published`) e vão para o navegador por Server-Sent Events (`/api/jobs/stream`). Os currículos voltam pela fila `web-cv`.
- **Aplicação** (`client/`): React 19 em TSX, empacotada pelo próprio Bun a partir do import do `index.html`, sem Vite nem etapa de build. Em desenvolvimento (`bun dev:web`) há hot reload; com `NODE_ENV=production`, o bundle é minificado na inicialização.
  - `views/`: as telas;
  - `components/`: card, detalhe, botões e campos;
  - `stores/`: estado global (vagas, currículos, tempo real, tema, avisos) sobre um store mínimo em `lib/store.ts`;
  - `lib/`: formatação, filtros e validação do formulário;
  - `tailwind.css`: o CSS inteiro do site. O Tailwind 4 entra pelo `bun-plugin-tailwind` (configurado no `bunfig.toml`), com o preflight; o estilo de cada elemento fica nas classes do JSX, sem valores arbitrários (`text-[13px]`): só a escala padrão (veja `docs/padronizacao-front.md`). Os tokens ficam no `@theme` e viram classes (`bg-surface`, `text-muted`, `border-line`, `rounded-pill`); o tema escuro redefine os mesmos tokens num `@variant dark`, e `dark:` segue o `data-theme`. O que as classes não expressam fica ali como `@utility` (ex.: `inverted`, `bottom-safe-*`). Junte classes com o `cx` (`lib/cx.ts`), que resolve conflitos entre classes do Tailwind com o `tailwind-merge`, e declare as variantes dos componentes de `components/ui` com o `tv` (`tailwind-variants`), exportado pelo mesmo arquivo.
- **Tipos da API** (`api-types.ts`): compartilhados entre o servidor e o navegador.
