import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { OperatorApp } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('operator web root element is missing');

createRoot(root).render(
  <StrictMode>
    <OperatorApp />
  </StrictMode>,
);
