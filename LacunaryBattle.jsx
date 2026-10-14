import { useState, useRef, useEffect } from "react";

// ═══════════════════════════════════════════════════
//  SHARED HELPERS
// ═══════════════════════════════════════════════════
const clone  = o => JSON.parse(JSON.stringify(o));
const addLog = (logs, text, type="info") => [...logs, {id:Date.now()+Math.random(), text, type}];
const fmt    = n => n>=1000000?`${(n/1000000).toFixed(2)}M`:n>=1000?`${(n/1000).toFixed(1)}k`:String(n);
const roll   = p => Math.random() < p;

const CHAR_LV = 80;
const charLvValue = (lv=CHAR_LV) => 3767.5533;
const toughnessRatioOf = (maxToughness=30) => 0.5 + maxToughness/40;

const calcDmgCore = (atk, ratio, def=600, ignoreDef=0, elemRes=0, cr=0, cd=1.5, dmgBonus=0, opts={}) => {
  const {
    enemyLv=80, atkerLv=CHAR_LV, defDownPct=0, vulnBonus=0, breakMult=0.9, dmgAdd=0,
  } = opts;
  const dmgBase = atk*ratio + dmgAdd;
  const isCrit = roll(cr);
  const critMult = isCrit ? (1+cd) : 1;
  const dmgBonusMult = 1+dmgBonus;
  const enemyDef = (200+10*enemyLv)*(1-defDownPct-ignoreDef);
  const defMult = (200+10*atkerLv) / (enemyDef + 200+10*atkerLv);
  const resMult = Math.max(0, 1-elemRes);
  const vulnMult = 1+vulnBonus;
  const dmg = dmgBase*critMult*dmgBonusMult*defMult*resMult*vulnMult*breakMult;
  return { value: Math.floor(dmg), isCrit };
};

const calcDmg = (atk, ratio, def=600, ignoreDef=0, elemRes=0, cr=0, cd=1.5, dmgBonus=0, opts={}) => {
  return calcDmgCore(atk, ratio, def, ignoreDef, elemRes, cr, cd, dmgBonus, opts).value;
};

const ELEM_BREAK_MULT = { physical:2, fire:2, ice:1, lightning:1, wind:1.5, quantum:0.5, imaginary:0.5, other:2 };
const calcBreakDmg = (elem, maxToughness, breakEffect=0, enemyLv=80, defDownPct=0, ignoreDef=0, elemRes=0, vulnBonus=0) => {
  const ratio = toughnessRatioOf(maxToughness);
  const base = charLvValue(CHAR_LV) * (ELEM_BREAK_MULT[elem]??1) * ratio;
  const enemyDef = (200+10*enemyLv)*(1-defDownPct-ignoreDef);
  const defMult = (200+10*CHAR_LV) / (enemyDef + 200+10*CHAR_LV);
  const resMult = Math.max(0, 1-elemRes);
  const vulnMult = 1+vulnBonus;
  return Math.floor(base*(1+breakEffect)*defMult*resMult*vulnMult*0.9);
};

const calcDotBase = (mult, enemyLv, defDownPct=0, ignoreDef=0, elemRes=0, vulnBonus=0, breakMult=0.9) => {
  const base = charLvValue(CHAR_LV) * mult;
  const enemyDef = (200+10*enemyLv)*(1-defDownPct-ignoreDef);
  const defMult = (200+10*CHAR_LV) / (enemyDef + 200+10*CHAR_LV);
  const resMult = Math.max(0, 1-elemRes);
  const vulnMult = 1+vulnBonus;
  return Math.floor(base*defMult*resMult*vulnMult*breakMult);
};

const getEpEff = c => c.buffs.reduce((a,b)=>a+(b.type==="ep_eff"?(b.value||0):0),0);
const gainEP   = (c, base, eff=true) => {
  const real=Math.floor(base*(1+(eff?getEpEff(c):0)));
  c.ep=Math.min(c.maxEp,c.ep+real); return real;
};

function Bar({pct,color,h=5}){
  return(
    <div style={{background:"#1a1a2e",borderRadius:3,height:h,overflow:"hidden",flex:1}}>
      <div style={{width:`${Math.max(0,Math.min(100,pct))}%`,height:"100%",background:color,transition:"width .3s",borderRadius:3}}/>
    </div>
  );
}

const ELEM_COLORS = {
  quantum:  { crit:"#9d4dff", nonCrit:"#4a1a7a", stroke:"#3b0f5e" },
  wind:     { crit:"#4ade80", nonCrit:"#166634", stroke:"#14532d" },
  ice:      { crit:"#67e8f9", nonCrit:"#164e63", stroke:"#0e4050" },
  lightning:{ crit:"#c084fc", nonCrit:"#6b21a8", stroke:"#4c1d75" },
  fire:     { crit:"#f87171", nonCrit:"#7f1d1d", stroke:"#6b1a1a" },
  imaginary:{ crit:"#fbbf24", nonCrit:"#78350f", stroke:"#6b2f0a" },
  physical: { crit:"#f1f5f9", nonCrit:"#64748b", stroke:"#334155" },
  other:    { crit:"#f1f5f9", nonCrit:"#64748b", stroke:"#334155" },
};

// ═══════════════════════════════════════════════════
//  LOBBY
// ═══════════════════════════════════════════════════
const ALL_CHARS = [
  { id:"ziran", name:"紫蘭", icon:"⚔️", role:"アタッカー", element:"量子", path:"及落", stars:5, color:"#a78bfa", hp:1789, atk:951, spd:110, desc:"X値を蓄積して爆発的なダメージを叩き出す量子アタッカー。" },
  { id:"saki",  name:"咲希", icon:"🌺", role:"サポート",   element:"七彩", path:"調和", stars:5, color:"#f9a8d4", hp:1206, atk:1033,spd:102, desc:"頼友・花畑・結界で味方全体を強化する万能サポーター。" },
  { id:"ouma",  name:"桜舞", icon:"🌸", role:"ヒーラー",   element:"風",   path:"豊穣", stars:5, color:"#86efac", hp:2133, atk:336, spd:105, desc:"連兎を召喚してパーティを継続回復させる万能ヒーラー。" },
  { id:"tsukasa", name:"ツカサ", icon:"🗡️", role:"アタッカー", element:"凛刃", path:"壊滅", stars:5, color:"#f87171", hp:1215, atk:625, spd:103, desc:"剣術を駆使する物理派生・凛刃属性の壊滅アタッカー。（簡易版）" },
  { id:"ren",   name:"蓮",   icon:"🔥", role:"アタッカー", element:"炎",   path:"殲滅", stars:4, color:"#fb923c", hp:1240, atk:820, spd:108, desc:"灼熱の炎で敵全体を薙ぎ払う攻撃型アタッカー。" },
  { id:"tsuki", name:"月影", icon:"🌙", role:"デバッファー",element:"氷",   path:"虚無", stars:4, color:"#93c5fd", hp:980,  atk:750, spd:98,  desc:"氷結と凍傷で敵を弱体化させる戦術型デバッファー。" },
  { id:"kaze",  name:"風牙", icon:"💨", role:"サポート",   element:"風",   path:"調和", stars:4, color:"#6ee7b7", hp:890,  atk:680, spd:115, desc:"高速行動で味方のターンを増やすスピード型サポーター。" },
  { id:"miroku",name:"ミロク",icon:"🌀", role:"召喚士",    element:"風",   path:"記憶", stars:5, color:"#34d399", hp:872,  atk:338, spd:115, desc:"リノセウスを召喚し、Xを活かしたバウンド攻撃で敵を薙ぎ払う記憶の召喚士。" },
];

const DEFAULT_SLOTS = ["ziran","saki","ouma"];
const DIFFICULTIES = ["Normal","Hard","Extreme"];
const DIFF_COLOR = { Normal:"#4ade80", Hard:"#fbbf24", Extreme:"#ef4444" };

function StarRating({ count }) {
  return (
    <div style={{display:"flex",gap:1}}>
      {Array.from({length:count}).map((_,i)=>(
        <span key={i} style={{fontSize:"0.5rem",color:"#fbbf24",lineHeight:1}}>★</span>
      ))}
    </div>
  );
}

function StatBar({ label, value, max, color }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:5}}>
      <span style={{fontSize:"0.46rem",color:"#4b5563",width:20,flexShrink:0}}>{label}</span>
      <div style={{flex:1,background:"rgba(0,0,0,0.5)",borderRadius:2,height:3,overflow:"hidden"}}>
        <div style={{width:`${Math.min(100,(value/max)*100)}%`,height:"100%",background:color,borderRadius:2}}/>
      </div>
      <span style={{fontSize:"0.46rem",color:"#6b7280",minWidth:28,textAlign:"right"}}>{value}</span>
    </div>
  );
}

function SlotCard({ char, slotIdx, isActive, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onTap, onRemove }) {
  if(!char) return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={onTap}
      style={{flex:1,minHeight:170,border:`2px dashed ${isDragOver?"#fbbf24":"rgba(255,255,255,0.1)"}`,
        borderRadius:14,background:isDragOver?"rgba(251,191,36,0.07)":"rgba(255,255,255,0.02)",
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,
        cursor:"pointer",transition:"all .15s"}}>
      <div style={{fontSize:"1.8rem",opacity:0.25}}>＋</div>
      <div style={{fontSize:"0.56rem",color:"#2a2a55"}}>スロット {slotIdx+1}</div>
    </div>
  );
  return (
    <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={onTap}
      style={{flex:1,minHeight:170,
        background:isActive?`linear-gradient(160deg,${char.color}22,rgba(0,0,0,0.6))`:"linear-gradient(160deg,rgba(255,255,255,0.05),rgba(0,0,0,0.4))",
        border:`1.5px solid ${isDragOver?"#fbbf24":isActive?char.color+"66":"rgba(255,255,255,0.08)"}`,
        borderRadius:14,padding:"10px 10px 8px",position:"relative",cursor:"grab",
        transition:"all .15s",boxShadow:isActive?`0 0 20px ${char.color}22`:"none",overflow:"hidden"}}>
      <div style={{position:"absolute",top:7,left:8,fontSize:"0.46rem",fontFamily:"Rajdhani,sans-serif",fontWeight:700,
        color:slotIdx===0?"#fbbf24":"#374151",letterSpacing:1}}>
        {slotIdx===0?"★先頭":String(slotIdx+1).padStart(2,"0")}
      </div>
      <button onClick={(e)=>{e.stopPropagation();onRemove();}} style={{position:"absolute",top:5,right:6,
        background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",
        borderRadius:5,color:"#ef4444",fontSize:"0.52rem",cursor:"pointer",padding:"1px 5px",lineHeight:1.4,zIndex:5}}>✕</button>
      <div style={{textAlign:"center",marginBottom:6,paddingTop:4}}>
        <div style={{fontSize:"2.2rem",lineHeight:1,filter:`drop-shadow(0 0 10px ${char.color}88)`,marginBottom:3}}>{char.icon}</div>
        <div style={{fontSize:"0.85rem",fontWeight:900,color:char.color,letterSpacing:1}}>{char.name}</div>
        <StarRating count={char.stars}/>
      </div>
      <div style={{display:"flex",gap:3,flexWrap:"wrap",justifyContent:"center",marginBottom:6}}>
        <span style={{fontSize:"0.44rem",background:`${char.color}22`,color:char.color,padding:"1px 5px",borderRadius:5}}>{char.element}</span>
        <span style={{fontSize:"0.44rem",background:"rgba(255,255,255,0.05)",color:"#6b7280",padding:"1px 5px",borderRadius:5}}>{char.role}</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        <StatBar label="HP"  value={char.hp}  max={2200} color={char.color}/>
        <StatBar label="ATK" value={char.atk} max={1100} color="#fbbf24"/>
        <StatBar label="SPD" value={char.spd} max={120}  color="#60a5fa"/>
      </div>
    </div>
  );
}

