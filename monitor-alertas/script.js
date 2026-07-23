var monitorState = {
    alerts: [],
    filtered: [],
    selectedId: null,
    statuses: loadStatuses(),
    filters: {
        search: '',
        priority: 'todos',
        status: 'todos',
        type: 'todos',
        date: ''
    },
    sort: 'recientes',
    reconnectDelay: 3000,
    socket: null,
    map: null,
    mapMarker: null
};

var els = {
    connectionDot: document.getElementById('connectionDot'),
    connectionText: document.getElementById('connectionText'),
    lastUpdate: document.getElementById('lastUpdate'),
    kpiCritical: document.getElementById('kpiCritical'),
    kpiLastHour: document.getElementById('kpiLastHour'),
    kpiLocated: document.getElementById('kpiLocated'),
    kpiTotal: document.getElementById('kpiTotal'),
    alertList: document.getElementById('alertList'),
    detailBody: document.getElementById('detailBody'),
    detailId: document.getElementById('detailId'),
    queueCount: document.getElementById('queueCount'),
    searchInput: document.getElementById('searchInput'),
    priorityFilter: document.getElementById('priorityFilter'),
    statusFilter: document.getElementById('statusFilter'),
    typeSelect: document.getElementById('typeSelect'),
    dateInput: document.getElementById('dateInput'),
    sortSelect: document.getElementById('sortSelect'),
    btnResetFilters: document.getElementById('btnResetFilters')
};

function loadStatuses() {
    try {
        return JSON.parse(localStorage.getItem('monitorAlertasStatuses') || '{}');
    } catch (error) {
        return {};
    }
}

