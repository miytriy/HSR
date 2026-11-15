import { BOSS_LV_BY_DIFF } from "../data/roster.js";
import { addLog, calcBreakDmg, calcDmg, fmt, gainEP } from "./calc.js";
import { applyOumaLC, healParty, inflictBreakStatus, partyDmgBonus, updateZiranLC } from "./effects.js";
import { CHAR_SPD, ROUND1_LEN, ROUND_KEY, advanceAV, advanceRoundBoundary, mkChars, pickTauntWeighted } from "./state.js";

export const BOSS_ID   = "kakaria";
export const BLADE_ID  = "ice_blade";
export const BOSS_SPD  = 100;
export const BLADE_SPD = 85;
export const DIFF_MULT = { Normal:1.0, Hard:1.5, Extreme:2.5 };

export const mkBoss = (diff="Normal") => {
  const m = DIFF_MULT[diff]||1.0;
  return {
    id:BOSS_ID, name:"カカリア", icon:"❄️", color:"#93c5fd",
    hp:Math.floor(1000000*m), maxHp:Math.floor(1000000*m),
    atk:Math.floor(164*m), def:234, spd:BOSS_SPD,
    lv: BOSS_LV_BY_DIFF[diff]||80,
    toughness:200, maxToughness:200,
    isElite: true,
    weakElems:["fire","quantum","imaginary"],
    elemRes:{fire:-0.20,quantum:-0.20,imaginary:-0.20,ice:0.20,wind:0.20,physical:0.20,other:0},
    debuffs:[], alive:true, charged:false, turn:0, dmgUpPerFrozen:0,
    broken:false, brokenTurns:0,
  };
};

export const mkBlade = (boss) => ({
  id:BLADE_ID, name:"氷刃", icon:"🗡️", color:"#bfdbfe",
  hp:Math.floor(boss.maxHp*0.5), maxHp:Math.floor(boss.maxHp*0.5),
  atk:Math.floor(boss.atk*0.5), def:Math.floor(boss.def*0.5),
  spd:BLADE_SPD, alive:true, debuffs:[],
  lv: boss.lv,
  toughness:60, maxToughness:60,
  isElite: false,
  weakElems:["fire","quantum","imaginary"],
  elemRes:{...boss.elemRes},
  broken:false, brokenTurns:0,
});

export const mkAVsBoss = (partyIds, hasBlade=false) => {
  const a={};
  partyIds.forEach(id=>{ const spd=CHAR_SPD[id]||100; a[id]=Math.ceil(10000/spd); });
  if(a.saki!==undefined) a.saki = Math.ceil(a.saki/1.35);
  a[BOSS_ID]=Math.ceil(10000/BOSS_SPD);
  if(hasBlade) a[BLADE_ID]=Math.ceil(10000/BLADE_SPD);
  a[ROUND_KEY] = ROUND1_LEN;
  return a;
};

export const mkStateBoss = (partyIds, diff="Normal") => {
  const boss=mkBoss(diff);
  const chars=mkChars(partyIds);
  const firstId = (partyIds && partyIds[0]) || "ziran";
  chars.saki.hanabatake=3;
  chars.saki.raiyu=firstId;
  if(chars[firstId]) chars[firstId].buffs.push({type:"raiyu_atk",label:"頼友ATK+15%",turns:3,value:0.15});
  partyIds.forEach(id=>{ if(chars[id]) chars[id].buffs.push({type:"hanabatake_xup",label:"花畑X上昇+10%",turns:3,value:0.10}); });
  const avs=mkAVsBoss(partyIds,false);
  const firstActor=Object.entries(avs).reduce((a,b)=>a[1]<=b[1]?a:b)[0];
  const firstAv=avs[firstActor];
  Object.keys(avs).forEach(k=>{ avs[k]-=firstAv; });
  const firstCharName = chars[firstId]?.name || firstId;
  return {
    avs, activeId:firstActor, chars, boss, blade:null,
    partyIds,
    sp:3, selectedTarget:BOSS_ID, xAccum:0, diff,
    log:[
      {id:0,text:`❄️ ボス戦開始！カカリア [${diff}]`,type:"info"},
      {id:1,text:"弱点: 炎・量子・虚数 / 氷・風・物理耐性あり",type:"warn"},
      {id:2,text:`HP:${fmt(boss.hp)} ATK:${boss.atk} DEF:${boss.def}`,type:"buff"},
      {id:3,text:`🌺 秘技: ${firstCharName}（先頭）を頼友に指定・花畑付与`,type:"buff"},
    ],
    gameOver:false, victory:false,
    currentRound:1, timeUp:false,
  };
};

