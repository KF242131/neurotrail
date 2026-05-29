<div align="center">

<img src="docs/neurotrail-logo.png" width="96" alt="NeuroTrail" />

# NeuroTrail

**查看你的 AI 编码智能体实际做了什么，以及这次改动是否值得信任。**

本地优先。跨智能体。无需埋点。

[![npm](https://img.shields.io/npm/v/neurotrail?color=cb3837&logo=npm)](https://www.npmjs.com/package/neurotrail)
&nbsp;[![CI](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml/badge.svg)](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml)
&nbsp;[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p>
  🇺🇸 <a href="README.md">English</a>
  · 🇯🇵 <a href="README.ja-JP.md">日本語</a>
  · 🇨🇳 简体中文
  · 🇰🇷 <a href="README.ko.md">한국어</a>
  · 🇩🇪 <a href="README.de.md">Deutsch</a>
  · 🇪🇸 <a href="README.es.md">Español</a>
  · 🇫🇷 <a href="README.fr.md">Français</a>
  · 🇧🇷 <a href="README.pt-BR.md">Português</a>
</p>

<br/>

<img src="docs/hero.gif" alt="NeuroTrail 将多个 AI 智能体的一次 PR 工作回放为神经图" width="820" />

</div>

---

越来越多的 Pull Request 由 AI 智能体编写。审查者通常只能看到 **diff**，但 diff 无法说明智能体如何到达结果：它查阅了什么，放弃了什么，是否真的运行了测试，在哪里反复尝试。

NeuroTrail 从本地已有的智能体日志中重建工作轨迹，并生成两类可以交给审查者或下一个智能体的产物：

- **信任摘要**: 变更文件、运行命令、真实测试结果、成本，以及需要人工检查的注意标记。
- **自包含回放**: 一个 HTML 文件，把运行过程动画化为神经图，带时间轴，可直接附加到 PR。

NeuroTrail 不会启动或控制任何智能体，也不会把数据发送到云端。

## 快速开始

要求: Node.js 20+，以及当前工作区中的本地 AI 编码会话。

```bash
npx neurotrail review

# 如果从当前克隆运行:
node bin/neurotrail.mjs review
```

输出:

- `.neurotrail/review/latest.md` - 可粘贴到 PR 评论的信任摘要
- `.neurotrail/reports/latest.html` - 可分享的交互式回放

## 实时查看器

```bash
git clone https://github.com/KF242131/neurotrail.git
cd neurotrail
npm install
npm run dev
```

打开 `http://localhost:5173`。没有活动会话时会播放示例回放；当同一工作区中出现受支持的智能体会话时，会自动切换到实时运行。

## 语言

实时查看器会检测浏览器语言，也可以从顶部语言菜单手动切换。UI 支持 English、日本語、Español、Français、Deutsch、Português、한국어、中文。导出的回放 HTML 会继承当前选择的语言。

日志正文、文件名、命令和智能体生成的文本会保持原始语言，以保证证据准确。

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

## 支持的来源

Codex、Claude Code、Gemini、Cursor、Cline、Roo Code，以及工作区本地的 Generic JSONL。

## 隐私

NeuroTrail 只读取本地文件并写入本地输出。`review` 默认启用基础脱敏。分享私有仓库的回放之前，请检查生成的 HTML 和 Markdown。

## 许可证

[MIT](LICENSE)
