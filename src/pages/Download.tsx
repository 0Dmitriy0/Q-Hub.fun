export default function Download() {
  return (
    <>
      <section className="card hero">
        <span className="lbl">Q-Hub Desktop · Windows</span>
        <h1>Програма поверх гри</h1>
        <p className="muted">Alt+Q — пошук ціни будь-якого товару просто в грі. Програма бачить твій баланс (готівка + банк) на екрані й пропонує записати кожну зміну в облік персонажа.</p>
        <p className="muted">Не читає пам'ять гри і нічого в ній не натискає — лише знімок маленької ділянки екрана, як OBS.</p>
        <div className="row"><button className="btn acc" disabled>Завантажити (скоро)</button></div>
      </section>
      <section className="card">
        <h2>Що потрібно</h2>
        <ul className="steps">
          <li><span>Windows 10/11, гра в режимі «Вікно без рамки».</span></li>
          <li><span>Акаунт Q-Hub (вхід через Discord) і персонаж у кабінеті.</span></li>
          <li><span>Один раз обвести мишкою ділянку з грошима — програма одразу покаже, що бачить.</span></li>
        </ul>
      </section>
    </>
  );
}
