/**
 * Langues : français (référence), anglais, espagnol, arabe.
 * Le texte de l'interface est écrit en français ; ce module traduit à la volée
 * (texte exact, ou morceaux de phrase pour les messages avec des nombres).
 */
export const LANGS = { fr: 'Français', en: 'English', es: 'Español', ar: 'العربية' };
const KEY = 'sambrk.lang';

// [fr, en, es, ar]
const D = [
['Chargement...', 'Loading...', 'Cargando...', 'جارٍ التحميل...'],
['Démarrage du jeu...', 'Starting the game...', 'Iniciando el juego...', 'جارٍ تشغيل اللعبة...'],
['Chargement du réseau de neurones...', 'Loading the neural network...', 'Cargando la red neuronal...', 'جارٍ تحميل الشبكة العصبية...'],
['Démarrage de la partie...', 'Starting the game...', 'Iniciando la partida...', 'جارٍ بدء المباراة...'],
['Nouvelle partie', 'New game', 'Nueva partida', 'لعبة جديدة'],
['Retourner', 'Flip board', 'Girar tablero', 'قلب الرقعة'],
['Modifier', 'Edit', 'Editar', 'تعديل'],
['Jouer !', 'Play!', '¡Jugar!', 'العب!'],
['Parties', 'Games', 'Partidas', 'المباريات'],
['Réflexion', 'Analysis', 'Análisis', 'تحليل'],
['Apprendre de cette partie', 'Learn from this game', 'Aprender de esta partida', 'تعلّم من هذه المباراة'],
['Analyse la partie et retient les erreurs du moteur', 'Analyses the game and remembers the engine\'s mistakes', 'Analiza la partida y recuerda los errores del motor', 'يحلل المباراة ويحفظ أخطاء المحرك'],
['Abandonner', 'Resign', 'Abandonar', 'استسلام'],
['Début de la partie (Début)', 'Start of the game (Home)', 'Inicio de la partida (Inicio)', 'بداية المباراة (Home)'],
['Coup précédent (←)', 'Previous move (←)', 'Jugada anterior (←)', 'الحركة السابقة (←)'],
['Coup suivant (→)', 'Next move (→)', 'Jugada siguiente (→)', 'الحركة التالية (→)'],
['Fin de la partie (Fin)', 'End of the game (End)', 'Final de la partida (Fin)', 'نهاية المباراة (End)'],
['Fin de la partie', 'End of the game', 'Fin de la partida', 'نهاية المباراة'],
['Revoir la partie automatiquement (Espace)', 'Replay the game automatically (Space)', 'Repetir la partida automáticamente (Espacio)', 'إعادة المباراة تلقائياً (مسافة)'],
['Pause (Espace)', 'Pause (Space)', 'Pausa (Espacio)', 'إيقاف مؤقت (مسافة)'],
['Arrêter et aller à la fin', 'Stop and go to the end', 'Detener e ir al final', 'إيقاف والذهاب إلى النهاية'],
['Vitesse de lecture', 'Playback speed', 'Velocidad de reproducción', 'سرعة العرض'],
['Rapide', 'Fast', 'Rápido', 'سريع'],
['Normal', 'Normal', 'Normal', 'عادي'],
['Lent', 'Slow', 'Lento', 'بطيء'],
['Les blancs jouent', 'White to move', 'Juegan las blancas', 'دور الأبيض'],
['Les noirs jouent', 'Black to move', 'Juegan las negras', 'دور الأسود'],
['Mémoire des erreurs', 'Error memory', 'Memoria de errores', 'ذاكرة الأخطاء'],
['Temps par position', 'Time per position', 'Tiempo por posición', 'الوقت لكل وضعية'],
['Sensibilité', 'Sensitivity', 'Sensibilidad', 'الحساسية'],
['Fine (0,30)', 'Fine (0.30)', 'Fina (0,30)', 'دقيقة (0٫30)'],
['Normale (0,50)', 'Normal (0.50)', 'Normal (0,50)', 'عادية (0٫50)'],
['Grosses erreurs (1,00)', 'Big mistakes (1.00)', 'Errores graves (1,00)', 'أخطاء كبيرة (1٫00)'],
['Retenir les coups des', 'Remember the moves of', 'Recordar las jugadas de', 'احفظ حركات'],
['Blancs', 'White', 'Blancas', 'الأبيض'],
['Noirs', 'Black', 'Negras', 'الأسود'],
['Deux camps', 'Both sides', 'Ambos bandos', 'الجانبان'],
['Retenir ces coups', 'Remember these moves', 'Recordar estas jugadas', 'احفظ هذه الحركات'],
["Mémorise les coups de cette partie : le moteur les rejouera s'il retrouve les mêmes positions", 'Memorises the moves of this game: the engine will replay them if it meets the same positions', 'Memoriza las jugadas de esta partida: el motor las repetirá si encuentra las mismas posiciones', 'يحفظ حركات هذه المباراة: سيعيد المحرك لعبها إذا وجد الوضعيات نفسها'],
['Arrêter', 'Stop', 'Detener', 'إيقاف'],
['Effacer la mémoire', 'Clear memory', 'Borrar la memoria', 'مسح الذاكرة'],
['Fermer', 'Close', 'Cerrar', 'إغلاق'],
['Analyse étendue', 'Extended analysis', 'Análisis ampliado', 'تحليل موسّع'],
['Temps par coup', 'Time per move', 'Tiempo por jugada', 'الوقت لكل حركة'],
['1 s', '1 s', '1 s', '1 ث'], ['2 s', '2 s', '2 s', '2 ث'], ['4 s', '4 s', '4 s', '4 ث'], ['8 s', '8 s', '8 s', '8 ث'], ['15 s', '15 s', '15 s', '15 ث'],
['Modifier la position', 'Edit the position', 'Editar la posición', 'تعديل الوضعية'],
['Vide', 'Empty', 'Vacía', 'فارغ'],
['Pion blanc', 'White man', 'Peón blanco', 'حجر أبيض'],
['Dame blanche', 'White king', 'Dama blanca', 'ملك أبيض'],
['Pion noir', 'Black man', 'Peón negro', 'حجر أسود'],
['Dame noire', 'Black king', 'Dama negra', 'ملك أسود'],
['Vider', 'Clear', 'Vaciar', 'تفريغ'],
['Trait :', 'Side to move:', 'Turno:', 'الدور:'],
['Terminé', 'Done', 'Hecho', 'تم'],
['Moteur', 'Engine', 'Motor', 'المحرك'],
['Cliquez pour changer', 'Click to change', 'Haga clic para cambiar', 'انقر للتغيير'],
['Moteur blancs (B)', 'Engine White (B)', 'Motor blancas (B)', 'المحرك أبيض (B)'],
['Moteur noirs (N)', 'Engine Black (N)', 'Motor negras (N)', 'المحرك أسود (N)'],
['2 joueurs (J)', '2 players (J)', '2 jugadores (J)', 'لاعبان (J)'],
['Raccourci : B', 'Shortcut: B', 'Atajo: B', 'اختصار: B'], ['Raccourci : N', 'Shortcut: N', 'Atajo: N', 'اختصار: N'],
['Raccourci : J', 'Shortcut: J', 'Atajo: J', 'اختصار: J'], ['Raccourci : R', 'Shortcut: R', 'Atajo: R', 'اختصار: R'],
['Options', 'Options', 'Opciones', 'خيارات'],
['Réfléchir en continu', 'Think continuously', 'Pensar continuamente', 'التفكير المستمر'],
['Prise obligatoire automatique', 'Automatic compulsory capture', 'Captura obligatoria automática', 'الأكل الإجباري تلقائياً'],
["Afficher l'analyse", 'Show the analysis', 'Mostrar el análisis', 'عرض التحليل'],
["Utiliser le livre d'ouvertures", 'Use the opening book', 'Usar el libro de aperturas', 'استخدام كتاب الافتتاحات'],
['Son', 'Sound', 'Sonido', 'الصوت'],
['Langue :', 'Language:', 'Idioma:', 'اللغة:'],
['Raccourcis clavier : B, N, J (modes) · ← → (coup précédent/suivant) · Début / Fin · Espace (revoir la partie) · R (réflexion)', 'Keyboard shortcuts: B, N, J (modes) · ← → (previous/next move) · Home / End · Space (replay the game) · R (analysis)', 'Atajos de teclado: B, N, J (modos) · ← → (jugada anterior/siguiente) · Inicio / Fin · Espacio (repetir la partida) · R (análisis)', 'اختصارات لوحة المفاتيح: B, N, J (الأوضاع) · ← → (الحركة السابقة/التالية) · Home / End · مسافة (إعادة المباراة) · R (تحليل)'],
['Historique', 'Move list', 'Historial', 'سجل الحركات'],
['Finales', 'Endgames', 'Finales', 'النهايات'],
['Télécharger DTM 5-7 pièces', 'Download DTM 5-7 pieces', 'Descargar DTM 5-7 piezas', 'تنزيل DTM لـ 5-7 قطع'],
['Finales parfaites (~300 Mo)', 'Perfect endgames (~300 MB)', 'Finales perfectos (~300 MB)', 'نهايات مثالية (~300 ميغابايت)'],
['Télécharger WDL 6-8 pièces', 'Download WDL 6-8 pieces', 'Descargar WDL 6-8 piezas', 'تنزيل WDL لـ 6-8 قطع'],
['Gain/Nulle/Perte (~470 Mo)', 'Win/Draw/Loss (~470 MB)', 'Ganar/Tablas/Perder (~470 MB)', 'ربح/تعادل/خسارة (~470 ميغابايت)'],
['Supprimer les finales téléchargées', 'Delete downloaded endgames', 'Eliminar los finales descargados', 'حذف النهايات المنزّلة'],
['Téléchargement des finales', 'Downloading endgames', 'Descargando finales', 'تنزيل النهايات'],
['Préparation...', 'Preparing...', 'Preparando...', 'جارٍ التحضير...'],
['Annuler', 'Cancel', 'Cancelar', 'إلغاء'],
['Jouer avec :', 'Play as:', 'Jugar con:', 'العب بـ:'],
['Les deux', 'Both', 'Ambos', 'الاثنان'],
['Partie sérieuse', 'Serious game', 'Partida seria', 'مباراة جدية'],
['secondes', 'seconds', 'segundos', 'ثوانٍ'],
['OK', 'OK', 'OK', 'موافق'],
['Proposition de nulle', 'Draw offer', 'Oferta de tablas', 'عرض تعادل'],
['Le moteur propose la nulle.', 'The engine offers a draw.', 'El motor ofrece tablas.', 'يعرض المحرك التعادل.'],
['Refuser', 'Decline', 'Rechazar', 'رفض'],
['Voulez-vous vraiment abandonner la partie ?', 'Do you really want to resign?', '¿Realmente quiere abandonar la partida?', 'هل تريد فعلاً الاستسلام؟'],
['Fin de la partie', 'Game over', 'Fin de la partida', 'نهاية المباراة'],
['V :', 'W :', 'G :', 'ف :'], ['N :', 'D :', 'T :', 'ت :'], ['D :', 'L :', 'P :', 'خ :'],
['Base de parties', 'Game database', 'Base de partidas', 'قاعدة المباريات'],
['Nouvelle base', 'New database', 'Nueva base', 'قاعدة جديدة'],
['Renommer', 'Rename', 'Renombrar', 'إعادة تسمية'],
['Supprimer la base', 'Delete the database', 'Eliminar la base', 'حذف القاعدة'],
['Rechercher : joueur, événement, coups (ex. 9-13 23-19)', 'Search: player, event, moves (e.g. 9-13 23-19)', 'Buscar: jugador, evento, jugadas (p. ej. 9-13 23-19)', 'بحث: لاعب، حدث، حركات (مثال 9-13 23-19)'],
['Chercher la position du damier', 'Find the board position', 'Buscar la posición del tablero', 'ابحث عن وضعية الرقعة'],
['Trouve les parties qui passent par la position affichée sur le damier', 'Finds the games that reach the position shown on the board', 'Encuentra las partidas que pasan por la posición mostrada en el tablero', 'يجد المباريات التي تمر بالوضعية المعروضة على الرقعة'],
['Tout afficher', 'Show all', 'Mostrar todo', 'عرض الكل'],
['▶ Regarder', '▶ Watch', '▶ Ver', '▶ مشاهدة'],
['Analyser', 'Analyse', 'Analizar', 'تحليل'],
['Infos', 'Info', 'Datos', 'معلومات'],
['Déplacer', 'Move', 'Mover', 'نقل'],
['Supprimer', 'Delete', 'Eliminar', 'حذف'],
['Importer (PDN / JSON)', 'Import (PDN / JSON)', 'Importar (PDN / JSON)', 'استيراد (PDN / JSON)'],
['Exporter PDN', 'Export PDN', 'Exportar PDN', 'تصدير PDN'],
['Sauvegarde JSON', 'JSON backup', 'Copia JSON', 'نسخة JSON'],
['Aucune partie dans cette base.', 'No games in this database.', 'No hay partidas en esta base.', 'لا توجد مباريات في هذه القاعدة.'],
['Aucune partie ne correspond.', 'No matching game.', 'Ninguna partida coincide.', 'لا توجد مباراة مطابقة.'],
['Mes parties', 'My games', 'Mis partidas', 'مبارياتي'],
['⏱ Temps de la partie', '⏱ Game time', '⏱ Tiempo de la partida', '⏱ وقت المباراة'],
['Temps de la partie', 'Game time', 'Tiempo de la partida', 'وقت المباراة'],
['Pause', 'Pause', 'Pausa', 'إيقاف مؤقت'],
['Reprendre', 'Resume', 'Reanudar', 'استئناف'],
['Normal (temps total)', 'Normal (total time)', 'Normal (tiempo total)', 'عادي (الوقت الكلي)'],
['Tournoi', 'Tournament', 'Torneo', 'بطولة'],
['Temps fixe par coup', 'Fixed time per move', 'Tiempo fijo por jugada', 'وقت ثابت لكل حركة'],
['Infini', 'Infinite', 'Infinito', 'غير محدود'],
['Minutes', 'Minutes', 'Minutos', 'دقائق'],
['Secondes', 'Seconds', 'Segundos', 'ثوانٍ'],
['Ajout par coup (secondes)', 'Increment per move (seconds)', 'Incremento por jugada (segundos)', 'إضافة لكل حركة (ثوانٍ)'],
['Coups par période', 'Moves per period', 'Jugadas por periodo', 'عدد الحركات في الفترة'],
['Secondes ajoutées par coup (moteur)', 'Seconds added per move (engine)', 'Segundos añadidos por jugada (motor)', 'ثوانٍ مضافة لكل حركة (المحرك)'],
['Chaque joueur dispose de ce temps pour toute la partie (plus l\'ajout après chaque coup). Le drapeau tombe à zéro : la partie est perdue au temps.', 'Each player has this time for the whole game (plus the increment after each move). When the flag falls the game is lost on time.', 'Cada jugador dispone de este tiempo para toda la partida (más el incremento tras cada jugada). Al caer la bandera se pierde por tiempo.', 'لكل لاعب هذا الوقت لكامل المباراة (مع الإضافة بعد كل حركة). عند انتهاء الوقت تُخسر المباراة.'],
['Ce temps est donné pour le nombre de coups choisi ; il est ajouté de nouveau à chaque période.', 'This time is given for the chosen number of moves; it is added again every period.', 'Este tiempo se concede para el número de jugadas elegido; se añade de nuevo en cada periodo.', 'يُمنح هذا الوقت لعدد الحركات المختار، ويُضاف من جديد في كل فترة.'],
['Le moteur joue chaque coup en ce temps exact. Pas de limite pour vous.', 'The engine plays each move in exactly this time. No limit for you.', 'El motor juega cada jugada en este tiempo exacto. Sin límite para usted.', 'يلعب المحرك كل حركة في هذا الوقت بالضبط. بلا حدّ لك.'],
['Pas d\'horloge. Le moteur ajoute quelques secondes à chaque coup (réglage « +s/coup »).', 'No clock. The engine adds a few seconds per move (the "+s/move" setting).', 'Sin reloj. El motor añade unos segundos por jugada (ajuste «+s/jugada»).', 'بلا ساعة. يضيف المحرك بضع ثوانٍ لكل حركة (إعداد «+ث/حركة»).'],
['Les horloges démarrent au premier coup joué.', 'The clocks start with the first move.', 'Los relojes arrancan con la primera jugada.', 'تبدأ الساعات مع أول حركة.'],
['🔍 Agrandir', '🔍 Enlarge', '🔍 Ampliar', '🔍 تكبير'],
['🔍 Réduire', '🔍 Reduce', '🔍 Reducir', '🔍 تصغير'],
['🎨 Couleurs', '🎨 Colours', '🎨 Colores', '🎨 الألوان'],
['Personnaliser', 'Customise', 'Personalizar', 'تخصيص'],
['Cases claires', 'Light squares', 'Casillas claras', 'المربعات الفاتحة'],
['Cases foncées', 'Dark squares', 'Casillas oscuras', 'المربعات الداكنة'],
['Pions blancs', 'White pieces', 'Piezas blancas', 'الأحجار البيضاء'],
['Pions noirs', 'Black pieces', 'Piezas negras', 'الأحجار السوداء'],
['Marque des dames', 'King mark', 'Marca de las damas', 'علامة الملوك'],
['Style des pions', 'Piece style', 'Estilo de las piezas', 'شكل الأحجار'],
['Relief', 'Relief', 'Relieve', 'بارز'], ['Plat', 'Flat', 'Plano', 'مسطح'], ['Anneau', 'Ring', 'Anillo', 'حلقة'],
['Anneaux (photo)', 'Rings (photo)', 'Anillos (foto)', 'حلقات (صورة)'], ['Disque 3D', '3D disc', 'Disco 3D', 'قرص ثلاثي الأبعاد'],
['Jeton', 'Token', 'Ficha', 'رقاقة'], ['Bouton', 'Button', 'Botón', 'زر'], ['Gemme', 'Gem', 'Gema', 'جوهرة'], ['Verre', 'Glass', 'Vidrio', 'زجاج'],
['Numéros des cases (1-32)', 'Square numbers (1-32)', 'Números de casillas (1-32)', 'أرقام المربعات (1-32)'],
['Flèches (dernier coup / meilleur coup)', 'Arrows (last move / best move)', 'Flechas (última jugada / mejor jugada)', 'أسهم (آخر حركة / أفضل حركة)'],
['Taille du damier', 'Board size', 'Tamaño del tablero', 'حجم الرقعة'],
['Grand damier (masque les panneaux)', 'Large board (hides the panels)', 'Tablero grande (oculta los paneles)', 'رقعة كبيرة (تخفي اللوحات)'],
['Style photo', 'Photo style', 'Estilo foto', 'نمط الصورة'],
['Couleurs par défaut', 'Default colours', 'Colores por defecto', 'الألوان الافتراضية'],
['Nouvelle partie', 'New game', 'Nueva partida', 'لعبة جديدة'],
['Ouverture :', 'Opening:', 'Apertura:', 'الافتتاح:'],
['Ouverture normale', 'Normal opening', 'Apertura normal', 'افتتاح عادي'],
['Au hasard : 2 coups', 'Random: 2 moves', 'Al azar: 2 jugadas', 'عشوائي: حركتان'],
['Au hasard : 3 coups', 'Random: 3 moves', 'Al azar: 3 jugadas', 'عشوائي: 3 حركات'],
['💾 Enregistrer', '💾 Save', '💾 Guardar', '💾 حفظ'],
['✓ Enregistrée', '✓ Saved', '✓ Guardada', '✓ تم الحفظ'],
['🎥 Filmer', '🎥 Record', '🎥 Grabar', '🎥 تسجيل'],
['Enregistrer cette partie dans la base', 'Save this game to the database', 'Guardar esta partida en la base', 'احفظ هذه المباراة في القاعدة'],
['Filmer la partie en vidéo (à lancer et arrêter quand vous voulez)', 'Record the game as a video (start and stop whenever you like)', 'Grabar la partida en vídeo (inicie y pare cuando quiera)', 'سجّل المباراة كفيديو (ابدأ وأوقف متى شئت)'],
['Enregistrer automatiquement les parties', 'Save games automatically', 'Guardar las partidas automáticamente', 'حفظ المباريات تلقائيًا'],
['Blancs :', 'White:', 'Blancas:', 'الأبيض:'],
['Noirs :', 'Black:', 'Negras:', 'الأسود:'],
['Nom (facultatif)', 'Name (optional)', 'Nombre (opcional)', 'الاسم (اختياري)'],
['Vidéo : ajouter la caméra', 'Video: add the camera', 'Vídeo: añadir la cámara', 'فيديو: إضافة الكاميرا'],
['Vidéo : ajouter le micro', 'Video: add the microphone', 'Vídeo: añadir el micrófono', 'فيديو: إضافة الميكروفون'],
['Skins', 'Skins', 'Skins', 'سمات'],
['Damier', 'Board', 'Tablero', 'اللوحة'],
['Pièces', 'Pieces', 'Piezas', 'القطع'],
['Fond', 'Background', 'Fondo', 'الخلفية'],
['Flèches', 'Arrows', 'Flechas', 'الأسهم'],
['Affichage', 'Display', 'Pantalla', 'العرض'],
['Classique', 'Classic', 'Clásico', 'كلاسيكي'],
['Bois', 'Wood', 'Madera', 'خشب'],
['Marbre', 'Marble', 'Mármol', 'رخام'],
['Brillant', 'Glossy', 'Brillante', 'لامع'],
['Photo', 'Photo', 'Foto', 'صورة'],
['Nuit', 'Night', 'Noche', 'ليل'],
['Tournoi vert', 'Green tournament', 'Torneo verde', 'بطولة خضراء'],
['Tout remettre par défaut', 'Reset everything', 'Restablecer todo', 'إعادة الضبط'],
['Bois clair/foncé', 'Light/dark wood', 'Madera clara/oscura', 'خشب فاتح/داكن'],
['Bois et ébène', 'Wood and ebony', 'Madera y ébano', 'خشب وأبنوس'],
['Cadre', 'Frame', 'Marco', 'الإطار'],
['Par défaut', 'Default', 'Por defecto', 'افتراضي'],
['Couleur unie', 'Solid colour', 'Color liso', 'لون موحد'],
['Couleur du cadre', 'Frame colour', 'Color del marco', 'لون الإطار'],
['Dernier coup (case)', 'Last move (square)', 'Última jugada (casilla)', 'آخر نقلة (مربع)'],
['Case choisie', 'Selected square', 'Casilla elegida', 'المربع المحدد'],
['Couleur des numéros', 'Number colour', 'Color de los números', 'لون الأرقام'],
['Fond de la page', 'Page background', 'Fondo de la página', 'خلفية الصفحة'],
['Bois clair', 'Light wood', 'Madera clara', 'خشب فاتح'],
['Noyer', 'Walnut', 'Nogal', 'جوز'],
['Cerisier', 'Cherry', 'Cerezo', 'كرز'],
['Cèdre', 'Cedar', 'Cedro', 'أرز'],
['Ébène', 'Ebony', 'Ébano', 'أبنوس'],
['Marbre noir', 'Black marble', 'Mármol negro', 'رخام أسود'],
['Marbre vert', 'Green marble', 'Mármol verde', 'رخام أخضر'],
['Ardoise', 'Slate', 'Pizarra', 'أردواز'],
['Feutre vert', 'Green felt', 'Fieltro verde', 'لباد أخضر'],
['Nuit bleue', 'Blue night', 'Noche azul', 'ليل أزرق'],
['Ma photo', 'My photo', 'Mi foto', 'صورتي'],
['Choisir une photo…', 'Choose a photo…', 'Elegir una foto…', 'اختر صورة…'],
['La photo reste sur cet appareil.', 'The photo stays on this device.', 'La foto se queda en este dispositivo.', 'تبقى الصورة على هذا الجهاز.'],
['Dernier coup joué', 'Last move played', 'Última jugada', 'آخر نقلة'],
['Meilleur coup', 'Best move', 'Mejor jugada', 'أفضل نقلة'],
['Épaisseur', 'Thickness', 'Grosor', 'السماكة'],
['Tous résultats', 'All results', 'Todos los resultados', 'كل النتائج'],
['1-0 (blancs gagnent)', '1-0 (White wins)', '1-0 (ganan las blancas)', '1-0 (فوز الأبيض)'],
['0-1 (noirs gagnent)', '0-1 (Black wins)', '0-1 (ganan las negras)', '0-1 (فوز الأسود)'],
['½ (nulle)', '½ (draw)', '½ (tablas)', '½ (تعادل)'],
['Du', 'From', 'Desde', 'من'],
['Au', 'To', 'Hasta', 'إلى'],
['Tri : plus récentes', 'Sort: newest', 'Orden: más recientes', 'ترتيب: الأحدث'],
['Tri : plus anciennes', 'Sort: oldest', 'Orden: más antiguas', 'ترتيب: الأقدم'],
['Tri : plus longues', 'Sort: longest', 'Orden: más largas', 'ترتيب: الأطول'],
['Tri : plus courtes', 'Sort: shortest', 'Orden: más cortas', 'ترتيب: الأقصر'],
['Tri : blancs A-Z', 'Sort: White A-Z', 'Orden: blancas A-Z', 'ترتيب: الأبيض أ-ي'],
['Tri : noirs A-Z', 'Sort: Black A-Z', 'Orden: negras A-Z', 'ترتيب: الأسود أ-ي'],
['Tri : résultat', 'Sort: result', 'Orden: resultado', 'ترتيب: النتيجة'],
['Ouverture : commence par (ex. 9-13 23-19)', 'Opening: starts with (e.g. 9-13 23-19)', 'Apertura: empieza por (p. ej. 9-13 23-19)', 'الافتتاح: يبدأ بـ (مثال 9-13 23-19)'],
['Déplacer / Copier', 'Move / Copy', 'Mover / Copiar', 'نقل / نسخ'],
['☑ Sélection multiple', '☑ Multi-select', '☑ Selección múltiple', '☑ تحديد متعدد'],
['Tout sélectionner', 'Select all', 'Seleccionar todo', 'تحديد الكل'],
['Désélectionner', 'Deselect', 'Deseleccionar', 'إلغاء التحديد'],
['Statistiques', 'Statistics', 'Estadísticas', 'إحصائيات'],
['Modifier la partie', 'Edit the game', 'Modificar la partida', 'تعديل المباراة'],
['Résultat', 'Result', 'Resultado', 'النتيجة'],
['Date', 'Date', 'Fecha', 'التاريخ'],
['Événement / commentaire', 'Event / comment', 'Evento / comentario', 'الحدث / تعليق'],
['1-0 (les blancs gagnent)', '1-0 (White wins)', '1-0 (ganan las blancas)', '1-0 (فوز الأبيض)'],
['0-1 (les noirs gagnent)', '0-1 (Black wins)', '0-1 (ganan las negras)', '0-1 (فوز الأسود)'],
['½-½ (nulle)', '½-½ (draw)', '½-½ (tablas)', '½-½ (تعادل)'],
['* (inconnu / non terminée)', '* (unknown / unfinished)', '* (desconocido / sin terminar)', '* (غير معروف / غير منتهية)'],
['Déplacer ou copier', 'Move or copy', 'Mover o copiar', 'نقل أو نسخ'],
['Vers la base :', 'To database:', 'A la base:', 'إلى القاعدة:'],
['Copier', 'Copy', 'Copiar', 'نسخ'],
['Nom de la nouvelle base', 'Name of the new database', 'Nombre de la nueva base', 'اسم القاعدة الجديدة'],
['Coups les plus joués depuis la position du damier', 'Most played moves from the board position', 'Jugadas más frecuentes desde la posición del tablero', 'أكثر النقلات لعبًا من وضع اللوحة'],
['Enregistrer', 'Save', 'Guardar', 'حفظ'],
['Nom du joueur (blancs ou noirs)', 'Player name (white or black)', 'Nombre del jugador (blancas o negras)', 'اسم اللاعب (أبيض أو أسود)'],
['À propos de SAM_brk', 'About SAM_brk', 'Acerca de SAM_brk', 'حول SAM_brk'],
['Jeu de dames · analyse · base de parties', 'Draughts · analysis · game database', 'Damas · análisis · base de partidas', 'لعبة الداما · تحليل · قاعدة مباريات'],
['Dames · Damas · Checkers', 'Dames · Damas · Checkers', 'Dames · Damas · Checkers', 'Dames · Damas · Checkers'],
['Votre atelier personnel de jeu de dames.', 'Your personal draughts workshop.', 'Su taller personal de damas.', 'ورشتك الشخصية للعبة الداما.'],
["Parties et base de données jusqu'à 40 000 parties, recherche par joueur, par coups ou par position, horloges, mémoire des erreurs, analyse étendue, quatre langues, fonctionne hors connexion.", 'Games and a database of up to 40,000 games, search by player, moves or position, clocks, error memory, extended analysis, four languages, works offline.', 'Partidas y base de datos de hasta 40 000 partidas, búsqueda por jugador, jugadas o posición, relojes, memoria de errores, análisis ampliado, cuatro idiomas, funciona sin conexión.', 'مباريات وقاعدة بيانات حتى 40 000 مباراة، بحث باللاعب أو الحركات أو الوضعية، ساعات، ذاكرة الأخطاء، تحليل موسّع، أربع لغات، يعمل دون اتصال.'],
["Le moteur de calcul et les finales viennent du projet libre Torquemada. L'interface, les parties, les horloges et l'apprentissage sont propres à SAM_brk.", 'The calculation engine and endgames come from the open-source Torquemada project. The interface, games, clocks and learning are specific to SAM_brk.', 'El motor de cálculo y los finales proceden del proyecto libre Torquemada. La interfaz, las partidas, los relojes y el aprendizaje son propios de SAM_brk.', 'محرك الحساب والنهايات من مشروع Torquemada الحر. الواجهة والمباريات والساعات والتعلّم خاصة بـ SAM_brk.'],
['Détails du coup', 'Move details', 'Detalles de la jugada', 'تفاصيل الحركة'],
];

