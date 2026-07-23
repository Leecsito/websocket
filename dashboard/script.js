var allReports = [];
var allUsers = [];
var filteredReports = [];

var map = null;
var heatLayer = null;

var TYPE_COLORS = {
    asalto: '#dc2626',
    accidente: '#d97706',
    medica: '#7c3aed',
    otro: '#2563eb'
};

var filters = {
    search: '',
    type: 'todos',
    gender: 'todos',
    status: 'todos',
    userCedula: 'todos',
    dateFrom: '',
    dateTo: '',
    ageMin: null,
    ageMax: null,
    timeMin: 0,
    timeMax: 1440
};

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
    var date = new Date(String(value).replace(' ', 'T'));
    return isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
    var date = parseDate(value);
    if (!date) return 'Sin fecha';
    return date.toLocaleString('es-EC', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatDateShort(value) {
    var date = parseDate(value);
    if (!date) return '—';
    return date.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
}

function normalizeType(tipo) {
    var t = String(tipo || '').toLowerCase();
    if (t.indexOf('asalto') !== -1 || t.indexOf('robo') !== -1) return 'asalto';
    if (t.indexOf('accidente') !== -1 || t.indexOf('choque') !== -1) return 'accidente';
    if (t.indexOf('medica') !== -1 || t.indexOf('médica') !== -1 || t.indexOf('salud') !== -1) return 'medica';
    return 'otro';
}

function typeLabel(key) {
    if (key === 'asalto') return 'Asalto';
    if (key === 'accidente') return 'Accidente';
    if (key === 'medica') return 'Emerg. médica';
    return 'Otros';
}

function statusLabel(status) {
    if (status === 'en_atencion') return 'En atención';
    if (status === 'cerrada') return 'Cerrada';
    return 'Pendiente';
}

function hasCoords(report) {
    return report.latitud != null && report.longitud != null &&
        !isNaN(Number(report.latitud)) && !isNaN(Number(report.longitud));
}

function pct(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
}

function initMap() {
    map = L.map('analysisMap', { zoomControl: true, attributionControl: false })
        .setView([-1.6669, -78.6521], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18
    }).addTo(map);

    heatLayer = L.heatLayer([], { radius: 18, blur: 14, maxZoom: 16 }).addTo(map);
}

function initTimeSlider() {
    var slider = document.getElementById('timeSlider');
    noUiSlider.create(slider, {
        start: [0, 1440],
        connect: true,
        range: { min: 0, max: 1440 },
        step: 15
    });

    slider.noUiSlider.on('update', function(values) {
        filters.timeMin = parseInt(values[0], 10);
        filters.timeMax = parseInt(values[1], 10);
        document.getElementById('timeMinLabel').textContent = formatMinutes(filters.timeMin);
        document.getElementById('timeMaxLabel').textContent = formatMinutes(filters.timeMax);
        applyFilters();
    });
}

function formatMinutes(minutes) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function populateUserSelect() {
    var select = document.getElementById('userSelect');
    var current = select.value;
    select.innerHTML = '<option value="todos">Todos los usuarios</option>';

    allUsers.slice().sort(function(a, b) {
        return String(a.cedula || '').localeCompare(String(b.cedula || ''));
    }).forEach(function(user) {
        var name = ((user.nombres || '') + ' ' + (user.apellidos || '')).trim();
        var option = document.createElement('option');
        option.value = user.cedula || '';
        option.textContent = (user.cedula || 'Sin cédula') + (name ? ' - ' + name : '');
        select.appendChild(option);
    });

    if (current) select.value = current;
}

