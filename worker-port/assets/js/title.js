import { startAttract } from './attract.js';
startAttract(document.getElementById('title-map'), { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, count: 16 });
