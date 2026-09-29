# PRESET-2 — Модальный редактор пресетов (сделано)

Repo: /home/aifactory/PartsDonor/.worktrees/t_eb31343a (wt/t_eb31343a)

## Что изменено

### frontend/src/pages/BlueprintEditor.jsx
- PresetSvg (`<PresetSvg preset className>`) — полномасштабный (1:1, viewBox 340x640) рендер композиции shapes[] (rect/circle/ellipse/polygon) с фолбэком на legacy одиночную форму. Живое превью в модалке; миниатюра панели (PresetIcon) без изменений.
- normalizePreset(p) — пресет без shapes[] приводится к shapes:[{shape,g,fill,z}] для единообразного UI.
- Persist-слой: loadPresets() (дефолты+кастомы из localStorage, кастомные ключи заменяют дефолтные), persistPresets (pd-presets-custom), persistDeleted (pd-presets-deleted — tombstones, переживают перезагрузку).
- App-уровень: presetList state вместо статического PRESETS — панель, filteredPresets, addPreset и клик-на-холст читают его. savePresets(nextList) пишет в localStorage.
- Кнопка «✏️ Редактировать пресеты» в шапке панели открывает модалку.
- PresetEditorModal: оверлей .bld-modal-overlay, слева список + фильтр категорий + «+ Добавить пресет», справа редактор (название, категория, фигуры: тип/геометрия/полигон-points textarea/fill+свотчи/z/реордер ↑↓/удаление/+Добавить фигуру) и живое SVG-превью. «Отмена»/«Сохранить».

### Bugfix (важно): правки теперь применяются на «Сохранить»
В исходной недоделанной версии редактировалась отдельная копия draft, а save() писал listDraft — изменения названия/категории/фигур НЕ доходили до панели и localStorage. Исправлено: draft сделан производным от listDraft по selectedKey (useMemo), все patch*-функции правят listDraft по ключу. Теперь «Сохранить» применяет все накопленные правки.

### frontend/src/styles.css
Добавлены .bld-presets-edit, .bld-modal-overlay, .bld-modal и всё дерево .bld-modal-* (head/list/edit/shape/geo/fill/z/actions) + адаптив <820px. Тёмная тема на токенах (--bg-0, --glass, --stroke, --accent), оверлей rgba(15,23,42,.5), z-index 200.

frontend/src/presets.js НЕ тронут — кастомы накладываются поверх в BlueprintEditor.

## Верификация
- npm run build (frontend) → exit 0 (Vite, ~1.3s).
- Браузерные проверки через Playwright (dev-сервер --port 5212):
  - кнопка открывает модалку; 37 пресетов в списке;
  - «Аккумулятор (АКБ)» → 4 под-фигуры; добавление фигуры 4→5;
  - живое превью есть и обновляется;
  - новый пресет (переименование+смена категории) → «Сохранить» → в панели, в pd-presets-custom (38), переживает перезагрузку;
  - «Отмена» не применяет изменений;
  - удаление (window.confirm) работает;
  - редактирование дефолтного пресета → панель обновляется, override battery custom:true в LS;
  - клик по отредактированному пресету добавляет композицию фигур на холст (0→4).
- PAGE ERRORS: none.

## Примечания
- Изменённые дефолты при «Сохранить» помечаются custom:true и пишутся в pd-presets-custom (full-list); tombstones удалений — pd-presets-deleted. Оба переживают перезагрузку.
- display-assembly (без shapes[]) корректно открывается через normalizePreset.
