/* текст розділу інструкції (public.guides, specs/023) -> кроки: кроки розділені порожнім рядком;
   рядок «Знімок: https://…» — картинка до кроку, решта рядків — текст */
export interface GuideStep { text: string; image: string | null }

export function steps(text: string): GuideStep[] {
  return text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(block => {
    let image: string | null = null;
    const lines = block.split('\n').filter(line => {
      const m = /^\s*знімок:\s*(https:\/\/\S+)\s*$/i.exec(line);
      if (m) { image = m[1]; return false; }
      return true;
    });
    return { text: lines.join('\n').trim(), image };
  }).filter(s => s.text || s.image);
}