function applyFilters() {
    filters.search = document.getElementById('searchInput').value.trim().toLowerCase();
    filters.type = document.getElementById('typeSelect').value;
    filters.status = document.getElementById('statusSelect').value;
    filters.gender = document.getElementById('genderSelect').value;
    filters.userCedula = document.getElementById('userSelect').value;
    filters.dateFrom = document.getElementById('dateFrom').value;
    filters.dateTo = document.getElementById('dateTo').value;

    var ageMin = parseInt(document.getElementById('ageMin').value, 10);
    var ageMax = parseInt(document.getElementById('ageMax').value, 10);
    filters.ageMin = isNaN(ageMin) ? null : ageMin;
    filters.ageMax = isNaN(ageMax) ? null : ageMax;

    var dateFromTs = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00').getTime() : null;
    var dateToTs = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59').getTime() : null;

    filteredReports = allReports.filter(function(report) {
        var fullName = ((report.nombres || '') + ' ' + (report.apellidos || '')).trim();
        var searchText = [fullName, report.cedula, report.tipo_reporte, report.descripcion, report.id].join(' ').toLowerCase();

        if (filters.search && searchText.indexOf(filters.search) === -1) return false;
        if (filters.type !== 'todos' && normalizeType(report.tipo_reporte) !== filters.type) return false;
        if (filters.gender !== 'todos' && report.genero !== filters.gender) return false;
        if (filters.status !== 'todos' && (report.estado_atencion || 'pendiente') !== filters.status) return false;
        if (filters.userCedula !== 'todos' && String(report.cedula || '') !== String(filters.userCedula)) return false;
        if (filters.ageMin != null && Number(report.edad || 0) < filters.ageMin) return false;
        if (filters.ageMax != null && Number(report.edad || 0) > filters.ageMax) return false;

        var date = parseDate(report.fecha_hora);
        if (date) {
            var ts = date.getTime();
            if (dateFromTs && ts < dateFromTs) return false;
            if (dateToTs && ts > dateToTs) return false;
            var minutes = date.getHours() * 60 + date.getMinutes();
            if (minutes < filters.timeMin || minutes > filters.timeMax) return false;
        }
        return true;
    });

    renderDashboard();
}

function renderDashboard() {
    document.getElementById('filterCount').textContent = filteredReports.length + ' reportes';
    updateKpis();
    renderInsights();
    renderTrendChart();
    renderHourlyChart();
    renderDonutChart();
    renderStatusFunnel();
    renderGenderChart();
    renderAgeChart();
    renderUserChart();
    renderHotspots();
    renderExecMetrics();
    renderTable();
    renderMap();
}

function updateKpis() {
    var pending = filteredReports.filter(function(r) { return (r.estado_atencion || 'pendiente') === 'pendiente'; }).length;
    var cedulas = {};
    filteredReports.forEach(function(r) {
        if (r.cedula) cedulas[r.cedula] = true;
    });

    document.getElementById('kpiFiltered').textContent = filteredReports.length;
    document.getElementById('kpiPending').textContent = pending;
    document.getElementById('kpiAsalto').textContent = filteredReports.filter(function(r) { return normalizeType(r.tipo_reporte) === 'asalto'; }).length;
    document.getElementById('kpiAccidente').textContent = filteredReports.filter(function(r) { return normalizeType(r.tipo_reporte) === 'accidente'; }).length;
    document.getElementById('kpiMedica').textContent = filteredReports.filter(function(r) { return normalizeType(r.tipo_reporte) === 'medica'; }).length;
    document.getElementById('kpiActiveUsers').textContent = Object.keys(cedulas).length;
}

