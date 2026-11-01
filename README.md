# Архив Солана Вейра

Сайт-досье рыцаря-джедая Солана Вейра («Призрак»).

- **Сайт**: React + Vite, публикуется на GitHub Pages.
- **Данные**: MySQL-база из панели Pterodactyl.
- **API** (`api/`): небольшой сервер на Node.js. Он работает на VDS рядом с MySQL и отдаёт данные сайту. Браузер не может подключиться к MySQL напрямую, поэтому без этого посредника не обойтись. Картинки, загруженные в админке, хранятся на диске VDS.

```
GitHub Pages (сайт)  ──https──▶  api.solanveyr.com (nginx → Node API)  ──▶  MySQL (Pterodactyl)
                                                    └── /uploads/ (картинки на диске VDS)
```

---

## 1. База данных в Pterodactyl

1. Откройте панель, любой сервер, вкладку **Databases** и нажмите **New Database**. Имя, например, `solanveyr`, в Connections from укажите `%`.
2. Запишите **Endpoint** (хост:порт), **Username** и **Password**. Имя базы будет вида `s1_solanveyr`.
3. Таблицы вручную создавать не нужно: при первом запуске API создаст их сам и запишет Солана с тремя главами биографии. При желании схему можно выполнить руками: она лежит в `api/schema.sql`.

> Если API запущен на том же VDS, что и MySQL, используйте хост `127.0.0.1`.

## 2. API на VDS

Нужен Node.js 18 или новее (`node -v`). Если его нет:
`curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs`.

```bash
# скопировать папку api/ на VDS
mkdir -p /opt/solanveyr-api && cp -r api/* /opt/solanveyr-api/
cd /opt/solanveyr-api
npm install --omit=dev

# пароль админки: выведет ADMIN_PASSWORD_HASH и TOKEN_SECRET
node hash-password.js "ваш-надёжный-пароль"

cp .env.example .env
nano .env          # данные БД, ADMIN_USER, две строки из hash-password, ALLOWED_ORIGINS

mkdir -p uploads && chown -R www-data:www-data /opt/solanveyr-api
cp solanveyr-api.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now solanveyr-api
systemctl status solanveyr-api        # должно быть «Архив слушает http://127.0.0.1:8787»
curl http://127.0.0.1:8787/api/health # {"ok":true,"db":true}
```

### HTTPS через nginx

Сайт на GitHub Pages открывается по https, поэтому API тоже должен работать по https: браузер блокирует запросы с https-страницы на http-адрес.

1. В Gcore DNS добавьте A-запись `api` → IP вашего VDS.
2. Подключите конфиг и получите сертификат:

```bash
cp nginx-api.conf /etc/nginx/sites-available/api.solanveyr.com
ln -s /etc/nginx/sites-available/api.solanveyr.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.solanveyr.com
```

3. Проверьте, что `https://api.solanveyr.com/api/health` открывается в браузере.

Если порт 80 или 443 занят другим сервером из Pterodactyl, проверьте это командой `ss -tlnp`.

## 3. Сайт на GitHub

1. Залейте репозиторий на GitHub (ветка `main`).
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables** и добавьте:
   - `API_URL` = `https://api.solanveyr.com`;
   - `CUSTOM_DOMAIN` = `solanveyr.com` — только если сайт будет открываться по своему домену. Для этого в Gcore нужны записи на GitHub Pages: A-записи `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` и CNAME `www` → `10kara.github.io`. Затем в Settings → Pages укажите домен и включите **Enforce HTTPS**.
4. Каждый push в `main` пересобирает сайт. Изменения только в `api/` сборку не запускают.

Без `CUSTOM_DOMAIN` сайт открывается по адресу `https://10kara.github.io/solanveyr/`.

## Локальная разработка

```bash
# API (нужна доступная MySQL)
cd api && npm install && cp .env.example .env && nano .env && npm start
# сайт
npm install
echo "VITE_API_URL=http://localhost:8787" > .env
npm run dev
```

Без `VITE_API_URL` сайт тоже работает: он показывает встроенное досье из `api/seed.json`, только без админки.

## Админ-панель

Ссылка «Служебный вход» в подвале ведёт на `/admin`. Логин и пароль задаются в `api/.env`.

- **Персонаж**: все поля досье, а также редактируемые списки черт характера, форм боя, параметров меча, взглядов и привычек. Строки «- …» в текстах показываются на сайте списком.
- **Главы**, **Связи**, **Галерея**: добавление, правка и удаление (удаление можно отменить), поиск, публикация и скрытие глав. Порядок снимков в галерее меняется перетаскиванием.
- **Карта связей**: узлы расставляются мышью. Связи между персонажами отмечаются в таблице.
- Черновики форм автоматически сохраняются в браузере. Ctrl+S сохраняет форму.
- **Скачать копию** и **Импорт** — резервная копия в JSON. Картинки в неё не входят: копируйте папку `/opt/solanveyr-api/uploads`.

## Пасхалки

- **T** — тема «Нар-Шаддаа» (неон родного мира).
- **↑ ↑ ↓ ↓ ← → ← →** — «чувство Силы».

## Что изменилось по сравнению с v12

- Supabase полностью убран: нет `@supabase/supabase-js`, SQL-политик RLS и Storage.
- Новый сервер `api/` с одной зависимостью (`mysql2`). Пароль хранится как scrypt-хеш, есть ограничение попыток входа, загружаются только картинки (JPG, PNG, GIF, WebP; содержимое проверяется по сигнатуре файла).
- Весь архив загружается одним запросом `/api/archive` (было 5) с ETag. Последняя копия кешируется в браузере, поэтому повторное открытие страницы мгновенное.
- JS для посетителей: ~111 КБ gzip против ~172 КБ, CSS: 7 КБ против 16 КБ. Админка вынесена в отдельный файл и грузится только на `/admin`.
- Убраны постоянные анимации (сканлайны, глитчи, тикер, частицы). Учитывается настройка «уменьшить движение».
- Новый дизайн и данные Солана Вейра. Старые ссылки `/character` перенаправляются на `/dossier`.
- Папка `gar-archives/` не тронута и в сборку не входит.
