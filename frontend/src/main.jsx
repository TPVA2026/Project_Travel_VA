import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { welcomeEntryRedirect } from "./entryRoute.js";
import "./index.css";

const welcome = welcomeEntryRedirect(window.location, () => window.sessionStorage);
if (welcome) window.history.replaceState(null, "", welcome);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
