import { useState, useEffect } from "react";
import { CharListCard, SlotCard } from "./LobbyParts.jsx";
import { ALL_CHARS, BOSS_LV_BY_DIFF, DEFAULT_SLOTS, DIFFICULTIES, DIFF_COLOR, ENEMY_LV_BY_DIFF } from "../data/roster.js";
import { loadBattleRating } from "../logic/ratings.js";

export function Lobby({ onStartNormal, onStartBoss }) {
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
      color:"#e2e8f0",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
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
      color:"#e2e8f0",height:"100%",display:"flex",flexDirection:"column",position:"relative",overflow:"hidden",userSelect:"none"}}>
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