function CharListCard({ char, isSelected, isInSlot, pickOrder, onSelect }) {
  return (
    <div onClick={onSelect}
      style={{background:isSelected?`linear-gradient(135deg,${char.color}22,rgba(0,0,0,0.5))`:"rgba(255,255,255,0.03)",
        border:`1.5px solid ${isSelected?char.color:isInSlot?"rgba(255,255,255,0.12)":"rgba(255,255,255,0.06)"}`,
        borderRadius:10,padding:"7px 10px",cursor:isInSlot&&!isSelected?"default":"pointer",
        display:"flex",alignItems:"center",gap:8,opacity:isInSlot&&!isSelected?0.4:1,
        position:"relative",transition:"all .12s",boxShadow:isSelected?`0 0 12px ${char.color}44`:"none"}}>
      {isSelected&&pickOrder!==null&&(
        <div style={{position:"absolute",top:4,right:6,background:char.color,color:"#0a0a1a",
          fontSize:"0.52rem",fontWeight:900,borderRadius:4,padding:"0 4px",lineHeight:1.6,fontFamily:"Rajdhani,sans-serif"}}>{pickOrder+1}</div>
      )}
      <div style={{fontSize:"1.4rem",filter:`drop-shadow(0 0 6px ${char.color}66)`}}>{char.icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
          <span style={{fontSize:"0.7rem",fontWeight:700,color:char.color}}>{char.name}</span>
          <StarRating count={char.stars}/>
        </div>
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          <span style={{fontSize:"0.44rem",background:`${char.color}18`,color:char.color,padding:"0 4px",borderRadius:4}}>{char.element}</span>
          <span style={{fontSize:"0.44rem",color:"#4b5563"}}>{char.role}</span>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:48}}>
        <StatBar label="HP"  value={char.hp}  max={2200} color={char.color}/>
        <StatBar label="SPD" value={char.spd} max={120}  color="#60a5fa"/>
      </div>
    </div>
  );
}

const ENEMY_LV_BY_DIFF = { Normal:60, Hard:80, Extreme:100 };
const BOSS_LV_BY_DIFF  = { Normal:80, Hard:100, Extreme:120 };

async function saveBattleRating(stage, diff, stars) {
  try{
    const key=`rating:${stage}:${diff}`; let prevStars=0;
    try{ const r=await window.storage?.get(key,false); if(r) prevStars=JSON.parse(r.value)?.stars||0; }catch(e){}
    if(stars>prevStars) await window.storage?.set(key,JSON.stringify({stars}),false);
  }catch(e){}
}
async function loadBattleRating(stage,diff){
  try{ const r=await window.storage?.get(`rating:${stage}:${diff}`,false); if(r) return JSON.parse(r.value)?.stars||0; }catch(e){}
  return 0;
}

