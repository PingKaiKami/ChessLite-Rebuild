# CLAUDE.md — ChessLite

> 給 AI 協作者的專案規則書。開始任何修改前先完整讀完本檔；本檔與程式碼衝突時，以本檔為準並回報差異。

## 0. 專案一句話

ChessLite 是一款**單一 HTML 檔、完全離線**的西洋棋網頁：玩家執白、內建 JavaScript AI 執黑，雙擊 `index.html`（`file://`）即可遊玩，同一份檔案也透過 GitHub Pages 公開。

## 1. 硬性限制（違反任一條都算錯）

1. **單一檔案**：遊戲的 HTML、CSS、JS、棋子 SVG、音效全部寫在 `index.html`。不得有 `<script src>`、`<link rel=stylesheet>`、`import`、`fetch`、CDN、網路字型、外部圖片或音訊檔。
2. **`file://` 可直接執行**：不使用 ES module、Web Worker 檔案、Service Worker、`localStorage` 以外的任何需伺服器的 API。
3. **不使用外部引擎**：不得使用 Stockfish、chess.js、任何套件或線上 API；規則引擎與 AI 自己寫。
4. **語言**：介面文字一律使用**繁體中文**；程式識別字用英文。
5. **規則一致**：UI 顯示的合法落點、玩家實際落子、AI 候選走法、終局判定，**全部呼叫同一套引擎函式**，不得在 UI 裡另寫規則判斷。
6. **引擎不碰 DOM**：引擎區段（見 §3.1）不得出現 `document`、`window`、`performance` 以外的瀏覽器 API，才能被 `node` 測試直接載入。

## 2. 檔案結構與命名

```text
ChessLite-Rebuild/
├── CLAUDE.md                     # 本檔：專案規則（最高優先）
├── README.md                     # 給人看的介紹與遊玩連結
├── index.html                    # 遊戲本體（唯一的執行檔）
└── tests/
    └── engine.test.mjs           # 引擎自動測試：node tests/engine.test.mjs
```

- 部署：GitHub Pages 設定為「Deploy from a branch：`main` / root」，推送到 `main` 約 1 分鐘後上線，網址 `https://pingkaikami.github.io/ChessLite-Rebuild/`。不要另加 Actions 部署 workflow。

- 新增「頁面」時（見 §10），檔名用小寫 kebab-case：`puzzles.html`、`rules-guide.html`，放在根目錄，同樣遵守 §1 的單檔離線限制。
- 不新增 `package.json`、建置工具或資料夾層級；測試只用 Node 內建模組（`fs`、`vm`、`assert`）。

## 3. 程式架構

### 3.1 `<script>` 內的區段順序（必須照此順序並保留標記註解）

```js
'use strict';
// === ENGINE START ===   ← 純邏輯，不碰 DOM；測試只載入這一段
//   常數 → 狀態建立/複製 → FEN → 攻擊判定 → 走法產生 → applyMove → 合法走法 → 終局判定 → 記譜
// === ENGINE END ===
// === AI START ===       ← 純邏輯，可被測試載入
//   PST 表 → evaluate → moveOrderScore → chooseAiMove
// === AI END ===
// === UI START ===       ← DOM 繪製、輸入、棋鐘、音效、控制器
// === UI END ===
```

`ENGINE` 與 `AI` 兩段最後必須把公開函式掛到 `globalThis.ChessLite = { ... }`（見 §3.3），測試透過它呼叫。

### 3.2 資料模型（名稱與形狀固定，新增欄位可以，改名不行）

```js
// 座標：r = 列 0..7（0 = 第 8 橫列，黑方底線），c = 欄 0..7（0 = a 欄）
// 棋子：{ color: 'w'|'b', type: 'p'|'n'|'b'|'r'|'q'|'k' }，空格為 null
state = {
  board,            // 8×8 二維陣列 board[r][c]
  turn,             // 'w' | 'b'
  castling,         // { K, Q, k, q }  布林
  enPassant,        // null | { r, c }  只在對方兵剛走兩格後存在（被越過的格子）
  halfmove,         // 50 回合規則計數（吃子或動兵歸零）
  fullmove,         // 黑方走完 +1
  lastMove,         // 最近一步 move（UI 高亮用）
  positionCounts    // Map<positionKey, 次數>（三次重複用）
}
move = { from:{r,c}, to:{r,c}, promotion?:'q'|'r'|'b'|'n', castle?:'K'|'Q', enPassant?:true, doublePawn?:true }
```

