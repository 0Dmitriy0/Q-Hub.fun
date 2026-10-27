const $ = id => document.getElementById(id);
const initial = s => (s.trim()[0] || '?').toUpperCase();
/* плитка персонажа: клік — запам'ятати його і відкрити кабінет */
function tile(c, last) {
  const b = document.createElement('button');
  b.className = 'tile' + (last ? ' last' : ''); b.title = c.name;
  b.innerHTML = '<span class="ava"></span><span class="nm"></span>' + (last ? '<span class="tag">востаннє</span>' : '');
  b.querySelector('.ava').textContent = initial(c.name); b.querySelector('.nm').textContent = c.name;
  b.onclick = async () => { await window.qhub.character(c.id); window.qhub.cabinet(); };
  return b;
}
function addTile() {
  const b = document.createElement('button');
  b.className = 'tile add'; b.title = 'Новий персонаж — у кабінеті на сайті';
  b.innerHTML = '<span class="ava">+</span><span class="nm">Новий</span>';
  b.onclick = () => window.qhub.site('/kabinet');
  return b;
}
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
  $('name').textContent = s.user.name;
  $('game').textContent = s.user.gameName ? `${s.user.gameName}${s.user.staticId ? ' #' + s.user.staticId : ''}` : 'Нік і статік — у кабінеті';
  $('avatar').hidden = !s.user.avatar; if (s.user.avatar) $('avatar').src = s.user.avatar;
  $('ph').hidden = !!s.user.avatar; $('ph').textContent = initial(s.user.name);
  $('tiles').replaceChildren(...s.characters.map(c => tile(c, s.characters.length > 1 && c.id === s.character)), addTile());
  $('nochar').hidden = !!s.characters.length;
}
$('login').onclick = async () => { waiting(true); show(await window.qhub.login()); };
$('logout').onclick = async () => show(await window.qhub.logout());
$('close').onclick = () => window.qhub.gateHide();
/* вікно рівно під плашку + 60 px прозорого поля під тінь */
new ResizeObserver(() => window.qhub.gateSize($('panel').offsetHeight + 60)).observe($('panel'));
window.qhub.state().then(show);