function Lobby({ onStartNormal, onStartBoss }) {
  const [mode, setMode] = useState(null); // null | "pve" | "pvp"
  const [slots, setSlots] = useState(DEFAULT_SLOTS);
  const [savedSlots, setSavedSlots] = useState(DEFAULT_SLOTS);
  const [diff, setDiff] = useState("Normal");
  const [quickMode, setQuickMode] = useState(false);
  const [quickPicks, setQuickPicks] = useState([]);
  const [activeSlot, setActiveSlot] = useState(null);
  const [dragSrc, setDragSrc] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [ratings, setRatings] = useState({ normal:{}, boss:{} });

  useEffect(()=>{
    let mounted = true;
    (async ()=>{
      const stages = ["normal","boss"];
      const diffs = ["Normal","Hard","Extreme"];
      const next = { normal:{}, boss:{} };
      for(const stage of stages){
        for(const d of diffs){
          next[stage][d] = await loadBattleRating(stage, d);
        }
      }
      if(mounted) setRatings(next);
    })();
    return ()=>{ mounted=false; };
  }, []);

  const isDirty = JSON.stringify(slots) !== JSON.stringify(savedSlots);

  const handleDragStart = (idx) => setDragSrc(idx);
  const handleDragOver  = (e,idx) => { e.preventDefault(); setDragOver(idx); };
  const handleDragLeave = () => setDragOver(null);
  const handleDrop = (e,idx) => {
    e.preventDefault();
    if(dragSrc===null||dragSrc===idx){ setDragOver(null); return; }
    const next=[...slots]; [next[dragSrc],next[idx]]=[next[idx],next[dragSrc]];
    setSlots(next); setDragSrc(null); setDragOver(null);
  };

  const handleSlotTap = (idx) => {
    if(quickMode) return;
    setActiveSlot(activeSlot===idx?null:idx);
  };

  const handleCharPick = (charId) => {
    if(activeSlot===null) return;
    const next=[...slots];
    const existIdx=next.indexOf(charId);
    if(existIdx!==-1&&existIdx!==activeSlot) next[existIdx]=next[activeSlot];
    next[activeSlot]=charId;
    setSlots(next); setActiveSlot(null);
  };

  const toggleQuick = () => { setQuickMode(v=>!v); setQuickPicks([]); setActiveSlot(null); };

  const handleQuickPick = (charId) => {
    if(quickPicks.includes(charId)){ setQuickPicks(prev=>prev.filter(id=>id!==charId)); return; }
    if(quickPicks.length>=3) return;
    const next=[...quickPicks,charId]; setQuickPicks(next);
    if(next.length===3){ setSlots(next); setQuickMode(false); setQuickPicks([]); }
  };

  const handleRemove = (idx) => { const next=[...slots]; next[idx]=null; setSlots(next); };
  const handleSave   = () => { setSavedSlots([...slots]); };

  const filledCount = slots.filter(Boolean).length;
  const canBattle   = filledCount>=1;

  if(!mode) return (
    <div style={{fontFamily:"'Noto Sans JP',sans-serif",background:"linear-gradient(180deg,#0a0e1a 0%,#080c14 100%)",
      color:"#e2e8f0",height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      gap:24,userSelect:"none",position:"relative",overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Rajdhani:wght@600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes floatUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      `}</style>
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(255,255,255,0.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.012) 1px,transparent 1px)",backgroundSize:"40px 40px",pointerEvents:"none"}}/>

      <div style={{textAlign:"center",marginBottom:8}}>
        <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"2.2rem",fontWeight:700,letterSpacing:6,
          background:"linear-gradient(135deg,#fcd34d,#a78bfa,#f9a8d4)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1}}>
          LACUNARY
        </div>
        <div style={{fontSize:"0.55rem",color:"#374151",letterSpacing:4,marginTop:4,fontFamily:"Rajdhani,sans-serif"}}>BATTLE SIMULATOR</div>
      </div>

      <div style={{display:"flex",gap:14,padding:"0 20px",width:"100%",maxWidth:380}}>
        {[
          {id:"pve",label:"PvE",sub:"ストーリー・ボス戦",icon:"⚔️",color:"#fbbf24",desc:"ステージを攻略しよう"},
          {id:"pvp",label:"PvP",sub:"対人戦（近日公開）",icon:"🏆",color:"#a78bfa",desc:"準備中",disabled:true},
        ].map(m=>(
          <button key={m.id} onClick={()=>!m.disabled&&setMode(m.id)} style={{
            flex:1,padding:"20px 10px",
            background:m.disabled?"rgba(255,255,255,0.02)":`linear-gradient(160deg,${m.color}18,rgba(0,0,0,0.5))`,
            border:`1.5px solid ${m.disabled?"rgba(255,255,255,0.06)":m.color+"55"}`,
            borderRadius:16,cursor:m.disabled?"default":"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:6,
            opacity:m.disabled?0.4:1,
            boxShadow:m.disabled?"none":`0 0 20px ${m.color}22`,
            transition:"all .15s",
          }}>
            <div style={{fontSize:"2rem",animation:m.disabled?"none":"floatUp 3s ease-in-out infinite"}}>{m.icon}</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"1.3rem",fontWeight:700,color:m.disabled?"#374151":m.color,letterSpacing:2}}>{m.label}</div>
            <div style={{fontSize:"0.54rem",color:m.disabled?"#1f2035":"#94a3b8"}}>{m.sub}</div>
            {m.disabled&&<div style={{fontSize:"0.48rem",color:"#374151",background:"rgba(255,255,255,0.04)",padding:"2px 8px",borderRadius:5,border:"1px solid rgba(255,255,255,0.06)"}}>準備中</div>}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Noto Sans JP',sans-serif",background:"linear-gradient(180deg,#0a0e1a 0%,#080c14 100%)",
      color:"#e2e8f0",height:"100vh",display:"flex",flexDirection:"column",position:"relative",overflow:"hidden",userSelect:"none"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Rajdhani:wght@600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#2a2a55;border-radius:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
      `}</style>

      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:"linear-gradient(rgba(255,255,255,0.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.012) 1px,transparent 1px)",
        backgroundSize:"40px 40px"}}/>

      <div style={{position:"relative",zIndex:10,padding:"12px 14px 0",
        background:"linear-gradient(180deg,rgba(0,0,0,0.7),transparent)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <button onClick={()=>setMode(null)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",
            color:"#94a3b8",padding:"4px 10px",borderRadius:7,fontSize:"0.6rem",cursor:"pointer"}}>◀ 戻る</button>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"1.5rem",fontWeight:700,letterSpacing:4,
            background:"linear-gradient(135deg,#fcd34d,#a78bfa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            LACUNARY
          </div>
          <div style={{flex:1,height:1,background:"linear-gradient(90deg,rgba(167,139,250,0.4),transparent)"}}/>
          <div style={{fontSize:"0.5rem",color:"#4b5563",fontFamily:"Rajdhani,sans-serif",letterSpacing:2}}>PvE LOBBY</div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
          <span style={{fontSize:"0.52rem",color:"#4b5563"}}>難易度：</span>
          {DIFFICULTIES.map(d=>(
            <button key={d} onClick={()=>setDiff(d)} style={{
              padding:"3px 10px",
              background:diff===d?`${DIFF_COLOR[d]}22`:"rgba(255,255,255,0.04)",
              border:`1px solid ${diff===d?DIFF_COLOR[d]:"rgba(255,255,255,0.08)"}`,
              borderRadius:7,color:diff===d?DIFF_COLOR[d]:"#4b5563",
              fontSize:"0.62rem",fontWeight:diff===d?700:400,cursor:"pointer",
              boxShadow:diff===d?`0 0 10px ${DIFF_COLOR[d]}44`:"none",
              transition:"all .12s",
              display:"flex",flexDirection:"column",alignItems:"center",gap:1,
            }}>
              <span>{d}</span>
              <span style={{fontSize:"0.42rem",opacity:0.7}}>Lv.{ENEMY_LV_BY_DIFF[d]}/{BOSS_LV_BY_DIFF[d]}</span>
            </button>
          ))}
          <div style={{marginLeft:"auto",display:"flex",gap:5}}>
            <span style={{fontSize:"0.52rem",color:"#374151"}}>{filledCount}/3 編成</span>
            <button onClick={toggleQuick} style={{
              background:quickMode?"linear-gradient(135deg,rgba(167,139,250,0.4),rgba(139,92,246,0.3))":"rgba(255,255,255,0.06)",
              border:`1px solid ${quickMode?"#a78bfa":"rgba(255,255,255,0.12)"}`,
              color:quickMode?"#c4b5fd":"#94a3b8",padding:"4px 8px",borderRadius:7,
              fontSize:"0.58rem",fontWeight:quickMode?700:400,cursor:"pointer",
            }}>{quickMode?"✕ キャンセル":"⚡ クイック"}</button>
          </div>
        </div>
      </div>

      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",padding:"0 10px",gap:8,position:"relative",zIndex:5}}>

        {quickMode&&(
          <div style={{background:"rgba(167,139,250,0.1)",border:"1px solid rgba(167,139,250,0.3)",
            borderRadius:8,padding:"5px 12px",display:"flex",alignItems:"center",gap:6,
            animation:"pulse 1.5s ease-in-out infinite"}}>
            <span style={{fontSize:"0.54rem",color:"#a78bfa"}}>⚡ キャラを順番にタップ → スロット1→2→3</span>
            <div style={{marginLeft:"auto",display:"flex",gap:3}}>
              {[0,1,2].map(i=>(
                <div key={i} style={{width:16,height:16,borderRadius:4,
                  background:i<quickPicks.length?"#a78bfa":"rgba(255,255,255,0.08)",
                  border:`1px solid ${i<quickPicks.length?"#c4b5fd":"rgba(255,255,255,0.1)"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:"0.56rem",color:"#0a0a1a",fontWeight:900}}>{i<quickPicks.length?i+1:""}</div>
              ))}
            </div>
          </div>
        )}

        {activeSlot!==null&&!quickMode&&(
          <div style={{background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.25)",
            borderRadius:8,padding:"5px 12px",fontSize:"0.54rem",color:"#fbbf24"}}>
            スロット {activeSlot+1} ▸ 下のリストからキャラを選択{activeSlot===0?" （★先頭＝秘技対象）":""}
          </div>
        )}

        <div style={{fontSize:"0.48rem",color:"#4b5563",background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.12)",borderRadius:6,padding:"3px 8px"}}>
          ★ スロット1（先頭）が秘技対象・行動順の基準になります。ドラッグで並び替え可。
        </div>

        <div style={{display:"flex",gap:8}}>
          {slots.map((charId,idx)=>{
            const char=charId?ALL_CHARS.find(c=>c.id===charId):null;
            return(
              <SlotCard key={idx} char={char} slotIdx={idx}
                isActive={activeSlot===idx} isDragOver={dragOver===idx}
                onDragStart={()=>handleDragStart(idx)}
                onDragOver={(e)=>handleDragOver(e,idx)}
                onDragLeave={handleDragLeave}
                onDrop={(e)=>handleDrop(e,idx)}
                onTap={()=>handleSlotTap(idx)}
                onRemove={()=>handleRemove(idx)}/>
            );
          })}
        </div>

        {(quickMode||activeSlot!==null)&&(
          <div style={{background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.07)",
            borderRadius:12,padding:"8px",overflowY:"auto",maxHeight:200}}>
            <div style={{fontSize:"0.5rem",color:"#4b5563",letterSpacing:1,marginBottom:6,fontFamily:"Rajdhani,sans-serif"}}>
              {quickMode?"QUICK SELECT":`SLOT ${activeSlot+1} — キャラ選択`}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {ALL_CHARS.map(char=>{
                const isInSlot=slots.includes(char.id);
                const isSelected=quickMode?quickPicks.includes(char.id):slots[activeSlot]===char.id;
                const pickOrder=quickMode?quickPicks.indexOf(char.id):-1;
                return(
                  <CharListCard key={char.id} char={char}
                    isSelected={isSelected}
                    isInSlot={!quickMode&&isInSlot&&slots[activeSlot]!==char.id}
                    pickOrder={quickMode&&isSelected?pickOrder:null}
                    onSelect={()=>quickMode?handleQuickPick(char.id):handleCharPick(char.id)}/>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{flexShrink:0,padding:"8px 10px 12px",
        background:"linear-gradient(0deg,rgba(0,0,0,0.9),rgba(0,0,0,0.6))",
        borderTop:"1px solid rgba(255,255,255,0.07)",position:"relative",zIndex:10}}>

        {isDirty&&(
          <div style={{fontSize:"0.5rem",color:"#f97316",marginBottom:6,
            background:"rgba(249,115,22,0.1)",border:"1px solid rgba(249,115,22,0.25)",
            borderRadius:6,padding:"3px 8px",display:"inline-flex",alignItems:"center",gap:4}}>
            ● 未保存の変更
            <button onClick={handleSave} style={{background:"rgba(249,115,22,0.2)",border:"1px solid rgba(249,115,22,0.4)",
              color:"#fb923c",padding:"1px 6px",borderRadius:4,fontSize:"0.48rem",cursor:"pointer"}}>保存</button>
          </div>
        )}

        <div style={{marginBottom:8}}>
          <div style={{fontSize:"0.52rem",color:"#4b5563",letterSpacing:1,marginBottom:5,fontFamily:"Rajdhani,sans-serif"}}>STAGE SELECT</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>canBattle&&onStartNormal(slots.filter(Boolean),diff)} disabled={!canBattle}
              style={{flex:1,padding:"10px 8px",
                background:canBattle?"linear-gradient(135deg,rgba(251,191,36,0.3),rgba(245,158,11,0.15))":"rgba(255,255,255,0.02)",
                border:`1.5px solid ${canBattle?"#fbbf24":"rgba(255,255,255,0.05)"}`,
                borderRadius:12,cursor:canBattle?"pointer":"default",
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                boxShadow:canBattle?"0 0 15px rgba(251,191,36,0.2)":"none",transition:"all .15s"}}>
              <div style={{fontSize:"1.4rem"}}>🖊️</div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"0.85rem",fontWeight:700,
                color:canBattle?"#fcd34d":"#2a2a55",letterSpacing:1}}>通常戦</div>
              <div style={{fontSize:"0.48rem",color:canBattle?"#94a3b8":"#1f2035"}}>ラクガキ×5 / WAVE 3</div>
              <div style={{fontSize:"0.46rem",background:`${DIFF_COLOR[diff]}22`,color:DIFF_COLOR[diff],
                padding:"1px 6px",borderRadius:4,border:`1px solid ${DIFF_COLOR[diff]}44`}}>{diff}</div>
              <div style={{fontSize:"0.62rem",letterSpacing:1,marginTop:1}}>
                {"⭐".repeat(ratings.normal[diff]||0)}{"☆".repeat(3-(ratings.normal[diff]||0))}
              </div>
            </button>

            <button onClick={()=>canBattle&&onStartBoss(slots.filter(Boolean),diff)} disabled={!canBattle}
              style={{flex:1,padding:"10px 8px",
                background:canBattle?"linear-gradient(135deg,rgba(147,197,253,0.25),rgba(96,165,250,0.1))":"rgba(255,255,255,0.02)",
                border:`1.5px solid ${canBattle?"#93c5fd":"rgba(255,255,255,0.05)"}`,
                borderRadius:12,cursor:canBattle?"pointer":"default",
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                boxShadow:canBattle?"0 0 15px rgba(147,197,253,0.2)":"none",transition:"all .15s"}}>
              <div style={{fontSize:"1.4rem"}}>❄️</div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"0.85rem",fontWeight:700,
                color:canBattle?"#93c5fd":"#2a2a55",letterSpacing:1}}>ボス戦</div>
              <div style={{fontSize:"0.48rem",color:canBattle?"#94a3b8":"#1f2035"}}>カカリア / WAVE 1</div>
              <div style={{fontSize:"0.46rem",background:`${DIFF_COLOR[diff]}22`,color:DIFF_COLOR[diff],
                padding:"1px 6px",borderRadius:4,border:`1px solid ${DIFF_COLOR[diff]}44`}}>{diff}</div>
              <div style={{fontSize:"0.62rem",letterSpacing:1,marginTop:1}}>
                {"⭐".repeat(ratings.boss[diff]||0)}{"☆".repeat(3-(ratings.boss[diff]||0))}
              </div>
            </button>
          </div>
        </div>

        {!canBattle&&(
          <div style={{fontSize:"0.5rem",color:"#374151",textAlign:"center"}}>キャラを1体以上編成してください</div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  NORMAL BATTLE
// ═══════════════════════════════════════════════════

const SARAN_SPD = 85;
const VALID_CHAR_IDS = ["ziran","saki","ouma","miroku"];
const CHAR_SPD = {ziran:110, saki:102, ouma:105, miroku:115};
const ENEMY_SPD = 90;
const ENEMY_IDS = ["e0","e1","e2","e3","e4"];

// パーティ編成順(party)から戦闘に使う有効キャラID配列を決定する。
// ziran/saki/ouma 以外は現状フル実装されていないため除外し、
// 有効なキャラが1人もいなければデフォルト編成にフォールバックする。
const resolvePartyIds = (party) => {
  const valid = (party||[]).filter(id => VALID_CHAR_IDS.includes(id));
  if(valid.length === 0) return ["ziran","saki","ouma"];
  return valid;
};

// ─── ラウンドシステム ───
const ROUND_KEY = "__round__";
const ROUND1_LEN = 150;
const ROUND_LEN = 100;
const MAX_ROUNDS = 6;

const advanceRoundBoundary = (s) => {
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

const calcStarRating = (s) => {
  let stars = 0;
  if(s.currentRound<=2) stars++;
  if(s.currentRound<=4) stars++;
  if(!s.koEverHappened) stars++;
  return stars;
};

// partyIds順にAVを初期化（編成順がそのまま速度計算の対象になる）
const mkAVs = (partyIds, eIds, hasSaran=false) => {
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
const pickActor = avs => Object.entries(avs).reduce((a,b)=>a[1]<=b[1]?a:b)[0];
const advanceAV = (avs, id, spd) => {
  const n={...avs};
  n[id]=Math.ceil(10000/spd); return n;
};
const adjIds = tid => {
  const i=ENEMY_IDS.indexOf(tid);
  return [ENEMY_IDS[i-1],ENEMY_IDS[i+1]].filter(Boolean);
};

// ═══════════════════════════════════════════════════════
//  WAVE CONFIG
// ═══════════════════════════════════════════════════════
const TOTAL_WAVES = 3;
const getWaveConfig = (wave) => {
  const hpMult  = 1 + (wave - 1) * 0.5;
  const atkMult = 1 + (wave - 1) * 0.25;
  const count   = 5;
  return { hpMult, atkMult, count };
};

// ═══════════════════════════════════════════════════════
//  キャラ定義
// ═══════════════════════════════════════════════════════
const OUMA_BASE  = 1496;
const OUMA_HP    = Math.floor(OUMA_BASE * 1.24 * 1.15 * 1.2);
const ZIRAN_ATK  = Math.floor((499 + 452) * 3.0);
const SAKI_ATK   = 542 + 491;

// mkChars: 編成順partyIdsの先頭キャラを秘技対象（頼友指定）にする
const mkChars = (partyIds) => {
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
const pickTauntWeighted = (charIds, charsObj) => {
  const weights = charIds.map(id => charsObj[id].taunt || 100);
  const total = weights.reduce((a,b)=>a+b, 0);
  let roll = Math.random() * total;
  for(let i=0; i<charIds.length; i++){
    roll -= weights[i];
    if(roll <= 0) return charIds[i];
  }
  return charIds[charIds.length-1];
};

const ENEMY_LV_BY_DIFF_LOCAL = ENEMY_LV_BY_DIFF;

const mkEnemy = (idx, wave=1, diff="Normal") => {
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
const mkState = (partyIds, wave=1, diff="Normal") => {
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
  return {
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

// ═══════════════════════════════════════════════════════
//  DAMAGE & BUFF HELPERS
// ═══════════════════════════════════════════════════════
const ELEM_STATUS = {
  physical:  { name:"裂創",   turns:2 },
  fire:      { name:"燃焼",   turns:2 },
  ice:       { name:"凍結",   turns:1 },
  lightning: { name:"感電",   turns:2 },
  wind:      { name:"風化",   turns:2 },
  quantum:   { name:"もつれ", turns:1 },
  imaginary: { name:"禁錮",   turns:1 },
};

const inflictBreakStatus = (s, target, elem, isElite=false, breakEffect=0) => {
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

const dmgToEnemy = (e, atk, ratio, elem, ignoreDef=0, cr=0, cd=1.5, dmgBonus=0) => {
  if(!e.alive) return 0;
  const breakMult = e.broken ? 1.0 : 0.9;
  return calcDmg(atk, ratio, e.def, ignoreDef, e.elemRes[elem]??0, cr, cd, dmgBonus,
    { enemyLv: e.lv||60, breakMult });
};

const hitTough = (s, e, val, elem) => {
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

const updateZiranLC = (s, gained) => {
  const z=s.chars.ziran;
  if(!z) return;
  s.xAccum=(s.xAccum||0)+gained;
  const stacks=Math.min(3,Math.floor(s.xAccum/30));
  if(stacks>(z.lcDmgStack||0)){
    z.lcDmgStack=stacks; z.lcDmgTurns=2;
    s.log=addLog(s.log,`  📖 紫蘭LC: 与ダメ+${stacks*10}%(${stacks}層,2T)`,"buff");
  }
};

const applyOumaLC = (s) => {
  const o=s.chars.ouma;
  if(!o) return;
  o.lcDmgStacks=Math.min(3,(o.lcDmgStacks||0)+1);
  const stacks=o.lcDmgStacks;
  Object.values(s.chars).forEach(ch=>{
    ch.buffs=ch.buffs.filter(b=>b.type!=="ouma_lc_dmg");
    ch.buffs.push({type:"ouma_lc_dmg",label:`回復与ダメ+${stacks*15}%`,turns:3,value:stacks*0.15});
  });
};

const healParty = (s, base) => {
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

const partyDmgBonus = (c, s) => {
  let b=0;
  c.buffs.forEach(bf=>{ if(bf.type==="ouma_lc_dmg") b+=bf.value||0; });
  const sk=s.chars.saki;
  if(sk && sk.hanabatake>0) b+=0.16;
  if(sk && sk.hanabatake>0) b+=0.24;
  return b;
};

const tickEnemyStatus = (s, e) => {
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

// ═══════════════════════════════════════════════════════
//  PLAYER ACTIONS
// ═══════════════════════════════════════════════════════
function applyPlayerAction(s, charId, actionId, targetId) {
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
const RHINO_SPD = 115;
function applyRhinoAction(s) {
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

function applySaranAction(s) {
  const o=s.chars.ouma;
  const heal=Math.floor(o.maxHp*0.15);
  Object.values(s.chars).forEach(ch=>{ ch.hp=Math.min(ch.maxHp,ch.hp+heal); });
  Object.values(s.chars).forEach(ch=>{ gainEP(ch,5,false); });
  applyOumaLC(s);
  s.log=addLog(s.log,`🐰 連兎: 全体+${fmt(heal)}回復 全体EP+5 与ダメバフUp`,"heal");
  s.avs=advanceAV(s.avs,"saran",SARAN_SPD);
  return s;
}

function applyEnemyAction(s, eid) {
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

function resolveNext(s) {
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

// ═══════════════════════════════════════════════════════
//  キャラ・敵 定数データ
// ═══════════════════════════════════════════════════════
const CHAR_STATUS = {
  ziran: {
    fullName:"紫蘭", stars:5, path:"及落", element:"量子", role:"Xアタッカー", elemColor:"#a78bfa",
    lv:80,
    base:{ hp:1489, atk:499, def:452, spd:110, ep:120, cr:"80%", cd:"200%", taunt:100 },
    lcName:"花咲く静寂の果て", lcLv:80, lcRank:1,
    lcStats:{ hp:843, atk:452, def:349 },
    lcSkill:"X上昇値+20%。攻撃時敵の防御力10%無視。X累計30上昇ごとに与ダメ+10%(最大3層,2T)。",
    skills:[
      {name:"通常攻撃",cost:"SP+1 EP+20",type:"全体攻撃",desc:"敵全体に攻撃力80%分の量子属性ダメージ。X+25。"},
      {name:"戦闘スキル",cost:"SP-1 EP+30",type:"拡散攻撃",desc:"敵単体にX×0.6%×2回+隣接にX×0.2%分の量子ダメージ。2回繰り返す。X+35。"},
      {name:"必殺技",cost:"SP±0 EP-120",type:"全体攻撃",desc:"単体X×0.8%+隣接X×0.2%を2回。全体X×1.2%。入場天賦発動。X+100。"},
    ],
    passive:[
      "入場時: ATK+50% (2T)",
      "X: 50スタート / 最大300 / 通常+25 / スキル+35 / 必殺+100",
      "秘技: X+50 (2T)",
      "星魂1: 入場天賦時X+20 (4T)",
      "星魂2: X参照攻撃 防御20%無視",
      "星魂4: 通常攻撃のX上昇が発動時に変化+5",
    ],
  },
  saki: {
    fullName:"咲希", stars:5, path:"調和", element:"七彩", role:"サポート", elemColor:"#f9a8d4",
    lv:80,
    base:{ hp:1005, atk:542, def:584, spd:102, ep:140, cr:"5%", cd:"50%", taunt:100 },
    lcName:"野原に花咲かす", lcLv:80, lcRank:1,
    lcStats:{ hp:804, atk:491, def:604 },
    lcSkill:"EP回復効率+10%。結界展開時 全体耐性貫通+10%(2T)。",
    skills:[
      {name:"通常攻撃",cost:"SP+1 EP+20",type:"単体攻撃",desc:"敵単体に頼友ATK100%分の七彩ダメージ。削靭値10。"},
      {name:"戦闘スキル",cost:"SP-1 EP+30",type:"サポート",desc:"味方単体を頼友に指定・花畑獲得(3T)。花畑中、全体与ダメ+16%・X上昇+10%。"},
      {name:"共鳴スキル",cost:"SP+1 EP+20",type:"拡散攻撃",desc:"チャージ100%で発動。敵全体防御-15%(2T)。頼友ATK100%×5ヒット(七彩・4回バウンド)。削靭値5。使用後チャージリセット。"},
      {name:"必殺技",cost:"SP±0 EP-140",type:"サポート",desc:"味方単体を頼友に指定・結界展開(3T)。結界中、全体耐性貫通+25%・X上昇+20%。頼友の現在X×50%即獲得。共鳴チャージ+15%。"},
    ],
    passive:[
      "頼友: 指定味方ATK+15%・HP+10% / 咲希の攻撃は頼友ATKに依存",
      "花畑(3T): 全体与ダメ+16%(SC2でさらに+24%) / X上昇+10%",
      "結界(3T): 全属性耐性貫通+25%(SC6+15%+LC+10%で強化) / X上昇+20%",
      "秘技: 戦闘開始時 先頭キャラに戦闘スキルを発動(SP不要)",
      "追加能力: 必殺技発動時 共鳴チャージ+15% / 行動制限デバフ耐性+60% / 戦闘開始時行動順+35%",
      "SC1: 結界中 味方攻撃1回につき付加ダメ14%",
      "SC6: 結界展開時 耐性貫通追加+15% / 敵防御-40%",
      "秘技: 戦闘開始時 先頭キャラを頼友に指定(SP不要)",
      "共鳴チャージ: 毎ターン+10% / 必殺技+30% / 100%で発動可能",
    ],
  },
  ouma: {
    fullName:"桜舞", stars:5, path:"豊穣", element:"風", role:"ヒーラー", elemColor:"#86efac",
    lv:80,
    base:{ hp:1496, atk:336, def:553, spd:105, ep:140, cr:"80%", cd:"120%", taunt:105 },
    lcName:"舞い散る桜、兎に在らず", lcLv:80, lcRank:1,
    lcStats:{ hp:1270, atk:276, def:463 },
    lcSkill:"最大HP+24%。回復時全体与ダメ+15%(最大3層,3T)。召喚物行動時全体EP+5。",
    skills:[
      {name:"通常攻撃",cost:"SP+1 EP+20",type:"単体攻撃",desc:"敵単体にHP50%分の風属性ダメージ。削靭値10。"},
      {name:"戦闘スキル",cost:"SP-1 EP+30",type:"全体攻撃",desc:"敵全体にHP55%分の風ダメージ。削靭値15。味方全体HP30%回復。"},
      {name:"必殺技",cost:"SP±0 EP-140",type:"回復",desc:"連兎召喚。敵全体HP64%風ダメージ。味方全体HP45%回復。連兎即発動HP15%回復+全体EP+5。"},
    ],
    passive:[
      "天賦: 回復時サランHP最大+7%(3T,最大3層)",
      "連兎: 速度85で独立行動/HP15%全体回復+全体EP+5",
      "秘技: 戦闘開始時全体HP+15%",
      "星魂1: 最低HP割合キャラに回復+30%",
      "星魂2: サランHPスタックを味方全体に共有",
      "LC: 最大HP+24%(実効HP: 1496×1.24×1.15≒2133)",
    ],
  },
  miroku: {
    fullName:"ミロク", stars:5, path:"記憶", element:"風", role:"召喚士", elemColor:"#34d399",
    lv:80,
    base:{ hp:872, atk:338, def:336, spd:115, ep:150, cr:"5%", cd:"50%", taunt:100 },
    lcName:"（未装備）", lcLv:1, lcRank:1,
    lcStats:{ hp:0, atk:0, def:0 },
    lcSkill:"（未装備）",
    skills:[
      {name:"通常攻撃",cost:"SP+1 EP+20",type:"単体攻撃",desc:"敵単体に攻撃力100%分の風属性ダメージ。削靭値10。X+1(4T)。"},
      {name:"戦闘スキル",cost:"SP-1 EP+30",type:"全体攻撃",desc:"敵全体に攻撃力160%分の風属性ダメージ。削靭値15。X+4(4T)。リノセウスの行動順を100%早める。星魂2: X上昇率+20%(2T)、50%でSP消費なし。"},
      {name:"必殺技",cost:"SP±0 EP-150",type:"召喚",desc:"リノセウスを召喚・強化(ATK+20%, 2T)。X+10(5T)。星魂6: 耐性貫通+25%(2T)。精霊スキルを即発動。"},
    ],
    passive:[
      "天賦: X → 通常+1 / スキル+4 (4T) / 必殺+10 (5T)",
      "天賦: 速度>180のとき超過分×1%与ダメ+（最大+20%）",
      "天賦: ミロクとリノセウスのステータス同期（攻撃力除く）",
      "秘技: 戦闘開始時リノセウス召喚",
      "星魂1: X上昇率+20%・X上昇値+20% / リノセウス攻撃時防御10%無視",
      "星魂2: スキル発動時X上昇率+20%(2T) / リノ行動早め時50%でSP消費なし",
      "星魂4: リノセウス精霊スキルバウンド+1（基本6→7回）",
      "星魂6: 必殺技時リノセウス耐性貫通+25%(2T) / バウンド+3（7→10回）",
    ],
  },
};

const ENEMY_RES_LABELS = { quantum:"量子", ice:"氷", wind:"風", lightning:"雷", other:"その他" };
const ENEMY_BASE_STATUS = {
  fullName:"ラクガキアシスタント", path:"雑魚敵", element:"雷", elemColor:"#fbbf24",
  lv:60, atk:200, def:500, spd:ENEMY_SPD,
  skill:{name:"さあ！動くんだ！",type:"単体攻撃",desc:"味方単体に攻撃力80%〜120%分の雷属性ダメージ。70%の確率で「感電」(2T)を付与。感電中の敵は被弾時EP回復。"},
  passive:[
    "怠惰のインピーダンス: 雷属性耐性+40%",
    "怠惰のインピーダンス: 氷・風属性耐性-20%(弱点)",
    "感電(2T): 被弾時EP回復付与",
  ],
};

// ═══════════════════════════════════════════════════════
//  戦闘実況画面
// ═══════════════════════════════════════════════════════
function BattleReport({ state, onClose, initialTab="ally", initialCharId=null, initialEnemyId=null }) {
  const { chars, enemies } = state;
  const partyIds = state.partyIds || ["ziran","saki","ouma"];
  const [mainTab, setMainTab] = useState(initialTab);
  const [allyCharTab, setAllyCharTab] = useState(initialCharId || partyIds[0] || "ziran");
  const [allySubTab, setAllySubTab] = useState("detail");
  const [enemyTab, setEnemyTab] = useState(initialEnemyId || "e0");
  const [enemySubTab, setEnemySubTab] = useState("detail");

  const charIds = partyIds;

  const renderAllyDetail = (charId) => {
    const c = chars[charId];
    const info = CHAR_STATUS[charId];
    if(!c || !info) return null;
    const ec = info.elemColor;

    // バフから実際の上昇値を動的計算
    const buffAtkPct = c.buffs.reduce((a,b)=>{
      if(b.type==="raiyu_atk"||b.type==="entry_atk"||b.type==="miroku_ult_atkup") return a+(b.value||0);
      return a;
    }, 0);
    const buffAtkFlat = 0; // 現状フラット攻撃バフなし
    const baseAtk = info.base.atk + (info.lcStats?.atk||0);
    const liveAtk = Math.floor(baseAtk * (1 + buffAtkPct) + buffAtkFlat);
    const diffAtk = liveAtk - info.base.atk;

    const liveHp = c.maxHp;
    const diffHp = liveHp - info.base.hp;

    const liveSpd = c.spd +
      c.buffs.reduce((a,b)=>a+(b.type==="spd_up"?(b.value||0):0), 0);
    const diffSpd = liveSpd - info.base.spd;

    const liveDef = (info.base.def + (info.lcStats?.def||0)) +
      c.buffs.reduce((a,b)=>a+(b.type==="def_up"?(b.value||0):0), 0);
    const baseDef = info.base.def;
    const diffDef = liveDef - baseDef;

    // 与ダメバフ合計（%表示）
    const dmgBonusPct = c.buffs.reduce((a,b)=>{
      if(["ouma_lc_dmg","hanabatake_xup","kekkai_xup","kekkai_pen","miroku_sc6_pen"].includes(b.type)) return a+(b.value||0);
      return a;
    }, 0);

    const allTaunt = partyIds.filter(id=>!chars[id]?.ko).reduce((sum,id)=>sum+(chars[id]?.taunt||100),0);
    const aggroPct = allTaunt>0 ? Math.round(((c.taunt||100)/allTaunt)*100) : 0;

    return (
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <section>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:6}}>◆ ステータス（基礎 + バフ後）</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 8px"}}>
            {[
              {label:"HP",      base:info.base.hp,    diff:diffHp>0?diffHp:null},
              {label:"攻撃力",   base:info.base.atk,   diff:diffAtk>0?diffAtk:null},
              {label:"防御力",   base:baseDef,         diff:diffDef>0?diffDef:null},
              {label:"速度",     base:info.base.spd,   diff:diffSpd>0?diffSpd:null},
              {label:"最大EP",   base:info.base.ep,    diff:null},
              {label:"会心率",   base:info.base.cr,    diff:null},
              {label:"会心ダメ", base:info.base.cd,    diff:null},
              {label:"挑発",     base:c.taunt||info.base.taunt, diff:null, extra:`狙われ${aggroPct}%`},
              ...(dmgBonusPct>0?[{label:"与ダメ",base:"0%",diff:null,extra:`+${Math.round(dmgBonusPct*100)}%`}]:[]),
            ].map(({label,base,diff,extra})=>(
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                background:"rgba(255,255,255,0.03)",borderRadius:5,padding:"3px 7px"}}>
                <span style={{fontSize:"0.58rem",color:"#4b5563"}}>{label}</span>
                <span style={{fontSize:"0.62rem",color:"#e2e8f0",fontWeight:700}}>
                  {base}
                  {diff!=null&&<span style={{fontSize:"0.54rem",color:"#4ade80",marginLeft:4}}>+{typeof diff==="number"?diff.toLocaleString():diff}</span>}
                  {extra&&<span style={{fontSize:"0.5rem",color:"#fbbf24",marginLeft:4}}>({extra})</span>}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section style={{background:`${ec}0a`,border:`1px solid ${ec}22`,borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontSize:"0.6rem",color:ec,letterSpacing:1,marginBottom:6}}>◆ 現在の戦闘値</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 8px"}}>
            {[
              ["現在HP", `${fmt(c.hp)} / ${fmt(c.maxHp)}`],
              ["EP", `${c.ep} / ${c.maxEp}`],
              ...(charId==="ziran"||charId==="miroku"?[["X値",`${c.x} / ${c.xMax}`],charId==="miroku"?["リノセウス",c.hasRhinoceros?"召喚中":"未召喚"]:null].filter(Boolean):
                  charId==="saki"?[["共鳴チャージ",`${c.resonanceCharge||0}%`],["花畑",c.hanabatake>0?`${c.hanabatake}T`:"なし"],["結界",c.kekkai>0?`${c.kekkai}T`:"なし"]]:
                  charId==="ouma"?[["連兎",c.hasSaran?"召喚中":"未召喚"],["サランHP",`${c.saranStacks}/3層`]]:[]
              ),
            ].map(([label,val])=>(
              <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"2px 5px"}}>
                <span style={{fontSize:"0.58rem",color:"#4b5563"}}>{label}</span>
                <span style={{fontSize:"0.6rem",color:ec,fontWeight:700}}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:6}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <span style={{fontSize:"0.52rem",color:"#4b5563",width:14}}>HP</span>
              <Bar pct={(c.hp/c.maxHp)*100} color={c.hp/c.maxHp<0.3?"#ef4444":ec} h={5}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <span style={{fontSize:"0.52rem",color:"#4b5563",width:14}}>EP</span>
              <Bar pct={(c.ep/c.maxEp)*100} color="#60a5fa" h={4}/>
            </div>
            {charId==="ziran"&&(
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:"0.52rem",color:"#a78bfa",width:14}}>X</span>
                <Bar pct={(c.x/c.xMax)*100} color="#c4b5fd" h={3}/>
              </div>
            )}
          </div>
        </section>

        <section>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:5}}>
            ◆ バフ <span style={{color:ec}}>({c.buffs.length})</span>
          </div>
          {c.buffs.length===0
            ? <div style={{fontSize:"0.58rem",color:"#1f2035",padding:"4px 8px"}}>なし</div>
            : <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {c.buffs.map((b,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    background:"rgba(30,58,95,0.5)",border:"1px solid rgba(96,165,250,0.2)",borderRadius:6,padding:"4px 8px"}}>
                    <span style={{fontSize:"0.6rem",color:"#93c5fd"}}>{b.label}</span>
                    <span style={{fontSize:"0.56rem",color:"#60a5fa",background:"rgba(96,165,250,0.15)",padding:"1px 5px",borderRadius:4}}>{b.turns}T</span>
                  </div>
                ))}
              </div>
          }
        </section>

        <section>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:5}}>
            ◆ デバフ <span style={{color:"#fca5a5"}}>({c.debuffs.length})</span>
          </div>
          {c.debuffs.length===0
            ? <div style={{fontSize:"0.58rem",color:"#1f2035",padding:"4px 8px"}}>なし</div>
            : <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {c.debuffs.map((d,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    background:"rgba(95,30,30,0.5)",border:"1px solid rgba(252,165,165,0.2)",borderRadius:6,padding:"4px 8px"}}>
                    <span style={{fontSize:"0.6rem",color:"#fca5a5"}}>{d.label}</span>
                    <span style={{fontSize:"0.56rem",color:"#f87171",background:"rgba(252,165,165,0.15)",padding:"1px 5px",borderRadius:4}}>{d.turns}T</span>
                  </div>
                ))}
              </div>
          }
        </section>
      </div>
    );
  };

  const renderAllySkill = (charId) => {
    const info = CHAR_STATUS[charId];
    if(!info) return null;
    const ec = info.elemColor;
    return (
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {info.skills.map((sk,i)=>(
          <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid #1f2035",borderRadius:8,padding:"9px 11px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:"0.75rem",fontWeight:700,color:ec}}>{sk.name}</span>
              <span style={{fontSize:"0.54rem",background:`${ec}22`,color:ec,padding:"1px 6px",borderRadius:5}}>{sk.type}</span>
              <span style={{fontSize:"0.54rem",color:"#60a5fa",marginLeft:"auto"}}>{sk.cost}</span>
            </div>
            <div style={{fontSize:"0.62rem",color:"#94a3b8",lineHeight:1.6}}>{sk.desc}</div>
          </div>
        ))}
        <div style={{marginTop:4}}>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:5}}>◆ 天賦・星魂・秘技</div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {info.passive.map((p,i)=>(
              <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",
                padding:"4px 8px",background:"rgba(255,255,255,0.02)",borderRadius:5}}>
                <span style={{fontSize:"0.62rem",color:ec,minWidth:10}}>•</span>
                <span style={{fontSize:"0.61rem",color:"#94a3b8",lineHeight:1.6}}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderAllyLC = (charId) => {
    const info = CHAR_STATUS[charId];
    if(!info) return null;
    return (
      <div style={{background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.18)",borderRadius:10,padding:"12px 14px"}}>
        <div style={{fontSize:"0.6rem",color:"#fbbf24",letterSpacing:1,marginBottom:6}}>◆ 光円錐 (重畳Rank{info.lcRank})</div>
        <div style={{fontSize:"0.85rem",fontWeight:700,color:"#fcd34d",marginBottom:5}}>「{info.lcName}」</div>
        <div style={{display:"flex",gap:4,marginBottom:3,flexWrap:"wrap"}}>
          <span style={{fontSize:"0.56rem",color:"#94a3b8",background:"rgba(255,255,255,0.04)",padding:"2px 6px",borderRadius:4}}>Lv.{info.lcLv}</span>
          {[["HP",info.lcStats.hp],["ATK",info.lcStats.atk],["DEF",info.lcStats.def]].map(([l,v])=>(
            <span key={l} style={{fontSize:"0.56rem",color:"#94a3b8",background:"rgba(255,255,255,0.04)",padding:"2px 6px",borderRadius:4}}>{l}: {v}</span>
          ))}
        </div>
        <div style={{fontSize:"0.63rem",color:"#cbd5e1",lineHeight:1.7,marginTop:8,
          background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"8px 10px",border:"1px solid rgba(251,191,36,0.1)"}}>
          {info.lcSkill}
        </div>
      </div>
    );
  };

  const renderEnemyDetail = (eid) => {
    const e = enemies[eid];
    const ec = "#fbbf24";
    return (
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {!e.alive&&(
          <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",
            borderRadius:6,padding:"6px 10px",fontSize:"0.62rem",color:"#ef4444",textAlign:"center"}}>
            💀 このユニットは撃破済みです
          </div>
        )}
        <section>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:6}}>◆ ステータス</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 8px"}}>
            {[
              ["Lv", e.lv],
              ["HP", `${fmt(e.hp)} / ${fmt(e.maxHp)}`],
              ["靭性", `${e.toughness} / ${e.maxToughness}`],
              ["攻撃力", e.atk],
              ["防御力", ENEMY_BASE_STATUS.def],
              ["速度", ENEMY_BASE_STATUS.spd],
            ].map(([label,val])=>(
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                background:"rgba(255,255,255,0.03)",borderRadius:5,padding:"3px 7px"}}>
                <span style={{fontSize:"0.58rem",color:"#4b5563"}}>{label}</span>
                <span style={{fontSize:"0.62rem",color:"#e2e8f0",fontWeight:700}}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:6}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <span style={{fontSize:"0.52rem",color:"#4b5563",width:14}}>HP</span>
              <Bar pct={(e.hp/e.maxHp)*100} color={e.hp/e.maxHp<0.3?"#ef4444":"#fcd34d"} h={5}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:"0.52rem",color:"#4b5563",width:14}}>靭性</span>
              <Bar pct={(e.toughness/e.maxToughness)*100} color="#fb923c" h={3}/>
            </div>
            {e.toughness<=0&&<div style={{fontSize:"0.5rem",color:"#f97316",marginTop:3,textAlign:"center"}}>🔥 靭性破壊中</div>}
          </div>
        </section>

        <section style={{background:"rgba(252,211,77,0.05)",border:"1px solid rgba(252,211,77,0.15)",borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontSize:"0.6rem",color:ec,letterSpacing:1,marginBottom:5}}>◆ 属性耐性</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 8px"}}>
            {Object.entries(e.elemRes).map(([elem,res])=>(
              <div key={elem} style={{display:"flex",justifyContent:"space-between",padding:"2px 5px"}}>
                <span style={{fontSize:"0.58rem",color:"#4b5563"}}>{ENEMY_RES_LABELS[elem]||elem}</span>
                <span style={{fontSize:"0.6rem",fontWeight:700,color:res<0?"#86efac":res>0?"#fca5a5":"#94a3b8"}}>
                  {res>0?"+":""}{Math.round(res*100)}%{res<0?" (弱点)":res>0?" (耐性)":""}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:5}}>
            ◆ デバフ <span style={{color:"#fca5a5"}}>({(e.debuffs||[]).length})</span>
          </div>
          {(e.debuffs||[]).length===0
            ? <div style={{fontSize:"0.58rem",color:"#1f2035",padding:"4px 8px"}}>なし</div>
            : <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {e.debuffs.map((d,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    background:"rgba(95,30,30,0.5)",border:"1px solid rgba(252,165,165,0.2)",borderRadius:6,padding:"4px 8px"}}>
                    <span style={{fontSize:"0.6rem",color:"#fca5a5"}}>{d.label}</span>
                    <span style={{fontSize:"0.56rem",color:"#f87171",background:"rgba(252,165,165,0.15)",padding:"1px 5px",borderRadius:4}}>{d.turns}T</span>
                  </div>
                ))}
              </div>
          }
        </section>
      </div>
    );
  };

  const renderEnemySkill = () => {
    const info = ENEMY_BASE_STATUS;
    const ec = info.elemColor;
    return (
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid #1f2035",borderRadius:8,padding:"9px 11px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <span style={{fontSize:"0.75rem",fontWeight:700,color:ec}}>{info.skill.name}</span>
            <span style={{fontSize:"0.54rem",background:`${ec}22`,color:ec,padding:"1px 6px",borderRadius:5}}>{info.skill.type}</span>
          </div>
          <div style={{fontSize:"0.62rem",color:"#94a3b8",lineHeight:1.6}}>{info.skill.desc}</div>
        </div>
        <div>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:5}}>◆ 特性・パッシブ</div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {info.passive.map((p,i)=>(
              <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",
                padding:"4px 8px",background:"rgba(255,255,255,0.02)",borderRadius:5}}>
                <span style={{fontSize:"0.62rem",color:ec,minWidth:10}}>•</span>
                <span style={{fontSize:"0.61rem",color:"#94a3b8",lineHeight:1.6}}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const tabBtnStyle = (active, color="#fbbf24") => ({
    flex:1, padding:"7px 4px",
    background: active ? `${color}22` : "rgba(255,255,255,0.03)",
    border: `1px solid ${active ? color : "#1f2035"}`,
    borderRadius:7, color: active ? color : "#4b5563",
    fontSize:"0.65rem", fontWeight: active ? 700 : 400,
    cursor:"pointer", transition:"all .15s",
  });

  const subTabBtnStyle = (active, color) => ({
    flex:1, padding:"5px 4px",
    background: active ? `${color}18` : "transparent",
    border:"none",
    borderBottom: `2px solid ${active ? color : "transparent"}`,
    color: active ? color : "#4b5563",
    fontSize:"0.6rem", fontWeight: active ? 700 : 400,
    cursor:"pointer", transition:"all .15s",
  });

  const currentChar = chars[allyCharTab];
  const currentCharInfo = CHAR_STATUS[allyCharTab];
  const currentEnemy = enemies[enemyTab];

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      background:"linear-gradient(180deg,#0a0e1a 0%,#080c14 100%)",
      display:"flex", flexDirection:"column",
      fontFamily:"'Noto Sans JP',sans-serif", color:"#e2e8f0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Rajdhani:wght@600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#2a2a55;border-radius:2px}
      `}</style>

      <div style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"10px 12px 8px",
        background:"rgba(0,0,0,0.6)",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
        flexShrink:0,
      }}>
        <button onClick={onClose} style={{
          background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)",
          color:"#94a3b8", padding:"5px 10px", borderRadius:7,
          fontSize:"0.65rem", cursor:"pointer", display:"flex", alignItems:"center", gap:4,
        }}>◀ 戻る</button>
        <div style={{
          fontFamily:"Rajdhani,sans-serif", fontSize:"1rem", fontWeight:700,
          color:"#e2e8f0", letterSpacing:2,
        }}>📋 戦闘実況</div>
        <div style={{display:"flex", gap:4, marginLeft:"auto"}}>
          <button onClick={()=>setMainTab("ally")} style={tabBtnStyle(mainTab==="ally","#a78bfa")}>味方詳細</button>
          <button onClick={()=>setMainTab("enemy")} style={tabBtnStyle(mainTab==="enemy","#fbbf24")}>敵の詳細</button>
        </div>
      </div>

      {mainTab==="ally"&&(
        <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
          <div style={{display:"flex",gap:4,padding:"8px 10px 0",flexShrink:0}}>
            {charIds.map(id=>{
              const c=chars[id];
              const info=CHAR_STATUS[id];
              if(!c || !info) return null;
              const ec=info.elemColor;
              const isActive=allyCharTab===id;
              return(
                <button key={id} onClick={()=>setAllyCharTab(id)} style={{
                  flex:1, padding:"7px 5px",
                  background: isActive ? `${ec}18` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isActive ? ec : "#1f2035"}`,
                  borderRadius:8, cursor:"pointer", transition:"all .15s",
                  opacity: c.ko ? 0.4 : 1,
                }}>
                  <div style={{fontSize:"1rem"}}>{c.icon}</div>
                  <div style={{fontSize:"0.58rem",fontWeight:700,color:isActive?ec:"#4b5563",marginTop:2}}>{c.name}</div>
                  {c.ko&&<div style={{fontSize:"0.46rem",color:"#ef4444"}}>戦闘不能</div>}
                </button>
              );
            })}
          </div>

          {currentChar && currentCharInfo && (
          <div style={{
            display:"flex",alignItems:"center",gap:10,
            padding:"8px 12px",
            background:"rgba(0,0,0,0.3)",
            borderBottom:"1px solid rgba(255,255,255,0.05)",
            flexShrink:0,
          }}>
            <span style={{fontSize:"1.4rem"}}>{currentChar.icon}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:"0.85rem",fontWeight:900,color:currentCharInfo.elemColor}}>{currentCharInfo.fullName}</div>
              <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>
                <span style={{fontSize:"0.52rem",background:`${currentCharInfo.elemColor}22`,color:currentCharInfo.elemColor,padding:"1px 5px",borderRadius:5}}>⭐×{currentCharInfo.stars}</span>
                <span style={{fontSize:"0.52rem",background:"rgba(255,255,255,0.05)",color:"#94a3b8",padding:"1px 5px",borderRadius:5}}>{currentCharInfo.path}</span>
                <span style={{fontSize:"0.52rem",background:`${currentCharInfo.elemColor}22`,color:currentCharInfo.elemColor,padding:"1px 5px",borderRadius:5}}>{currentCharInfo.element}</span>
                <span style={{fontSize:"0.52rem",background:"rgba(255,255,255,0.05)",color:"#94a3b8",padding:"1px 5px",borderRadius:5}}>Lv.{currentCharInfo.lv}</span>
                {currentChar.ko&&<span style={{fontSize:"0.52rem",background:"rgba(239,68,68,0.2)",color:"#ef4444",padding:"1px 5px",borderRadius:5}}>戦闘不能</span>}
                {partyIds[0]===allyCharTab&&<span style={{fontSize:"0.52rem",background:"rgba(251,191,36,0.2)",color:"#fbbf24",padding:"1px 5px",borderRadius:5}}>★先頭</span>}
              </div>
            </div>
          </div>
          )}

          <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0,background:"rgba(0,0,0,0.2)"}}>
            {[["detail","詳細"],["skill","スキル"],["lc","光円錐"]].map(([id,label])=>(
              <button key={id} onClick={()=>setAllySubTab(id)} style={subTabBtnStyle(allySubTab===id, currentCharInfo?currentCharInfo.elemColor:"#a78bfa")}>
                {label}
              </button>
            ))}
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"10px 12px 20px"}}>
            {allySubTab==="detail" && renderAllyDetail(allyCharTab)}
            {allySubTab==="skill"  && renderAllySkill(allyCharTab)}
            {allySubTab==="lc"     && renderAllyLC(allyCharTab)}
          </div>
        </div>
      )}

      {mainTab==="enemy"&&(
        <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
          <div style={{display:"flex",gap:3,padding:"8px 10px 0",flexShrink:0}}>
            {ENEMY_IDS.map(id=>{
              const e=enemies[id];
              const isActive=enemyTab===id;
              const isDead=!e.alive;
              return(
                <button key={id} onClick={()=>setEnemyTab(id)} style={{
                  flex:1, padding:"6px 3px",
                  background: isActive ? "rgba(252,211,77,0.15)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isActive ? "#fcd34d" : "#1f2035"}`,
                  borderRadius:7, cursor:"pointer", transition:"all .15s",
                  opacity: isDead ? 0.4 : 1,
                  filter: isDead ? "grayscale(0.8)" : "none",
                }}>
                  <div style={{fontSize:"0.85rem"}}>{isDead?"💀":e.icon}</div>
                  <div style={{fontSize:"0.52rem",fontWeight:700,color:isActive?"#fcd34d":isDead?"#374151":"#94a3b8",marginTop:2}}>
                    {e.name.slice(0,4)}
                  </div>
                  {isDead&&<div style={{fontSize:"0.42rem",color:"#374151"}}>撃破</div>}
                </button>
              );
            })}
          </div>

          <div style={{
            display:"flex",alignItems:"center",gap:10,
            padding:"8px 12px",
            background:"rgba(0,0,0,0.3)",
            borderBottom:"1px solid rgba(255,255,255,0.05)",
            flexShrink:0,
          }}>
            <span style={{fontSize:"1.4rem"}}>{currentEnemy.alive?currentEnemy.icon:"💀"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:"0.85rem",fontWeight:900,color:"#fbbf24"}}>{currentEnemy.name}</div>
              <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>
                <span style={{fontSize:"0.52rem",background:"rgba(255,255,255,0.05)",color:"#94a3b8",padding:"1px 5px",borderRadius:5}}>{ENEMY_BASE_STATUS.path}</span>
                <span style={{fontSize:"0.52rem",background:"rgba(251,191,36,0.15)",color:"#fbbf24",padding:"1px 5px",borderRadius:5}}>{ENEMY_BASE_STATUS.element}</span>
                <span style={{fontSize:"0.52rem",background:"rgba(255,255,255,0.05)",color:"#94a3b8",padding:"1px 5px",borderRadius:5}}>Lv.{currentEnemy.lv}</span>
                {!currentEnemy.alive&&<span style={{fontSize:"0.52rem",background:"rgba(239,68,68,0.2)",color:"#ef4444",padding:"1px 5px",borderRadius:5}}>撃破済み</span>}
              </div>
            </div>
          </div>

          <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0,background:"rgba(0,0,0,0.2)"}}>
            {[["detail","詳細"],["skill","スキル"]].map(([id,label])=>(
              <button key={id} onClick={()=>setEnemySubTab(id)} style={subTabBtnStyle(enemySubTab===id,"#fbbf24")}>
                {label}
              </button>
            ))}
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"10px 12px 20px"}}>
            {enemySubTab==="detail" && renderEnemyDetail(enemyTab)}
            {enemySubTab==="skill"  && renderEnemySkill()}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  MAIN (NormalBattle)
