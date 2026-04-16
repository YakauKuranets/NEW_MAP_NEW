
/*
 * js/main.js — основной клиентский код для проекта Map v12
 *
 * Этот файл реализует работу с картой (Leaflet), рисование зон,
 * загрузку и отображение списка адресов, работу с модальными окнами,
 * а также управление темой.
 *
 * Обновлено: аккуратный вывод заявок в колокольчике (по строкам: Описание, Инициатор,
 * Категория, Доступ, Координаты, Ссылка).
 * + Микро-анимации и UX: ripple, bump у метки, контекст-меню по правому клику,
 *   быстрые чипы‑счётчики, инъекция стилей (шестерёнка крутится на hover).
 */

/* ========= Утилиты ========= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function escapeAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }

function escapeHTML(str) {
  return String(str || '').replace(/[&<>\"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
function linkify(text) {
  const esc = escapeHTML(text || '');
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return esc.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}
function setProgress(el, pct){
  if(!el) return;
  pct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const pctStr = pct + '%';
  try {
    el.style.setProperty('--progress', pctStr);
  } catch (err) {
    try {
      const bar = el.querySelector && el.querySelector('span') ? el : null;
      if (bar && bar.style) bar.style.width = pctStr;
    } catch (_) {}
  }
  const t = el.querySelector('span');
  if(t) t.textContent = pct + '%';
}

// Формат размера
function formatSize(bytes) {
  const units = ['байт', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let n = Number(bytes);
  if (!n || n < 0) return '';
  let u = 0;
  while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
  return (u === 0 ? n.toFixed(0) : n.toFixed(1)) + ' ' + units[u];
}

/* ========= Инъекция минимальных стилей UX ========= */
function injectStyleOnce(id, cssText) {
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = cssText;
  document.head.appendChild(s);
}

function ensureInjectedStyles() {
  const css = `
    .marker--bump {
      animation: marker-bump 0.3s ease-out;
      transform-origin: center bottom;
    }
    @keyframes marker-bump {
      0%   { transform: translateY(0) scale(1); }
      30%  { transform: translateY(-6px) scale(1.05); }
      60%  { transform: translateY(0) scale(0.97); }
      100% { transform: translateY(0) scale(1); }
    }

    .admin-info {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 8px;
      padding-left: 10px;
      border-left: 1px solid rgba(255,255,255,0.2);
      font-size: 0.78rem;
      opacity: 0.85;
      white-space: nowrap;
    }
    .admin-info__label {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .admin-role-badge {
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.4);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .admin-role-badge--super {
      background: #c62828;
      color: #fff;
      border-color: #ff8a80;
    }
    .admin-role-badge--editor {
      background: #1565c0;
      color: #fff;
      border-color: #90caf9;
    }
    .admin-role-badge--viewer {
      background: #424242;
      color: #fff;
      border-color: #bdbdbd;
    }
  `;
  injectStyleOnce('mapv12-extra-ux', css);
}

function translateAdminRoleRu(role) {
  switch (role) {
    case 'superadmin': return 'Супер‑администратор';
    case 'editor': return 'Редактор';
    case 'viewer': return 'Просмотр';
    default: return role || 'Администратор';
  }
}

function updateAdminHeaderInfo() {
  const labelEl = document.getElementById('admin-info-label');
  const badgeEl = document.getElementById('admin-role-badge');
  if (!labelEl || !badgeEl) return;

  const role = (typeof CURRENT_ROLE !== 'undefined') ? CURRENT_ROLE : null;
  const level = (typeof CURRENT_ADMIN_LEVEL !== 'undefined') ? CURRENT_ADMIN_LEVEL : null;
  const username = (typeof CURRENT_ADMIN_USERNAME !== 'undefined') ? CURRENT_ADMIN_USERNAME : null;

  if (!role) {
    labelEl.textContent = 'Не авторизован';
    badgeEl.style.display = 'none';
    badgeEl.textContent = '';
    badgeEl.className = 'admin-role-badge';
    return;
  }

  // Гостевой режим отключён. Если по какой-то причине роль всё же 'guest',
  // отображаем как "не авторизован".
  if (role === 'guest') {
    labelEl.textContent = 'Не авторизован';
    badgeEl.style.display = 'none';
    badgeEl.textContent = '';
    badgeEl.className = 'admin-role-badge';
    return;
  }

  // Администратор
  const namePart = username ? `Админ: ${username}` : 'Администратор';
  const roleLabel = translateAdminRoleRu(level || '');
  labelEl.textContent = `${namePart}`;

  badgeEl.className = 'admin-role-badge';
  if (level === 'superadmin') {
    badgeEl.classList.add('admin-role-badge--super');
    badgeEl.textContent = 'SUPER';
    badgeEl.style.display = '';
  } else if (level === 'editor') {
    badgeEl.classList.add('admin-role-badge--editor');
    badgeEl.textContent = 'EDITOR';
    badgeEl.style.display = '';
  } else if (level === 'viewer') {
    badgeEl.classList.add('admin-role-badge--viewer');
    badgeEl.textContent = 'VIEWER';
    badgeEl.style.display = '';
  } else {
    badgeEl.style.display = 'none';
    badgeEl.textContent = '';
  }
}

const zonePolygonMap = {};
const zoneMarkerMap = {};
let editingZoneLayer = null;
let routeLayer = null;

let CURRENT_ROLE = null;
let CURRENT_ADMIN_LEVEL = null;
let CURRENT_ADMIN_USERNAME = null;


/* ==== Notifications (incoming requests) ==== */
let CURRENT_REQUEST_ID = null;
let _notifOpen = false;


/* ========= Доп. утилиты ========= */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Показать push‑уведомление через API Notification. Если разрешения нет,
 * попытка не предпринимается. В случае ошибки уведомление выводится
 * через всплывающее toast‑сообщение.
 * @param {string} title Заголовок уведомления
 * @param {string} body  Текст уведомления
 */
function pushNotify(title, body) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body });
    } catch (err) {
      // Если не получилось создать notification, используем toast
      showToast(`${title}: ${body}`, 'info');
    }
  }
}