- `applyMove(state, move, trackPosition = true)` **回傳新 state，不修改原物件**（不可變更新）；悔棋靠保存 `before` 快照即可完整還原易位權、吃過路兵、計數器、重複表。
- `trackPosition = false` 用於「試走以檢查是否自將」，此時不更新 `positionCounts`。

### 3.3 必須提供的公開函式（`globalThis.ChessLite`）

| 函式 | 說明 |
| --- | --- |
| `initialState()` | 標準開局，`positionCounts` 已記入初始局面 1 次 |
| `fromFEN(fen)` | 由 FEN 建立 state（測試用；需支援易位權與吃過路兵欄位） |
| `cloneState(s)` | 深複製 |
| `positionKey(s)` | 重複局面鍵（見 §4.3） |
| `applyMove(s, m, track?)` | 執行走法，回傳新 state |
| `legalMovesForSquare(s, r, c)` | 該格棋子的合法走法（非輪到的一方回傳 `[]`） |
| `allLegalMoves(s)` | 行棋方全部合法走法 |
| `inCheck(s, color)` | 該色國王是否被攻擊 |
| `gameResult(s)` | `{over:true,type,winner}` 或 `{over:false,check,moves}` |
| `insufficientMaterial(s)` | 棋力不足 |
| `perft(s, depth)` | 走法計數（測試用） |
| `chooseAiMove(s, difficulty, limits?)` | 回傳一個合法 move；`limits` 可覆寫 `{maxDepth,time,nodes}` |

`gameResult` 的 `type`：`checkmate | stalemate | insufficient | fifty | repetition`；UI 另外產生 `timeout | resign`。

## 4. 規則引擎規格

### 4.1 走法
- 六種棋子正常移動、吃子與阻擋；**不產生吃國王的走法**（目標格是國王就略過）。
- 合法走法 = 偽合法走法中，執行後己方國王不被攻擊者。
- **兵**：前進一格；起始列且兩格皆空可走兩格（標 `doublePawn`）；斜吃；到底線時**同一目的地產生 4 個走法**（q/r/b/n 各一）。
- **吃過路兵**：只有 `state.enPassant` 存在、且己兵在相鄰欄的正確橫列時才能走；被吃的兵在 `board[from.r][to.c]`。
- **王車易位**：國王與該側城堡未移動過（看 `castling` 旗標）、城堡確實在角落、中間格全空、國王**目前、經過、到達**的格子都不被攻擊。短易位：王 e→g、車 h→f；長易位：王 e→c、車 a→d（b 格只需為空，不需檢查攻擊）。
- 易位權失效：國王移動 → 雙側失效；城堡從角落移動 → 該側失效；**角落城堡被吃** → 該側失效。

### 4.2 終局判定（`gameResult` 依此順序）
1. 無合法走法：被將軍 → `checkmate`（勝方 = 對手）；否則 `stalemate`。
2. `insufficientMaterial`：雙方只剩王；或只多一個輕子（馬或象）；或全部剩下的象都在同色格；或同一方只剩兩匹馬。
3. `halfmove >= 100` → `fifty`。
4. `positionCounts.get(positionKey(state)) >= 3` → `repetition`。

（三次重複與 50 回合直接判和，這是遊戲上的簡化，不做聲明和棋流程。）

### 4.3 `positionKey`
格式：`<8 列棋盤字串用 / 連接> <turn> <易位權或 -> <吃過路兵格或 ->`，白子大寫、黑子小寫、空格 `.`。
**吃過路兵格只在「行棋方確實有一步合法的吃過路兵」時才寫入**，否則寫 `-`；不然三次重複會漏判（V1.2 修過的 bug）。

