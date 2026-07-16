# TODO — рефакторинг архитектуры

## Проблема

app.js (~2900 строк) — процедурная свалка: state, canvas-рендер, мышь/тач,
валидация форм, undo/redo, localStorage, импорт/экспорт — всё в одном файле,
без модулей и сборки. Работает, но 8 типов данных (stations, signals,
elevations, slopes, curves, recommendations, speedLimits, crossings)
описаны копипастой параллельно друг другу: свои save-хендлеры, свои
auto-apply, свои ветки в findItemById/updateSelectedEditorFields/
renderLabel/renderColor. Копипаста не даёт lint'у/компилятору поймать
асимметрию — баги вида "забыли X для одного из восьми типов" будут
появляться регулярно (уже было: 3 типа не писали saveSnapshot() в историю;
позже нашли что кнопка "Сохранить" у всех 8 типов вешала ДВА click-
листенера вместо одного).

## Цель

Один способ описать тип данных → всё остальное (формы, save, undo,
списки, рендер-подписи) генерится из этого описания. Новый тип объекта
("мосты", например) = один объект в реестре, а не 100 строк копипасты
по всему файлу.

## План (incremental, коммит+пуш на каждый шаг, тестировать перед пушем)

- [x] Шаг 1 — убрать дублирование save-листенеров, свести к одному
      saveSnapshot() на клик через общий setupSaveHandler(type, fields,
      postProcess). Сделано в e30e1ff.
- [ ] Шаг 2 — пилот: ввести SCHEMAS-реестр для одного типа (crossings —
      самый маленький: 1 позиция, 2 поля). Убедиться что поведение не
      изменилось, прежде чем распространять на остальные 7.
- [ ] Шаг 3 — мигрировать оставшиеся типы (stations, signals, elevations,
      slopes, curves, recommendations, speedLimits) на SCHEMAS один за
      одним, коммит на каждый тип.
- [ ] Шаг 4 — dirty-flag рендер: draw() сейчас безусловно перерисовывает
      весь canvas на каждый mousemove/drag. Нужно перерисовывать только
      когда state.data реально изменился, через requestAnimationFrame,
      не синхронно в каждом событии мыши. Важно для длинных путей
      (>100км) на Android.
- [ ] Шаг 5 (опционально) — разбить файл на модули как чистое перемещение
      кода без логических изменений: state.js / render.js /
      interaction.js / editor-ui.js. Можно без bundler — просто
      <script type="module">.

## Что НЕ трогать

- Чистый HTML/CSS/JS без фреймворков — React/Vue не нужны.
- Canvas 2D для отрисовки профиля — SVG/WebGL не нужны.
- localStorage + JSON import/export — IndexedDB не нужен, данных мало.
- PWA/Service Worker — уже сделано, работает.
- Touch-панорама через нативный scroll canvasWrap — работает, не трогать.

## Формат SCHEMAS (набросок для шага 2)

```js
const SCHEMAS = {
  crossings: {
    fields: [
      ['name', 'label', null],
      ['km', '_km', parseInt],
      ['m', '_m', parseInt],
    ],
    postProcess: (item) => {
      item.position = toPos(item._km, item._m);
      delete item._km; delete item._m;
    },
    sortBy: null, // одна точка, сортировка не нужна
    renderLabel: (item) => `${formatPos(item.position)}${item.label ? ' · ' + item.label : ''}`,
    renderColor: () => '#e53935',
  },
  // ...
};
```

Из этой структуры одной функцией строятся: setupSaveHandler,
setupAutoApply, debounceAutoApply, findItemById-ветка,
updateSelectedEditorFields-ветка, renderLabel/renderColor-ветки,
sortType().
