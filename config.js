/**
 * config.js — Configuración centralizada de conexiones al backend
 * Importar este archivo antes que cualquier script que use la API o WebSocket.
 */

var protocol = window.location.protocol;
var isSecure = protocol === 'https:';

var BACKEND_HOST = window.location.host; 

var API_URL = protocol + '//' + BACKEND_HOST;
var WS_URL  = (isSecure ? 'wss://' : 'ws://') + BACKEND_HOST;