### 4.4 記譜
起訖座標格式：`e2-e4`、吃子 `e4×d5`、升變 `e7-e8=Q`、易位 `O-O` / `O-O-O`。不需要 SAN。

## 5. AI 規格

- 演算法：**Minimax + Alpha-Beta**，加上迭代加深、置換表（`Map`，key = positionKey + halfmove + 重複次數）、走法排序（上一層最佳步 → MVV-LVA 吃子 → 升變 → 易位）、將軍延伸（剩餘深度 ≤2 時，最多延伸 2 次）、靜態延伸搜尋（只搜吃子/升變/吃過路兵，被將軍時搜全部，最多 3 層）。
- 分數以**黑方（AI）為正**。將死分數 `±(1,000,000 − ply)`，越快將死越好。
- 評估函數至少包含：子力（兵 100、馬 320、象 330、車 500、后 900、王 0）、位置分數表 PST（**6 張表都以白方視角、索引 `r*8+c`、第 0 列＝第 8 橫列**書寫；白子用 `r*8+c`、黑子用 `(7-r)*8+c` 查表）、雙象 +28、疊兵與孤兵扣分、王已易位加分、殘局（非兵子力 < 2200）王靠中央加分、機動性（合法步數 × 1.5，行棋方視角）。
- 搜尋上限（超過時間或節點即中止，使用**最後一個完整層**的結果）：

| 難度 | 值 | maxDepth | time (ms) | nodes | 最短可見思考 (ms) | 行為 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 簡單 | `easy` | 2 | 450 | 45,000 | 1400 | 從最佳分數 100 分內的前 4 步隨機選一 |
| 中等 | `medium` | 4 | 1800 | 240,000 | 2500 | 選最佳 |
| 困難 | `hard` | 6 | 5000 | 900,000 | 4500 | 選最佳 |

- 中止用 `throw` 一個哨兵物件，在根節點 `catch` 後只吞掉這個哨兵，其他錯誤要重新拋出。
- AI 只能從 `allLegalMoves` 中選；無合法走法回傳 `null`。
- 「最短可見思考」：搜尋結束時若未滿此時間，用 `setTimeout` 補足再落子；這段時間**計入黑方棋鐘**。

## 6. 介面規格（UI／UX）

### 6.1 版面
- **桌面（> 760px）**：左棋盤（最大 720px）、右側控制面板（250–320px）。
- **手機（≤ 760px）**：單欄，棋盤在上、面板在下；不得產生水平捲動；按鈕高度 ≥ 44px。
- 面板內容順序：狀態卡 → 雙方棋鐘 → 難度選單與說明 → 三顆按鈕（重新開始／悔棋／投降）→ 走棋紀錄。

### 6.2 棋盤（最常出錯，照抄這段 CSS 的精神）
```css
.board { aspect-ratio: 1; display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-template-rows:    repeat(8, minmax(0, 1fr)); }
.square { min-width: 0; min-height: 0; }
```
**欄與列都必須定義**，否則 64 格會因 SVG 高度變形（V1.1 修過的 bug）。每格是 `<button>`，帶 `data-r`、`data-c` 與中文 `aria-label`（例：`e2，白兵`、`e4，空格，合法落點`）。
- 白方視角：第 8 橫列在上；最下列顯示 a–h、最左欄顯示 1–8 座標。
- 視覺回饋：選取格高亮、合法空格顯示**圓點**、可吃子格顯示**外框圓環**、最近一步起訖淡色高亮、被將軍國王格紅色。
- 棋子：內嵌 SVG（`viewBox="0 0 64 64"`，用 `currentColor` 上色），黑白對比清楚；**城堡要左右對稱**。