// Morceaux de phrase (messages contenant des nombres ou des noms)
const R = [
[/Les blancs gagnent/g, ['White wins', 'Ganan las blancas', 'فاز الأبيض']],
[/Les noirs gagnent/g, ['Black wins', 'Ganan las negras', 'فاز الأسود']],
[/Partie nulle/g, ['Draw', 'Tablas', 'تعادل']],
[/temps écoulé/g, ['time out', 'tiempo agotado', 'انتهى الوقت']],
[/Le moteur réfléchit\.\.\./g, ['The engine is thinking...', 'El motor está pensando...', 'المحرك يفكر...']],
[/Partie chargée/g, ['Game loaded', 'Partida cargada', 'تم تحميل المباراة']],
[/Erreur : /g, ['Error: ', 'Error: ', 'خطأ: ']],
[/(\d+) partie\(s\) importée\(s\) dans/g, ['$1 game(s) imported into', '$1 partida(s) importada(s) en', 'تم استيراد $1 مباراة في']],
[/(\d+) ignorée\(s\) \(coups illisibles\)/g, ['$1 ignored (unreadable moves)', '$1 ignorada(s) (jugadas ilegibles)', '$1 متجاهلة (حركات غير مقروءة)']],
[/(\d+) doublon\(s\) écarté\(s\)/g, ['$1 duplicate(s) skipped', '$1 duplicada(s) descartada(s)', '$1 مكررة تم تجاهلها']],
[/Import : partie (\d+) \/ (\d+)/g, ['Import: game $1 / $2', 'Importación: partida $1 / $2', 'استيراد: المباراة $1 / $2']],
[/Enregistrement dans la base…/g, ['Saving to the database…', 'Guardando en la base…', 'جارٍ الحفظ في القاعدة…']],
[/Recherche de la position : (\d+) \/ (\d+)/g, ['Searching the position: $1 / $2', 'Buscando la posición: $1 / $2', 'البحث عن الوضعية: $1 / $2']],
[/(\d+) partie\(s\) contiennent la position actuelle du damier\. Cliquez sur une partie, puis « Analyser » pour l'ouvrir à cet endroit\./g, ['$1 game(s) contain the current board position. Click a game, then "Analyse" to open it at that point.', '$1 partida(s) contienen la posición actual del tablero. Haga clic en una partida y luego en «Analizar» para abrirla en ese punto.', '$1 مباراة تحتوي الوضعية الحالية. انقر على مباراة ثم «تحليل» لفتحها عند هذه النقطة.']],
[/Aucune partie de cette base ne contient la position actuelle du damier\./g, ['No game in this database contains the current board position.', 'Ninguna partida de esta base contiene la posición actual del tablero.', 'لا توجد مباراة في هذه القاعدة تحتوي الوضعية الحالية.']],
[/(\d+) parties affichées\./g, ['$1 games shown.', '$1 partidas mostradas.', 'تم عرض $1 مباراة.']],
[/Afficher (\d+) de plus/g, ['Show $1 more', 'Mostrar $1 más', 'عرض $1 أخرى']],
[/(\d+) coups/g, ['$1 moves', '$1 jugadas', '$1 حركة']],
[/position composée/g, ['custom position', 'posición compuesta', 'وضعية مركّبة']],
[/position au coup (\d+)/g, ['position at move $1', 'posición en la jugada $1', 'الوضعية عند الحركة $1']],
[/Impossible de lire ce fichier/g, ['Cannot read this file', 'No se puede leer este archivo', 'تعذّرت قراءة هذا الملف']],
[/Formats acceptés : PDN \(\.pdn, \.txt\) ou sauvegarde SAM_brk \(\.json\)\./g, ['Accepted formats: PDN (.pdn, .txt) or SAM_brk backup (.json).', 'Formatos aceptados: PDN (.pdn, .txt) o copia SAM_brk (.json).', 'الصيغ المقبولة: PDN (‎.pdn, .txt) أو نسخة SAM_brk (‎.json).']],
[/Rien à exporter\./g, ['Nothing to export.', 'Nada que exportar.', 'لا شيء للتصدير.']],
[/(\d+) partie\(s\) exportée\(s\) au format PDN\./g, ['$1 game(s) exported in PDN format.', '$1 partida(s) exportada(s) en formato PDN.', 'تم تصدير $1 مباراة بصيغة PDN.']],
[/Sauvegarde complète : (\d+) partie\(s\), toutes bases\./g, ['Full backup: $1 game(s), all databases.', 'Copia completa: $1 partida(s), todas las bases.', 'نسخة كاملة: $1 مباراة، كل القواعد.']],
[/La base « Mes parties » ne peut pas être renommée\./g, ['The "My games" database cannot be renamed.', 'La base «Mis partidas» no se puede renombrar.', 'لا يمكن إعادة تسمية القاعدة «مبارياتي».']],
[/La base « Mes parties » ne peut pas être supprimée\./g, ['The "My games" database cannot be deleted.', 'La base «Mis partidas» no se puede eliminar.', 'لا يمكن حذف القاعدة «مبارياتي».']],
[/Base « (.+?) » créée\. Importez ou déplacez-y des parties\./g, ['Database "$1" created. Import or move games into it.', 'Base «$1» creada. Importe o mueva partidas a ella.', 'تم إنشاء القاعدة «$1». استورد مباريات أو انقلها إليها.']],
[/Nom de la nouvelle base :/g, ['Name of the new database:', 'Nombre de la nueva base:', 'اسم القاعدة الجديدة:']],
[/Nouveau nom :/g, ['New name:', 'Nuevo nombre:', 'الاسم الجديد:']],
[/Joueur des blancs :/g, ['White player:', 'Jugador de blancas:', 'لاعب الأبيض:']],
[/Joueur des noirs :/g, ['Black player:', 'Jugador de negras:', 'لاعب الأسود:']],
[/Événement \/ commentaire :/g, ['Event / comment:', 'Evento / comentario:', 'الحدث / تعليق:']],
[/Supprimer cette partie \?/g, ['Delete this game?', '¿Eliminar esta partida?', 'حذف هذه المباراة؟']],
[/Déplacer vers quelle base \? Tapez le numéro :/g, ['Move to which database? Type the number:', '¿A qué base mover? Escriba el número:', 'النقل إلى أي قاعدة؟ اكتب الرقم:']],
[/Supprimer la base « (.+?) » et ses (\d+) partie\(s\) \?/g, ['Delete the database "$1" and its $2 game(s)?', '¿Eliminar la base «$1» y sus $2 partida(s)?', 'حذف القاعدة «$1» ومبارياتها ($2)؟']],
[/Supprimer toutes les finales téléchargées \?/g, ['Delete all downloaded endgames?', '¿Eliminar todos los finales descargados?', 'حذف كل النهايات المنزّلة؟']],
[/Aucune finale enregistrée\./g, ['No endgame saved.', 'Ningún final guardado.', 'لا توجد نهايات محفوظة.']],
[/Finales supprimées\./g, ['Endgames deleted.', 'Finales eliminados.', 'تم حذف النهايات.']],
[/Téléchargement : /g, ['Download: ', 'Descarga: ', 'تنزيل: ']],
[/Mes parties/g, ['My games', 'Mis partidas', 'مبارياتي']],
[/Abandon/g, ['Resignation', 'Abandono', 'استسلام']],
[/Vous avez abandonné la partie\./g, ['You resigned the game.', 'Ha abandonado la partida.', 'لقد استسلمت.']],
[/Vous avez gagné !/g, ['You won!', '¡Ha ganado!', 'لقد فزت!']],
[/Vous avez perdu/g, ['You lost', 'Ha perdido', 'لقد خسرت']],
[/Analyse arrêtée\./g, ['Analysis stopped.', 'Análisis detenido.', 'تم إيقاف التحليل.']],
[/Analyse terminée\. Cliquez sur une ligne pour voir la flèche\./g, ['Analysis finished. Click a line to see the arrow.', 'Análisis terminado. Haga clic en una línea para ver la flecha.', 'انتهى التحليل. انقر على سطر لرؤية السهم.']],
[/Coup (\d+) \/ (\d+) : (\S+) \((\S+) s par coup\)/g, ['Move $1 / $2: $3 ($4 s per move)', 'Jugada $1 / $2: $3 ($4 s por jugada)', 'الحركة $1 / $2: $3 ($4 ث لكل حركة)']],
[/Mémoire effacée\./g, ['Memory cleared.', 'Memoria borrada.', 'تم مسح الذاكرة.']],
[/Quittez le mode édition avant\./g, ['Leave edit mode first.', 'Salga antes del modo edición.', 'اخرج من وضع التعديل أولاً.']],
[/La partie est trop courte pour apprendre quelque chose\./g, ['The game is too short to learn anything.', 'La partida es demasiado corta para aprender algo.', 'المباراة قصيرة جداً للتعلّم منها.']],
[/Terminé ! Elles seront utilisées automatiquement\./g, ['Done! They will be used automatically.', '¡Terminado! Se usarán automáticamente.', 'تم! سيتم استخدامها تلقائياً.']],
[/(\d+) coup\(s\) retenu\(s\)\. Mémoire totale : (\d+) position\(s\)\./g, ['$1 move(s) remembered. Total memory: $2 position(s).', '$1 jugada(s) recordada(s). Memoria total: $2 posición(es).', 'تم حفظ $1 حركة. الذاكرة الكلية: $2 وضعية.']],
[/Coup retenu : /g, ['Move remembered: ', 'Jugada recordada: ', 'حركة محفوظة: ']],
[/Coup joué (\S+) → mieux : (\S+)/g, ['Move played $1 → better: $2', 'Jugada hecha $1 → mejor: $2', 'الحركة المنفذة $1 ← الأفضل: $2']],
[/Analyse du coup (\d+) \/ (\d+) du moteur \((\S+) s par position\) — (\d+) erreur\(s\) trouvée\(s\)/g, ['Analysing engine move $1 / $2 ($3 s per position) — $4 mistake(s) found', 'Analizando la jugada $1 / $2 del motor ($3 s por posición) — $4 error(es) encontrado(s)', 'تحليل حركة المحرك $1 / $2 ($3 ث لكل وضعية) — $4 خطأ']],
[/Analyse arrêtée\. (\d+) erreur\(s\) retenue\(s\)\. Mémoire totale : (\d+) position\(s\)\./g, ['Analysis stopped. $1 mistake(s) kept. Total memory: $2 position(s).', 'Análisis detenido. $1 error(es) guardado(s). Memoria total: $2 posición(es).', 'توقف التحليل. تم حفظ $1 خطأ. الذاكرة الكلية: $2 وضعية.']],
[/Effacer les (\d+) position\(s\) mémorisées \?/g, ['Clear the $1 stored position(s)?', '¿Borrar las $1 posición(es) memorizadas?', 'مسح $1 وضعية محفوظة؟']],
];

const IDX = { en: 1, es: 2, ar: 3 };
const EXACT = new Map();
for (const row of D) if (!EXACT.has(row[0])) EXACT.set(row[0], row);

// Messages produits par le code (identifiants)
const M = {
    'clock.inf': { fr: 'Sans limite de temps', en: 'No time limit', es: 'Sin límite de tiempo', ar: 'بلا حدّ للوقت' },
    'clock.fixed': { fr: 'Temps fixe : {t} par coup', en: 'Fixed time: {t} per move', es: 'Tiempo fijo: {t} por jugada', ar: 'وقت ثابت: {t} لكل حركة' },
    'clock.normal': { fr: 'Partie : {m} min + {i} s/coup', en: 'Game: {m} min + {i} s/move', es: 'Partida: {m} min + {i} s/jugada', ar: 'المباراة: {m} د + {i} ث/حركة' },
    'clock.tourn': { fr: 'Tournoi : {m} min pour {n} coups', en: 'Tournament: {m} min for {n} moves', es: 'Torneo: {m} min por {n} jugadas', ar: 'بطولة: {m} د لكل {n} حركة' },
    'clock.flag': { fr: 'temps écoulé', en: 'time out', es: 'tiempo agotado', ar: 'انتهى الوقت' },
    'clock.pm': { fr: '+{s}s/coup', en: '+{s}s/move', es: '+{s}s/jugada', ar: '+{s}ث/حركة' },
};

let lang = 'fr';
const listeners = [];
export function getLang() { return lang; }
export function onLang(cb) { listeners.push(cb); }

export function t(id, vars) {
    const m = M[id]; if (!m) return id;
    let s = m[lang] || m.fr;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
}

/** Traduit un texte écrit en français. */
export function tr(text, l = lang) {
    if (l === 'fr' || !text) return text;
    const i = IDX[l];
    const trimmed = text.trim();
    if (!trimmed) return text;
    const row = EXACT.get(trimmed);
    if (row) return text.replace(trimmed, row[i]);
    let out = text, changed = false;
    for (const [re, tpl] of R) {
        re.lastIndex = 0;
        if (re.test(out)) { re.lastIndex = 0; out = out.replace(re, tpl[i - 1]); changed = true; }
    }
    return changed ? out : text;
}

// --- Application au DOM ---
const textState = new WeakMap();   // noeud texte -> {orig, shown}
const attrState = new WeakMap();   // élément -> {attr: {orig, shown}}
const ATTRS = ['title', 'placeholder'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'CANVAS', 'TEXTAREA']);

