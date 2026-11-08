import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

try {
  if (!localStorage.getItem("tpva-welcome-seen") && window.location.pathname === "/") {
    window.history.replaceState(null, "", "/welcome");
  }
} catch {}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