### 6.3 操作
- **點擊**：點己方棋子 → 顯示合法落點；點合法格 → 走；點另一顆己方棋子 → 改選；點非法格 → 不動。
- **拖曳**：使用 Pointer Events（滑鼠與觸控共用）。`pointerdown` 時直接設定選取並 `setPointerCapture`，**不要在 pointerdown 時重繪棋盤**（會換掉被 capture 的節點）；移動超過 7px 才算拖曳，顯示跟隨指標的棋子；放開在合法格就走，否則還原。拖曳完成後要吞掉隨後的 `click`。棋盤容器 `touch-action: none`。
- 點擊與拖曳都呼叫同一個 `playerMove(candidates)`。
- **升變**：候選走法有多個 promotion 時，用 `<dialog>` 顯示 4 顆棋子按鈕讓玩家選。
- AI 思考中或終局時，所有棋盤操作無效。

### 6.4 狀態文字（固定字串）
`玩家回合`、`將軍｜玩家回合`、`AI 思考中`（後方動態 `...`）、`將死｜玩家勝利`、`將死｜AI 勝利`、`逼和｜和棋`、`棋力不足｜和棋`、`50 回合規則｜和棋`、`三次重複局面｜和棋`、`AI 超時｜玩家勝利`、`玩家超時｜AI 勝利`、`玩家投降｜AI 勝利`。

## 7. 控制器與狀態機

| 功能 | 規則 |
| --- | --- |
| 難度 | 預設 `中等`。改選單**不影響當局**，下方說明顯示「已選擇X；重新開始後套用（目前：Y）」；重新開始時才套用 |
| 重新開始 | 重設棋局、紀錄、選取、終局旗標、棋鐘（停止並回到 10:00）；`gameToken++` |
| 悔棋 | 輪到玩家且紀錄 ≥ 2 → 撤回 AI 與玩家各一步；否則撤回一步。AI 思考中也可悔棋（`gameToken++` 讓舊計算作廢）。悔棋後可解除終局 |
| 棋鐘 | 雙方 10:00。**玩家第一步完成才開始計時**；之後只扣行棋方；每 250ms `tick`，且每次落子前也先 `tick` 結算；歸零 → 對方勝 |
| 投降 | 開局與重新開始後**停用**，棋鐘啟動後才可按；`confirm()` 確認後判 AI 勝；取消時不扣等待確認的時間 |
| 音效 | Web Audio 即時合成，不用音檔：一般、吃子、易位、將軍、終局五種不同節奏／音高；低頻衝擊 + 帶通噪音木質瞬態 + `DynamicsCompressor` 防破音；`try/catch` 包住，失敗不影響遊戲 |
| 走棋紀錄 | 每列：`回合號. 白步 黑步`，新步自動捲到底；無步時顯示「尚未走棋」 |

**`gameToken` 規則**：每次 `startAiTurn` 記下 token；在 `setTimeout` 等待後與搜尋完成後都要比對，token 改變（重開、悔棋、終局）就丟棄結果。這是防止「舊局 AI 落子出現在新局」的唯一機制，不可省略。

AI 回合流程：`aiThinking = true; render()` → `setTimeout(40)` 讓畫面先更新 → `chooseAiMove` → 補足最短思考時間 → 比對 token → `commitMove` → `aiThinking = false; render()` → `gameResult`。

## 8. 美術風格

- 風格可以換，但**一律用 `:root` CSS 變數**定義色彩（至少：`--ink`、`--muted`、`--bg`、`--panel`、`--light-sq`、`--dark-sq`、`--accent`、`--danger`、`--shadow`），改風格只改變數與少量裝飾。
- 原則：扁平、乾淨、對比清楚；棋盤是視覺焦點；不加花俏動畫；尊重 `prefers-reduced-motion`。
- 字型只用系統字型堆疊（`system-ui, "Segoe UI", "Microsoft JhengHei", sans-serif`），等寬用 `ui-monospace, Consolas, monospace`。
- 鍵盤可用：按鈕與格子有明顯的 `:focus-visible` 外框。

## 9. 測試與驗收

### 9.1 自動測試（每次修改引擎或 AI 後必跑，必須全部通過）
```bash
node tests/engine.test.mjs
```
測試檔讀入 `index.html`，擷取 `ENGINE` 與 `AI` 區段，用 `vm` 執行後檢查：

