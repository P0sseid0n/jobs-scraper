# 📄 cv-updater

Gera um currículo em PDF ajustado para uma vaga, pedido pelo bot ou pelo site. O currículo base é o seu próprio `.tex` (o mesmo do Overleaf), e o PDF é compilado com o [Tectonic](https://tectonic-typesetting.github.io). O serviço reescreve só os trechos de texto, então o PDF sai com o mesmo design do original.

[← voltar ao README principal](../../../README.md)

## O que muda em cada currículo

- **Apresentação:** reescrita pela IA para a vaga, destacando o que combina e citando as tecnologias pedidas.
- **Habilidades:** as tecnologias da vaga entram na categoria certa (nuvem e DevOps vão para ferramentas), ficam só as suas categorias relacionadas à vaga, e as tecnologias da vaga vêm primeiro. Conceitos e metodologias ("Agile") não entram como tecnologia.
- **Projetos:** com `GITHUB_USERNAME`, os projetos (`CV_MAX_PROJECTS`, padrão 2) vêm dos seus repositórios públicos, por ranqueamento:
  - +10 por tecnologia da vaga que o projeto usa (linguagens, topics e dependências do `package.json`);
  - +3 se tem descrição e +3 se tem topics;
  - desempate pelo mais recente.

  Projetos que já estão no `.tex` usam o texto que você escreveu; os outros ganham uma descrição gerada a partir do README. Forks, arquivados e os de `GITHUB_EXCLUDE_REPOS` ficam de fora. Sem GitHub, ficam os projetos do `.tex`, reordenados.
- **Experiência:** os bullets são reordenados por relevância. Nenhum é criado ou removido.
- **Mensagem de candidatura** (só em vagas com e-mail): a IA escreve o e-mail a partir do currículo ajustado, citando o cargo, a empresa, tecnologias da vaga e um projeto relacionado, no idioma do post. Regras descartam placeholders, anos de experiência e tecnologias que não estão no currículo nem na vaga. Se a IA falhar, fica o modelo padrão.

Se o resultado passar de uma página, primeiro sai um projeto e depois volta a apresentação original, até caber. Os PDFs ficam em `data/cv/generated/`.

## Configuração

1. Coloque seu currículo em `data/cv/cv.tex`. Use `assets/cv.example.tex` como referência do formato: seções `Apresentação`, `Habilidades Técnicas` (`\item \textbf{Categoria:} item, item`), `Projetos` (blocos separados por `\vspace`) e `Experiência Profissional` (bullets em `itemize`).
2. Instale o [Tectonic](https://github.com/tectonic-typesetting/tectonic/releases) e aponte `TECTONIC_BIN` para o executável. No Docker, ele já vem na imagem. Na primeira compilação, ele baixa os pacotes LaTeX e guarda em cache.
3. A fonte Nunito (do modelo) já vem em `assets/fonts/` (licença OFL). Se o seu `.tex` usar outra fonte com `\setmainfont{Fonte}`, coloque nessa pasta os arquivos `Fonte-Regular.otf`, `Fonte-Italic.otf` e `Fonte-Bold.otf` (ou `-ExtraBold.otf`).

Outras variáveis: `CV_TEX_FILE`, `CV_FONTS_DIR`, `CV_OUTPUT_DIR`, `CV_CACHE_DIR`, `GITHUB_TOKEN` e `GITHUB_CACHE_HOURS`, documentadas no `.env.example`.

## Como o pedido chega e volta

O pedido (`CvRequest`) traz um `replyTo` com a fila de resposta e um contexto livre. O cv-updater devolve o resultado nessa fila, com o mesmo contexto: o bot usa a `discord-cv` e o site, a `web-cv`.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `base-resume.ts` | leitura do `cv.tex` base |
| `tailoring-suggestions.ts`, `tailoring-prompt.ts` | sugestões da IA (apresentação, habilidades, projetos) |
| `tailor-resume.ts` | monta o currículo da vaga |
| `application-message.ts` | mensagem de candidatura |
| `resume-pdf.ts`, `latex-compiler.ts` | PDF em uma página, compilado com o Tectonic |
| `resume/` | leitura e escrita do `.tex` sem alterar o design |
| `skills/` | seção de habilidades e associação entre as tecnologias da vaga e as do currículo |
| `projects/` | GitHub (API e cache), ranking, escolha e descrição dos projetos |
