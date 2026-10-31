/* коли закривати OCR зору (vision.cjs). Пам'ять WebAssembly рушія tesseract лише росте: список скупника (пів екрана,
   збільшені вдвічі — 1920×2160 на 1080p) лишає в ньому ~90 МБ, які повертає тільки terminate.
   all — зір не працює довше IDLE (гру закрито, персонажа не вибрано): закрити всі рушії;
   lists — список скупника не читали довше LIST_IDLE: закрити лише рушій списків. Тут без tesseract, щоб тести його не тягнули */
const IDLE = 60e3, LIST_IDLE = 30e3;

function ocrRelease({ active, inactiveSince, listsAt, hasAny, hasLists, now }) {
  if (!active) return hasAny && inactiveSince && now - inactiveSince > IDLE ? 'all' : null;
  return hasLists && now - listsAt > LIST_IDLE ? 'lists' : null;
}

module.exports = { ocrRelease, IDLE, LIST_IDLE };
