import { CHAR_LV, addLog, calcBreakDmg, calcDmg, calcDotBase, charLvValue, fmt, toughnessRatioOf } from "./calc.js";

export const ELEM_STATUS = {
  physical:  { name:"裂創",   turns:2 },
  fire:      { name:"燃焼",   turns:2 },
  ice:       { name:"凍結",   turns:1 },
  lightning: { name:"感電",   turns:2 },
  wind:      { name:"風化",   turns:2 },
  quantum:   { name:"もつれ", turns:1 },
  imaginary: { name:"禁錮",   turns:1 },
};

export const inflictBreakStatus = (s, target, elem, isElite=false, breakEffect=0) => {
  const elemsToApply = elem==="other" ? Object.keys(ELEM_STATUS) : [elem];
  const logs = [];
  elemsToApply.forEach(el=>{
    const info = ELEM_STATUS[el];
    if(!info) return;
    target.debuffs = target.debuffs.filter(d=>d.type!==`status_${el}`);
    const debuff = { type:`status_${el}`, label:info.name, turns:info.turns, elem:el };
    if(el==="wind"){
      const existing = (target.windStacks||0);
      target.windStacks = Math.min(5, existing + (isElite?3:1));
      debuff.stacks = target.windStacks;
    }
    if(el==="quantum"){
      target.quantumStacks = Math.min(5, (target.quantumStacks||0)+1);
      debuff.stacks = target.quantumStacks;
      if(s.avs && s.avs[target.id]!==undefined){
        const baseAv = Math.ceil(10000/(target.spd||90));
        s.avs[target.id] += Math.floor(baseAv*0.20*(1+breakEffect));
      }
    }
    if(el==="imaginary"){
      if(s.avs && s.avs[target.id]!==undefined){
        const baseAv = Math.ceil(10000/(target.spd||90));
        s.avs[target.id] += Math.floor(baseAv*0.30*(1+breakEffect));
      }
      target.imaginarySpdDown = true;
    }
    target.debuffs.push(debuff);
    logs.push(info.name);
  });
  return logs;
};

export const dmgToEnemy = (e, atk, ratio, elem, ignoreDef=0, cr=0, cd=1.5, dmgBonus=0) => {
  if(!e.alive) return 0;
  const breakMult = e.broken ? 1.0 : 0.9;
  return calcDmg(atk, ratio, e.def, ignoreDef, e.elemRes[elem]??0, cr, cd, dmgBonus,
    { enemyLv: e.lv||60, breakMult });
};

export const hitTough = (s, e, val, elem) => {
  if(!e.alive) return;
  const entangleDebuff = e.debuffs.find(d=>d.type==="status_quantum");
  if(entangleDebuff){
    e.quantumStacks = Math.min(5, (e.quantumStacks||0)+1);
    entangleDebuff.stacks = e.quantumStacks;
  }
  if(e.broken) return;
  const weakList = e.weakElems || ["ice","wind"];
  const isWeak = elem==="other" || weakList.includes(elem);
  if(!isWeak) return;
  e.toughness = Math.max(0, e.toughness-val);
  if(e.toughness<=0 && !e.broken){
    e.broken = true; e.brokenTurns = 2;
    const breakDmg = calcBreakDmg(elem, e.maxToughness||30, 0, e.lv||60, 0, 0, e.elemRes[elem]??0, 0);
    e.hp = Math.max(0, e.hp-breakDmg);
    const statusNames = inflictBreakStatus(s, e, elem, !!e.isElite);
    if(s) s.log = addLog(s.log, `💥 ${e.name} 弱点撃破！(${fmt(breakDmg)}dmg) → ${statusNames.join("・")}付与`, "warn");
    if(e.hp<=0) e.alive=false;
  }
};

export const updateZiranLC = (s, gained) => {
  const z=s.chars.ziran;
  if(!z) return;
  s.xAccum=(s.xAccum||0)+gained;
  const stacks=Math.min(3,Math.floor(s.xAccum/30));
  if(stacks>(z.lcDmgStack||0)){
    z.lcDmgStack=stacks; z.lcDmgTurns=2;
    s.log=addLog(s.log,`  📖 紫蘭LC: 与ダメ+${stacks*10}%(${stacks}層,2T)`,"buff");
  }
};

