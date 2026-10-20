(() => {
  const root = document.getElementById('root');
  const modalRoot = document.getElementById('modal-root');
  const letters = ['A', 'B', 'C', 'D'];
  let data = {user:null, currentUser:null, users:[], groups:[], subjects:[], questions:[], exams:[], results:[], attempt:null};
  let csrfToken = '';
  let route = 'home';
  let questionIndex = 0;
  let clock = null;
  let submitting = false;

  function isAdminPath() {
    return /^\/admin\/?$/.test(window.location.pathname);
  }

  async function request(action, values = {}) {
    const response = await fetch('api.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type':'application/json', 'X-CSRF-Token':csrfToken},
      body: JSON.stringify({action, ...values})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Дархост иҷро нашуд.');
    if (payload.data?.csrf) csrfToken = payload.data.csrf;
    return payload.data;
  }

  async function refreshState() {
    const response = await fetch('api.php?action=bootstrap', {credentials:'same-origin', cache:'no-store'});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Пайваст ба сервер нашуд.');
    applyState(payload.data);
  }

  function applyState(serverState) {
    csrfToken = serverState.csrf || csrfToken;
    data = {
      user:serverState.user || null,
      currentUser:serverState.user || null,
      users:serverState.users || [],
      groups:serverState.groups || [],
      subjects:serverState.subjects || [],
      questions:serverState.attempt ? (serverState.attemptQuestions || []) : (serverState.questions || []),
      exams:serverState.exams || [],
      results:serverState.results || [],
      attempt:serverState.attempt || null
    };
  }

  function esc(value='') {
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function initials(name) { return name.split(/\s+/).slice(0,2).map(part=>part[0]||'').join(''); }
  function roleName(role) { return role === 'student' ? 'Донишҷӯ' : 'Администратор'; }
  function subjects() { return [...new Set([...data.subjects,...data.questions.map(question=>question.subject)])].sort((a,b)=>a.localeCompare(b,'tg')); }
  function formatDate(value) {
    const date = new Date(value);
    const months = ['январ','феврал','март','апрел','май','июн','июл','август','сентябр','октябр','ноябр','декабр'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  function setToast(text) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = text;
    document.body.append(node);
    setTimeout(()=>node.remove(),3000);
  }
  function navIcon(icon) { return `<span class="nav-icon" aria-hidden="true">${icon}</span>`; }

  function render() {
    if (!data.currentUser) { renderLogin(); return; }
    if (isAdminPath() && data.currentUser.role !== 'admin') { renderAdminAccessDenied(); return; }
    if (data.attempt) { renderExam(); return; }
    renderApp();
  }

  function renderAdminAccessDenied() {
    root.innerHTML = `<main class="login-main"><section class="login-card"><div class="login-kicker">Дастрасӣ маҳдуд аст</div><h2>Ҳисоби администратор лозим аст</h2><p class="login-sub">Барои кушодани панели идоракунӣ аз ҳисоби администратор истифода баред.</p><button class="btn" data-admin-logout>Баромадан ва ворид шудан</button></section></main>`;
    root.querySelector('[data-admin-logout]').addEventListener('click', async () => {
      try {
        await request('logout');
        data.currentUser = null;
        data.user = null;
        renderLogin();
      } catch (error) {
        renderServerError(error.message);
      }
    });
  }

  function renderServerError(message) {
    root.innerHTML = `<main class="login-main"><section class="login-card"><div class="login-kicker">Пайвасти сервер</div><h2>Низом дастрас нест</h2><p class="login-sub">${esc(message)}</p><div class="notice">Танзими PHP/MySQL ва насби пойгоҳи додаҳоро санҷед. Дастур дар README_DEPLOY.md аст.</div><div style="height:16px"></div><button class="btn" data-retry>Аз нав санҷидан</button></section></main>`;
    root.querySelector('[data-retry]').addEventListener('click',initialize);
  }

  function renderLogin() {
    root.innerHTML = `<main class="login-shell">
      <section class="login-visual"><div class="brand-row"><img src="images.jfif" alt="Нишони Тоҷикистон"><div class="brand-name">КОЛЛЕҶИ МИЛИТСИЯИ ВКД<span>ҶУМҲУРИИ ТОҶИКИСТОН</span></div></div><div class="visual-copy"><div class="eyebrow">Низоми электронии таълим</div><h1>Маркази тестии МДТ<br>Коллеҷи милитсия</h1><p>Муҳити рақамӣ барои гузаронидани имтиҳонҳои нимсола ва баҳодиҳии шаффофи дониш.</p></div><div class="visual-foot"><span>ДУШАНБЕ · ТОҶИКИСТОН</span><span>ТАҲСИЛОТИ КАСБӢ</span></div></section>
      <section class="login-main"><div class="login-card"><div class="mobile-brand"><img src="images.jfif" alt="Нишони Тоҷикистон"><strong>КОЛЛЕҶИ МИЛИТСИЯИ ВКД<span>ҶУМҲУРИИ ТОҶИКИСТОН</span></strong></div><div class="login-kicker">Портали имтиҳонӣ</div><h2>Воридшавӣ</h2><p class="login-sub">Барои идома маълумоти ҳисоби худро ворид кунед.</p>
      <form id="login-form"><div class="field"><label for="login">Логин</label><input id="login" name="login" autocomplete="username" placeholder="Рақами донишҷӯ ё логин" required></div><div class="field"><label for="password">Рамз</label><div class="password-control"><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Рамзи воридшавӣ" required><button class="password-toggle" type="button" data-password-toggle aria-label="Намоиши рамз" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div><div id="login-error" class="login-error" aria-live="polite"></div><button class="btn btn-block" type="submit">Ворид шудан <span aria-hidden="true">→</span></button></form></div></section></main>`;
    root.querySelector('#login-form').addEventListener('submit', login);
    bindPasswordToggles(root);
  }

  function bindPasswordToggles(container) {
    container.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
      const input = button.closest('.password-control')?.querySelector('input');
      if (!input) return;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? 'Пинҳон кардани рамз' : 'Намоиши рамз');
      button.innerHTML = visible
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8.1 2 12 2 12s3.6 7 10 7a10.8 10.8 0 0 0 3-.4"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }));
  }

  async function login(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      applyState(await request('login', {username:String(form.get('login')).trim(), password:String(form.get('password'))}));
      route = 'home';
      render();
    } catch (error) {
      root.querySelector('#login-error').textContent = error.message;
    }
  }

  function navItems() {
    if (data.currentUser.role === 'student') return [['home','⌂','Саҳифаи асосӣ'],['exams','▤','Имтиҳонҳо'],['results','▥','Натиҷаҳои ман']];
    return [['home','⌂','Шарҳи умумӣ'],['exams','▤','Имтиҳонҳо'],['questions','☷','Бонки саволҳо'],['results','▥','Натиҷаҳо'],['users','♙','Истифодабарандагон']];
  }
  const routeTitles = {home:'Саҳифаи асосӣ',exams:'Имтиҳонҳо',questions:'Бонки саволҳо',results:'Натиҷаҳо',users:'Истифодабарандагон'};

  function renderApp() {
    const user = data.currentUser;
    const nav = navItems();
    root.innerHTML = `<div class="app-shell"><aside class="sidebar" id="sidebar"><div class="side-brand"><img src="images.jfif" alt=""><div><strong>КОЛЛЕҶИ МИЛИТСИЯИ ВКД</strong><small>ҶУМҲУРИИ ТОҶИКИСТОН</small></div></div><div class="role-label">Менюи асосӣ</div><nav class="nav-list">${nav.map(([key,icon,label])=>`<button class="nav-btn ${route===key?'active':''}" data-route="${key}">${navIcon(icon)}${label}</button>`).join('')}</nav><div class="side-spacer"></div><div class="user-mini"><div class="avatar">${esc(initials(user.name))}</div><div><strong>${esc(user.name)}</strong><span>${roleName(user.role)}${user.group?' · '+esc(user.group):''}</span></div><button class="logout" title="Баромадан" aria-label="Баромадан" data-action="logout">↪</button></div></aside><main class="main-area"><header class="topbar"><div class="top-left"><button class="mobile-menu" data-action="menu" aria-label="Кушодани меню">☰</button><span class="crumb">Портал</span><span class="top-title">/ ${routeTitles[route]||'Имтиҳон'}</span></div><div class="top-right"><span><i class="status-dot"></i>Низом фаъол аст</span><span>${formatDate(Date.now())}</span></div></header><section class="page" id="page-content">${renderPage()}</section></main></div>`;
    bindAppEvents();
  }

  function heading(title,subtitle,actions='') { return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`; }
  function metric(label,value,note) { return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`; }
  function renderPage() {
    if (route==='home') return data.currentUser.role==='student' ? studentHome() : staffHome();
    if (route==='exams') return data.currentUser.role==='student' ? studentExams() : staffExams();
    if (route==='questions') return questionBank();
    if (route==='results') return resultsPage();
    if (route==='users' && data.currentUser.role==='admin') return usersPage();
    return '';
  }
  function availableExams() { return data.exams.filter(exam=>exam.active&&(!exam.group||exam.group==='Ҳама гурӯҳҳо'||exam.group===data.currentUser.group)); }

  function studentHome() {
    const user=data.currentUser, exams=availableExams();
    const own=data.results.filter(item=>item.userId===user.id).sort((a,b)=>b.finishedAt-a.finishedAt);
    const avg=own.length?Math.round(own.reduce((sum,item)=>sum+item.percent,0)/own.length):0;
    return `<div class="welcome-strip"><div><h2>Хуш омадед, ${esc(user.name.split(' ')[0])}</h2><p>${esc(user.group||'')} · Рӯзи хуб барои санҷидани дониш</p></div><button class="btn" data-route="exams">Имтиҳонҳоро дидан →</button></div><div class="metric-grid">${metric('Имтиҳонҳои дастрас',exams.length,'барои гурӯҳи шумо')}${metric('Имтиҳонҳои супорида',own.length,'дар низом сабт шудааст')}${metric('Баҳои миёна',own.length?avg+'%':'—',own.length?'аз натиҷаҳои шумо':'ҳоло натиҷа нест')}${metric('Ҳолати ҳисоб','Фаъол','воридшавӣ тасдиқ шуд')}</div><div class="content-grid"><section class="panel"><div class="panel-head"><h2>Имтиҳонҳои дастрас</h2><button class="btn btn-outline" data-route="exams">Ҳамааш →</button></div><div class="panel-body">${examCards(exams.slice(0,3))}</div></section><section class="panel"><div class="panel-head"><h2>Натиҷаҳои охирин</h2><button class="btn btn-outline" data-route="results">Таърих →</button></div>${own.length?`<div class="table-wrap"><table><thead><tr><th>Фан</th><th>Хол</th><th>Баҳо</th></tr></thead><tbody>${own.slice(0,4).map(result=>`<tr><td class="table-primary">${esc(result.title)}</td><td>${result.correct}/${result.total}</td><td><span class="tag ${result.percent<60?'tag-red':''}">${esc(result.grade)}</span></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">Натиҷаҳои шумо пас аз супоридани имтиҳон дар ин ҷо пайдо мешаванд.</div>'}</section></div>`;
  }

  function examCards(exams) {
    if (!exams.length) return '<div class="empty-state">Ҳоло имтиҳони дастрас нест.</div>';
    return `<div class="exam-list">${exams.map(exam=>`<article class="exam-card"><div><h3>${esc(exam.title)}</h3><div class="exam-meta"><span>${esc(exam.subject)}</span><span>${exam.minutes} дақиқа</span><span>${Math.min(exam.count,exam.availableCount||0)} савол</span>${exam.group?`<span>Гурӯҳи ${esc(exam.group)}</span>`:''}</div></div>${exam.completed?'<span class="tag">Аллакай супорида шуд</span>':`<button class="btn" data-start="${esc(exam.id)}">Оғози имтиҳон</button>`}</article>`).join('')}</div>`;
  }
  function studentExams() {
    return `${heading('Имтиҳонҳо','Фанни дилхоҳро интихоб кунед. Пас аз оғоз вақт ҳисоб мешавад.')}<div class="notice">Ҷавобҳо ба сервери низом фиристода мешаванд. Ҳангоми ба охир расидани вақт имтиҳон автоматӣ пешниҳод мешавад.</div><div style="height:16px"></div>${examCards(availableExams())}`;
  }
  function staffHome() {
    const allResults=[...data.results].sort((a,b)=>b.finishedAt-a.finishedAt);
    const avg=data.results.length?Math.round(data.results.reduce((sum,result)=>sum+result.percent,0)/data.results.length):0;
    const students=data.users.filter(user=>user.role==='student').length;
    return `${heading('Шарҳи умумӣ','Вазъи имтиҳонҳо ва натиҷаҳои донишҷӯён.',`<button class="btn" data-modal="exam">+ Имтиҳони нав</button>`)}<div class="metric-grid">${metric('Имтиҳонҳои фаъол',data.exams.filter(exam=>exam.active).length,'аз '+data.exams.length+' имтиҳон')}${metric('Бонки саволҳо',data.questions.length,'аз '+subjects().length+' фан')}${metric('Донишҷӯён',students,'ҳисобҳои сабтшуда')}${metric('Баҳои миёна',data.results.length?avg+'%':'—',data.results.length+' натиҷаи сабтшуда')}</div><div class="content-grid"><section class="panel"><div class="panel-head"><h2>Натиҷаҳои охирин</h2><button class="btn btn-outline" data-route="results">Ҳама натиҷаҳо →</button></div>${resultTable(allResults.slice(0,6))}</section><section class="panel"><div class="panel-head"><h2>Имтиҳонҳо</h2><button class="btn btn-outline" data-route="exams">Идоракунӣ →</button></div><div class="panel-body">${data.exams.slice(0,5).map(exam=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #edf0ed;font-size:11px"><span class="table-primary">${esc(exam.title)}</span><span class="tag ${exam.active?'':'tag-red'}">${exam.active?'Фаъол':'Ғайрифаъол'}</span></div>`).join('')||'<div class="empty-state">Имтиҳон ҳанӯз сохта нашудааст.</div>'}</div></section></div>`;
  }
  function resultTable(results) {
    if (!results.length) return '<div class="empty-state">Натиҷа ҳанӯз сабт нашудааст.</div>';
    return `<div class="table-wrap"><table><thead><tr><th>Донишҷӯ</th><th>Гурӯҳ</th><th>Фан</th><th>Дуруст</th><th>Хол</th><th>Баҳо</th><th>Сана</th></tr></thead><tbody>${results.map(result=>`<tr><td class="table-primary">${esc(result.studentName)}</td><td>${esc(result.group||'—')}</td><td>${esc(result.title)}</td><td>${result.correct}/${result.total}</td><td>${result.percent}%</td><td><span class="tag ${result.percent<60?'tag-red':''}">${esc(result.grade)}</span></td><td>${formatDate(result.finishedAt)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function staffExams() {
    return `${heading('Имтиҳонҳо','Имтиҳонҳоро эҷод, фаъол ё ғайрифаъол кунед.',`<button class="btn" data-modal="exam">+ Имтиҳони нав</button>`)}<section class="panel"><div class="table-wrap"><table><thead><tr><th>Номи имтиҳон</th><th>Фан</th><th>Вақт</th><th>Савол</th><th>Гурӯҳ</th><th>Ҳолат</th><th>Амалиёт</th></tr></thead><tbody>${data.exams.length?data.exams.map(exam=>`<tr><td class="table-primary">${esc(exam.title)}</td><td>${esc(exam.subject)}</td><td>${exam.minutes} дақ.</td><td>${exam.count}</td><td>${esc(exam.group||'Ҳама')}</td><td><span class="tag ${exam.active?'':'tag-red'}">${exam.active?'Фаъол':'Ғайрифаъол'}</span></td><td><button class="btn btn-outline" data-toggle-exam="${esc(exam.id)}">${exam.active?'Қатъ':'Фаъол'}</button> <button class="btn btn-outline" data-delete-exam="${esc(exam.id)}" aria-label="Нест кардан">×</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty-state">Имтиҳон илова кунед.</td></tr>'}</tbody></table></div></section>`;
  }
  function questionBank() {
    const subjectAction=data.currentUser.role==='admin'?'<button class="btn btn-outline" data-modal="subject">+ Фанни нав</button>':'';
    return `${heading('Бонки саволҳо','Саволҳои тестӣ аз рӯи фанҳо.',`${subjectAction}<button class="btn" data-modal="question">+ Саволи нав</button>`)}<div class="subject-strip"><strong>Фанҳо</strong>${subjects().map(subject=>`<span class="tag tag-gold">${esc(subject)} <small>${data.questions.filter(question=>question.subject===subject).length} савол</small>${data.currentUser.role==='admin'?`<button class="btn btn-outline" data-delete-subject="${esc(subject)}" title="Нест кардани фан" aria-label="Нест кардани фан ${esc(subject)}">×</button>`:''}</span>`).join('')}</div><div class="filter-row"><select id="subject-filter"><option value="">Ҳамаи фанҳо</option>${subjects().map(subject=>`<option>${esc(subject)}</option>`).join('')}</select><input id="question-search" placeholder="Ҷустуҷӯи савол..." aria-label="Ҷустуҷӯи савол"><span class="muted" id="question-count">${data.questions.length} савол</span></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Фан</th><th>Савол</th><th>Ҷавоби дуруст</th><th></th></tr></thead><tbody id="question-rows">${questionRows(data.questions)}</tbody></table></div></section>`;
  }
  function questionRows(items) {
    return items.length?items.map(question=>`<tr data-subject="${esc(question.subject)}" data-search="${esc((question.text+' '+question.subject).toLowerCase())}"><td><span class="tag tag-gold">${esc(question.subject)}</span></td><td class="table-primary">${esc(question.text)}</td><td>${letters[question.correct]}. ${esc(question.options[question.correct])}</td><td><button class="btn btn-outline" data-delete-question="${esc(question.id)}" aria-label="Нест кардани савол">×</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty-state">Савол ёфт нашуд.</td></tr>';
  }
  function resultsPage() {
    const isStudent=data.currentUser.role==='student';
    const items=(isStudent?data.results.filter(result=>result.userId===data.currentUser.id):data.results).sort((a,b)=>b.finishedAt-a.finishedAt);
    return `${heading(isStudent?'Натиҷаҳои ман':'Натиҷаҳои имтиҳон','Натиҷаҳои сабтшуда ва ведомости имтиҳонӣ.',isStudent?'':`<button class="btn btn-outline" data-action="print">Чопи ведомост</button>`)}<div class="metric-grid">${metric('Имтиҳонҳои супорида',items.length,'натиҷаи сабтшуда')}${metric('Дуруст ҷавобшуда',items.reduce((sum,result)=>sum+result.correct,0),'ҷавоби дуруст')}${metric('Холи миёна',items.length?Math.round(items.reduce((sum,result)=>sum+result.percent,0)/items.length)+'%':'—','аз рӯи натиҷаҳо')}${metric('Баҳои аъло',items.filter(result=>result.grade==='Аъло').length,'натиҷаи 90% ва болотар')}</div><section class="panel"><div class="panel-head"><h2>${isStudent?'Таърихи имтиҳонҳо':'Ведомости имтиҳонӣ'}</h2><span class="muted">${items.length} сабт</span></div>${resultTable(items)}</section>`;
  }
  function usersPage() {
    const actions='<button class="btn btn-outline" data-modal="group">+ Гурӯҳи нав</button><button class="btn" data-modal="user">+ Донишҷӯ</button>';
    return `${heading('Истифодабарандагон','Донишҷӯёнро ба гурӯҳҳои таълимӣ илова кунед.',actions)}<section class="panel" style="margin-bottom:16px"><div class="panel-head"><h2>Гурӯҳҳои таълимӣ</h2><span class="muted">${data.groups.length} гурӯҳ</span></div><div class="table-wrap"><table><thead><tr><th>Номи гурӯҳ</th><th>Донишҷӯён</th><th>Имтиҳонҳои фаъол</th><th></th></tr></thead><tbody>${data.groups.length?data.groups.map(group=>`<tr><td class="table-primary">${esc(group)}</td><td>${data.users.filter(user=>user.role==='student'&&user.group===group).length}</td><td>${data.exams.filter(exam=>exam.active&&(!exam.group||exam.group===group||exam.group==='Ҳама гурӯҳҳо')).length}</td><td><button class="btn btn-outline" data-delete-group="${esc(group)}" title="Нест кардани гурӯҳ" aria-label="Нест кардани гурӯҳ ${esc(group)}">×</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty-state">Аввал гурӯҳи таълимӣ илова кунед.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Ҳисобҳои донишҷӯён ва администратор</h2><span class="muted">${data.users.length} ҳисоб</span></div><div class="table-wrap"><table><thead><tr><th>Ном</th><th>Логин</th><th>Нақш</th><th>Гурӯҳ</th><th>Имтиҳонҳо</th><th></th></tr></thead><tbody>${data.users.map(user=>`<tr><td class="table-primary">${esc(user.name)}</td><td>${esc(user.username)}</td><td><span class="tag">${roleName(user.role)}</span></td><td>${esc(user.group||'—')}</td><td>${data.results.filter(result=>result.userId===user.id).length}</td><td>${user.role==='student'?`<button class="btn btn-outline" data-delete-student="${esc(user.id)}" title="Хориҷ кардани донишҷӯ" aria-label="Хориҷ кардани ${esc(user.name)}">×</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function bindAppEvents() {
    root.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>{route=button.dataset.route;root.querySelector('#sidebar')?.classList.remove('open');renderApp();}));
    root.querySelector('[data-action="logout"]')?.addEventListener('click',logout);
    root.querySelector('[data-action="menu"]')?.addEventListener('click',()=>root.querySelector('#sidebar').classList.toggle('open'));
    root.querySelector('[data-action="print"]')?.addEventListener('click',()=>window.print());
    root.querySelectorAll('[data-start]').forEach(button=>button.addEventListener('click',()=>startExam(button.dataset.start)));
    root.querySelectorAll('[data-modal]').forEach(button=>button.addEventListener('click',()=>openModal(button.dataset.modal)));
    root.querySelectorAll('[data-toggle-exam]').forEach(button=>button.addEventListener('click',async()=>{try{applyState(await request('toggle_exam',{id:button.dataset.toggleExam}));renderApp();}catch(error){setToast(error.message);}}));
    root.querySelectorAll('[data-delete-exam]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Ин имтиҳон нест карда шавад?'))return;try{applyState(await request('delete_exam',{id:button.dataset.deleteExam}));renderApp();}catch(error){setToast(error.message);}}));
    root.querySelectorAll('[data-delete-question]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Ин савол нест карда шавад?'))return;try{applyState(await request('delete_question',{id:button.dataset.deleteQuestion}));renderApp();}catch(error){setToast(error.message);}}));
    root.querySelectorAll('[data-delete-student]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Донишҷӯ дигар ворид шуда натавонад? Натиҷаҳои пешина нигоҳ дошта мешаванд.'))return;try{applyState(await request('delete_student',{id:button.dataset.deleteStudent}));renderApp();setToast('Ҳисоби донишҷӯ ғайрифаъол шуд.');}catch(error){setToast(error.message);}}));
    root.querySelectorAll('[data-delete-group]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm(`Гурӯҳи «${button.dataset.deleteGroup}» нест карда шавад?`))return;try{applyState(await request('delete_group',{name:button.dataset.deleteGroup}));renderApp();}catch(error){setToast(error.message);}}));
    root.querySelectorAll('[data-delete-subject]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm(`Фани «${button.dataset.deleteSubject}» нест карда шавад?`))return;try{applyState(await request('delete_subject',{name:button.dataset.deleteSubject}));renderApp();}catch(error){setToast(error.message);}}));
    const filter=root.querySelector('#subject-filter'),search=root.querySelector('#question-search');
    if(filter&&search){const apply=()=>{const rows=[...root.querySelectorAll('#question-rows tr[data-subject]')];let count=0;rows.forEach(row=>{const show=(!filter.value||row.dataset.subject===filter.value)&&(!search.value||row.dataset.search.includes(search.value.toLowerCase()));row.classList.toggle('hidden',!show);if(show)count++;});root.querySelector('#question-count').textContent=count+' савол';};filter.addEventListener('change',apply);search.addEventListener('input',apply);}
  }

  async function logout() {
    if(clock)clearInterval(clock);
    try { await request('logout'); }
    catch (error) { setToast(error.message); }
    data.attempt=null;
    data.currentUser=null;
    try { await refreshState(); render(); }
    catch (error) { renderServerError(error.message); }
  }

  function openModal(type) {
    let title='',fields='',submit='';
    if(type==='group') {
      title='Иловаи гурӯҳи таълимӣ';fields='<div class="field"><label>Номи гурӯҳ</label><input name="group" required maxlength="60" placeholder="Масалан: 2-102"></div>';submit='Илова кардани гурӯҳ';
    } else if(type==='subject') {
      title='Иловаи фан';fields='<div class="field"><label>Номи фан</label><input name="subject" required maxlength="100" placeholder="Масалан: Забони тоҷикӣ"></div>';submit='Илова кардани фан';
    } else if(type==='exam') {
      title='Эҷоди имтиҳон';fields=`<div class="field"><label>Номи имтиҳон</label><input name="title" required maxlength="180" placeholder="Масалан: Имтиҳони нимсолаи ҳуқуқ"></div><div class="field-row"><div class="field"><label>Фан</label><select name="subject" required>${subjects().map(subject=>`<option>${esc(subject)}</option>`).join('')}</select></div><div class="field"><label>Гурӯҳ</label><select name="group"><option value="">Ҳамаи гурӯҳҳо</option>${data.groups.map(group=>`<option value="${esc(group)}">${esc(group)}</option>`).join('')}</select></div></div><div class="field-row"><div class="field"><label>Вақт (дақиқа)</label><input name="minutes" type="number" min="1" max="240" value="60" required></div><div class="field"><label>Шумораи савол</label><input name="count" type="number" min="1" max="100" value="10" required></div></div>`;submit='Сохтани имтиҳон';
    } else if(type==='question') {
      const options=Array.from({length:4},(_,index)=>`<div class="field"><label>Ҷавоби ${letters[index]}</label><input name="option${index}" maxlength="500" required></div>`).join('');
      title='Иловаи саволи тестӣ';fields=`<div class="field"><label>Фан</label><select name="subject" required>${subjects().map(subject=>`<option value="${esc(subject)}">${esc(subject)}</option>`).join('')}</select></div><div class="field"><label>Матни савол</label><textarea name="text" maxlength="2000" required placeholder="Саволро нависед..."></textarea></div>${options}<div class="field"><label>Ҷавоби дуруст</label><select name="correct">${letters.map((letter,index)=>`<option value="${index}">${letter}</option>`).join('')}</select></div>`;submit='Сабти савол';
    } else {
      title='Иловаи донишҷӯ';fields=`<div class="field"><label>Номи пурра</label><input name="name" maxlength="160" required></div><div class="field-row"><div class="field"><label>Логин</label><input name="username" minlength="3" maxlength="64" pattern="[A-Za-z0-9._-]+" required></div><div class="field"><label>Рамзи ибтидоӣ</label><div class="password-control"><input name="password" type="password" minlength="8" required><button class="password-toggle" type="button" data-password-toggle aria-label="Намоиши рамз" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div></div><div class="field"><label>Гурӯҳ</label><select name="group" required><option value="">Гурӯҳро интихоб кунед</option>${data.groups.map(group=>`<option value="${esc(group)}">${esc(group)}</option>`).join('')}</select></div>`;submit='Иловаи донишҷӯ';
    }
    modalRoot.innerHTML=`<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true" aria-label="${title}"><div class="modal-head"><h2>${title}</h2><button class="modal-close" data-close aria-label="Пӯшидан">×</button></div><form id="modal-form"><div class="modal-content">${fields}<div class="login-error" id="modal-error"></div></div><div class="modal-foot"><button type="button" class="btn btn-outline" data-close>Бекор кардан</button><button class="btn" type="submit">${submit}</button></div></form></section></div>`;
    modalRoot.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',closeModal));
    modalRoot.querySelector('[data-dismiss]').addEventListener('click',event=>{if(event.target===event.currentTarget)closeModal();});
    modalRoot.querySelector('#modal-form').addEventListener('submit',event=>saveModal(event,type));
    bindPasswordToggles(modalRoot);
    modalRoot.querySelector('input')?.focus();
  }
  function closeModal() { modalRoot.innerHTML=''; }

  async function saveModal(event,type) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const value=key=>String(form.get(key)||'').trim();
    let action,payload;
    if(type==='group') { action='create_group';payload={name:value('group')}; }
    else if(type==='subject') { action='create_subject';payload={name:value('subject')}; }
    else if(type==='exam') { action='create_exam';payload={title:value('title'),subject:value('subject'),group:value('group'),minutes:Number(value('minutes')),count:Number(value('count'))}; }
    else if(type==='question') { action='create_question';payload={subject:value('subject'),text:value('text'),options:[0,1,2,3].map(index=>value('option'+index)),correct:Number(value('correct'))}; }
    else { action='create_student';payload={name:value('name'),username:value('username'),password:value('password'),group:value('group')}; }
    try {
      applyState(await request(action,payload));
      closeModal();
      renderApp();
      setToast(type==='group'?'Гурӯҳ илова шуд.':type==='subject'?'Фан илова шуд.':type==='exam'?'Имтиҳон сохта шуд.':type==='question'?'Савол ба бонк илова шуд.':'Донишҷӯ илова шуд.');
    } catch (error) {
      modalRoot.querySelector('#modal-error').textContent=error.message;
    }
  }

  async function startExam(examId) {
    try {
      questionIndex=0;
      applyState(await request('start_attempt',{examId}));
      render();
    } catch (error) { setToast(error.message); }
  }
  function remainingSeconds() { return Math.max(0,Math.ceil((data.attempt.endsAt-Date.now())/1000)); }
  function formatTime(seconds) { return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; }

  function renderExam() {
    if(clock)clearInterval(clock);
    const attempt=data.attempt;
    const questions=attempt.order.map(id=>data.questions.find(question=>question.id===id)).filter(Boolean);
    if(!questions.length) { renderServerError('Саволҳои имтиҳон дастрас нестанд. Саҳифаро нав кунед.');return; }
    questionIndex=Math.min(questionIndex,questions.length-1);
    const question=questions[questionIndex];
    const answer=attempt.answers[question.id];
    const remaining=remainingSeconds();
    root.innerHTML=`<main class="page exam-screen"><div class="exam-top"><div><h1>${esc(attempt.title)}</h1><small>${esc(attempt.subject)} · ${esc(data.currentUser.name)} · ${esc(data.currentUser.group||'')}</small></div><div class="timer ${remaining<300?'warn':''}" id="timer">${formatTime(remaining)}</div></div><div class="exam-progress"><div style="width:${Object.keys(attempt.answers).length/questions.length*100}%"></div></div><section class="exam-body"><div class="question-count">Саволи ${questionIndex+1} аз ${questions.length}</div><h2 class="question-text">${esc(question.text)}</h2><div class="option-list">${question.options.map((option,index)=>`<button class="option ${answer===index?'selected':''}" data-answer="${index}"><span class="option-letter">${letters[index]}</span><span>${esc(option)}</span></button>`).join('')}</div><div class="question-nav">${questions.map((item,index)=>`<button class="qdot ${index===questionIndex?'current':''} ${attempt.answers[item.id]!==undefined?'answered':''}" data-question-index="${index}" aria-label="Саволи ${index+1}">${index+1}</button>`).join('')}</div><div class="exam-footer"><button class="btn btn-outline" data-question-prev ${questionIndex===0?'disabled':''}>← Пешина</button><span class="muted" style="font-size:10px">${Object.keys(attempt.answers).length} аз ${questions.length} ҷавоб дода шуд</span><div>${questionIndex<questions.length-1?'<button class="btn" data-question-next>Саволи навбатӣ →</button>':'<button class="btn" data-submit>Анҷом додан</button>'}</div></div></section><div class="notice">Ҷавобҳо дар сервер нигоҳ дошта мешаванд ва баъди анҷом натиҷа автоматӣ ҳисоб мешавад.</div></main>`;
    root.querySelectorAll('[data-answer]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try { applyState(await request('save_answer',{attemptId:attempt.id,questionId:question.id,answer:Number(button.dataset.answer)}));renderExam(); }
      catch(error) { button.disabled=false;setToast(error.message); }
    }));
    root.querySelectorAll('[data-question-index]').forEach(button=>button.addEventListener('click',()=>{questionIndex=Number(button.dataset.questionIndex);renderExam();}));
    root.querySelector('[data-question-prev]')?.addEventListener('click',()=>{questionIndex--;renderExam();});
    root.querySelector('[data-question-next]')?.addEventListener('click',()=>{questionIndex++;renderExam();});
    root.querySelector('[data-submit]')?.addEventListener('click',()=>submitExam(false));
    clock=setInterval(()=>{const seconds=remainingSeconds();const timer=root.querySelector('#timer');if(timer){timer.textContent=formatTime(seconds);timer.classList.toggle('warn',seconds<300);}if(seconds<=0)submitExam(true);},1000);
  }

  async function submitExam(expired) {
    if(!data.attempt||submitting)return;
    const attempt=data.attempt;
    if(!expired&&!confirm(`Имтиҳонро анҷом медиҳед? Ҷавоб додаед: ${Object.keys(attempt.answers).length} аз ${attempt.order.length}.`))return;
    submitting=true;
    if(clock)clearInterval(clock);
    try {
      const response=await request('submit_attempt',{attemptId:attempt.id});
      await refreshState();
      renderResult(response.result);
    } catch(error) {
      submitting=false;
      setToast(error.message);
      await refreshState();
      render();
    }
  }
  function renderResult(result) {
    if(!result) { route='results';renderApp();return; }
    document.getElementById('root').innerHTML=`<main class="page exam-screen"><div class="exam-top"><div><h1>Имтиҳон анҷом ёфт</h1><small>${esc(result.title)} · ${esc(result.studentName)}</small></div><span class="tag">Натиҷа сабт шуд</span></div><section class="result-hero"><div class="question-count" style="color:#d9c690">НАТИҶАИ ШУМО</div><div class="result-score">${result.percent}%</div><p>${result.correct} ҷавоби дуруст аз ${result.total} савол${result.expired?' · вақт ба охир расид':''}</p><div class="grade-mark">${esc(result.grade)}</div></section><div class="result-stats"><div class="result-stat"><b>${result.correct}</b><span>Ҷавоби дуруст</span></div><div class="result-stat"><b>${result.wrong}</b><span>Ҷавоби нодуруст</span></div><div class="result-stat"><b>${result.total}</b><span>Ҳамагӣ савол</span></div></div><div class="exam-body" style="border-top:0;text-align:center"><p class="muted">Натиҷа дар таърихи имтиҳонҳои шумо сабт шуд.${result.expired?' Имтиҳонро такроран супорида намешавад.':''}</p><button class="btn" data-result-home>Бозгашт ба саҳифаи асосӣ</button> <button class="btn btn-outline" data-result-history>Натиҷаҳои ман</button></div></main>`;
    root.querySelector('[data-result-home]').addEventListener('click',()=>{submitting=false;route='home';renderApp();});
    root.querySelector('[data-result-history]').addEventListener('click',()=>{submitting=false;route='results';renderApp();});
  }

  async function initialize() {
    try { await refreshState();render(); }
    catch(error) { renderServerError(error.message); }
  }
  initialize();
})();
