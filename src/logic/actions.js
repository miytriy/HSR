import { addLog, fmt, gainEP, roll } from "./calc.js";
import { applyOumaLC, dmgToEnemy, healParty, hitTough, partyDmgBonus, tickEnemyStatus, updateZiranLC } from "./effects.js";
import { CHAR_SPD, ENEMY_IDS, ROUND_KEY, SARAN_SPD, adjIds, advanceAV, advanceRoundBoundary, pickTauntWeighted } from "./state.js";

export function applyPlayerAction(s, charId, actionId, targetId) {
  const c=s.chars[charId];
  const partyIds = s.partyIds || ["ziran","saki","ouma"];
  const alive=()=>ENEMY_IDS.map(id=>s.enemies[id]).filter(e=>e.alive);
  const target=()=>{ const t=s.enemies[targetId]; return t&&t.alive?t:alive()[0]; };
  const killCheck=e=>{ if(e.hp<=0) e.alive=false; };

  if(charId==="ziran"){
    const xMult  = 1+(c.xBonusLC||0.20)+c.buffs.reduce((a,b)=>a+(b.type==="xUp"?(b.value||0):0),0);
    const igDef  = c.ignoreDef||0.30;
    const dmgB   = partyDmgBonus(c,s)+((c.lcDmgStack||0)*0.10);

    if(actionId==="normal"){
      const ep=gainEP(c,20); s.sp=Math.min(5,s.sp+1);
      const xPrev=c.x; c.x=Math.min(c.xMax,c.x+25); updateZiranLC(s,25);
      let total=0;
      alive().forEach(e=>{
        const d=dmgToEnemy(e,c.atk,0.80,"quantum",igDef,c.cr,c.cd,dmgB);
        e.hp=Math.max(0,e.hp-d); killCheck(e); total+=d;
      });
      s.log=addLog(s.log,`紫蘭: 通常攻撃(全体) → ${fmt(total)}dmg(量子) X:${xPrev}→${c.x} EP+${ep}`,"dmg");

    } else if(actionId==="skill"){
      const ep=gainEP(c,30); s.sp=Math.max(-2,s.sp-1);
      const xPrev=c.x; c.x=Math.min(c.xMax,c.x+35); updateZiranLC(s,35);
      const xEff=c.x*xMult; const t=target(); let total=0;
      s.ziranHits=[];
      const d1=dmgToEnemy(t,c.atk,xEff*0.006,"quantum",igDef,c.cr,c.cd,dmgB);
      t.hp=Math.max(0,t.hp-d1); total+=d1;
      s.ziranHits.push({enemyId:t.id,dmg:d1});
      killCheck(t);
      for(let i=0;i<2;i++){
        if(t.alive){
          const d2=dmgToEnemy(t,c.atk,xEff*0.002,"quantum",igDef,c.cr,c.cd,dmgB);
          t.hp=Math.max(0,t.hp-d2); total+=d2;
          s.ziranHits.push({enemyId:t.id,dmg:d2});
          killCheck(t);
        }
        const adjGroup=[];
        adjIds(targetId).forEach(aid=>{
          const ae=s.enemies[aid]; if(!ae||!ae.alive) return;
          const ad=dmgToEnemy(ae,c.atk,xEff*0.002,"quantum",igDef,c.cr,c.cd,dmgB);
          ae.hp=Math.max(0,ae.hp-ad); killCheck(ae); total+=ad;
          adjGroup.push({enemyId:ae.id,dmg:ad});
        });
        if(adjGroup.length) s.ziranHits.push(adjGroup);
      }
      s.log=addLog(s.log,`紫蘭: 戦闘スキル → ${fmt(total)}dmg(量子/拡散) X:${xPrev}→${c.x} EP+${ep}`,"dmg");

    } else if(actionId==="ult"){
      c.ep=0;
      const xPrev=c.x; c.x=Math.min(c.xMax,c.x+100); updateZiranLC(s,100);
      const xEff=c.x*xMult; const t=target(); let total=0;
      s.ziranHits=[];
      for(let i=0;i<2;i++){
        if(t.alive){
          const d1=dmgToEnemy(t,c.atk,xEff*0.008,"quantum",igDef,c.cr,c.cd,dmgB);
          t.hp=Math.max(0,t.hp-d1); total+=d1;
          s.ziranHits.push({enemyId:t.id,dmg:d1});
          killCheck(t);
        }
        const adjGroup=[];
        adjIds(targetId).forEach(aid=>{
          const ae=s.enemies[aid]; if(!ae||!ae.alive) return;
          const ad=dmgToEnemy(ae,c.atk,xEff*0.002,"quantum",igDef,c.cr,c.cd,dmgB);
          ae.hp=Math.max(0,ae.hp-ad); killCheck(ae); total+=ad;
          adjGroup.push({enemyId:ae.id,dmg:ad});
        });
        if(adjGroup.length) s.ziranHits.push(adjGroup);
      }
      const allGroup=[];
      alive().forEach(e=>{
        const d=dmgToEnemy(e,c.atk,xEff*0.012,"quantum",igDef,c.cr,c.cd,dmgB);
        e.hp=Math.max(0,e.hp-d); killCheck(e); total+=d;
        allGroup.push({enemyId:e.id,dmg:d});
      });
      if(allGroup.length) s.ziranHits.push(allGroup);
      gainEP(c,5,false);
      c.buffs=c.buffs.filter(b=>b.type!=="entry_atk");
      c.buffs.push({type:"entry_atk",label:"入場ATK+50%",turns:2,value:0.50});
      c.x=Math.min(c.xMax,c.x+20); updateZiranLC(s,20);
      s.log=addLog(s.log,`✨ 紫蘭: 必殺技! → ${fmt(total)}dmg X:${xPrev}→${c.x} EP+5 入場ATK+50%`,"ult");
    }

  } else if(charId==="saki"){
    const raiyuChar = s.chars[c.raiyu] || c;
    const raiyuAtk  = raiyuChar.atk * 1.15;
    const dmgB = partyDmgBonus(c,s);
    const pen = c.kekkai>0 ? 0.50 : 0;

    if(actionId==="normal"){
      const ep=gainEP(c,20); s.sp=Math.min(5,s.sp+1);
      const t=target();
      const d=dmgToEnemy(t, raiyuAtk, 1.0, "other", pen, c.cr, c.cd, dmgB);
      t.hp=Math.max(0,t.hp-d); hitTough(s,t,10,"other"); killCheck(t);
      s.log=addLog(s.log,`咲希: 通常攻撃 → ${t.name}に${fmt(d)}dmg(七彩) EP+${ep}`,"dmg");

    } else if(actionId==="skill"){
      const ep=gainEP(c,30); s.sp=Math.max(-2,s.sp-1);
      const raiyuId=s.selectedAllyTarget||partyIds[0]||"ziran";
      c.raiyu=raiyuId;
      c.hanabatake=3;
      const z=s.chars[raiyuId]||s.chars[partyIds[0]];
      if(z){
        z.buffs=z.buffs.filter(b=>b.type!=="raiyu_atk");
        z.buffs.push({type:"raiyu_atk",label:"頼友ATK+15%",turns:3,value:0.15});
      }
      partyIds.forEach(id=>{
        const ch=s.chars[id]; if(!ch) return;
        ch.buffs=ch.buffs.filter(b=>b.type!=="hanabatake_xup");
        ch.buffs.push({type:"hanabatake_xup",label:"花畑X上昇+10%",turns:3,value:0.10});
      });
      s.log=addLog(s.log,`咲希: 戦闘スキル → ${z?z.name:raiyuId}を頼友に指定・花畑(3T)獲得 全体与ダメ+40%・X上昇+10% EP+${ep}`,"buff");

    } else if(actionId==="resonance"){
      if(c.resonanceCharge<100){ s.log=addLog(s.log,`咲希: 共鳴スキル チャージ不足(${c.resonanceCharge}%)`,"warn"); return s; }
      const ep=gainEP(c,20); s.sp=Math.min(5,s.sp+1);
      c.resonanceCharge=0;
      ENEMY_IDS.forEach(id=>{
        const e=s.enemies[id]; if(!e.alive) return;
        e.debuffs=e.debuffs?e.debuffs.filter(d=>d.type!=="def_down"):[];
        e.debuffs.push({type:"def_down",label:"防御-15%",turns:2,value:0.15});
      });
      const defDown=0.15;
      const firstTarget=target();
      const bounceTargets=[firstTarget];
      for(let i=1;i<5;i++){
        const aliveEnemies=ENEMY_IDS.map(id=>s.enemies[id]).filter(e=>e.alive);
        bounceTargets.push(aliveEnemies[Math.floor(Math.random()*aliveEnemies.length)]);
      }
      let total=0;
      s.resonanceHits=[];
      bounceTargets.forEach((bt,i)=>{
        if(!bt||!bt.alive) return;
        const d=dmgToEnemy(bt, raiyuAtk, 1.0, "other", pen+defDown, c.cr, c.cd, dmgB);
        bt.hp=Math.max(0,bt.hp-d); hitTough(s,bt,5,"other"); total+=d;
        s.resonanceHits.push({enemyId:bt.id, dmg:d, hitIdx:i});
        if(bt.hp<=0) bt.alive=false;
      });
      s.log=addLog(s.log,`💠 咲希: 共鳴スキル → 敵防御-15%(2T) / ${fmt(total)}dmg(七彩×5バウンド) EP+${ep}`,"dmg");

    } else if(actionId==="ult"){
      c.ep=0;
      const raiyuId=s.selectedAllyTarget||partyIds[0]||"ziran";
      c.raiyu=raiyuId;
      c.kekkai=3;
      c.resonanceCharge=Math.min(100,c.resonanceCharge+15);
      const z=s.chars[raiyuId]||s.chars[partyIds[0]];
      if(z){
        z.buffs=z.buffs.filter(b=>b.type!=="raiyu_atk");
        z.buffs.push({type:"raiyu_atk",label:"頼友ATK+15%",turns:3,value:0.15});
      }
      partyIds.forEach(id=>{
        const ch=s.chars[id]; if(!ch) return;
        ch.buffs=ch.buffs.filter(b=>b.type!=="kekkai_xup");
        ch.buffs.push({type:"kekkai_xup",label:"結界X上昇+20%",turns:3,value:0.20});
      });
      const bonusX=z?Math.floor(z.x*0.50)||0:0;
      if(z && z.xMax!==undefined){ z.x=Math.min(z.xMax,z.x+bonusX); updateZiranLC(s,bonusX); }
      partyIds.forEach(id=>{
        const ch=s.chars[id]; if(!ch) return;
        ch.buffs=ch.buffs.filter(b=>b.type!=="kekkai_pen");
        ch.buffs.push({type:"kekkai_pen",label:"結界耐性貫通+25%",turns:3,value:0.25});
      });
      gainEP(c,5,false);
      s.log=addLog(s.log,`✨ 咲希: 必殺技! → 結界展開(3T) 全体耐性貫通+25%・X上昇+20% ${z?z.name:raiyuId}X+${bonusX} 共鳴+15% EP+5`,"ult");
    }

  } else if(charId==="ouma"){
    const dmgB=partyDmgBonus(c,s);
    if(actionId==="normal"){
      const ep=gainEP(c,20); s.sp=Math.min(5,s.sp+1);
      const t=target();
      const d=dmgToEnemy(t,c.maxHp*0.50,1,"wind",0,c.cr,c.cd,dmgB);
      t.hp=Math.max(0,t.hp-d); hitTough(s,t,10,"wind"); killCheck(t);
      s.log=addLog(s.log,`桜舞: 通常攻撃 → ${t.name}に${fmt(d)}dmg(風/HP50%) EP+${ep}`,"dmg");

    } else if(actionId==="skill"){
      const ep=gainEP(c,30); s.sp=Math.max(-2,s.sp-1);
      let totalDmg=0;
      const alive=()=>ENEMY_IDS.map(id=>s.enemies[id]).filter(e=>e.alive);
      alive().forEach(e=>{ const d=dmgToEnemy(e,c.maxHp*0.55,1,"wind",0,c.cr,c.cd,dmgB); e.hp=Math.max(0,e.hp-d); hitTough(s,e,15,"wind"); killCheck(e); totalDmg+=d; });
      const healBase=Math.floor(c.maxHp*0.30);
      healParty(s,healBase);
      s.log=addLog(s.log,`桜舞: 戦闘スキル → 全体${fmt(totalDmg)}dmg(風) / 全体+${fmt(healBase)}回復(星魂1最低HP+30%) EP+${ep}`,"heal");

    } else if(actionId==="ult"){
      c.ep=0; c.hasSaran=true;
      const alive=()=>ENEMY_IDS.map(id=>s.enemies[id]).filter(e=>e.alive);
      let totalDmg=0;
      alive().forEach(e=>{ const d=dmgToEnemy(e,c.maxHp*0.64,1,"wind",0,c.cr,c.cd,dmgB); e.hp=Math.max(0,e.hp-d); hitTough(s,e,10,"wind"); killCheck(e); totalDmg+=d; });
      const heal1=Math.floor(c.maxHp*0.45);
      healParty(s,heal1);
      const saranHeal=Math.floor(c.maxHp*0.15);
      Object.values(s.chars).forEach(ch=>{ ch.hp=Math.min(ch.maxHp,ch.hp+saranHeal); });
      Object.values(s.chars).forEach(ch=>{ gainEP(ch,5,false); });
      applyOumaLC(s);
      gainEP(c,5,false);
      if(!s.avs.saran) s.avs.saran=Math.ceil(10000/SARAN_SPD);
      s.log=addLog(s.log,`✨ 桜舞: 必殺技! → 連兎召喚 全体${fmt(totalDmg)}dmg +${fmt(heal1+saranHeal)}回復 全体EP+5`,"ult");
    }
  }

  // ─── ミロク専用アクション ───
  if(charId==="miroku"){
    const dmgB = partyDmgBonus(c,s);
    // 速度ボーナス(速度>180で超過分×1%、最大+20%)
    const spdBonus = Math.min(0.20, Math.max(0, (c.spd - 180) * 0.01));
    if(actionId==="normal"){
      const ep=gainEP(c,20); s.sp=Math.min(5,s.sp+1);
      // X+1 (4ターン)
      const xGain=1+(c.xValBonus||0);
      c.x=Math.min(c.xMax,c.x+xGain);
      c.buffs=c.buffs.filter(b=>b.type!=="miroku_x_normal");
      c.buffs.push({type:"miroku_x_normal",label:`X+${xGain}(通常)`,turns:4,value:xGain});
      const t=ENEMY_IDS.map(id=>s.enemies[id]).find(e=>e.alive);
      const tgt=s.enemies[s.selectedTarget]?.alive?s.enemies[s.selectedTarget]:t;
      if(tgt){
        const d=dmgToEnemy(tgt,c.atk,1.00,"wind",0,c.cr,c.cd,dmgB+spdBonus);
        tgt.hp=Math.max(0,tgt.hp-d); hitTough(s,tgt,10,"wind"); if(tgt.hp<=0) tgt.alive=false;
        s.log=addLog(s.log,`ミロク: 通常攻撃 → ${tgt.name}に${fmt(d)}dmg(風) X:${c.x} EP+${ep}`,"dmg");
      }
    } else if(actionId==="skill"){
      const ep=gainEP(c,30); s.sp=Math.max(-2,s.sp-1);
      // X+4 (4ターン)
      const xGain=4+(c.xValBonus||0);
      c.x=Math.min(c.xMax,c.x+xGain);
      c.buffs=c.buffs.filter(b=>b.type!=="miroku_x_skill");
      c.buffs.push({type:"miroku_x_skill",label:`X+${xGain}(スキル)`,turns:4,value:xGain});
      // 星魂2: X上昇率+20%(2T)
      c.buffs=c.buffs.filter(b=>b.type!=="miroku_sc2_xrate");
      c.buffs.push({type:"miroku_sc2_xrate",label:"SC2 X上昇率+20%",turns:2,value:0.20});
      let total=0;
      ENEMY_IDS.forEach(id=>{
        const e=s.enemies[id]; if(!e.alive) return;
        const d=dmgToEnemy(e,c.atk,1.60,"wind",0,c.cr,c.cd,dmgB+spdBonus);
        e.hp=Math.max(0,e.hp-d); hitTough(s,e,15,"wind"); if(e.hp<=0) e.alive=false; total+=d;
      });
      // リノセウスの行動順を100%早める（AVを半減）
      if(c.hasRhinoceros && s.avs["rhino"]!==undefined){
        s.avs["rhino"]=Math.floor(s.avs["rhino"]*0);
        s.log=addLog(s.log,`  🦏 リノセウスの行動順を100%早めた！`,"buff");
      }
      s.log=addLog(s.log,`ミロク: 戦闘スキル → 全体${fmt(total)}dmg(風) X:${c.x} EP+${ep}`,"dmg");
    } else if(actionId==="ult"){
      c.ep=0;
      // X+10 (5ターン)
      const xGain=10+(c.xValBonus||0);
      c.x=Math.min(c.xMax,c.x+xGain);
      c.buffs=c.buffs.filter(b=>b.type!=="miroku_x_ult");
      c.buffs.push({type:"miroku_x_ult",label:`X+${xGain}(必殺)`,turns:5,value:xGain});
      // リノセウス召喚/強化 (atk+20%, 2T) + 精霊スキル即発動
      c.hasRhinoceros=true;
      const rhinoBaseAtk = c.atk * (1 + c.x * 0.01 * (1+(c.xRateBonus||0.20)));
      c.rhinoAtk = rhinoBaseAtk * 1.20; // 必殺技でatk+20%
      c.buffs=c.buffs.filter(b=>b.type!=="miroku_ult_atkup");
      c.buffs.push({type:"miroku_ult_atkup",label:"必殺ATK+20%(リノ)",turns:2,value:0.20});
      // 星魂6: 耐性貫通+25%(2T)
      c.buffs=c.buffs.filter(b=>b.type!=="miroku_sc6_pen");
      c.buffs.push({type:"miroku_sc6_pen",label:"SC6 耐性貫通+25%",turns:2,value:0.25});
      if(!s.avs["rhino"]) s.avs["rhino"]=0; // 即発動
      s.log=addLog(s.log,`✨ ミロク: 必殺技! → リノセウス${c.hasRhinoceros?"強化":"召喚"}(ATK+20%,2T) X:${c.x} 精霊スキル即発動`,"ult");
      // 精霊スキルを即発動（AVが0で最優先になるのでresolveNextで拾われる）
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
  if(charId==="ziran"&&s.chars.ziran.lcDmgTurns>0){ s.chars.ziran.lcDmgTurns--; if(s.chars.ziran.lcDmgTurns===0) s.chars.ziran.lcDmgStack=0; }

  partyIds.forEach(id=>{
    const ch=s.chars[id]; if(!ch) return;
    if(ch.hp<=0&&!ch.ko){ ch.ko=true; ch.hp=0; delete s.avs[id]; s.koEverHappened=true; s.log=addLog(s.log,`💀 ${ch.name} が戦闘不能！`,"danger"); }
  });

  ENEMY_IDS.forEach(id=>{ tickEnemyStatus(s, s.enemies[id]); });

  s.avs=advanceAV(s.avs,charId,CHAR_SPD[charId]);
  ENEMY_IDS.forEach(id=>{ if(!s.enemies[id].alive) delete s.avs[id]; });
  s.log=addLog(s.log,`  ⏱ ${c.name} 次AV:${s.avs[charId]}`,"av");
  return s;
}

// リノセウス精霊スキル（通常戦）
export const RHINO_SPD = 115;
export function applyRhinoAction(s) {
  const m=s.chars.miroku; if(!m||!m.hasRhinoceros) return s;
  const dmgB=partyDmgBonus(m,s);
  const spdBonus=Math.min(0.20,Math.max(0,(m.spd-180)*0.01));
  // 自ターン開始時: atk = miroku.atk + X% (星魂1でxRateBonus=+20%追加済み)
  const xRate=(1+(m.xRateBonus||0.20));
  const rhinoAtk=m.atk*(1+m.x*0.01*xRate);
  m.rhinoAtk=rhinoAtk;
  // 耐性貫通(星魂6)
  const pen=m.buffs.find(b=>b.type==="miroku_sc6_pen")?.value||0;
  // 防御無視(星魂1)
  const igDef=0.10;
  // 精霊スキル: 単体に150%×7回バウンド(星魂4+1、星魂6+3 = 基本1+6=7回)
  const bounceCount=7;
  const alive=()=>ENEMY_IDS.map(id=>s.enemies[id]).filter(e=>e.alive);
  const aliveList=alive();
  if(!aliveList.length){ s.avs=advanceAV(s.avs,"rhino",RHINO_SPD); return s; }
  let total=0; s.rhinoHits=[];
  for(let i=0;i<bounceCount;i++){
    const targets=alive();
    if(!targets.length) break;
    const tgt=targets[Math.floor(Math.random()*targets.length)];
    const d=dmgToEnemy(tgt,rhinoAtk,1.50,"wind",igDef+pen,m.cr,m.cd,dmgB+spdBonus);
    tgt.hp=Math.max(0,tgt.hp-d); hitTough(s,tgt,5,"wind"); if(tgt.hp<=0) tgt.alive=false;
    total+=d; s.rhinoHits.push({enemyId:tgt.id,dmg:d,hitIdx:i});
    gainEP(m,10,false);
  }
  s.log=addLog(s.log,`🦏 リノセウス: 精霊スキル × ${bounceCount}バウンド → ${fmt(total)}dmg(風) EP+${bounceCount*10}`,"dmg");
  // ターン終了時: rhinoAtkを0に（次のターン開始時に再計算）
  m.rhinoAtk=0;
  s.avs=advanceAV(s.avs,"rhino",RHINO_SPD);
  return s;
}

export function applySaranAction(s) {
  const o=s.chars.ouma;
  const heal=Math.floor(o.maxHp*0.15);
  Object.values(s.chars).forEach(ch=>{ ch.hp=Math.min(ch.maxHp,ch.hp+heal); });
  Object.values(s.chars).forEach(ch=>{ gainEP(ch,5,false); });
  applyOumaLC(s);
  s.log=addLog(s.log,`🐰 連兎: 全体+${fmt(heal)}回復 全体EP+5 与ダメバフUp`,"heal");
  s.avs=advanceAV(s.avs,"saran",SARAN_SPD);
  return s;
}

export function applyEnemyAction(s, eid) {
  const e=s.enemies[eid];
  if(!e||!e.alive) return s;
  const partyIds = s.partyIds || ["ziran","saki","ouma"];
  const alive = partyIds.filter(id=>s.chars[id] && s.chars[id].hp>0 && !s.chars[id].ko);
  if(!alive.length) return s;
  const tid=pickTauntWeighted(alive, s.chars);
  const tc=s.chars[tid];
  const dmg=Math.floor(e.atk*(0.8+Math.random()*0.4));
  tc.hp=Math.max(0,tc.hp-dmg);
  if(tc.hp<=0 && !tc.ko){
    tc.ko=true; tc.hp=0;
    delete s.avs[tc.id];
    s.koEverHappened=true;
    s.log=addLog(s.log,`💀 ${tc.name} が戦闘不能！`,"danger");
  }
  const ep=tc.ko?0:gainEP(tc,5,true);
  s.lastHitCharId = tid;
  s.hitSeq = (s.hitSeq||0)+1;
  s.log=addLog(s.log,`⚡ ${e.name}: さあ！動くんだ！ → ${tc.name}に${fmt(dmg)}dmg(雷)${ep>0?` EP+${ep}(被弾)`:""}`,"enemy-dmg");
  if(!tc.ko && roll(0.70)){
    tc.debuffs=tc.debuffs.filter(d=>d.type!=="shock");
    tc.debuffs.push({type:"shock",label:"感電",turns:2});
    s.log=addLog(s.log,`  ⚡ ${tc.name} 感電(2T)`,"warn");
  }
  s.avs=advanceAV(s.avs,eid,e.spd);
  return s;
}

export function resolveNext(s) {
  const partyIds = s.partyIds || ["ziran","saki","ouma"];
  const keys=[
    ...partyIds.filter(id=>!s.chars[id]?.ko),
    ...ENEMY_IDS.filter(id=>s.enemies[id].alive),
    ...(s.chars.ouma?.hasSaran&&s.avs.saran!==undefined?["saran"]:[]),
    ...(s.chars.miroku?.hasRhinoceros&&s.avs.rhino!==undefined?["rhino"]:[]),
    ROUND_KEY,
  ];
  const rel=Object.fromEntries(Object.entries(s.avs).filter(([k])=>keys.includes(k)));
  if(!Object.keys(rel).length) return s;
  const id=Object.entries(rel).reduce((a,b)=>a[1]<=b[1]?a:b)[0];
  const minAv=s.avs[id];
  Object.keys(s.avs).forEach(k=>{ s.avs[k]-=minAv; });

  if(id===ROUND_KEY){
    s = advanceRoundBoundary(s);
    if(s.gameOver) return s;
    return resolveNext(s);
  }

  s.activeId=id;
  if(partyIds.includes(id)) s.log=addLog(s.log,`▶ ${s.chars[id].name} の番！(AV:${Math.ceil(minAv)})`,"player");
  return s;
}
