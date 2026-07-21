/**
 * config.js — Configuración centralizada de conexiones al backend
 * Importar este archivo antes que cualquier script que use la API o WebSocket.
 */

var BACKEND_HOST = window.location.hostname || 'localhost';
var BACKEND_PORT = '8000';

var API_URL = 'http://' + BACKEND_HOST + ':' + BACKEND_PORT;
var WS_URL  = 'ws://'  + BACKEND_HOST + ':' + BACKEND_PORT;