export const applyOumaLC = (s) => {
  const o=s.chars.ouma;
  if(!o) return;
  o.lcDmgStacks=Math.min(3,(o.lcDmgStacks||0)+1);
  const stacks=o.lcDmgStacks;
  Object.values(s.chars).forEach(ch=>{
    ch.buffs=ch.buffs.filter(b=>b.type!=="ouma_lc_dmg");
    ch.buffs.push({type:"ouma_lc_dmg",label:`回復与ダメ+${stacks*15}%`,turns:3,value:stacks*0.15});
  });
};

export const healParty = (s, base) => {
  const chars=Object.values(s.chars);
  const lowest=chars.reduce((a,b)=>(a.hp/a.maxHp)<=(b.hp/b.maxHp)?a:b);
  chars.forEach(ch=>{
    const bonus=ch.id===lowest.id?Math.floor(base*0.30):0;
    ch.hp=Math.min(ch.maxHp,ch.hp+base+bonus);
  });
  const o=s.chars.ouma;
  if(o && o.saranStacks<3){
    o.saranStacks++;
    s.log=addLog(s.log,`  🌿 サランHPスタック: ${o.saranStacks}/3層`,"buff");
  }
  applyOumaLC(s);
};

export const partyDmgBonus = (c, s) => {
  let b=0;
  c.buffs.forEach(bf=>{ if(bf.type==="ouma_lc_dmg") b+=bf.value||0; });
  const sk=s.chars.saki;
  if(sk && sk.hanabatake>0) b+=0.16;
  if(sk && sk.hanabatake>0) b+=0.24;
  return b;
};

export const tickEnemyStatus = (s, e) => {
  if(!e || !e.alive) return;
  const ratio = toughnessRatioOf(e.maxToughness||30);
  const newDebuffs = [];
  e.debuffs.forEach(d=>{
    if(d.type?.startsWith("status_")){
      const elem = d.elem;
      let dotDmg = 0;
      if(elem==="physical"){
        const rawBase = e.isElite ? 0.07*e.maxHp : 0.16*e.maxHp;
        const cap = 2*charLvValue(CHAR_LV)*ratio;
        const base = Math.min(rawBase, cap);
        dotDmg = calcDotBase(base/charLvValue(CHAR_LV), e.lv||60, 0,0, e.elemRes?.physical??0, 0, e.broken?1.0:0.9);
      } else if(elem==="fire"){
        dotDmg = calcDotBase(1, e.lv||60, 0,0, e.elemRes?.fire??0, 0, e.broken?1.0:0.9);
      } else if(elem==="lightning"){
        dotDmg = calcDotBase(2, e.lv||60, 0,0, e.elemRes?.lightning??0, 0, e.broken?1.0:0.9);
      } else if(elem==="wind"){
        const stacks = d.stacks||1;
        dotDmg = calcDotBase(1*stacks, e.lv||60, 0,0, e.elemRes?.wind??0, 0, e.broken?1.0:0.9);
      } else if(elem==="quantum"){
        const stacks = d.stacks||1;
        dotDmg = calcDotBase(0.6*stacks*ratio, e.lv||60, 0,0, e.elemRes?.quantum??0, 0, e.broken?1.0:0.9);
      }
      if(dotDmg>0){
        e.hp = Math.max(0, e.hp-dotDmg);
        s.log = addLog(s.log, `  ${ELEM_STATUS[elem]?.name||elem}: ${e.name}に${fmt(dotDmg)}dmg`, "warn");
        if(e.hp<=0) e.alive=false;
      }
    }
    const turnsLeft = d.turns-1;
    if(turnsLeft>0) newDebuffs.push({...d, turns:turnsLeft});
    else if(d.type?.startsWith("status_")){
      s.log = addLog(s.log, `  ${ELEM_STATUS[d.elem]?.name||""}解除: ${e.name}`, "buff");
      if(d.elem==="ice" && s.avs && s.avs[e.id]!==undefined){
        s.avs[e.id] = Math.floor(s.avs[e.id]*0.5);
      }
      if(d.elem==="imaginary"){
        e.imaginarySpdDown = false;
      }
    }
  });
  e.debuffs = newDebuffs;
  if(e.broken){
    e.brokenTurns = (e.brokenTurns||0)-1;
    if(e.brokenTurns<=0){
      e.broken=false; e.toughness=e.maxToughness;
      s.log = addLog(s.log, `  🔄 ${e.name} 靭性回復・弱点撃破解除`, "buff");
    }
  }
};
