# 🗄️ storage

Salva as vagas da fila `storage` no MongoDB e anuncia cada vaga nova para os canais.

[← voltar ao README principal](../../../README.md)

- **Sem duplicar:** o upsert é por `postId`, com índice único. A mesma vaga nunca é salva duas vezes, mesmo se a mensagem for reprocessada.
- **Campos obrigatórios:** vagas sem cargo ou sem o link do post no LinkedIn são descartadas (`job-validation.ts`).
- **Anúncio:** cada vaga nova vai para o evento `job-published` (exchange fanout). Cada canal liga a própria fila nele: o bot usa a `discord` e o site, a `web`. Outro canal (Telegram…) ligaria a própria fila e receberia todas as vagas. Se nenhum canal estiver ligado, a vaga não é marcada como anunciada e o anúncio é tentado de novo depois.
- **Migração:** `bun db:migrate-jobs` atualiza as vagas salvas para o formato atual dos campos (`migrate-job-fields.ts`). Pode rodar mais de uma vez.
