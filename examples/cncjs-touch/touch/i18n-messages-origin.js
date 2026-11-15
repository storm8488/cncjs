// Source phrase, English, Spanish: rows appended to i18n-messages.js (loaded before i18n.js).
// Visual origin in Préparer (Performance UI, lot O): origin-preview.js.
(window.CNCTouchMessages=window.CNCTouchMessages||[]).push(
['Où le programme se placera','Where the program will be placed','Dónde se colocará el programa'],
['Affichage seulement : rien n’est envoyé, aucune origine n’est posée.','Display only: nothing is sent, no origin is set.','Solo visualización: no se envía nada, no se fija ningún origen.'],
['Gris : origine actuelle (G54)','Grey: current origin (G54)','Gris: origen actual (G54)'],
['Bleu : si l’origine X Y est posée ici','Blue: if the X Y origin is set here','Azul: si el origen X Y se fija aquí'],
['Cadre : course machine ($130–$132)','Frame: machine travel ($130–$132)','Marco: recorrido de la máquina ($130–$132)'],
['Si l’origine X Y est posée ici : dans la course machine en X et Y (estimation de la tablette ; Z non vérifié).','If the X Y origin is set here: inside the machine travel in X and Y (tablet estimate; Z not checked).','Si el origen X Y se fija aquí: dentro del recorrido de la máquina en X e Y (estimación de la tableta; Z no comprobado).'],
['Si l’origine X Y est posée ici : hors course en ','If the X Y origin is set here: outside the travel in ','Si el origen X Y se fija aquí: fuera del recorrido en '],
['Course non vérifiable : ','Travel cannot be checked: ','Recorrido no comprobable: '],
['Origine actuelle : ','Current origin: ','Origen actual: '],
['Aucun programme chargé : rien à placer.','No program loaded: nothing to place.','Ningún programa cargado: nada que colocar.'],
['Aperçu sans parcours 3D : régénérez-le dans Fichiers.','Preview without a 3D toolpath: regenerate it in Files.','Vista previa sin trayectoria 3D: regenérela en Archivos.'],
['. Le contrôle de course reste au chargement et au démarrage.','. The travel check still runs at loading and at start.','. La comprobación de recorrido se sigue haciendo al cargar y al iniciar.'],
['Travail en cours : aperçu d’origine suspendu.','Job running: origin preview suspended.','Trabajo en curso: vista previa del origen suspendida.'],
['Travail en pause : aperçu d’origine suspendu.','Job paused: origin preview suspended.','Trabajo en pausa: vista previa del origen suspendida.'],
['Alarme : position machine non garantie, aperçu d’origine suspendu.','Alarm: machine position not guaranteed, origin preview suspended.','Alarma: posición de la máquina no garantizada, vista previa del origen suspendida.'],
['État machine indisponible : aperçu figé.','Machine state unavailable: preview frozen.','Estado de la máquina no disponible: vista previa congelada.'],
['contexte WebGL perdu','WebGL context lost','contexto WebGL perdido'],
["sens de prise d’origine inversé ($23) : selon la compilation du firmware, la course est [−$13x, 0] ou [0, $13x].","axis homing the other way ($23): depending on the firmware build, the travel is [−$13x, 0] or [0, $13x].","eje con referencia en sentido contrario ($23): según la compilación del firmware, el recorrido es [−$13x, 0] o [0, $13x]."]
);

// Zero piece, manual and machine-origin zeros (L3a).
(window.CNCTouchMessages=window.CNCTouchMessages||[]).push(
["Position pièce","Work position","Posición de la pieza"],
["Déplacer","Move","Mover"],
["Zéro X ici","Zero X here","Cero X aquí"],
["Zéro Y ici","Zero Y here","Cero Y aquí"],
["Zéro Z ici","Zero Z here","Cero Z aquí"],
["Zéro XYZ ici","Zero XYZ here","Cero XYZ aquí"],
["Zéro XY ici","Zero XY here","Cero XY aquí"],
["Autres zéros…","Other zeros…","Otros ceros…"],
["Autres zéros","Other zeros","Otros ceros"],
["Position machine","Machine position","Posición de máquina"],
["Zéro {axes} ici","Zero {axes} here","Cero {axes} aquí"],
["Zéro {axes} à l’origine machine","{axes} zero at machine origin","Cero {axes} en el origen de máquina"],
["Poser le zéro {axes} ici","Set {axes} zero here","Fijar el cero {axes} aquí"],
["Mettre le zéro {axes} à l’origine machine","Set {axes} zero at machine origin","Fijar el cero {axes} en el origen de máquina"],
["Le zéro {axes} de la pièce sera l’origine de la machine. ","The workpiece {axes} zero will be at the machine origin. ","El cero {axes} de la pieza será el origen de máquina. "],
["pièce : ","workpiece: ","pieza: "],
["Le zéro de cet axe est placé à l’origine de la machine. Aucun axe ne bouge.","The zero of this axis is set at the machine origin. No axis moves.","El cero de este eje se fija en el origen de máquina. Ningún eje se mueve."],
["{axe} à l’origine machine","{axe} at machine origin","{axe} en el origen de máquina"],
["Origine machine pas prise.","Machine not homed.","Máquina sin referenciar."],
["Origine machine pas prise : 1 mm au plus, sans continu.","Machine not homed: 1 mm maximum, no continuous jog.","Máquina sin referenciar: 1 mm como máximo, sin movimiento continuo."],
["Zéro {axes} posé. Aucun axe ne bouge.","{axes} zero set. No axis moves.","Cero {axes} fijado. Ningún eje se mueve."],
["Amenez le point du laser sur le coin de la pièce, puis touchez Zéro XY ici.","Move the laser spot to the workpiece corner, then tap Zero XY here.","Lleve el punto láser a la esquina de la pieza y toque Cero XY aquí."],
["Un laser n’a pas de palpage.","A laser has no probing.","Un láser no tiene sondeo."],
["CNC ou laser ? Déclarez la machine.","CNC or laser? Declare the machine.","¿CNC o láser? Declare la máquina."],
["Posé à {heure}","Set at {heure}","Fijado a las {heure}"],
["à la main : {axes}","by hand: {axes}","a mano: {axes}"],
["bloc {axes}","block {axes}","bloque {axes}"],
["plaque : Z seul","plate: Z only","placa: solo Z"]
);
(window.CNCTouchMessages=window.CNCTouchMessages||[]).push(['La machine a refusé le déplacement (erreur {n}).','The machine refused the move (error {n}).','La máquina rechazó el movimiento (error {n}).']);