// ═══════════════════════════════════════════════════════
function NormalBattle({ onBack, diff="Normal", party=["ziran","saki","ouma"] }){
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

// ═══════════════════════════════════════════════════
//  BOSS BATTLE
// ═══════════════════════════════════════════════════

const BOSS_ID   = "kakaria";
const BLADE_ID  = "ice_blade";
const BOSS_SPD  = 100;
const BLADE_SPD = 85;
const DIFF_MULT = { Normal:1.0, Hard:1.5, Extreme:2.5 };

const mkBoss = (diff="Normal") => {
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

const mkBlade = (boss) => ({
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

const mkAVsBoss = (partyIds, hasBlade=false) => {
  const a={};
  partyIds.forEach(id=>{ const spd=CHAR_SPD[id]||100; a[id]=Math.ceil(10000/spd); });
  if(a.saki!==undefined) a.saki = Math.ceil(a.saki/1.35);
  a[BOSS_ID]=Math.ceil(10000/BOSS_SPD);
  if(hasBlade) a[BLADE_ID]=Math.ceil(10000/BLADE_SPD);
  a[ROUND_KEY] = ROUND1_LEN;
  return a;
};

const mkStateBoss = (partyIds, diff="Normal") => {
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

const dmgToBossTarget = (target, atk, ratio, elem, ignoreDef=0, cr=0, cd=1.5, dmgBonus=0) => {
  if(!target||!target.alive) return 0;
  const res=target.elemRes?.[elem]??0;
  const breakMult = target.broken ? 1.0 : 0.9;
  return calcDmg(atk, ratio, target.def, ignoreDef, res, cr, cd, dmgBonus,
    { enemyLv: target.lv||80, breakMult });
};

const hitToughBoss = (s, target, val, elem) => {
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

function applyPlayerActionBoss(s, charId, actionId) {
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

function applySaranActionBoss(s) {
  const o=s.chars.ouma; if(!o) return s;
  const heal=Math.floor(o.maxHp*0.15);
  Object.values(s.chars).forEach(ch=>{ ch.hp=Math.min(ch.maxHp,ch.hp+heal); });
  Object.values(s.chars).forEach(ch=>{ gainEP(ch,5,false); });
  applyOumaLC(s);
  s.log=addLog(s.log,`🐰 連兎: 全体+${fmt(heal)}回復 全体EP+5 与ダメバフUp`,"heal");
  s.avs=advanceAV(s.avs,"saran",85);
  return s;
}

function resolveNextBoss(s) {
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

function applyBossAction(s) {
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

function applyBladeAction(s) {
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

// ─── BossReport（戦闘実況） ───
function BossReport({ state, onClose, initialTab="ally", initialCharId=null }) {
  const { chars, boss, blade } = state;
  const partyIds = state.partyIds || ["ziran","saki","ouma"];
  const [mainTab, setMainTab] = useState(initialTab);
  const [allyCharTab, setAllyCharTab] = useState(initialCharId||partyIds[0]||"ziran");
  const [allySubTab, setAllySubTab] = useState("detail");
  const [enemyTab, setEnemyTab] = useState("boss");

  const subTabStyle = (active, color) => ({
    flex:1, padding:"5px 4px",
    background: active ? `${color}18` : "transparent",
    border:"none", borderBottom:`2px solid ${active?color:"transparent"}`,
    color: active ? color : "#4b5563",
    fontSize:"0.6rem", fontWeight: active?700:400, cursor:"pointer", transition:"all .15s",
  });
  const tabBtnStyle = (active, color="#fbbf24") => ({
    flex:1, padding:"7px 4px",
    background: active ? `${color}22` : "rgba(255,255,255,0.03)",
    border: `1px solid ${active?color:"#1f2035"}`,
    borderRadius:7, color: active?color:"#4b5563",
    fontSize:"0.65rem", fontWeight: active?700:400, cursor:"pointer", transition:"all .15s",
  });

  const renderAllyDetail = (charId) => {
    const c = chars[charId]; if(!c) return null;
    const info = CHAR_STATUS[charId]; if(!info) return null;
    const ec = info.elemColor;

    // バフ反映後の実効値を計算
    const buffAtkPct = c.buffs.reduce((a,b)=>{
      if(b.type==="raiyu_atk"||b.type==="entry_atk"||b.type==="miroku_ult_atkup") return a+(b.value||0);
      return a;
    }, 0);
    const baseAtk = info.base.atk + (info.lcStats?.atk||0);
    const liveAtk = Math.floor(baseAtk*(1+buffAtkPct));
    const diffAtk = liveAtk - info.base.atk;
    const liveHp = c.maxHp;
    const diffHp = liveHp - info.base.hp;
    const liveSpd = c.spd + c.buffs.reduce((a,b)=>a+(b.type==="spd_up"?(b.value||0):0),0);
    const diffSpd = liveSpd - info.base.spd;
    const liveDef = (info.base.def+(info.lcStats?.def||0)) + c.buffs.reduce((a,b)=>a+(b.type==="def_up"?(b.value||0):0),0);
    const diffDef = liveDef - info.base.def;
    const dmgBonusPct = c.buffs.reduce((a,b)=>{
      if(["ouma_lc_dmg","hanabatake_xup","kekkai_xup","kekkai_pen","miroku_sc6_pen"].includes(b.type)) return a+(b.value||0);
      return a;
    },0);
    const allTaunt = partyIds.filter(id=>!chars[id]?.ko).reduce((sum,id)=>sum+(chars[id]?.taunt||100),0);
    const aggroPct = allTaunt>0 ? Math.round(((c.taunt||100)/allTaunt)*100) : 0;
    return(
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <section>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:6}}>◆ ステータス（基礎 + バフ後）</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 8px"}}>
            {[
              {label:"HP",    base:info.base.hp,  diff:diffHp>0?diffHp:null},
              {label:"攻撃力", base:info.base.atk, diff:diffAtk>0?diffAtk:null},
              {label:"防御力", base:info.base.def, diff:diffDef>0?diffDef:null},
              {label:"速度",   base:info.base.spd, diff:diffSpd>0?diffSpd:null},
              {label:"最大EP", base:info.base.ep,  diff:null},
              {label:"会心率", base:info.base.cr,  diff:null},
              {label:"会心ダメ",base:info.base.cd, diff:null},
              {label:"挑発",   base:c.taunt||info.base.taunt, diff:null, extra:`狙われ${aggroPct}%`},
              ...(dmgBonusPct>0?[{label:"与ダメ",base:"0%",diff:null,extra:`+${Math.round(dmgBonusPct*100)}%`}]:[]),
            ].map(({label,base,diff,extra})=>(
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                background:"rgba(255,255,255,0.03)",borderRadius:5,padding:"3px 7px"}}>
                <span style={{fontSize:"0.58rem",color:"#4b5563"}}>{label}</span>
                <span style={{fontSize:"0.62rem",color:"#e2e8f0",fontWeight:700}}>
                  {base}
                  {diff!=null&&<span style={{fontSize:"0.54rem",color:"#4ade80",marginLeft:4}}>+{typeof diff==="number"?diff.toLocaleString():diff}</span>}
                  {extra&&<span style={{fontSize:"0.5rem",color:"#fbbf24",marginLeft:4}}>({extra})</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section style={{background:`${ec}0a`,border:`1px solid ${ec}22`,borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontSize:"0.6rem",color:ec,letterSpacing:1,marginBottom:6}}>◆ 現在の戦闘値</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 8px"}}>
            {[
              ["現在HP", `${fmt(c.hp)} / ${fmt(c.maxHp)}`],
              ["EP", `${c.ep} / ${c.maxEp}`],
              ["挑発", `${c.taunt||100} (狙われ${aggroPct}%)`],
              ...(charId==="ziran"||charId==="miroku"?[["X値",`${c.x} / ${c.xMax}`],charId==="miroku"?["リノセウス",c.hasRhinoceros?"召喚中":"未召喚"]:null].filter(Boolean):
                  charId==="saki"?[["共鳴チャージ",`${c.resonanceCharge||0}%`],["花畑",c.hanabatake>0?`${c.hanabatake}T`:"なし"],["結界",c.kekkai>0?`${c.kekkai}T`:"なし"]]:
                  charId==="ouma"?[["連兎",c.hasSaran?"召喚中":"未召喚"],["サランHP",`${c.saranStacks}/3層`]]:[]
              ),
            ].map(([label,val])=>(
              <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"2px 5px"}}>
                <span style={{fontSize:"0.58rem",color:"#4b5563"}}>{label}</span>
                <span style={{fontSize:"0.6rem",color:ec,fontWeight:700}}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:6}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <span style={{fontSize:"0.52rem",color:"#4b5563",width:14}}>HP</span>
              <Bar pct={(c.hp/c.maxHp)*100} color={c.hp/c.maxHp<0.3?"#ef4444":ec} h={5}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <span style={{fontSize:"0.52rem",color:"#4b5563",width:14}}>EP</span>
              <Bar pct={(c.ep/c.maxEp)*100} color="#60a5fa" h={4}/>
            </div>
            {charId==="ziran"&&<div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:"0.52rem",color:"#a78bfa",width:14}}>X</span>
              <Bar pct={(c.x/c.xMax)*100} color="#c4b5fd" h={3}/>
            </div>}
          </div>
        </section>
        <section>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:5}}>◆ バフ <span style={{color:ec}}>({c.buffs.length})</span></div>
          {c.buffs.length===0?<div style={{fontSize:"0.58rem",color:"#1f2035",padding:"4px 8px"}}>なし</div>:
            <div style={{display:"flex",flexDirection:"column",gap:3}}>{c.buffs.map((b,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(30,58,95,0.5)",border:"1px solid rgba(96,165,250,0.2)",borderRadius:6,padding:"4px 8px"}}>
                <span style={{fontSize:"0.6rem",color:"#93c5fd"}}>{b.label}</span>
                <span style={{fontSize:"0.56rem",color:"#60a5fa",background:"rgba(96,165,250,0.15)",padding:"1px 5px",borderRadius:4}}>{b.turns}T</span>
              </div>
            ))}</div>}
        </section>
        <section>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:5}}>◆ デバフ <span style={{color:"#fca5a5"}}>({c.debuffs.length})</span></div>
          {c.debuffs.length===0?<div style={{fontSize:"0.58rem",color:"#1f2035",padding:"4px 8px"}}>なし</div>:
            <div style={{display:"flex",flexDirection:"column",gap:3}}>{c.debuffs.map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(95,30,30,0.5)",border:"1px solid rgba(252,165,165,0.2)",borderRadius:6,padding:"4px 8px"}}>
                <span style={{fontSize:"0.6rem",color:"#fca5a5"}}>{d.label}</span>
                <span style={{fontSize:"0.56rem",color:"#f87171",background:"rgba(252,165,165,0.15)",padding:"1px 5px",borderRadius:4}}>{d.turns}T</span>
              </div>
            ))}</div>}
        </section>
      </div>
    );
  };

  const renderAllySkill = (charId) => {
    const info = CHAR_STATUS[charId]; if(!info) return null;
    const ec = info.elemColor;
    return(
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {info.skills.map((sk,i)=>(
          <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid #1f2035",borderRadius:8,padding:"9px 11px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:"0.75rem",fontWeight:700,color:ec}}>{sk.name}</span>
              <span style={{fontSize:"0.54rem",background:`${ec}22`,color:ec,padding:"1px 6px",borderRadius:5}}>{sk.type}</span>
              <span style={{fontSize:"0.54rem",color:"#60a5fa",marginLeft:"auto"}}>{sk.cost}</span>
            </div>
            <div style={{fontSize:"0.62rem",color:"#94a3b8",lineHeight:1.6}}>{sk.desc}</div>
          </div>
        ))}
        <div style={{marginTop:4}}>
          <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:5}}>◆ 天賦・星魂・秘技</div>
          {info.passive.map((p,i)=>(
            <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",padding:"4px 8px",background:"rgba(255,255,255,0.02)",borderRadius:5,marginBottom:3}}>
              <span style={{fontSize:"0.62rem",color:ec,minWidth:10}}>•</span>
              <span style={{fontSize:"0.61rem",color:"#94a3b8",lineHeight:1.6}}>{p}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderBossDetail = () => {
    const ec="#93c5fd";
    return(
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <section style={{background:"rgba(147,197,253,0.05)",border:"1px solid rgba(147,197,253,0.15)",borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontSize:"0.6rem",color:ec,letterSpacing:1,marginBottom:6}}>◆ ボスステータス</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 8px"}}>
            {[["Lv",boss.lv],["HP",`${fmt(boss.hp)} / ${fmt(boss.maxHp)}`],["靭性",`${boss.toughness} / ${boss.maxToughness}`],["攻撃力",boss.atk],["防御力",boss.def],["速度",BOSS_SPD],["凍結強化",`${boss.dmgUpPerFrozen}層`]].map(([label,val])=>(
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.03)",borderRadius:5,padding:"3px 7px"}}>
                <span style={{fontSize:"0.58rem",color:"#4b5563"}}>{label}</span>
                <span style={{fontSize:"0.62rem",color:"#e2e8f0",fontWeight:700}}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:6}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:"0.52rem",color:"#4b5563",width:14}}>HP</span><Bar pct={(boss.hp/boss.maxHp)*100} color={boss.hp/boss.maxHp<0.3?"#ef4444":boss.hp/boss.maxHp<0.6?"#f97316":ec} h={5}/></div>
            <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:"0.52rem",color:"#4b5563",width:14}}>靭性</span><Bar pct={(boss.toughness/boss.maxToughness)*100} color="#fb923c" h={3}/></div>
            {boss.toughness<=0&&<div style={{fontSize:"0.5rem",color:"#f97316",marginTop:3,textAlign:"center"}}>🔥 靭性破壊中</div>}
          </div>
          {boss.charged&&<div style={{fontSize:"0.56rem",color:"#93c5fd",textAlign:"center",marginTop:4,fontWeight:700}}>⚠️ チャージ中 — 次ターン全体大攻撃！</div>}
        </section>
        <section style={{background:"rgba(147,197,253,0.04)",border:"1px solid rgba(147,197,253,0.12)",borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontSize:"0.6rem",color:ec,letterSpacing:1,marginBottom:5}}>◆ 属性耐性</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 8px"}}>
            {Object.entries(boss.elemRes).map(([elem,res])=>(
              <div key={elem} style={{display:"flex",justifyContent:"space-between",padding:"2px 5px"}}>
                <span style={{fontSize:"0.58rem",color:"#4b5563"}}>{elem}</span>
                <span style={{fontSize:"0.6rem",fontWeight:700,color:res<0?"#86efac":res>0?"#fca5a5":"#94a3b8"}}>{res>0?"+":""}{Math.round(res*100)}%{res<0?" (弱点)":res>0?" (耐性)":""}</span>
              </div>
            ))}
          </div>
        </section>
        {boss.debuffs.length>0&&(
          <section>
            <div style={{fontSize:"0.6rem",color:"#4b5563",letterSpacing:1,marginBottom:5}}>◆ デバフ ({boss.debuffs.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>{boss.debuffs.map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(95,30,30,0.5)",border:"1px solid rgba(252,165,165,0.2)",borderRadius:6,padding:"4px 8px"}}>
                <span style={{fontSize:"0.6rem",color:"#fca5a5"}}>{d.label}</span>
                <span style={{fontSize:"0.56rem",color:"#f87171",background:"rgba(252,165,165,0.15)",padding:"1px 5px",borderRadius:4}}>{d.turns}T</span>
              </div>
            ))}</div>
          </section>
        )}
        {blade&&(
          <section style={{background:"rgba(191,219,254,0.05)",border:"1px solid rgba(191,219,254,0.15)",borderRadius:8,padding:"8px 10px"}}>
            <div style={{fontSize:"0.6rem",color:"#bfdbfe",letterSpacing:1,marginBottom:5}}>◆ 氷刃</div>
            {!blade.alive?<div style={{fontSize:"0.58rem",color:"#374151"}}>💀 撃破済み</div>:
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:"0.52rem",color:"#4b5563",width:14}}>HP</span><Bar pct={(blade.hp/blade.maxHp)*100} color="#bfdbfe" h={5}/><span style={{fontSize:"0.48rem",color:"#6b7280"}}>{fmt(blade.hp)}</span></div>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:"0.52rem",color:"#4b5563",width:14}}>靭性</span><Bar pct={(blade.toughness/blade.maxToughness)*100} color="#fb923c" h={3}/><span style={{fontSize:"0.48rem",color:"#6b7280"}}>{blade.toughness}/{blade.maxToughness}</span></div>
                {blade.toughness<=0&&<div style={{fontSize:"0.46rem",color:"#f97316",textAlign:"center"}}>靭性破壊中</div>}
              </div>}
          </section>
        )}
      </div>
    );
  };

  const currentChar = chars[allyCharTab];
  const currentCharInfo = CHAR_STATUS[allyCharTab];

  return(
    <div style={{position:"fixed",inset:0,zIndex:200,background:"linear-gradient(180deg,#0a0e1a 0%,#080c14 100%)",display:"flex",flexDirection:"column",fontFamily:"'Noto Sans JP',sans-serif",color:"#e2e8f0"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Rajdhani:wght@600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#2a2a55;border-radius:2px}`}</style>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px 8px",background:"rgba(0,0,0,0.6)",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        <button onClick={onClose} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"#94a3b8",padding:"5px 10px",borderRadius:7,fontSize:"0.65rem",cursor:"pointer"}}>◀ 戻る</button>
        <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:"1rem",fontWeight:700,color:"#e2e8f0",letterSpacing:2}}>📋 戦闘実況</div>
        <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
          <button onClick={()=>setMainTab("ally")} style={tabBtnStyle(mainTab==="ally","#a78bfa")}>味方詳細</button>
          <button onClick={()=>setMainTab("enemy")} style={tabBtnStyle(mainTab==="enemy","#93c5fd")}>敵の詳細</button>
        </div>
      </div>

      {mainTab==="ally"&&(
        <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
          <div style={{display:"flex",gap:4,padding:"8px 10px 0",flexShrink:0}}>
            {partyIds.map(id=>{
              const c=chars[id]; const info=CHAR_STATUS[id]; if(!c||!info) return null;
              const ec=info.elemColor;
              return(
                <button key={id} onClick={()=>setAllyCharTab(id)} style={{flex:1,padding:"7px 5px",background:allyCharTab===id?`${ec}18`:"rgba(255,255,255,0.03)",border:`1px solid ${allyCharTab===id?ec:"#1f2035"}`,borderRadius:8,cursor:"pointer",transition:"all .15s",opacity:c.ko?0.4:1}}>
                  <div style={{fontSize:"1rem"}}>{c.icon}</div>
                  <div style={{fontSize:"0.58rem",fontWeight:700,color:allyCharTab===id?ec:"#4b5563",marginTop:2}}>{c.name}</div>
                  {c.ko&&<div style={{fontSize:"0.46rem",color:"#ef4444"}}>戦闘不能</div>}
                </button>
              );
            })}
          </div>
          {currentChar&&currentCharInfo&&(
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"rgba(0,0,0,0.3)",borderBottom:"1px solid rgba(255,255,255,0.05)",flexShrink:0}}>
              <span style={{fontSize:"1.4rem"}}>{currentChar.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:"0.85rem",fontWeight:900,color:currentCharInfo.elemColor}}>{currentCharInfo.fullName}</div>
                <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>
                  <span style={{fontSize:"0.52rem",background:`${currentCharInfo.elemColor}22`,color:currentCharInfo.elemColor,padding:"1px 5px",borderRadius:5}}>{currentCharInfo.element}</span>
                  <span style={{fontSize:"0.52rem",background:"rgba(255,255,255,0.05)",color:"#94a3b8",padding:"1px 5px",borderRadius:5}}>{currentCharInfo.path}</span>
                  {currentChar.ko&&<span style={{fontSize:"0.52rem",background:"rgba(239,68,68,0.2)",color:"#ef4444",padding:"1px 5px",borderRadius:5}}>戦闘不能</span>}
                  {partyIds[0]===allyCharTab&&<span style={{fontSize:"0.52rem",background:"rgba(251,191,36,0.2)",color:"#fbbf24",padding:"1px 5px",borderRadius:5}}>★先頭</span>}
                </div>
              </div>
            </div>
          )}
          <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0,background:"rgba(0,0,0,0.2)"}}>
            {[["detail","詳細"],["skill","スキル"]].map(([id,label])=>(
              <button key={id} onClick={()=>setAllySubTab(id)} style={subTabStyle(allySubTab===id,currentCharInfo?currentCharInfo.elemColor:"#a78bfa")}>{label}</button>
            ))}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"10px 12px 20px"}}>
            {allySubTab==="detail"&&renderAllyDetail(allyCharTab)}
            {allySubTab==="skill"&&renderAllySkill(allyCharTab)}
          </div>
        </div>
      )}

      {mainTab==="enemy"&&(
        <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
          <div style={{display:"flex",gap:4,padding:"8px 10px 0",flexShrink:0}}>
            {[["boss","❄️ カカリア"],["blade","🗡️ 氷刃"]].map(([id,label])=>{
              const exists=id==="blade"?(blade&&blade.alive):boss.alive;
              const destroyed=id==="blade"?(blade&&!blade.alive):!boss.alive;
              return(
                <button key={id} onClick={()=>setEnemyTab(id)} style={{flex:1,padding:"7px 5px",background:enemyTab===id?"rgba(147,197,253,0.15)":"rgba(255,255,255,0.03)",border:`1px solid ${enemyTab===id?"#93c5fd":"#1f2035"}`,borderRadius:8,cursor:"pointer",transition:"all .15s",opacity:(!exists&&!destroyed)||id==="boss"?1:0.4}}>
                  <div style={{fontSize:"0.85rem"}}>{destroyed?"💀":id==="boss"?"❄️":"🗡️"}</div>
                  <div style={{fontSize:"0.58rem",fontWeight:700,color:enemyTab===id?"#93c5fd":"#4b5563",marginTop:2}}>{id==="boss"?"カカリア":"氷刃"}</div>
                  {id==="blade"&&!blade&&<div style={{fontSize:"0.44rem",color:"#374151"}}>未召喚</div>}
                  {id==="blade"&&blade&&!blade.alive&&<div style={{fontSize:"0.44rem",color:"#374151"}}>撃破</div>}
                </button>
              );
            })}
          </div>
          <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0,background:"rgba(0,0,0,0.2)"}}>
            <div style={{flex:1,padding:"5px 4px",textAlign:"center",fontSize:"0.6rem",color:"#93c5fd",fontWeight:700,borderBottom:"2px solid #93c5fd"}}>詳細</div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"10px 12px 20px"}}>
            {renderBossDetail()}
          </div>
        </div>
      )}
    </div>
  );
}

