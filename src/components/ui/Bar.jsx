export function Bar({pct,color,h=5}){
  return(
    <div style={{background:"#1a1a2e",borderRadius:3,height:h,overflow:"hidden",flex:1}}>
      <div style={{width:`${Math.max(0,Math.min(100,pct))}%`,height:"100%",background:color,transition:"width .3s",borderRadius:3}}/>
    </div>
  );
}
