# Продольный профиль пути — Редактор

Интерактивный редактор продольного профиля железнодорожного пути.

## Возможности

- **Профиль пути** — визуализация высотных отметок
- **План пути** — кривые и прямые участки с радиусами
- **Уклоны** — подъёмы/спуски с указанием крутизны (‰)
- **Станции** — границы станций с названиями
- **Сигналы** — проходные, входные, маневровые, выходные
- **Рекомендации** — заметки, предупреждения, ограничения скорости
- **Редактирование** — перетаскивание точек, добавление/удаление элементов
- **AMOLED тема** — режим true black для OLED-экранов
- **Undo/Redo** — Ctrl+Z / Ctrl+Y
- **Адаптивная вёрстка** — работает на Android в горизонтальной ориентации
- **JSON Import/Export** — сохранение/загрузка профиля
- **localStorage автосохранение** — восстановление сессии при перезагрузке

## Использование

1. Открыть `index.html` в браузере
2. Нажать **«Редактор пути»** — откроется боковая панель
3. Добавлять элементы через вкладки: Станции, Сигналы, Рельеф, Уклоны, Кривые, Рекомендации
4. Точки рельефа перетаскиваются мышью
5. Направление переключается кнопкой **«Развернуть»** (чётное/нечётное)

## Технологии

Чистый HTML + CSS + JavaScript (Canvas 2D). Никаких зависимостей.

---

## 🚀 План оптимизации под Android (TODO)

### Приоритет 1 — Критично для UX на мобильном
- [ ] **Разделить монолитный `index.html`** на `index.html` + `styles.css` + `app.js` + модули ES6
- [ ] **Минификация** (esbuild / terser) → gzip/brotli → загрузка -70%
- [ ] **Touch events + панорама через CSS transform** — нативный 60fps скролл/зум без перерисовки Canvas
- [ ] **requestAnimationFrame + «грязные» флаги** — перерисовка только при изменениях, не каждый кадр
- [ ] **Слои Canvas**: фоновая сетка (статичный OffscreenCanvas) + динамический слой объектов

### Приоритет 2 — Стабильность и память
- [ ] **Debounced localStorage** (300-500ms) / переход на **IndexedDB** — убрать лаги на каждом изменении
- [ ] **Service Worker** (Workbox) — офлайн-работа, кэш, мгновенный старт
- [ ] **Ограничение Canvas width + тайлы** — защита от OOM на длинных путях (>100км)
- [ ] **Виртуализация списков** в редакторе — рендерить только видимые строки (500+ элементов без лагов)

### Приоритет 3 — Производительность CPU
- [ ] **Web Worker** для `calcRange`, экспорта JSON, валидации импорта — освободить main thread
- [ ] **Мемоизация `positionToX` / `xToPosition`** — кэш на кадр
- [ ] **OffscreenCanvas** для фоновой отрисовки сетки/профиля (если поддерживается WebView)

### Приоритет 4 — DX и качество
- [ ] **ESLint + Prettier + TypeScript (JSDoc)** — типы для State, Data, Items
- [ ] **Модульная архитектура**: `state.js`, `renderer.js`, `interaction.js`, `storage.js`, `editor.js`
- [ ] **GitHub Actions** → build + deploy на GitHub Pages (main = production)
- [ ] **PWA manifest** — установка как приложение на Android

---

## Архитектура (после рефакторинга)

```
railway-track-profile/
├── index.html          # ТОЛЬКО HTML-каркас, подключает styles.css + app.js (type=module)
├── styles.css          # Все стили (CSS custom properties, @media)
├── app.js              # Entry point: init state, router, bootstrap
├── modules/
│   ├── state.js        # State management, history, validation
│   ├── storage.js      # localStorage/IndexedDB, import/export
│   ├── renderer/
│   │   ├── index.js    # Orchestrator: dirty flags, RAF loop, layers
│   │   ├── grid.js     # Static grid/axes (OffscreenCanvas)
│   │   ├── profile.js  # Elevation profile
│   │   ├── plan.js     # Plan path (curves)
│   │   ├── slopes.js   # Gradients
│   │   ├── stations.js # Stations
│   │   ├── signals.js  # Signals
│   │   └── recommendations.js
│   ├── interaction.js  # Touch/mouse, drag, selection, tooltips
│   ├── editor.js       # Editor panel UI, forms, lists
│   └── utils.js        # Helpers: position↔km, format, memoize
├── sw.js               # Service Worker (Workbox)
├── manifest.json       # PWA
└── build.js            # esbuild config (minify, bundle, hash)
```

---

## Запуск dev-сервера (Termux/Android)

```bash
cd ~/railway-track-profile
python3 -m http.server 8080
# Открыть в браузере: http://localhost:8080
```

## Лицензия

MIT