export const dmgToBossTarget = (target, atk, ratio, elem, ignoreDef=0, cr=0, cd=1.5, dmgBonus=0) => {
  if(!target||!target.alive) return 0;
  const res=target.elemRes?.[elem]??0;
  const breakMult = target.broken ? 1.0 : 0.9;
  return calcDmg(atk, ratio, target.def, ignoreDef, res, cr, cd, dmgBonus,
    { enemyLv: target.lv||80, breakMult });
};

export const hitToughBoss = (s, target, val, elem) => {
  if(!target||!target.alive) return;
  const entangleDebuff = target.debuffs.find(d=>d.type==="status_quantum");
  if(entangleDebuff){
    target.quantumStacks = Math.min(5, (target.quantumStacks||0)+1);
    entangleDebuff.stacks = target.quantumStacks;
  }
  if(target.broken) return;
  const isWeak = elem==="other" || (target.weakElems&&target.weakElems.includes(elem));
  if(!isWeak) return;
  target.toughness=Math.max(0,target.toughness-val);
  if(target.toughness<=0 && !target.broken){
    target.broken = true; target.brokenTurns = 2;
    const breakDmg = calcBreakDmg(elem, target.maxToughness||60, 0, target.lv||80, 0, 0, target.elemRes?.[elem]??0, 0);
    target.hp = Math.max(0, target.hp-breakDmg);
    const statusNames = inflictBreakStatus(s, target, elem, !!target.isElite);
    if(s) s.log = addLog(s.log, `💥 ${target.name} 弱点撃破！(${fmt(breakDmg)}dmg) → ${statusNames.join("・")}付与`, "warn");
    if(target.hp<=0) target.alive=false;
  }
};

