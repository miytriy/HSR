import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Stage from "./components/Stage.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Stage>
      <App />
    </Stage>
  </StrictMode>
);
