// Renders live visualizations into each method card's "Worked example"
// block. Each target div carries data-method/data-a/data-b; we run the
// pair through the same normalize → method → renderVisualization chain
// the Try-it page uses, so the example breakdown matches what the reader
// will see when they play with the tool. The score derivation is
// rendered from the shared calculations module.

import { normalize } from './normalization.js';
import { METHODS } from './methods.js';
import { renderVisualization } from './visualize.js';
import { renderCalculation } from './calculations.js';

function renderAll() {
  const byId = Object.fromEntries(METHODS.map((m) => [m.id, m]));
  for (const el of document.querySelectorAll('.method-viz')) {
    const method = byId[el.dataset.method];
    if (!method) continue;
    const a = el.dataset.a ?? '';
    const b = el.dataset.b ?? '';
    const normA = normalize(a);
    const normB = normalize(b);
    const result = method.fn(normA, normB);
    const viz = renderVisualization(el.dataset.method, normA, normB, result, {
      aLabel: 'A',
      bLabel: 'B',
    });
    el.innerHTML = `
      ${viz}
      ${renderCalculation(el.dataset.method, normA, normB, result)}
    `;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderAll);
} else {
  renderAll();
}