function saveStatuses() {
    localStorage.setItem('monitorAlertasStatuses', JSON.stringify(monitorState.statuses));
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function parseDate(value) {
    if (!value) return null;
    var normalized = String(value).replace(' ', 'T');
    var date = new Date(normalized);
    return isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
    var date = parseDate(value);
    if (!date) return 'Fecha no disponible';
    return date.toLocaleString('es-EC', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function minutesAgo(value) {
    var date = parseDate(value);
    if (!date) return 'Sin hora';
    var diff = Math.max(0, Date.now() - date.getTime());
    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return 'Hace ' + minutes + ' min';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return 'Hace ' + hours + ' h';
    return 'Hace ' + Math.floor(hours / 24) + ' d';
}

function getTypeMeta(type) {
    var text = String(type || '').toLowerCase();
    if (text.indexOf('robo') !== -1 || text.indexOf('asalto') !== -1 || text.indexOf('sospechoso') !== -1) {
        return { icon: 'fa-solid fa-person-rifle', cls: 'robo' };
    }
    if (text.indexOf('accidente') !== -1 || text.indexOf('choque') !== -1) {
        return { icon: 'fa-solid fa-car-burst', cls: 'accidente' };
    }
    if (text.indexOf('medica') !== -1 || text.indexOf('medica') !== -1 || text.indexOf('salud') !== -1 || text.indexOf('emergencia') !== -1) {
        return { icon: 'fa-solid fa-truck-medical', cls: 'medica' };
    }
    if (text.indexOf('incendio') !== -1 || text.indexOf('fuego') !== -1) {
        return { icon: 'fa-solid fa-fire', cls: 'incendio' };
    }
    return { icon: 'fa-solid fa-bell', cls: 'default' };
}

function getPriority(alert) {
    var type = String(alert.tipo || '').toLowerCase();
    var age = Number(alert.edad || 0);
    var date = parseDate(alert.fecha_hora);
    var minutes = date ? (Date.now() - date.getTime()) / 60000 : 9999;

    if (type.indexOf('incendio') !== -1 || type.indexOf('arma') !== -1 || type.indexOf('medica') !== -1 || type.indexOf('emergencia') !== -1) {
        return { key: 'critica', label: 'Critica', score: 4 };
    }
    if (type.indexOf('robo') !== -1 || type.indexOf('asalto') !== -1 || type.indexOf('accidente') !== -1 || age >= 65) {
        return { key: 'alta', label: 'Alta', score: 3 };
    }
    if (minutes <= 60) {
        return { key: 'media', label: 'Media', score: 2 };
    }
    return { key: 'baja', label: 'Baja', score: 1 };
}

function normalizeAlert(item) {
    var firstName = item.nombres || '';
    var lastName = item.apellidos || '';
    var fullName = (firstName + ' ' + lastName).trim() || 'Ciudadano sin nombre';
    var lat = item.latitud == null ? null : Number(item.latitud);
    var lng = item.longitud == null ? null : Number(item.longitud);

    return {
        id: item.id,
        tipo: item.tipo_reporte || item.tipo_evento || 'Alerta',
        fecha_hora: item.fecha_hora || '',
        descripcion: item.descripcion || 'Sin descripcion registrada.',
        cedula: item.cedula || 'N/A',
        nombres: firstName,
        apellidos: lastName,
        nombreCompleto: fullName,
        celular: item.celular || 'No registrado',
        genero: item.genero || 'No especificado',
        fecha_nacimiento: item.fecha_nacimiento || '',
        edad: item.edad == null ? 'N/A' : item.edad,
        contacto: item.celular_contacto_emergencia || item.contacto_emergencia || 'No registrado',
        latitud: isNaN(lat) ? null : lat,
        longitud: isNaN(lng) ? null : lng
    };
}

function getAlertStatus(id) {
    return monitorState.statuses[id] || 'pendiente';
}

function setConnection(status) {
    els.connectionDot.classList.remove('online', 'offline');
    if (status === 'online') {
        els.connectionDot.classList.add('online');
        els.connectionText.textContent = 'En vivo';
    } else if (status === 'offline') {
        els.connectionDot.classList.add('offline');
        els.connectionText.textContent = 'Sin conexion';
    } else {
        els.connectionText.textContent = 'Conectando';
    }
}

function updateTypeOptions(alerts) {
    var current = els.typeSelect.value || 'todos';
    var types = Array.from(new Set(alerts.map(function(alert) { return alert.tipo; }).filter(Boolean))).sort();
    els.typeSelect.innerHTML = '<option value="todos">Todos los tipos</option>';
    types.forEach(function(type) {
        var option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        els.typeSelect.appendChild(option);
    });
    els.typeSelect.value = types.indexOf(current) !== -1 ? current : 'todos';
    monitorState.filters.type = els.typeSelect.value;
}

function updateKpis(alerts) {
    var now = Date.now();
    var critical = alerts.filter(function(alert) { return getPriority(alert).key === 'critica'; }).length;
    var lastHour = alerts.filter(function(alert) {
        var date = parseDate(alert.fecha_hora);
        return date && now - date.getTime() <= 3600000;
    }).length;
    var located = alerts.filter(function(alert) { return alert.latitud != null && alert.longitud != null; }).length;

    els.kpiCritical.textContent = critical;
    els.kpiLastHour.textContent = lastHour;
    els.kpiLocated.textContent = located;
    els.kpiTotal.textContent = alerts.length;
}

function applyFilters() {
    var search = monitorState.filters.search.trim().toLowerCase();
    var filtered = monitorState.alerts.filter(function(alert) {
        var priority = getPriority(alert);
        var status = getAlertStatus(alert.id);
        var haystack = [
            alert.tipo,
            alert.descripcion,
            alert.nombreCompleto,
            alert.cedula,
            alert.celular,
            alert.contacto,
            alert.genero
        ].join(' ').toLowerCase();
        var date = parseDate(alert.fecha_hora);
        var dateValue = date ? date.toISOString().slice(0, 10) : '';

        if (search && haystack.indexOf(search) === -1) return false;
        if (monitorState.filters.priority !== 'todos' && priority.key !== monitorState.filters.priority) return false;
        if (monitorState.filters.status !== 'todos' && status !== monitorState.filters.status) return false;
        if (monitorState.filters.type !== 'todos' && alert.tipo !== monitorState.filters.type) return false;
        if (monitorState.filters.date && dateValue !== monitorState.filters.date) return false;
        return true;
    });

    filtered.sort(function(a, b) {
        if (monitorState.sort === 'prioridad') {
            return getPriority(b).score - getPriority(a).score || Number(b.id) - Number(a.id);
        }
        if (monitorState.sort === 'edad') {
            return Number(b.edad || 0) - Number(a.edad || 0);
        }
        var da = parseDate(a.fecha_hora);
        var db = parseDate(b.fecha_hora);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });

    monitorState.filtered = filtered;
    renderList();
    if (monitorState.selectedId && !filtered.some(function(alert) { return alert.id === monitorState.selectedId; })) {
        monitorState.selectedId = filtered[0] ? filtered[0].id : null;
        renderDetail();
    }
}

function renderList() {
    els.queueCount.textContent = monitorState.filtered.length + ' alertas visibles';

    if (!monitorState.filtered.length) {
        els.alertList.innerHTML =
            '<div class="empty-state">' +
                '<i class="fa-regular fa-bell"></i>' +
                '<strong>Sin resultados</strong>' +
                '<span>Ajusta los filtros o espera nuevas alertas por WebSocket.</span>' +
            '</div>';
        return;
    }

    els.alertList.innerHTML = monitorState.filtered.map(function(alert) {
        var priority = getPriority(alert);
        var status = getAlertStatus(alert.id);
        var typeMeta = getTypeMeta(alert.tipo);
        var activeClass = alert.id === monitorState.selectedId ? ' active' : '';
        var locationText = alert.latitud != null && alert.longitud != null ? 'Con ubicacion' : 'Sin ubicacion';

        return '' +
            '<article class="alert-card' + activeClass + '" data-id="' + escapeHtml(alert.id) + '">' +
                '<div class="priority-strip ' + priority.key + '"></div>' +
                '<div class="alert-card-body">' +
                    '<div class="alert-main-row">' +
                        '<div class="alert-type">' +
                            '<span class="type-icon ' + typeMeta.cls + '"><i class="' + typeMeta.icon + '"></i></span>' +
                            '<span>' + escapeHtml(alert.tipo) + '</span>' +
                        '</div>' +
                        '<span class="priority-badge ' + priority.key + '">' + priority.label + '</span>' +
                    '</div>' +
                    '<p class="alert-description">' + escapeHtml(alert.descripcion) + '</p>' +
                    '<div class="alert-main-row">' +
                        '<span class="alert-person">' + escapeHtml(alert.nombreCompleto) + '</span>' +
                        '<span class="status-badge ' + status + '">' + labelStatus(status) + '</span>' +
                    '</div>' +
                    '<div class="alert-meta-row">' +
                        '<span class="meta-pill"><i class="fa-regular fa-clock"></i>' + escapeHtml(minutesAgo(alert.fecha_hora)) + '</span>' +
                        '<span class="meta-pill"><i class="fa-solid fa-location-dot"></i>' + locationText + '</span>' +
                    '</div>' +
                '</div>' +
            '</article>';
    }).join('');
}

function renderDetail() {
    var alert = monitorState.alerts.find(function(item) { return item.id === monitorState.selectedId; });
    if (!alert) {
        els.detailId.textContent = 'Sin seleccion';
        els.detailBody.innerHTML =
            '<div class="empty-detail">' +
                '<i class="fa-solid fa-arrow-pointer"></i>' +
                '<p>Selecciona una alerta para ver datos del ciudadano, contacto, ubicacion y acciones de atencion.</p>' +
            '</div>';
        updateMap(null);
        return;
    }

    var priority = getPriority(alert);
    var status = getAlertStatus(alert.id);
    els.detailId.textContent = 'ID #' + alert.id;

    els.detailBody.innerHTML =
        '<div class="detail-title">' +
            '<div>' +
                '<h3>' + escapeHtml(alert.tipo) + '</h3>' +
                '<p>' + escapeHtml(formatDateTime(alert.fecha_hora)) + '</p>' +
            '</div>' +
            '<span class="priority-badge ' + priority.key + '">' + priority.label + '</span>' +
        '</div>' +
        '<p class="alert-description">' + escapeHtml(alert.descripcion) + '</p>' +
        '<div class="detail-grid">' +
            detailItem('Ciudadano', alert.nombreCompleto) +
            detailItem('Cedula', alert.cedula) +
            detailItem('Celular', alert.celular) +
            detailItem('Contacto emergencia', alert.contacto) +
            detailItem('Genero', alert.genero) +
            detailItem('Edad', alert.edad) +
            detailItem('Fecha nacimiento', alert.fecha_nacimiento || 'N/A') +
            detailItem('Coordenadas', alert.latitud != null && alert.longitud != null ? alert.latitud.toFixed(6) + ', ' + alert.longitud.toFixed(6) : 'No disponibles') +
        '</div>' +
        '<div class="action-row">' +
            actionButton('pendiente', status) +
            actionButton('atencion', status) +
            actionButton('cerrado', status) +
        '</div>';

    updateMap(alert);
}

function detailItem(label, value) {
    return '<div class="detail-item"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
}

function actionButton(value, current) {
    return '<button type="button" class="' + (value === current ? 'active' : '') + '" data-status-action="' + value + '">' + labelStatus(value) + '</button>';
}

function labelStatus(status) {
    if (status === 'atencion') return 'En atencion';
    if (status === 'cerrado') return 'Cerrada';
    return 'Pendiente';
}

function initMap() {
    if (monitorState.map || typeof L === 'undefined') return;
    monitorState.map = L.map('detailMap', {
        zoomControl: false,
        attributionControl: false
    }).setView([-1.6669, -78.6521], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(monitorState.map);
}

function updateMap(alert) {
    initMap();
    if (!monitorState.map) return;

    if (monitorState.mapMarker) {
        monitorState.map.removeLayer(monitorState.mapMarker);
        monitorState.mapMarker = null;
    }

    if (alert && alert.latitud != null && alert.longitud != null) {
        monitorState.map.setView([alert.latitud, alert.longitud], 16);
        monitorState.mapMarker = L.marker([alert.latitud, alert.longitud]).addTo(monitorState.map);
        monitorState.mapMarker.bindPopup(escapeHtml(alert.tipo));
    } else {
        monitorState.map.setView([-1.6669, -78.6521], 12);
    }

    setTimeout(function() {
        monitorState.map.invalidateSize();
    }, 80);
}

function connectWebSocket() {
    setConnection('connecting');
    var ws = new WebSocket(WS_URL + '/ws/alertas');
    monitorState.socket = ws;

    ws.onopen = function() {
        monitorState.reconnectDelay = 3000;
        setConnection('online');
    };

    ws.onmessage = function(event) {
        try {
            var raw = JSON.parse(event.data);
            monitorState.alerts = raw.map(normalizeAlert);
            els.lastUpdate.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            updateTypeOptions(monitorState.alerts);
            updateKpis(monitorState.alerts);
            if (!monitorState.selectedId && monitorState.alerts.length) {
                monitorState.selectedId = monitorState.alerts[0].id;
            }
            applyFilters();
            renderDetail();
        } catch (error) {
            console.error('Error procesando alertas:', error);
        }
    };

    ws.onclose = function() {
        setConnection('offline');
        setTimeout(connectWebSocket, monitorState.reconnectDelay);
        monitorState.reconnectDelay = Math.min(monitorState.reconnectDelay + 2000, 15000);
    };

    ws.onerror = function() {
        ws.close();
    };
}

function setSegmentValue(container, value) {
    container.querySelectorAll('button').forEach(function(button) {
        button.classList.toggle('active', button.dataset.value === value);
    });
}

function bindEvents() {
    els.searchInput.addEventListener('input', function() {
        monitorState.filters.search = els.searchInput.value;
        applyFilters();
    });

    els.priorityFilter.addEventListener('click', function(event) {
        var button = event.target.closest('button[data-value]');
        if (!button) return;
        monitorState.filters.priority = button.dataset.value;
        setSegmentValue(els.priorityFilter, button.dataset.value);
        applyFilters();
    });

    els.statusFilter.addEventListener('click', function(event) {
        var button = event.target.closest('button[data-value]');
        if (!button) return;
        monitorState.filters.status = button.dataset.value;
        setSegmentValue(els.statusFilter, button.dataset.value);
        applyFilters();
    });

    els.typeSelect.addEventListener('change', function() {
        monitorState.filters.type = els.typeSelect.value;
        applyFilters();
    });

    els.dateInput.addEventListener('change', function() {
        monitorState.filters.date = els.dateInput.value;
        applyFilters();
    });

    els.sortSelect.addEventListener('change', function() {
        monitorState.sort = els.sortSelect.value;
        applyFilters();
    });

    els.btnResetFilters.addEventListener('click', function() {
        monitorState.filters = { search: '', priority: 'todos', status: 'todos', type: 'todos', date: '' };
        els.searchInput.value = '';
        els.typeSelect.value = 'todos';
        els.dateInput.value = '';
        setSegmentValue(els.priorityFilter, 'todos');
        setSegmentValue(els.statusFilter, 'todos');
        applyFilters();
    });

    els.alertList.addEventListener('click', function(event) {
        var card = event.target.closest('.alert-card');
        if (!card) return;
        monitorState.selectedId = Number(card.dataset.id);
        renderList();
        renderDetail();
    });

    els.detailBody.addEventListener('click', function(event) {
        var button = event.target.closest('[data-status-action]');
        if (!button || !monitorState.selectedId) return;
        monitorState.statuses[monitorState.selectedId] = button.dataset.statusAction;
        saveStatuses();
        applyFilters();
        renderDetail();
    });
}

bindEvents();
initMap();
connectWebSocket();