| 局面 | FEN | 深度 → 期望節點數 |
| --- | --- | --- |
| 開局 | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` | 1→20、2→400、3→8902 |
| Kiwipete（易位、吃過路兵、升變） | `r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1` | 1→48、2→2039 |
| Position 3（吃過路兵釘住） | `8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1` | 1→14、2→191、3→2812 |
| Position 4（升變、易位權） | `r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1` | 1→6、2→264、3→9467 |

另外檢查：將死、逼和、棋力不足、三次重複、50 回合、positionKey 的吃過路兵規則、AI 三種難度皆回傳合法步且能一步殺。

### 9.2 手動驗收清單
- [ ] 斷網、`file://` 開啟可玩；DevTools Console 無錯誤。
- [ ] 64 格在桌面與手機寬度皆為等大正方形。
- [ ] 點擊、滑鼠拖曳、觸控拖曳皆可走；非法目標會還原。
- [ ] 棋鐘在玩家第一步後才倒數；投降在第一步前是停用的。
- [ ] AI 思考時顯示提示且無法操作；重新開始後舊的 AI 步不會出現。
- [ ] 升變對話框可選 4 種棋子。
- [ ] 悔棋能恢復易位權與吃過路兵。

## 10. 如何延伸（新增功能或頁面時的 SOP）

1. **先寫規格**：在本檔對應章節加上規則（例如新功能放 §7 表格、新狀態文字放 §6.4），寫成可驗證的句子。
2. **放對區段**：純規則 → `ENGINE`；評估或搜尋 → `AI`；畫面與互動 → `UI`。引擎與 AI 不得依賴 UI 變數。
3. **先測後改**：引擎相關先在 `tests/engine.test.mjs` 加失敗測試，再實作到通過。
4. **新頁面**（例如殘局練習 `puzzles.html`、規則教學 `rules-guide.html`）：複製 `index.html` 的 `ENGINE`/`AI` 區段原樣使用（不改寫），沿用 §8 的 CSS 變數，並在 `index.html` 標題下方加一個連回／連往新頁的文字連結。若之後頁面 ≥ 3 個，再提議把引擎抽成共用檔（需先問使用者，因為會違反 §1.1）。
5. **更新文件**：README 的功能列表、本檔 §11 版本紀錄各加一行。
6. **完成定義**：`node tests/engine.test.mjs` 全過 + §9.2 相關項目手動確認 + Console 無錯誤。

## 11. 已知陷阱（過去真的發生過，修改時特別注意）

| 版本 | 問題 | 規則 |
| --- | --- | --- |
| V1.1 | 棋盤只定義欄沒定義列，格子變形 | §6.2 兩者都要定義 |
| V1.2 | 開局選第一步時就開始扣玩家時間 | 第一步完成才 `clockStarted = true` |
| V1.2 | 吃過路兵權誤算進重複局面鍵 | §4.3 只在合法時寫入 |
| V1.2 | 城堡 SVG 左右不對稱 | 沿中心線 x=32 對稱 |
| V1.2 | 音效太小聲或破音 | master 增益 + compressor，限制峰值 |
| V1.2 | 開局就能按投降 | 棋鐘啟動前停用 |
| V1.2 | PST 表方向不一致（兵/象/車/后表上下顛倒、王表正確），AI 反而獎勵兵不前進 | §5 統一方向；改 PST 後確認「兵在第 7 橫列分數最高」 |
| — | pointerdown 時重繪導致拖曳失效 | §6.3 不在 pointerdown 重繪 |
| — | 重開後舊 AI 結果落在新局 | §7 `gameToken` |

## 12. 不做的事（除非使用者明確要求）

雙人對戰、線上對戰、帳號／排行／雲端存檔、ELO、棋譜匯入匯出、Stockfish 或任何外部引擎、LLM 對話、提示最佳步、開局教學。

## 13. AI 協作守則

- 修改前先說明要改哪個區段；只改任務需要的部分，不順手重構正常運作的程式。
- 不確定的需求（會影響規則或架構）先問；低風險的視覺細節自行決定並在回報中列出。
- 回報時附上 `node tests/engine.test.mjs` 的輸出摘要。
- 不要把 `globalThis.ChessLite`、區段標記註解刪掉，測試依賴它們。
