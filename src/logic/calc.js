export const clone  = o => JSON.parse(JSON.stringify(o));
export const addLog = (logs, text, type="info") => [...logs, {id:Date.now()+Math.random(), text, type}];
export const fmt    = n => n>=1000000?`${(n/1000000).toFixed(2)}M`:n>=1000?`${(n/1000).toFixed(1)}k`:String(n);
export const roll   = p => Math.random() < p;

export const CHAR_LV = 80;
export const charLvValue = (lv=CHAR_LV) => 3767.5533;
export const toughnessRatioOf = (maxToughness=30) => 0.5 + maxToughness/40;

export const calcDmgCore = (atk, ratio, def=600, ignoreDef=0, elemRes=0, cr=0, cd=1.5, dmgBonus=0, opts={}) => {
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

export const calcDmg = (atk, ratio, def=600, ignoreDef=0, elemRes=0, cr=0, cd=1.5, dmgBonus=0, opts={}) => {
  return calcDmgCore(atk, ratio, def, ignoreDef, elemRes, cr, cd, dmgBonus, opts).value;
};

export const ELEM_BREAK_MULT = { physical:2, fire:2, ice:1, lightning:1, wind:1.5, quantum:0.5, imaginary:0.5, other:2 };
export const calcBreakDmg = (elem, maxToughness, breakEffect=0, enemyLv=80, defDownPct=0, ignoreDef=0, elemRes=0, vulnBonus=0) => {
  const ratio = toughnessRatioOf(maxToughness);
  const base = charLvValue(CHAR_LV) * (ELEM_BREAK_MULT[elem]??1) * ratio;
  const enemyDef = (200+10*enemyLv)*(1-defDownPct-ignoreDef);
  const defMult = (200+10*CHAR_LV) / (enemyDef + 200+10*CHAR_LV);
  const resMult = Math.max(0, 1-elemRes);
  const vulnMult = 1+vulnBonus;
  return Math.floor(base*(1+breakEffect)*defMult*resMult*vulnMult*0.9);
};

export const calcDotBase = (mult, enemyLv, defDownPct=0, ignoreDef=0, elemRes=0, vulnBonus=0, breakMult=0.9) => {
  const base = charLvValue(CHAR_LV) * mult;
  const enemyDef = (200+10*enemyLv)*(1-defDownPct-ignoreDef);
  const defMult = (200+10*CHAR_LV) / (enemyDef + 200+10*CHAR_LV);
  const resMult = Math.max(0, 1-elemRes);
  const vulnMult = 1+vulnBonus;
  return Math.floor(base*defMult*resMult*vulnMult*breakMult);
};

export const getEpEff = c => c.buffs.reduce((a,b)=>a+(b.type==="ep_eff"?(b.value||0):0),0);
export const gainEP   = (c, base, eff=true) => {
  const real=Math.floor(base*(1+(eff?getEpEff(c):0)));
  c.ep=Math.min(c.maxEp,c.ep+real); return real;
};
