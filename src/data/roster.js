export const ALL_CHARS = [
  { id:"ziran", name:"紫蘭", icon:"⚔️", role:"アタッカー", element:"量子", path:"及落", stars:5, color:"#a78bfa", hp:1789, atk:951, spd:110, desc:"X値を蓄積して爆発的なダメージを叩き出す量子アタッカー。" },
  { id:"saki",  name:"咲希", icon:"🌺", role:"サポート",   element:"七彩", path:"調和", stars:5, color:"#f9a8d4", hp:1206, atk:1033,spd:102, desc:"頼友・花畑・結界で味方全体を強化する万能サポーター。" },
  { id:"ouma",  name:"桜舞", icon:"🌸", role:"ヒーラー",   element:"風",   path:"豊穣", stars:5, color:"#86efac", hp:2133, atk:336, spd:105, desc:"連兎を召喚してパーティを継続回復させる万能ヒーラー。" },
  { id:"tsukasa", name:"ツカサ", icon:"🗡️", role:"アタッカー", element:"凛刃", path:"壊滅", stars:5, color:"#f87171", hp:1215, atk:625, spd:103, desc:"剣術を駆使する物理派生・凛刃属性の壊滅アタッカー。（簡易版）" },
  { id:"ren",   name:"蓮",   icon:"🔥", role:"アタッカー", element:"炎",   path:"殲滅", stars:4, color:"#fb923c", hp:1240, atk:820, spd:108, desc:"灼熱の炎で敵全体を薙ぎ払う攻撃型アタッカー。" },
  { id:"tsuki", name:"月影", icon:"🌙", role:"デバッファー",element:"氷",   path:"虚無", stars:4, color:"#93c5fd", hp:980,  atk:750, spd:98,  desc:"氷結と凍傷で敵を弱体化させる戦術型デバッファー。" },
  { id:"kaze",  name:"風牙", icon:"💨", role:"サポート",   element:"風",   path:"調和", stars:4, color:"#6ee7b7", hp:890,  atk:680, spd:115, desc:"高速行動で味方のターンを増やすスピード型サポーター。" },
  { id:"miroku",name:"ミロク",icon:"🌀", role:"召喚士",    element:"風",   path:"記憶", stars:5, color:"#34d399", hp:872,  atk:338, spd:115, desc:"リノセウスを召喚し、Xを活かしたバウンド攻撃で敵を薙ぎ払う記憶の召喚士。" },
];

export const DEFAULT_SLOTS = ["ziran","saki","ouma"];
export const DIFFICULTIES = ["Normal","Hard","Extreme"];
export const DIFF_COLOR = { Normal:"#4ade80", Hard:"#fbbf24", Extreme:"#ef4444" };
export const ENEMY_LV_BY_DIFF = { Normal:60, Hard:80, Extreme:100 };
export const BOSS_LV_BY_DIFF  = { Normal:80, Hard:100, Extreme:120 };
