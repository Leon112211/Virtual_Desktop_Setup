/**
 * CS50x Final Project — DeskCraft (3D Workspace & Cable Routing Studio)
 *
 * Academic Honesty & AI Assistance Disclosure:
 * Product concept, workspace domain rules (fixed-length non-stretching cable physics,
 * modular pure-cable vs. optional power-adapter logic, anti-clipping constraints, and
 * de-branded 1:1 hardware specifications), UX workflow, and iterative visual/functional QA
 * were conceived, directed, and verified by the author. AI coding assistants (Gemini / Claude)
 * were used to assist with Three.js procedural geometry math, React/TypeScript implementation,
 * automated test scaffolding, and bilingual EN/ZH localization.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
