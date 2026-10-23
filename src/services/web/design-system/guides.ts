// As orientações de cada componente (o components/<Comp>/README.md do design system): a primeira frase é o resumo.
export const GUIDES: Record<string, string> = {
	Button: `Botão com texto; com \`href\`, vira um link com a mesma cara.

- \`variant\` é obrigatório: \`lime\` para a ação principal da área (uma só: "gerar currículo", "salvar"), \`ghost\` para as outras ("limpar filtros", "cancelar").
- \`size\`: \`md\` é o padrão; \`sm\` e \`xs\` em barras e cards; \`lg\` em chamadas grandes.
- Com \`href\` e \`external\`, abre em outra aba e mostra o ícone de link externo antes do texto.
- O texto vai em minúsculas. Para só um ícone, use \`IconButton\`.`,
	IconButton: `Botão só com ícone (os ícones vêm em \`children\`).

- \`label\` é obrigatório: vira o \`aria-label\` e a dica do mouse ("Fechar", "Copiar e-mail").
- Sem borda, o hover escurece a própria cor do texto e funciona em qualquer fundo; \`bordered\` para ações soltas (o botão de tema no cabeçalho).
- \`size\`: \`xs\` (26px) dentro de chips, \`sm\` (32px) em cards, \`md\` (40px) no resto. O ícone: \`<Icon>\` com \`size\` 12 a 16.`,
	TextLink: `Link sublinhado no meio do texto; sem \`href\`, vira um botão com a mesma cara (ex.: "mostrar post completo").

- Use dentro de frases e para ações discretas; ações de verdade são \`Button\`.
- \`external\` abre em outra aba e mostra "↗" depois do texto.`,
	Pill: `Opção em formato de cápsula, usada nos filtros e na modal de reportar.

- \`pressed\` liga e desliga (fica em \`color-ink\` quando ligada); sem ele, a pill é uma ação comum ("+ mostrar mais", com \`shape="dashed"\`).
- \`shape="row"\` ocupa a linha com o texto à esquerda, para listas de opções (os motivos de reportar uma vaga).
- A contagem ao lado do texto vai num \`<span className={PILL_COUNT}>\`. Agrupe com \`PillGroup\`.`,
	PillGroup: `Grupo de pills que quebra linha.

- Um \`div\` flex com \`gap-1.5\`: coloque as \`Pill\` dentro, normalmente com um rótulo \`LABEL\` acima ("modalidade").`,
	Badge: `Cápsula pequena de texto (tecnologia, regime, status, contador); \`tone\` dá a cor.

- \`tone\`: \`neutral\` (padrão, tecnologias), \`lime\` (novidade, contador), \`running\` (em andamento), \`ok\`, \`danger\`, \`muted\` (pausado) e \`plain\` (sem fundo, com \`bordered\`).
- \`size\`: \`md\` padrão; \`xs\` para contador sobre um ícone; \`lg\` com cara de botão (o status do scraper, com um \`StatusDot\`).
- \`bordered\`: \`true\` ou \`"dashed"\` (para algo que falta: "sem e-mail").
- Texto sempre em mono, minúsculo ou como a tecnologia se escreve ("TypeScript"). Em lista, use \`BadgeList\`.`,
	BadgeList: `Lista de badges que quebra linha (os itens são \`<li className={badge()}>\`).

- Use para as tecnologias de uma vaga; cada item é um \`<li>\` com a classe \`badge()\` (aceita os mesmos \`tone\` e \`size\`).`,
	Icon: `Ícone de traço (24×24, na cor do texto), escolhido por \`name\`.

- Os nomes: search, mail, external, file, copy, check, close, download, moon, sun, back, alert, refresh, briefcase, settings, filter, trash, plus, flag, spinner.
- \`size\` em px (padrão 16). A cor vem do \`color\` do pai (\`text-muted\`, \`text-lime-text\`). \`spinner\` gira sozinho.
- Sem emoji no lugar de ícones.`,
	PdfIcon: `A "folha" do currículo (decorativa); \`dashed\` enquanto ele está sendo gerado.

- O conteúdo é um texto curto em mono ("PDF") ou um \`<Icon name="spinner">\` durante a geração. Fica ao lado do nome do currículo na lista.`,
	Input: `Campo de texto; \`size="sm"\` nos filtros, \`md\` nos formulários.

- Sempre com nome: um \`FieldLabel\` ligado pelo \`id\`, ou \`aria-label\` quando o rótulo visível é outro.
- \`invalid\` deixa a borda em \`color-danger\` e marca \`aria-invalid\`; o erro vai num \`FieldError\` ligado por \`aria-describedby\`.
- Aceita os atributos de um \`<input>\` (\`type\`, \`value\`, \`placeholder\`, \`onChange\`, \`disabled\`).`,
	Select: `Seleção nativa com a mesma caixa do Input.

- Os \`<option>\` vão em \`children\`. Mesmos \`size\` e \`invalid\` do \`Input\`, e sempre com nome (\`FieldLabel\` ou \`aria-label\`).`,
	SearchInput: `Busca com a lupa dentro do campo; \`label\` é o nome para o leitor de tela.

- A busca da lista de vagas; o \`placeholder\` diz onde ela procura ("cargo, empresa, tecnologia ou texto do post").`,
	Checkbox: `Caixa de seleção: vazia com a borda da linha; marcada, preenchida como o \`Switch\` ligado (ink, ou lime no escuro).

- Sempre dentro de um \`<label className="flex items-center gap-2 text-sm">\` com o texto ao lado.
- Para ligar e desligar uma configuração, prefira \`Switch\`/\`SwitchField\`.`,
	Range: `Controle deslizante: o trilho fica em lime até o valor e a bolinha cresce ao arrastar.

- Mostre o valor atual num rótulo acima (\`LABEL\`: "posts por coleta · 50") e dê \`aria-label\`.
- Com unidade, passe \`aria-valuetext\` ("50 posts"): sem ele, o leitor de tela anuncia só o número.`,
	Switch: `Interruptor liga/desliga (checkbox nativo, acessível pelo teclado).

- Controlado: \`checked\` e \`onChange(valor)\` são obrigatórios, e \`label\` é o nome para o leitor de tela.
- Com o texto visível ao lado, use \`SwitchField\`.`,
	SwitchField: `Interruptor com o texto ao lado (e uma explicação opcional abaixo do texto).

- \`id\` liga o texto ao interruptor; \`title\` é o texto (e o nome acessível); \`description\` explica em uma linha.
- Usado nas configurações, um por linha, numa coluna com \`gap-4\`.`,
	Tabs: `Abas sublinhadas para alternar entre partes do mesmo bloco (ex.: as contas em Configurações, uma por aba).

- Controlado: \`items\` (\`value\` e \`label\`), \`selected\` e \`onSelect\`. \`label\` é o nome da lista para o leitor de tela e \`id\` liga as abas aos \`TabPanel\`.
- O texto das abas é só o nome (sem ícone nem bolinha de status); o estado de cada parte fica dentro do painel.
- Setas, Home e End trocam de aba; o Tab vai direto para o painel. Para filtros que ligam e desligam, use \`Pill\`.`,
	TabPanel: `O conteúdo de uma aba, com o mesmo \`tabsId\` do \`Tabs\` e o \`value\` da aba.

- Monte um por aba, todos ao mesmo tempo: fora da aba escolhida (\`selected\` falso) ele só fica escondido, e um formulário pela metade continua preenchido.
- Recebe as classes do layout do conteúdo (ex.: \`flex flex-col gap-4\`).`,
	Combobox: `Campo de texto com sugestões, como um select com filtro: a lista abre ao focar o campo, filtra enquanto se digita (ignorando maiúsculas e acentos) e aceita qualquer texto.

- Controlado: \`value\` (o texto) e \`onChange(texto)\`; \`options\` são as sugestões.
- Setas e Enter escolhem uma opção; Esc fecha a lista.
- Use quando há respostas comuns mas a pessoa pode escrever a dela (área, cargo). Se só valem as opções, use \`Select\`.
- Dê um \`FieldLabel\` com o mesmo \`id\`.`,
	KeywordInput: `Campo de chips: digite e Enter (ou vírgula) para adicionar; Backspace no campo vazio remove o último.

- Controlado: \`value\` (as palavras) e \`onChange(palavras)\`; \`max\` limita a quantidade e \`maxLength\` (50) o tamanho de cada uma.
- Por padrão tudo vira minúsculas; \`keepCase\` mantém a grafia digitada ("Vue.js").
- Dê um \`FieldLabel\` com o mesmo \`id\`.`,
	FieldLabel: `Nome do campo, acima dele; \`htmlFor\` é o \`id\` do campo.

- Rótulo, campo e explicação ficam juntos num \`<div className={FIELDSET}>\` (coluna com \`gap-2.5\`).
- Abaixo do campo, \`FieldHelp\` explica e \`FieldError\` mostra o erro de validação no lugar dele.`,
	FieldHelp: `Explicação do campo, abaixo dele (ligue ao campo com \`aria-describedby\`).

- Uma frase em \`text-sm\` e \`color-muted\`. Quando o campo tem erro, troque pelo \`FieldError\`.`,
	FieldError: `Erro de validação do campo, no lugar da explicação.

- Em \`color-danger\`; marque o campo com \`invalid\` e ligue os dois por \`aria-describedby\`.
- Diga como corrigir: "Use pelo menos 5 minutos.", "Digite um e-mail completo, como ana@empresa.com."`,
	Notice: `Aviso dentro da tela (dados duvidosos, falha de uma parte); erros que pedem ação usam \`role="alert"\`.

- \`tone\`: \`warn\` (dados duvidosos, algo a conferir) ou \`danger\` (falhou).
- \`icon\` é um nome do \`Icon\` (normalmente \`alert\`); \`size="lg"\` para o aviso principal de uma tela.
- Para uma tela inteira sem conteúdo, use \`EmptyState\`.`,
	EmptyState: `Tela ou bloco sem conteúdo: nada encontrado, nada ainda ou falha ao carregar.

- \`title\` diz o que aconteceu; \`description\` o porquê ou o que fazer; \`action\` é um \`Button\` ghost que resolve ("limpar filtros", "tentar de novo").
- \`tone="error"\` mostra o ícone de alerta e avisa o leitor de tela. \`bare\` tira o card quando já está dentro de um.`,
	CodeBlock: `Texto técnico para ler e copiar (o JSON da vaga, o erro de uma busca), em fonte mono e com as quebras de linha.

- Escuro nos dois temas (\`color-code-bg\`): no tema escuro, um preto translúcido que combina com o fundo de baixo, inclusive o de um card de erro.
- \`label\` diz o que é o texto, em minúsculas ("documento no mongodb", "erro original").
- \`onCopy\` mostra o botão "copiar"; no site ele chama o \`copyText\`, que avisa com um toast.
- \`scroll\` para textos longos (um JSON): limita a altura e rola dentro do bloco.
- Para detalhes de depuração, deixe o bloco recolhido atrás de um link ou de um \`<details>\`.`,
	Skeleton: `Bloco pulsando no lugar do conteúdo que ainda está carregando (o tamanho e a cor vêm do \`className\`).

- Dê a cor (\`bg-surface-2\`) e desenhe a forma do conteúdo que vem: linhas com \`h-4\`/\`h-5\` e larguras em fração (\`w-3/4\`), badges com \`rounded-pill\`.`,
	StatusDot: `Ponto colorido de status (8px), decorativo: o texto ao lado diz o status.

- \`tone\`: \`lime\` (ao vivo, coletando), \`ok\`, \`danger\`, \`muted\` (pausado) e \`current\` (na cor do texto).
- \`glow\` e \`pulse\` só para o que está acontecendo agora. Sempre com o texto ao lado.`,
	ConfirmDialog: `Pergunta de sim ou não numa modal; fechar (Esc, clique fora ou o botão de cancelar) conta como cancelar.

- Abre ao montar. \`title\` é a pergunta ("Sair sem salvar?"), \`description\` a consequência; \`confirmLabel\` e \`cancelLabel\` dizem o que cada botão faz ("sair sem salvar" / "continuar editando"), nunca "sim" e "não".
- \`onConfirm\` e \`onCancel\` são obrigatórios.`,
	Page: `Conteúdo de uma tela, centralizado e com o espaçamento das margens.

- Envolve tudo abaixo do cabeçalho. \`width\`: \`wide\` (padrão: as listas de vagas e coletas), \`medium\` (currículos e formulários), \`narrow\` (uma coisa só: a vaga, o 404).
- Os blocos dentro dele já ficam com \`gap-7\` (\`gap-5\` no celular). A tela costuma abrir com um \`Hero\`.`,
	Hero: `Abertura da tela: título numa linha (a parte em mono vem em \`<Hero.Mono>\`), texto de apoio opcional e, à direita, \`aside\`.

- \`title\` em minúsculas com a parte final em \`Hero.Mono\` ("vagas <Hero.Mono>coletadas.</Hero.Mono>"); \`lead\` só quando explica algo que a tela não mostra, em até duas frases curtas.
- \`aside\` leva o status ou a ação da tela (um \`Badge\` \`lg\` com \`StatusDot\`, um \`Button\`).`,
}