/* ========= Тайлы / карта ========= */
let tileLayer = null;

function setTileSource(mode = 'online') {
  if (tileLayer) { try { tileLayer.remove(); } catch (_) {} }
  if (mode === 'local') {
    tileLayer = L.tileLayer('/tiles/{z}/{x}/{y}.png', { maxZoom: 19 });
  } else {
    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OSM' });
  }
  tileLayer.addTo(map);
}

/* ========= Список / маркеры ========= */
let ITEMS = [];
let radiusFiltered = null;

// Глобальные словари для id → маркер / элемент списка
window.markerMap = window.markerMap || {};
window.listMap   = window.listMap   || {};

// Ссылки, которые используют main.js и sidebar.js
var markerMap = window.markerMap;
var listMap   = window.listMap;




/* ========= Тема ========= */

/* ========= Список / маркеры ========= */
async function fetchList() {
  const qEl = $('#search');
  const q = qEl ? qEl.value.trim() : '';
  let url = '/api/addresses?q=' + encodeURIComponent(q);

  const catEl = $('#filter-category');
  if (catEl) {
    const category = (catEl.value || '').trim();
    if (category) url += '&category=' + encodeURIComponent(category);
  }
  const localEl = $('#opt-local'), remoteEl = $('#opt-remote');
  const local = localEl ? localEl.checked : false;
  const remote = remoteEl ? remoteEl.checked : false;
  if (local && !remote) url += '&status=' + encodeURIComponent('Локальный доступ');
  else if (remote && !local) url += '&status=' + encodeURIComponent('Удаленный доступ');

  try {
    const r = await fetch(url);
    if (!r.ok) { console.error('fetchList error', r.status, r.statusText); ITEMS = []; return; }
    ITEMS = await r.json();
  } catch (e) {
    console.error('fetchList exception', e);
    ITEMS = [];
  }
}

const greenIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const blueIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});


/* ========= Записи геокодера ========= */
async function viewGeocodeEntries() {
  const listEl = document.getElementById('geocode-entries-list');
  if (!listEl) return;
  if (listEl.style.display === 'block') { listEl.style.display = 'none'; listEl.innerHTML = ''; return; }
  try {
    const r = await fetch('/api/offline/geocode/entries');
    if (!r.ok) { showToast('Не удалось загрузить записи', 'error'); return; }
    const data = await r.json();
    listEl.innerHTML = '';
    if (data.entries && Array.isArray(data.entries)) {
      data.entries.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'entry';
        const info = document.createElement('div');
        info.className = 'info';
        const title = document.createElement('b');
        title.textContent = entry.display_name || '';
        info.appendChild(title);
        const coord = document.createElement('span');
        coord.textContent = `${entry.lat != null ? entry.lat : ''}, ${entry.lon != null ? entry.lon : ''}`;
        info.appendChild(coord);
        row.appendChild(info);
        const btn = document.createElement('button');
        btn.className = 'warn';
        btn.textContent = 'Удалить';
        btn.onclick = async () => {
          if (!confirm('Удалить эту запись?')) return;
          try {
            const resp = await fetch(`/api/offline/geocode/entries/${entry.id}`, { method: 'DELETE' });
            if (!resp.ok) { showToast('Не удалось удалить запись', 'error'); return; }
            showToast('Запись удалена', 'success');
            viewGeocodeEntries();
          } catch (e) { console.error(e); }
        };
        row.appendChild(btn);
        listEl.appendChild(row);
      });
    }
    listEl.style.display = 'block';
  } catch (err) { console.error('viewGeocodeEntries failed', err); }

}






/* ========= Обновление списка/карты ========= */
async function refresh() { await fetchList(); renderList(); }


