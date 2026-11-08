# ChessLite（CLAUDE.md 重建版）

ChessLite 是一款單一 HTML 檔、完全離線的西洋棋網頁：玩家執白，與瀏覽器內建的 JavaScript AI 對戰。

這個 repo 的重點是 [`CLAUDE.md`](CLAUDE.md)：把原本 ChessLite 的規格、架構、測試方式與踩過的坑整理成一份給 AI 讀的規則書，然後**只依照這份文件**重新產生整個遊戲（美術風格刻意換成深色夜間主題），用來驗證規則書是否足以讓 AI 做出功能相同、可以繼續延伸的專案。

線上遊玩：<https://pingkaikami.github.io/ChessLite-Rebuild/>

## 功能

- 完整西洋棋規則：將軍、將死、逼和、王車易位、吃過路兵、四種兵升變
- 和棋：棋力不足、三次重複局面、50 回合規則
- 簡單／中等／困難三種 AI（Minimax + Alpha-Beta、迭代加深、置換表、靜態延伸搜尋）
- 雙方 10 分鐘棋鐘（玩家第一步後才開始）、悔棋、重新開始、投降
- 點擊、滑鼠拖曳、觸控拖曳；Web Audio 合成落子音效；桌面與手機版面

## 檔案

```text
├── CLAUDE.md                     # AI 專案規則書
├── index.html                    # 遊戲本體（可直接離線開啟）
├── tests/engine.test.mjs         # 引擎 + AI 自動測試
└── .github/workflows/pages.yml   # GitHub Pages 自動部署
```

## 測試

```bash
node tests/engine.test.mjs
```

用 perft（標準走法計數）在 4 個經典局面上驗證走法產生器，並測試終局判定、特殊規則與 AI。
