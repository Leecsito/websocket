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
    var container = document.getElementById('analysisMap');
    if (!container) return;

    map = L.map('analysisMap', { zoomControl: true, attributionControl: false })
        .setView([-1.6669, -78.6521], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18
    }).addTo(map);

    heatLayer = L.heatLayer([], { radius: 22, blur: 16, maxZoom: 16 }).addTo(map);

    setTimeout(function() {
        if (map) map.invalidateSize();
    }, 200);
}

function initTimeSlider() {
    var slider = document.getElementById('timeSlider');
    if (!slider) return;

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
    if (!select) return;
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
    renderMap();
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

function renderBarChart(containerId, rows) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (!rows.length || rows.every(function(r) { return r.value === 0; })) {
        container.innerHTML = '<div class="empty-cell">Sin datos</div>';
        return;
    }
    var max = Math.max.apply(null, rows.map(function(r) { return r.value; })) || 1;
    container.innerHTML = rows.map(function(row) {
        var width = Math.round((row.value / max) * 100);
        return '<div class="bar-row"><span class="bar-label" title="' + escapeHtml(row.label) + '">' + escapeHtml(row.label) + '</span>' +
            '<div class="bar-track"><div class="bar-fill ' + (row.color || '') + '" style="width:' + width + '%"></div></div>' +
            '<span class="bar-value">' + row.value + '</span></div>';
    }).join('');
}

function renderTrendChart() {
    var container = document.getElementById('chartTrend');
    if (!container) return;
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
    var w = 600, h = 220;
    var padLeft = 32, padRight = 16, padTop = 24, padBottom = 35;
    var chartW = w - padLeft - padRight;
    var chartH = h - padTop - padBottom;
    var slotW = chartW / keys.length;
    var barW = Math.max(10, slotW - 6);

    var svgParts = [];

    // Horizontal baseline
    svgParts.push('<line x1="' + padLeft + '" y1="' + (padTop + chartH) + '" x2="' + (w - padRight) + '" y2="' + (padTop + chartH) + '" stroke="#cbd5e1" stroke-width="1.5"/>');

    keys.forEach(function(key, i) {
        var val = byDate[key];
        var barH = max > 0 ? (val / max) * chartH : 0;
        var centerX = padLeft + i * slotW + slotW / 2;
        var x = centerX - barW / 2;
        var y = padTop + chartH - barH;

        svgParts.push(
            '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + Math.max(barH, 2) + '" rx="3" fill="#2563eb" opacity="0.88">' +
            '<title>' + formatDateShort(key) + ': ' + val + ' reportes</title></rect>'
        );

        if (val > 0) {
            svgParts.push('<text x="' + centerX + '" y="' + Math.max(y - 4, 14) + '" text-anchor="middle" fill="#1e40af" font-size="10" font-weight="700">' + val + '</text>');
        }

        if (keys.length <= 10 || i % Math.ceil(keys.length / 8) === 0) {
            svgParts.push(
                '<line x1="' + centerX + '" y1="' + (padTop + chartH) + '" x2="' + centerX + '" y2="' + (padTop + chartH + 4) + '" stroke="#cbd5e1" stroke-width="1.5"/>' +
                '<text x="' + centerX + '" y="' + (padTop + chartH + 18) + '" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">' + formatDateShort(key) + '</text>'
            );
        }
    });

    container.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" style="width:100%; height:auto;">' + svgParts.join('') + '</svg>';
}

/**
 * Render Hourly Chart with exact alignment between each bar and its hour label (00:00 - 23:00)
 */
