<div align="center">

<img src="docs/neurotrail-logo.png" width="96" alt="NeuroTrail" />

# NeuroTrail

**Veja o que seu agente de código com IA realmente fez e se a mudança é confiável.**

Local-first. Multiagente. Sem instrumentação.

[![npm](https://img.shields.io/npm/v/neurotrail?color=cb3837&logo=npm)](https://www.npmjs.com/package/neurotrail)
&nbsp;[![CI](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml/badge.svg)](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml)
&nbsp;[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p>
  🇺🇸 <a href="README.md">English</a>
  · 🇯🇵 <a href="README.ja-JP.md">日本語</a>
  · 🇨🇳 <a href="README.zh-CN.md">简体中文</a>
  · 🇰🇷 <a href="README.ko.md">한국어</a>
  · 🇩🇪 <a href="README.de.md">Deutsch</a>
  · 🇪🇸 <a href="README.es.md">Español</a>
  · 🇫🇷 <a href="README.fr.md">Français</a>
  · 🇧🇷 Português
</p>

<br/>

<img src="docs/hero.gif" alt="NeuroTrail reproduz o trabalho de vários agentes de IA como um grafo neural" width="820" />

<br/><br/>

<table>
  <tr>
    <td width="50%">
      <img src="docs/task-map.gif" alt="Mapa compacto de evidências do PR com os arquivos e comandos de teste tocados por Claude, Codex e Gemini" width="400" />
    </td>
    <td width="50%">
      <img src="docs/review-path.gif" alt="Gemini revisa o caminho de evidências enquanto o resumo de confiança aponta para arquivos e comandos exatos" width="400" />
    </td>
  </tr>
  <tr>
    <td><sub><strong>Mapa de tarefas.</strong>A história do PR com três agentes continua, usando a mesma estrutura de repositório/árvore de arquivos do visualizador ao vivo.</sub></td>
    <td><sub><strong>Trilha de evidências.</strong>Os alertas voltam ao arquivo, comando ou artefato que os causou.</sub></td>
  </tr>
</table>

</div>

---

Cada vez mais pull requests são escritas por agentes de IA. Revisores recebem o **diff**, mas o diff não mostra como o agente chegou ali: o que ele investigou, abandonou, releu, testou ou repetiu.

NeuroTrail reconstrói a execução a partir dos logs locais que os agentes já escrevem e gera dois artefatos para revisores ou para o próximo agente:

- **Resumo de confiança**: fatos verificáveis, comandos, resultados reais de teste, custo e alertas para revisão humana.
- **Replay autocontido**: um único HTML que anima a execução como um grafo neural com linha do tempo.

NeuroTrail não inicia nem controla agentes e não envia nada para a nuvem.

## Início rápido

Requisitos: Node.js 20+ e uma sessão local de agente de código neste workspace.

```bash
npx neurotrail review

# a partir de um clone:
node bin/neurotrail.mjs review
```

Saídas:

- `.neurotrail/review/latest.md` - resumo para colar em um PR
- `.neurotrail/reports/latest.html` - replay interativo compartilhável

## Visualizador ao vivo

```bash
git clone https://github.com/KF242131/neurotrail.git
cd neurotrail
npm install
npm run dev
```

Abra `http://localhost:5173`. Sem sessão ativa, ele mostra um replay de exemplo; quando detecta um agente suportado no mesmo workspace, muda para a execução ao vivo.

## Idiomas

O visualizador detecta o idioma do navegador e inclui um menu de idioma no cabeçalho. A UI suporta English, 日本語, Español, Français, Deutsch, Português, 한국어 e 中文. O HTML exportado herda o idioma selecionado.

Textos de logs, nomes de arquivos, comandos e textos escritos por agentes permanecem no idioma original para preservar a fidelidade da evidência.

## CLI

```bash
npx neurotrail review
npx neurotrail review --base main
npx neurotrail review --json
npx neurotrail review --comment 123
npx neurotrail report
npx neurotrail sessions
neurotrail watch
```

## Fontes suportadas

Codex, Claude Code, Gemini, Cursor, Cline, Roo Code e Generic JSONL local do workspace.

## Privacidade

NeuroTrail lê arquivos locais e grava saídas locais. `review` aplica redação básica por padrão. Revise o HTML e o Markdown antes de compartilhar um replay de um repositório privado.

## Licença

[MIT](LICENSE)
