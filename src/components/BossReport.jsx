import { useState } from "react";
import { Bar } from "./ui/Bar.jsx";
import { CHAR_STATUS } from "../data/charStatus.js";
import { BOSS_SPD } from "../logic/boss.js";
import { fmt } from "../logic/calc.js";

export function BossReport({ state, onClose, initialTab="ally", initialCharId=null }) {
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
