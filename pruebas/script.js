// ── Estado global ──────────────────────────────────────────
// API_URL y WS_URL provienen de /config.js
var alertasData = [];
var editingId   = null;   // null = modo crear, número = modo editar

// ── Referencias DOM ────────────────────────────────────────
var container      = document.getElementById('alertsContainer');
var emptyState     = document.getElementById('emptyState');
var statusBadge    = document.getElementById('connectionStatus');
var statusText     = statusBadge.querySelector('span');
var totalCounter   = document.getElementById('totalCounter');

var modalOverlay   = document.getElementById('modalOverlay');
var modalTitle     = document.getElementById('modalTitle');
var formAlerta     = document.getElementById('formAlerta');
var formMsg        = document.getElementById('formMsg');
var btnGuardar     = document.getElementById('btnGuardar');
var btnGuardarText = document.getElementById('btnGuardarText');

// ── Mapa Leaflet ───────────────────────────────────────────
var pickMap     = null;
var pickMarker  = null;
var mapVisible  = false;
var capaGeoServerPruebas = null;

function initMap() {
    if (pickMap) return; // ya inicializado
    pickMap = L.map('pickMap').setView([-1.6669, -78.6521], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(pickMap);


    pickMap.on('click', function(e) {
        var lat = e.latlng.lat;
        var lng = e.latlng.lng;

        document.getElementById('latitud').value  = lat.toFixed(6);
        document.getElementById('longitud').value = lng.toFixed(6);
        document.getElementById('mapHint').textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);

        if (pickMarker) {
            pickMarker.setLatLng(e.latlng);
        } else {
            pickMarker = L.marker(e.latlng, { draggable: true }).addTo(pickMap);
            pickMarker.on('dragend', function(ev) {
                var pos = ev.target.getLatLng();
                document.getElementById('latitud').value  = pos.lat.toFixed(6);
                document.getElementById('longitud').value = pos.lng.toFixed(6);
                document.getElementById('mapHint').textContent = pos.lat.toFixed(5) + ', ' + pos.lng.toFixed(5);
            });
        }
    });
}

function toggleMap() {
    var mapContainer = document.getElementById('mapContainer');
    var btnToggle    = document.getElementById('btnToggleMap');
    mapVisible = !mapVisible;

    if (mapVisible) {
        mapContainer.classList.remove('hidden');
        btnToggle.classList.add('active');
        initMap();
        // Forzar redibujado del mapa (necesario cuando el contenedor estaba oculto)
        setTimeout(function() { pickMap.invalidateSize(); }, 150);

        // Si ya hay coordenadas escritas, centrar el mapa allí
        var lat = parseFloat(document.getElementById('latitud').value);
        var lng = parseFloat(document.getElementById('longitud').value);
        if (!isNaN(lat) && !isNaN(lng)) {
            pickMap.setView([lat, lng], 15);
            if (pickMarker) {
                pickMarker.setLatLng([lat, lng]);
            } else {
                pickMarker = L.marker([lat, lng], { draggable: true }).addTo(pickMap);
                pickMarker.on('dragend', function(ev) {
                    var pos = ev.target.getLatLng();
                    document.getElementById('latitud').value  = pos.lat.toFixed(6);
                    document.getElementById('longitud').value = pos.lng.toFixed(6);
                    document.getElementById('mapHint').textContent = pos.lat.toFixed(5) + ', ' + pos.lng.toFixed(5);
                });
            }
        }
    } else {
        mapContainer.classList.add('hidden');
        btnToggle.classList.remove('active');
    }
}

function resetMap() {
    if (pickMap && pickMarker) {
        pickMap.removeLayer(pickMarker);
        pickMarker = null;
    }
    var mapContainer = document.getElementById('mapContainer');
    mapContainer.classList.add('hidden');
    document.getElementById('btnToggleMap').classList.remove('active');
    document.getElementById('mapHint').textContent = '';
    mapVisible = false;
}

// ── Helpers ─────────────────────────────────────────────────
function setConnected(ok) {
    if (ok) {
        statusBadge.classList.remove('disconnected');
        statusText.textContent = 'En vivo';
    } else {
        statusBadge.classList.add('disconnected');
        statusText.textContent = 'Desconectado';
    }
}

function formatTime(ts) {
    if (!ts) return '--:--';
    // fecha_hora es timestamp: '2026-07-09 00:03:19.770753+00:00'
    var match = ts.match(/(\d{2}:\d{2})/);
    return match ? match[1] : '--:--';
}

function formatDate(ts) {
    if (!ts) return '';
    var match = ts.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return '';
    return match[3] + '/' + match[2] + '/' + match[1];
}