function doText(node) {
    const p = node.parentNode;
    if (!p || SKIP.has(p.nodeName)) return;
    if (p.closest && p.closest('.no-tr')) return;
    const st = textState.get(node);
    const src = (st && node.data === st.shown) ? st.orig : node.data;
    const out = tr(src);
    if (out !== node.data) { textState.set(node, { orig: src, shown: out }); node.data = out; }
    else if (st && lang === 'fr') textState.delete(node);
}
function doAttrs(el) {
    for (const a of ATTRS) {
        if (!el.hasAttribute || !el.hasAttribute(a)) continue;
        const all = attrState.get(el) || {}; const st = all[a];
        const cur = el.getAttribute(a);
        const src = (st && cur === st.shown) ? st.orig : cur;
        const out = tr(src);
        if (out !== cur) { all[a] = { orig: src, shown: out }; attrState.set(el, all); el.setAttribute(a, out); }
    }
}
function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
    doAttrs(root);
    for (let c = root.firstChild; c; c = c.nextSibling) walk(c);
}

let observer = null;
function startObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver((muts) => {
        if (lang === 'fr') {
            // rien à traduire, mais on garde l'état à jour
        }
        for (const m of muts) {
            if (m.type === 'characterData') doText(m.target);
            else if (m.type === 'attributes') doAttrs(m.target);
            else m.addedNodes.forEach(walk);
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

function wrapDialogs() {
    if (window.__i18nWrapped) return; window.__i18nWrapped = true;
    const a = window.alert.bind(window), c = window.confirm.bind(window), p = window.prompt.bind(window);
    window.alert = (m) => a(tr(String(m)));
    window.confirm = (m) => c(tr(String(m)));
    window.prompt = (m, d) => p(tr(String(m)), d);
}

export function guessLang() {
    const n = (navigator.language || 'fr').slice(0, 2).toLowerCase();
    return IDX[n] || n === 'fr' ? n : 'fr';
}

export function setLang(l) {
    if (!LANGS[l]) l = 'fr';
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    document.documentElement.lang = l;
    document.documentElement.dir = 'ltr';
    document.body && document.body.classList.toggle('lang-ar', l === 'ar');
    walk(document.documentElement);
    document.title = 'SAM_brk';
    for (const cb of listeners) { try { cb(l); } catch (e) { console.warn(e); } }
}

export function initI18n() {
    let l = null;
    try { l = localStorage.getItem(KEY); } catch (e) {}
    if (!LANGS[l]) l = guessLang();
    wrapDialogs();
    startObserver();
    setLang(l);
    return l;
}