function renderInsights() {
    var list = document.getElementById('insightsList');
    var total = filteredReports.length;

    if (!total) {
        list.innerHTML = '<li>No hay datos con los filtros actuales. Ajusta el rango o espera nuevos reportes.</li>';
        return;
    }

    var insights = [];
    var typeCounts = { asalto: 0, accidente: 0, medica: 0, otro: 0 };
    var hourCounts = new Array(24).fill(0);
    var pending = 0;
    var geo = 0;

    filteredReports.forEach(function(r) {
        typeCounts[normalizeType(r.tipo_reporte)]++;
        if ((r.estado_atencion || 'pendiente') === 'pendiente') pending++;
        if (hasCoords(r)) geo++;
        var d = parseDate(r.fecha_hora);
        if (d) hourCounts[d.getHours()]++;
    });

    var dominant = Object.keys(typeCounts).sort(function(a, b) { return typeCounts[b] - typeCounts[a]; })[0];
    insights.push('<strong>' + pct(typeCounts[dominant], total) + '%</strong> de los reportes son ' + typeLabel(dominant).toLowerCase() + ' (' + typeCounts[dominant] + ' de ' + total + ').');

    var peakHour = hourCounts.indexOf(Math.max.apply(null, hourCounts));
    if (hourCounts[peakHour] > 0) {
        insights.push('La franja más crítica es las <strong>' + String(peakHour).padStart(2, '0') + ':00</strong> con ' + hourCounts[peakHour] + ' incidente(s). Considera reforzar recursos en ese horario.');
    }

    if (pending > 0) {
        insights.push('Hay <strong>' + pending + ' reportes pendientes</strong> (' + pct(pending, total) + '%). Prioriza atención operativa antes de cerrar casos nuevos.');
    }

    if (geo < total) {
        insights.push('<strong>' + (total - geo) + ' reportes</strong> no tienen coordenadas válidas. Mejora la calidad del dato geográfico para análisis más precisos.');
    } else if (geo === total && total > 0) {
        insights.push('Todos los reportes filtrados están <strong>georreferenciados</strong>. Puedes confiar en el análisis espacial complementario.');
    }

    list.innerHTML = insights.map(function(text) { return '<li>' + text + '</li>'; }).join('');
}

function renderBarChart(containerId, rows) {
    var container = document.getElementById(containerId);
    if (!rows.length || rows.every(function(r) { return r.value === 0; })) {
        container.innerHTML = '<div class="empty-cell">Sin datos</div>';
        return;
    }
    var max = Math.max.apply(null, rows.map(function(r) { return r.value; })) || 1;
    container.innerHTML = rows.map(function(row) {
        var width = Math.round((row.value / max) * 100);
        return '<div class="bar-row"><span class="bar-label">' + escapeHtml(row.label) + '</span>' +
            '<div class="bar-track"><div class="bar-fill ' + (row.color || '') + '" style="width:' + width + '%"></div></div>' +
            '<span class="bar-value">' + row.value + '</span></div>';
    }).join('');
}

function renderTrendChart() {
    var container = document.getElementById('chartTrend');
    var byDate = {};

    filteredReports.forEach(function(r) {
        var d = parseDate(r.fecha_hora);
        if (!d) return;
        var key = d.toISOString().slice(0, 10);
        byDate[key] = (byDate[key] || 0) + 1;
    });

    var keys = Object.keys(byDate).sort();
    if (!keys.length) {
        container.innerHTML = '<div class="empty-cell">Sin datos temporales</div>';
        return;
    }

    var values = keys.map(function(k) { return byDate[k]; });
    var max = Math.max.apply(null, values) || 1;
    var w = 600, h = 200, pad = 30;
    var barW = Math.max(12, (w - pad * 2) / keys.length - 4);

    var bars = keys.map(function(key, i) {
        var val = byDate[key];
        var barH = (val / max) * (h - pad * 2);
        var x = pad + i * ((w - pad * 2) / keys.length);
        var y = h - pad - barH;
        return '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + barH + '" rx="3" fill="#2563eb" opacity="0.85">' +
            '<title>' + formatDateShort(key) + ': ' + val + '</title></rect>';
    }).join('');

    var labels = keys.map(function(key, i) {
        if (keys.length > 8 && i % 2 !== 0) return '';
        var x = pad + i * ((w - pad * 2) / keys.length) + barW / 2;
        return '<text x="' + x + '" y="' + (h - 8) + '" text-anchor="middle" fill="#64748b" font-size="10">' +
            formatDateShort(key) + '</text>';
    }).join('');

    container.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + bars + labels + '</svg>';
}

