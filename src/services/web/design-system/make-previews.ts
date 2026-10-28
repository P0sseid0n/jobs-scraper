// Escreve previews/<Comp>.html: a prévia ao vivo de cada componente no design system do Claude Design. Cada uma monta
// o componente real (window.JobsScraperUI) com React.createElement. Rode da raiz: `bun design-system`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Preview = { group: string; height: number; subtitle: string; body: string }

// `body` é JS: `U` são os componentes, `h` é o React.createElement e `row`/`col` agrupam com o espaçamento padrão
const PREVIEWS: Record<string, Preview> = {
	Button: {
		group: 'Actions',
		height: 120,
		subtitle: 'lime / ghost, 4 tamanhos, desabilitado, link externo',
		body: `col(
	row(h(U.Button, { variant: 'lime' }, 'gerar currículo'), h(U.Button, { variant: 'ghost' }, 'limpar filtros'), h(U.Button, { variant: 'ghost', href: 'https://www.linkedin.com', external: true }, 'ver no LinkedIn'), h(U.Button, { variant: 'lime', disabled: true }, 'salvando…')),
	row(h(U.Button, { variant: 'lime', size: 'xs' }, 'xs'), h(U.Button, { variant: 'lime', size: 'sm' }, 'sm'), h(U.Button, { variant: 'lime', size: 'md' }, 'md'), h(U.Button, { variant: 'lime', size: 'lg' }, 'lg'))
)`,
	},
	IconButton: {
		group: 'Actions',
		height: 80,
		subtitle: 'sem borda / com borda, 3 tamanhos',
		body: `row(
	h(U.IconButton, { label: 'Fechar', size: 'xs' }, h(U.Icon, { name: 'close', size: 12 })),
	h(U.IconButton, { label: 'Copiar e-mail', size: 'sm' }, h(U.Icon, { name: 'copy' })),
	h(U.IconButton, { label: 'Reportar erro', size: 'md' }, h(U.Icon, { name: 'flag' })),
	h(U.IconButton, { label: 'Tema escuro', bordered: true }, h(U.Icon, { name: 'moon' })),
	h(U.IconButton, { label: 'Atualizar', size: 'sm', bordered: true }, h(U.Icon, { name: 'refresh' }))
)`,
	},
	TextLink: {
		group: 'Actions',
		height: 80,
		subtitle: 'link, link externo e botão com cara de link',
		body: `h('p', { className: 'text-sm' }, 'Vaga publicada por ', h(U.TextLink, { href: '#' }, 'Ana Souza'), ' no ', h(U.TextLink, { href: 'https://www.linkedin.com', external: true }, 'LinkedIn'), '. ', h(U.TextLink, null, 'mostrar post completo'))`,
	},
	Pill: {
		group: 'Actions',
		height: 150,
		subtitle: 'ligada / desligada, com contagem, linha e tracejada',
		body: `col(
	h(U.PillGroup, null,
		h(U.Pill, { pressed: true }, 'remoto ', h('span', { className: U.PILL_COUNT }, '128')),
		h(U.Pill, { pressed: false }, 'híbrido ', h('span', { className: U.PILL_COUNT }, '42')),
		h(U.Pill, { pressed: false }, 'presencial ', h('span', { className: U.PILL_COUNT }, '17')),
		h(U.Pill, { shape: 'dashed' }, '+ mostrar mais')
	),
	h('div', { className: 'flex max-w-xs flex-col gap-1.5' },
		h(U.Pill, { shape: 'row', pressed: true }, 'o cargo está errado'),
		h(U.Pill, { shape: 'row', pressed: false }, 'não é uma vaga')
	)
)`,
	},
	PillGroup: {
		group: 'Actions',
		height: 80,
		subtitle: 'pills que quebram linha',
		body: `h(U.PillGroup, null, ['React', 'TypeScript', 'Next.js', 'Vue', 'Angular', 'Tailwind', 'Node.js'].map((name, i) => h(U.Pill, { key: name, pressed: i < 2 }, name)))`,
	},
	Badge: {
		group: 'Display',
		height: 130,
		subtitle: '7 tons, 4 tamanhos, com borda',
		body: `col(
	row(h(U.Badge, { tone: 'neutral' }, 'React'), h(U.Badge, { tone: 'lime' }, 'nova'), h(U.Badge, { tone: 'running' }, 'coletando'), h(U.Badge, { tone: 'ok' }, 'concluída'), h(U.Badge, { tone: 'danger' }, 'falhou'), h(U.Badge, { tone: 'muted' }, 'pausada'), h(U.Badge, { tone: 'plain', bordered: true }, 'PJ')),
	row(h(U.Badge, { size: 'xs', tone: 'lime' }, '3'), h(U.Badge, { size: 'sm' }, 'remoto'), h(U.Badge, { size: 'md' }, 'TypeScript'), h(U.Badge, { size: 'lg', bordered: true }, h(U.StatusDot, { tone: 'lime', pulse: true }), 'scraper ativo'), h(U.Badge, { tone: 'plain', bordered: 'dashed' }, 'sem e-mail'))
)`,
	},
	BadgeList: {
		group: 'Display',
		height: 80,
		subtitle: 'as tecnologias de uma vaga',
		body: `h(U.BadgeList, null, ['React', 'TypeScript', 'Next.js', 'Jest', 'Storybook'].map(name => h('li', { key: name, className: U.badge() }, name)))`,
	},
	Icon: {
		group: 'Display',
		height: 120,
		subtitle: 'os 20 ícones, na cor do texto',
		body: `h('div', { className: 'grid grid-cols-10 gap-4 text-ink' }, ['search', 'mail', 'external', 'file', 'copy', 'check', 'close', 'download', 'moon', 'sun', 'back', 'first', 'alert', 'refresh', 'briefcase', 'settings', 'filter', 'trash', 'plus', 'flag', 'spinner'].map(name => h('div', { key: name, className: 'flex flex-col items-center gap-1.5' }, h(U.Icon, { name: name, size: 20 }), h('span', { className: 'font-mono text-xs text-muted' }, name))))`,
	},
	PdfIcon: {
		group: 'Display',
		height: 90,
		subtitle: 'pronto / sendo gerado',
		body: `row(h(U.PdfIcon, null, 'PDF'), h(U.PdfIcon, { dashed: true }, h(U.Icon, { name: 'spinner', size: 14 })))`,
	},
	Input: {
		group: 'Forms',
		height: 140,
		subtitle: 'md / sm, inválido, desabilitado',
		body: `h('div', { className: 'grid max-w-2xl grid-cols-2 gap-3' },
	h(U.Input, { defaultValue: 'desenvolvedor front-end', 'aria-label': 'Termo de busca' }),
	h(U.Input, { placeholder: 'ex.: React, Vue', 'aria-label': 'Tecnologias' }),
	h(U.Input, { size: 'sm', type: 'number', defaultValue: 50, 'aria-label': 'Posts por coleta' }),
	h(U.Input, { invalid: true, defaultValue: 'abc', 'aria-label': 'Intervalo' }),
	h(U.Input, { disabled: true, defaultValue: 'não editável', 'aria-label': 'Desabilitado' })
)`,
	},
	Select: {
		group: 'Forms',
		height: 80,
		subtitle: 'md / sm',
		body: `row(
	h(U.Select, { defaultValue: '7', 'aria-label': 'Período' }, h('option', { value: '1' }, 'últimas 24 horas'), h('option', { value: '7' }, 'últimos 7 dias'), h('option', { value: '30' }, 'últimos 30 dias')),
	h(U.Select, { size: 'sm', defaultValue: 'pt', 'aria-label': 'Idioma' }, h('option', { value: 'pt' }, 'português'), h('option', { value: 'en' }, 'inglês'))
)`,
	},
	SearchInput: {
		group: 'Forms',
		height: 80,
		subtitle: 'a busca da lista de vagas',
		body: `h(U.SearchInput, { label: 'Buscar vagas', placeholder: 'cargo, empresa, tecnologia ou texto do post', className: 'max-w-xl' })`,
	},
	Checkbox: {
		group: 'Forms',
		height: 80,
		subtitle: 'marcada / desmarcada, num rótulo',
		body: `col(
	h('label', { className: 'flex items-center gap-2 text-sm' }, h(U.Checkbox, { defaultChecked: true }), 'só vagas com e-mail'),
	h('label', { className: 'flex items-center gap-2 text-sm' }, h(U.Checkbox, null), 'esconder vagas já vistas')
)`,
	},
	Range: {
		group: 'Forms',
		height: 80,
		subtitle: 'um número com o valor no rótulo',
		body: `h('div', { className: 'flex max-w-xs flex-col gap-2' }, h('span', { className: U.LABEL }, 'posts por coleta · 50'), h(U.Range, { min: 1, max: 200, defaultValue: 50, 'aria-label': 'Posts por coleta' }))`,
	},
	Switch: {
		group: 'Forms',
		height: 80,
		subtitle: 'ligado / desligado / desabilitado',
		body: `row(h(U.Switch, { checked: true, label: 'Coleta automática', onChange: function () {} }), h(U.Switch, { checked: false, label: 'Avisar no Discord', onChange: function () {} }), h(U.Switch, { checked: true, disabled: true, label: 'Desabilitado', onChange: function () {} }))`,
	},
	SwitchField: {
		group: 'Forms',
		height: 140,
		subtitle: 'com título e explicação',
		body: `h('div', { className: 'flex max-w-md flex-col gap-4' },
	h(U.SwitchField, { id: 'auto', title: 'Coleta automática', description: 'Busca vagas novas a cada 30 minutos.', checked: true, onChange: function () {} }),
	h(U.SwitchField, { id: 'discord', title: 'Publicar no Discord', checked: false, onChange: function () {} })
)`,
	},
	Tabs: {
		group: 'Forms',
		height: 190,
		subtitle: 'uma conta por aba, com o painel de cada uma',
		body: `h(function Contas() {
	var state = React.useState('linkedin'), selected = state[0]
	var items = [{ value: 'linkedin', label: 'LinkedIn' }, { value: 'discord', label: 'Discord' }, { value: 'github', label: 'GitHub' }]
	return col(
		h(U.Tabs, { id: 'contas', label: 'Contas', items: items, selected: selected, onSelect: state[1] }),
		items.map(function (item) {
			return h(U.TabPanel, { key: item.value, tabsId: 'contas', value: item.value, selected: item.value === selected, className: 'flex max-w-md flex-col gap-1.5' },
				h(U.FieldLabel, { htmlFor: item.value + '-user' }, item.value === 'discord' ? 'ID do canal' : item.value === 'github' ? 'usuário' : 'e-mail'),
				h(U.Input, { id: item.value + '-user', placeholder: item.value === 'discord' ? '123456789012345678' : item.value === 'github' ? 'octocat' : 'voce@exemplo.com' }))
		})
	)
})`,
	},
	Combobox: {
		group: 'Forms',
		height: 320,
		subtitle: 'texto livre com sugestões filtradas',
		body: `h(function Demo() {
	var s = React.useState('')
	return h('div', { className: 'flex max-w-sm flex-col gap-1.5' }, h(U.FieldLabel, { htmlFor: 'area' }, 'Área'), h(U.Combobox, { id: 'area', value: s[0], options: ['Administração', 'Design', 'Enfermagem', 'Logística', 'Marketing', 'Vendas'], placeholder: 'ex.: Marketing', onChange: s[1] }))
})`,
	},
	KeywordInput: {
		group: 'Forms',
		height: 130,
		subtitle: 'chips que se adicionam com Enter',
		body: `h(function Demo() {
	var s = React.useState(['react', 'typescript', 'next.js'])
	return h('div', { className: 'flex max-w-xl flex-col gap-1.5' }, h(U.FieldLabel, { htmlFor: 'kw' }, 'Tecnologias de interesse'), h(U.KeywordInput, { id: 'kw', value: s[0], max: 20, onChange: s[1] }))
})`,
	},
	FieldLabel: {
		group: 'Forms',
		height: 110,
		subtitle: 'rótulo, explicação e erro de um campo',
		body: `h('div', { className: 'grid max-w-2xl grid-cols-2 gap-6' },
	h('div', { className: U.FIELDSET }, h(U.FieldLabel, { htmlFor: 'term' }, 'Termo de busca'), h(U.Input, { id: 'term', defaultValue: 'front-end', 'aria-describedby': 'term-help' }), h(U.FieldHelp, { id: 'term-help' }, 'O que vai na busca do LinkedIn.')),
	h('div', { className: U.FIELDSET }, h(U.FieldLabel, { htmlFor: 'every' }, 'Intervalo (minutos)'), h(U.Input, { id: 'every', invalid: true, defaultValue: '2', 'aria-describedby': 'every-error' }), h(U.FieldError, { id: 'every-error' }, 'Use pelo menos 5 minutos.'))
)`,
	},
	FieldHelp: {
		group: 'Forms',
		height: 90,
		subtitle: 'a explicação abaixo do campo',
		body: `h('div', { className: U.FIELDSET + ' max-w-sm' }, h(U.FieldLabel, { htmlFor: 'max' }, 'Vagas por coleta'), h(U.Input, { id: 'max', type: 'number', defaultValue: 50, 'aria-describedby': 'max-help' }), h(U.FieldHelp, { id: 'max-help' }, 'Acima de 100, o LinkedIn pode pedir verificação.'))`,
	},
	FieldError: {
		group: 'Forms',
		height: 90,
		subtitle: 'o erro de validação no lugar da explicação',
		body: `h('div', { className: U.FIELDSET + ' max-w-sm' }, h(U.FieldLabel, { htmlFor: 'mail' }, 'E-mail de contato'), h(U.Input, { id: 'mail', invalid: true, defaultValue: 'ana@', 'aria-describedby': 'mail-error' }), h(U.FieldError, { id: 'mail-error' }, 'Digite um e-mail completo, como ana@empresa.com.'))`,
	},
	Notice: {
		group: 'Feedback',
		height: 150,
		subtitle: 'info / warn / danger, md / lg',
		body: `col(
	h(U.Notice, { tone: 'info', icon: 'info' }, 'A comparação é por palavra inteira: “java” não pega “javascript”.'),
	h(U.Notice, { tone: 'warn', icon: 'alert' }, 'A IA citou o que não está escrito no post (modalidade, regime): confira esses dados no post.'),
	h(U.Notice, { tone: 'danger', icon: 'alert', size: 'lg' }, 'O login do LinkedIn falhou. Envie o código de verificação para voltar a coletar.')
)`,
	},
	EmptyState: {
		group: 'Feedback',
		height: 200,
		subtitle: 'neutro com ação / erro',
		body: `h('div', { className: 'grid grid-cols-2 gap-4' },
	h(U.EmptyState, { title: 'Nenhuma vaga com esses filtros', description: 'Tente tirar a modalidade ou aumentar o período.', action: h(U.Button, { variant: 'ghost' }, 'limpar filtros') }),
	h(U.EmptyState, { tone: 'error', title: 'Não consegui carregar as vagas', description: 'A API não respondeu.', action: h(U.Button, { variant: 'ghost' }, 'tentar de novo') })
)`,
	},
	CodeBlock: {
		group: 'Feedback',
		height: 220,
		subtitle: 'com copiar e rolagem (JSON)',
		body: `h(U.CodeBlock, { label: 'documento no mongodb', onCopy: () => {}, scroll: true, className: 'max-w-md' }, JSON.stringify({ title: 'Desenvolvedor Front-end Pleno', company: 'Acme', workMode: 'remote', technologies: ['React', 'TypeScript'] }, null, 2))`,
	},
	FieldScan: {
		group: 'Feedback',
		height: 160,
		subtitle: 'o campo da mensagem carregando',
		body: `h('div', { className: 'relative grid max-w-md' }, h('textarea', { className: U.field({ className: 'min-h-32 resize-none py-2.5' }), disabled: true, value: '' }), h(U.FieldScan, { label: 'a IA está escrevendo a mensagem para a vaga…', className: 'absolute inset-0' }))`,
	},
	Skeleton: {
		group: 'Feedback',
		height: 120,
		subtitle: 'o card de vaga carregando',
		body: `h('div', { className: 'flex max-w-md flex-col gap-2.5 rounded-lg border border-line bg-surface p-4' }, h(U.Skeleton, { className: 'h-5 w-3/4 rounded-xs bg-surface-2' }), h(U.Skeleton, { className: 'h-4 w-1/2 rounded-xs bg-surface-2' }), row(h(U.Skeleton, { className: 'h-6 w-16 rounded-pill bg-surface-2' }), h(U.Skeleton, { className: 'h-6 w-20 rounded-pill bg-surface-2' })))`,
	},
	StatusDot: {
		group: 'Feedback',
		height: 80,
		subtitle: '5 tons, glow e pulse',
		body: `row(
	h('span', { className: 'flex items-center gap-2 text-sm' }, h(U.StatusDot, { tone: 'lime', glow: true, pulse: true }), 'coletando'),
	h('span', { className: 'flex items-center gap-2 text-sm' }, h(U.StatusDot, { tone: 'ok' }), 'concluída'),
	h('span', { className: 'flex items-center gap-2 text-sm' }, h(U.StatusDot, { tone: 'danger' }), 'falhou'),
	h('span', { className: 'flex items-center gap-2 text-sm' }, h(U.StatusDot, { tone: 'muted' }), 'pausada'),
	h('span', { className: 'flex items-center gap-2 text-sm text-lime-text' }, h(U.StatusDot, { tone: 'current' }), 'na cor do texto')
)`,
	},
	ConfirmDialog: {
		group: 'Feedback',
		height: 260,
		subtitle: 'a modal aberta',
		body: `h(U.ConfirmDialog, { title: 'Sair sem salvar?', description: 'As alterações nas configurações vão se perder.', confirmLabel: 'sair sem salvar', cancelLabel: 'continuar editando', onConfirm: function () {}, onCancel: function () {} })`,
	},
	Page: {
		group: 'Layout',
		height: 220,
		subtitle: 'a moldura de uma tela (largura wide)',
		body: `h('div', { className: 'bg-bg' }, h(U.Page, { width: 'narrow', className: 'pt-6 pb-6' }, h('h2', { className: U.SECTION_TITLE }, 'Meus currículos'), h('p', { className: 'text-sm text-muted' }, 'O Page centraliza o conteúdo, dá as margens e o espaço entre os blocos (gap-7).'), h(U.Notice, { tone: 'warn' }, 'Os PDFs ficam guardados por 90 dias.')))`,
	},
	SectionNav: {
		group: 'Layout',
		height: 70,
		subtitle: 'atalhos fixos para as seções, com a atual marcada',
		body: `h(U.SectionNav, { label: 'Seções das configurações', sections: [{ id: 'perfil', label: 'perfil' }, { id: 'coleta', label: 'coleta' }, { id: 'filtros', label: 'filtros' }, { id: 'contas', label: 'contas' }] })`,
	},
	Disclosure: {
		group: 'Layout',
		height: 220,
		subtitle: 'card recolhido / detalhe inline',
		body: `col(
	h(U.Disclosure, { variant: 'card', summary: h('span', { className: 'flex flex-col gap-1.5' }, h('h2', { className: U.SECTION_TITLE }, 'começar de um modelo'), h('span', { className: 'text-sm text-muted' }, 'Troque os dados pelos seus e valide.')) }, h('p', { className: 'text-sm' }, 'Os modelos ficam aqui.')),
	h(U.Disclosure, { summary: 'ver o que o .tex precisa ter', defaultOpen: true }, h(U.FieldHelp, null, 'Resumo, competências e projetos são opcionais.'))
)`,
	},
	Hero: {
		group: 'Layout',
		height: 110,
		subtitle: 'título com parte em mono, lead e aside',
		body: `h(U.Hero, { title: h(React.Fragment, null, 'coletas ', h(U.Hero.Mono, null, 'do scraper.')), lead: 'Histórico dos últimos 90 dias.', aside: h(U.Badge, { size: 'lg', bordered: true }, h(U.StatusDot, { tone: 'lime', glow: true, pulse: true }), 'próxima coleta em 12 min') })`,
	},
}

const outdir = join(import.meta.dir, 'previews')
mkdirSync(outdir, { recursive: true })
for (const [name, preview] of Object.entries(PREVIEWS)) {
	const html = `<!-- @dsCard group="${preview.group}" height=${preview.height} subtitle="${preview.subtitle}" -->
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${name}</title></head>
<body class="bg-bg p-5 font-sans text-ink">
<div id="root"></div>
<script>
var U = window.JobsScraperUI, h = React.createElement
function row() { return h.apply(null, ['div', { className: 'flex flex-wrap items-center gap-3' }].concat([].slice.call(arguments))) }
function col() { return h.apply(null, ['div', { className: 'flex flex-col gap-4' }].concat([].slice.call(arguments))) }
ReactDOM.createRoot(document.getElementById('root')).render(${preview.body})
</script>
</body>
</html>
`
	writeFileSync(join(outdir, `${name}.html`), html)
}
console.log(`previews/: ${Object.keys(PREVIEWS).length} prévias`)
