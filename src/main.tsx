// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Fuentes e iconos empaquetados (offline, sin CDN).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@tabler/icons-webfont/dist/tabler-icons.min.css";

import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("no se encontro el elemento #root");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