function renderHourlyChart() {
    var container = document.getElementById('chartHourly');
    var hourCounts = new Array(24).fill(0);

    filteredReports.forEach(function(r) {
        var d = parseDate(r.fecha_hora);
        if (d) hourCounts[d.getHours()]++;
    });

    var max = Math.max.apply(null, hourCounts) || 1;
    var peakHour = hourCounts.indexOf(max);
    document.getElementById('peakHourLabel').textContent = max > 0
        ? 'Pico: ' + String(peakHour).padStart(2, '0') + ':00 (' + max + ')'
        : '—';

    var w = 600, h = 200, pad = 20;
    var barW = (w - pad * 2) / 24 - 2;

    var bars = hourCounts.map(function(val, i) {
        var barH = (val / max) * (h - pad * 2);
        var x = pad + i * ((w - pad * 2) / 24);
        var y = h - pad - barH;
        var color = i === peakHour && val > 0 ? '#dc2626' : '#2563eb';
        return '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + barH + '" rx="2" fill="' + color + '" opacity="0.9">' +
            '<title>' + String(i).padStart(2, '0') + ':00 - ' + val + '</title></rect>';
    }).join('');

    container.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + bars + '</svg>';
}

function renderDonutChart() {
    var counts = { asalto: 0, accidente: 0, medica: 0, otro: 0 };
    filteredReports.forEach(function(r) { counts[normalizeType(r.tipo_reporte)]++; });

    var total = filteredReports.length;
    var donut = document.getElementById('chartDonutType');
    var legend = document.getElementById('legendType');

    if (!total) {
        donut.style.background = '#eef2f7';
        donut.setAttribute('data-total', '0');
        legend.innerHTML = '<li>Sin datos</li>';
        return;
    }

    var entries = ['asalto', 'accidente', 'medica', 'otro'].filter(function(k) { return counts[k] > 0; });
    var gradientParts = [];
    var angle = 0;

    entries.forEach(function(key) {
        var slice = (counts[key] / total) * 360;
        gradientParts.push(TYPE_COLORS[key] + ' ' + angle + 'deg ' + (angle + slice) + 'deg');
        angle += slice;
    });

    donut.style.background = 'conic-gradient(' + gradientParts.join(', ') + ')';
    donut.setAttribute('data-total', String(total));

    legend.innerHTML = entries.map(function(key) {
        return '<li><span class="legend-label"><span class="legend-dot" style="background:' + TYPE_COLORS[key] + '"></span>' +
            typeLabel(key) + '</span><strong>' + counts[key] + ' (' + pct(counts[key], total) + '%)</strong></li>';
    }).join('');
}

function renderStatusFunnel() {
    var counts = { pendiente: 0, en_atencion: 0, cerrada: 0 };
    filteredReports.forEach(function(r) {
        var s = r.estado_atencion || 'pendiente';
        if (counts[s] != null) counts[s]++;
    });

    var total = filteredReports.length;
    var container = document.getElementById('chartStatus');

    if (!total) {
        container.innerHTML = '<div class="empty-cell">Sin datos</div>';
        return;
    }

    var steps = [
        { key: 'pendiente', label: 'Pendiente', cls: 'pending' },
        { key: 'en_atencion', label: 'En atención', cls: 'active' },
        { key: 'cerrada', label: 'Cerrada', cls: 'closed' }
    ];

    container.innerHTML = steps.map(function(step) {
        var val = counts[step.key];
        var width = pct(val, total);
        return '<div class="funnel-step"><span class="bar-label">' + step.label + '</span>' +
            '<div class="funnel-bar"><div class="funnel-fill ' + step.cls + '" style="width:' + width + '%"></div></div>' +
            '<span class="bar-value">' + val + '</span></div>';
    }).join('');
}

function renderGenderChart() {
    var counts = { Masculino: 0, Femenino: 0, Otro: 0 };
    filteredReports.forEach(function(r) {
        if (r.genero === 'Masculino') counts.Masculino++;
        else if (r.genero === 'Femenino') counts.Femenino++;
        else counts.Otro++;
    });

    renderBarChart('chartGender', [
        { label: 'Masculino', value: counts.Masculino, color: '' },
        { label: 'Femenino', value: counts.Femenino, color: 'pink' },
        { label: 'No especificado', value: counts.Otro, color: '' }
    ]);
}

