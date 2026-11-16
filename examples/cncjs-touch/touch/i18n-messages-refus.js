/* Operator refusal families; every server code is assigned explicitly. */
(function(){
  'use strict';
  window.CNCTouchRefus={
  "familles": [
    [
      "flux-interrompu",
      "Suivi interrompu : reconnexion en cours…",
      "State stream lost: reconnecting…",
      "Seguimiento interrumpido: reconectando…",
      "details"
    ],
    [
      "non-connectee",
      "La machine n’est pas connectée.",
      "The machine is not connected.",
      "La máquina no está conectada.",
      "connecter"
    ],
    [
      "main-ailleurs",
      "C’est « {appareil} » qui a la main. Pause et Arrêter restent possibles ici.",
      "“{appareil}” has control. Pause and Stop remain available here.",
      "«{appareil}» tiene el control. Pausa y Parar siguen disponibles aquí.",
      "prendre-la-main"
    ],
    [
      "alarme",
      "La machine est en alarme : sa position est perdue.",
      "The machine is in alarm: its position is lost.",
      "La máquina está en alarma: ha perdido su posición.",
      "remise-en-route"
    ],
    [
      "origine-a-prendre",
      "Origine machine pas prise : la machine ne sait pas où elle est.",
      "Machine not homed: its position is unknown.",
      "Máquina sin referenciar: no sabe dónde está.",
      "prise-origine"
    ],
    [
      "reglages-non-lus",
      "La machine n’a pas encore donné ses réglages.",
      "The machine has not supplied its settings yet.",
      "La máquina aún no ha dado sus ajustes.",
      "relire"
    ],
    [
      "information-ancienne",
      "La machine ne répond plus depuis {n} s. Vérifiez qu’elle est allumée et branchée.",
      "No response from the machine for {n} s. Check power and cables.",
      "La máquina lleva {n} s sin responder. Compruebe la alimentación y los cables.",
      "details"
    ],
    [
      "confirmation-perimee",
      "La confirmation n’est plus valable. Recommencez.",
      "The confirmation is no longer valid. Start again.",
      "La confirmación ya no es válida. Repita la acción.",
      "recommencer"
    ],
    [
      "occupee",
      "La machine est occupée. Attendez la fin.",
      "The machine is busy. Wait until it finishes.",
      "La máquina está ocupada. Espere a que termine.",
      "aucun"
    ],
    [
      "usinage-en-cours",
      "Un usinage est en cours.",
      "Machining is in progress.",
      "Hay un mecanizado en curso.",
      "voir-usinage"
    ],
    [
      "broche-tourne",
      "La broche tourne : arrêtez-la d’abord.",
      "The spindle is running: stop it first.",
      "El husillo está girando: párelo primero.",
      "arreter-broche"
    ],
    [
      "depasse",
      "Le fichier dépasse de {N} mm en {axe}. Déplacez la pièce, puis refaites le zéro pièce.",
      "The file exceeds travel by {N} mm on {axe}. Move the workpiece and reset work zero.",
      "El archivo excede el recorrido {N} mm en {axe}. Mueva la pieza y repita el cero.",
      "refaire-zero",
      "choisir-fichier"
    ],
    [
      "zero-a-verifier",
      "La machine n’a pas confirmé le zéro pièce.",
      "The machine has not confirmed work zero.",
      "La máquina no ha confirmado el cero pieza.",
      "verifier-zero"
    ],
    [
      "non-verifie",
      "La course n’a pas pu être vérifiée en {axe}. Vérifiez à la main que le fichier tient.",
      "Travel could not be checked on {axe}. Check manually that the file fits.",
      "No se pudo comprobar el recorrido en {axe}. Compruebe a mano que cabe.",
      "details"
    ],
    [
      "a-recharger",
      "Aucun fichier chargé.",
      "No file loaded.",
      "Ningún archivo cargado.",
      "recharger-fichier",
      "choisir-fichier"
    ],
    [
      "pas-hors-course",
      "Ce déplacement sortirait de la machine en {axe}. Prenez un pas plus petit.",
      "This move would leave the travel on {axe}. Choose a smaller step.",
      "Este movimiento saldría del recorrido en {axe}. Elija un paso menor.",
      "aucun"
    ],
    [
      "sonde-incomplete",
      "Les réglages de la sonde ne conviennent pas : {champ}.",
      "The probe settings are unsuitable: {champ}.",
      "Los ajustes de la sonda no son válidos: {champ}.",
      "ma-sonde"
    ],
    [
      "test-contact",
      "Avant de palper : touchez le bloc avec la fraise, puis écartez-le.",
      "Before probing, touch the block with the cutter, then move it away.",
      "Antes de palpar, toque el bloque con la fresa y sepárelo.",
      "tester-sonde"
    ],
    [
      "sonde-touche",
      "La sonde touche déjà. Écartez le bloc de la fraise.",
      "The probe is already touching. Move the block away from the cutter.",
      "La sonda ya está en contacto. Separe el bloque de la fresa.",
      "pourquoi-sonde"
    ],
    [
      "sonde-rien",
      "La sonde n’a rien touché sur {recherche} mm en {axe}. Rapprochez la fraise du bloc.",
      "No contact over {recherche} mm on {axe}. Move the cutter closer to the block.",
      "Sin contacto en {recherche} mm en {axe}. Acerque la fresa al bloque.",
      "tester-sonde"
    ],
    [
      "fraise-mal-placee",
      "La fraise n’est pas dans la zone de départ. Replacez-la comme sur le dessin.",
      "The cutter is outside the starting area. Position it as shown.",
      "La fresa está fuera de la zona inicial. Colóquela como en el dibujo.",
      "dessin-depart"
    ],
    [
      "palpage-hors-course",
      "Le palpage sortirait de la machine de {N} mm en {axe}. Éloignez le bloc de ce bord.",
      "Probing would exceed travel by {N} mm on {axe}. Move the block away from that edge.",
      "El palpado excedería el recorrido {N} mm en {axe}. Aleje el bloque de ese borde.",
      "details"
    ],
    [
      "mesure-douteuse",
      "La mesure n’est pas sûre : refaites le zéro pièce. Vérifiez que le bloc ne bouge pas.",
      "The measurement is uncertain: reset work zero. Check that the block cannot move.",
      "La medida no es segura: repita el cero pieza. Compruebe que el bloque no se mueve.",
      "relancer-palpage"
    ],
    [
      "palpage-arrete",
      "Palpage arrêté. Vérifiez le zéro pièce avant de recommencer.",
      "Probing stopped. Check work zero before trying again.",
      "Palpado detenido. Compruebe el cero pieza antes de repetir.",
      "relancer-palpage"
    ],
    [
      "reprise-ligne",
      "La reprise à la ligne {N} n’est pas possible. Choisissez une autre ligne.",
      "Cannot resume at line {N}. Choose another line.",
      "No se puede reanudar en la línea {N}. Elija otra línea.",
      "changer-ligne",
      "reprendre-debut"
    ],
    [
      "reprise-impossible",
      "Ce fichier ne peut pas être repris en cours de route. Reprenez au début.",
      "This file cannot be resumed partway through. Restart from the beginning.",
      "Este archivo no permite reanudar a mitad. Empiece desde el principio.",
      "reprendre-debut"
    ],
    [
      "inconnu",
      "Action refusée.",
      "Action refused.",
      "Acción rechazada.",
      "details"
    ],
    [
      "controle-partiel",
      "Ce fichier ne peut pas être vérifié en {axe}. Vérifiez à la main qu’il tient.",
      "This file cannot be checked on {axe}. Check manually that it fits.",
      "No se puede comprobar este archivo en {axe}. Compruebe a mano que cabe.",
      "details"
    ],
    [
      "derogation-impossible",
      "Sur cette machine, on ne peut pas démarrer malgré un dépassement.",
      "This machine cannot start beyond travel limits.",
      "Esta máquina no permite arrancar fuera del recorrido.",
      "details"
    ],
    [
      "decalage-actif",
      "Un décalage est actif dans la machine : ce geste n’est pas possible.",
      "An offset is active in the machine: this action is unavailable.",
      "Hay un desplazamiento activo: esta acción no es posible.",
      "details"
    ],
    [
      "plaque-trop-bas",
      "La descente de {search} mm irait trop bas. Mettez {max} mm au plus.",
      "A {search} mm descent would be too low. Use at most {max} mm.",
      "Bajar {search} mm sería demasiado. Use {max} mm como máximo.",
      "plaque"
    ],
    [
      "type-machine",
      "Ce geste ne convient pas au type de machine déclaré.",
      "This action does not suit the declared machine type.",
      "Esta acción no corresponde al tipo de máquina declarado.",
      "type-machine"
    ],
    [
      "cadrage",
      "Le cadrage n’est pas possible.",
      "Framing is unavailable.",
      "El encuadre no es posible.",
      "details"
    ],
    [
      "fonction-inactive",
      "Cette fonction n’est pas activée sur cette tablette.",
      "This function is not enabled on this tablet.",
      "Esta función no está activada en esta tableta.",
      "details"
    ],
    [
      "vitesse",
      "La vitesse de déplacement ne convient pas.",
      "The movement speed is unsuitable.",
      "La velocidad de movimiento no es válida.",
      "vitesse"
    ],
    [
      "laser-info",
      "Vérifiez la consigne du laser dans les détails du contrôle.",
      "Check the laser setpoint in the check details.",
      "Compruebe la consigna del láser en los detalles del control.",
      "details"
    ],
    [
      "broche-max",
      "Le fichier demande {s} tr/min : la broche tournera à son maximum.",
      "The file requests {s} rpm: the spindle will run at maximum.",
      "El archivo pide {s} rpm: el husillo girará al máximo.",
      "aucun"
    ],
    [
      "silencieux",
      "Réglable seulement sur la tablette de la machine.",
      "Only adjustable on the machine tablet.",
      "Solo ajustable en la tableta de la máquina.",
      "aucun"
    ]
  ],
  "codes": {
    "ETOUCH_MACHINE_CONNECTION": "non-connectee",
    "ETOUCH_PROBE_LOST": "non-connectee",
    "ECONTROL": "main-ailleurs",
    "ETOUCH_PROBE_PILOT": "main-ailleurs",
    "ETOUCH_PROBE_CONTROL": "main-ailleurs",
    "ETOUCH_MOTION_ALARM": "alarme",
    "ETOUCH_PROBE_ALARM": "alarme",
    "ETOUCH_PROBE_RESTART": "alarme",
    "ETOUCH_CHECK_NOT_HOMED": "origine-a-prendre",
    "ETOUCH_CHECK_POSITION_UNKNOWN": "origine-a-prendre",
    "ETOUCH_CHECK_HOMING_DIRECTION": "origine-a-prendre",
    "ETOUCH_MOTION_POSITION_UNKNOWN": "origine-a-prendre",
    "ETOUCH_MOTION_AMBIGUOUS": "origine-a-prendre",
    "ETOUCH_PROBE_AMBIGUOUS": "origine-a-prendre",
    "ETOUCH_LASER_FRAME_POSITION": "origine-a-prendre",
    "ETOUCH_START_NOT_HOMED": "origine-a-prendre",
    "ETOUCH_ORIGIN_NOT_HOMED": "origine-a-prendre",
    "ETOUCH_CHECK_HOMING_SETTING": "reglages-non-lus",
    "ETOUCH_CHECK_TRAVEL_UNKNOWN": "reglages-non-lus",
    "ETOUCH_CHECK_REPORT_UNITS": "reglages-non-lus",
    "ETOUCH_MACHINE_SETTINGS_UNKNOWN": "reglages-non-lus",
    "ETOUCH_PROBE_PARAMETERS": "reglages-non-lus",
    "ETOUCH_PROBE_TRAVEL_UNKNOWN": "reglages-non-lus",
    "ETOUCH_LASER_CHECK_MAX_UNKNOWN": "reglages-non-lus",
    "ETOUCH_OFFSET_SETTINGS": "reglages-non-lus",
    "ETOUCH_MACHINE_STALE": "information-ancienne",
    "ETOUCH_PROBE_STALE": "information-ancienne",
    "ETOUCH_MACHINE_TRANSPORT": "confirmation-perimee",
    "ETOUCH_MACHINE_CONTROLLER_CHANGED": "confirmation-perimee",
    "ETOUCH_MACHINE_RESUME_MODE_CHANGED": "confirmation-perimee",
    "ETOUCH_PROBE_STREAM": "confirmation-perimee",
    "ETOUCH_PROBE_WCS": "confirmation-perimee",
    "ETOUCH_MOTION_WCS_CHANGED": "confirmation-perimee",
    "ETOUCH_LASER_FRAME_EXPIRED": "confirmation-perimee",
    "ETOUCH_LASER_FRAME_CHANGED": "confirmation-perimee",
    "ETOUCH_START_OVERRIDE_CHANGED": "confirmation-perimee",
    "ETOUCH_MOTION_STATE": "occupee",
    "ETOUCH_MOTION_HOMING": "occupee",
    "ETOUCH_MACHINE_NOT_IDLE": "occupee",
    "ETOUCH_MACHINE_BUSY": "occupee",
    "ETOUCH_SETTINGS_READING": "occupee",
    "ETOUCH_MOTION_SPINDLE_STEP": "broche-tourne",
    "ETOUCH_START_OUTSIDE": "depasse",
    "ETOUCH_TRAVEL_TOO_LOW": "depasse",
    "ETOUCH_TRAVEL_TOO_TOO_HIGH": "depasse",
    "ETOUCH_TRAVEL_TOO_BEYOND": "depasse",
    "ETOUCH_CHECK_OUTSIDE": "depasse",
    "ETOUCH_CHECK_OUTSIDE_G53": "depasse",
    "ETOUCH_OFFSET_CHECKING": "zero-a-verifier",
    "ETOUCH_OFFSET_UNCONFIRMED": "zero-a-verifier",
    "ETOUCH_OFFSET_MISMATCH": "zero-a-verifier",
    "ETOUCH_CHECK_OFFSET_UNPROVEN": "zero-a-verifier",
    "ETOUCH_CHECK_WCS_OFFSET_UNKNOWN": "zero-a-verifier",
    "ETOUCH_CHECK_ACTIVE_WCS_UNKNOWN": "zero-a-verifier",
    "ETOUCH_PROBE_OFFSET": "zero-a-verifier",
    "ETOUCH_CHECK_HOMING_DISABLED": "non-verifie",
    "ETOUCH_CHECK_REPORT_INCHES": "non-verifie",
    "ETOUCH_CHECK_UNITS_UNKNOWN": "non-verifie",
    "ETOUCH_CHECK_DISTANCE_UNKNOWN": "non-verifie",
    "ETOUCH_LASER_FRAME_NO_PROGRAM": "a-recharger",
    "ETOUCH_MOTION_STEP_OUTSIDE": "pas-hors-course",
    "ETOUCH_MOTION_EDGE": "pas-hors-course",
    "ETOUCH_PROBE_MISSING": "sonde-incomplete",
    "ETOUCH_PROBE_PARAM": "sonde-incomplete",
    "ETOUCH_PROBE_SLOW_FAST": "sonde-incomplete",
    "ETOUCH_PROBE_RETRACT": "sonde-incomplete",
    "ETOUCH_PROBE_APPROACH": "sonde-incomplete",
    "ETOUCH_PROBE_FACE_SIGN": "sonde-incomplete",
    "ETOUCH_PROBE_FEED": "sonde-incomplete",
    "ETOUCH_PROBE_TOO_SLOW": "sonde-incomplete",
    "ETOUCH_PROBE_TIMEOUT": "sonde-incomplete",
    "ETOUCH_PROBE_AXES": "sonde-incomplete",
    "ETOUCH_PROBE_CONTACT_AT_START": "sonde-touche",
    "ETOUCH_PROBE_STUCK": "sonde-touche",
    "ETOUCH_PROBE_CONTACT_STUCK": "sonde-touche",
    "ETOUCH_PROBE_NO_CONTACT": "sonde-rien",
    "ETOUCH_PROBE_WINDOW": "fraise-mal-placee",
    "ETOUCH_PROBE_DESCENT_CONTACT": "fraise-mal-placee",
    "ETOUCH_PROBE_TRAVERSE_CONTACT": "fraise-mal-placee",
    "ETOUCH_PROBE_START_CLOSE": "fraise-mal-placee",
    "ETOUCH_PROBE_TRAVEL": "palpage-hors-course",
    "ETOUCH_PROBE_MISMATCH": "mesure-douteuse",
    "ETOUCH_PROBE_PRB": "mesure-douteuse",
    "ETOUCH_PROBE_POSITION": "mesure-douteuse",
    "ETOUCH_PROBE_WRITE": "mesure-douteuse",
    "ETOUCH_PROBE_WRITE_UNCERTAIN": "mesure-douteuse",
    "ETOUCH_PROBE_ERROR": "mesure-douteuse",
    "ETOUCH_PROBE_STOPPED": "palpage-arrete",
    "ETOUCH_PROBE_PAUSED": "palpage-arrete",
    "ETOUCH_PLATE_STREAM": "palpage-arrete",
    "ETOUCH_PLATE_CONTROL": "palpage-arrete",
    "ETOUCH_PLATE_STALE": "palpage-arrete",
    "ETOUCH_PLATE_TIMEOUT": "palpage-arrete",
    "ETOUCH_RESUME_LINE": "reprise-ligne",
    "ETOUCH_RESUME_POSITION": "reprise-ligne",
    "ETOUCH_RESUME_CLEARANCE": "reprise-ligne",
    "ETOUCH_RESUME_NO_RAPID_Z": "reprise-ligne",
    "ETOUCH_RESUME_FEED": "reprise-ligne",
    "ETOUCH_RESUME_SPINDLE_SPEED": "reprise-ligne",
    "ETOUCH_RESUME_WCS_POSITION": "reprise-ligne",
    "ETOUCH_RESUME_FIRST_LINE": "reprise-ligne",
    "ETOUCH_RESUME_FIRST_EXPRESSION": "reprise-ligne",
    "ETOUCH_RESUME_PROGRAM_END": "reprise-ligne",
    "ETOUCH_RESUME_DISTANCE_BEFORE": "reprise-ligne",
    "ETOUCH_LASER_RESUME_NOT_RAPID": "reprise-ligne",
    "ETOUCH_LASER_RESUME_NOT_NOT_BOUNDARY": "reprise-ligne",
    "ETOUCH_LASER_RESUME_NOT_POSITION": "reprise-ligne",
    "ETOUCH_LASER_RESUME_NOT_S_UNKNOWN": "reprise-ligne",
    "ETOUCH_RESUME_ORIGIN_CHANGED": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_EXPRESSION": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_INVERSE_TIME": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_CUTTER_COMPENSATION": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_TOOL_LENGTH": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_UNITS_LATE": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_RELATIVE": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_G49_AXIS": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_PLANE": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_UNSUPPORTED_SYNTAX": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_FEED_PRECISION": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_TOOL_OFFSET": "reprise-impossible",
    "ETOUCH_RESUME_ORIGIN_DISTANCE": "reprise-impossible",
    "ETOUCH_LASER_RESUME_Z_VARIES": "reprise-impossible",
    "ETOUCH_LASER_NO_CNC_RESUME": "reprise-impossible",
    "ETOUCH_START_FEED_MODE": "reprise-impossible",
    "ETOUCH_MACHINE_OPERATION": "inconnu",
    "ETOUCH_CHECK_ARC_FROM_UNKNOWN": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_ARC_PLANE": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_ARC_RADIUS": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_AXIS_IDLE": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_DYNAMIC_TLO": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_MACRO": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_NO_MOTION_MODE": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_ORIGIN_CHANGE": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_PROBE": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_RELATIVE_FROM_UNKNOWN": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_RELATIVE_START": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_RETURN_INTERMEDIATE": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_UNINTERPRETED": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_UNITS_LATE": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_WCS_CHANGE": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_SYNTAX": "controle-partiel",
    "ETOUCH_CHECK_ARC_FROM_TLO_CANCEL": "controle-partiel",
    "ETOUCH_START_NO_OVERRIDE": "derogation-impossible",
    "ETOUCH_PROBE_G92": "decalage-actif",
    "ETOUCH_PROBE_TLO": "decalage-actif",
    "ETOUCH_ORIGIN_OFFSETS": "decalage-actif",
    "ETOUCH_PLATE_TRAVEL": "plaque-trop-bas",
    "ETOUCH_MACHINE_LASER_MODE_ON": "type-machine",
    "ETOUCH_MACHINE_LASER_MODE_LASER_MODE_OFF": "type-machine",
    "ETOUCH_MACHINE_LASER_MODE_AMBIGUOUS": "type-machine",
    "ETOUCH_MACHINE_LASER_MODE_KIND_INVALID": "type-machine",
    "ETOUCH_MACHINE_LASER_MODE_NOT_ASSOCIATED": "type-machine",
    "ETOUCH_MACHINE_LASER_MODE_STORE": "type-machine",
    "ETOUCH_LASER_NOT_LASER": "type-machine",
    "ETOUCH_LASER_NO_PLATE_PROBE": "type-machine",
    "ETOUCH_LASER_NO_PLATE_NO_SPINDLE_TEST": "type-machine",
    "ETOUCH_LASER_NO_PLATE_NO_TOOL_CHANGE": "type-machine",
    "ETOUCH_LASER_FRAME_BOUNDS": "cadrage",
    "ETOUCH_LASER_FRAME_CHECK": "cadrage",
    "ETOUCH_LASER_FRAME_WCS": "cadrage",
    "ETOUCH_MOTION_DISABLED": "fonction-inactive",
    "ETOUCH_LASER_FRAME_DISABLED": "fonction-inactive",
    "ETOUCH_MOTION_STEP_SLOW": "vitesse",
    "ETOUCH_LASER_FRAME_SLOW": "vitesse",
    "ETOUCH_LASER_FRAME_FEED": "vitesse",
    "ETOUCH_LASER_CHECK_M3": "laser-info",
    "ETOUCH_LASER_CHECK_M4": "laser-info",
    "ETOUCH_LASER_CHECK_NO_M3_M4": "laser-info",
    "ETOUCH_LASER_CHECK_S_ABOVE_MAX": "laser-info",
    "ETOUCH_CHECK_S_ABOVE_MAX": "broche-max",
    "ETOUCH_BACKLIGHT_REMOTE": "silencieux",
    "ETOUCH_RESUME_EXPRESSION": "reprise-impossible",
    "ETOUCH_RESUME_INVERSE_TIME": "reprise-impossible",
    "ETOUCH_RESUME_CUTTER_COMPENSATION": "reprise-impossible",
    "ETOUCH_RESUME_TOOL_LENGTH": "reprise-impossible",
    "ETOUCH_RESUME_UNITS_LATE": "reprise-impossible",
    "ETOUCH_RESUME_RELATIVE": "reprise-impossible",
    "ETOUCH_CHECK_RELATIVE_START": "controle-partiel",
    "ETOUCH_CHECK_AXIS_IDLE": "controle-partiel",
    "ETOUCH_CHECK_MACRO": "controle-partiel",
    "ETOUCH_CHECK_UNINTERPRETED": "controle-partiel",
    "ETOUCH_CHECK_UNITS_LATE": "controle-partiel",
    "ETOUCH_CHECK_WCS_CHANGE": "controle-partiel",
    "ETOUCH_CHECK_ORIGIN_CHANGE": "controle-partiel",
    "ETOUCH_CHECK_DYNAMIC_TLO": "controle-partiel",
    "ETOUCH_CHECK_PROBE": "controle-partiel",
    "ETOUCH_CHECK_RETURN_INTERMEDIATE": "controle-partiel",
    "ETOUCH_CHECK_NO_MOTION_MODE": "controle-partiel",
    "ETOUCH_CHECK_RELATIVE_FROM_UNKNOWN": "controle-partiel",
    "ETOUCH_CHECK_ARC_PLANE": "controle-partiel",
    "ETOUCH_CHECK_ARC_RADIUS": "controle-partiel",
    "ETOUCH_START_OVERRIDE_UNSAFE": "derogation-impossible",
    "ETOUCH_MACHINE_LASER_MODE_OFF": "type-machine",
    "ETOUCH_LASER_NO_TOOL_CHANGE": "type-machine",
    "ETOUCH_MACHINE_AMBIGUOUS": "type-machine",
    "ETOUCH_MACHINE_KIND_INVALID": "type-machine",
    "ETOUCH_MACHINE_NOT_ASSOCIATED": "type-machine",
    "ETOUCH_MACHINE_STORE": "type-machine",
    "ETOUCH_LASER_NO_SPINDLE_TEST": "type-machine",
    "ETOUCH_CHECK_SYNTAX": "controle-partiel",
    "ETOUCH_TRAVEL_BEYOND": "depasse",
    "ETOUCH_TRAVEL_TOO_HIGH": "depasse",
    "ETOUCH_CHECK_TLO_CANCEL": "controle-partiel",
    "ETOUCH_RESUME_FEED_PRECISION": "reprise-impossible",
    "ETOUCH_RESUME_TOOL_OFFSET": "reprise-impossible",
    "ETOUCH_LASER_RESUME_NOT_BOUNDARY": "reprise-ligne",
    "ETOUCH_LASER_RESUME_POSITION": "reprise-ligne",
    "ETOUCH_LASER_RESUME_S_UNKNOWN": "reprise-ligne",
    "ETOUCH_RESUME_G49_AXIS": "reprise-impossible",
    "ETOUCH_RESUME_UNSUPPORTED_SYNTAX": "reprise-impossible",
    "ETOUCH_RESUME_PLANE": "reprise-impossible",
    "ETOUCH_RESUME_DISTANCE": "reprise-impossible"
  }
};
  window.CNCTouchMessages=(window.CNCTouchMessages||[]).concat([
  [
    "La machine n’est pas connectée.",
    "The machine is not connected.",
    "La máquina no está conectada."
  ],
  [
    "C’est « {appareil} » qui a la main. Pause et Arrêter restent possibles ici.",
    "“{appareil}” has control. Pause and Stop remain available here.",
    "«{appareil}» tiene el control. Pausa y Parar siguen disponibles aquí."
  ],
  [
    "La machine est en alarme : sa position est perdue.",
    "The machine is in alarm: its position is lost.",
    "La máquina está en alarma: ha perdido su posición."
  ],
  [
    "Origine machine pas prise : la machine ne sait pas où elle est.",
    "Machine not homed: its position is unknown.",
    "Máquina sin referenciar: no sabe dónde está."
  ],
  [
    "La machine n’a pas encore donné ses réglages.",
    "The machine has not supplied its settings yet.",
    "La máquina aún no ha dado sus ajustes."
  ],
  [
    "La machine ne répond plus depuis {n} s. Vérifiez qu’elle est allumée et branchée.",
    "No response from the machine for {n} s. Check power and cables.",
    "La máquina lleva {n} s sin responder. Compruebe la alimentación y los cables."
  ],
  [
    "La confirmation n’est plus valable. Recommencez.",
    "The confirmation is no longer valid. Start again.",
    "La confirmación ya no es válida. Repita la acción."
  ],
  [
    "La machine est occupée. Attendez la fin.",
    "The machine is busy. Wait until it finishes.",
    "La máquina está ocupada. Espere a que termine."
  ],
  [
    "Un usinage est en cours.",
    "Machining is in progress.",
    "Hay un mecanizado en curso."
  ],
  [
    "La broche tourne : arrêtez-la d’abord.",
    "The spindle is running: stop it first.",
    "El husillo está girando: párelo primero."
  ],
  [
    "Le fichier dépasse de {N} mm en {axe}. Déplacez la pièce, puis refaites le zéro pièce.",
    "The file exceeds travel by {N} mm on {axe}. Move the workpiece and reset work zero.",
    "El archivo excede el recorrido {N} mm en {axe}. Mueva la pieza y repita el cero."
  ],
  [
    "La machine n’a pas confirmé le zéro pièce.",
    "The machine has not confirmed work zero.",
    "La máquina no ha confirmado el cero pieza."
  ],
  [
    "La course n’a pas pu être vérifiée en {axe}. Vérifiez à la main que le fichier tient.",
    "Travel could not be checked on {axe}. Check manually that the file fits.",
    "No se pudo comprobar el recorrido en {axe}. Compruebe a mano que cabe."
  ],
  [
    "Ce déplacement sortirait de la machine en {axe}. Prenez un pas plus petit.",
    "This move would leave the travel on {axe}. Choose a smaller step.",
    "Este movimiento saldría del recorrido en {axe}. Elija un paso menor."
  ],
  [
    "Les réglages de la sonde ne conviennent pas : {champ}.",
    "The probe settings are unsuitable: {champ}.",
    "Los ajustes de la sonda no son válidos: {champ}."
  ],
  [
    "Avant de palper : touchez le bloc avec la fraise, puis écartez-le.",
    "Before probing, touch the block with the cutter, then move it away.",
    "Antes de palpar, toque el bloque con la fresa y sepárelo."
  ],
  [
    "La sonde touche déjà. Écartez le bloc de la fraise.",
    "The probe is already touching. Move the block away from the cutter.",
    "La sonda ya está en contacto. Separe el bloque de la fresa."
  ],
  [
    "La sonde n’a rien touché sur {recherche} mm en {axe}. Rapprochez la fraise du bloc.",
    "No contact over {recherche} mm on {axe}. Move the cutter closer to the block.",
    "Sin contacto en {recherche} mm en {axe}. Acerque la fresa al bloque."
  ],
  [
    "La fraise n’est pas dans la zone de départ. Replacez-la comme sur le dessin.",
    "The cutter is outside the starting area. Position it as shown.",
    "La fresa está fuera de la zona inicial. Colóquela como en el dibujo."
  ],
  [
    "Le palpage sortirait de la machine de {N} mm en {axe}. Éloignez le bloc de ce bord.",
    "Probing would exceed travel by {N} mm on {axe}. Move the block away from that edge.",
    "El palpado excedería el recorrido {N} mm en {axe}. Aleje el bloque de ese borde."
  ],
  [
    "La mesure n’est pas sûre : refaites le zéro pièce. Vérifiez que le bloc ne bouge pas.",
    "The measurement is uncertain: reset work zero. Check that the block cannot move.",
    "La medida no es segura: repita el cero pieza. Compruebe que el bloque no se mueve."
  ],
  [
    "Palpage arrêté. Vérifiez le zéro pièce avant de recommencer.",
    "Probing stopped. Check work zero before trying again.",
    "Palpado detenido. Compruebe el cero pieza antes de repetir."
  ],
  [
    "La reprise à la ligne {N} n’est pas possible. Choisissez une autre ligne.",
    "Cannot resume at line {N}. Choose another line.",
    "No se puede reanudar en la línea {N}. Elija otra línea."
  ],
  [
    "Ce fichier ne peut pas être repris en cours de route. Reprenez au début.",
    "This file cannot be resumed partway through. Restart from the beginning.",
    "Este archivo no permite reanudar a mitad. Empiece desde el principio."
  ],
  [
    "Action refusée.",
    "Action refused.",
    "Acción rechazada."
  ],
  [
    "Ce fichier ne peut pas être vérifié en {axe}. Vérifiez à la main qu’il tient.",
    "This file cannot be checked on {axe}. Check manually that it fits.",
    "No se puede comprobar este archivo en {axe}. Compruebe a mano que cabe."
  ],
  [
    "Sur cette machine, on ne peut pas démarrer malgré un dépassement.",
    "This machine cannot start beyond travel limits.",
    "Esta máquina no permite arrancar fuera del recorrido."
  ],
  [
    "Un décalage est actif dans la machine : ce geste n’est pas possible.",
    "An offset is active in the machine: this action is unavailable.",
    "Hay un desplazamiento activo: esta acción no es posible."
  ],
  [
    "La descente de {search} mm irait trop bas. Mettez {max} mm au plus.",
    "A {search} mm descent would be too low. Use at most {max} mm.",
    "Bajar {search} mm sería demasiado. Use {max} mm como máximo."
  ],
  [
    "Ce geste ne convient pas au type de machine déclaré.",
    "This action does not suit the declared machine type.",
    "Esta acción no corresponde al tipo de máquina declarado."
  ],
  [
    "Le cadrage n’est pas possible.",
    "Framing is unavailable.",
    "El encuadre no es posible."
  ],
  [
    "Cette fonction n’est pas activée sur cette tablette.",
    "This function is not enabled on this tablet.",
    "Esta función no está activada en esta tableta."
  ],
  [
    "La vitesse de déplacement ne convient pas.",
    "The movement speed is unsuitable.",
    "La velocidad de movimiento no es válida."
  ],
  [
    "Vérifiez la consigne du laser dans les détails du contrôle.",
    "Check the laser setpoint in the check details.",
    "Compruebe la consigna del láser en los detalles del control."
  ],
  [
    "Le fichier demande {s} tr/min : la broche tournera à son maximum.",
    "The file requests {s} rpm: the spindle will run at maximum.",
    "El archivo pide {s} rpm: el husillo girará al máximo."
  ],
  [
    "Réglable seulement sur la tablette de la machine.",
    "Only adjustable on the machine tablet.",
    "Solo ajustable en la tableta de la máquina."
  ],
  [
    "La machine vérifie le zéro pièce. Attendez quelques secondes.",
    "The machine is checking work zero. Wait a few seconds.",
    "La máquina está comprobando el cero pieza. Espere unos segundos."
  ],
  [
    "La machine n’applique pas le zéro pièce enregistré. Refaites-le.",
    "The machine is not applying the saved work zero. Set it again.",
    "La máquina no aplica el cero pieza guardado. Repítalo."
  ],
  [
    "Le fichier descend {N} mm trop bas. Relevez la pièce, puis refaites le zéro Z.",
    "The file goes {N} mm too low. Raise the workpiece, then reset Z zero.",
    "El archivo baja {N} mm demasiado. Eleve la pieza y repita el cero Z."
  ],
  [
    "Le fichier monte {N} mm trop haut. Abaissez la pièce, puis refaites le zéro Z.",
    "The file goes {N} mm too high. Lower the workpiece, then reset Z zero.",
    "El archivo sube {N} mm demasiado. Baje la pieza y repita el cero Z."
  ],
  [
    "autre appareil",
    "another device",
    "otro dispositivo"
  ],
  [
    "Code",
    "Code",
    "Código"
  ],
  [
    "Message",
    "Message",
    "Mensaje"
  ]
]);
})();
