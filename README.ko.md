<div align="center">

<img src="docs/neurotrail-logo.png" width="96" alt="NeuroTrail" />

# NeuroTrail

**AI 코딩 에이전트가 실제로 무엇을 했는지, 그 변경을 신뢰해도 되는지 확인하세요.**

로컬 우선. 여러 에이전트 지원. 별도 계측 불필요.

[![npm](https://img.shields.io/npm/v/neurotrail?color=cb3837&logo=npm)](https://www.npmjs.com/package/neurotrail)
&nbsp;[![CI](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml/badge.svg)](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml)
&nbsp;[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p>
  🇺🇸 <a href="README.md">English</a>
  · 🇯🇵 <a href="README.ja-JP.md">日本語</a>
  · 🇨🇳 <a href="README.zh-CN.md">简体中文</a>
  · 🇰🇷 한국어
  · 🇩🇪 <a href="README.de.md">Deutsch</a>
  · 🇪🇸 <a href="README.es.md">Español</a>
  · 🇫🇷 <a href="README.fr.md">Français</a>
  · 🇧🇷 <a href="README.pt-BR.md">Português</a>
</p>

<br/>

<img src="docs/hero.gif" alt="NeuroTrail이 여러 AI 에이전트의 PR 작업을 신경망 그래프로 재생하는 모습" width="820" />

<br/><br/>

<table>
  <tr>
    <td width="50%">
      <img src="docs/task-map.gif" alt="Claude, Codex, Gemini가 실제로 건드린 파일과 테스트 명령을 보여 주는 압축된 PR 증거 맵" width="400" />
    </td>
    <td width="50%">
      <img src="docs/review-path.gif" alt="Gemini의 리뷰 경로와 신뢰 요약이 정확한 파일 및 명령으로 연결되는 모습" width="400" />
    </td>
  </tr>
  <tr>
    <td><sub><strong>태스크 맵.</strong>3개 에이전트의 PR 이야기는 유지하고, 라이브 뷰어와 같은 저장소/파일 트리 구조로 표시합니다.</sub></td>
    <td><sub><strong>증거 트레일.</strong>주의 플래그가 원인이 된 파일, 명령, 산출물로 다시 연결됩니다.</sub></td>
  </tr>
</table>

</div>

---

AI 에이전트가 작성하는 Pull Request가 빠르게 늘고 있습니다. 리뷰어는 보통 **diff**만 받지만, diff만으로는 에이전트가 무엇을 조사했고, 무엇을 버렸고, 테스트를 실제로 실행했는지 알 수 없습니다.

NeuroTrail은 Codex, Claude Code, Gemini, Cursor, Cline, Roo 등이 로컬에 남기는 로그에서 작업 흐름을 재구성해 리뷰어와 다음 에이전트에게 전달할 수 있는 결과물을 만듭니다.

- **신뢰 요약**: 변경 파일, 실행 명령, 실제 테스트 결과, 비용, 사람이 확인해야 할 주의 플래그.
- **자체 포함 리플레이**: 서버 없이 열 수 있는 단일 HTML 파일. 작업 흐름을 신경망 그래프로 재생합니다.

NeuroTrail은 에이전트를 시작하거나 제어하지 않으며, 데이터를 클라우드로 보내지 않습니다.

## 빠른 시작

요구 사항: Node.js 20+ 및 현재 작업공간의 로컬 AI 코딩 세션.

```bash
npx neurotrail review

# 클론에서 실행하는 경우:
node bin/neurotrail.mjs review
```

출력:

- `.neurotrail/review/latest.md` - PR 댓글에 붙여 넣을 신뢰 요약
- `.neurotrail/reports/latest.html` - 공유 가능한 인터랙티브 리플레이

## 라이브 뷰어

```bash
git clone https://github.com/KF242131/neurotrail.git
cd neurotrail
npm install
npm run dev
```

`http://localhost:5173`을 여세요. 활성 세션이 없으면 샘플 리플레이가 재생되고, 같은 작업공간에서 지원되는 에이전트가 감지되면 라이브 실행으로 전환됩니다.

## 언어

라이브 뷰어는 브라우저 언어를 감지하며, 헤더의 언어 메뉴에서 바꿀 수 있습니다. UI는 English, 日本語, Español, Français, Deutsch, Português, 한국어, 中文을 지원합니다. 공유용 HTML 리플레이도 선택한 언어를 사용합니다.

로그 본문, 파일명, 명령어, 에이전트가 작성한 텍스트는 증거 정확성을 위해 원래 언어로 유지됩니다.

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

## 지원 소스

Codex, Claude Code, Gemini, Cursor, Cline, Roo Code, 작업공간 로컬 Generic JSONL.

## 개인정보

NeuroTrail은 로컬 파일을 읽고 로컬 출력만 씁니다. `review`는 기본적으로 기초적인 민감정보 가리기를 적용합니다. 비공개 저장소의 리플레이를 공유하기 전에 생성된 HTML과 Markdown을 확인하세요.

## 라이선스

[MIT](LICENSE)
