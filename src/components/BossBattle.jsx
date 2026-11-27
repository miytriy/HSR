import { useState, useRef, useEffect } from "react";
import { BossReport } from "./BossReport.jsx";
import { BLADE_ID, BLADE_SPD, BOSS_ID, BOSS_SPD, applyBladeAction, applyBossAction, applyPlayerActionBoss, applySaranActionBoss, mkStateBoss, resolveNextBoss } from "../logic/boss.js";
import { addLog, clone, fmt } from "../logic/calc.js";
import { saveBattleRating } from "../logic/ratings.js";
import { CHAR_SPD, MAX_ROUNDS, ROUND_KEY, ROUND_LEN, calcStarRating, resolvePartyIds } from "../logic/state.js";
import { ELEM_COLORS } from "../styles/theme.js";

export function BossBattle({ diff="Normal", party=["ziran","saki","ouma"], onBack }) {
  const partyIds = resolvePartyIds(party);
  const [state,setState]=useState(()=>mkStateBoss(partyIds,diff));
  const [chainBusy,setChainBusy]=useState(false);
  const [enemyRunning,setEnemyRunning]=useState(false);
  const [dmgPopups,setDmgPopups]=useState([]);
  const [totalActionDmg,setTotalActionDmg]=useState(null);
  const totalDmgTimer=useRef(null);
  const [selectedAction,setSelectedAction]=useState("normal");
  const [allyTarget,setAllyTarget]=useState(partyIds[0]||"ziran");
  const [ultPending,setUltPending]=useState(null);
  const [announcement,setAnnouncement]=useState(null);
  const announcementTimer=useRef(null);
  const [hitFlash,setHitFlash]=useState({});
  const hitFlashTimers=useRef({});
  const chainTimerRef=useRef(null);
  const pausedRef=useRef(false);
  const [reportOpen,setReportOpen]=useState(false);
  const [reportTab,setReportTab]=useState("ally");
  const [reportCharId,setReportCharId]=useState(null);

  useEffect(()=>{ if(partyIds.includes(state.activeId)&&!ultPending){ setSelectedAction("normal"); setAllyTarget(partyIds[0]||"ziran"); } },[state.activeId,ultPending]);
  useEffect(()=>{ showAnnouncement(`ボス戦開始 [${diff}]`); },[]);

  const showAnnouncement=(text)=>{ if(announcementTimer.current) clearTimeout(announcementTimer.current); setAnnouncement({text,key:Date.now()}); announcementTimer.current=setTimeout(()=>setAnnouncement(null),2000); };
  const triggerHitFlash=(unitId)=>{ setHitFlash(prev=>({...prev,[unitId]:(prev[unitId]||0)+1})); if(hitFlashTimers.current[unitId]) clearTimeout(hitFlashTimers.current[unitId]); hitFlashTimers.current[unitId]=setTimeout(()=>{ setHitFlash(prev=>{const n={...prev};delete n[unitId];return n;}); },400); };
  const showDmgPopup=(value,isCrit,targetId,elem="physical",offsetX=0,offsetY=0)=>{ const id=Date.now()+Math.random(); setDmgPopups(prev=>[...prev,{id,value,isCrit,targetId,elem,offsetX,offsetY}]); setTimeout(()=>setDmgPopups(prev=>prev.filter(p=>p.id!==id)),2200); };
  const startTotalDmg=()=>{ setTotalActionDmg(0); if(totalDmgTimer.current) clearTimeout(totalDmgTimer.current); };
  const addTotalDmg=(dmg)=>{ setTotalActionDmg(prev=>(prev===null?dmg:prev+dmg)); if(totalDmgTimer.current) clearTimeout(totalDmgTimer.current); totalDmgTimer.current=setTimeout(()=>setTotalActionDmg(null),3500); };
  const openReport=(tab="ally",charId=null)=>{ pausedRef.current=true; if(chainTimerRef.current) clearTimeout(chainTimerRef.current); setReportTab(tab); setReportCharId(charId); setReportOpen(true); };
  const closeReport=()=>{ setReportOpen(false); pausedRef.current=false; setState(prev=>{ const isAuto=prev.activeId===BOSS_ID||prev.activeId===BLADE_ID||prev.activeId==="saran"; if(isAuto&&!prev.gameOver&&!prev.victory){ setChainBusy(true); setEnemyRunning(true); setTimeout(()=>processAutoChain(prev,600),300); } return prev; }); };

  const processAutoChain=(s,delay=1000)=>{
    if(pausedRef.current) return; setEnemyRunning(true);
    const timer=setTimeout(()=>{
      if(pausedRef.current) return;
      let ns=clone(s); const aid=ns.activeId;
      const prevCharHps=Object.fromEntries(partyIds.map(id=>[id,ns.chars[id]?.hp||0]));
      if(aid===BOSS_ID) ns=applyBossAction(ns);
      else if(aid===BLADE_ID) ns=applyBladeAction(ns);
      else if(aid==="saran") ns=applySaranActionBoss(ns);
      partyIds.forEach(id=>{ if(ns.chars[id]?.hp<prevCharHps[id]) triggerHitFlash(id); });
      if(partyIds.every(id=>ns.chars[id]?.ko)){ ns.gameOver=true; ns.log=addLog(ns.log,"💀 全滅...","danger"); showAnnouncement("戦闘終了"); setState(ns); setChainBusy(false); setEnemyRunning(false); return; }
      ns=resolveNextBoss(ns);
      const nextIsAuto=ns.activeId===BOSS_ID||ns.activeId===BLADE_ID||ns.activeId==="saran";
      if(nextIsAuto){ if(ns.activeId===BOSS_ID) ns.log=addLog(ns.log,`⏳ カカリア が攻撃準備中...`,"warn"); else if(ns.activeId===BLADE_ID) ns.log=addLog(ns.log,`⏳ 氷刃 が攻撃準備中...`,"warn"); setState(ns); if(!pausedRef.current) processAutoChain(ns,ns.activeId==="saran"?400:1000); }
      else { setState(ns); setChainBusy(false); setEnemyRunning(false); }
    },delay); chainTimerRef.current=timer;
  };

  const _finishAction=(s,isUltBonusTurn=false)=>{
    if(!s.boss.alive){ s.victory=true; s.stars=calcStarRating(s); s.log=addLog(s.log,`🎉 カカリア撃破！完全勝利！ 評価:${"⭐".repeat(s.stars)}${"☆".repeat(3-s.stars)}`,"victory"); showAnnouncement("戦闘終了"); setState(s); setChainBusy(false); saveBattleRating("boss",diff,s.stars); return; }
    if(s.blade&&!s.blade.alive) delete s.avs[BLADE_ID];
    s=resolveNextBoss(s);
    const nextIsAuto=s.activeId===BOSS_ID||s.activeId===BLADE_ID||s.activeId==="saran";
    if(nextIsAuto){ if(s.activeId===BOSS_ID) s.log=addLog(s.log,`⏳ カカリア が攻撃準備中...`,"warn"); setState(s); processAutoChain(s,s.activeId==="saran"?400:1000); }
    else { setState(s); setChainBusy(false); }
  };

  const handleAction=(charId,actionId)=>{
    if(chainBusy||state.gameOver||state.victory) return;
    if(state.activeId!==charId) return;
    if(actionId==="ult"){ const c=state.chars[charId]; if(!c||c.ep<c.maxEp) return; setUltPending(charId); setSelectedAction("ult"); setState(prev=>{ const s=clone(prev); s.log=addLog(s.log,`⚡ ${s.chars[charId].name}: 必殺技チャージ！（追加ターン）`,"ult"); return s; }); return; }
    setChainBusy(true); let s=clone(state); s.selectedAllyTarget=allyTarget;
    const prevBossHp=s.boss.hp; const prevBladeHp=s.blade?.hp||0;
    s=applyPlayerActionBoss(s,charId,actionId);
    const isCrit=Math.random()<(state.chars[charId]?.cr||0); const elemMap={ziran:"quantum",saki:"other",ouma:"wind"}; const elem=elemMap[charId]||"physical";
    startTotalDmg(); let delay=0; const popOffset=(i)=>({ox:Math.round((Math.random()-0.5)*46),oy:-i*34-Math.round(Math.random()*10)});
    if(charId==="saki"&&actionId==="resonance"&&s.resonanceHits){ s.resonanceHits.forEach((hit,i)=>{ setTimeout(()=>{ const{ox,oy}=popOffset(i); showDmgPopup(hit.dmg,isCrit,hit.targetId,elem,ox,oy); addTotalDmg(hit.dmg); triggerHitFlash(hit.targetId); },delay); delay+=150; }); }
    else if(charId==="ziran"&&(actionId==="skill"||actionId==="ult")&&s.ziranHits){ s.ziranHits.forEach((hit,i)=>{ setTimeout(()=>{ if(Array.isArray(hit)) hit.forEach((h,j)=>{ const{ox,oy}=popOffset(i+j); showDmgPopup(h.dmg,isCrit,h.targetId,elem,ox,oy); addTotalDmg(h.dmg); }); else { const{ox,oy}=popOffset(i); showDmgPopup(hit.dmg,isCrit,hit.targetId,elem,ox,oy); addTotalDmg(hit.dmg); } (Array.isArray(hit)?hit:[hit]).forEach(h=>triggerHitFlash(h.targetId)); },delay); delay+=160; }); }
    else { const bossDmg=Math.max(0,prevBossHp-s.boss.hp); if(bossDmg>0){ setTimeout(()=>{ showDmgPopup(bossDmg,isCrit,BOSS_ID,elem,0,0); addTotalDmg(bossDmg); triggerHitFlash(BOSS_ID); },delay); delay+=120; } if(s.blade){ const bladeDmg=Math.max(0,prevBladeHp-(s.blade?.hp||0)); if(bladeDmg>0){ setTimeout(()=>{ showDmgPopup(bladeDmg,isCrit,BLADE_ID,elem,0,0); addTotalDmg(bladeDmg); triggerHitFlash(BLADE_ID); },delay); } } }
    _finishAction(s);
  };

  const handleUltFire=(charId)=>{
    if(chainBusy||state.gameOver||state.victory) return; if(ultPending!==charId) return;
    setUltPending(null); setSelectedAction("normal"); setChainBusy(true);
    let s=clone(state); s.selectedAllyTarget=allyTarget;
    const prevBossHp=s.boss.hp; const prevBladeHp=s.blade?.hp||0;
    s=applyPlayerActionBoss(s,charId,"ult");
    const isCrit=Math.random()<(state.chars[charId]?.cr||0); const elemMap={ziran:"quantum",saki:"other",ouma:"wind"}; const elem=elemMap[charId]||"physical";
    startTotalDmg(); let delay=0; const popOffset=(i)=>({ox:Math.round((Math.random()-0.5)*46),oy:-i*34-Math.round(Math.random()*10)});
    if(charId==="ziran"&&s.ziranHits){ s.ziranHits.forEach((hit,i)=>{ setTimeout(()=>{ if(Array.isArray(hit)) hit.forEach((h,j)=>{ const{ox,oy}=popOffset(i+j); showDmgPopup(h.dmg,isCrit,h.targetId,elem,ox,oy); addTotalDmg(h.dmg); }); else { const{ox,oy}=popOffset(i); showDmgPopup(hit.dmg,isCrit,hit.targetId,elem,ox,oy); addTotalDmg(hit.dmg); } (Array.isArray(hit)?hit:[hit]).forEach(h=>triggerHitFlash(h.targetId)); },delay); delay+=160; }); }
    else { const bossDmg=Math.max(0,prevBossHp-s.boss.hp); if(bossDmg>0){ setTimeout(()=>{ showDmgPopup(bossDmg,isCrit,BOSS_ID,elem,0,0); addTotalDmg(bossDmg); triggerHitFlash(BOSS_ID); },delay); } if(s.blade){ const bladeDmg=Math.max(0,prevBladeHp-(s.blade?.hp||0)); if(bladeDmg>0){ setTimeout(()=>{ showDmgPopup(bladeDmg,isCrit,BLADE_ID,elem,0,0); addTotalDmg(bladeDmg); triggerHitFlash(BLADE_ID); },delay); } } }
    s.activeId=charId; s.log=addLog(s.log,`▶ ${s.chars[charId].name} の番！（元のターン継続）`,"player"); _finishAction(s,true);
  };

  const handleUltFromCard=(charId)=>{ if(state.gameOver||state.victory) return; const c=state.chars[charId]; if(!c||c.ko||c.hp<=0||c.ep<c.maxEp) return; if(ultPending===charId){ handleUltFire(charId); return; } if(state.activeId===charId&&!chainBusy){ handleAction(charId,"ult"); return; } if(chainBusy) return; setUltPending(charId); setSelectedAction("ult"); setState(prev=>{ const s=clone(prev); s.log=addLog(s.log,`⚡ ${s.chars[charId].name}: 必殺技チャージ！`,"ult"); return s; }); };

  const reset=()=>{ pausedRef.current=false; if(chainTimerRef.current) clearTimeout(chainTimerRef.current); if(announcementTimer.current) clearTimeout(announcementTimer.current); setChainBusy(false); setEnemyRunning(false); setHitFlash({}); setDmgPopups([]); setTotalActionDmg(null); setUltPending(null); setReportOpen(false); setState(mkStateBoss(partyIds,diff)); setTimeout(()=>showAnnouncement(`ボス戦開始 [${diff}]`),100); };

  const {chars,boss,blade,sp,activeId,avs}=state;
  const isEnemyTurn=activeId===BOSS_ID||activeId===BLADE_ID||activeId==="saran";
  const sakiHana=chars.saki?.hanabatake>0; const sakiKekkai=chars.saki?.kekkai>0; const ziranLC=chars.ziran?.lcDmgStack||0;
  const selChar=activeId&&chars[activeId]?chars[activeId]:null;

  const avUnits=[
    ...partyIds.filter(id=>!chars[id]?.ko).map(id=>({id,icon:chars[id].icon,color:chars[id].color,av:avs[id]??0,isEnemy:false,isFuture:false})),
    ...(boss.alive?[{id:BOSS_ID,icon:boss.icon,color:boss.color,av:avs[BOSS_ID]??0,isEnemy:true,isFuture:false}]:[]),
    ...(blade&&blade.alive?[{id:BLADE_ID,icon:blade.icon,color:blade.color,av:avs[BLADE_ID]??0,isEnemy:true,isFuture:false}]:[]),
    ...(chars.ouma?.hasSaran&&avs.saran!==undefined?[{id:"saran",icon:"🐰",color:"#86efac",av:avs.saran,isEnemy:false,isFuture:false}]:[]),
    ...(avs[ROUND_KEY]!==undefined?[{id:ROUND_KEY,isHourglass:true,av:avs[ROUND_KEY],roundsRemaining:Math.max(0,MAX_ROUNDS-(state.currentRound||1))}]:[]),
  ].filter(u=>avs[u.id]!==undefined).sort((a,b)=>a.av-b.av).slice(0,20);

  let avUnitsWithFuture=avUnits;
  if(partyIds.includes(activeId)&&!ultPending&&selectedAction!=="ult"){
    const charId=activeId; const spd=CHAR_SPD[charId]||100;
    const simAvs={...avs}; simAvs[charId]=Math.ceil(10000/spd);
    const spdOf=id=>CHAR_SPD[id]||(id===BOSS_ID?BOSS_SPD:id===BLADE_ID?BLADE_SPD:85);
    const validIds=[...partyIds.filter(id=>!chars[id]?.ko),...(boss.alive?[BOSS_ID]:[]),...(blade&&blade.alive?[BLADE_ID]:[]),...(chars.ouma?.hasSaran&&simAvs.saran!==undefined?["saran"]:[]),...(simAvs[ROUND_KEY]!==undefined?[ROUND_KEY]:[])].filter(id=>simAvs[id]!==undefined);
    const simOrder=[]; const workAvs={...simAvs};
    for(let step=0;step<20;step++){
      const nextId=validIds.reduce((a,b)=>(workAvs[a]??Infinity)<=(workAvs[b]??Infinity)?a:b);
      const nextAv=workAvs[nextId]; validIds.forEach(id=>{ workAvs[id]-=nextAv; });
      simOrder.push(nextId); if(nextId===charId) break;
      workAvs[nextId]=nextId===ROUND_KEY?ROUND_LEN:Math.ceil(10000/spdOf(nextId));
    }
    const futureRank=simOrder.indexOf(charId);
    if(futureRank>=0){
      const futureAv=simAvs[charId]; const insertAt=Math.min(futureRank+1,20);
      const futureUnit={id:charId,icon:chars[charId].icon,color:chars[charId].color,av:futureAv,isEnemy:false,isFuture:true};
      const result=[...avUnits]; result.splice(insertAt,0,futureUnit);
      avUnitsWithFuture=result.slice(0,20);
    }
  }
  const avUnitsDisplay=avUnitsWithFuture.slice(0,20);

  if(reportOpen) return <BossReport state={state} onClose={closeReport} initialTab={reportTab} initialCharId={reportCharId}/>;

  return(
    <div style={{fontFamily:"'Noto Sans JP',sans-serif",background:"linear-gradient(180deg,#0d1020 0%,#080c14 100%)",color:"#e2e8f0",height:"100%",overflow:"hidden",display:"flex",flexDirection:"column",position:"relative",userSelect:"none"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Rajdhani:wght@600;700&display=swap');
        @keyframes enemyActBoss{0%,100%{opacity:1}50%{opacity:.6}}
        @keyframes warnPulseBoss{0%,100%{opacity:.7}50%{opacity:1}}
        @keyframes futureBlink{0%,100%{opacity:1;box-shadow:0 0 8px #a78bfa88}50%{opacity:0.3;box-shadow:none}}
        @keyframes hitShake{
          0%{transform:translateX(0);filter:brightness(1) sepia(0) saturate(1) hue-rotate(0deg) drop-shadow(0 0 0 rgba(239,68,68,0));}
          12%{transform:translateX(-9px);filter:brightness(1.5) sepia(1) saturate(8) hue-rotate(-50deg) drop-shadow(0 0 10px #ef4444);}
          28%{transform:translateX(8px);filter:brightness(1.5) sepia(1) saturate(8) hue-rotate(-50deg) drop-shadow(0 0 10px #ef4444);}
          44%{transform:translateX(-6px);filter:brightness(1.35) sepia(1) saturate(7) hue-rotate(-50deg) drop-shadow(0 0 8px #ef4444);}
          60%{transform:translateX(4px);filter:brightness(1.25) sepia(0.8) saturate(5) hue-rotate(-50deg) drop-shadow(0 0 6px #ef4444);}
          80%{transform:translateX(-2px);filter:brightness(1.1) sepia(0.4) saturate(2) hue-rotate(-20deg) drop-shadow(0 0 3px rgba(239,68,68,0.5));}
          100%{transform:translateX(0);filter:brightness(1) sepia(0) saturate(1) hue-rotate(0deg) drop-shadow(0 0 0 rgba(239,68,68,0));}
        }
        @keyframes hitFlashAnim{0%{background:rgba(239,68,68,0.0);}20%{background:rgba(239,68,68,0.55);}60%{background:rgba(239,68,68,0.35);}100%{background:rgba(239,68,68,0.0);}}
        @keyframes announceFade{0%{opacity:0;transform:translate(-50%,-50%) scale(0.7);}15%{opacity:1;transform:translate(-50%,-50%) scale(1.05);}25%,75%{opacity:1;}100%{opacity:0;}}
        @keyframes dmgFloat{0%{opacity:0;transform:translateX(-50%) scale(0.7);}15%{opacity:1;transform:translateX(-50%) scale(1.1);}40%{opacity:1;}100%{opacity:0;}}
        @keyframes ultCardGlow{0%,100%{box-shadow:0 0 10px #a78bfa66}50%{box-shadow:0 0 22px #a78bfabb}}
        @keyframes bossCharge{0%,100%{box-shadow:0 0 10px rgba(96,165,250,0.3)}50%{box-shadow:0 0 30px rgba(96,165,250,0.8)}}
        *{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#2a2a55;border-radius:2px}
      `}</style>

      {/* 上部 AV + ヘッダー */}
      <div style={{display:"flex",alignItems:"flex-start",gap:6,padding:"6px 8px 4px",background:"linear-gradient(180deg,rgba(0,0,0,0.7),transparent)",position:"relative",zIndex:10,flexShrink:0}}>
        <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:46,maxHeight:198,overflowY:"auto",overflowX:"hidden"}}>
          {avUnitsDisplay.map((u,i)=>{
            if(u.isHourglass) return(<div key={u.id} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(96,165,250,0.15)",border:"1px solid rgba(96,165,250,0.4)",borderRadius:6,padding:"2px 5px"}}><span style={{fontSize:"0.7rem"}}>⌛</span><div style={{flex:1,height:1,background:"rgba(96,165,250,0.3)"}}/><span style={{fontSize:"0.48rem",color:"#93c5fd",minWidth:28,textAlign:"right",fontWeight:700}}>{u.roundsRemaining}|{Math.ceil(u.av)}</span></div>);
            const isCurrent=i===0&&!u.isFuture; const isFB=u.isFuture;
            return(<div key={u.id+i+(u.isFuture?"_f":"")} style={{display:"flex",alignItems:"center",gap:4,background:isCurrent?"rgba(251,191,36,0.25)":isFB?"rgba(167,139,250,0.15)":"rgba(0,0,0,0.4)",border:`1px solid ${isCurrent?"#fbbf24":isFB?"#a78bfa":"rgba(255,255,255,0.08)"}`,borderRadius:6,padding:"2px 5px",animation:isFB?"futureBlink 0.7s ease-in-out infinite":"none"}}>
              <span style={{fontSize:"0.75rem"}}>{u.icon}</span>
              <div style={{flex:1,height:3,background:"rgba(255,255,255,0.1)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.max(5,100-u.av/2)}%`,background:isFB?"#a78bfa":u.isEnemy?"#f9a8d4":u.color,borderRadius:2}}/></div>
              <span style={{fontSize:"0.48rem",color:isCurrent?"#fbbf24":isFB?"#a78bfa":"#4b5563",minWidth:16,textAlign:"right"}}>{Math.round(u.av)}</span>
            </div>);
          })}
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:3}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.35)",borderRadius:8,padding:"2px 10px",color:"#fca5a5",fontSize:"0.65rem",fontWeight:900,letterSpacing:1,fontFamily:"Rajdhani,sans-serif"}}>BOSS [{diff}]</div>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              {boss.charged&&<span style={{fontSize:"0.5rem",background:"rgba(96,165,250,0.2)",color:"#93c5fd",padding:"2px 6px",borderRadius:5,border:"1px solid rgba(96,165,250,0.5)",animation:"warnPulseBoss .6s ease-in-out infinite"}}>⚠️チャージ中</span>}
              <button onClick={()=>openReport("enemy")} style={{background:"rgba(147,197,253,0.1)",border:"1px solid rgba(147,197,253,0.35)",borderRadius:8,padding:"3px 10px",color:"#93c5fd",fontSize:"0.62rem",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>❄️ {boss.name}{blade&&blade.alive&&<span style={{fontSize:"0.5rem",color:"#bfdbfe88"}}>+ 🗡️氷刃</span>}<span style={{fontSize:"0.5rem",color:"#93c5fd88"}}>▸詳細</span></button>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
            <div style={{background:"linear-gradient(135deg,rgba(251,191,36,0.2),rgba(251,191,36,0.05))",border:"1px solid rgba(251,191,36,0.4)",borderRadius:8,padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:"0.58rem",color:"#94a3b8"}}>SP</span>
              <div style={{display:"flex",gap:3}}>{Array.from({length:5}).map((_,i)=><div key={i} style={{width:12,height:12,borderRadius:"50%",background:i<sp?"#fbbf24":"rgba(255,255,255,0.08)",border:`1px solid ${i<sp?"#f59e0b":"rgba(255,255,255,0.15)"}`,boxShadow:i<sp?"0 0 5px #fbbf2488":"none"}}/>)}</div>
            </div>
            {sakiHana&&<span style={{fontSize:"0.5rem",background:"rgba(249,168,212,0.15)",color:"#f9a8d4",padding:"2px 5px",borderRadius:5,border:"1px solid rgba(249,168,212,0.3)"}}>花畑 与ダメ+40%</span>}
            {sakiKekkai&&<span style={{fontSize:"0.5rem",background:"rgba(167,139,250,0.15)",color:"#a78bfa",padding:"2px 5px",borderRadius:5,border:"1px solid rgba(167,139,250,0.3)"}}>結界 耐性貫通+50%</span>}
            {ziranLC>0&&<span style={{fontSize:"0.5rem",background:"rgba(167,139,250,0.15)",color:"#a78bfa",padding:"2px 5px",borderRadius:5}}>紫蘭LC +{ziranLC*10}%</span>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
          {totalActionDmg!==null&&<div style={{background:"rgba(0,0,0,0.6)",border:"1px solid rgba(251,191,36,0.4)",borderRadius:8,padding:"3px 10px",textAlign:"right"}}><div style={{fontSize:"0.48rem",color:"#94a3b8",letterSpacing:1}}>総ダメージ</div><div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"1.1rem",fontWeight:900,color:"#fbbf24",lineHeight:1}}>{totalActionDmg.toLocaleString()}</div></div>}
          <div style={{display:"flex",gap:4}}>
            <button onClick={reset} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"#4b5563",padding:"4px 8px",borderRadius:7,fontSize:"0.6rem",cursor:"pointer"}}>🔄</button>
            {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"#94a3b8",padding:"4px 8px",borderRadius:7,fontSize:"0.6rem",cursor:"pointer"}}>◀ ロビー</button>}
          </div>
        </div>
      </div>

      {/* ボスフィールド */}
      <div style={{flex:1,position:"relative",overflow:"hidden",minHeight:0,background:"radial-gradient(ellipse at 50% 50%,rgba(30,30,80,0.4),transparent 70%)"}}>
        <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(255,255,255,0.01) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.01) 1px,transparent 1px)",backgroundSize:"40px 40px"}}/>
        <div style={{position:"absolute",top:8,left:0,right:0,display:"flex",justifyContent:"center",alignItems:"flex-start",gap:16,padding:"0 8px"}}>
          {boss.alive&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",position:"relative"}}>
              {hitFlash[BOSS_ID]&&<div key={hitFlash[BOSS_ID]} style={{position:"absolute",inset:0,borderRadius:8,animation:"hitFlashAnim 0.4s ease-out forwards",pointerEvents:"none",zIndex:5}}/>}
              <div style={{width:170,background:"rgba(0,0,0,0.7)",border:`1px solid ${activeId===BOSS_ID?"#93c5fd44":"rgba(255,255,255,0.1)"}`,borderRadius:6,padding:"5px 8px",marginBottom:4,animation:boss.charged?"bossCharge 0.8s ease-in-out infinite":"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:"0.62rem",color:"#93c5fd",fontWeight:900}}>{boss.name}{activeId===BOSS_ID&&" ▶"}{boss.charged&&" ⚠️"}</span><span style={{fontSize:"0.52rem",color:"#6b7280"}}>{fmt(boss.hp)}</span></div>
                <div style={{background:"rgba(0,0,0,0.5)",borderRadius:2,height:5,marginBottom:2,overflow:"hidden"}}><div style={{width:`${(boss.hp/boss.maxHp)*100}%`,height:"100%",background:boss.hp/boss.maxHp<0.3?"#ef4444":boss.hp/boss.maxHp<0.6?"#f97316":"#93c5fd",borderRadius:2,transition:"width .3s"}}/></div>
                <div style={{background:"rgba(0,0,0,0.5)",borderRadius:2,height:2,overflow:"hidden",marginBottom:3}}><div style={{width:`${(boss.toughness/boss.maxToughness)*100}%`,height:"100%",background:"#fb923c",borderRadius:2,transition:"width .3s"}}/></div>
                {boss.toughness<=0&&<div style={{fontSize:"0.42rem",color:"#f97316",textAlign:"center",marginBottom:2}}>靭性破壊</div>}
                <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{boss.debuffs.map((d,i)=><span key={i} style={{fontSize:"0.42rem",background:"rgba(239,68,68,0.2)",color:"#fca5a5",padding:"0 4px",borderRadius:3}}>{d.label}{d.turns}T</span>)}{boss.dmgUpPerFrozen>0&&<span style={{fontSize:"0.42rem",background:"rgba(96,165,250,0.2)",color:"#93c5fd",padding:"0 4px",borderRadius:3}}>凍結強化×{boss.dmgUpPerFrozen}</span>}</div>
              </div>
              <div style={{fontSize:"3.5rem",lineHeight:1,position:"relative",filter:activeId===BOSS_ID?"drop-shadow(0 0 12px #93c5fd)":boss.charged?"drop-shadow(0 0 20px #3b82f6)":"none",animation:activeId===BOSS_ID?"enemyActBoss 0.6s ease-in-out infinite":"none"}}>
                <span key={hitFlash[BOSS_ID]||0} style={{display:"inline-block",animation:hitFlash[BOSS_ID]?"hitShake 0.4s ease-out":"none"}}>{boss.icon}</span>
                {dmgPopups.filter(p=>p.targetId===BOSS_ID).map(p=>{ const ec2=ELEM_COLORS[p.elem]||ELEM_COLORS.physical; const isRainbow=p.elem==="other"; const rainbowGrad=p.isCrit?"linear-gradient(135deg,#ff0000,#ff7700,#ffff00,#00ff00,#00bfff,#8000ff,#ff00ff)":"linear-gradient(135deg,#7f0000,#7f3b00,#7f7f00,#007f00,#005f7f,#40007f,#7f007f)"; return(<div key={p.id} style={{position:"absolute",left:`calc(50% + ${p.offsetX||0}px)`,top:`calc(50% + ${p.offsetY||0}px)`,transform:"translateX(-50%) translateY(-50%)",pointerEvents:"none",zIndex:50,animation:"dmgFloat 2.2s ease-out forwards",textAlign:"center",whiteSpace:"nowrap"}}>{p.isCrit&&<div style={{fontSize:"0.55rem",fontWeight:900,letterSpacing:2,marginBottom:2,...(isRainbow?{background:"linear-gradient(90deg,#ff0000,#ff7700,#ffff00,#00ff00,#00bfff,#8000ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}:{color:ec2.crit,textShadow:`0 0 8px ${ec2.crit}`})}}>会心</div>}<div style={{fontFamily:"Rajdhani,sans-serif",fontSize:p.isCrit?"2.2rem":"1.4rem",fontWeight:900,lineHeight:1,...(isRainbow?{background:rainbowGrad,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}:{color:p.isCrit?ec2.crit:ec2.nonCrit,textShadow:p.isCrit?`0 0 20px ${ec2.crit},2px 2px 0 ${ec2.stroke}`:`2px 2px 0 rgba(0,0,0,0.9)`,WebkitTextStroke:`1px ${ec2.stroke}`})}}>{p.value.toLocaleString()}</div></div>); })}
              </div>
            </div>
          )}
          {blade&&blade.alive&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",position:"relative"}}>
              {hitFlash[BLADE_ID]&&<div key={hitFlash[BLADE_ID]} style={{position:"absolute",inset:0,borderRadius:8,animation:"hitFlashAnim 0.4s ease-out forwards",pointerEvents:"none",zIndex:5}}/>}
              <div style={{width:110,background:"rgba(0,0,0,0.7)",border:`1px solid ${activeId===BLADE_ID?"#bfdbfe44":"rgba(255,255,255,0.08)"}`,borderRadius:6,padding:"4px 6px",marginBottom:4}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:"0.54rem",color:"#bfdbfe",fontWeight:700}}>{blade.name}{activeId===BLADE_ID&&" ▶"}</span><span style={{fontSize:"0.48rem",color:"#6b7280"}}>{fmt(blade.hp)}</span></div>
                <div style={{background:"rgba(0,0,0,0.5)",borderRadius:2,height:4,overflow:"hidden",marginBottom:2}}><div style={{width:`${(blade.hp/blade.maxHp)*100}%`,height:"100%",background:"#bfdbfe",borderRadius:2,transition:"width .3s"}}/></div>
                <div style={{background:"rgba(0,0,0,0.5)",borderRadius:2,height:2,overflow:"hidden"}}><div style={{width:`${(blade.toughness/blade.maxToughness)*100}%`,height:"100%",background:"#fb923c",borderRadius:2,transition:"width .3s"}}/></div>
                {blade.toughness<=0&&<div style={{fontSize:"0.38rem",color:"#f97316",textAlign:"center"}}>靭性破壊</div>}
              </div>
              <div style={{fontSize:"2.5rem",lineHeight:1,position:"relative",filter:activeId===BLADE_ID?"drop-shadow(0 0 8px #bfdbfe)":"none",animation:activeId===BLADE_ID?"enemyActBoss 0.6s ease-in-out infinite":"none"}}>
                <span key={hitFlash[BLADE_ID]||0} style={{display:"inline-block",animation:hitFlash[BLADE_ID]?"hitShake 0.4s ease-out":"none"}}>{blade.icon}</span>
                {dmgPopups.filter(p=>p.targetId===BLADE_ID).map(p=>{ const ec2=ELEM_COLORS[p.elem]||ELEM_COLORS.physical; return(<div key={p.id} style={{position:"absolute",left:`calc(50% + ${p.offsetX||0}px)`,top:`calc(50% + ${p.offsetY||0}px)`,transform:"translateX(-50%) translateY(-50%)",pointerEvents:"none",zIndex:50,animation:"dmgFloat 2.2s ease-out forwards",textAlign:"center",whiteSpace:"nowrap"}}><div style={{fontFamily:"Rajdhani,sans-serif",fontSize:p.isCrit?"1.8rem":"1.2rem",fontWeight:900,color:p.isCrit?ec2.crit:ec2.nonCrit,lineHeight:1,WebkitTextStroke:`1px ${ec2.stroke}`}}>{p.value.toLocaleString()}</div></div>); })}
              </div>
            </div>
          )}
        </div>
        {isEnemyTurn&&<div style={{position:"absolute",top:6,left:0,right:0,display:"flex",justifyContent:"center",pointerEvents:"none"}}><div style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.4)",borderRadius:20,padding:"3px 14px",fontSize:"0.6rem",color:"#fca5a5",fontWeight:700,animation:"warnPulseBoss .8s ease-in-out infinite"}}>{activeId==="saran"?"🐰 連兎 行動中...":activeId===BLADE_ID?"🗡️ 氷刃 行動中...":"❄️ カカリア 行動中..."}</div></div>}
        {announcement&&<div key={announcement.key} style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:100,pointerEvents:"none",animation:"announceFade 2s ease-in-out forwards",textAlign:"center"}}><div style={{background:"rgba(0,0,0,0.75)",border:"2px solid rgba(239,68,68,0.6)",borderRadius:16,padding:"12px 28px",backdropFilter:"blur(6px)",boxShadow:"0 0 40px rgba(239,68,68,0.3)"}}><div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"1.4rem",fontWeight:900,color:"#fca5a5",letterSpacing:4,textShadow:"0 0 20px rgba(239,68,68,0.8)"}}>{announcement.text}</div></div></div>}
      </div>

      {/* 下部 */}
      <div style={{background:"linear-gradient(0deg,rgba(0,0,0,0.92),rgba(0,0,0,0.7))",borderTop:"1px solid rgba(255,255,255,0.08)",padding:"6px 6px 8px",flexShrink:0}}>
        <div style={{display:"flex",gap:5,marginBottom:6}}>
          {partyIds.map(charId=>{
            const c=chars[charId]; if(!c) return null;
            const isAct=activeId===charId; const canUlt=c.ep>=c.maxEp&&!c.ko;
            const frozen=c.debuffs.some(d=>d.type==="frozen"); const isFlashing=!!hitFlash[charId]; const isUltPending=ultPending===charId;
            const isFirst=partyIds[0]===charId;
            return(<div key={charId} style={{flex:1,position:"relative",background:c.ko?"rgba(0,0,0,0.6)":frozen?"rgba(96,165,250,0.08)":isAct?"rgba(251,191,36,0.1)":"rgba(255,255,255,0.04)",border:`1px solid ${c.ko?"#1f2035":frozen?"#67e8f966":isAct?"#fbbf24":c.color+"33"}`,borderRadius:10,padding:"6px 7px",opacity:c.ko?0.4:1,boxShadow:isAct?`0 0 12px rgba(251,191,36,0.2)`:canUlt?`0 0 10px ${c.color}44`:"none",overflow:"hidden"}}>
              {isFlashing&&<div key={hitFlash[charId]} style={{position:"absolute",inset:0,borderRadius:9,animation:"hitFlashAnim 0.4s ease-out forwards",pointerEvents:"none",zIndex:10}}/>}
              {isFirst&&<div style={{position:"absolute",top:3,left:4,fontSize:"0.38rem",color:"#fbbf24",fontWeight:900,zIndex:3}}>★</div>}
              {c.ko&&<div style={{position:"absolute",inset:0,borderRadius:9,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}><div style={{textAlign:"center"}}><div style={{fontSize:"1rem"}}>💀</div><div style={{fontSize:"0.5rem",color:"#ef4444",fontWeight:900}}>戦闘不能</div></div></div>}
              <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                <span style={{fontSize:"1rem"}}>{c.icon}</span>
                <div style={{flex:1}}><div style={{fontSize:"0.65rem",fontWeight:700,color:isAct?"#fbbf24":c.color}}>{c.name}</div><div style={{fontSize:"0.5rem",color:"#374151"}}>{c.role}</div></div>
                {isAct&&<div style={{fontSize:"0.46rem",background:"#fbbf24",color:"#0a0a1a",padding:"1px 4px",borderRadius:4,fontWeight:900}}>行動中</div>}
                {frozen&&!c.ko&&<div style={{fontSize:"0.46rem",background:"#67e8f9",color:"#0a0a1a",padding:"1px 3px",borderRadius:4}}>🧊凍結</div>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}><span style={{fontSize:"0.46rem",color:"#4b5563",width:11}}>HP</span><div style={{flex:1,background:"rgba(0,0,0,0.5)",borderRadius:2,height:5,overflow:"hidden"}}><div style={{width:`${(c.hp/c.maxHp)*100}%`,height:"100%",background:c.hp/c.maxHp<0.3?"#ef4444":c.color,borderRadius:2,transition:"width .3s"}}/></div><span style={{fontSize:"0.44rem",color:"#6b7280",minWidth:22,textAlign:"right"}}>{(c.hp/1000).toFixed(1)}k</span></div>
              <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:charId==="ziran"?2:0}}><span style={{fontSize:"0.46rem",color:"#4b5563",width:11}}>EP</span><div style={{flex:1,background:"rgba(0,0,0,0.5)",borderRadius:2,height:4,overflow:"hidden"}}><div style={{width:`${(c.ep/c.maxEp)*100}%`,height:"100%",background:canUlt?"#a78bfa":"#60a5fa",borderRadius:2,transition:"width .3s",boxShadow:canUlt?"0 0 6px #a78bfa":"none"}}/></div><span style={{fontSize:"0.44rem",color:canUlt?"#a78bfa":"#60a5fa",minWidth:22,textAlign:"right"}}>{c.ep}/{c.maxEp}</span></div>
              {charId==="ziran"&&c.x!==undefined&&<div style={{display:"flex",alignItems:"center",gap:3}}><span style={{fontSize:"0.46rem",color:"#a78bfa",width:11}}>X</span><div style={{flex:1,background:"rgba(0,0,0,0.5)",borderRadius:2,height:3,overflow:"hidden"}}><div style={{width:`${(c.x/c.xMax)*100}%`,height:"100%",background:"#c4b5fd",borderRadius:2,transition:"width .3s"}}/></div><span style={{fontSize:"0.44rem",color:"#a78bfa",minWidth:22,textAlign:"right"}}>{c.x}</span></div>}
              {charId==="saki"&&c.hanabatake>0&&<div style={{fontSize:"0.44rem",color:"#f9a8d4",marginTop:1}}>🌸花畑:{c.hanabatake}T</div>}
              {c.buffs.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:2,marginTop:2}}>{c.buffs.slice(0,2).map((b,i)=><span key={i} style={{fontSize:"0.42rem",background:"rgba(30,58,95,0.8)",color:"#93c5fd",padding:"1px 3px",borderRadius:3}}>{b.label.slice(0,5)}({b.turns}T)</span>)}</div>}
              {canUlt&&<button onClick={()=>handleUltFromCard(charId)} style={{width:"100%",marginTop:3,flexShrink:0,background:isUltPending?"linear-gradient(135deg,rgba(124,58,237,0.7),rgba(168,85,247,0.5))":"linear-gradient(135deg,rgba(124,58,237,0.4),rgba(168,85,247,0.3))",border:`1px solid ${isUltPending?"#c4b5fd":"#7c3aed"}`,borderRadius:5,padding:"3px 0",color:"#e9d5ff",fontSize:"0.54rem",fontWeight:700,cursor:"pointer",animation:"ultCardGlow 1.2s ease-in-out infinite"}}>{isUltPending?"✨ もう一度で発動":"✨ 必殺技"}</button>}
              {!canUlt&&<div style={{height:"24px",marginTop:3}}/>}
            </div>);
          })}
        </div>

        <div style={{display:"flex",gap:5,alignItems:"flex-start"}}>
          <div style={{flex:1,height:70,overflowY:"auto",background:"rgba(0,0,0,0.4)",borderRadius:7,padding:"4px 7px",fontSize:"0.6rem",lineHeight:1.6,border:"1px solid rgba(255,255,255,0.05)"}}>
            {state.log.slice(-30).map(l=>{ const C={info:"#374151",player:"#e2e8f0",dmg:"#fbbf24",heal:"#4ade80",buff:"#67e8f9","enemy-dmg":"#fca5a5",ult:"#c4b5fd",warn:"#fb923c",danger:"#ef4444",av:"#1f2037",victory:"#fbbf24"}; return <div key={l.id} style={{color:C[l.type]||"#4b5563"}}>{l.text}</div>; })}
          </div>
          {selChar&&!selChar.ko&&!selChar.debuffs?.some(d=>d.type==="frozen")&&(()=>{
            const canRes=selChar.id==="saki"&&(selChar.resonanceCharge||0)>=100;
            const acts={
              ziran:[{id:"normal",label:"通常攻撃",sub:"量子/全体",spC:"+1",ok:true,icon:"⚔️"},{id:"skill",label:"戦闘スキル",sub:"量子/拡散",spC:"-1",ok:sp>=1,icon:"💫"}],
              saki:[{id:"normal",label:"通常攻撃",sub:"七彩/単体",spC:"+1",ok:true,icon:"🌺"},{id:"skill",label:"戦闘スキル",sub:"花畑+頼友",spC:"-1",ok:sp>=1,icon:"🌸"},{id:"resonance",label:"共鳴スキル",sub:`${selChar.resonanceCharge||0}%`,spC:"+1",ok:canRes,icon:"💠",charge:true}],
              ouma:[{id:"normal",label:"通常攻撃",sub:"風/単体",spC:"+1",ok:true,icon:"🌸"},{id:"skill",label:"戦闘スキル",sub:"風/全体+回復",spC:"-1",ok:sp>=1,icon:"🌿"}],
            }[selChar.id]||[];
            const showAllyTarget=selChar.id==="saki"&&(selectedAction==="skill"||ultPending==="saki");
            return(<div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
              {showAllyTarget&&<div style={{display:"flex",gap:3}}>{partyIds.filter(id=>!chars[id]?.ko).map(id=>{ const ac=chars[id]; if(!ac) return null; const isSel=allyTarget===id; return(<div key={id} onClick={()=>setAllyTarget(id)} style={{flex:1,padding:"4px 3px",background:isSel?`${ac.color}22`:"rgba(255,255,255,0.04)",border:`1.5px solid ${isSel?ac.color:"rgba(255,255,255,0.1)"}`,borderRadius:7,cursor:"pointer",textAlign:"center",boxShadow:isSel?`0 0 10px ${ac.color}55`:"none",transition:"all .12s"}}><div style={{fontSize:"0.95rem"}}>{ac.icon}</div><div style={{fontSize:"0.46rem",fontWeight:700,color:isSel?ac.color:"#4b5563"}}>{ac.name}</div>{isSel&&<div style={{fontSize:"0.38rem",color:ac.color}}>頼友▲</div>}</div>); })}</div>}
              <div style={{display:"flex",gap:4}}>
                {acts.map(a=>{ const isCursor=selectedAction===a.id; const isLocked=!!ultPending; const effectiveOk=isLocked?false:a.ok; const cursorColor=a.charge?"#5eead4":"#ffffff";
                  return(<button key={a.id} disabled={!effectiveOk} onClick={()=>{ if(!effectiveOk||ultPending===selChar.id) return; if(selectedAction!==a.id) setSelectedAction(a.id); else handleAction(selChar.id,a.id); }} style={{width:58,height:70,background:isLocked?"rgba(255,255,255,0.01)":!effectiveOk?"rgba(255,255,255,0.02)":a.charge?"linear-gradient(135deg,rgba(20,184,166,0.4),rgba(20,184,166,0.2))":"rgba(255,255,255,0.07)",border:isCursor&&effectiveOk?`2px solid ${cursorColor}`:isLocked?"1px solid rgba(255,255,255,0.04)":`1px solid ${!effectiveOk?"#1a1a2e":a.charge?"#14b8a6":selChar.color+"44"}`,borderRadius:10,color:isLocked?"#1a1a2e":effectiveOk?"white":"#2a2a55",cursor:effectiveOk?"pointer":"not-allowed",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,boxShadow:isCursor&&effectiveOk?`0 0 14px ${cursorColor}cc`:effectiveOk?`0 0 6px ${selChar.color}22`:"none",transition:"all .12s",position:"relative",filter:isLocked?"grayscale(1) opacity(0.18)":"none"}}>
                    {isCursor&&effectiveOk&&<div style={{position:"absolute",top:3,right:3,width:5,height:5,borderRadius:"50%",background:cursorColor,boxShadow:`0 0 6px ${cursorColor}`}}/>}
                    {isCursor&&effectiveOk&&<div style={{position:"absolute",bottom:0,left:0,right:0,fontSize:"0.38rem",color:cursorColor,textAlign:"center",padding:"1px 0 2px",background:"rgba(0,0,0,0.5)",borderRadius:"0 0 9px 9px",opacity:0.9}}>▶ もう一度</div>}
                    <div style={{fontSize:"1.1rem"}}>{a.icon}</div>
                    <div style={{fontSize:"0.54rem",fontWeight:700,lineHeight:1.2,color:isCursor&&effectiveOk?cursorColor:"inherit"}}>{a.label}</div>
                    <div style={{fontSize:"0.46rem",color:effectiveOk&&!isLocked?"rgba(255,255,255,0.5)":"#1f2035"}}>{a.sub}</div>
                    <div style={{fontSize:"0.44rem",color:effectiveOk&&!isLocked?"#60a5fa":"#1f2035"}}>SP:{a.spC}</div>
                  </button>); })}
              </div>
            </div>);
          })()}
          {selChar&&selChar.debuffs?.some(d=>d.type==="frozen")&&!selChar.ko&&(
            <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:120,height:70,background:"rgba(103,232,249,0.1)",border:"1px solid rgba(103,232,249,0.3)",borderRadius:10}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:"1.2rem"}}>🧊</div><div style={{fontSize:"0.5rem",color:"#67e8f9",fontWeight:700}}>凍結中</div><div style={{fontSize:"0.44rem",color:"#164e63"}}>行動不能</div></div>
            </div>
          )}
          {isEnemyTurn&&<div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:120,height:70,background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:10,animation:"warnPulseBoss .8s ease-in-out infinite"}}><div style={{fontSize:"0.65rem",color:"#fca5a5",fontWeight:700}}>❄️ 敵ターン</div><div style={{fontSize:"0.52rem",color:"#94a3b8",marginTop:2}}>EP満タンなら</div><div style={{fontSize:"0.52rem",color:"#a78bfa",fontWeight:700}}>必殺技発動可</div></div>}
        </div>
        <button onClick={()=>openReport("ally",partyIds[0]||"ziran")} style={{position:"absolute",bottom:8,left:8,background:"linear-gradient(135deg,rgba(30,30,70,0.9),rgba(20,20,50,0.95))",border:"1px solid rgba(167,139,250,0.4)",borderRadius:10,padding:"6px 10px",color:"#c4b5fd",fontSize:"0.6rem",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5,boxShadow:"0 0 12px rgba(124,58,237,0.25)",zIndex:20}}>📋<span>戦闘実況</span></button>
      </div>

      {state.victory&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(4px)"}}><div style={{background:"#12122a",border:"2px solid #fcd34d",borderRadius:16,padding:"24px 32px",textAlign:"center",boxShadow:"0 0 40px rgba(252,211,77,0.3)"}}><div style={{fontSize:"1.8rem",marginBottom:3}}>🎉</div><div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"1.6rem",fontWeight:900,color:"#fcd34d"}}>VICTORY!</div><div style={{fontSize:"1.4rem",letterSpacing:3,margin:"6px 0"}}>{"⭐".repeat(state.stars||0)}{"☆".repeat(3-(state.stars||0))}</div><div style={{color:"#6b7280",fontSize:"0.75rem",margin:"0 0 14px"}}>カカリア撃破！（{state.currentRound}ラウンドで撃破）</div><div style={{display:"flex",gap:8}}><button onClick={reset} style={{background:"linear-gradient(135deg,#fbbf24,#f97316)",border:"none",color:"white",padding:"8px 16px",borderRadius:8,fontSize:"0.85rem",fontWeight:700,cursor:"pointer"}}>もう一度</button>{onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#e2e8f0",padding:"8px 16px",borderRadius:8,fontSize:"0.85rem",cursor:"pointer"}}>ロビーへ</button>}</div></div></div>}
      {state.gameOver&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(4px)"}}><div style={{background:"#12122a",border:"2px solid #ef4444",borderRadius:16,padding:"24px 32px",textAlign:"center",boxShadow:"0 0 40px rgba(239,68,68,0.3)"}}><div style={{fontSize:"1.8rem",marginBottom:3}}>{state.timeUp?"⌛":"💀"}</div><div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"1.6rem",fontWeight:900,color:"#ef4444"}}>{state.timeUp?"TIME UP":"DEFEAT"}</div><div style={{color:"#6b7280",fontSize:"0.75rem",margin:"5px 0 14px"}}>{state.timeUp?`${MAX_ROUNDS}ラウンド以内にクリアできませんでした`:"全滅..."}</div><div style={{display:"flex",gap:8}}><button onClick={reset} style={{background:"linear-gradient(135deg,#ef4444,#dc2626)",border:"none",color:"white",padding:"8px 16px",borderRadius:8,fontSize:"0.85rem",fontWeight:700,cursor:"pointer"}}>再挑戦</button>{onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#e2e8f0",padding:"8px 16px",borderRadius:8,fontSize:"0.85rem",cursor:"pointer"}}>ロビーへ</button>}</div></div></div>}
    </div>
  );
}