export function applyPlayerActionBoss(s, charId, actionId) {
  const c=s.chars[charId];
  if(!c) return s;
  const partyIds = s.partyIds || ["ziran","saki","ouma"];
  const boss=s.boss;
  const blade=s.blade;
  const killCheck=(t)=>{ if(t&&t.hp<=0) t.alive=false; };
  const targets=()=>[boss,blade].filter(t=>t&&t.alive);

  if(charId==="ziran"){
    const xMult=1+(c.xBonusLC||0.20)+c.buffs.reduce((a,b)=>a+(b.type==="xUp"?(b.value||0):0),0);
    const igDef=c.ignoreDef||0.30;
    const dmgB=partyDmgBonus(c,s)+((c.lcDmgStack||0)*0.10);
    if(actionId==="normal"){
      const ep=gainEP(c,20); s.sp=Math.min(5,s.sp+1);
      const xPrev=c.x; c.x=Math.min(c.xMax,c.x+25); updateZiranLC(s,25);
      let total=0;
      targets().forEach(t=>{ const d=dmgToBossTarget(t,c.atk,0.80,"quantum",igDef,c.cr,c.cd,dmgB); t.hp=Math.max(0,t.hp-d); hitToughBoss(s,t,10,"quantum"); killCheck(t); total+=d; });
      s.log=addLog(s.log,`紫蘭: 通常攻撃 → ${fmt(total)}dmg(量子) X:${xPrev}→${c.x} EP+${ep}`,"dmg");
    } else if(actionId==="skill"){
      const ep=gainEP(c,30); s.sp=Math.max(-2,s.sp-1);
      const xPrev=c.x; c.x=Math.min(c.xMax,c.x+35); updateZiranLC(s,35);
      const xEff=c.x*xMult; let total=0; s.ziranHits=[];
      const d1=dmgToBossTarget(boss,c.atk,xEff*0.006,"quantum",igDef,c.cr,c.cd,dmgB);
      boss.hp=Math.max(0,boss.hp-d1); hitToughBoss(s,boss,8,"quantum"); total+=d1;
      s.ziranHits.push({targetId:BOSS_ID,dmg:d1});
      for(let i=0;i<2;i++){
        const d2=dmgToBossTarget(boss,c.atk,xEff*0.002,"quantum",igDef,c.cr,c.cd,dmgB);
        boss.hp=Math.max(0,boss.hp-d2); hitToughBoss(s,boss,7,"quantum"); total+=d2;
        s.ziranHits.push({targetId:BOSS_ID,dmg:d2});
        if(blade&&blade.alive){
          const bd=dmgToBossTarget(blade,c.atk,xEff*0.002,"quantum",igDef,c.cr,c.cd,dmgB);
          blade.hp=Math.max(0,blade.hp-bd); killCheck(blade); total+=bd;
          s.ziranHits.push({targetId:BLADE_ID,dmg:bd});
        }
      }
      killCheck(boss);
      s.log=addLog(s.log,`紫蘭: 戦闘スキル → ${fmt(total)}dmg(量子/拡散) X:${xPrev}→${c.x} EP+${ep}`,"dmg");
    } else if(actionId==="ult"){
      c.ep=0;
      const xPrev=c.x; c.x=Math.min(c.xMax,c.x+100); updateZiranLC(s,100);
      const xEff=c.x*xMult; let total=0; s.ziranHits=[];
      for(let i=0;i<2;i++){
        const d1=dmgToBossTarget(boss,c.atk,xEff*0.008,"quantum",igDef,c.cr,c.cd,dmgB);
        boss.hp=Math.max(0,boss.hp-d1); hitToughBoss(s,boss,10,"quantum"); total+=d1;
        s.ziranHits.push({targetId:BOSS_ID,dmg:d1});
        if(blade&&blade.alive){
          const bd=dmgToBossTarget(blade,c.atk,xEff*0.002,"quantum",igDef,c.cr,c.cd,dmgB);
          blade.hp=Math.max(0,blade.hp-bd); killCheck(blade); total+=bd;
          s.ziranHits.push({targetId:BLADE_ID,dmg:bd});
        }
      }
      targets().forEach(t=>{
        const d=dmgToBossTarget(t,c.atk,xEff*0.012,"quantum",igDef,c.cr,c.cd,dmgB);
        t.hp=Math.max(0,t.hp-d); killCheck(t); total+=d;
        s.ziranHits.push({targetId:t.id,dmg:d});
      });
      killCheck(boss);
      gainEP(c,5,false);
      c.buffs=c.buffs.filter(b=>b.type!=="entry_atk");
      c.buffs.push({type:"entry_atk",label:"入場ATK+50%",turns:2,value:0.50});
      c.x=Math.min(c.xMax,c.x+20); updateZiranLC(s,20);
      s.log=addLog(s.log,`✨ 紫蘭: 必殺技! → ${fmt(total)}dmg X:${xPrev}→${c.x} EP+5 入場ATK+50%`,"ult");
    }
  } else if(charId==="saki"){
    const raiyuChar=s.chars[c.raiyu]||c;
    const raiyuAtk=raiyuChar.atk*1.15;
    const dmgB=partyDmgBonus(c,s);
    const pen=c.kekkai>0?0.50:0;
    if(actionId==="normal"){
      const ep=gainEP(c,20); s.sp=Math.min(5,s.sp+1);
      const d=dmgToBossTarget(boss,raiyuAtk,1.0,"other",pen,c.cr,c.cd,dmgB);
      boss.hp=Math.max(0,boss.hp-d); killCheck(boss);
      s.log=addLog(s.log,`咲希: 通常攻撃 → ${fmt(d)}dmg(七彩) EP+${ep}`,"dmg");
    } else if(actionId==="skill"){
      const ep=gainEP(c,30); s.sp=Math.max(-2,s.sp-1);
      const raiyuId=s.selectedAllyTarget||partyIds[0]||"ziran";
      c.raiyu=raiyuId; c.hanabatake=3;
      const z=s.chars[raiyuId];
      if(z){ z.buffs=z.buffs.filter(b=>b.type!=="raiyu_atk"); z.buffs.push({type:"raiyu_atk",label:"頼友ATK+15%",turns:3,value:0.15}); }
      partyIds.forEach(id=>{ if(s.chars[id]){ s.chars[id].buffs=s.chars[id].buffs.filter(b=>b.type!=="hanabatake_xup"); s.chars[id].buffs.push({type:"hanabatake_xup",label:"花畑X上昇+10%",turns:3,value:0.10}); } });
      s.log=addLog(s.log,`咲希: 戦闘スキル → ${z?z.name:raiyuId}を頼友に指定・花畑(3T) 全体与ダメ+40% EP+${ep}`,"buff");
    } else if(actionId==="resonance"){
      if(c.resonanceCharge<100){ s.log=addLog(s.log,`咲希: 共鳴スキル チャージ不足`,"warn"); return s; }
      const ep=gainEP(c,20); s.sp=Math.min(5,s.sp+1);
      c.resonanceCharge=0;
      boss.debuffs=boss.debuffs.filter(d=>d.type!=="def_down");
      boss.debuffs.push({type:"def_down",label:"防御-15%",turns:2,value:0.15});
      if(blade&&blade.alive){ blade.debuffs=blade.debuffs.filter(d=>d.type!=="def_down"); blade.debuffs.push({type:"def_down",label:"防御-15%",turns:2,value:0.15}); }
      const bounceTargets=[boss];
      const aliveT=[boss,...(blade&&blade.alive?[blade]:[])].filter(t=>t.alive);
      for(let i=1;i<5;i++) bounceTargets.push(aliveT[Math.floor(Math.random()*aliveT.length)]);
      let total=0; s.resonanceHits=[];
      bounceTargets.forEach((bt,i)=>{
        if(!bt||!bt.alive) return;
        const d=dmgToBossTarget(bt,raiyuAtk,1.0,"other",pen+0.15,c.cr,c.cd,dmgB);
        bt.hp=Math.max(0,bt.hp-d); hitToughBoss(s,bt,5,"other"); total+=d;
        s.resonanceHits.push({targetId:bt.id,dmg:d,hitIdx:i});
        if(bt.hp<=0) bt.alive=false;
      });
      s.log=addLog(s.log,`💠 咲希: 共鳴スキル → 防御-15%(2T) ${fmt(total)}dmg(七彩×5バウンド) EP+${ep}`,"dmg");
    } else if(actionId==="ult"){
      c.ep=0;
      const raiyuId=s.selectedAllyTarget||partyIds[0]||"ziran";
      c.raiyu=raiyuId; c.kekkai=3;
      c.resonanceCharge=Math.min(100,c.resonanceCharge+15);
      const z=s.chars[raiyuId];
      if(z){ z.buffs=z.buffs.filter(b=>b.type!=="raiyu_atk"); z.buffs.push({type:"raiyu_atk",label:"頼友ATK+15%",turns:3,value:0.15}); }
      partyIds.forEach(id=>{ if(s.chars[id]){ s.chars[id].buffs=s.chars[id].buffs.filter(b=>b.type!=="kekkai_xup"&&b.type!=="kekkai_pen"); s.chars[id].buffs.push({type:"kekkai_xup",label:"結界X上昇+20%",turns:3,value:0.20}); s.chars[id].buffs.push({type:"kekkai_pen",label:"結界耐性貫通+25%",turns:3,value:0.25}); } });
      const bonusX=s.chars.ziran?Math.floor(s.chars.ziran.x*0.50):0;
      if(s.chars.ziran){ s.chars.ziran.x=Math.min(s.chars.ziran.xMax,s.chars.ziran.x+bonusX); updateZiranLC(s,bonusX); }
      gainEP(c,5,false);
      s.log=addLog(s.log,`✨ 咲希: 必殺技! → 結界(3T) 耐性貫通+25% ${z?z.name:raiyuId}X+${bonusX} 共鳴+15%`,"ult");
    }
  } else if(charId==="ouma"){
    const dmgB=partyDmgBonus(c,s);
    if(actionId==="normal"){
      const ep=gainEP(c,20); s.sp=Math.min(5,s.sp+1);
      const d=dmgToBossTarget(boss,c.maxHp*0.50,1,"wind",0,c.cr,c.cd,dmgB);
      boss.hp=Math.max(0,boss.hp-d); hitToughBoss(s,boss,5,"wind"); killCheck(boss);
      s.log=addLog(s.log,`桜舞: 通常攻撃 → ${fmt(d)}dmg(風) EP+${ep}`,"dmg");
    } else if(actionId==="skill"){
      const ep=gainEP(c,30); s.sp=Math.max(-2,s.sp-1);
      let totalDmg=0;
      targets().forEach(t=>{ const d=dmgToBossTarget(t,c.maxHp*0.55,1,"wind",0,c.cr,c.cd,dmgB); t.hp=Math.max(0,t.hp-d); hitToughBoss(s,t,8,"wind"); killCheck(t); totalDmg+=d; });
      const healBase=Math.floor(c.maxHp*0.30); healParty(s,healBase);
      s.log=addLog(s.log,`桜舞: 戦闘スキル → ${fmt(totalDmg)}dmg 全体+${fmt(healBase)}回復 EP+${ep}`,"heal");
    } else if(actionId==="ult"){
      c.ep=0; c.hasSaran=true;
      let totalDmg=0;
      targets().forEach(t=>{ const d=dmgToBossTarget(t,c.maxHp*0.64,1,"wind",0,c.cr,c.cd,dmgB); t.hp=Math.max(0,t.hp-d); hitToughBoss(s,t,10,"wind"); killCheck(t); totalDmg+=d; });
      const h1=Math.floor(c.maxHp*0.45); healParty(s,h1);
      const h2=Math.floor(c.maxHp*0.15);
      Object.values(s.chars).forEach(ch=>{ ch.hp=Math.min(ch.maxHp,ch.hp+h2); });
      Object.values(s.chars).forEach(ch=>{ gainEP(ch,5,false); });
      applyOumaLC(s); gainEP(c,5,false);
      if(!s.avs.saran) s.avs.saran=Math.ceil(10000/85);
      s.log=addLog(s.log,`✨ 桜舞: 必殺技! → 連兎召喚 ${fmt(totalDmg)}dmg +${fmt(h1+h2)}回復`,"ult");
    }
  }

  c.buffs=c.buffs.map(b=>({...b,turns:b.turns-1})).filter(b=>b.turns>0);
  c.debuffs=c.debuffs.map(d=>({...d,turns:d.turns-1})).filter(d=>d.turns>0);
  if(charId==="saki"){
    if(c.hanabatake>0) c.hanabatake--;
    if(c.kekkai>0) c.kekkai--;
    c.resonanceCharge=Math.min(100,c.resonanceCharge+15);
    if(c.resonanceCharge>=100) s.log=addLog(s.log,`💠 咲希: 共鳴スキル チャージ完了！`,"buff");
  }
  if(charId==="ziran"&&s.chars.ziran?.lcDmgTurns>0){ s.chars.ziran.lcDmgTurns--; if(s.chars.ziran.lcDmgTurns===0) s.chars.ziran.lcDmgStack=0; }

  partyIds.forEach(id=>{
    const ch=s.chars[id]; if(!ch) return;
    if(ch.hp<=0&&!ch.ko){ ch.ko=true; ch.hp=0; delete s.avs[id]; s.koEverHappened=true; s.log=addLog(s.log,`💀 ${ch.name} が戦闘不能！`,"danger"); }
  });

  // ボス・氷刃の靭性/デバフtick
  [s.boss, s.blade].forEach(t=>{
    if(!t||!t.alive) return;
    if(t.debuffs){ const nb=[]; t.debuffs.forEach(d=>{ const tl=d.turns-1; if(tl>0) nb.push({...d,turns:tl}); }); t.debuffs=nb; }
    if(t.broken){ t.brokenTurns=(t.brokenTurns||0)-1; if(t.brokenTurns<=0){ t.broken=false; t.toughness=t.maxToughness; s.log=addLog(s.log,`🔄 ${t.name} 靭性回復`,"buff"); } }
  });

  s.avs=advanceAV(s.avs,charId,CHAR_SPD[charId]||100);
  if(s.blade&&!s.blade.alive) delete s.avs[BLADE_ID];
  s.log=addLog(s.log,`  ⏱ ${c.name} 次AV:${s.avs[charId]}`,"av");
  return s;
}

