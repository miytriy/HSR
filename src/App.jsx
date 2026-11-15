import { useState } from "react";
import { BossBattle } from "./components/BossBattle.jsx";
import { Lobby } from "./components/Lobby.jsx";
import { NormalBattle } from "./components/NormalBattle.jsx";

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