// ── Renderizar cards ─────────────────────────────────────────
function renderAlerts(alerts) {
    if (JSON.stringify(alerts) === JSON.stringify(alertasData)) return;
    alertasData = alerts;
    totalCounter.textContent = 'Total: ' + alerts.length + ' alertas';

    if (alerts.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyState);
        return;
    }

    container.innerHTML = '';

    for (var i = 0; i < alerts.length; i++) {
        var a = alerts[i];

        var locText = 'Ubicación no disponible';
        if (a.latitud && a.longitud) {
            locText = parseFloat(a.latitud).toFixed(4) + ', ' + parseFloat(a.longitud).toFixed(4);
        }

        var iconColor =
            (a.tipo_reporte && a.tipo_reporte.toLowerCase().indexOf('robo') !== -1)       ? 'var(--warning-color)' :
            (a.tipo_reporte && a.tipo_reporte.toLowerCase().indexOf('emergencia') !== -1)  ? 'var(--danger-color)'  :
            'var(--accent-color)';

        var card = document.createElement('div');
        card.className = 'alert-card';
        card.dataset.id = a.id;
        card.innerHTML =
            '<div class="card-header">' +
                '<div class="event-type">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="' + iconColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' +
                    (a.tipo_reporte || 'Alerta') +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:0.5rem;">' +
                    '<div class="event-time">' +
                        '<div class="time-main">' + formatTime(a.fecha_hora) + '</div>' +
                        '<div class="time-date">' + formatDate(a.fecha_hora) + '</div>' +
                    '</div>' +
                    '<button class="btn-edit-card" title="Editar alerta" data-id="' + a.id + '">' +
                        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="card-body">' +
                '<div class="description">' + (a.descripcion || 'Sin descripción.') + '</div>' +
                '<div class="info-grid">' +
                    '<div class="info-item"><span class="info-label">Afectado</span><span class="info-value">' + (a.nombres || '') + ' ' + (a.apellidos || '') + '</span></div>' +
                    '<div class="info-item"><span class="info-label">Contacto</span><span class="info-value">' + (a.celular || 'No registrado') + '</span></div>' +
                    '<div class="info-item"><span class="info-label">Cédula</span><span class="info-value">' + (a.cedula || 'N/A') + '</span></div>' +
                    '<div class="info-item"><span class="info-label">Emergencia</span><span class="info-value">' + (a.celular_contacto_emergencia || 'N/A') + '</span></div>' +
                '</div>' +
            '</div>' +
            '<div class="card-footer">' +
                '<div class="location-badge">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>' +
                    locText +
                '</div>' +
                '<div class="card-id">ID: #' + a.id + '</div>' +
            '</div>';

        container.appendChild(card);
    }

    // Delegación de eventos para botones de editar
    container.querySelectorAll('.btn-edit-card').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = parseInt(btn.dataset.id);
            var alerta = alertasData.find(function(x) { return x.id === id; });
            if (alerta) openEditModal(alerta);
        });
    });
}

// ── Abrir modal en modo editar ────────────────────────────────
function openEditModal(a) {
    editingId = a.id;
    modalTitle.textContent = 'Editar Alerta #' + a.id;
    btnGuardarText.textContent = 'Guardar Cambios';

    modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Rellenar campos
    document.getElementById('tipo_evento').value        = a.tipo_evento || '';
    document.getElementById('fecha').value              = a.fecha || '';
    document.getElementById('hora').value               = a.hora ? a.hora.substring(0,5) : '';
    document.getElementById('descripcion').value        = a.descripcion || '';
    document.getElementById('cedula').value             = a.cedula || '';
    document.getElementById('nombres').value            = a.nombres || '';
    document.getElementById('apellidos').value          = a.apellidos || '';
    document.getElementById('celular').value            = a.celular || '';
    document.getElementById('genero').value             = a.genero || '';
    document.getElementById('fecha_nacimiento').value   = a.fecha_nacimiento || '';
    document.getElementById('edad').value               = a.edad != null ? a.edad : '';
    document.getElementById('contacto_emergencia').value = a.contacto_emergencia || '';

    // Coordenadas desde geom
    if (a.geom) {
        try {
            var geo = JSON.parse(a.geom);
            if (geo.coordinates) {
                document.getElementById('longitud').value = geo.coordinates[0];
                document.getElementById('latitud').value  = geo.coordinates[1];
                document.getElementById('mapHint').textContent =
                    parseFloat(geo.coordinates[1]).toFixed(5) + ', ' + parseFloat(geo.coordinates[0]).toFixed(5);
            }
        } catch(e) {}
    }

    showMsg('', '');
    resetMap();
}

