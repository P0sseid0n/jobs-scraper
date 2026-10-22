# 📄 cv-updater

Gera um currículo em PDF ajustado para uma vaga, pedido pelo bot ou pelo site. O currículo base é o seu próprio `.tex` (o mesmo do Overleaf), e o PDF é compilado com o [Tectonic](https://tectonic-typesetting.github.io). O serviço reescreve só os trechos de texto, então o PDF sai com o mesmo design do original.

[← voltar ao README principal](../../../README.md)

## O que muda em cada currículo

- **Apresentação:** reescrita pela IA para a vaga, destacando o que combina e citando as tecnologias pedidas.
- **Habilidades:** as tecnologias da vaga entram na categoria certa (nuvem e DevOps vão para ferramentas), ficam só as suas categorias relacionadas à vaga, e as tecnologias da vaga vêm primeiro. Conceitos e metodologias ("Agile") não entram como tecnologia.
- **Projetos:** com o usuário do GitHub (em Configurações › Contas ou `GITHUB_USERNAME`), os projetos (`CV_MAX_PROJECTS`, padrão 2) vêm dos seus repositórios públicos, por ranqueamento:
  - +10 por tecnologia da vaga que o projeto usa (linguagens, topics e dependências do `package.json`);
  - +3 se tem descrição e +3 se tem topics;
  - desempate pelo mais recente.

  Projetos que já estão no `.tex` usam o texto que você escreveu; os outros ganham uma descrição gerada a partir do README. Forks, arquivados e os de `GITHUB_EXCLUDE_REPOS` ficam de fora. Sem GitHub, ficam os projetos do `.tex`, reordenados.
- **Experiência:** os bullets são reordenados por relevância. Nenhum é criado ou removido.
- **Mensagem de candidatura** (só em vagas com e-mail): a IA escreve o e-mail a partir do currículo ajustado, citando o cargo, a empresa, tecnologias da vaga e um projeto relacionado, no idioma do post. Regras descartam placeholders, anos de experiência e tecnologias que não estão no currículo nem na vaga. Se a IA falhar, fica o modelo padrão.

Se o resultado passar de uma página, primeiro sai um projeto e depois volta a apresentação original, até caber. Os PDFs ficam em `data/cv/generated/`.

## Configuração

1. Envie seu currículo pelo site, em **Meus currículos › currículo base** (veja abaixo), ou coloque-o em `data/cv/cv.tex`. Use `assets/cv.example.tex` como referência do formato: seções `Apresentação`, `Habilidades Técnicas` (`\item \textbf{Categoria:} item, item`), `Projetos` (blocos separados por `\vspace`) e `Experiência Profissional` (bullets em `itemize`).
2. Instale o [Tectonic](https://github.com/tectonic-typesetting/tectonic/releases) e aponte `TECTONIC_BIN` para o executável. No Docker, ele já vem na imagem. Na primeira compilação, ele baixa os pacotes LaTeX e guarda em cache.
3. A fonte Nunito (do modelo) já vem em `assets/fonts/` (licença OFL). Se o seu `.tex` usar outra fonte com `\setmainfont{Fonte}`, coloque nessa pasta os arquivos `Fonte-Regular.otf`, `Fonte-Italic.otf` e `Fonte-Bold.otf` (ou `-ExtraBold.otf`).

Outras variáveis: `CV_TEX_FILE`, `CV_FONTS_DIR`, `CV_OUTPUT_DIR`, `CV_CACHE_DIR`, `GITHUB_TOKEN` e `GITHUB_CACHE_HOURS`, documentadas no `.env.example`. O usuário e o token do GitHub também podem ser salvos pelo site e são relidos a cada currículo ([ordem de leitura](../../shared/README.md#credenciais)).

## Currículo base pelo site

O site guarda as versões do currículo base na coleção `cv_base_versions`. A ativa é a de `activatedAt` mais recente, e o `loadBaseResume` a relê a cada pedido: trocar de versão vale a partir do próximo currículo, sem reiniciar. Sem nenhuma versão ativada, vale o arquivo `CV_TEX_FILE` (`data/cv/cv.tex`).

Uma versão nova passa antes pela validação, uma mensagem `CvBaseValidationRequest` na fila `cv-updater-base`. O serviço interpreta o `.tex`, confere as seções esperadas (`EXPECTED_SECTIONS` em `base-resume.ts`) e compila com o Tectonic. A resposta, na fila `web-cv-base`, traz os erros e a pré-visualização em PDF. Só uma versão sem erros pode ser ativada. A fila é separada da `cv-updater` e consumida em paralelo: a validação, que só compila, não espera um currículo em geração (com a IA, ele leva um minuto ou mais).

## Como o pedido chega e volta

O pedido (`CvRequest`) traz um `replyTo` com a fila de resposta e um contexto livre. O cv-updater devolve o resultado nessa fila, com o mesmo contexto: o bot usa a `discord-cv` e o site, a `web-cv`.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `base-resume.ts` | leitura do currículo base (banco ou `cv.tex`) e validação de um `.tex` candidato |
| `tailoring-suggestions.ts`, `tailoring-prompt.ts` | sugestões da IA (apresentação, habilidades, projetos) |
| `tailor-resume.ts` | monta o currículo da vaga |
| `application-message.ts` | mensagem de candidatura |
| `resume-pdf.ts`, `latex-compiler.ts` | PDF em uma página, compilado com o Tectonic |
| `resume/` | leitura e escrita do `.tex` sem alterar o design |
| `skills/` | seção de habilidades e associação entre as tecnologias da vaga e as do currículo |
| `projects/` | GitHub (API e cache), ranking, escolha e descrição dos projetos |
