import { useState, useRef, useEffect } from "react";
import { BattleReport } from "./BattleReport.jsx";
import { applyEnemyAction, applyPlayerAction, applyRhinoAction, applySaranAction, resolveNext } from "../logic/actions.js";
import { addLog, clone } from "../logic/calc.js";
import { saveBattleRating } from "../logic/ratings.js";
import { CHAR_SPD, ENEMY_IDS, ENEMY_SPD, MAX_ROUNDS, ROUND_KEY, ROUND_LEN, TOTAL_WAVES, calcStarRating, mkState, resolvePartyIds } from "../logic/state.js";
import { ELEM_COLORS } from "../styles/theme.js";

export function NormalBattle({ onBack, diff="Normal", party=["ziran","saki","ouma"] }){
  const partyIds = resolvePartyIds(party);
  const [state,setState]=useState(()=>mkState(partyIds,1, diff));
  const [chainBusy,setChainBusy]=useState(false);
  const [enemyRunning,setEnemyRunning]=useState(false);
  const [dmgPopups,setDmgPopups]=useState([]);
  const [totalActionDmg,setTotalActionDmg]=useState(null);
  const totalDmgTimer=useRef(null);

  const [selectedAction, setSelectedAction] = useState("normal");
  const [allyTarget, setAllyTarget] = useState(partyIds[0]||"ziran");
  const [ultPending, setUltPending] = useState(null);

  const [reportOpen, setReportOpen]=useState(false);
  const [reportTab, setReportTab]=useState("ally");
  const [reportCharId, setReportCharId]=useState(null);
  const [reportEnemyId, setReportEnemyId]=useState(null);
  const pausedRef=useRef(false);
  const chainTimerRef=useRef(null);

  const [announcement, setAnnouncement] = useState(null);
  const announcementTimer = useRef(null);

  const [hitFlash, setHitFlash] = useState({});
  const hitFlashTimers = useRef({});

  const showAnnouncement = (text) => {
    if(announcementTimer.current) clearTimeout(announcementTimer.current);
    setAnnouncement({text, key: Date.now()});
    announcementTimer.current = setTimeout(()=>setAnnouncement(null), 2000);
  };

  const triggerHitFlash = (unitId) => {
    setHitFlash(prev => ({...prev, [unitId]: (prev[unitId]||0)+1}));
    if(hitFlashTimers.current[unitId]) clearTimeout(hitFlashTimers.current[unitId]);
    hitFlashTimers.current[unitId] = setTimeout(()=>{
      setHitFlash(prev => { const n={...prev}; delete n[unitId]; return n; });
    }, 400);
  };

  useEffect(()=>{
    if(partyIds.includes(state.activeId) && !ultPending){
      setSelectedAction("normal");
      setAllyTarget(partyIds[0]||"ziran");
    }
  }, [state.activeId, ultPending]);

  useEffect(()=>{
    const w = state.wave;
    const total = state.totalWaves;
    const text = (total === 1) ? "戦闘開始" : `戦闘開始 ${w}/${total}`;
    showAnnouncement(text);
  }, []);

  const openReport = (tab="ally", charId=null, enemyId=null) => {
    pausedRef.current=true;
    if(chainTimerRef.current) clearTimeout(chainTimerRef.current);
    setReportTab(tab);
    setReportCharId(charId);
    setReportEnemyId(enemyId);
    setReportOpen(true);
  };

  const closeReport = () => {
    setReportOpen(false);
    pausedRef.current=false;
    setState(prev=>{
      const isAuto=ENEMY_IDS.includes(prev.activeId)||prev.activeId==="saran";
      if(isAuto&&!prev.gameOver&&!prev.victory){
        setChainBusy(true);
        setEnemyRunning(true);
        setTimeout(()=>processAutoChain(prev,600),300);
      }
      return prev;
    });
  };


  const showDmgPopup = (value, isCrit, enemyId=null, elem="physical", offsetX=0, offsetY=0) => {
    const id = Date.now() + Math.random();
    const idx = enemyId ? ENEMY_IDS.indexOf(enemyId) : 2;
    setDmgPopups(prev => [...prev, {id, value, isCrit, enemyIdx: idx>=0?idx:2, elem, offsetX, offsetY}]);
    setTimeout(() => setDmgPopups(prev => prev.filter(p => p.id !== id)), 2200);
  };

  const startTotalDmg = () => {
    setTotalActionDmg(0);
    if(totalDmgTimer.current) clearTimeout(totalDmgTimer.current);
  };
  const addTotalDmg = (dmg) => {
    setTotalActionDmg(prev => (prev === null ? dmg : prev + dmg));
    if(totalDmgTimer.current) clearTimeout(totalDmgTimer.current);
    totalDmgTimer.current = setTimeout(() => setTotalActionDmg(null), 3500);
  };

  const processAutoChain=(s,delay=1000)=>{
    if(pausedRef.current) return;
    setEnemyRunning(true);
    const timer=setTimeout(()=>{
      if(pausedRef.current) return;
      let ns=clone(s);
      const aid=ns.activeId;
      if(aid==="saran"){
        ns=applySaranAction(ns);
      } else if(aid==="rhino"){
        ns=applyRhinoAction(ns);
        // ダメージポップ表示
        if(ns.rhinoHits){ ns.rhinoHits.forEach((h,i)=>{ setTimeout(()=>{ showDmgPopup(h.dmg,Math.random()<(ns.chars.miroku?.cr||0.05),h.enemyId,"wind",Math.round((Math.random()-0.5)*30),-i*28); triggerHitFlash(h.enemyId); },i*120); }); }
      } else if(ENEMY_IDS.includes(aid)){
        const prevCharHps = Object.fromEntries(partyIds.map(id=>[id, ns.chars[id]?.hp]));
        ns=applyEnemyAction(ns,aid);
        partyIds.forEach(id=>{
          if(ns.chars[id] && ns.chars[id].hp < prevCharHps[id]) triggerHitFlash(id);
        });
        if(partyIds.every(id=>!ns.chars[id]||ns.chars[id].ko)){
          ns.gameOver=true; ns.log=addLog(ns.log,"💀 全滅...","danger");
          showAnnouncement("戦闘終了");
          setState(ns); setChainBusy(false); setEnemyRunning(false); return;
        }
      }
      ns=resolveNext(ns);
      const auto=ENEMY_IDS.includes(ns.activeId)||ns.activeId==="saran"||ns.activeId==="rhino";
      if(auto){
        if(ENEMY_IDS.includes(ns.activeId)) ns.log=addLog(ns.log,`⏳ ${ns.enemies[ns.activeId].name} が攻撃準備中...`,"warn");
        setState(ns);
        if(!pausedRef.current) processAutoChain(ns, ns.activeId==="saran"||ns.activeId==="rhino"?400:1000);
      } else {
        setState(ns); setChainBusy(false); setEnemyRunning(false);
      }
    },delay);
    chainTimerRef.current=timer;
  };

  const handleAction=(charId,actionId)=>{
    if(chainBusy||state.gameOver||state.victory) return;
    if(state.activeId!==charId) return;

    if(actionId==="ult"){
      const c = state.chars[charId];
      if(!c||c.ep<c.maxEp) return;
      setUltPending(charId);
      setSelectedAction("ult");
      setState(prev=>{
        const s = clone(prev);
        s._ultBonusTurn = charId;
        s.log = addLog(s.log, `⚡ ${s.chars[charId].name}: 必殺技 チャージ！（追加ターン）`, "ult");
        return s;
      });
      return;
    }

    setChainBusy(true);
    let s=clone(state);
    s.selectedAllyTarget=allyTarget;
    const prevHp = Object.fromEntries(ENEMY_IDS.map(id=>[id, s.enemies[id].hp]));
    s=applyPlayerAction(s,charId,actionId,s.selectedTarget);
    const isCrit = Math.random() < (state.chars[charId]?.cr||0);
    const elemMap = {ziran:"quantum", saki:"other", ouma:"wind", miroku:"wind"};
    const elem = elemMap[charId]||"physical";
    startTotalDmg();
    let delay = 0;
    const popOffset = (i) => {
      const ox = Math.round((Math.random()-0.5)*46);
      const oy = -i*34 - Math.round(Math.random()*10);
      return { ox, oy };
    };
    if(charId==="saki" && actionId==="resonance" && s.resonanceHits){
      s.resonanceHits.forEach((hit,i)=>{
        setTimeout(()=>{
          const {ox,oy}=popOffset(i);
          showDmgPopup(hit.dmg, isCrit, hit.enemyId, elem, ox, oy);
          addTotalDmg(hit.dmg);
          if(i===0) triggerHitFlash(hit.enemyId);
        }, delay);
        delay+=150;
      });
    } else if(charId==="ziran" && (actionId==="skill"||actionId==="ult") && s.ziranHits){
      s.ziranHits.forEach((hit,i)=>{
        setTimeout(()=>{
          if(Array.isArray(hit)){
            hit.forEach((h,j)=>{
              const {ox,oy}=popOffset(i+j);
              showDmgPopup(h.dmg, isCrit, h.enemyId, elem, ox, oy);
              addTotalDmg(h.dmg);
            });
          } else {
            const {ox,oy}=popOffset(i);
            showDmgPopup(hit.dmg, isCrit, hit.enemyId, elem, ox, oy);
            addTotalDmg(hit.dmg);
          }
          if(i===0) triggerHitFlash(Array.isArray(hit)?hit[0].enemyId:hit.enemyId);
        }, delay);
        delay+=160;
      });
    } else {
      const hitOffsets = {
        ziran: { normal:1 },
        saki:  { normal:1, skill:1, ult:1 },
        ouma:  { normal:1, skill:1, ult:1 },
      };
      const hitCount = hitOffsets[charId]?.[actionId] || 1;
      ENEMY_IDS.forEach(id=>{
        const totalDmgForEnemy = Math.max(0,(prevHp[id]||0) - s.enemies[id].hp);
        if(totalDmgForEnemy>0){
          const perHit = Math.floor(totalDmgForEnemy/hitCount);
          for(let i=0;i<hitCount;i++){
            const dmg = i===hitCount-1 ? totalDmgForEnemy-(perHit*(hitCount-1)) : perHit;
            if(dmg<=0) continue;
            setTimeout(()=>{
              const {ox,oy}=popOffset(i);
              showDmgPopup(dmg, isCrit, id, elem, ox, oy);
              addTotalDmg(dmg);
              if(i===0) triggerHitFlash(id);
            }, delay);
            delay+=120;
          }
        }
      });
    }
    _finishAction(s);
  };

  const handleUltFire=(charId)=>{
    if(chainBusy||state.gameOver||state.victory) return;
    if(ultPending!==charId) return;
    setUltPending(null);
    setSelectedAction("normal");
    setChainBusy(true);
    let s=clone(state);
    s.selectedAllyTarget=allyTarget;
    const prevHp = Object.fromEntries(ENEMY_IDS.map(id=>[id, s.enemies[id].hp]));
    s=applyPlayerAction(s,charId,"ult",s.selectedTarget);
    const isCrit = Math.random() < (state.chars[charId]?.cr||0);
    const elemMap = {ziran:"quantum", saki:"other", ouma:"wind", miroku:"wind"};
    const elem = elemMap[charId]||"physical";
    startTotalDmg();
    let delay = 0;
    const popOffset = (i) => {
      const ox = Math.round((Math.random()-0.5)*46);
      const oy = -i*34 - Math.round(Math.random()*10);
      return { ox, oy };
    };
    if(charId==="ziran" && s.ziranHits){
      s.ziranHits.forEach((hit,i)=>{
        setTimeout(()=>{
          if(Array.isArray(hit)){
            hit.forEach((h,j)=>{
              const {ox,oy}=popOffset(i+j);
              showDmgPopup(h.dmg, isCrit, h.enemyId, elem, ox, oy);
              addTotalDmg(h.dmg);
            });
          } else {
            const {ox,oy}=popOffset(i);
            showDmgPopup(hit.dmg, isCrit, hit.enemyId, elem, ox, oy);
            addTotalDmg(hit.dmg);
          }
          if(i===0) triggerHitFlash(Array.isArray(hit)?hit[0].enemyId:hit.enemyId);
        }, delay);
        delay+=160;
      });
    } else {
      ENEMY_IDS.forEach(id=>{
        const dmg = Math.max(0,(prevHp[id]||0) - s.enemies[id].hp);
        if(dmg>0){
          setTimeout(()=>{
            showDmgPopup(dmg, isCrit, id, elem, 0, 0);
            addTotalDmg(dmg);
            triggerHitFlash(id);
          }, delay);
          delay+=120;
        }
      });
    }
    s.activeId = charId;
    s.log = addLog(s.log, `▶ ${s.chars[charId].name} の番！（元のターン継続）`, "player");
    _finishAction(s, true);
  };

  const _finishAction=(s, isUltBonusTurn=false)=>{
    if(ENEMY_IDS.every(id=>!s.enemies[id].alive)){
      const nextWave = s.wave + 1;
      if(nextWave <= TOTAL_WAVES){
        s.victory=false;
        showAnnouncement("戦闘終了");
        setState(s);
        setTimeout(()=>{
          const nextState = mkState(partyIds, nextWave, diff);
          const keptChars = clone(s.chars);
          Object.values(keptChars).forEach(c=>{ if(c.ko){ c.ko=false; c.hp=Math.floor(c.maxHp*0.3); c.ep=0; } });
          nextState.chars = keptChars;
          nextState.currentRound = s.currentRound||1;
          nextState.avs[ROUND_KEY] = s.avs[ROUND_KEY];
          nextState.koEverHappened = s.koEverHappened;
          nextState.log = [
            ...nextState.log,
            {id:Date.now(),text:`🌊 ウェーブ${nextWave}/${TOTAL_WAVES} 開始！`,type:"warn"},
          ];
          const waveText = (TOTAL_WAVES === 1) ? "戦闘開始" : `戦闘開始 ${nextWave}/${TOTAL_WAVES}`;
          showAnnouncement(waveText);
          setChainBusy(false);
          setEnemyRunning(false);
          setUltPending(null);
          setState(nextState);
        }, 2200);
        return;
      } else {
        s.victory=true;
        s.stars = calcStarRating(s);
        s.log=addLog(s.log,`🎉 全ウェーブ撃破！完全勝利！ 評価:${"⭐".repeat(s.stars)}${"☆".repeat(3-s.stars)}`,"victory");
        showAnnouncement("戦闘終了");
        setState(s);
        setChainBusy(false);
        saveBattleRating("normal", diff, s.stars);
        return;
      }
    }
    if(!s.enemies[s.selectedTarget]?.alive){ const f=ENEMY_IDS.find(id=>s.enemies[id].alive); if(f) s.selectedTarget=f; }

    if(isUltBonusTurn){
      s = resolveNext(s);
      const auto = ENEMY_IDS.includes(s.activeId) || s.activeId==="saran";
      if(auto){
        if(ENEMY_IDS.includes(s.activeId)) s.log=addLog(s.log,`⏳ ${s.enemies[s.activeId].name} が攻撃準備中...`,"warn");
        setState(s); processAutoChain(s, s.activeId==="saran"?400:1000);
      } else { setState(s); setChainBusy(false); }
      return;
    }

    s=resolveNext(s);
    const auto=ENEMY_IDS.includes(s.activeId)||s.activeId==="saran";
    if(auto){
      if(ENEMY_IDS.includes(s.activeId)) s.log=addLog(s.log,`⏳ ${s.enemies[s.activeId].name} が攻撃準備中...`,"warn");
      setState(s); processAutoChain(s, s.activeId==="saran"?400:1000);
    } else { setState(s); setChainBusy(false); }
  };

  const handleUltFromCard=(charId)=>{
    if(state.gameOver||state.victory) return;
    const c=state.chars[charId];
    if(!c||c.ko||c.hp<=0||c.ep<c.maxEp) return;

    if(ultPending===charId){
      handleUltFire(charId);
      return;
    }

    if(state.activeId===charId && !chainBusy){
      handleAction(charId,"ult");
      return;
    }

    if(chainBusy) return;
    setUltPending(charId);
    setSelectedAction("ult");
    setState(prev=>{
      const s = clone(prev);
      s._ultBonusTurn = charId;
      s.log = addLog(s.log, `⚡ ${s.chars[charId].name}: 必殺技 チャージ！（追加ターン）`, "ult");
      return s;
    });
  };

  const setTarget=id=>{ if(!state.enemies[id]?.alive) return; setState(s=>({...s,selectedTarget:id})); };
  const reset=()=>{
    pausedRef.current=false;
    if(chainTimerRef.current) clearTimeout(chainTimerRef.current);
    if(announcementTimer.current) clearTimeout(announcementTimer.current);
    setChainBusy(false); setEnemyRunning(false);
    setReportOpen(false);
    setHitFlash({});
    setDmgPopups([]);
    setTotalActionDmg(null);
    setUltPending(null);
    const newState = mkState(partyIds, 1, diff);
    setState(newState);
    setTimeout(()=>showAnnouncement("戦闘開始"), 100);
  };

  const {chars,enemies,sp,activeId,avs}=state;
  const selChar=activeId&&chars[activeId]?chars[activeId]:null;
  const aliveCount=ENEMY_IDS.filter(id=>enemies[id].alive).length;
  const sakiHana=chars.saki?.hanabatake>0;
  const sakiKekkai=chars.saki?.kekkai>0;
  const ziranLC=chars.ziran?.lcDmgStack||0;
  const isEnemyTurn = ENEMY_IDS.includes(activeId) || activeId==="saran";

  if(reportOpen){
    return (
      <BattleReport
        state={state}
        onClose={closeReport}
        initialTab={reportTab}
        initialCharId={reportCharId}
        initialEnemyId={reportEnemyId}
      />
    );
  }

  const avUnits = [
    ...partyIds.filter(id=>!chars[id]?.ko).map(id=>({id,icon:chars[id].icon,color:chars[id].color,av:avs[id]??0,isEnemy:false,isFuture:false})),
    ...ENEMY_IDS.filter(id=>enemies[id].alive).map(id=>({id,icon:enemies[id].icon,color:enemies[id].color,av:avs[id]??0,isEnemy:true,isFuture:false})),
    ...(chars.ouma?.hasSaran&&avs.saran!==undefined?[{id:"saran",icon:"🐰",color:"#86efac",av:avs.saran,isEnemy:false,isFuture:false}]:[]),
    ...(chars.miroku?.hasRhinoceros&&avs.rhino!==undefined?[{id:"rhino",icon:"🦏",color:"#34d399",av:avs.rhino,isEnemy:false,isFuture:false}]:[]),
    ...(avs[ROUND_KEY]!==undefined?[{id:ROUND_KEY,isHourglass:true,av:avs[ROUND_KEY],roundsRemaining:Math.max(0,MAX_ROUNDS-(state.currentRound||1))}]:[]),
  ].filter(u=>avs[u.id]!==undefined).sort((a,b)=>a.av-b.av).slice(0,20);

  let futureSlotIdx = -1;
  const avUnitsWithFuture = (() => {
    const isPlayerTurn = partyIds.includes(activeId) && !ultPending;
    const hasActionCursor = isPlayerTurn && selectedAction !== "ult" && selChar && !selChar.ko;
    if(!hasActionCursor) return avUnits;

    const charId = activeId;
    const spd = CHAR_SPD[charId];
    const simAvs = {...avs};
    simAvs[charId] = Math.ceil(10000/spd);

    const validIds = [
      ...partyIds.filter(id=>!chars[id]?.ko),
      ...ENEMY_IDS.filter(id=>enemies[id].alive),
      ...(chars.ouma?.hasSaran&&simAvs.saran!==undefined?["saran"]:[]),
      ...(simAvs[ROUND_KEY]!==undefined?[ROUND_KEY]:[]),
    ].filter(id=>simAvs[id]!==undefined);

    const simOrder = [];
    const workAvs = {...simAvs};
    for(let step=0; step<20; step++){
      const nextId = validIds.reduce((a,b)=>(workAvs[a]??Infinity)<=(workAvs[b]??Infinity)?a:b);
      const nextAv = workAvs[nextId];
      validIds.forEach(id=>{ workAvs[id]-=nextAv; });
      simOrder.push(nextId);
      if(nextId===charId) break;
      const resetSpd = CHAR_SPD[nextId]||ENEMY_SPD;
      workAvs[nextId]= nextId===ROUND_KEY ? ROUND_LEN : Math.ceil(10000/resetSpd);
    }

    const futureRank = simOrder.indexOf(charId);
    if(futureRank<0) return avUnits;

    const futureAv = simAvs[charId];

    const insertAt = Math.min(futureRank + 1, 20);
    const futureUnit = {
      id: charId,
      icon: chars[charId].icon,
      color: chars[charId].color,
      av: futureAv,
      isEnemy: false,
      isFuture: true,
    };

    const result = [...avUnits];
    result.splice(insertAt, 0, futureUnit);
    futureSlotIdx = insertAt;
    return result.slice(0,20);
  })();

  const avUnitsDisplayRaw = avUnitsWithFuture;
  const avUnitsDisplay = (() => {
    if(avUnitsDisplayRaw.length<=9) return avUnitsDisplayRaw;
    const futureIdx = avUnitsDisplayRaw.findIndex(u=>u.isFuture);
    if(futureIdx<0 || futureIdx<20) return avUnitsDisplayRaw.slice(0,20);
    const trimmed = avUnitsDisplayRaw.filter((u,i)=> i<19 || u.isFuture).slice(0,20);
    return trimmed;
  })();

  return(
    <div style={{
      fontFamily:"'Noto Sans JP',sans-serif",
      background:"linear-gradient(180deg,#0d1420 0%,#0a0f1a 60%,#080c14 100%)",
      color:"#e2e8f0", height:"100vh", overflow:"hidden",
      display:"flex", flexDirection:"column", position:"relative",
      userSelect:"none",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Rajdhani:wght@600;700&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes ultGlow{0%,100%{box-shadow:0 0 8px #a78bfa88}50%{box-shadow:0 0 20px #a78bfacc,0 0 40px #a78bfa44}}
        @keyframes enemyAct{0%,100%{opacity:1}50%{opacity:.6}}
        @keyframes warnPulse{0%,100%{opacity:.7}50%{opacity:1}}
        @keyframes futureBlink{0%,100%{opacity:1;box-shadow:0 0 8px #a78bfa88}50%{opacity:0.3;box-shadow:none}}
        @keyframes dmgFloat{
          0%{opacity:0;transform:translateX(-50%) scale(0.7);}
          15%{opacity:1;transform:translateX(-50%) scale(1.1);}
          40%{opacity:1;transform:translateX(-50%) scale(1);}
          100%{opacity:0;transform:translateX(-50%) scale(1);}
        }
        @keyframes hitFlashAnim{
          0%{background:rgba(239,68,68,0.0);}
          20%{background:rgba(239,68,68,0.55);}
          60%{background:rgba(239,68,68,0.35);}
          100%{background:rgba(239,68,68,0.0);}
        }
        @keyframes announceFade{
          0%{opacity:0;transform:translate(-50%,-50%) scale(0.7);}
          15%{opacity:1;transform:translate(-50%,-50%) scale(1.05);}
          25%,75%{opacity:1;transform:translate(-50%,-50%) scale(1);}
          100%{opacity:0;transform:translate(-50%,-50%) scale(0.9);}
        }
        @keyframes ultCardGlow{0%,100%{box-shadow:0 0 10px #a78bfa66}50%{box-shadow:0 0 22px #a78bfabb,0 0 40px #a78bfa33}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#2a2a55;border-radius:2px}
      `}</style>

      <div style={{
        display:"flex", alignItems:"flex-start", gap:6, padding:"6px 8px 4px",
        background:"linear-gradient(180deg,rgba(0,0,0,0.7),transparent)",
        position:"relative", zIndex:10, flexShrink:0,
      }}>
        <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:46,maxHeight:198,overflowY:"auto",overflowX:"hidden"}}>
          {avUnitsDisplay.map((u,i)=>{
            if(u.isHourglass){
              return(
                <div key={u.id} style={{
                  display:"flex",alignItems:"center",gap:4,
                  background:"rgba(96,165,250,0.15)",
                  border:"1px solid rgba(96,165,250,0.4)",
                  borderRadius:6,padding:"2px 5px",
                }}>
                  <span style={{fontSize:"0.7rem"}}>⌛</span>
                  <div style={{flex:1,height:1,background:"rgba(96,165,250,0.3)"}}/>
                  <span style={{fontSize:"0.48rem",color:"#93c5fd",minWidth:28,textAlign:"right",fontWeight:700}}>{u.roundsRemaining}|{Math.ceil(u.av)}</span>
                </div>
              );
            }
            const isCurrent = i===0 && !u.isFuture;
            const isFutureBlink = u.isFuture;
            return (
              <div key={u.id+i+(u.isFuture?"_future":"")} style={{
                display:"flex",alignItems:"center",gap:4,
                background: isCurrent?"rgba(251,191,36,0.25)":isFutureBlink?"rgba(167,139,250,0.15)":"rgba(0,0,0,0.4)",
                border:`1px solid ${isCurrent?"#fbbf24":isFutureBlink?"#a78bfa":"rgba(255,255,255,0.08)"}`,
                borderRadius:6,padding:"2px 5px",
                animation: isFutureBlink ? "futureBlink 0.7s ease-in-out infinite" : "none",
                opacity: isFutureBlink ? undefined : 1,
              }}>
                <span style={{fontSize:"0.75rem",filter:isFutureBlink?"opacity(0.7)":"none"}}>{u.icon}</span>
                <div style={{flex:1,height:3,background:"rgba(255,255,255,0.1)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.max(5,100-u.av/2)}%`,background:isFutureBlink?"#a78bfa":u.isEnemy?"#f9a8d4":u.color,borderRadius:2}}/>
                </div>
                <span style={{fontSize:"0.48rem",color:isCurrent?"#fbbf24":isFutureBlink?"#a78bfa":"#4b5563",minWidth:16,textAlign:"right"}}>{Math.round(u.av)}</span>
              </div>
            );
          })}
        </div>

        <div style={{flex:1,display:"flex",flexDirection:"column",gap:3}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{
              background:"rgba(251,191,36,0.12)",
              border:"1px solid rgba(251,191,36,0.35)",
              borderRadius:8, padding:"2px 10px",
              color:"#fcd34d", fontSize:"0.65rem", fontWeight:900,
              letterSpacing:1,
              fontFamily:"Rajdhani,sans-serif",
            }}>
              WAVE {state.wave}/{state.totalWaves}
            </div>
            {state.selectedTarget&&enemies[state.selectedTarget]?.alive&&(
              <button
                onClick={()=>openReport("enemy",null,state.selectedTarget)}
                style={{
                  background:"rgba(252,211,77,0.1)",
                  border:"1px solid rgba(252,211,77,0.35)",
                  borderRadius:8, padding:"3px 10px",
                  color:"#fcd34d", fontSize:"0.62rem", fontWeight:700,
                  cursor:"pointer", display:"flex", alignItems:"center", gap:4,
                  letterSpacing:1,
                }}>
                🎯 {enemies[state.selectedTarget].name}
                <span style={{fontSize:"0.46rem",color:"#fbbf2466"}}>Lv.{enemies[state.selectedTarget].lv}</span>
                <span style={{fontSize:"0.5rem",color:"#fbbf2488"}}>▸詳細</span>
              </button>
            )}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
            <div style={{
              background:"linear-gradient(135deg,rgba(251,191,36,0.2),rgba(251,191,36,0.05))",
              border:"1px solid rgba(251,191,36,0.4)",borderRadius:8,padding:"3px 10px",
              display:"flex",alignItems:"center",gap:5,
            }}>
              <span style={{fontSize:"0.58rem",color:"#94a3b8"}}>SP</span>
              <div style={{display:"flex",gap:3}}>
                {Array.from({length:5}).map((_,i)=>(
                  <div key={i} style={{
                    width:12,height:12,borderRadius:"50%",
                    background:i<sp?"#fbbf24":"rgba(255,255,255,0.08)",
                    border:`1px solid ${i<sp?"#f59e0b":"rgba(255,255,255,0.15)"}`,
                    boxShadow:i<sp?"0 0 5px #fbbf2488":"none",
                  }}/>
                ))}
              </div>
            </div>
            {sakiHana&&<span style={{fontSize:"0.5rem",background:"rgba(249,168,212,0.15)",color:"#f9a8d4",padding:"2px 5px",borderRadius:5,border:"1px solid rgba(249,168,212,0.3)"}}>花畑 与ダメ+40%</span>}
            {sakiKekkai&&<span style={{fontSize:"0.5rem",background:"rgba(167,139,250,0.15)",color:"#a78bfa",padding:"2px 5px",borderRadius:5,border:"1px solid rgba(167,139,250,0.3)"}}>結界 耐性貫通+50%</span>}
            {ziranLC>0&&<span style={{fontSize:"0.5rem",background:"rgba(167,139,250,0.15)",color:"#a78bfa",padding:"2px 5px",borderRadius:5,border:"1px solid rgba(167,139,250,0.3)"}}>紫蘭LC +{ziranLC*10}%</span>}
            <span style={{fontSize:"0.5rem",color:"#374151"}}>残{aliveCount}/5</span>
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
          {totalActionDmg!==null&&(
            <div style={{
              background:"rgba(0,0,0,0.6)",border:"1px solid rgba(251,191,36,0.4)",
              borderRadius:8,padding:"3px 10px",textAlign:"right",
              animation:"warnPulse 1s ease-in-out 1",
            }}>
              <div style={{fontSize:"0.48rem",color:"#94a3b8",letterSpacing:1}}>総ダメージ</div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"1.1rem",fontWeight:900,
                color:"#fbbf24",lineHeight:1,textShadow:"0 0 12px rgba(251,191,36,0.6)"}}>
                {totalActionDmg.toLocaleString()}
              </div>
            </div>
          )}
          <button onClick={reset} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",
            color:"#4b5563",padding:"4px 8px",borderRadius:7,fontSize:"0.6rem",cursor:"pointer"}}>🔄</button>
          {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",
            color:"#94a3b8",padding:"4px 8px",borderRadius:7,fontSize:"0.6rem",cursor:"pointer"}}>◀ ロビー</button>}
        </div>
      </div>

      <div style={{
        flex:1, position:"relative", overflow:"hidden",
        background:"radial-gradient(ellipse at 50% 60%,rgba(30,30,60,0.3),transparent 70%)",
        minHeight:0,
      }}>
        <div style={{position:"absolute",inset:0,
          backgroundImage:"linear-gradient(rgba(255,255,255,0.01) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.01) 1px,transparent 1px)",
          backgroundSize:"40px 40px"}}/>

        <div style={{
          position:"absolute",top:8,left:0,right:0,
          display:"flex",justifyContent:"center",alignItems:"flex-start",
          gap:8, padding:"0 4px",
        }}>
          {ENEMY_IDS.map((id,idx)=>{
            const e=enemies[id];
            const isSel=state.selectedTarget===id;
            const isAct=activeId===id;
            const isFlashing = !!hitFlash[id];

            if(!e.alive) return(
              <div key={id} style={{width:70,opacity:0.15,textAlign:"center",paddingBottom:8,flexShrink:0}}>
                <div style={{fontSize:"1.8rem"}}>💀</div>
                <div style={{fontSize:"0.45rem",color:"#374151"}}>撃破</div>
              </div>
            );
            const hpPct=(e.hp/e.maxHp)*100;
            const tPct=(e.toughness/e.maxToughness)*100;
            return(
              <div key={id} style={{
                width:70,flexShrink:0,
                display:"flex",flexDirection:"column",alignItems:"center",
                animation:isAct?"enemyAct 0.6s ease-in-out infinite":"none",
                position:"relative",
              }}>
                {isFlashing && (
                  <div key={hitFlash[id]} style={{
                    position:"absolute",inset:0,
                    borderRadius:8,
                    animation:"hitFlashAnim 0.4s ease-out forwards",
                    pointerEvents:"none",
                    zIndex:5,
                  }}/>
                )}
                <div onClick={()=>setTarget(id)} style={{width:"100%",marginBottom:4,cursor:"pointer"}}>
                  <div style={{background:"rgba(0,0,0,0.6)",border:`1px solid ${isSel?"#fcd34d44":"rgba(255,255,255,0.08)"}`,
                    borderRadius:4,padding:"3px 5px",
                    boxShadow:isSel?"0 0 8px rgba(252,211,77,0.3)":isAct?"0 0 8px rgba(251,191,36,0.4)":"none",
                  }}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontSize:"0.46rem",color:isAct?"#fbbf24":"#fcd34d",fontWeight:700}}>
                        {e.name}{isAct&&" ▶"}
                      </span>
                      <span style={{fontSize:"0.44rem",color:"#6b7280"}}>{(e.hp/1000).toFixed(0)}k</span>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.5)",borderRadius:2,height:4,marginBottom:2,overflow:"hidden"}}>
                      <div style={{width:`${hpPct}%`,height:"100%",background:hpPct<30?"#ef4444":hpPct<60?"#f97316":"#fcd34d",borderRadius:2,transition:"width .3s"}}/>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.5)",borderRadius:2,height:2,overflow:"hidden"}}>
                      <div style={{width:`${tPct}%`,height:"100%",background:"#fb923c",borderRadius:2,transition:"width .3s"}}/>
                    </div>
                    {e.toughness<=0&&<div style={{fontSize:"0.42rem",color:"#f97316",textAlign:"center",marginTop:1}}>靭性破壊</div>}
                  </div>
                </div>
                <div onClick={()=>setTarget(id)} style={{
                  fontSize:"2rem",lineHeight:1,cursor:"pointer",position:"relative",
                  filter:isSel?"drop-shadow(0 0 6px #fcd34d)":isAct?"drop-shadow(0 0 8px #fbbf24)":"none",
                }}>
                  {e.icon}
                  {dmgPopups.filter(p=>p.enemyIdx===idx).map(p=>{
                    const ec = ELEM_COLORS[p.elem]||ELEM_COLORS.physical;
                    const isRainbow = p.elem==="other";
                    const col = p.isCrit ? ec.crit : ec.nonCrit;
                    const fontSize = p.isCrit ? "2.2rem" : "1.4rem";
                    const stroke = ec.stroke;
                    const rainbowGrad = p.isCrit
                      ? "linear-gradient(135deg,#ff0000,#ff7700,#ffff00,#00ff00,#00bfff,#8000ff,#ff00ff)"
                      : "linear-gradient(135deg,#7f0000,#7f3b00,#7f7f00,#007f00,#005f7f,#40007f,#7f007f)";
                    return(
                      <div key={p.id} style={{
                        position:"absolute",
                        left:"50%", top:"50%",
                        transform:"translateX(-50%) translateY(-50%)",
                        pointerEvents:"none", zIndex:50,
                        animation:"dmgFloat 2.2s ease-out forwards",
                        textAlign:"center",
                        whiteSpace:"nowrap",
                      }}>
                        {p.isCrit&&(
                          <div style={{
                            fontSize:"0.55rem",fontWeight:900,letterSpacing:2,marginBottom:2,
                            ...(isRainbow ? {
                              background:"linear-gradient(90deg,#ff0000,#ff7700,#ffff00,#00ff00,#00bfff,#8000ff)",
                              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                              filter:"drop-shadow(0 0 4px rgba(255,255,255,0.5))",
                            } : {
                              color:ec.crit, textShadow:`0 0 8px ${ec.crit}`,
                            }),
                          }}>会心</div>
                        )}
                        <div style={{
                          fontFamily:"Rajdhani,sans-serif",
                          fontSize,
                          fontWeight:900,
                          lineHeight:1,
                          ...(isRainbow ? {
                            background: rainbowGrad,
                            WebkitBackgroundClip:"text",
                            WebkitTextFillColor:"transparent",
                            filter: p.isCrit
                              ? "drop-shadow(0 0 6px rgba(255,255,255,0.7)) drop-shadow(2px 2px 0 rgba(0,0,0,0.8))"
                              : "drop-shadow(1px 1px 0 rgba(0,0,0,0.9))",
                          } : {
                            color: col,
                            textShadow: p.isCrit
                              ? `0 0 20px ${ec.crit}, 0 0 40px ${ec.crit}88, 2px 2px 0 ${stroke}`
                              : `0 0 8px ${ec.nonCrit}88, 2px 2px 0 rgba(0,0,0,0.9)`,
                            WebkitTextStroke: `1px ${stroke}`,
                          }),
                        }}>
                          {p.value.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {isSel&&!isAct&&<div style={{fontSize:"0.42rem",color:"#fcd34d",marginTop:1}}>▲</div>}
              </div>
            );
          })}
        </div>

        {isEnemyTurn&&(
          <div style={{position:"absolute",top:6,left:0,right:0,display:"flex",justifyContent:"center"}}>
            <div style={{
              background:"rgba(251,191,36,0.15)",border:"1px solid rgba(251,191,36,0.4)",
              borderRadius:20,padding:"3px 14px",fontSize:"0.6rem",color:"#fbbf24",fontWeight:700,
              animation:"warnPulse .8s ease-in-out infinite",
            }}>
              {activeId==="saran"?"🐰 連兎 行動中...":"⚔️ 敵 行動中..."}
            </div>
          </div>
        )}

        {announcement && (
          <div key={announcement.key} style={{
            position:"absolute",
            top:"50%", left:"50%",
            transform:"translate(-50%,-50%)",
            zIndex:100,
            pointerEvents:"none",
            animation:"announceFade 2s ease-in-out forwards",
            textAlign:"center",
          }}>
            <div style={{
              background:"rgba(0,0,0,0.75)",
              border:"2px solid rgba(251,191,36,0.6)",
              borderRadius:16,
              padding:"12px 28px",
              backdropFilter:"blur(6px)",
              boxShadow:"0 0 40px rgba(251,191,36,0.3)",
            }}>
              <div style={{
                fontFamily:"Rajdhani,sans-serif",
                fontSize:"1.4rem",
                fontWeight:900,
                color:"#fcd34d",
                letterSpacing:4,
                textShadow:"0 0 20px rgba(251,191,36,0.8)",
              }}>
                {announcement.text}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{
        background:"linear-gradient(0deg,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.7) 100%)",
        borderTop:"1px solid rgba(255,255,255,0.08)",
        padding:"6px 6px 8px", flexShrink:0,
      }}>
        <div style={{display:"flex",gap:5,marginBottom:6}}>
          {partyIds.map(charId=>{
            const c=chars[charId];
            if(!c) return null;
            const isAct=activeId===c.id;
            const canUlt=c.ep>=c.maxEp&&!c.ko;
            const shocked=c.debuffs.some(d=>d.type==="shock");
            const isFlashing = !!hitFlash[c.id];
            const isUltPending = ultPending===c.id;
            const isFirst = partyIds[0]===c.id;
            return(
              <div key={c.id} style={{
                flex:1,position:"relative",
                background:c.ko?"rgba(0,0,0,0.6)":isAct?"rgba(251,191,36,0.1)":"rgba(255,255,255,0.04)",
                border:`1px solid ${c.ko?"#1f2035":isAct?"#fbbf24":c.color+"33"}`,
                borderRadius:10,padding:"6px 7px",
                opacity:c.ko?0.4:1,
                boxShadow:isAct?`0 0 12px rgba(251,191,36,0.2)`:canUlt?`0 0 10px ${c.color}44`:"none",
                overflow:"hidden",
              }}>
                {isFlashing && (
                  <div key={hitFlash[c.id]} style={{
                    position:"absolute",inset:0,
                    borderRadius:9,
                    animation:"hitFlashAnim 0.4s ease-out forwards",
                    pointerEvents:"none",
                    zIndex:10,
                  }}/>
                )}
                {isFirst&&<div style={{position:"absolute",top:3,left:4,fontSize:"0.38rem",color:"#fbbf24",fontWeight:900,zIndex:3}}>★</div>}
                {c.ko&&(
                  <div style={{position:"absolute",inset:0,borderRadius:9,
                    background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:"1rem"}}>💀</div>
                      <div style={{fontSize:"0.5rem",color:"#ef4444",fontWeight:900}}>戦闘不能</div>
                    </div>
                  </div>
                )}
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                  <span style={{fontSize:"1rem"}}>{c.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"0.65rem",fontWeight:700,color:isAct?"#fbbf24":c.color}}>{c.name}</div>
                    <div style={{fontSize:"0.5rem",color:"#374151"}}>{c.role}</div>
                  </div>
                  {isAct&&<div style={{fontSize:"0.46rem",background:"#fbbf24",color:"#0a0a1a",padding:"1px 4px",borderRadius:4,fontWeight:900}}>行動中</div>}
                  {shocked&&!c.ko&&<div style={{fontSize:"0.46rem",background:"#f59e0b",color:"#0a0a1a",padding:"1px 3px",borderRadius:4}}>⚡</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}>
                  <span style={{fontSize:"0.46rem",color:"#4b5563",width:11}}>HP</span>
                  <div style={{flex:1,background:"rgba(0,0,0,0.5)",borderRadius:2,height:5,overflow:"hidden"}}>
                    <div style={{width:`${(c.hp/c.maxHp)*100}%`,height:"100%",
                      background:c.hp/c.maxHp<0.3?"#ef4444":c.color,borderRadius:2,transition:"width .3s"}}/>
                  </div>
                  <span style={{fontSize:"0.44rem",color:"#6b7280",minWidth:22,textAlign:"right"}}>{(c.hp/1000).toFixed(1)}k</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:c.id==="ziran"?2:0}}>
                  <span style={{fontSize:"0.46rem",color:"#4b5563",width:11}}>EP</span>
                  <div style={{flex:1,background:"rgba(0,0,0,0.5)",borderRadius:2,height:4,overflow:"hidden",position:"relative"}}>
                    <div style={{width:`${(c.ep/c.maxEp)*100}%`,height:"100%",
                      background:canUlt?"#a78bfa":"#60a5fa",borderRadius:2,transition:"width .3s",
                      boxShadow:canUlt?"0 0 6px #a78bfa":"none"}}/>
                  </div>
                  <span style={{fontSize:"0.44rem",color:canUlt?"#a78bfa":"#60a5fa",minWidth:22,textAlign:"right"}}>{c.ep}/{c.maxEp}</span>
                </div>
                {(c.id==="ziran"||c.id==="miroku")&&(
                  <div style={{display:"flex",alignItems:"center",gap:3}}>
                    <span style={{fontSize:"0.46rem",color:c.id==="miroku"?"#34d399":"#a78bfa",width:11}}>X</span>
                    <div style={{flex:1,background:"rgba(0,0,0,0.5)",borderRadius:2,height:3,overflow:"hidden"}}>
                      <div style={{width:`${(c.x/c.xMax)*100}%`,height:"100%",background:c.id==="miroku"?"#6ee7b7":"#c4b5fd",borderRadius:2,transition:"width .3s"}}/>
                    </div>
                    <span style={{fontSize:"0.44rem",color:c.id==="miroku"?"#34d399":"#a78bfa",minWidth:22,textAlign:"right"}}>{c.x}</span>
                  </div>
                )}
                {c.id==="miroku"&&<div style={{fontSize:"0.44rem",color:"#34d399",marginTop:1}}>🦏{c.hasRhinoceros?"リノ:召喚中":"リノ:未召喚"}</div>}
                {c.id==="saki"&&c.hanabatake>0&&<div style={{fontSize:"0.44rem",color:"#f9a8d4",marginTop:1}}>🌸花畑:{c.hanabatake}T</div>}
                {c.buffs.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:2,marginTop:2}}>
                    {c.buffs.slice(0,2).map((b,i)=><span key={i} style={{fontSize:"0.42rem",background:"rgba(30,58,95,0.8)",color:"#93c5fd",padding:"1px 3px",borderRadius:3}}>{b.label.slice(0,5)}({b.turns}T)</span>)}
                  </div>
                )}
                {canUlt&&(
                  <button onClick={()=>handleUltFromCard(c.id)} style={{
                    width:"100%",marginTop:3,
                    background: isUltPending
                      ? "linear-gradient(135deg,rgba(124,58,237,0.7),rgba(168,85,247,0.5))"
                      : "linear-gradient(135deg,rgba(124,58,237,0.4),rgba(168,85,247,0.3))",
                    border:`1px solid ${isUltPending?"#c4b5fd":"#7c3aed"}`,
                    borderRadius:5,padding:"3px 0",
                    color:"#e9d5ff",fontSize:"0.54rem",fontWeight:700,cursor:"pointer",
                    animation:"ultCardGlow 1.2s ease-in-out infinite",
                    flexShrink:0,
                  }}>
                    {isUltPending ? "✨ もう一度で発動" : "✨ 必殺技"}
                  </button>
                )}
                {!canUlt&&(
                  <div style={{height:"24px",marginTop:3}}/>
                )}
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",gap:5,alignItems:"flex-start"}}>
          <div style={{flex:1,height:70,overflowY:"auto",background:"rgba(0,0,0,0.4)",
            borderRadius:7,padding:"4px 7px",fontSize:"0.6rem",lineHeight:1.6,
            border:"1px solid rgba(255,255,255,0.05)"}}>
            {state.log.slice(-30).map(l=>{
              const C={info:"#374151",player:"#e2e8f0",dmg:"#fbbf24",heal:"#4ade80",buff:"#67e8f9",
                enemy:"#f87171","enemy-dmg":"#fca5a5",ult:"#c4b5fd",warn:"#fb923c",danger:"#ef4444",
                av:"#1f2037",victory:"#fbbf24"};
              return <div key={l.id} style={{color:C[l.type]||"#4b5563"}}>{l.text}</div>;
            })}
          </div>

          {selChar&&!selChar.ko&&(()=>{
            const canRes=selChar.id==="saki"&&(selChar.resonanceCharge||0)>=100;
            const acts={
              ziran:[
                {id:"normal",label:"通常攻撃",sub:"量子/全体",spC:"+1",ok:true,icon:"⚔️"},
                {id:"skill", label:"戦闘スキル",sub:"量子/拡散",spC:"-1",ok:sp>=1,icon:"💫"},
              ],
              saki:[
                {id:"normal",    label:"通常攻撃",sub:"七彩/単体",  spC:"+1",ok:true,icon:"🌺"},
                {id:"skill",     label:"戦闘スキル",sub:"花畑+頼友",spC:"-1",ok:sp>=1,icon:"🌸"},
                {id:"resonance", label:"共鳴スキル",sub:`${selChar.resonanceCharge||0}%`,spC:"+1",ok:canRes,icon:"💠",charge:true},
              ],
              ouma:[
                {id:"normal",label:"通常攻撃",sub:"風/単体",spC:"+1",ok:true,icon:"🌸"},
                {id:"skill", label:"戦闘スキル",sub:"風/全体+回復",spC:"-1",ok:sp>=1,icon:"🌿"},
              ],
              miroku:[
                {id:"normal",label:"通常攻撃",sub:`風/単体 X+${1+(selChar.xValBonus||0)}`,spC:"+1",ok:true,icon:"💨"},
                {id:"skill", label:"戦闘スキル",sub:`風/全体 X+${4+(selChar.xValBonus||0)}`,spC:"-1",ok:sp>=1,icon:"🌀"},
              ],
            }[selChar.id]||[];

            const handleBtnTap = (a) => {
              if(!a.ok) return;
              if(ultPending === selChar.id) return;
              if(selectedAction !== a.id){
                setSelectedAction(a.id);
              } else {
                handleAction(selChar.id, a.id);
              }
            };

            const showAllyTarget = selChar.id==="saki" && (selectedAction==="skill" || ultPending==="saki");
            return(
              <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                {showAllyTarget&&(
                  <div style={{display:"flex",gap:3}}>
                    {partyIds.filter(id=>!chars[id]?.ko).map(id=>{
                      const ac=chars[id]; if(!ac) return null;
                      const isSel=allyTarget===id;
                      return(
                        <div key={id} onClick={()=>setAllyTarget(id)} style={{
                          flex:1,padding:"4px 3px",
                          background:isSel?`${ac.color}22`:"rgba(255,255,255,0.04)",
                          border:`1.5px solid ${isSel?ac.color:"rgba(255,255,255,0.1)"}`,
                          borderRadius:7,cursor:"pointer",textAlign:"center",
                          boxShadow:isSel?`0 0 10px ${ac.color}55`:"none",transition:"all .12s",
                        }}>
                          <div style={{fontSize:"0.95rem"}}>{ac.icon}</div>
                          <div style={{fontSize:"0.46rem",fontWeight:700,color:isSel?ac.color:"#4b5563"}}>{ac.name}</div>
                          {isSel&&<div style={{fontSize:"0.38rem",color:ac.color}}>頼友▲</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{display:"flex",gap:4}}>
                {acts.map(a=>{
                  const isCursor = selectedAction === a.id;
                  const isLocked = !!ultPending;
                  const effectiveOk = isLocked ? false : a.ok;
                  const cursorColor = a.charge ? "#5eead4" : "#ffffff";
                  return(
                    <button key={a.id} disabled={!effectiveOk} onClick={()=>handleBtnTap(a)} style={{
                      width:58, height:70,
                      background: isLocked ? "rgba(255,255,255,0.01)"
                        : !effectiveOk?"rgba(255,255,255,0.02)"
                        :a.charge?"linear-gradient(135deg,rgba(20,184,166,0.4),rgba(20,184,166,0.2))"
                        :"rgba(255,255,255,0.07)",
                      border: isCursor && effectiveOk
                        ? `2px solid ${cursorColor}`
                        : isLocked ? "1px solid rgba(255,255,255,0.04)"
                        : `1px solid ${!effectiveOk?"#1a1a2e":a.charge?"#14b8a6":selChar.color+"44"}`,
                      borderRadius:10,
                      color: isLocked ? "#1a1a2e" : effectiveOk?"white":"#2a2a55",
                      cursor: effectiveOk?"pointer":"not-allowed", textAlign:"center",
                      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
                      boxShadow: isCursor && effectiveOk
                        ? `0 0 14px ${cursorColor}cc, inset 0 0 8px ${cursorColor}22`
                        : effectiveOk?`0 0 6px ${selChar.color}22`:"none",
                      transition:"all .12s",
                      position:"relative",
                      filter: isLocked ? "grayscale(1) opacity(0.18)" : "none",
                    }}>
                      {isCursor && effectiveOk && (
                        <div style={{
                          position:"absolute", top:3, right:3,
                          width:5, height:5, borderRadius:"50%",
                          background:cursorColor,
                          boxShadow:`0 0 6px ${cursorColor}`,
                        }}/>
                      )}
                      {isCursor && effectiveOk && (
                        <div style={{
                          position:"absolute", bottom:0, left:0, right:0,
                          fontSize:"0.38rem", color:cursorColor,
                          textAlign:"center", letterSpacing:1,
                          padding:"1px 0 2px",
                          background:"rgba(0,0,0,0.5)",
                          borderRadius:"0 0 9px 9px",
                          opacity:0.9,
                        }}>▶ もう一度</div>
                      )}
                      <div style={{fontSize:"1.1rem"}}>{a.icon}</div>
                      <div style={{fontSize:"0.54rem",fontWeight:700,lineHeight:1.2,
                        color: isCursor&&effectiveOk ? cursorColor : "inherit"}}>{a.label}</div>
                      <div style={{fontSize:"0.46rem",color:effectiveOk&&!isLocked?"rgba(255,255,255,0.5)":"#1f2035"}}>{a.sub}</div>
                      <div style={{fontSize:"0.44rem",color:effectiveOk&&!isLocked?"#60a5fa":"#1f2035"}}>SP:{a.spC}</div>
                    </button>
                  );
                })}
                </div>
              </div>
            );
          })()}
          {isEnemyTurn&&(
            <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",
              justifyContent:"center",width:120,height:70,
              background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.2)",
              borderRadius:10,animation:"warnPulse .8s ease-in-out infinite"}}>
              <div style={{fontSize:"0.65rem",color:"#fbbf24",fontWeight:700}}>⚔️ 敵ターン</div>
              <div style={{fontSize:"0.52rem",color:"#94a3b8",marginTop:2}}>EP満タンなら</div>
              <div style={{fontSize:"0.52rem",color:"#a78bfa",fontWeight:700}}>必殺技発動可</div>
            </div>
          )}
        </div>

        <button
          onClick={()=>openReport("ally",partyIds[0]||"ziran",null)}
          style={{
            position:"absolute", bottom:8, left:8,
            background:"linear-gradient(135deg,rgba(30,30,70,0.9),rgba(20,20,50,0.95))",
            border:"1px solid rgba(167,139,250,0.4)",
            borderRadius:10, padding:"6px 10px",
            color:"#c4b5fd", fontSize:"0.6rem", fontWeight:700,
            cursor:"pointer", display:"flex", alignItems:"center", gap:5,
            boxShadow:"0 0 12px rgba(124,58,237,0.25)",
            zIndex:20,
          }}>
          📋<span>戦闘実況</span>
        </button>
      </div>

      {state.victory&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(4px)"}}>
          <div style={{background:"#12122a",border:"2px solid #fcd34d",borderRadius:16,padding:"24px 32px",textAlign:"center",boxShadow:"0 0 40px rgba(252,211,77,0.3)"}}>
            <div style={{fontSize:"1.8rem",marginBottom:3}}>🎉</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"1.6rem",fontWeight:900,color:"#fcd34d"}}>VICTORY!</div>
            <div style={{fontSize:"1.4rem",letterSpacing:3,margin:"6px 0"}}>
              {"⭐".repeat(state.stars||0)}{"☆".repeat(3-(state.stars||0))}
            </div>
            <div style={{color:"#6b7280",fontSize:"0.75rem",margin:"0 0 14px"}}>全ウェーブ撃破！完全勝利！（{state.currentRound}ラウンドで撃破）</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={reset} style={{background:"linear-gradient(135deg,#fbbf24,#f97316)",border:"none",color:"white",padding:"8px 16px",borderRadius:8,fontSize:"0.85rem",fontWeight:700,cursor:"pointer"}}>もう一度</button>
              {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#e2e8f0",padding:"8px 16px",borderRadius:8,fontSize:"0.85rem",cursor:"pointer"}}>ロビーへ</button>}
            </div>
          </div>
        </div>
      )}
      {state.gameOver&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(4px)"}}>
          <div style={{background:"#12122a",border:"2px solid #ef4444",borderRadius:16,padding:"24px 32px",textAlign:"center",boxShadow:"0 0 40px rgba(239,68,68,0.3)"}}>
            <div style={{fontSize:"1.8rem",marginBottom:3}}>💀</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"1.6rem",fontWeight:900,color:"#ef4444"}}>DEFEAT</div>
            <div style={{color:"#6b7280",fontSize:"0.75rem",margin:"5px 0 14px"}}>全滅...</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={reset} style={{background:"linear-gradient(135deg,#ef4444,#dc2626)",border:"none",color:"white",padding:"8px 16px",borderRadius:8,fontSize:"0.85rem",fontWeight:700,cursor:"pointer"}}>再挑戦</button>
              {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#e2e8f0",padding:"8px 16px",borderRadius:8,fontSize:"0.85rem",cursor:"pointer"}}>ロビーへ</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