export function applySaranActionBoss(s) {
  const o=s.chars.ouma; if(!o) return s;
  const heal=Math.floor(o.maxHp*0.15);
  Object.values(s.chars).forEach(ch=>{ ch.hp=Math.min(ch.maxHp,ch.hp+heal); });
  Object.values(s.chars).forEach(ch=>{ gainEP(ch,5,false); });
  applyOumaLC(s);
  s.log=addLog(s.log,`🐰 連兎: 全体+${fmt(heal)}回復 全体EP+5 与ダメバフUp`,"heal");
  s.avs=advanceAV(s.avs,"saran",85);
  return s;
}

export function resolveNextBoss(s) {
  const partyIds = s.partyIds || ["ziran","saki","ouma"];
  const keys=[
    ...partyIds.filter(id=>!s.chars[id]?.ko),
    ...(s.boss.alive?[BOSS_ID]:[]),
    ...(s.blade&&s.blade.alive?[BLADE_ID]:[]),
    ...(s.chars.ouma?.hasSaran&&s.avs.saran!==undefined?["saran"]:[]),
    ROUND_KEY,
  ];
  const rel=Object.fromEntries(Object.entries(s.avs).filter(([k])=>keys.includes(k)));
  if(!Object.keys(rel).length) return s;
  const id=Object.entries(rel).reduce((a,b)=>a[1]<=b[1]?a:b)[0];
  const minAv=s.avs[id];
  Object.keys(s.avs).forEach(k=>{ s.avs[k]-=minAv; });
  if(id===ROUND_KEY){ s=advanceRoundBoundary(s); if(s.gameOver) return s; return resolveNextBoss(s); }
  s.activeId=id;
  if(partyIds.includes(id)) s.log=addLog(s.log,`▶ ${s.chars[id].name} の番！(AV:${Math.ceil(minAv)})`,"player");
  return s;
}

