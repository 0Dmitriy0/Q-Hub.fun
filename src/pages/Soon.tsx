const PAGES = {
  transport: { title: 'Транспорт', text: 'Автосалони (люкс, мото, авіа) з фільтрами за маркою і сортуванням за ціною, швидкістю, багажником і баком. Поруч із держ. ціною — ринкова, з угод гравців.' },
  map: { title: 'Мапа', text: 'Інтерактивна мапа з точками: 24/7, бари, зброя, тату, скупники, роботи. Фільтри й пошук.' },
  jobs: { title: 'Роботи', text: 'Легальні й нелегальні роботи з прибутком на годину гри — з реальних записів обліку гравців, а не з чуток.' }
} as const;

export default function Soon({ page }: { page: keyof typeof PAGES }) {
  const p = PAGES[page];
  return (
    <section className="card hero">
      <span className="lbl">В роботі · етап 4</span>
      <h1>{p.title}</h1>
      <p className="muted">{p.text}</p>
      <p className="muted">Дані наповнюємо самі — з гри, Discord і від гравців.</p>
    </section>
  );
}