// Экспортируем refresh для модулей (search.js)
window.refreshList = refresh;
/* ========= Привязка UI ========= */
function bindUI() {
  const btnToggle = $('#btn-toggle-sidebar'); if (btnToggle) btnToggle.onclick = toggleSidebar;
  const btnTheme = $('#btn-theme'); if (btnTheme) btnTheme.onclick = toggleTheme;
  const btnAdd = $('#btn-add'); if (btnAdd) btnAdd.onclick = openAdd;
  const modalClose = $('#modal-close'); if (modalClose) modalClose.onclick = closeAdd;
  const modalBackdrop = $('#modal-backdrop'); if (modalBackdrop) modalBackdrop.addEventListener('click', e => { if (e.target.id === 'modal-backdrop') closeAdd(); });
  const btnGeocode = $('#btn-geocode'); if (btnGeocode) btnGeocode.onclick = geocodeAddress;
  const modalSave = $('#modal-save'); if (modalSave) modalSave.onclick = saveAdd;



  const btnFile = $('#btn-file');
  const fileMenu = $('#file-menu');
  if (btnFile) {
    btnFile.onclick = (e) => {
      e.stopPropagation();
      if (!fileMenu) return;
      // если меню уже открыто — закрываем
      if (fileMenu.style.display === 'block') {
        fileMenu.style.display = 'none';
        // восстановление родителя, если нужно
        if (fileMenu._restore) {
          const { parent, next } = fileMenu._restore;
          next ? parent.insertBefore(fileMenu, next) : parent.appendChild(fileMenu);
          fileMenu._restore = null;
        }
        return;
      }
      // определяем положение кнопки
      const rect = btnFile.getBoundingClientRect();
      try {
        if (fileMenu.parentElement !== document.body) {
          fileMenu._restore = { parent: fileMenu.parentElement, next: fileMenu.nextSibling };
          document.body.appendChild(fileMenu);
        }
      } catch (_) {}
      fileMenu.style.position = 'fixed';
      fileMenu.style.left = Math.round(rect.left) + 'px';
      fileMenu.style.top = Math.round(rect.bottom + 6) + 'px';
      // сбрасываем выравнивание по правому краю, иначе меню растягивается до края
      fileMenu.style.right = 'auto';
      fileMenu.style.zIndex = '9999';
      fileMenu.style.display = 'block';
    };
  }
  if (fileMenu) {
    const expCsv = $('#menu-export-csv'); if (expCsv) expCsv.onclick = doExport;
    const expJson = $('#menu-export-json'); if (expJson) expJson.onclick = exportGeoJSON;
    const expXlsx = $('#menu-export-xlsx'); if (expXlsx) expXlsx.onclick = downloadSummaryExcel;
    const expAddrXlsx = $('#menu-export-addresses-xlsx'); if (expAddrXlsx) expAddrXlsx.onclick = downloadAddressesExcel;
    const impCsv = $('#menu-import-csv'); if (impCsv) impCsv.onclick = openImportFile;
    const impJson = $('#menu-import-json'); if (impJson) impJson.onclick = openImportJson;
  }
  document.addEventListener('click', (e) => {
    if (!fileMenu) return;
    const target = e.target;
    if (btnFile && (btnFile.contains(target) || fileMenu.contains(target))) return;
    fileMenu.style.display = 'none';
    // возвращаем меню на место, если перемещали
    if (fileMenu._restore) {
      const { parent, next } = fileMenu._restore;
      next ? parent.insertBefore(fileMenu, next) : parent.appendChild(fileMenu);
      fileMenu._restore = null;
    }
  });
  const hiddenFile = $('#hidden-file'); if (hiddenFile) hiddenFile.addEventListener('change', handleImportFile);
  const hiddenJson = $('#hidden-json'); if (hiddenJson) hiddenJson.addEventListener('change', handleImportJson);
  bindDragDrop();

  // Загружает Excel-отчёт по аналитике. Используется кнопкой «Скачать отчёт Excel»
  async function downloadSummaryExcel() {
    try {
      const a = document.createElement('a');
      a.href = '/analytics/summary.xlsx';
      a.download = 'analytics_summary.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (window.notify && typeof window.notify.success === 'function') {
        window.notify.success('Отчёт Excel сформирован');
      } else {
        showToast('Отчёт Excel сформирован', 'success');
      }
    } catch (e) {
      console.error(e);
      if (window.notify && typeof window.notify.error === 'function') {
        window.notify.error('Ошибка при скачивании отчёта');
      } else {
        showToast('Ошибка при скачивании отчёта', 'error');
      }
    }
  }

  // Загружает Excel‑файл с текущими адресами. Используется кнопкой
  // «Скачать адреса Excel» в меню «Данные»
  async function downloadAddressesExcel() {
    try {
      const a = document.createElement('a');
      a.href = '/api/addresses/export.xlsx';
      a.download = 'addresses.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (window.notify && typeof window.notify.success === 'function') {
        window.notify.success('Экспорт адресов завершён');
      } else {
        showToast('Экспорт адресов завершён', 'success');
      }
    } catch (e) {
      console.error(e);
      if (window.notify && typeof window.notify.error === 'function') {
        window.notify.error('Ошибка при скачивании адресов');
      } else {
        showToast('Ошибка при скачивании адресов', 'error');
      }
    }
  }

  const themeSel = document.getElementById('theme-select');
  if (themeSel) {
    try { const savedAccent = localStorage.getItem('accent') || ''; themeSel.value = savedAccent; } catch (_) {}
    themeSel.addEventListener('change', (ev) => { const val = ev.target.value || ''; applyAccent(val); });
  }

  const filterCat = $('#filter-category'); if (filterCat) filterCat.addEventListener('change', refresh);
  const optLocal = $('#opt-local'), optRemote = $('#opt-remote');
  if (optLocal) optLocal.addEventListener('change', refresh);
  if (optRemote) optRemote.addEventListener('change', refresh);

  const bulkBtn = $('#btn-bulk-del');
  if (bulkBtn) {
    bulkBtn.disabled = true;
    bulkBtn.onclick = async () => {
      const ids = Array.from(document.querySelectorAll('#list input[type=checkbox][data-id]:checked')).map(el => el.dataset.id);
      if (!ids.length) return;
      try {
        await fetch('/api/addresses:batchDelete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids })
        });
      } catch (e) { console.error('bulk delete failed', e); }
      await refresh();
    };
  }

  const btnDrawZone = $('#btnDrawZone');
  if (btnDrawZone) {
    btnDrawZone.onclick = () => {
      try { map.closePopup(); } catch (_) {}
      try { new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable(); }
      catch (e) { new L.Draw.Polygon(map, { showArea: true, allowIntersection: false, shapeOptions: { color: '#000', weight: 2, fillOpacity: 0.15 } }).enable(); }
    };
  }
  const btnChooseIcon = $('#btnChooseIcon');
  if (btnChooseIcon) {
    btnChooseIcon.onclick = () => { try { map.closePopup(); } catch (_) {} openZoneModalForDefaults(); };
  }

  // Кнопка и модалка "Помощь"
  const btnHelp = document.getElementById('btn-help');
  const helpBackdrop = document.getElementById('help-backdrop');
  const helpClose = document.getElementById('help-close');
  if (btnHelp && helpBackdrop) {
    btnHelp.addEventListener('click', () => {
      helpBackdrop.style.display = 'flex';
      helpBackdrop.classList.add('open');
    });
  }
  // Навешиваем обработчики закрытия help-модалки один раз через bindOnce, если он доступен.
  if (helpBackdrop) {
    if (typeof window.bindOnce === 'function') {
      window.bindOnce(helpBackdrop, 'click', (e) => {
        if (e.target === helpBackdrop) {
          helpBackdrop.classList.remove('open');
          helpBackdrop.style.display = 'none';
        }
      }, 'HelpBackdrop');
    } else if (!helpBackdrop.dataset.bound) {
      helpBackdrop.dataset.bound = '1';
      helpBackdrop.addEventListener('click', (e) => {
        if (e.target === helpBackdrop) {
          helpBackdrop.classList.remove('open');
          helpBackdrop.style.display = 'none';
        }
      });
    }
  }
  if (helpClose) {
    if (typeof window.bindOnce === 'function') {
      window.bindOnce(helpClose, 'click', () => {
        helpBackdrop.classList.remove('open');
        helpBackdrop.style.display = 'none';
      }, 'HelpClose');
    } else if (!helpClose.dataset.bound) {
      helpClose.dataset.bound = '1';
      helpClose.addEventListener('click', () => {
        helpBackdrop.classList.remove('open');
        helpBackdrop.style.display = 'none';
      });
    }
  }

  // Командный центр (единая админ-панель)
  const btnAdminPanel = document.getElementById('btn-admin-panel');
  if (btnAdminPanel && !btnAdminPanel.dataset.bound) {
    btnAdminPanel.dataset.bound = '1';
    btnAdminPanel.addEventListener('click', () => {
      try { window.location.href = '/admin/panel'; } catch (_) {}
    });
  }

  const btnAccess = $('#btn-access');
  const accessMenu = $('#access-menu');
  if (btnAccess) {
    btnAccess.onclick = (e) => {
      e.stopPropagation();
      if (!accessMenu) return;
      // если меню открыто — закрываем
      if (accessMenu.style.display === 'block') {
        accessMenu.style.display = 'none';
        // восстановить родителя, если меню было перемещено
        if (accessMenu._restore) {
          const { parent, next } = accessMenu._restore;
          next ? parent.insertBefore(accessMenu, next) : parent.appendChild(accessMenu);
          accessMenu._restore = null;
        }
        return;
      }
      // вычисляем позицию кнопки и переносим меню в body
      const rect = btnAccess.getBoundingClientRect();
      try {
        if (accessMenu.parentElement !== document.body) {
          accessMenu._restore = { parent: accessMenu.parentElement, next: accessMenu.nextSibling };
          document.body.appendChild(accessMenu);
        }
      } catch (_) {}
      accessMenu.style.position = 'fixed';
      accessMenu.style.left = Math.round(rect.left) + 'px';
      accessMenu.style.top = Math.round(rect.bottom + 6) + 'px';
      // сбрасываем выравнивание по правому краю (установленное в CSS)
      accessMenu.style.right = 'auto';
      accessMenu.style.zIndex = '9999';
      accessMenu.style.display = 'block';
    };
  }
  if (accessMenu) {
    document.addEventListener('click', (e) => {
      if (!btnAccess || !accessMenu) return;
      const target = e.target;
      if (btnAccess.contains(target) || accessMenu.contains(target)) return;
      accessMenu.style.display = 'none';
      // восстановить родителя, если нужно
      if (accessMenu._restore) {
        const { parent, next } = accessMenu._restore;
        next ? parent.insertBefore(accessMenu, next) : parent.appendChild(accessMenu);
        accessMenu._restore = null;
      }
    });
  }

  // --- Фото: кнопка в сайдбаре и модалка ---
  const btnViewPhoto = document.getElementById('btn-view-photo');
  if (btnViewPhoto) {
    btnViewPhoto.addEventListener('click', () => {
      const it = getSelectedItem();
      if (!it) {
        showToast('Сначала выберите метку в списке', 'error');
        return;
      }

      // Пытаемся взять URL фото
      let url = '';
      if (it.photo) {
        // Бэкенд отдаёт имя файла, как мы уже используем в списке и попапе
        url = '/uploads/' + it.photo;
      } else if (Array.isArray(it.photos) && it.photos[0] && it.photos[0].url) {
        // Альтернативный вариант структуры данных
        url = it.photos[0].url;
      }

      if (!url) {
        showToast('У этой метки нет прикреплённой фотографии', 'error');
        return;
      }

      openPhotoModal(url);
    });
  }

    // --- Кнопка "Удалить фото" в модалке редактирования ---
  const btnDeletePhoto = document.getElementById('btn-delete-photo');
  if (btnDeletePhoto) {
    btnDeletePhoto.addEventListener('click', () => {
      const removePhotoInput = document.getElementById('f-remove-photo');
      const fileInput = document.getElementById('f-photo');

      if (removePhotoInput) removePhotoInput.value = '1';
      if (fileInput) fileInput.value = ''; // на всякий случай, чтобы не отправить новый файл

      showToast('Фото будет удалено после сохранения', 'warn');
    });
  }


  const photoClose = document.getElementById('photo-close');
  const photoBackdrop = document.getElementById('photo-backdrop');

  if (photoClose) {
    photoClose.addEventListener('click', () => {
      closePhotoModal();
    });
  }

  if (photoBackdrop) {
    photoBackdrop.addEventListener('click', (e) => {
      if (e.target.id === 'photo-backdrop') {
        closePhotoModal();
      }
    });
  }


  const topActions = document.querySelector('.top-actions');
  const scrollLeftBtn = $('#scroll-left');
  const scrollRightBtn = $('#scroll-right');
  if (scrollLeftBtn && topActions) scrollLeftBtn.onclick  = () => topActions.scrollBy({ left: -200, behavior: 'smooth' });
  if (scrollRightBtn && topActions) scrollRightBtn.onclick = () => topActions.scrollBy({ left: 200, behavior: 'smooth' });
}