function renderAgeChart() {
    var groups = { '0-17': 0, '18-30': 0, '31-50': 0, '51+': 0, 'N/D': 0 };
    filteredReports.forEach(function(r) {
        var age = Number(r.edad);
        if (isNaN(age) || age <= 0) groups['N/D']++;
        else if (age < 18) groups['0-17']++;
        else if (age <= 30) groups['18-30']++;
        else if (age <= 50) groups['31-50']++;
        else groups['51+']++;
    });

    renderBarChart('chartAge', [
        { label: '0-17 años', value: groups['0-17'], color: 'violet' },
        { label: '18-30 años', value: groups['18-30'], color: '' },
        { label: '31-50 años', value: groups['31-50'], color: 'green' },
        { label: '51+ años', value: groups['51+'], color: 'amber' },
        { label: 'Sin dato', value: groups['N/D'], color: '' }
    ]);
}

function renderUserChart() {
    var byUser = {};
    filteredReports.forEach(function(r) {
        var key = r.cedula || 'Sin cédula';
        var name = ((r.nombres || '') + ' ' + (r.apellidos || '')).trim();
        if (!byUser[key]) byUser[key] = { label: name || key, count: 0 };
        byUser[key].count++;
    });

    var rows = Object.keys(byUser).map(function(k) { return byUser[k]; })
        .sort(function(a, b) { return b.count - a.count; })
        .slice(0, 5)
        .map(function(item) { return { label: item.label, value: item.count, color: 'amber' }; });

    renderBarChart('chartUsers', rows.length ? rows : [{ label: 'Sin datos', value: 0 }]);
}

function renderHotspots() {
    var list = document.getElementById('hotspotList');
    var geoReports = filteredReports.filter(hasCoords);

    if (!geoReports.length) {
        list.innerHTML = '<li class="muted">No hay coordenadas para analizar zonas.</li>';
        return;
    }

    var buckets = {};
    geoReports.forEach(function(r) {
        var lat = Number(r.latitud).toFixed(3);
        var lng = Number(r.longitud).toFixed(3);
        var key = lat + ',' + lng;
        if (!buckets[key]) buckets[key] = { lat: Number(r.latitud), lng: Number(r.longitud), count: 0, types: {} };
        buckets[key].count++;
        var t = normalizeType(r.tipo_reporte);
        buckets[key].types[t] = (buckets[key].types[t] || 0) + 1;
    });

    var hotspots = Object.keys(buckets).map(function(k) { return buckets[k]; })
        .sort(function(a, b) { return b.count - a.count; })
        .slice(0, 5);

    list.innerHTML = hotspots.map(function(spot, i) {
        var dominant = Object.keys(spot.types).sort(function(a, b) { return spot.types[b] - spot.types[a]; })[0];
        return '<li><span class="rank-badge">' + (i + 1) + '</span><div class="rank-meta">' +
            '<strong>' + spot.count + ' reportes</strong>' +
            '<span>' + typeLabel(dominant) + ' · ' + spot.lat.toFixed(4) + ', ' + spot.lng.toFixed(4) + '</span></div></li>';
    }).join('');
}

function renderExecMetrics() {
    var total = filteredReports.length;
    var geo = filteredReports.filter(hasCoords).length;
    var closed = filteredReports.filter(function(r) { return r.estado_atencion === 'cerrada'; }).length;
    var container = document.getElementById('execMetrics');

    container.innerHTML =
        '<div class="exec-metric"><span>Tasa georreferenciada</span><strong>' + pct(geo, total) + '%</strong></div>' +
        '<div class="exec-metric"><span>Tasa de cierre</span><strong>' + pct(closed, total) + '%</strong></div>' +
        '<div class="exec-metric"><span>Promedio diario</span><strong>' + calcDailyAvg() + '</strong></div>';
}

