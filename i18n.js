// i18n.js — 界面多语言（中文 / English / Français / Español）
// 轻量实现：字典 + t() 取值 + [data-i18n] 静态标注自动套用。
// 语言优先级：用户手动选择（localStorage.uiLang）> 系统语言（navigator.language）。
// 渲染层与主进程各自持有一份字典；主进程的字典在 main.js（托盘/系统对话框）。
(function () {
  'use strict';

  const LANGS = ['zh', 'en', 'fr', 'es'];
  const LANG_NAMES = { zh: '中文', en: 'English', fr: 'Français', es: 'Español' };

  // 字典：key → { zh, en, fr, es }。新增文案时四语言必须同步补齐。
  const DICT = {
    'app.title':        { zh: '快文', en: 'QuickDocs', fr: 'QuickDocs', es: 'QuickDocs' },

    // ---- 静态控件（index.html 标注 data-i18n*） ----
    'title.logo':       { zh: '点我展开/收起操作', en: 'Expand / collapse actions', fr: 'Afficher / masquer les actions', es: 'Mostrar / ocultar acciones' },
    'aria.logo':        { zh: '展开/收起操作', en: 'Expand or collapse actions', fr: 'Afficher ou masquer les actions', es: 'Expandir o contraer acciones' },
    'title.add':        { zh: '添加文件夹', en: 'Add folders', fr: 'Ajouter des dossiers', es: 'Añadir carpetas' },
    'title.index':      { zh: '建立 / 更新索引', en: 'Build / update index', fr: 'Créer / mettre à jour l’index', es: 'Crear / actualizar índice' },
    'aria.index':       { zh: '建立索引', en: 'Build index', fr: 'Créer l’index', es: 'Crear índice' },
    'title.clear':      { zh: '清空索引', en: 'Clear index', fr: 'Effacer l’index', es: 'Borrar el índice' },
    'ph.search':        { zh: '输入关键词即时搜索，多个词空格分隔更聚焦', en: 'Type keywords to search instantly; separate multiple words with spaces', fr: 'Saisissez des mots-clés pour une recherche instantanée ; séparez les mots par des espaces', es: 'Escribe palabras clave para buscar al instante; separa varias palabras con espacios' },
    'title.settings':   { zh: '设置 / 选择搜索文件夹', en: 'Settings / choose folders to search', fr: 'Réglages / choisir les dossiers', es: 'Ajustes / elegir carpetas' },
    'aria.settings':    { zh: '设置', en: 'Settings', fr: 'Réglages', es: 'Ajustes' },
    'aria.fold':        { zh: '全部显示', en: 'Show all', fr: 'Tout afficher', es: 'Mostrar todo' },
    'aria.history':     { zh: '近期搜索', en: 'Recent searches', fr: 'Recherches récentes', es: 'Búsquedas recientes' },
    'panel.title':      { zh: '搜索范围', en: 'Search scope', fr: 'Portée de recherche', es: 'Alcance de búsqueda' },
    'title.close':      { zh: '关闭', en: 'Close', fr: 'Fermer', es: 'Cerrar' },
    'panel.sub':        { zh: '勾选要参与搜索的文件夹（可多选）', en: 'Check the folders to include in searches (multi-select)', fr: 'Cochez les dossiers à inclure dans la recherche (multi-sélection)', es: 'Marca las carpetas que se incluirán en la búsqueda (selección múltiple)' },
    'panel.typeFilter': { zh: '按文件类型筛选（默认全选，可只看其中 1–2 类）', en: 'Filter by file type (all on by default; you can keep just 1–2)', fr: 'Filtrer par type de fichier (tout activé par défaut ; vous pouvez n’en garder qu’1 ou 2)', es: 'Filtrar por tipo de archivo (todo activado por defecto; puedes dejar solo 1 o 2)' },
    'panel.typeTip':    { zh: '系统按文件名自动归类；在结果列表中点击类型标签即可手动改归类。', en: 'Files are auto-classified by name; click a type tag in the results to change it manually.', fr: 'Les fichiers sont classés automatiquement par nom ; cliquez sur une étiquette de type dans les résultats pour la modifier.', es: 'Los archivos se clasifican automáticamente por nombre; haz clic en una etiqueta de tipo en los resultados para cambiarla.' },
    'type.red':         { zh: '红头文件', en: 'Official notices', fr: 'Documents officiels', es: 'Documentos oficiales' },
    'type.law':         { zh: '法规条例', en: 'Laws & regulations', fr: 'Lois et règlements', es: 'Leyes y reglamentos' },
    'type.spec':        { zh: '规范指南', en: 'Standards & guides', fr: 'Normes et guides', es: 'Normas y guías' },
    'type.plan':        { zh: '规划计划', en: 'Plans', fr: 'Plans', es: 'Planes' },
    'type.journal':     { zh: '学术期刊', en: 'Academic journals', fr: 'Revues académiques', es: 'Revistas académicas' },
    'type.normal':      { zh: '普通文件', en: 'General files', fr: 'Fichiers généraux', es: 'Archivos generales' },
    'adv.ocr':          { zh: '图片 / 扫描件 OCR（较慢）', en: 'Image / scanned-document OCR (slower)', fr: 'OCR d’images / documents scannés (plus lent)', es: 'OCR de imágenes / documentos escaneados (más lento)' },
    'adv.ocrSub':       { zh: '开启后索引 JPG、PNG、TIFF 等图片，并识别扫描版 PDF；全程离线', en: 'When enabled, indexes JPG, PNG, TIFF images and recognizes scanned PDFs; fully offline', fr: 'Indexe les images JPG, PNG, TIFF et reconnaît les PDF scannés ; entièrement hors ligne', es: 'Indexa imágenes JPG, PNG, TIFF y reconoce PDF escaneados; totalmente sin conexión' },
    'adv.title':        { zh: '搜索结果包含标题 / 目录', en: 'Include headings / tables of contents in results', fr: 'Inclure titres et sommaires dans les résultats', es: 'Incluir títulos / índices en los resultados' },
    'adv.titleSub':     { zh: '默认只显示正文命中；勾选后连标题、目录一并显示', en: 'By default only body-text hits are shown; check to include headings and TOCs', fr: 'Par défaut, seules les occurrences du corps du texte sont affichées ; cochez pour inclure titres et sommaires', es: 'Por defecto solo se muestran coincidencias del cuerpo del texto; marca para incluir títulos e índices' },
    'adv.hotkey':       { zh: '全局呼出快捷键', en: 'Global show/hide hotkey', fr: 'Raccourci global d’affichage', es: 'Atajo global para mostrar/ocultar' },
    'adv.lang':         { zh: '界面语言', en: 'Interface language', fr: 'Langue de l’interface', es: 'Idioma de la interfaz' },
    'title.hotkeyBtn':  { zh: '点击后按下新的组合键', en: 'Click, then press the new key combination', fr: 'Cliquez, puis appuyez sur la nouvelle combinaison', es: 'Haz clic y pulsa la nueva combinación de teclas' },
    'adv.guide':        { zh: '📘 查看使用指南', en: '📘 View the guide', fr: '📘 Voir le guide', es: '📘 Ver la guía' },
    'tour.skip':        { zh: '暂不引导', en: 'Skip the tour', fr: 'Ignorer le guide', es: 'Omitir la guía' },

    // ---- 渲染层动态文案（renderer.js 调用 t()） ----
    'year.unknown':     { zh: '未知', en: 'Unknown', fr: 'Inconnu', es: 'Desconocido' },
    'year.unknownBar':  { zh: '未知日期', en: 'Unknown date', fr: 'Date inconnue', es: 'Fecha desconocida' },
    'tag.selectType':   { zh: '点击选择文件类型', en: 'Click to choose file type', fr: 'Cliquez pour choisir le type de fichier', es: 'Haz clic para elegir el tipo de archivo' },
    'folder.empty':     { zh: '还没有文件夹。点左上角 LOGO 展开后，按蓝色「+」添加。', en: 'No folders yet. Click the LOGO at top left to expand, then press the blue “+”.', fr: 'Aucun dossier. Cliquez sur le LOGO en haut à gauche, puis sur le « + » bleu.', es: 'Aún no hay carpetas. Haz clic en el LOGO de arriba a la izquierda y luego en el “+” azul.' },
    'folder.toggleOff': { zh: '点击不搜此文件夹', en: 'Click to exclude this folder from searches', fr: 'Cliquez pour exclure ce dossier de la recherche', es: 'Haz clic para excluir esta carpeta de la búsqueda' },
    'folder.toggleOn':  { zh: '点击加入搜索', en: 'Click to include this folder in searches', fr: 'Cliquez pour inclure ce dossier dans la recherche', es: 'Haz clic para incluir esta carpeta en la búsqueda' },
    'folder.remove':    { zh: '移除该文件夹', en: 'Remove this folder', fr: 'Retirer ce dossier', es: 'Quitar esta carpeta' },
    'toast.keepOneFolder': { zh: '至少保留一个搜索文件夹', en: 'Keep at least one folder to search', fr: 'Gardez au moins un dossier de recherche', es: 'Mantén al menos una carpeta de búsqueda' },
    'toast.keepOneType':   { zh: '至少保留一种文件类型', en: 'Keep at least one file type', fr: 'Gardez au moins un type de fichier', es: 'Mantén al menos un tipo de archivo' },
    'status.loaded':    { zh: '已加载上次索引：{count} 份文档（{date} 建立）。可直接搜索；文件有增改点绿色「▶」更新。', en: 'Previous index loaded: {count} documents (built {date}). You can search right away; click the green “▶” to update after file changes.', fr: 'Index précédent chargé : {count} documents (créé le {date}). Vous pouvez rechercher ; cliquez sur le « ▶ » vert pour mettre à jour.', es: 'Índice anterior cargado: {count} documentos (creado el {date}). Ya puedes buscar; haz clic en el “▶” verde para actualizar.' },
    'status.welcome':   { zh: '支持 Word、PDF、OFD、PPTX、Excel（XLSX）和图片文字；先按引导添加文件夹。', en: 'Supports Word, PDF, OFD, PPTX, Excel (XLSX) and text in images; follow the guide to add folders first.', fr: 'Prend en charge Word, PDF, OFD, PPTX, Excel (XLSX) et le texte des images ; suivez le guide pour ajouter des dossiers.', es: 'Compatible con Word, PDF, OFD, PPTX, Excel (XLSX) y texto en imágenes; sigue la guía para añadir carpetas.' },
    'status.added':     { zh: '已添加 {n} 个文件夹，点绿色「▶」开始建立索引。', en: '{n} folder(s) added. Click the green “▶” to build the index.', fr: '{n} dossier(s) ajouté(s). Cliquez sur le « ▶ » vert pour créer l’index.', es: '{n} carpeta(s) añadida(s). Haz clic en el “▶” verde para crear el índice.' },
    'status.cleared':   { zh: '已清空索引和正文缓存，原始文件未被删除。', en: 'Index and text cache cleared. Your original files were not deleted.', fr: 'Index et cache de texte effacés. Vos fichiers d’origine n’ont pas été supprimés.', es: 'Índice y caché de texto borrados. Tus archivos originales no se eliminaron.' },
    'status.clearFail': { zh: '❌ 清空索引失败：{msg}', en: '❌ Failed to clear index: {msg}', fr: '❌ Échec de l’effacement de l’index : {msg}', es: '❌ Error al borrar el índice: {msg}' },
    'tour.busyIndexing': { zh: '正在建立索引，请等进度完成…', en: 'Building the index — please wait for it to finish…', fr: 'Création de l’index — veuillez patienter…', es: 'Creando el índice, espera a que termine…' },
    'status.indexingOcr': { zh: '正在扫描并建立索引（已开启扫描件 OCR，较慢）…', en: 'Scanning and building index (OCR enabled, slower)…', fr: 'Analyse et création de l’index (OCR activée, plus lent)…', es: 'Escaneando y creando el índice (OCR activado, más lento)…' },
    'status.indexing':  { zh: '正在扫描并建立索引…', en: 'Scanning and building index…', fr: 'Analyse et création de l’index…', es: 'Escaneando y creando el índice…' },
    'status.indexDone': { zh: '✅ 索引完成：共 {count} 份文档（复用未改动 {reused} 份，跳过 {skipped} 个）{imageNote}。即输即搜。', en: '✅ Index complete: {count} documents ({reused} unchanged reused, {skipped} skipped){imageNote}. Search as you type.', fr: '✅ Index terminé : {count} documents ({reused} réutilisés inchangés, {skipped} ignorés){imageNote}. Recherche instantanée.', es: '✅ Índice completo: {count} documentos ({reused} reutilizados sin cambios, {skipped} omitidos){imageNote}. Busca al escribir.' },
    'status.imageNote': { zh: '；另有 {n} 张图片未识别，可在设置中开启 OCR 后更新', en: '; {n} images not recognized — enable OCR in settings and update', fr: ' ; {n} images non reconnues — activez l’OCR dans les réglages et mettez à jour', es: '; {n} imágenes no reconocidas — activa OCR en ajustes y actualiza' },
    'status.indexFail': { zh: '❌ 建立索引失败：{msg}。请检查文件夹后重试。', en: '❌ Indexing failed: {msg}. Check the folders and try again.', fr: '❌ Échec de l’indexation : {msg}. Vérifiez les dossiers et réessayez.', es: '❌ Error al crear el índice: {msg}. Revisa las carpetas e inténtalo de nuevo.' },
    'progress.building': { zh: '建立索引中… {done}/{total}：{name}', en: 'Indexing… {done}/{total}: {name}', fr: 'Indexation… {done}/{total} : {name}', es: 'Indexando… {done}/{total}: {name}' },
    'fold.toAll':       { zh: '当前：折叠显示（按文件分组），点击改为全部显示', en: 'Now: grouped by file. Click to show all (flat list)', fr: 'Actuel : regroupé par fichier. Cliquez pour tout afficher (liste)', es: 'Actual: agrupado por archivo. Haz clic para mostrar todo (lista)' },
    'fold.toFold':      { zh: '当前：全部显示（平铺），点击改为折叠显示', en: 'Now: flat list. Click to group by file', fr: 'Actuel : liste à plat. Cliquez pour regrouper par fichier', es: 'Actual: lista plana. Haz clic para agrupar por archivo' },
    'hotkey.press':     { zh: '请按下组合键…', en: 'Press the key combination…', fr: 'Appuyez sur la combinaison de touches…', es: 'Pulsa la combinación de teclas…' },
    'hotkey.setOk':     { zh: '呼出快捷键已设为 {accel}', en: 'Hotkey set to {accel}', fr: 'Raccourci défini sur {accel}', es: 'Atajo establecido en {accel}' },
    'hotkey.setFail':   { zh: '该组合键无法注册（可能被占用），已保留原快捷键', en: 'That combination can’t be registered (may be in use); kept the previous hotkey', fr: 'Cette combinaison ne peut pas être enregistrée (peut-être déjà utilisée) ; raccourci précédent conservé', es: 'Esa combinación no se puede registrar (quizá esté en uso); se conserva el atajo anterior' },
    'history.head':     { zh: '近期搜索', en: 'Recent searches', fr: 'Recherches récentes', es: 'Búsquedas recientes' },
    'history.clear':    { zh: '清空', en: 'Clear', fr: 'Effacer', es: 'Borrar' },
    'head.time':        { zh: '时间', en: 'Date', fr: 'Date', es: 'Fecha' },
    'head.timeBasis':   { zh: '选择时间依据', en: 'Choose date basis', fr: 'Choisir la base de date', es: 'Elegir base de fecha' },
    'tb.mtime':         { zh: '修改', en: 'Modified', fr: 'Modif.', es: 'Modif.' },
    'tb.doc':           { zh: '文内', en: 'In-doc', fr: 'Document', es: 'Documento' },
    'sort.timeAsc':     { zh: '按时间排序 · 由远及近（旧→新）', en: 'Sort by date · oldest first', fr: 'Trier par date · plus ancien d’abord', es: 'Ordenar por fecha · más antiguo primero' },
    'sort.timeDesc':    { zh: '按时间排序 · 由近到远（新→旧）', en: 'Sort by date · newest first', fr: 'Trier par date · plus récent d’abord', es: 'Ordenar por fecha · más reciente primero' },
    'head.file':        { zh: '文件', en: 'File', fr: 'Fichier', es: 'Archivo' },
    'sort.typeAsc':     { zh: '按文件类型排序 · 升序', en: 'Sort by file type · ascending', fr: 'Trier par type · ascendant', es: 'Ordenar por tipo · ascendente' },
    'sort.typeDesc':    { zh: '按文件类型排序 · 降序', en: 'Sort by file type · descending', fr: 'Trier par type · descendant', es: 'Ordenar por tipo · descendente' },
    'head.content':     { zh: '内容', en: 'Content', fr: 'Contenu', es: 'Contenido' },
    'head.hiddenNote':  { zh: '，另有 {n} 处在标题/目录中（已隐藏）', en: ', plus {n} in headings/TOCs (hidden)', fr: ', plus {n} dans les titres/sommaires (masquées)', es: ', más {n} en títulos/índices (ocultas)' },
    'head.hint':        { zh: '（左键展开整段，右键复制）', en: '(left-click to expand, right-click to copy)', fr: '(clic gauche pour développer, clic droit pour copier)', es: '(clic izquierdo para expandir, clic derecho para copiar)' },
    'empty.noResult':   { zh: '没有找到正文中包含「{kw}」的内容。', en: 'Nothing found containing “{kw}” in document bodies.', fr: 'Aucun contenu trouvé pour « {kw} » dans le corps des documents.', es: 'No se encontró nada con «{kw}» en el cuerpo de los documentos.' },
    'empty.hiddenTip':  { zh: '（已隐藏 {n} 处标题/目录命中，可在设置里勾选显示）', en: '({n} heading/TOC hits hidden; enable them in settings)', fr: '({n} occurrences dans les titres/sommaires masquées ; activez-les dans les réglages)', es: '({n} coincidencias en títulos/índices ocultas; actívalas en ajustes)' },
    'colsep.drag':      { zh: '拖动调整列宽', en: 'Drag to resize columns', fr: 'Faites glisser pour ajuster les colonnes', es: 'Arrastra para ajustar las columnas' },
    'time.hintDoc':     { zh: '{source}；点击可手动修正', en: '{source}; click to correct manually', fr: '{source} ; cliquez pour corriger manuellement', es: '{source}; haz clic para corregir manualmente' },
    'time.hintMtime':   { zh: '文件修改时间（可在表头切换为文内时间）', en: 'File modification time (switch to in-doc date in the header)', fr: 'Date de modification du fichier (basculez vers la date du document dans l’en-tête)', es: 'Fecha de modificación del archivo (cambia a fecha del documento en el encabezado)' },
    'src.mtime':        { zh: '文件修改时间', en: 'File modification time', fr: 'Date de modification du fichier', es: 'Fecha de modificación' },
    'src.fallback':     { zh: '未识别到文内日期，暂用文件修改时间', en: 'No in-doc date found; using file modification time', fr: 'Aucune date trouvée dans le document ; date de modification utilisée', es: 'No se encontró fecha en el documento; se usa la fecha de modificación' },
    'src.doc':          { zh: '文内时间', en: 'In-doc date', fr: 'Date du document', es: 'Fecha del documento' },
    'file.openTitle':   { zh: '点击打开文件', en: 'Click to open the file', fr: 'Cliquez pour ouvrir le fichier', es: 'Haz clic para abrir el archivo' },
    'hits.count':       { zh: '命中 {n} 处', en: '{n} hit(s)', fr: '{n} occurrence(s)', es: '{n} coincidencia(s)' },
    'hits.more':        { zh: '展开其他 {n} 处 ▾', en: 'Show {n} more ▾', fr: 'Afficher {n} autre(s) ▾', es: 'Mostrar {n} más ▾' },
    'hits.collapse':    { zh: '收起 ▴', en: 'Collapse ▴', fr: 'Réduire ▴', es: 'Contraer ▴' },
    'file.reveal':      { zh: '定位文件', en: 'Reveal in folder', fr: 'Afficher dans le dossier', es: 'Mostrar en la carpeta' },
    'pop.typeTitle':    { zh: '选择文件类型', en: 'Choose file type', fr: 'Choisir le type de fichier', es: 'Elegir tipo de archivo' },
    'pop.auto':         { zh: '恢复自动判定', en: 'Restore auto-detection', fr: 'Restaurer la détection automatique', es: 'Restaurar detección automática' },
    'pop.timeTitle':    { zh: '设置显示时间', en: 'Set display date', fr: 'Définir la date affichée', es: 'Definir la fecha mostrada' },
    'pop.timePh':       { zh: '如 2022 / 2022-07 / 2022-07-15', en: 'e.g. 2022 / 2022-07 / 2022-07-15', fr: 'ex. 2022 / 2022-07 / 2022-07-15', es: 'ej. 2022 / 2022-07 / 2022-07-15' },
    'pop.timeHint':     { zh: '支持 年 / 年-月 / 年-月-日；留空=用自动时间', en: 'Supports year / year-month / full date; leave empty for automatic', fr: 'Accepte année / année-mois / date complète ; vide = automatique', es: 'Admite año / año-mes / fecha completa; vacío = automática' },
    'pop.save':         { zh: '保存', en: 'Save', fr: 'Enregistrer', es: 'Guardar' },
    'pop.useAuto':      { zh: '用自动时间', en: 'Use automatic', fr: 'Automatique', es: 'Automática' },
    'toast.autoTime':   { zh: '已恢复为自动时间', en: 'Reverted to automatic date', fr: 'Date automatique rétablie', es: 'Fecha automática restablecida' },
    'toast.badTime':    { zh: '时间格式无法识别，请用 2022 / 2022-07 / 2022-07-15', en: 'Unrecognized date format; use 2022 / 2022-07 / 2022-07-15', fr: 'Format de date non reconnu ; utilisez 2022 / 2022-07 / 2022-07-15', es: 'Formato de fecha no reconocido; usa 2022 / 2022-07 / 2022-07-15' },
    'toast.timeSet':    { zh: '显示时间已设为 {v}', en: 'Display date set to {v}', fr: 'Date affichée définie sur {v}', es: 'Fecha mostrada establecida en {v}' },
    'toast.autoType':   { zh: '已恢复自动判定的类型', en: 'Restored auto-detected type', fr: 'Type détecté automatiquement rétabli', es: 'Tipo detectado automáticamente restablecido' },
    'toast.typeSet':    { zh: '已改为「{label}」', en: 'Changed to “{label}”', fr: 'Modifié en « {label} »', es: 'Cambiado a «{label}»' },
    'toast.copiedSel':  { zh: '已复制选中文字', en: 'Selection copied', fr: 'Sélection copiée', es: 'Selección copiada' },
    'toast.copiedPara': { zh: '已复制该段', en: 'Paragraph copied', fr: 'Paragraphe copié', es: 'Párrafo copiado' },
    'toast.tourDone':   { zh: '引导完成，可以开始使用快文了', en: 'Tour complete — enjoy QuickDocs!', fr: 'Guide terminé — bon usage de QuickDocs !', es: 'Guía completada: ¡disfruta QuickDocs!' },

    // ---- 首次使用引导（TOUR_COPY） ----
    'tour.step':        { zh: '第 {n} 步 / {total}', en: 'Step {n} of {total}', fr: 'Étape {n} sur {total}', es: 'Paso {n} de {total}' },
    'tour1.title':      { zh: '先点击左上角曲别针', en: 'Click the paperclip at top left', fr: 'Cliquez d’abord sur le trombone en haut à gauche', es: 'Haz clic primero en el clip de arriba a la izquierda' },
    'tour1.text':       { zh: '它会展开三个常用操作按钮。请直接点击被高亮的曲别针。', en: 'It reveals three common action buttons. Go ahead and click the highlighted paperclip.', fr: 'Il déploie trois boutons d’action. Cliquez directement sur le trombone en surbrillance.', es: 'Despliega tres botones de acción. Haz clic directamente en el clip resaltado.' },
    'tour1.wait':       { zh: '等你点击曲别针', en: 'Waiting for you to click the paperclip', fr: 'En attente du clic sur le trombone', es: 'Esperando que hagas clic en el clip' },
    'tour2.title':      { zh: '添加要搜索的文件夹', en: 'Add the folders to search', fr: 'Ajoutez les dossiers à explorer', es: 'Añade las carpetas en las que buscar' },
    'tour2.text':       { zh: '点击蓝色「＋」，在系统窗口里选择一个或多个文件夹。快文只读取你主动选择的范围。', en: 'Click the blue “＋” and pick one or more folders in the system dialog. QuickDocs only reads what you explicitly choose.', fr: 'Cliquez sur le « ＋ » bleu et choisissez un ou plusieurs dossiers. QuickDocs ne lit que ce que vous choisissez explicitement.', es: 'Haz clic en el “＋” azul y elige una o varias carpetas. QuickDocs solo lee lo que tú eliges explícitamente.' },
    'tour2.wait':       { zh: '等你选好文件夹', en: 'Waiting for your folder selection', fr: 'En attente de votre sélection de dossiers', es: 'Esperando tu selección de carpetas' },
    'tour3.title':      { zh: '建立本地内容索引', en: 'Build the local content index', fr: 'Créez l’index de contenu local', es: 'Crea el índice de contenido local' },
    'tour3.text':       { zh: '点击绿色「▶」。首次会解析文件内容，之后更新只处理有变化的文件。图片文字请先在设置中开启 OCR。', en: 'Click the green “▶”. The first run parses file contents; later updates only process changed files. For text in images, enable OCR in settings first.', fr: 'Cliquez sur le « ▶ » vert. La première fois analyse le contenu des fichiers ; les mises à jour suivantes ne traitent que les fichiers modifiés. Pour le texte des images, activez d’abord l’OCR dans les réglages.', es: 'Haz clic en el “▶” verde. La primera vez analiza el contenido de los archivos; las actualizaciones posteriores solo procesan los archivos modificados. Para texto en imágenes, activa primero OCR en ajustes.' },
    'tour3.wait':       { zh: '等你点击并完成索引', en: 'Waiting for indexing to complete', fr: 'En attente de la fin de l’indexation', es: 'Esperando a que termine la indexación' },
    'tour4.title':      { zh: '输入关键词开始搜索', en: 'Type keywords to start searching', fr: 'Saisissez des mots-clés pour rechercher', es: 'Escribe palabras clave para buscar' },
    'tour4.text':       { zh: '点击搜索框，输入文件里面出现的词。结果默认按文件修改时间从新到旧排列，表头可切换为文内时间。', en: 'Click the search box and type words that appear inside your files. Results are sorted by file modification time, newest first; you can switch to in-doc date in the header.', fr: 'Cliquez sur la barre de recherche et saisissez des mots présents dans vos fichiers. Les résultats sont triés par date de modification, du plus récent au plus ancien ; vous pouvez basculer vers la date du document dans l’en-tête.', es: 'Haz clic en el cuadro de búsqueda y escribe palabras que aparezcan dentro de tus archivos. Los resultados se ordenan por fecha de modificación, de más reciente a más antigua; puedes cambiar a la fecha del documento en el encabezado.' },
    'tour4.wait':       { zh: '输入关键词后自动完成引导', en: 'The tour finishes automatically once you search', fr: 'Le guide se termine automatiquement après votre recherche', es: 'La guía termina automáticamente al buscar' }
  };

  function detect() {
    try {
      const saved = localStorage.getItem('uiLang');
      if (saved && LANGS.includes(saved)) return saved;
    } catch {}
    const nav = (typeof navigator !== 'undefined' && navigator.language || 'zh').toLowerCase();
    if (nav.startsWith('zh')) return 'zh';
    if (nav.startsWith('fr')) return 'fr';
    if (nav.startsWith('es')) return 'es';
    if (nav.startsWith('en')) return 'en';
    return 'zh'; // 产品主力用户为中文政企，默认回退中文
  }

  let current = detect();

  function t(key, vars) {
    const entry = DICT[key];
    let s = entry ? (entry[current] || entry.zh || entry.en || key) : key;
    if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }

  // 静态标注套用：data-i18n→textContent；data-i18n-title→title；data-i18n-ph→placeholder；data-i18n-aria→aria-label
  function applyStatic(root) {
    if (typeof document === 'undefined') return; // 纯 Node 环境（冒烟测试）跳过 DOM 套用
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    r.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.getAttribute('data-i18n-title')); });
    r.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    r.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    document.title = t('app.title');
    document.documentElement.lang = current === 'zh' ? 'zh-CN' : current;
  }

  function setLang(l, persistAndNotify) {
    if (!LANGS.includes(l)) return;
    current = l;
    try { localStorage.setItem('uiLang', l); } catch {}
    applyStatic();
    // 通知主进程（托盘菜单/系统对话框换语言）；接口不存在时静默忽略（如纯浏览器调试）
    if (persistAndNotify !== false && window.api && window.api.setUILang) {
      try { window.api.setUILang(l); } catch {}
    }
  }

  window.I18N = { t, applyStatic, setLang, lang: () => current, LANGS, LANG_NAMES };
  window.t = t;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyStatic());
    else applyStatic();
  }
})();