// ── Modal helpers ─────────────────────────────────────────────
function openModal() {
    editingId = null;
    modalTitle.textContent = 'Nueva Alerta';
    btnGuardarText.textContent = 'Guardar Alerta';

    modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Poner fecha y hora actuales por defecto
    var now  = new Date();
    var yyyy = now.getFullYear();
    var mm   = String(now.getMonth() + 1).padStart(2, '0');
    var dd   = String(now.getDate()).padStart(2, '0');
    var hh   = String(now.getHours()).padStart(2, '0');
    var min  = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('fecha').value = yyyy + '-' + mm + '-' + dd;
    document.getElementById('hora').value  = hh + ':' + min;
}

function closeModal() {
    modalOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    formAlerta.reset();
    showMsg('', '');
    resetMap();
    editingId = null;
}

function showMsg(text, type) {
    if (!text) {
        formMsg.classList.add('hidden');
        formMsg.className = 'form-msg hidden';
        return;
    }
    formMsg.textContent = text;
    formMsg.className = 'form-msg ' + type;
}

// ── Enviar formulario (crear o editar) ─────────────────────────
formAlerta.addEventListener('submit', function(e) {
    e.preventDefault();

    var tipoEvento = document.getElementById('tipo_evento').value.trim();
    var fecha      = document.getElementById('fecha').value;
    var hora       = document.getElementById('hora').value;

    if (!tipoEvento || !fecha || !hora) {
        showMsg('Por favor completa los campos obligatorios: Tipo de evento, Fecha y Hora.', 'error');
        return;
    }

    var latVal = document.getElementById('latitud').value;
    var lngVal = document.getElementById('longitud').value;

    var payload = {
        tipo_evento:         tipoEvento,
        fecha:               fecha,
        hora:                hora,
        descripcion:         document.getElementById('descripcion').value.trim() || null,
        cedula:              document.getElementById('cedula').value.trim() || null,
        nombres:             document.getElementById('nombres').value.trim() || null,
        apellidos:           document.getElementById('apellidos').value.trim() || null,
        celular:             document.getElementById('celular').value.trim() || null,
        genero:              document.getElementById('genero').value || null,
        fecha_nacimiento:    document.getElementById('fecha_nacimiento').value || null,
        edad:                document.getElementById('edad').value ? parseInt(document.getElementById('edad').value) : null,
        contacto_emergencia: document.getElementById('contacto_emergencia').value.trim() || null,
        latitud:             latVal ? parseFloat(latVal) : null,
        longitud:            lngVal ? parseFloat(lngVal) : null
    };

    btnGuardar.disabled = true;
    btnGuardarText.textContent = editingId ? 'Guardando cambios...' : 'Guardando...';
    showMsg('', '');

    var url    = API_URL + '/alertas' + (editingId ? '/' + editingId : '');
    var method = editingId ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(res) {
        if (!res.ok) throw new Error('Error del servidor: ' + res.status);
        return res.json();
    })
    .then(function() {
        showMsg(editingId ? '✓ Alerta actualizada exitosamente.' : '✓ Alerta registrada exitosamente.', 'success');
        setTimeout(closeModal, 1200);
    })
    .catch(function(err) {
        console.error(err);
        showMsg('Error al guardar la alerta. Verifica que el servidor esté activo.', 'error');
    })
    .finally(function() {
        btnGuardar.disabled = false;
        btnGuardarText.textContent = editingId ? 'Guardar Cambios' : 'Guardar Alerta';
    });
});

// ── WebSocket ─────────────────────────────────────────────────
function connectWebSocket() {
    var wsUrl = WS_URL + '/ws/alertas';
    var ws = new WebSocket(wsUrl);

    ws.onopen = function() { setConnected(true); };

    ws.onmessage = function(event) {
        try { 
            renderAlerts(JSON.parse(event.data)); 
            if (capaGeoServerPruebas) {
                capaGeoServerPruebas.setParams({ fake: Date.now() }, false);
            }
        }
        catch (e) { console.error('Error parseando datos:', e); }
    };

    ws.onclose = function() {
        setConnected(false);
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = function() { ws.close(); };
}

// ── Event listeners ───────────────────────────────────────────
document.getElementById('btnNuevaAlerta').addEventListener('click', openModal);
document.getElementById('btnCerrarModal').addEventListener('click', closeModal);
document.getElementById('btnCancelar').addEventListener('click', closeModal);
document.getElementById('btnToggleMap').addEventListener('click', toggleMap);

modalOverlay.addEventListener('click', function(e) {
    if (e.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
});

// ── Init ──────────────────────────────────────────────────────
connectWebSocket();
