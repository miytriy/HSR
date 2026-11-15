# LACUNARY Battle Simulator

React + Vite 製のターン制バトルシミュレーター。

## ローカル起動

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ に本番ビルド
```

## GitHub → Render 公開

1. GitHub で空のリポジトリを作成し、このフォルダを push
   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/lacunary-battle.git
   git push -u origin main
   ```
2. Render で **New + → Static Site** → リポジトリを選択
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
   - （`render.yaml` があるので Blueprint 経由でも同じ設定になります）
3. 以降は `main` に push するたびに自動デプロイされます。

## 構成

```
src/
├─ App.jsx                 画面切替（ロビー / 通常戦 / ボス戦）
├─ components/             UI（Lobby, NormalBattle, BossBattle, *Report, ui/Bar）
├─ data/
│  ├─ roster.js            ロビーのキャラ一覧・難易度・レベル設定
│  └─ charStatus.js        戦闘実況に表示するスキル/天賦/星魂テキスト
├─ logic/
│  ├─ calc.js              ダメージ計算・EP
│  ├─ state.js             戦闘の初期状態・キャラ定義・AV/行動順
│  ├─ effects.js           靭性・弱点撃破・状態異常・回復
│  ├─ actions.js           通常戦のプレイヤー/敵/召喚物の行動
│  ├─ boss.js              ボス戦ロジック
│  └─ ratings.js           星評価の保存（localStorage）
└─ styles/theme.js         属性カラー
```

## キャラ追加時に触る場所（現状）

キャラごとの行動はまだ `charId` による分岐で実装されています。

| ファイル | 追加内容 |
|---|---|
| `data/roster.js` | `ALL_CHARS` にロビー表示用データ |
| `logic/state.js` | `VALID_CHAR_IDS` / `CHAR_SPD` / `mkChars` |
| `logic/actions.js`, `logic/boss.js` | 通常攻撃・スキル・必殺技の処理 |
| `data/charStatus.js` | 戦闘実況用テキスト |
| `components/NormalBattle.jsx`, `BossBattle.jsx` | 技ボタン定義 (`acts`)、ダメージ表示の属性 (`elemMap`) |
