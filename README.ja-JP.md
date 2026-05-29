<div align="center">

<img src="docs/neurotrail-logo.png" width="96" alt="NeuroTrail" />

# NeuroTrail

**AIエージェントが実際に何をしたのか、信頼してよいのかを確認するためのレビュー層。**

ローカルファースト。複数エージェント対応。計測コードの埋め込み不要。

[![npm](https://img.shields.io/npm/v/neurotrail?color=cb3837&logo=npm)](https://www.npmjs.com/package/neurotrail)
&nbsp;[![CI](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml/badge.svg)](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml)
&nbsp;[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p>
  🇺🇸 <a href="README.md">English</a>
  · 🇯🇵 日本語
  · 🇨🇳 <a href="README.zh-CN.md">简体中文</a>
  · 🇰🇷 <a href="README.ko.md">한국어</a>
  · 🇩🇪 <a href="README.de.md">Deutsch</a>
  · 🇪🇸 <a href="README.es.md">Español</a>
  · 🇫🇷 <a href="README.fr.md">Français</a>
  · 🇧🇷 <a href="README.pt-BR.md">Português</a>
</p>

<br/>

<img src="docs/hero.gif" alt="複数のAIエージェントの作業をNeuroTrailがニューラルグラフとして再生している様子" width="820" />

<sub>Claude、Codex、Gemini の3エージェントが1つのPRを進める様子を、マップだけでなく左の現在ステップ、右の証拠トレイル、下部のコスト・トークン・エージェント状態まで含めて再生します。</sub>

<br/><br/>

<table>
  <tr>
    <td width="50%">
      <img src="docs/task-map.gif" alt="Claude、Codex、Geminiが触れたファイルとテストコマンドを示すコンパクトなPR証拠マップ" width="400" />
    </td>
    <td width="50%">
      <img src="docs/review-path.gif" alt="Geminiのレビュー経路と、信頼サマリーが正確なファイルやコマンドへリンクする様子" width="400" />
    </td>
  </tr>
  <tr>
    <td><sub><strong>タスクマップ。</strong>左右の情報パネルと下部メトリクスを残したまま、ライブビューアと同じリポジトリ/ファイルツリー構造を表示します。</sub></td>
    <td><sub><strong>証拠トレイル。</strong>注意フラグから原因になったファイル・コマンド・成果物へ戻れ、コストやエージェント状態も同じ画面で追えます。</sub></td>
  </tr>
</table>

</div>

---

2026年には、AIエージェントが書くプルリクエストがますます増えています。レビュアーが受け取るのは通常 **diff** だけです。しかし diff だけでは、エージェントが何を調べ、何を捨て、テストを本当に実行したのか、どこで迷ったのかは分かりません。

NeuroTrail は、Claude Code、Codex、Gemini、Cursor、Cline、Roo などがローカルに残すログから作業の軌跡を再構築し、レビュアーや次のエージェントに渡せる2つの成果物に変換します。

- **信頼サマリー**: 変更ファイル、実行コマンド、実際のテスト結果、コストなどの事実と、人間が確認すべき注意フラグ。
- **自己完結型リプレイ**: 1つのHTMLファイルで、作業の流れをニューラルグラフとして再生。サーバー不要でPRに添付できます。

NeuroTrail はエージェントを起動・操作しません。クラウドにも何も送信しません。

## クイックスタート

必要なもの: Node.js 20+ と、このワークスペースのローカルAIコーディングセッション。

```bash
npx neurotrail review

# まだnpm公開前にクローンから実行する場合:
node bin/neurotrail.mjs review
```

生成されるファイル:

- `.neurotrail/review/latest.md` - PRコメントに貼れる信頼サマリー
- `.neurotrail/reports/latest.html` - 共有可能なインタラクティブリプレイ

## ライブビューア

```bash
git clone https://github.com/KF242131/neurotrail.git
cd neurotrail
npm install
npm run dev
```

`http://localhost:5173` を開いてください。アクティブなセッションがない場合はサンプルリプレイを再生し、同じワークスペースで対応エージェントが動き始めるとライブ表示に切り替わります。

## 対応言語

ライブビューアはブラウザ言語を検出し、ヘッダーの言語メニューから切り替えできます。UIは English、日本語、Español、Français、Deutsch、Português、한국어、中文 に対応しています。共有用HTMLリプレイにも選択言語が引き継がれます。

ログ本文、ファイル名、コマンド、エージェントが書いた文章は、証拠としての正確性を保つため元の言語のまま表示されます。

## CLI

```bash
npx neurotrail review                 # 最新セッションの信頼レポート
npx neurotrail review --base main     # mainとの差分ファイルにスコープ
npx neurotrail review --json          # CIやスクリプト向けJSON出力
npx neurotrail review --comment 123   # gh CLIでPR #123に投稿
npx neurotrail report                 # 次のエージェント向けhandoff + リプレイ
npx neurotrail sessions               # このワークスペースのローカルセッション一覧
neurotrail watch                      # ライブビューア
```

## 対応ソース

- Codex (`~/.codex/sessions`)
- Claude Code (`~/.claude/projects`)
- Gemini
- Cursor
- Cline
- Roo Code
- ワークスペースローカルの Generic JSONL

## プライバシー

NeuroTrail はローカルファイルを読み取り、ローカル出力を書き込むだけです。`review` はデフォルトで基本的な秘匿化を行います。プライベートリポジトリのリプレイを共有する前に、生成されたHTMLとMarkdownを確認してください。

## ライセンス

[MIT](LICENSE)
