# Contribuindo

Como propor mudanças no jobs-scraper: do registro da ideia (issue) até o merge na `main`. Para instalar e rodar o projeto, veja a seção **Como rodar localmente** do [README](README.md).

## Issues

Toda mudança começa por uma issue, aberta com um dos modelos (**Melhoria** ou **Bug**). Os modelos já pedem as seções certas. Em resumo:

- **Uma issue por mudança.** Se uma ideia envolve partes independentes, abra uma issue para cada.
- **Título com um verbo no infinitivo dizendo o resultado:** "Identificar o regime de contratação da vaga", "Ler as imagens dos posts para completar os dados da vaga". Num bug, o título diz o que está errado: "PDF do currículo abre vazio no site".
- **Corpo de uma melhoria:**
  - **Contexto:** como está hoje e por que mudar.
  - **O que fazer:** as mudanças, separadas por serviço ou camada (scraper, post-processing, contratos, site, Discord…).
  - **Critérios de aceite:** itens verificáveis que dizem quando está pronto, incluindo os testes esperados.
- **Labels:** `enhancement` para melhorias e `bug` para bugs (os modelos já aplicam). A área afetada fica no campo **Área** do formulário.
- **Nunca cole dados pessoais:** nada do `.env`, cookies, e-mails de recrutadores ou trechos do seu currículo.

## Branches

Crie a branch a partir da `main` atualizada, com um prefixo do tipo e uma descrição curta em kebab-case:

| Prefixo  | Uso                                   | Exemplo                      |
| -------- | ------------------------------------- | ---------------------------- |
| `feat/`  | Funcionalidade nova                   | `feat/regime-contratacao`    |
| `fix/`   | Correção de bug                       | `fix/pdf-curriculo-vazio`    |
| `docs/`  | Só documentação                       | `docs/contributing`          |
| `chore/` | Configuração, dependências, scripts   | `chore/atualiza-puppeteer`   |

## Commits

- **Mensagem em português**, com o verbo na 3ª pessoa do presente, dizendo o que o commit faz: "Adiciona o serviço cv-updater", "Corrige o PDF vazio do currículo no site", "Não usa a modalidade como local da vaga".
- **Primeira linha curta** (até ~72 caracteres), sem ponto final. Se precisar, deixe uma linha em branco e explique no corpo **por que** a mudança foi feita.
- **Um assunto por commit.** Mudanças independentes vão em commits separados, mesmo na mesma branch.
- **Feche a issue pelo commit:** o commit que resolve a issue termina com `Closes #<número>`.
- **Adicione os arquivos pelo caminho** (`git add src/arquivo.ts …`), não com `git add -A` ou `git add .`, e confira o `git status` antes de commitar. Assim arquivos locais (anotações, `data/`, `.env`) não entram por engano.

## Código

O formato é verificado pelo Prettier e pelo Biome (`.prettierrc`, `biome.json` e `.editorconfig`). No VS Code, use a extensão do Prettier com formatação ao salvar. Além disso:

- **Português** em comentários, mensagens de log, erros e textos da interface. Nomes de variáveis, funções e campos ficam em inglês.
- **Comentários explicam o porquê**, não o que o código já diz. Funções exportadas têm TSDoc curto.
- **Contratos entre serviços** (mensagens das filas) ficam em `src/shared/contracts`, como schemas do zod, e são validados por quem consome a fila. Os campos usam camelCase (`postLink`, `recruiterEmail`).
- **Mudou o formato de algo salvo no MongoDB?** Inclua um script de migração que possa rodar mais de uma vez (como o `bun db:migrate-jobs`) e cite no PR.
- **Configurações:** o que é infraestrutura vai no `.env` (validado na inicialização de cada serviço); o que pode mudar com o serviço rodando vai na coleção `settings` (`@shared/settings`).
- **Logs:** em `info`, só IDs e metadados. O conteúdo dos posts e as respostas da IA ficam em `debug`.
- **LinkedIn:** mudanças no scraper não podem aumentar o volume de acesso sem necessidade (ver **Observações importantes** no [README](README.md)). Para testar, use poucos posts por coleta.

## Testes

- Testes com `bun test`, no arquivo `*.test.ts` ao lado do código testado.
- Prefira testar funções puras (leitura de texto, filtros, montagem de mensagens) com **dados reais**: textos de posts, HTML do LinkedIn, respostas do modelo. Remova dados pessoais deles antes de versionar.
- Todo bug corrigido ganha um teste que falharia antes da correção.

## Antes do merge

Rode as mesmas verificações do CI (`.github/workflows/ci.yml`):

```bash
bun run typecheck
bun run lint
bun run format:check
bun test
```

Se a mudança aparece no site ou no Discord, confira o resultado de verdade (`bun dev`) além dos testes.

Depois:

1. Abra um PR para a `main` com título no mesmo formato dos commits e, na descrição, o que mudou, como testar e `Closes #<número>`.
2. Com o CI verde, faça o merge e apague a branch.
