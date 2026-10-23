// DOM helpers shared by the UI modules.

export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const canvas = $('arena');
export const arenaWrap = document.querySelector('.arena-wrap');

// Save a file with an ordinary browser download.
export function saveFile(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
