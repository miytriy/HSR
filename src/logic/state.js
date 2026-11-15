import { ENEMY_LV_BY_DIFF } from "../data/roster.js";
import { addLog, fmt, roll } from "./calc.js";

export const SARAN_SPD = 85;
export const VALID_CHAR_IDS = ["ziran","saki","ouma","miroku"];
export const CHAR_SPD = {ziran:110, saki:102, ouma:105, miroku:115};
export const ENEMY_SPD = 90;
export const ENEMY_IDS = ["e0","e1","e2","e3","e4"];

// パーティ編成順(party)から戦闘に使う有効キャラID配列を決定する。
// ziran/saki/ouma 以外は現状フル実装されていないため除外し、
// 有効なキャラが1人もいなければデフォルト編成にフォールバックする。
export const resolvePartyIds = (party) => {
  const valid = (party||[]).filter(id => VALID_CHAR_IDS.includes(id));
  if(valid.length === 0) return ["ziran","saki","ouma"];
  return valid;
};

// ─── ラウンドシステム ───
export const ROUND_KEY = "__round__";
export const ROUND1_LEN = 150;
export const ROUND_LEN = 100;
export const MAX_ROUNDS = 6;

export const advanceRoundBoundary = (s) => {
  s.currentRound = (s.currentRound||1) + 1;
  s.avs[ROUND_KEY] = ROUND_LEN;
  s.log = addLog(s.log, `⌛ ラウンド${s.currentRound}に入りました`, "warn");
  if(s.currentRound > MAX_ROUNDS && !s.victory && !s.gameOver){
    s.gameOver = true;
    s.timeUp = true;
    s.log = addLog(s.log, `⌛ タイムアップ！${MAX_ROUNDS}ラウンド以内にクリアできませんでした`, "danger");
  }
  return s;
};

export const calcStarRating = (s) => {
  let stars = 0;
  if(s.currentRound<=2) stars++;
  if(s.currentRound<=4) stars++;
  if(!s.koEverHappened) stars++;
  return stars;
};

// partyIds順にAVを初期化（編成順がそのまま速度計算の対象になる）
export const mkAVs = (partyIds, eIds, hasSaran=false) => {
  const a={};
  partyIds.forEach(id=>{
    const spd = CHAR_SPD[id] || 100;
    a[id]=Math.ceil(10000/spd);
  });
  // 咲希: 戦闘開始時行動順+35%（編成にいる場合のみ）
  if(a.saki!==undefined) a.saki = Math.ceil(a.saki/1.35);
  eIds.forEach(id=>{ a[id]=Math.ceil(10000/ENEMY_SPD); });
  if(hasSaran) a.saran=Math.ceil(10000/SARAN_SPD);
  a[ROUND_KEY] = ROUND1_LEN;
  return a;
};
export const pickActor = avs => Object.entries(avs).reduce((a,b)=>a[1]<=b[1]?a:b)[0];
export const advanceAV = (avs, id, spd) => {
  const n={...avs};
  n[id]=Math.ceil(10000/spd); return n;
};
export const adjIds = tid => {
  const i=ENEMY_IDS.indexOf(tid);
  return [ENEMY_IDS[i-1],ENEMY_IDS[i+1]].filter(Boolean);
};

// ═══════════════════════════════════════════════════════
//  WAVE CONFIG
// ═══════════════════════════════════════════════════════
export const TOTAL_WAVES = 3;
export const getWaveConfig = (wave) => {
  const hpMult  = 1 + (wave - 1) * 0.5;
  const atkMult = 1 + (wave - 1) * 0.25;
  const count   = 5;
  return { hpMult, atkMult, count };
};

// ═══════════════════════════════════════════════════════
//  キャラ定義
// ═══════════════════════════════════════════════════════
export const OUMA_BASE  = 1496;
export const OUMA_HP    = Math.floor(OUMA_BASE * 1.24 * 1.15 * 1.2);
export const ZIRAN_ATK  = Math.floor((499 + 452) * 3.0);
export const SAKI_ATK   = 542 + 491;

// mkChars: 編成順partyIdsの先頭キャラを秘技対象（頼友指定）にする
export const mkChars = (partyIds) => {
  const firstId = (partyIds && partyIds[0]) || "ziran";
  return {
    ziran: {
      id:"ziran", name:"紫蘭", icon:"⚔️", role:"アタッカー", color:"#a78bfa",
      hp:Math.floor(1489*1.2), maxHp:Math.floor(1489*1.2), ep:60, maxEp:120,
      atk:ZIRAN_ATK, def:Math.floor(452*2.8), spd:110, taunt:100,
      cr:0.80, cd:3.00,
      x:100, xMax:300,
      xBonusLC:0.20,
      ignoreDef:0.30,
      lcDmgStack:0, lcDmgTurns:0, xAccumSinceReset:0,
      buffs:[], debuffs:[],
    },
    saki: {
      id:"saki", name:"咲希", icon:"🌺", role:"サポート", color:"#f9a8d4",
      hp:Math.floor(1005*1.2), maxHp:Math.floor(1005*1.2), ep:70, maxEp:140,
      atk:SAKI_ATK, def:584, spd:102, taunt:100,
      cr:1.00, cd:3.00,
      raiyu:firstId,
      hanabatake:0,
      kekkai:0,
      resonanceCharge:0,
      buffs:[], debuffs:[],
    },
    ouma: {
      id:"ouma", name:"桜舞", icon:"🌸", role:"ヒーラー", color:"#86efac",
      hp:OUMA_HP, maxHp:OUMA_HP, ep:70, maxEp:140,
      atk:Math.floor(336*1.0), def:Math.floor(553*2.8), spd:105, taunt:105,
      cr:0.80, cd:2.20,
      hasSaran:false, saranStacks:0,
      lcDmgStacks:0,
      buffs:[], debuffs:[],
    },
    miroku: {
      id:"miroku", name:"ミロク", icon:"🌀", role:"召喚士", color:"#34d399",
      hp:872, maxHp:872, ep:0, maxEp:150,
      atk:338, def:336, spd:115, taunt:100,
      cr:0.05, cd:0.50,
      x:0, xMax:220,
      // 星魂1: X上昇率+20%、X上昇値+20%、リノseウス防御無視10%
      xRateBonus:0.20, xValBonus:20,
      hasRhinoceros:false,       // 秘技で戦闘開始時召喚済みフラグ
      rhinoAtk:0,                // リノセウスの攻撃力（ターン開始時にミロクatk+X%で計算）
      buffs:[], debuffs:[],
    },
  };
};

