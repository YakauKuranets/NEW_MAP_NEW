# Map v12 + Telegram‑бот (сводка и быстрый запуск)

Это рабочая версия проекта **Map v12** с интеграцией Telegram‑бота, офлайн‑картами, системой заявок, админским чатом, аналитикой и ролями.

Полная подробная документация уже есть в файлах:

- `project_manual.md` — общее устройство проекта, карта, заявки, офлайн и т.п.
- `deploy/README_DEPLOY.md` — запуск в продакшене (рекомендуется Docker + Postgres + Nginx + ASGI).
- `.env.example`, `.env.dev.example`, `.env.prod.example` — примеры переменных окружения.

Ниже — короткий чек‑лист, чтобы быстро поднять проект у себя.

---

## 1. Структура проекта (важные директории)

- `app/` — Flask‑приложение:
  - `app/routes.py`, блюпринты `app/addresses`, `app/chat`, `app/analytics` и т.д.
  - `app/services/` — бизнес‑логика (заявки, чат, права, аналитика).
  - `app/models.py` — модели SQLAlchemy (Address, PendingMarker, PendingHistory, AdminUser, Zone и др.).
- `templates/` — HTML‑шаблоны (главная страница карты, модалки, чат).
- `static/`:
  - `static/js/` — фронтенд‑модули (`map_core.js`, `chat.js`, `analytics.js`, `requests.js`, `addresses.js`, `sidebar.js`, `search.js`, `ui.js`, `offline.js` и др.).
  - `static/css/` — стили.
  - `static/vendor/` — локальные копии сторонних библиотек (Leaflet, MarkerCluster,
    Leaflet.Draw, Font Awesome). Если заполнить эту папку реальными файлами
    (скачать с CDN и положить в `static/vendor`), приложение сможет работать
    полностью офлайн, используя локальные JS и CSS вместо загрузки из сети.
- `bot.py` — Telegram‑бот (диалоги, заявки, чат с админом, команда `/my` и пр.).
- `run.py` — точка входа для разработки (встроенный Flask‑сервер + WebSocket‑сервер).
- `wsgi.py` / `asgi.py` — точки входа для боевого окружения.
- `deploy/` — примеры конфигов `gunicorn.conf.py`, `nginx_example.conf`.
- `docker-compose.bot.yml` — пример, как крутить бота отдельно от backend‑а.
- `requirements.txt` — зависимости Python.

---

## 2. Быстрый запуск backend + WebSocket (режим разработки)

1. Создай виртуальное окружение и установи зависимости:

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

2. Скопируй пример `.env` и заполни ключевые переменные:

   ```bash
   cp .env.example .env
   ```

   Минимум нужно выставить:

   ```env
   APP_ENV=development
   SECRET_KEY=какая‑нибудь_случайная_строка

   # Учётка супер‑админа (создаётся при первом запуске, если её нет)
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=secret

   # Токен Telegram‑бота:
   MAP_BOT_TOKEN=put-your-bot-token-here

   # URL backend-а, который будет использовать бот:
   MAP_API_URL=http://localhost:8000
   ```

3. Инициализируй базу (если нужно) и запусти сервер разработки:

   ```bash
   python run.py
   ```

   По умолчанию:

   - Flask поднимется на `http://localhost:5000`
   - WebSocket‑сервер — на порту `8001` (может отличаться, см. `run.py`).

4. Открой браузер и перейди на:

   - `http://localhost:5000` — основное веб‑приложение (карта + админка).

---

## 3. Запуск Telegram‑бота

### Вариант А: локально (из того же окружения)

1. Убедись, что в `.env` прописаны:

   ```env
   MAP_BOT_TOKEN=твой_боевой_или_тестовый_токен
   MAP_API_URL=http://localhost:5000
   ```

2. Запусти бота:

   ```bash
   python bot.py
   ```

- Бот использует API backend‑а по адресу `MAP_API_URL`.
- При старте бот настраивает **меню команд** (`/start`, `/add`, `/my`, `/chat`, `/msg`, `/help`, а также админские `/stats`, `/pending`, `/approved`, `/rejected`, `/app`).

### Вариант B: отдельно через docker-compose.bot.yml

Если backend крутится где‑то ещё (другая машина / контейнер):

1. Отредактируй в `.env`:

   ```env
   MAP_API_URL=http://адрес-твоего-backend:порт
   MAP_BOT_TOKEN=твой_токен
   ```

2. Запусти бота:

   ```bash
   docker-compose -f docker-compose.bot.yml up --build
   ```

---

## 4. Вход в админку и роли

- При первом запуске создаётся супер‑админ с логином/паролем из `.env` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).
- Войти можно:
  - через веб‑интерфейс (форма логина на сайте),
  - или через Telegram‑бота (админ‑логин внутри бота).
- После логина в вебе доступно:
  - управление администраторами и ролями,
  - управление зонами,
  - чат с пользователями,
  - аналитика и аудит,
  - выгрузка отчётов в Excel (сводная аналитика и список адресов) через
    меню «Данные».

Подробнее про роли, зоны и аналитику — см. `project_manual.md`.

---

## 5. Документация и деплой

Для детальной информации:

- **Как устроен код, базы, офлайн‑режим, заявки, бот** → читай `project_manual.md`.
- **Как задеплоить в прод** (gunicorn + nginx, переменные окружения, systemd‑юниты) → `deploy/README_DEPLOY.md`.

Если ты вносишь изменения в код, старайся:

- обновлять `project_manual.md` при крупных изменениях бизнес‑логики;
- проверять, не нужны ли правки в `.env.*.example` и `README_DEPLOY.md`.

---

Удачной охоты на баги и приятной работы с проектом «Map v12» 🚀


## Миграции БД (Alembic)

- `alembic upgrade head`
- `alembic revision -m "..." --autogenerate`

Используется `DATABASE_URI`.


## Тесты

Быстрый прогон unit/integration:

```bash
pytest -q
```

E2E-тесты (поднимают `uvicorn asgi_realtime:app` и проверяют WebSocket):

```bash
pytest -q -m e2e
```

В CI e2e по умолчанию отключены (чтобы не усложнять пайплайн).


## Tests

- Unit/Integration: `pytest`
- E2E (manual): `pytest -m e2e`