function renderHourlyChart() {
    var container = document.getElementById('chartHourly');
    if (!container) return;

    var hourCounts = new Array(24).fill(0);

    filteredReports.forEach(function(r) {
        var d = parseDate(r.fecha_hora);
        if (d) hourCounts[d.getHours()]++;
    });

    var max = Math.max.apply(null, hourCounts) || 1;
    var peakHour = hourCounts.indexOf(max);
    var peakElement = document.getElementById('peakHourLabel');
    if (peakElement) {
        peakElement.textContent = max > 0
            ? 'Pico: ' + String(peakHour).padStart(2, '0') + ':00 (' + max + ' reportes)'
            : '—';
    }

    var w = 620, h = 260;
    var padLeft = 32, padRight = 16, padTop = 30, padBottom = 45;
    var chartW = w - padLeft - padRight;
    var chartH = h - padTop - padBottom;
    var slotW = chartW / 24;
    var barW = slotW - 3; // 3px gap between bars

    var svgParts = [];

    // Background horizontal grid lines
    [0, 0.5, 1].forEach(function(ratio) {
        var yVal = padTop + chartH * (1 - ratio);
        var labelVal = Math.round(max * ratio);
        svgParts.push(
            '<line x1="' + padLeft + '" y1="' + yVal + '" x2="' + (w - padRight) + '" y2="' + yVal + '" stroke="#e2e8f0" stroke-dasharray="3,3" stroke-width="1"/>' +
            '<text x="' + (padLeft - 6) + '" y="' + (yVal + 4) + '" text-anchor="end" fill="#94a3b8" font-size="10" font-weight="600">' + labelVal + '</text>'
        );
    });

    // Baseline X Axis
    svgParts.push('<line x1="' + padLeft + '" y1="' + (padTop + chartH) + '" x2="' + (w - padRight) + '" y2="' + (padTop + chartH) + '" stroke="#94a3b8" stroke-width="1.5"/>');

    // 24 Hour Bars & Aligned Hour Labels
    hourCounts.forEach(function(val, i) {
        var barH = max > 0 ? (val / max) * chartH : 0;
        var centerX = padLeft + i * slotW + slotW / 2;
        var barX = centerX - barW / 2;
        var y = padTop + chartH - barH;
        var isPeak = (i === peakHour && val > 0);
        var fillColor = isPeak ? '#dc2626' : '#2563eb';
        var hourLabelText = String(i).padStart(2, '0') + ':00';

        // Bar Element with interactive hover
        svgParts.push(
            '<rect class="hourly-bar' + (isPeak ? ' peak' : '') + '" x="' + barX + '" y="' + y + '" width="' + barW + '" height="' + Math.max(barH, 2) + '" rx="3" fill="' + fillColor + '" opacity="' + (val > 0 ? '0.9' : '0.25') + '">' +
            '<title>Hora: ' + hourLabelText + ' - ' + String(i).padStart(2, '0') + ':59\nReportes: ' + val + '</title>' +
            '</rect>'
        );

        // Value text above bar if count > 0
        if (val > 0) {
            svgParts.push(
                '<text x="' + centerX + '" y="' + Math.max(y - 4, 14) + '" text-anchor="middle" fill="' + (isPeak ? '#dc2626' : '#1e40af') + '" font-size="10" font-weight="700">' + val + '</text>'
            );
        }

        // Tick mark pointing directly under the center of the bar
        svgParts.push(
            '<line x1="' + centerX + '" y1="' + (padTop + chartH) + '" x2="' + centerX + '" y2="' + (padTop + chartH + 5) + '" stroke="#94a3b8" stroke-width="1.2"/>'
        );

        // HOUR LABEL DIRECTLY ALIGNED UNDER ITS CORRESPONDING BAR
        // Show label for every 2 hours + hour 23 so the x-axis is cleanly legible and 100% unambiguous
        if (i % 2 === 0 || i === 23) {
            svgParts.push(
                '<text x="' + centerX + '" y="' + (padTop + chartH + 20) + '" text-anchor="middle" fill="#475569" font-size="10.5" font-weight="700">' + hourLabelText + '</text>'
            );
        }
    });

    container.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" style="width:100%; height:auto;">' + svgParts.join('') + '</svg>';
}

function renderDonutChart() {
    var counts = { asalto: 0, accidente: 0, medica: 0, otro: 0 };
    filteredReports.forEach(function(r) { counts[normalizeType(r.tipo_reporte)]++; });

    var total = filteredReports.length;
    var donut = document.getElementById('chartDonutType');
    var legend = document.getElementById('legendType');
    if (!donut || !legend) return;

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
    if (!container) return;

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
    if (!list) return;

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
    if (!container) return;

    container.innerHTML =
        '<div class="exec-metric"><span>Georreferenciados</span><strong>' + pct(geo, total) + '%</strong></div>' +
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
    if (!tbody) return;

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
    var mapSummaryEl = document.getElementById('mapSummary');
    var geoReports = filteredReports.filter(hasCoords);
    if (mapSummaryEl) {
        mapSummaryEl.textContent = geoReports.length + ' reportes georreferenciados en tiempo real';
    }

    if (!heatLayer) return;

    if (!geoReports.length) {
        heatLayer.setLatLngs([]);
        return;
    }

    heatLayer.setLatLngs(geoReports.map(function(r) {
        return [Number(r.latitud), Number(r.longitud), 1];
    }));

    if (map) {
        setTimeout(function() {
            map.invalidateSize();
        }, 150);
    }
}

function fitMapBounds() {
    var geoReports = filteredReports.filter(hasCoords);
    if (!geoReports.length || !map) return;
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
    var slider = document.getElementById('timeSlider');
    if (slider && slider.noUiSlider) {
        slider.noUiSlider.set([0, 1440]);
    }
    applyFilters();
}

function setConnectionState(state, message) {
    var dot = document.getElementById('connectionDot');
    if (dot) {
        dot.classList.remove('online', 'offline');
        dot.classList.add(state);
    }
    var textEl = document.getElementById('connectionText');
    if (textEl) textEl.textContent = message;
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
            var lastUpEl = document.getElementById('lastUpdate');
            if (lastUpEl) {
                lastUpEl.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-EC');
            }
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
    var el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', applyFilters);
        el.addEventListener('change', applyFilters);
    }
});

var btnReset = document.getElementById('btnResetFilters');
if (btnReset) btnReset.addEventListener('click', resetFilters);

var btnFit = document.getElementById('btnFitBounds');
if (btnFit) btnFit.addEventListener('click', fitMapBounds);

initMap();
initTimeSlider();
loadUsuarios();
connectAlertas();