function BossBattle({ diff="Normal", party=["ziran","saki","ouma"], onBack }) {
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
    if(charId==="saki"&&actionId==="resonance"&&s.resonanceHits){ s.resonanceHits.forEach((hit,i)=>{ setTimeout(()=>{ const{ox,oy}=popOffset(i); showDmgPopup(hit.dmg,isCrit,hit.targetId,elem,ox,oy); addTotalDmg(hit.dmg); if(i===0) triggerHitFlash(hit.targetId); },delay); delay+=150; }); }
    else if(charId==="ziran"&&(actionId==="skill"||actionId==="ult")&&s.ziranHits){ s.ziranHits.forEach((hit,i)=>{ setTimeout(()=>{ if(Array.isArray(hit)) hit.forEach((h,j)=>{ const{ox,oy}=popOffset(i+j); showDmgPopup(h.dmg,isCrit,h.targetId,elem,ox,oy); addTotalDmg(h.dmg); }); else { const{ox,oy}=popOffset(i); showDmgPopup(hit.dmg,isCrit,hit.targetId,elem,ox,oy); addTotalDmg(hit.dmg); } if(i===0) triggerHitFlash(Array.isArray(hit)?hit[0].targetId:hit.targetId); },delay); delay+=160; }); }
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
    if(charId==="ziran"&&s.ziranHits){ s.ziranHits.forEach((hit,i)=>{ setTimeout(()=>{ if(Array.isArray(hit)) hit.forEach((h,j)=>{ const{ox,oy}=popOffset(i+j); showDmgPopup(h.dmg,isCrit,h.targetId,elem,ox,oy); addTotalDmg(h.dmg); }); else { const{ox,oy}=popOffset(i); showDmgPopup(hit.dmg,isCrit,hit.targetId,elem,ox,oy); addTotalDmg(hit.dmg); } if(i===0) triggerHitFlash(Array.isArray(hit)?hit[0].targetId:hit.targetId); },delay); delay+=160; }); }
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
    <div style={{fontFamily:"'Noto Sans JP',sans-serif",background:"linear-gradient(180deg,#0d1020 0%,#080c14 100%)",color:"#e2e8f0",height:"100vh",overflow:"hidden",display:"flex",flexDirection:"column",position:"relative",userSelect:"none"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Rajdhani:wght@600;700&display=swap');
        @keyframes enemyActBoss{0%,100%{opacity:1}50%{opacity:.6}}
        @keyframes warnPulseBoss{0%,100%{opacity:.7}50%{opacity:1}}
        @keyframes futureBlink{0%,100%{opacity:1;box-shadow:0 0 8px #a78bfa88}50%{opacity:0.3;box-shadow:none}}
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
                {boss.icon}
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
                {blade.icon}
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

// ═══════════════════════════════════════════════════
//  APP ROOT
// ═══════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState("lobby");
  const [battleConfig, setBattleConfig] = useState({ diff:"Normal", party:[] });
  const goLobby     = () => setScreen("lobby");
  const startNormal = (party, diff) => { setBattleConfig({ diff, party }); setScreen("normal"); };
  const startBoss   = (party, diff) => { setBattleConfig({ diff, party }); setScreen("boss"); };
  if(screen==="normal") return <NormalBattle onBack={goLobby} diff={battleConfig.diff} party={battleConfig.party}/>;
  if(screen==="boss")   return <BossBattle diff={battleConfig.diff} party={battleConfig.party} onBack={goLobby}/>;
  return <Lobby onStartNormal={startNormal} onStartBoss={startBoss}/>;
}