/* ========= Поиск по радиусу ========= */
/* startRadiusSearch: либо режим "кликните на карте", либо сразу считаем от centerLL */
async function startRadiusSearch(kmParam, centerLL) {
  // Сброс
  if (radiusSearchActive && !kmParam && !centerLL) {
    radiusSearchActive = false;
    radiusFiltered = null;
    if (radiusCircle) { try { map.removeLayer(radiusCircle); } catch(_) {} radiusCircle = null; }
    await refresh();
    showToast('Фильтр радиуса очищен', 'success');
    return;
  }

  // Ветка: сразу посчитать от переданного центра
  if (kmParam && centerLL) {
    const km = Math.max(0, parseFloat(kmParam)) || 0;
    if (!km) { showToast('Введите радиус в километрах', 'error'); return; }
    const center = centerLL;
    radiusFiltered = ITEMS.filter(it => {
      if (it.lat != null && it.lon != null) {
        const dist = haversineDistance(center.lat, center.lng, parseFloat(it.lat), parseFloat(it.lon));
        return dist <= km;
      }
      return false;
    });
    if (radiusCircle) { try { map.removeLayer(radiusCircle); } catch(_) {} }
    radiusCircle = L.circle(center, { radius: km * 1000, color: '#4f46e5', weight: 2, fillOpacity: 0.1 });
    radiusCircle.addTo(map);
    try { map.fitBounds(radiusCircle.getBounds()); } catch(_) {}
    renderList();
    showToast(`Найдено ${radiusFiltered.length} объектов в пределах ${km} км`, 'success');
    return;
  }

  // Старый сценарий: спросить радиус и дождаться клика по карте
  const radiusInput = document.getElementById('radius-km');
  const km = parseFloat(radiusInput && radiusInput.value);
  if (!km || km <= 0) { showToast('Введите радиус в километрах', 'error'); return; }
  showToast('Кликните на карте для выбора центра', 'default', 4000);
  radiusSearchActive = true;
  map.once('click', async (e) => {
    radiusSearchActive = false;
    const center = e.latlng;
    radiusFiltered = ITEMS.filter(it => {
      if (it.lat != null && it.lon != null) {
        const dist = haversineDistance(center.lat, center.lng, parseFloat(it.lat), parseFloat(it.lon));
        return dist <= km;
      }
      return false;
    });
    if (radiusCircle) { try { map.removeLayer(radiusCircle); } catch(_) {} }
    radiusCircle = L.circle(center, { radius: km * 1000, color: '#4f46e5', weight: 2, fillOpacity: 0.1 });
    radiusCircle.addTo(map);
    try { map.fitBounds(radiusCircle.getBounds()); } catch (_) {}
    renderList();
    showToast(`Найдено ${radiusFiltered.length} объектов в пределах ${km} км`, 'success');
  });
}


