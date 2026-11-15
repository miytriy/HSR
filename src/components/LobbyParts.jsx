export function StarRating({ count }) {
  return (
    <div style={{display:"flex",gap:1}}>
      {Array.from({length:count}).map((_,i)=>(
        <span key={i} style={{fontSize:"0.5rem",color:"#fbbf24",lineHeight:1}}>★</span>
      ))}
    </div>
  );
}

export function StatBar({ label, value, max, color }) {
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

export function SlotCard({ char, slotIdx, isActive, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onTap, onRemove }) {
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

export function CharListCard({ char, isSelected, isInSlot, pickOrder, onSelect }) {
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