export function applyBossAction(s) {
  const boss=s.boss; if(!boss.alive) return s;
  boss.turn=(boss.turn||0)+1;
  const partyIds = s.partyIds || ["ziran","saki","ouma"];
  const aliveChars=partyIds.filter(id=>s.chars[id]&&s.chars[id].hp>0&&!s.chars[id].ko);
  if(!aliveChars.length) return s;
  const randChar=()=>{ const id=pickTauntWeighted(aliveChars,s.chars); return s.chars[id]; };

  if(boss.charged){
    boss.charged=false;
    let total=0;
    aliveChars.forEach(id=>{
      const tc=s.chars[id];
      const dmg=Math.floor(boss.atk*3.5*(1+boss.dmgUpPerFrozen*0.05));
      tc.hp=Math.max(0,tc.hp-dmg); total+=dmg;
      if(tc.hp<=0&&!tc.ko){ tc.ko=true; tc.hp=0; delete s.avs[id]; s.koEverHappened=true; s.log=addLog(s.log,`💀 ${tc.name} が戦闘不能！`,"danger"); }
      tc.debuffs=tc.debuffs.filter(d=>d.type!=="ice_dot");
      tc.debuffs.push({type:"ice_dot",label:"氷DoT",turns:2,dmgPerTurn:Math.floor(boss.atk*0.5)});
    });
    s.log=addLog(s.log,`🌨️ カカリア: 無尽なる冬の絶罰！全体に${fmt(total)}dmg(氷)`,"enemy-dmg");
    s.avs=advanceAV(s.avs,BOSS_ID,BOSS_SPD);
    return s;
  }

  const skills=boss.turn===1?["chill","freeze"]:["chill","freeze","summon","charge","shatter"];
  const skill=skills[Math.floor(Math.random()*skills.length)];

  if(skill==="chill"){
    const tc=randChar();
    const dmg=Math.floor(boss.atk*1.8*(1+boss.dmgUpPerFrozen*0.05));
    tc.hp=Math.max(0,tc.hp-dmg);
    if(tc.hp<=0&&!tc.ko){ tc.ko=true; tc.hp=0; delete s.avs[tc.id]; s.koEverHappened=true; s.log=addLog(s.log,`💀 ${tc.name} が戦闘不能！`,"danger"); }
    else { gainEP(tc,5,true); s.lastHitCharId=tc.id; s.hitSeq=(s.hitSeq||0)+1; }
    s.log=addLog(s.log,`🧊 カカリア: 骨を刺す寒冷 → ${tc.name}に${fmt(dmg)}dmg(氷)`,"enemy-dmg");
  } else if(skill==="freeze"){
    const tc=randChar();
    const dmg=Math.floor(boss.atk*1.5*(1+boss.dmgUpPerFrozen*0.05));
    tc.hp=Math.max(0,tc.hp-dmg);
    s.lastHitCharId=tc.id; s.hitSeq=(s.hitSeq||0)+1;
    const sakiResist = tc.id==="saki" && Math.random()<0.60;
    if(tc.hp<=0&&!tc.ko){ tc.ko=true; tc.hp=0; delete s.avs[tc.id]; s.koEverHappened=true; s.log=addLog(s.log,`💀 ${tc.name} が戦闘不能！`,"danger"); }
    else if(sakiResist){ gainEP(tc,5,true); s.log=addLog(s.log,`🛡️ 咲希: 行動制限デバフを抵抗！ → ${fmt(dmg)}dmg(氷)のみ`,"enemy-dmg"); }
    else if(Math.random()<0.80){
      tc.debuffs=tc.debuffs.filter(d=>d.type!=="frozen");
      tc.debuffs.push({type:"frozen",label:"凍結",turns:1});
      tc.debuffs=tc.debuffs.filter(d=>d.type!=="ice_dot");
      tc.debuffs.push({type:"ice_dot",label:"氷DoT",turns:2,dmgPerTurn:Math.floor(boss.atk*0.3)});
      gainEP(tc,5,true);
      boss.dmgUpPerFrozen=Math.min(5,boss.dmgUpPerFrozen+1);
      delete s.avs[tc.id];
      s.log=addLog(s.log,`🧊 カカリア: 永遠に囚われし霜 → ${tc.name}に${fmt(dmg)}dmg 凍結(1T)！ボスダメ+${boss.dmgUpPerFrozen*5}%`,"enemy-dmg");
    } else { gainEP(tc,5,true); s.log=addLog(s.log,`🧊 カカリア: 永遠に囚われし霜 → ${tc.name}に${fmt(dmg)}dmg(氷)`,"enemy-dmg"); }
  } else if(skill==="summon"){
    if(!s.blade||!s.blade.alive){
      s.blade=mkBlade(boss); s.avs[BLADE_ID]=Math.ceil(10000/BLADE_SPD);
      s.log=addLog(s.log,`🗡️ カカリア: 長い氷期の兆し → 氷刃を召喚！`,"warn");
    } else {
      const tc=randChar();
      const dmg=Math.floor(boss.atk*1.8*(1+boss.dmgUpPerFrozen*0.05));
      tc.hp=Math.max(0,tc.hp-dmg); s.lastHitCharId=tc.id; s.hitSeq=(s.hitSeq||0)+1;
      if(tc.hp<=0&&!tc.ko){ tc.ko=true; tc.hp=0; delete s.avs[tc.id]; s.koEverHappened=true; }
      else gainEP(tc,5,true);
      s.log=addLog(s.log,`🧊 カカリア: 骨を刺す寒冷 → ${tc.name}に${fmt(dmg)}dmg(氷)`,"enemy-dmg");
    }
  } else if(skill==="charge"){
    boss.charged=true;
    s.log=addLog(s.log,`⚠️ カカリア: 雪国の聖者の怒り → 次ターンに無尽なる冬の絶罰！`,"warn");
  } else if(skill==="shatter"){
    const frozenChars=aliveChars.filter(id=>s.chars[id].debuffs.some(d=>d.type==="frozen"));
    if(frozenChars.length>0){
      let total=0;
      frozenChars.forEach(id=>{
        const tc=s.chars[id];
        const dmg=Math.floor(boss.atk*2.2*(1+boss.dmgUpPerFrozen*0.05));
        tc.hp=Math.max(0,tc.hp-dmg); total+=dmg;
        tc.debuffs=tc.debuffs.filter(d=>d.type!=="frozen");
        if(!tc.ko&&s.avs[id]===undefined) s.avs[id]=Math.ceil(10000/(CHAR_SPD[id]||100));
        if(tc.hp<=0&&!tc.ko){ tc.ko=true; tc.hp=0; delete s.avs[tc.id]; s.koEverHappened=true; s.log=addLog(s.log,`💀 ${tc.name} が戦闘不能！`,"danger"); }
        else gainEP(tc,5,true);
        s.lastHitCharId=tc.id; s.hitSeq=(s.hitSeq||0)+1;
      });
      s.log=addLog(s.log,`💥 カカリア: 砕氷振動 → 凍結キャラに${fmt(total)}dmg 凍結解除`,"enemy-dmg");
    } else {
      const tc=randChar();
      const dmg=Math.floor(boss.atk*1.8*(1+boss.dmgUpPerFrozen*0.05));
      tc.hp=Math.max(0,tc.hp-dmg); s.lastHitCharId=tc.id; s.hitSeq=(s.hitSeq||0)+1;
      if(tc.hp<=0&&!tc.ko){ tc.ko=true; tc.hp=0; delete s.avs[tc.id]; s.koEverHappened=true; }
      else gainEP(tc,5,true);
      s.log=addLog(s.log,`🧊 カカリア: 骨を刺す寒冷 → ${tc.name}に${fmt(dmg)}dmg(氷)`,"enemy-dmg");
    }
  }

  aliveChars.forEach(id=>{
    const tc=s.chars[id];
    tc.debuffs.forEach(d=>{
      if(d.type==="ice_dot"&&d.dmgPerTurn){
        tc.hp=Math.max(0,tc.hp-d.dmgPerTurn);
        s.log=addLog(s.log,`  ❄️ ${tc.name} 氷DoT: ${fmt(d.dmgPerTurn)}dmg`,"warn");
        if(tc.hp<=0&&!tc.ko){ tc.ko=true; tc.hp=0; delete s.avs[tc.id]; s.koEverHappened=true; s.log=addLog(s.log,`💀 ${tc.name} が戦闘不能！`,"danger"); }
      }
    });
    tc.debuffs=tc.debuffs.map(d=>({...d,turns:d.turns-1})).filter(d=>d.turns>0);
    if(!tc.debuffs.some(d=>d.type==="frozen")&&!tc.ko&&s.avs[id]===undefined){
      s.avs[id]=Math.ceil(10000/(CHAR_SPD[id]||100));
      s.log=addLog(s.log,`  🌡️ ${tc.name} 凍結解除！`,"buff");
    }
  });
  s.avs=advanceAV(s.avs,BOSS_ID,BOSS_SPD);
  return s;
}

export function applyBladeAction(s) {
  const blade=s.blade; if(!blade||!blade.alive) return s;
  const partyIds = s.partyIds || ["ziran","saki","ouma"];
  const aliveChars=partyIds.filter(id=>s.chars[id]&&s.chars[id].hp>0&&!s.chars[id].ko&&!s.chars[id].debuffs?.some(d=>d.type==="frozen"));
  let total=0;
  aliveChars.forEach(id=>{
    const tc=s.chars[id];
    const dmg=Math.floor(blade.atk*0.8);
    tc.hp=Math.max(0,tc.hp-dmg); total+=dmg;
    s.lastHitCharId=tc.id; s.hitSeq=(s.hitSeq||0)+1;
    if(tc.hp<=0&&!tc.ko){ tc.ko=true; tc.hp=0; delete s.avs[tc.id]; s.koEverHappened=true; s.log=addLog(s.log,`💀 ${tc.name} が戦闘不能！`,"danger"); }
    else gainEP(tc,5,true);
  });
  s.log=addLog(s.log,`🗡️ 氷刃: 全体に${fmt(total)}dmg(氷)`,"enemy-dmg");
  s.avs=advanceAV(s.avs,BLADE_ID,BLADE_SPD);
  return s;
}