/* ========= ЗОНЫ ========= */
let DEFAULT_ZONE_ICON = 'beer';
let DEFAULT_ZONE_COLOR = '#ffcc00';

function openZoneModalForNew() {
  const m = document.getElementById('zone-backdrop');
  if (!m) {
    if (window.notify && typeof window.notify.error === 'function') {
      window.notify.error('Окно зоны не найдено');
    } else if (window.showToast) {
      window.showToast('Окно зоны не найдено', 'error');
    } else {
      alert('Окно зоны не найдено');
    }
    return;
  }
  m.style.display = 'block'; m.classList.add('open');

  const descEl = $('#zoneDesc'); if (descEl) descEl.value = '';
  const colorEl = $('#zoneColor'); if (colorEl) colorEl.value = DEFAULT_ZONE_COLOR;
  const iconInput = $('#zoneIcon'); if (iconInput) iconInput.value = DEFAULT_ZONE_ICON;

  const icons = document.querySelectorAll('#zoneIcons .zicon');
  icons.forEach(ic => ic.classList.toggle('active', ic.dataset.icon === DEFAULT_ZONE_ICON));

  const saveBtn = $('#saveZoneBtn');
  const newSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  newSave.onclick = async () => {
    const desc = (document.getElementById('zoneDesc').value || '').trim();
    const color = (document.getElementById('zoneColor').value || DEFAULT_ZONE_COLOR);
    const icon = (document.getElementById('zoneIcon').value || DEFAULT_ZONE_ICON);
    if (!_pendingZoneLayer) { closeZoneModal(); return; }
    try {
      _pendingZoneLayer.setStyle({ color: '#000000', weight: 2, fillColor: color, fillOpacity: 0.15 });
      if (desc) _pendingZoneLayer.bindPopup(escapeHTML(desc));
      _pendingZoneLayer.iconName = icon;
    } catch (e) { console.warn(e); }
    let marker = null;
    let latlngs = [];
    try {
      const arr = _pendingZoneLayer.getLatLngs()[0] || [];
      latlngs = arr.map(p => ({ lat: p.lat, lng: p.lng }));
      let clat = 0, clon = 0;
      for (const p of arr) { clat += p.lat; clon += p.lng; }
      clat = clat / (arr.length || 1); clon = clon / (arr.length || 1);
      const emoji = iconToEmoji(icon);
      marker = L.marker([clat, clon], {
        icon: L.divIcon({
          html: `<div style="font-size:22px; line-height:22px;">${emoji}</div>`,
          className: 'zone-icon', iconSize: [22, 22], iconAnchor: [11, 11]
        })
      });

      marker.iconName = icon;
      zonesLayer.addLayer(marker);
    } catch (e) { console.warn('centroid error', e); }
    const id = await saveZoneToServer(desc, color, icon, latlngs);
    if (id) {
      _pendingZoneLayer.zoneId = id;
      _pendingZoneLayer.iconName = icon;
      if (marker) marker.zoneId = id;
      zonePolygonMap[id] = _pendingZoneLayer;
      if (marker) zoneMarkerMap[id] = marker;
    }
    _pendingZoneLayer = null;
    saveZonesToLocal();
    closeZoneModal();
  };
  m.addEventListener('click', zoneBackdropCloser);
}
function openZoneModalForDefaults() {
  const m = document.getElementById('zone-backdrop');
  if (!m) {
    if (window.notify && typeof window.notify.error === 'function') {
      window.notify.error('Окно зоны не найдено');
    } else if (window.showToast) {
      window.showToast('Окно зоны не найдено', 'error');
    } else {
      alert('Окно зоны не найдено');
    }
    return;
  }
  m.style.display = 'block'; m.classList.add('open');
  document.getElementById('zoneDesc').value = '';
  document.getElementById('zoneColor').value = DEFAULT_ZONE_COLOR;
  document.getElementById('zoneIcon').value = DEFAULT_ZONE_ICON;
  const icons = document.querySelectorAll('#zoneIcons .zicon');
  icons.forEach(ic => ic.classList.toggle('active', ic.dataset.icon === DEFAULT_ZONE_ICON));
  const saveBtn = $('#saveZoneBtn');
  const newSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  newSave.onclick = () => {
    DEFAULT_ZONE_COLOR = document.getElementById('zoneColor').value || DEFAULT_ZONE_COLOR;
    DEFAULT_ZONE_ICON = document.getElementById('zoneIcon').value || DEFAULT_ZONE_ICON;
    closeZoneModal();
  };
  m.addEventListener('click', zoneBackdropCloser);
}
function closeZoneModal() {
  const m = document.getElementById('zone-backdrop'); if (!m) return;
  m.classList.remove('open'); m.style.display = 'none';
  m.removeEventListener('click', zoneBackdropCloser);
  editingZoneLayer = null;
}
function zoneBackdropCloser(e) { if (e.target && e.target.id === 'zone-backdrop') closeZoneModal(); }

