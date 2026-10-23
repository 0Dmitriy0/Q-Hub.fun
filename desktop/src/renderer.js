const $ = id => document.getElementById(id);
function show(s) {
  $('err').hidden = !s.error; $('err').textContent = s.error || '';
  $('out').hidden = !!s.user; $('in').hidden = !s.user; $('wait').hidden = true; $('login').disabled = false;
  if (!s.user) return;
  $('name').textContent = s.user.name;
  $('game').textContent = s.user.gameName ? `${s.user.gameName}${s.user.staticId ? ' #' + s.user.staticId : ''}` : 'Нік і статік — у кабінеті';
  $('avatar').hidden = !s.user.avatar; if (s.user.avatar) $('avatar').src = s.user.avatar;
  const sel = $('chars'); sel.replaceChildren(...s.characters.map(c => new Option(c.name, c.id, false, c.id === s.character)));
  $('pick').hidden = !s.characters.length; $('nochar').hidden = !!s.characters.length;
}
$('login').onclick = async () => { $('login').disabled = true; $('wait').hidden = false; show(await window.qhub.login()); };
$('logout').onclick = async () => show(await window.qhub.logout());
$('chars').onchange = e => window.qhub.character(e.target.value);
$('cabinet').onclick = () => window.qhub.cabinet();
window.qhub.state().then(show);
