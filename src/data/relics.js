// src/data/relics.js
// 遺物（部位・メインステ・サブステ・レア度）定義と生成ロジック

// ---- ステータスキー ----
export const STAT_LABEL = {
  hp: "HP", hpPct: "HP%",
  atk: "攻撃力", atkPct: "攻撃力%",
  def: "防御力", defPct: "防御力%",
  spd: "速度",
  critRate: "会心率", critDmg: "会心ダメージ",
  effHit: "効果命中", effRes: "効果抵抗",
  breakEff: "撃破特効",
  heal: "治癒量%",
  epRate: "EP回復効率",
  dmgPhysical: "物理属性ダメージ%",
  dmgFire: "炎属性ダメージ%",
  dmgIce: "氷属性ダメージ%",
  dmgLightning: "雷属性ダメージ%",
  dmgWind: "風属性ダメージ%",
  dmgQuantum: "量子属性ダメージ%",
  dmgImaginary: "虚数属性ダメージ%",
};

// ---- 部位 ----
export const SLOTS = ["head", "hands", "body", "feet", "sphere", "rope"];

export const SLOT_LABEL = {
  head: "頭部", hands: "手部", body: "胴体",
  feet: "脚部", sphere: "次元界球", rope: "連結縄",
};

const COMMON = ["hp", "hpPct", "atk", "atkPct", "def", "defPct"];

// メインステ候補（固定部位は1種のみ）
export const MAIN_STAT_POOL = {
  head: ["hp"],
  hands: ["atk"],
  body: [...COMMON, "critRate", "critDmg", "heal", "effHit"],
  feet: [...COMMON, "spd"],
  sphere: [...COMMON,
    "dmgPhysical", "dmgFire", "dmgIce", "dmgLightning",
    "dmgWind", "dmgQuantum", "dmgImaginary"],
  rope: [...COMMON, "breakEff", "epRate"],
};

// 部位限定メインステ（※）
export const SLOT_EXCLUSIVE = {
  body: ["critRate", "critDmg", "heal", "effHit"],
  feet: ["spd"],
  sphere: ["dmgPhysical", "dmgFire", "dmgIce", "dmgLightning", "dmgWind", "dmgQuantum", "dmgImaginary"],
  rope: ["breakEff", "epRate"],
};

// ---- サブステ ----
export const SUB_STAT_POOL = [
  "hp", "atk", "def", "spd",
  "hpPct", "atkPct", "defPct",
  "critRate", "critDmg", "effHit", "breakEff", "effRes",
];

// ---- レア度 ----
export const RARITY = {
  2: { maxLv: 6, initSub: [0, 0] },
  3: { maxLv: 9, initSub: [1, 2] },
  4: { maxLv: 12, initSub: [2, 3] },
  5: { maxLv: 15, initSub: [3, 4] },
};
export const MAX_SUBS = 4;
export const SUB_STEP = 3; // Lv3ごとにサブ追加/強化

// ---- 数値テーブル（要入力）----
// 例: MAIN_VALUE.hp = { 5: { base: 705.6, perLv: 39.5 } } のように後で埋める（数値は仮）
// 未設定の場合は 0 として扱う
export const MAIN_VALUE = {};  // { [stat]: { [rarity]: { base, perLv } } }
export const SUB_VALUE = {};   // { [stat]: { [rarity]: { base, step } } }

// ---- ユーティリティ ----
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const randInt = (a, b) => a + rand(b - a + 1);

// ---- 生成 ----
export function createRelic({ slot, rarity = 5, mainStat, setId = null } = {}) {
  slot = slot ?? pick(SLOTS);
  const cfg = RARITY[rarity];
  const main = mainStat ?? pick(MAIN_STAT_POOL[slot]);
  if (!MAIN_STAT_POOL[slot].includes(main)) {
    throw new Error(`${SLOT_LABEL[slot]}に ${main} は付けられません`);
  }

  const relic = {
    id: `${Date.now()}-${rand(1e6)}`,
    slot, rarity, setId,
    level: 0,
    mainStat: main,
    subs: [], // { stat, upgrades }
  };

  const count = randInt(cfg.initSub[0], cfg.initSub[1]);
  for (let i = 0; i < count; i++) addSub(relic);
  return relic;
}

// メインと被らないサブをランダム追加
function addSub(relic) {
  const used = new Set([relic.mainStat, ...relic.subs.map(s => s.stat)]);
  const cand = SUB_STAT_POOL.filter(s => !used.has(s));
  if (!cand.length || relic.subs.length >= MAX_SUBS) return false;
  relic.subs.push({ stat: pick(cand), upgrades: 0 });
  return true;
}

// ---- レベルアップ ----
export function levelUp(relic, to = relic.level + 1) {
  const max = RARITY[relic.rarity].maxLv;
  const target = Math.min(to, max);
  const log = [];
  while (relic.level < target) {
    relic.level++;
    if (relic.level % SUB_STEP === 0) {
      if (relic.subs.length < MAX_SUBS) {
        addSub(relic);
        log.push({ lv: relic.level, type: "add", stat: relic.subs.at(-1).stat });
      } else {
        const s = pick(relic.subs);
        s.upgrades++;
        log.push({ lv: relic.level, type: "upgrade", stat: s.stat });
      }
    }
  }
  return log;
}

// ---- ステータス算出 ----
export function mainValue(relic) {
  const v = MAIN_VALUE[relic.mainStat]?.[relic.rarity];
  return v ? v.base + v.perLv * relic.level : 0;
}

export function subValue(relic, sub) {
  const v = SUB_VALUE[sub.stat]?.[relic.rarity];
  // 初期1回 + 強化回数
  return v ? v.base + v.step * sub.upgrades : 0;
}

// 装備中の遺物リスト → 合算ステータス
export function sumRelicStats(relics) {
  const total = {};
  const add = (k, v) => { total[k] = (total[k] ?? 0) + v; };
  for (const r of relics) {
    add(r.mainStat, mainValue(r));
    for (const s of r.subs) add(s.stat, subValue(r, s));
  }
  return total;
}
