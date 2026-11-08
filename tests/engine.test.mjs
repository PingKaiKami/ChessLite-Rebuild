// ChessLite 引擎與 AI 自動測試（只用 Node 內建模組）
// 執行：node tests/engine.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
function section(name) {
  const m = html.match(new RegExp(`// === ${name} START ===([\\s\\S]*?)// === ${name} END ===`));
  if (!m) throw new Error(`index.html 缺少 ${name} 區段標記`);
  return m[1];
}
const context = { performance, console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(`'use strict';\n${section('ENGINE')}\n${section('AI')}`, context);
const C = context.ChessLite;

let passed = 0, failed = 0;
function test(name, fn) {
  const t = Date.now();
  try { fn(); passed++; console.log(`  ✓ ${name} (${Date.now() - t}ms)`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}
const sq = s => ({ r: 8 - +s[1], c: s.charCodeAt(0) - 97 });
function play(state, ...moves) {
  for (const m of moves) {
    const from = sq(m.slice(0, 2)), to = sq(m.slice(2, 4));
    const legal = C.legalMovesForSquare(state, from.r, from.c).find(x => x.to.r === to.r && x.to.c === to.c && (x.promotion || '') === (m[4] || ''));
    assert.ok(legal, `非法走法 ${m}`);
    state = C.applyMove(state, legal);
  }
  return state;
}

console.log('Perft');
const PERFT = [
  ['開局', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902]],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
  ['Position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
  ['Position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
];
for (const [name, fen, counts] of PERFT) {
  test(`${name} 深度 1–${counts.length}`, () => {
    counts.forEach((n, i) => assert.equal(C.perft(C.fromFEN(fen), i + 1), n, `深度 ${i + 1}`));
  });
}
test('initialState 與開局 FEN 一致', () => {
  assert.equal(C.positionKey(C.initialState()), C.positionKey(C.fromFEN(PERFT[0][1])));
});

console.log('終局判定');
test('將死（愚者殺）', () => {
  const r = C.gameResult(play(C.initialState(), 'f2f3', 'e7e5', 'g2g4', 'd8h4'));
  assert.equal(r.type, 'checkmate'); assert.equal(r.winner, 'b');
});
test('逼和', () => {
  assert.equal(C.gameResult(C.fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).type, 'stalemate');
});
test('棋力不足', () => {
  for (const fen of ['8/8/4k3/8/8/4K3/8/8 w - - 0 1', '8/8/4k3/8/8/4KN2/8/8 w - - 0 1', '8/8/4k3/8/8/2B1K3/3B4/8 w - - 0 1' /* c3、d2 同為深色格 */, '8/8/4k3/8/8/3NKN2/8/8 w - - 0 1'])
    assert.equal(C.gameResult(C.fromFEN(fen)).type, 'insufficient', fen);
  for (const fen of ['8/8/4k3/8/8/3BK3/3B4/8 w - - 0 1' /* d3 淺、d2 深 */, '8/8/4k3/8/8/4KP2/8/8 w - - 0 1', '8/8/4kn2/8/8/4KN2/8/8 w - - 0 1'])
    assert.notEqual(C.gameResult(C.fromFEN(fen)).type, 'insufficient', fen);
});
test('50 回合規則', () => {
  assert.equal(C.gameResult(C.fromFEN('8/8/4k3/8/8/4K3/4R3/8 w - - 100 80')).type, 'fifty');
  assert.equal(C.gameResult(C.fromFEN('8/8/4k3/8/8/4K3/4R3/8 w - - 99 80')).over, false);
});
test('三次重複局面', () => {
  const s = play(C.initialState(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
  assert.equal(C.gameResult(s).type, 'repetition');
});

console.log('特殊規則');
test('positionKey 只在吃過路兵合法時記錄', () => {
  const capturable = play(C.initialState(), 'e2e4', 'a7a6', 'e4e5', 'd7d5');
  assert.match(C.positionKey(capturable), / d6$/);
  const notCapturable = play(C.initialState(), 'e2e4');
  assert.match(C.positionKey(notCapturable), / -$/);
});
test('易位不可穿越受攻擊格', () => {
  const s = C.fromFEN('4k3/8/8/8/8/5r2/8/4K2R w K - 0 1'); // 黑車控制 f1
  const castles = C.legalMovesForSquare(s, 7, 4).filter(m => m.castle);
  assert.equal(castles.length, 0);
});
test('角落城堡被吃後喪失易位權', () => {
  const s = C.applyMove(C.fromFEN('r3k3/8/8/8/8/8/8/R3K2R w KQq - 0 1'), { from: sq('a1'), to: sq('a8') });
  assert.equal(s.castling.q, false); assert.equal(s.castling.Q, false); assert.equal(s.castling.K, true);
});
test('升變產生 4 種走法', () => {
  const s = C.fromFEN('8/4P3/8/8/8/k7/8/K7 w - - 0 1');
  assert.equal(C.legalMovesForSquare(s, 1, 4).map(m => m.promotion).sort().join(','), 'b,n,q,r');
});
test('applyMove 不修改原局面', () => {
  const s = C.initialState(), before = C.positionKey(s);
  C.applyMove(s, C.allLegalMoves(s)[0]);
  assert.equal(C.positionKey(s), before);
});

console.log('AI');
test('PST 方向正確：白兵推進比留在原位好', () => {
  const home = C.fromFEN('4k3/8/8/8/8/8/4P3/4K3 b - - 0 1');
  const advanced = C.fromFEN('4k3/8/4P3/8/8/8/8/4K3 b - - 0 1');
  assert.ok(C.evaluate(advanced) < C.evaluate(home)); // 分數以黑方為正，白方越好越低
});
test('三種難度都回傳合法走法', () => {
  const s = play(C.initialState(), 'e2e4');
  for (const d of ['easy', 'medium', 'hard']) {
    const m = C.chooseAiMove(s, d, { time: 300 });
    assert.ok(C.allLegalMoves(s).some(x => JSON.stringify(x) === JSON.stringify(m)), d);
  }
});
test('中等與困難會一步殺', () => {
  const s = C.fromFEN('r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1'); // Ra1# 底線殺
  for (const d of ['medium', 'hard']) {
    const m = C.chooseAiMove(s, d, { time: 1500 });
    assert.equal(C.gameResult(C.applyMove(s, m)).type, 'checkmate', d);
  }
});
test('無合法走法時回傳 null', () => {
  assert.equal(C.chooseAiMove(C.fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), 'easy'), null);
});

console.log(`\n${passed} 通過，${failed} 失敗`);
process.exit(failed ? 1 : 0);