function cancelNewZone() {
  if (_pendingZoneLayer) { try { zonesLayer.removeLayer(_pendingZoneLayer); } catch (e) { console.warn(e); } _pendingZoneLayer = null; }
  closeZoneModal();
}
function iconToEmoji(v) {
  switch (v) {
    case 'beer': return '🍺';
    case 'car-crash': return '🚗💥';
    case 'user-secret': return '🕵️';
    case 'gavel': return '⚖️';
    case 'exclamation-triangle': return '⚠️';
    default: return '📍';
  }
}

/* ========= Выделение элементов ========= */
function selectItem(itemId) {
  if (currentSelectedId && listMap[currentSelectedId]) listMap[currentSelectedId].classList.remove('selected');
  currentSelectedId = itemId;
  const li = listMap[itemId]; if (li) li.classList.add('selected');
  const marker = markerMap[itemId];
  if (marker) {
    try {
      const currentZoom = map.getZoom();
      const targetZoom = Math.max(currentZoom, 16);
      map.setView(marker.getLatLng(), targetZoom);
      marker.openPopup();
      // bump анимация
      const el = marker._icon;
      if (el) {
        el.classList.remove('marker--bump');
        void el.offsetWidth; // reflow
        el.classList.add('marker--bump');
      }
    } catch (_) { }
  }
}

function getSelectedItem() {
  if (currentSelectedId == null) return null;
  const items = radiusFiltered || ITEMS;
  return items.find(it => String(it.id) === String(currentSelectedId)) || null;
}

function openPhotoModal(url) {
  const backdrop = document.getElementById('photo-backdrop');
  const img = document.getElementById('photo-img');
  if (!backdrop || !img) return;
  img.src = url;
  backdrop.style.display = 'block';
  backdrop.classList.add('open');
}

function closePhotoModal() {
  const backdrop = document.getElementById('photo-backdrop');
  const img = document.getElementById('photo-img');
  if (!backdrop || !img) return;
  img.src = '';
  backdrop.classList.remove('open');
  backdrop.style.display = 'none';
}


