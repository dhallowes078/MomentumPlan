import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { installApiFetchBridge } from "./api-bridge";
import { App } from "./App";
import "@/app/globals.css";

installApiFetchBridge();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);
