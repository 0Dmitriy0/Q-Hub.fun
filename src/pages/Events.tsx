import EventList from '../components/EventList';
export default function Events() {
  return (
    <>
      <div><h1>Івенти</h1><p className="muted">Розклад за київським часом, статус оновлюється сам.</p></div>
      <section className="card"><EventList /></section>
    </>
  );
}