function calcDailyAvg() {
    var dates = {};
    filteredReports.forEach(function(r) {
        var d = parseDate(r.fecha_hora);
        if (d) dates[d.toISOString().slice(0, 10)] = true;
    });
    var days = Object.keys(dates).length;
    if (!days) return '0';
    return (filteredReports.length / days).toFixed(1);
}

function renderTable() {
    var tbody = document.getElementById('reportTableBody');
    if (!filteredReports.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">Sin reportes</td></tr>';
        return;
    }

    tbody.innerHTML = filteredReports.slice(0, 8).map(function(r) {
        var name = ((r.nombres || '') + ' ' + (r.apellidos || '')).trim() || '—';
        var status = r.estado_atencion || 'pendiente';
        return '<tr><td>' + escapeHtml(formatDateTime(r.fecha_hora)) + '</td>' +
            '<td>' + escapeHtml(r.tipo_reporte) + '</td>' +
            '<td>' + escapeHtml(name) + '</td>' +
            '<td><span class="status-badge ' + status + '">' + escapeHtml(statusLabel(status)) + '</span></td></tr>';
    }).join('');
}

function renderMap() {
    var geoReports = filteredReports.filter(hasCoords);
    document.getElementById('mapSummary').textContent = geoReports.length + ' puntos en vista complementaria';

    if (!geoReports.length) {
        heatLayer.setLatLngs([]);
        return;
    }

    heatLayer.setLatLngs(geoReports.map(function(r) {
        return [Number(r.latitud), Number(r.longitud), 1];
    }));
}

function fitMapBounds() {
    var geoReports = filteredReports.filter(hasCoords);
    if (!geoReports.length) return;
    var bounds = L.latLngBounds(geoReports.map(function(r) {
        return [Number(r.latitud), Number(r.longitud)];
    }));
    map.fitBounds(bounds.pad(0.2));
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('typeSelect').value = 'todos';
    document.getElementById('statusSelect').value = 'todos';
    document.getElementById('genderSelect').value = 'todos';
    document.getElementById('userSelect').value = 'todos';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('ageMin').value = '';
    document.getElementById('ageMax').value = '';
    document.getElementById('timeSlider').noUiSlider.set([0, 1440]);
    applyFilters();
}

function setConnectionState(state, message) {
    var dot = document.getElementById('connectionDot');
    dot.classList.remove('online', 'offline');
    dot.classList.add(state);
    document.getElementById('connectionText').textContent = message;
}

function connectAlertas() {
    var ws = new WebSocket(WS_URL + '/ws/alertas');
    var reconnectDelay = 3000;

    ws.onopen = function() {
        setConnectionState('online', 'Conectado');
        reconnectDelay = 3000;
    };

    ws.onmessage = function(event) {
        try {
            allReports = JSON.parse(event.data);
            if (!Array.isArray(allReports)) allReports = [];
            document.getElementById('lastUpdate').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-EC');
            applyFilters();
        } catch (error) {
            console.error('Error procesando alertas:', error);
        }
    };

    ws.onclose = function() {
        setConnectionState('offline', 'Desconectado');
        setTimeout(connectAlertas, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay + 2000, 15000);
    };

    ws.onerror = function() { ws.close(); };
}

function loadUsuarios() {
    fetch(API_URL + '/usuarios', { cache: 'no-store' })
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            allUsers = Array.isArray(data) ? data : [];
            populateUserSelect();
        })
        .catch(function(e) { console.error('Error usuarios:', e); });
}

['searchInput', 'typeSelect', 'statusSelect', 'genderSelect', 'userSelect',
 'dateFrom', 'dateTo', 'ageMin', 'ageMax'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', applyFilters);
    document.getElementById(id).addEventListener('change', applyFilters);
});

document.getElementById('btnResetFilters').addEventListener('click', resetFilters);
document.getElementById('btnFitBounds').addEventListener('click', fitMapBounds);

initMap();
initTimeSlider();
loadUsuarios();
connectAlertas();