// 挑発値に応じた重み付き抽選: 各キャラの選出確率 = 挑発値 / 全員の挑発値合計
export const pickTauntWeighted = (charIds, charsObj) => {
  const weights = charIds.map(id => charsObj[id].taunt || 100);
  const total = weights.reduce((a,b)=>a+b, 0);
  let roll = Math.random() * total;
  for(let i=0; i<charIds.length; i++){
    roll -= weights[i];
    if(roll <= 0) return charIds[i];
  }
  return charIds[charIds.length-1];
};

export const ENEMY_LV_BY_DIFF_LOCAL = ENEMY_LV_BY_DIFF;

export const mkEnemy = (idx, wave=1, diff="Normal") => {
  const cfg = getWaveConfig(wave);
  return {
    id:`e${idx}`, no:idx+1, name:`ラクガキ${idx+1}`,
    icon:"🖊️", color:"#fcd34d",
    hp:Math.floor(50000*cfg.hpMult), maxHp:Math.floor(50000*cfg.hpMult),
    toughness:30, maxToughness:30,
    atk:Math.floor(200*cfg.atkMult), def:500, spd:ENEMY_SPD,
    lv: ENEMY_LV_BY_DIFF_LOCAL[diff]||60,
    toughnessRatio: 0.5,
    elemRes:{quantum:0.0, ice:-0.20, wind:-0.20, lightning:0.40, other:0},
    debuffs:[], alive:true,
    broken:false, brokenTurns:0,
  };
};

// mkState: partyIds（編成順）を受け取り、その順序を state.partyIds として保持する
export const mkState = (partyIds, wave=1, diff="Normal") => {
  const enemies={}; ENEMY_IDS.forEach(id=>{ enemies[id]=mkEnemy(+id[1], wave, diff); });
  const chars=mkChars(partyIds);
  const firstId = (partyIds && partyIds[0]) || "ziran";
  chars.saki.hanabatake=3;
  chars.saki.raiyu=firstId; // 秘技: 戦闘開始時、先頭編成キャラに戦闘スキルを発動扱い
  if(chars[firstId]) chars[firstId].buffs.push({type:"raiyu_atk",label:"頼友ATK+15%",turns:3,value:0.15});
  partyIds.forEach(id=>{ if(chars[id]) chars[id].buffs.push({type:"hanabatake_xup",label:"花畑X上昇+10%",turns:3,value:0.10}); });
  const avs=mkAVs(partyIds, ENEMY_IDS);
  const firstId2=pickActor(avs);
  const firstAv=avs[firstId2];
  Object.keys(avs).forEach(k=>{ avs[k]-=firstAv; });
  const firstCharName = chars[firstId]?.name || firstId;
  const state = {
    avs, activeId:firstId2,
    chars, enemies,
    partyIds,
    sp:3, selectedTarget:"e0",
    xAccum:0,
    wave, diff,
    totalWaves: TOTAL_WAVES,
    log:[
      {id:0,text:`📝 ウェーブ${wave}/${TOTAL_WAVES} 戦闘開始！ラクガキアシスタント×5 [${diff}]`,type:"info"},
      {id:1,text:"⚡ 雷耐性+40% / 氷・風が弱点-20%",type:"warn"},
      {id:2,text:`✦ 紫蘭ATK:${Math.floor((499+452)*3)}  咲希ATK:${SAKI_ATK}  桜舞HP:${fmt(OUMA_HP)}`,type:"buff"},
      {id:3,text:`🌺 秘技: 咲希→${firstCharName}（先頭）を頼友に指定・花畑付与(SP不要)`,type:"buff"},
      ...(partyIds.includes("miroku")?[{id:4,text:"🦏 ミロク秘技: リノセウスを戦闘開始時から召喚",type:"buff"}]:[]),
    ],
    gameOver:false, victory:false,
    currentRound:1, timeUp:false,
  };
  // ミロクの秘技: 戦闘開始時リノセウス召喚
  if(partyIds.includes("miroku") && state.chars.miroku){
    state.chars.miroku.hasRhinoceros = true;
    state.avs["rhino"] = Math.ceil(10000/115);
    const firstAv2 = Math.min(...Object.values(state.avs));
    if(firstAv2 > 0) Object.keys(state.avs).forEach(k=>{ state.avs[k]-=firstAv2; });
  }
  return state;
};
