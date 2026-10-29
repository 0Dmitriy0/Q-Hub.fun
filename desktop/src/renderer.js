const $ = id => document.getElementById(id);
const initial = s => (s.trim()[0] || '?').toUpperCase();
/* плитка персонажа: клік — запам'ятати його і відкрити кабінет */
function tile(c, last) {
  const b = document.createElement('button');
  b.className = 'tile' + (last ? ' last' : ''); b.title = c.name;
  b.innerHTML = '<span class="ava"></span><span class="nm"></span><span class="st"></span>' + (last ? '<span class="tag">востаннє</span>' : '');
  b.querySelector('.ava').textContent = initial(c.name); b.querySelector('.nm').textContent = c.name;
  b.querySelector('.st').textContent = c.static ? '#' + c.static : 'без статіку';
  b.onclick = async () => { await window.qhub.character(c.id); window.qhub.cabinet(); };
  return b;
}
function addTile() {
  const b = document.createElement('button');
  b.className = 'tile add'; b.title = 'Новий персонаж';
  b.innerHTML = '<span class="ava">+</span><span class="nm">Новий</span>';
  b.onclick = () => addForm(true);
  return b;
}
/* форма нового персонажа: без персонажів — відкрита одразу */
function addForm(on) {
  $('addf').hidden = !on;
  if (on) $('cname').focus();
}
$('addf').onsubmit = async e => {
  e.preventDefault();
  $('cadd').disabled = true;
  const s = await window.qhub.charAdd({ name: $('cname').value, static: $('cstatic').value, start: $('cstart').value });
  $('cadd').disabled = false;
  if (!s.error) { $('cname').value = ''; $('cstatic').value = ''; $('cstart').value = ''; }
  show(s);
};
/* нік акаунта: перевірка формату — і тут, і в базі (зайнятий, раз на 30 днів) */
$('nickf').onsubmit = async e => {
  e.preventDefault();
  $('nickgo').disabled = true;
  const s = await window.qhub.nickSet($('nick').value);
  $('nickgo').disabled = false;
  show(s);
};
const MAX_CHARS = 3;
function waiting(on) {
  $('login').disabled = on;
  $('loginText').textContent = on ? 'Чекаю підтвердження в браузері…' : 'Увійти через Discord';
  $('login').querySelector('svg').style.display = on ? 'none' : '';
  $('login').querySelector('.spin')?.remove();
  if (on) $('login').prepend(Object.assign(document.createElement('span'), { className: 'spin' }));
}
function show(s) {
  $('err').hidden = !s.error; $('err').textContent = s.error || '';
  $('out').hidden = !!s.user; $('in').hidden = !s.user; waiting(false);
  if (!s.user) return;
  /* зверху нік акаунта, під ним — з якого Discord зайшов; без ніка — спершу вибрати нік */
  $('name').textContent = s.user.nick || s.user.name;
  $('game').textContent = s.user.nick ? 'Discord: ' + s.user.name : 'Нік у Q-Hub ще не вибрано';
  $('avatar').hidden = !s.user.avatar; if (s.user.avatar) $('avatar').src = s.user.avatar;
  $('ph').hidden = !!s.user.avatar; $('ph').textContent = initial(s.user.nick || s.user.name);
  $('nickstep').hidden = !!s.user.nick; $('chars').hidden = !s.user.nick;
  if (!s.user.nick) { $('nick').focus(); return; }
  const full = s.characters.length >= MAX_CHARS;
  $('tiles').replaceChildren(...s.characters.map(c => tile(c, s.characters.length > 1 && c.id === s.character)), ...(full ? [] : [addTile()]));
  $('nochar').hidden = !!s.characters.length;
  addForm(!full && (!s.characters.length || !!s.error && !$('addf').hidden));
}
$('login').onclick = async () => { waiting(true); show(await window.qhub.login()); };
$('logout').onclick = async () => show(await window.qhub.logout());
$('close').onclick = () => window.qhub.gateHide();
/* вікно рівно під плашку + 60 px прозорого поля під тінь */
new ResizeObserver(() => window.qhub.gateSize($('panel').offsetHeight + 60)).observe($('panel'));
window.qhub.state().then(show);