/* ========= Зоны: сервер ========= */
async function loadZonesFromServer() {
  try {
    const res = await fetch('/zones');
    if (!res.ok) return;
    const arr = await res.json();
    arr.forEach(z => {
      const geom = z.geometry;
      let latlngs = [];
      if (geom && Array.isArray(geom.latlngs)) {
        latlngs = geom.latlngs.map(p => [p.lat, p.lng]);
      } else if (geom && Array.isArray(geom.coordinates)) {
        latlngs = geom.coordinates[0].map(c => [c[1], c[0]]);
      }
      if (!latlngs.length) return;
      const poly = L.polygon(latlngs, {
        color: '#000', weight: 2, fillColor: z.color || DEFAULT_ZONE_COLOR, fillOpacity: 0.15,
      }).bindPopup(escapeHTML(z.description || ''));
      poly.zoneId = z.id;
      poly.iconName = z.icon || 'beer';
      zonesLayer.addLayer(poly);
      zonePolygonMap[z.id] = poly;
      try {
        const sum = latlngs.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
        const clat = sum[0] / latlngs.length;
        const clon = sum[1] / latlngs.length;
        const emoji = iconToEmoji(poly.iconName);
        const marker = L.marker([clat, clon], {
          icon: L.divIcon({
            html: `<div style="font-size:22px; line-height:22px;">${emoji}</div>`,
            className: 'zone-icon', iconSize: [22, 22], iconAnchor: [11, 11],
          }),
        });
        marker.zoneId = z.id;
        marker.iconName = poly.iconName;
        zonesLayer.addLayer(marker);
        zoneMarkerMap[z.id] = marker;
      } catch (err) { console.warn('centroid error', err); }
    });
  } catch (err) { console.error('loadZonesFromServer failed', err); }
}
async function saveZoneToServer(description, color, icon, latlngs) {
  try {
    const resp = await fetch('/zones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, color, icon, geometry: { latlngs } }),
    });
    if (!resp.ok) throw new Error('Server error');
    const data = await resp.json();
    return data.id;
  } catch (e) { console.error('saveZoneToServer failed', e); showToast('Ошибка сохранения зоны', 'error'); return null; }
}
async function updateZoneToServer(layer) {
  try {
    const id = layer.zoneId; if (!id) return;
    const latlngs = layer.getLatLngs()[0].map(p => ({ lat: p.lat, lng: p.lng }));
    const desc = (layer.getPopup() && layer.getPopup().getContent()) || '';
    const color = layer.options.fillColor || DEFAULT_ZONE_COLOR;
    const icon = layer.iconName || 'beer';
    await fetch(`/zones/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc, color, icon, geometry: { latlngs } }),
    });
    showToast('Зона обновлена', 'success');
  } catch (err) { console.error('updateZoneToServer failed', err); showToast('Ошибка обновления зоны', 'error'); }
}
async function deleteZoneFromServer(id) {
  try { if (!id) return; await fetch(`/zones/${id}`, { method: 'DELETE' }); showToast('Зона удалена', 'success'); }
  catch (err) { console.error('deleteZoneFromServer failed', err); showToast('Ошибка удаления зоны', 'error'); }
}
async function updateZonesToServer() {
  const layers = [];
  zonesLayer.eachLayer(l => { if (l instanceof L.Polygon && l.zoneId) layers.push(l); });
  for (const l of layers) await updateZoneToServer(l);
}

/* ========= LocalStorage зон ========= */
const ZONES_KEY = 'map_v12_zones_v1';
function saveZonesToLocal() {
  try {
    const arr = [];
    zonesLayer.eachLayer(l => {
      if (l instanceof L.Polygon) {
        const latlngs = l.getLatLngs()[0].map(p => ({ lat: p.lat, lng: p.lng }));
        arr.push({ type: 'polygon', latlngs, options: l.options, popup: (l.getPopup() && l.getPopup().getContent()) || '' });
      }
    });
    localStorage.setItem(ZONES_KEY, JSON.stringify(arr));
  } catch (e) { console.warn('saveZonesToLocal failed', e); }
}
function loadZonesFromLocal() {
  try {
    const raw = localStorage.getItem(ZONES_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    for (const it of arr) {
      if (it.type === 'polygon' && Array.isArray(it.latlngs)) {
        const p = L.polygon(it.latlngs, it.options || { color: '#000', weight: 2, fillOpacity: 0.15 }).bindPopup(it.popup || '');
        zonesLayer.addLayer(p);
      }
    }
  } catch (e) { console.warn('loadZonesFromLocal failed', e); }
}

/* ========= Иконки зоны ========= */
function setupZoneIconEvents() {
  const icons = document.querySelectorAll('#zoneIcons .zicon');
  icons.forEach(ic => {
    ic.addEventListener('click', () => {
      icons.forEach(i => i.classList.remove('active'));
      ic.classList.add('active');
      const input = document.getElementById('zoneIcon');
      if (input) input.value = ic.dataset.icon || '';
    });
  });
}

/* ========= Роли ========= */

function applyRole(role) {
  const isAdmin = (role === 'admin');
  const addBtn = document.getElementById('btn-add'); if (addBtn) addBtn.disabled = !isAdmin;
  const bulkBtn = document.getElementById('btn-bulk-del'); if (bulkBtn) bulkBtn.disabled = !isAdmin;
  document.querySelectorAll('[data-act="edit"]').forEach(btn => { btn.style.display = isAdmin ? '' : 'none'; });
  document.querySelectorAll('[data-act="del"]').forEach(btn  => { btn.style.display = isAdmin ? '' : 'none'; });
  try {
    if (!isAdmin && drawControl) map.removeControl(drawControl);
    else if (isAdmin && drawControl) map.addControl(drawControl);
  } catch (_) {}

  // Показываем кнопку чата и аналитику только администратору
  const btnChat = document.getElementById('btn-chat');
  if (btnChat) btnChat.style.display = isAdmin ? '' : 'none';

  const btnAdminPanel = document.getElementById('btn-admin-panel');
  if (btnAdminPanel) btnAdminPanel.style.display = isAdmin ? '' : 'none';

  const btnAnalytics = document.getElementById('btn-analytics');
  if (btnAnalytics) btnAnalytics.style.display = isAdmin ? '' : 'none';
}



function updateAdminControlsVisibility() {
  const isSuper = (CURRENT_ADMIN_LEVEL === 'superadmin');

  const btnAdminUsers = document.getElementById('btn-admin-users');
  if (btnAdminUsers) {
    btnAdminUsers.style.display = isSuper ? '' : 'none';
  }

  const btnZones = document.getElementById('btn-zones');
  if (btnZones) {
    btnZones.style.display = isSuper ? '' : 'none';
  }
}

/* ========= Запуск ========= */
document.addEventListener('DOMContentLoaded', async () => {
  ensureInjectedStyles();
  let __theme = 'light';
  try { __theme = (localStorage.getItem('theme') || 'light'); } catch (_) { __theme = 'light'; }
  applyTheme(__theme);
try {
    const savedAccent = localStorage.getItem('accent') || '';
    applyAccent(savedAccent);
  } catch (_) {}

  initMap();
  bindUI();
  setupZoneIconEvents();
  loadZonesFromLocal();
  try {
    await loadZonesFromServer();
  } catch (e) {
    console.warn('loadZonesFromServer failed', e);
  }
  await refresh();
  try {
    await updateOfflineStatus();
  } catch (_) {}

  initShortcuts();
  initGeolocateControl();
  updateAdminHeaderInfo();

  // Запрашиваем разрешение на уведомления, если пользователь ещё не давал его
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      Notification.requestPermission();
    } catch (err) {
      console.warn('Notification permission request failed', err);
    }
  }

  // Вход администратора (гостевой режим отключён)
  const roleModal    = document.getElementById('role-modal');
  const roleChoice   = document.getElementById('role-choice');
  const loginArea    = document.getElementById('login-area');
  const loginSubmit  = document.getElementById('login-submit');
  const loginBack    = document.getElementById('login-back');
  const loginError   = document.getElementById('login-error');

  // Куда перейти после логина:
  //  - если сервер редиректнул на /?next=/admin/panel, вернёмся туда
  //  - иначе пользователь может выбрать "Админ карты" или "Командный центр"
  const _urlParams = new URLSearchParams((window.location && window.location.search) ? window.location.search : '');
  const _nextAfterLogin = (_urlParams.get('next') || '').trim();
  let _loginTarget = 'map'; // map | cc
  try{
    _loginTarget = (localStorage.getItem('login_target') || '').trim() || '';
  }catch(_){ _loginTarget = ''; }
  if(!_loginTarget){
    if(_nextAfterLogin.startsWith('/admin/')) _loginTarget = 'cc';
    else _loginTarget = 'map';
  }

  function setLoginTarget(t){
    _loginTarget = (t === 'cc') ? 'cc' : 'map';
    try{ localStorage.setItem('login_target', _loginTarget); }catch(_){ }
    const btnMap = document.getElementById('login-target-map');
    const btnCc  = document.getElementById('login-target-cc');
    if(btnMap) btnMap.classList.toggle('active', _loginTarget === 'map');
    if(btnCc)  btnCc.classList.toggle('active', _loginTarget === 'cc');
    const ttl = document.getElementById('login-title');
    if(ttl){
      ttl.textContent = (_loginTarget === 'cc') ? 'Вход (Командный центр)' : 'Вход (Админ карты)';
    }
  }
  setLoginTarget(_loginTarget);
  const btnMap = document.getElementById('login-target-map');
  const btnCc  = document.getElementById('login-target-cc');
  if(btnMap) btnMap.addEventListener('click', () => setLoginTarget('map'));
  if(btnCc)  btnCc.addEventListener('click', () => setLoginTarget('cc'));

  // Если пользователь уже залогинен (cookie-сессия), скрываем модалку.
  // Иначе показываем форму логина.
  let _adminSession = false;
  try {
    const resp = await fetch('/me', { method: 'GET' });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data && data.is_admin) {
      _adminSession = true;
      CURRENT_ROLE = 'admin';
      CURRENT_ADMIN_LEVEL = data.role || null;
      CURRENT_ADMIN_USERNAME = data.username || null;
      applyRole('admin');
      updateAdminControlsVisibility();
      updateAdminHeaderInfo();
    }
  } catch (e) {
    // Не ломаем UI, если /me недоступен.
  }

  // Если уже залогинен и пришли с редиректа /?next=..., возвращаемся туда.
  if(_adminSession && _nextAfterLogin){
    try{ window.location.href = _nextAfterLogin; }catch(_){ }
  }

  if (roleModal) {
    roleModal.style.display = _adminSession ? 'none' : 'flex';
  }
  if (!_adminSession) {
    if (roleChoice) roleChoice.style.display = 'block';
    if (loginArea) loginArea.style.display = 'block';
    if (loginError) {
      loginError.style.display = 'none';
      loginError.textContent = '';
    }
  } else {
    // Для активной админ-сессии включаем обновление счётчика заявок.
    refreshNotifCount();
    setInterval(refreshNotifCount, 15000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshNotifCount();
      }
    });
  }

  // Кнопка "Назад" в форме логина
  if (loginBack) {
    loginBack.addEventListener('click', () => {
      if (loginArea) loginArea.style.display = 'none';
      if (roleChoice) roleChoice.style.display = 'block';
      if (loginError) {
        loginError.style.display = 'none';
        loginError.textContent = '';
      }
    });
  }

  // Сабмит логина
  if (loginSubmit) {
    loginSubmit.addEventListener('click', async () => {
      const usernameInput = document.getElementById('login-username');
      const passwordInput = document.getElementById('login-password');
      const username = usernameInput && usernameInput.value ? usernameInput.value.trim() : '';
      const password = passwordInput && passwordInput.value ? passwordInput.value : '';

      let serverOk = true;
      let backendRole = 'editor';

      try {
        const resp = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await resp.json().catch(() => ({}));

        if (resp.ok) {
          backendRole = data && data.role ? String(data.role) : 'editor';
        } else {
          serverOk = false;
          const msg = data && data.error ? data.error : 'Ошибка входа';
          if (loginError) {
            loginError.textContent = msg;
            loginError.style.display = 'block';
          } else {
            showToast(msg, 'error');
          }
        }
      } catch (err) {
        console.warn('login failed', err);
        serverOk = false;
      }

      if (!serverOk) {
        // Безопасность: не выдаём права администратора при неуспешном логине.
        CURRENT_ROLE = null;
        CURRENT_ADMIN_LEVEL = null;
        CURRENT_ADMIN_USERNAME = null;
        applyRole(null);
        updateAdminControlsVisibility();
        updateAdminHeaderInfo();
        if (roleModal) roleModal.style.display = 'flex';
        if (loginError) {
          loginError.textContent = loginError.textContent || 'Ошибка входа';
          loginError.style.display = 'block';
        } else {
          showToast('Ошибка входа', 'error');
        }
        return;
      } else {
        CURRENT_ROLE = 'admin';
        CURRENT_ADMIN_LEVEL = backendRole;
        CURRENT_ADMIN_USERNAME = username;
        applyRole('admin');
        updateAdminControlsVisibility();
        updateAdminHeaderInfo();
        if (roleModal) roleModal.style.display = 'none';
      }

      // Куда перейти после успешного логина
      try{
        if(_nextAfterLogin){
          window.location.href = _nextAfterLogin;
        } else if(_loginTarget === 'cc'){
          window.location.href = '/admin/panel';
        }
      }catch(_){ }

      // После попытки логина обновляем счётчик заявок и подписываемся на обновления
      refreshNotifCount();
      setInterval(refreshNotifCount, 15000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          refreshNotifCount();
        }
      });
    });
  }
}); // <-- ВОТ ЭТОЙ СТРОКИ У ТЕБЯ НЕ ХВАТАЛО


/* Ripple on .btn / .icon */
function attachRipple(root = document) {
  root.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.btn, .icon');
    if (!t) return;
    const rect = t.getBoundingClientRect();
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.left = (e.clientX - rect.left) + 'px';
    span.style.top  = (e.clientY - rect.top) + 'px';
    t.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
  });
}
attachRipple();


/* NOTIF_FIX_OUTSIDE */
document.addEventListener('click', (ev) => {
  const menu = document.getElementById('notif-menu');
  const btn  = document.getElementById('btn-bell');
  if (!menu || !btn) return;
  const t = ev.target;
  if (t === menu || (menu.contains && menu.contains(t)) || t === btn || (btn.contains && btn.contains(t))) return;
  if (menu.style.display === 'block') {
    menu.style.display = 'none';
    if (menu._restore) {
      const { parent, next } = menu._restore;
      next ? parent.insertBefore(menu, next) : parent.appendChild(menu);
      menu._restore = null;
    }
  }
}, true);

function __repositionNotifMenu() {
  const menu = document.getElementById('notif-menu');
  const btn  = document.getElementById('btn-bell');
  if (!menu || !btn) return;
  if (menu.style.display === 'block') {
    const r = btn.getBoundingClientRect();
    menu.style.left = Math.round(r.left) + 'px';
    menu.style.top  = Math.round(r.bottom + 6) + 'px';
  }
}
window.addEventListener('resize', __repositionNotifMenu, { passive: true });
window.addEventListener('scroll', __repositionNotifMenu, { passive: true });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const menu = document.getElementById('notif-menu');
  if (!menu || menu.style.display !== 'block') return;
  menu.style.display = 'none';
  if (menu._restore) {
    const { parent, next } = menu._restore;
    next ? parent.insertBefore(menu, next) : parent.appendChild(menu);
    menu._restore = null;
  }
});


/* ========= Keyboard shortcuts =========
  / : focus search
  t : toggle theme
  s : toggle sidebar
  a : open "add"
  ? : show help
  Esc : close any open modal/menus
*/

