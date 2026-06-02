import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Links from "./pages/Links.jsx";
import "./styles.css";

// Lazy-load the admin dashboard — keeps the /links bundle lean
const App = lazy(() => import("./App.jsx"));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/links" element={<Links />} />
        <Route path="/*" element={
          <Suspense fallback={null}>
            <App />
          </Suspense>
        } />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
