import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { welcomeEntryRedirect } from "./entryRoute.js";
import { purgeSampleSelection } from "./services/api.js";
import "./index.css";

const welcome = welcomeEntryRedirect(window.location, () => window.sessionStorage);
if (welcome) window.history.replaceState(null, "", welcome);

purgeSampleSelection();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);
