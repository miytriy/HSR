// 戦闘評価の永続化（ブラウザの localStorage に保存）
export async function saveBattleRating(stage, diff, stars) {
  try {
    const k = `lacunary:rating:${stage}:${diff}`;
    const prev = Number(localStorage.getItem(k) || 0);
    if (stars > prev) localStorage.setItem(k, String(stars));
  } catch (e) { /* localStorage 不可の環境では保存しない */ }
}

export async function loadBattleRating(stage, diff) {
  try {
    return Number(localStorage.getItem(`lacunary:rating:${stage}:${diff}`) || 0);
  } catch (e) {
    return 0;
  }
}
