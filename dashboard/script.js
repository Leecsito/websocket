var allReports = [];
var allUsers = [];
var filteredReports = [];
var mapMode = 'markers';

var markersLayer = null;
var heatLayer = null;
var map = null;

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
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
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

function getIconDataForType(tipo) {
    var iconClass = 'fa-solid fa-bell';
    var bgClass = 'icon-default';
    var key = normalizeType(tipo);

    if (key === 'asalto') {
        iconClass = 'fa-solid fa-person-rifle';
        bgClass = 'icon-robo';
    } else if (key === 'accidente') {
        iconClass = 'fa-solid fa-car-burst';
        bgClass = 'icon-accidente';
    } else if (key === 'medica') {
        iconClass = 'fa-solid fa-truck-medical';
        bgClass = 'icon-medico';
    }

    return { iconClass: iconClass, bgClass: bgClass };
}

function hasCoords(report) {
    return report.latitud != null && report.longitud != null &&
        !isNaN(Number(report.latitud)) && !isNaN(Number(report.longitud));
}

function initMap() {
    map = L.map('analysisMap').setView([-1.6669, -78.6521], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap | MegaGeo Security'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    heatLayer = L.heatLayer([], { radius: 22, blur: 18, maxZoom: 17 });
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

function setupPills(containerId, filterKey) {
    var container = document.getElementById(containerId);
    container.querySelectorAll('.pill').forEach(function(button) {
        button.addEventListener('click', function() {
            container.querySelectorAll('.pill').forEach(function(item) {
                item.classList.remove('active');
            });
            button.classList.add('active');
            filters[filterKey] = button.dataset.value;
            applyFilters();
        });
    });
}

function setupMapModeControl() {
    document.querySelectorAll('#mapModeControl button').forEach(function(button) {
        button.addEventListener('click', function() {
            document.querySelectorAll('#mapModeControl button').forEach(function(item) {
                item.classList.remove('active');
            });
            button.classList.add('active');
            mapMode = button.dataset.value;
            renderMap(filteredReports);
        });
    });
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
    filters.status = document.getElementById('statusSelect').value;
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
        var searchText = [
            fullName,
            report.cedula,
            report.tipo_reporte,
            report.descripcion,
            report.celular,
            report.id
        ].join(' ').toLowerCase();

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
    updateKpis();
    renderMap(filteredReports);
    renderCharts(filteredReports);
    renderHotspots(filteredReports);
    renderTable(filteredReports);

    document.getElementById('filterCount').textContent = filteredReports.length + ' resultados';
    document.getElementById('tableCount').textContent = filteredReports.length + ' registros visibles';
}

function updateKpis() {
    var geoCount = filteredReports.filter(hasCoords).length;
    var asaltos = filteredReports.filter(function(r) { return normalizeType(r.tipo_reporte) === 'asalto'; }).length;
    var accidentes = filteredReports.filter(function(r) { return normalizeType(r.tipo_reporte) === 'accidente'; }).length;
    var medicas = filteredReports.filter(function(r) { return normalizeType(r.tipo_reporte) === 'medica'; }).length;

    document.getElementById('kpiFiltered').textContent = filteredReports.length;
    document.getElementById('kpiGeo').textContent = geoCount;
    document.getElementById('kpiAsalto').textContent = asaltos;
    document.getElementById('kpiAccidente').textContent = accidentes;
    document.getElementById('kpiMedica').textContent = medicas;
    document.getElementById('kpiUsers').textContent = allUsers.length;
}

function renderMap(reports) {
    markersLayer.clearLayers();
    if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);

    var geoReports = reports.filter(hasCoords);
    document.getElementById('mapSummary').textContent = geoReports.length + ' puntos georreferenciados';

    if (!geoReports.length) return;

    if (mapMode === 'heat') {
        var heatPoints = geoReports.map(function(report) {
            return [Number(report.latitud), Number(report.longitud), 1];
        });
        heatLayer.setLatLngs(heatPoints);
        heatLayer.addTo(map);
    } else {
        geoReports.forEach(function(report) {
            var iconData = getIconDataForType(report.tipo_reporte);
            var icon = L.divIcon({
                html: '<div class="custom-map-icon ' + iconData.bgClass + '"><i class="' + iconData.iconClass + '"></i></div>',
                className: '',
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            var marker = L.marker([Number(report.latitud), Number(report.longitud)], { icon: icon });
            marker.bindPopup(
                '<strong>' + escapeHtml(report.tipo_reporte) + '</strong><br>' +
                escapeHtml(((report.nombres || '') + ' ' + (report.apellidos || '')).trim()) + '<br>' +
                escapeHtml(formatDateTime(report.fecha_hora)) + '<br>' +
                'Estado: ' + escapeHtml(statusLabel(report.estado_atencion || 'pendiente'))
            );
            markersLayer.addLayer(marker);
        });
    }
}

function fitMapBounds() {
    var geoReports = filteredReports.filter(hasCoords);
    if (!geoReports.length) return;

    var bounds = L.latLngBounds(geoReports.map(function(report) {
        return [Number(report.latitud), Number(report.longitud)];
    }));
    map.fitBounds(bounds.pad(0.15));
}

function renderBarChart(containerId, rows) {
    var container = document.getElementById(containerId);
    if (!rows.length) {
        container.innerHTML = '<div class="empty-cell">Sin datos</div>';
        return;
    }

    var max = Math.max.apply(null, rows.map(function(row) { return row.value; })) || 1;
    container.innerHTML = rows.map(function(row) {
        var width = Math.round((row.value / max) * 100);
        return '' +
            '<div class="bar-row">' +
                '<span class="bar-label">' + escapeHtml(row.label) + '</span>' +
                '<div class="bar-track"><div class="bar-fill ' + (row.color || '') + '" style="width:' + width + '%"></div></div>' +
                '<span class="bar-value">' + row.value + '</span>' +
            '</div>';
    }).join('');
}

function renderCharts(reports) {
    var typeCounts = { asalto: 0, accidente: 0, medica: 0, otro: 0 };
    var hourCounts = [0, 0, 0, 0, 0, 0];
    var statusCounts = { pendiente: 0, en_atencion: 0, cerrada: 0 };

    reports.forEach(function(report) {
        typeCounts[normalizeType(report.tipo_reporte)] += 1;

        var status = report.estado_atencion || 'pendiente';
        if (statusCounts[status] != null) statusCounts[status] += 1;

        var date = parseDate(report.fecha_hora);
        if (date) {
            var hour = date.getHours();
            var bucket = Math.floor(hour / 4);
            hourCounts[bucket] += 1;
        }
    });

    renderBarChart('chartType', [
        { label: 'Asalto', value: typeCounts.asalto, color: 'red' },
        { label: 'Accidente', value: typeCounts.accidente, color: 'amber' },
        { label: 'Emerg. médica', value: typeCounts.medica, color: 'violet' },
        { label: 'Otros', value: typeCounts.otro, color: '' }
    ]);

    renderBarChart('chartHour', [
        { label: '00-03 h', value: hourCounts[0] },
        { label: '04-07 h', value: hourCounts[1] },
        { label: '08-11 h', value: hourCounts[2] },
        { label: '12-15 h', value: hourCounts[3] },
        { label: '16-19 h', value: hourCounts[4] },
        { label: '20-23 h', value: hourCounts[5] }
    ]);

    renderBarChart('chartStatus', [
        { label: 'Pendiente', value: statusCounts.pendiente, color: 'amber' },
        { label: 'En atención', value: statusCounts.en_atencion, color: '' },
        { label: 'Cerrada', value: statusCounts.cerrada, color: 'green' }
    ]);
}

function renderHotspots(reports) {
    var list = document.getElementById('hotspotList');
    var geoReports = reports.filter(hasCoords);

    if (!geoReports.length) {
        list.innerHTML = '<li class="empty-hotspot">No hay puntos georreferenciados con los filtros actuales</li>';
        return;
    }

    var buckets = {};
    geoReports.forEach(function(report) {
        var lat = Number(report.latitud).toFixed(3);
        var lng = Number(report.longitud).toFixed(3);
        var key = lat + ',' + lng;
        if (!buckets[key]) {
            buckets[key] = {
                lat: Number(report.latitud),
                lng: Number(report.longitud),
                count: 0,
                types: {}
            };
        }
        buckets[key].count += 1;
        var typeKey = normalizeType(report.tipo_reporte);
        buckets[key].types[typeKey] = (buckets[key].types[typeKey] || 0) + 1;
    });

    var hotspots = Object.keys(buckets).map(function(key) { return buckets[key]; })
        .sort(function(a, b) { return b.count - a.count; })
        .slice(0, 5);

    list.innerHTML = hotspots.map(function(spot, index) {
        var dominant = Object.keys(spot.types).sort(function(a, b) {
            return spot.types[b] - spot.types[a];
        })[0];

        return '' +
            '<li>' +
                '<span class="hotspot-rank">' + (index + 1) + '</span>' +
                '<div class="hotspot-meta">' +
                    '<strong>' + spot.count + ' reportes</strong>' +
                    '<span>' + typeLabel(dominant) + ' · ' + spot.lat.toFixed(4) + ', ' + spot.lng.toFixed(4) + '</span>' +
                '</div>' +
                '<button type="button" class="ghost-button hotspot-go" data-lat="' + spot.lat + '" data-lng="' + spot.lng + '">' +
                    '<i class="fa-solid fa-crosshairs"></i>' +
                '</button>' +
            '</li>';
    }).join('');

    list.querySelectorAll('.hotspot-go').forEach(function(button) {
        button.addEventListener('click', function() {
            map.setView([Number(button.dataset.lat), Number(button.dataset.lng)], 16);
        });
    });
}

function renderTable(reports) {
    var tbody = document.getElementById('reportTableBody');

    if (!reports.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No hay reportes con los filtros seleccionados.</td></tr>';
        return;
    }

    tbody.innerHTML = reports.slice(0, 100).map(function(report) {
        var fullName = ((report.nombres || '') + ' ' + (report.apellidos || '')).trim() || 'Sin nombre';
        var status = report.estado_atencion || 'pendiente';
        var iconData = getIconDataForType(report.tipo_reporte);
        var coords = hasCoords(report)
            ? '<span class="coords-link" data-lat="' + report.latitud + '" data-lng="' + report.longitud + '">' +
                Number(report.latitud).toFixed(4) + ', ' + Number(report.longitud).toFixed(4) +
              '</span>'
            : '<span class="muted">Sin coordenadas</span>';

        return '' +
            '<tr>' +
                '<td>#' + escapeHtml(report.id) + '</td>' +
                '<td>' + escapeHtml(formatDateTime(report.fecha_hora)) + '</td>' +
                '<td><span class="type-badge"><i class="' + iconData.iconClass + '"></i> ' + escapeHtml(report.tipo_reporte) + '</span></td>' +
                '<td>' + escapeHtml(fullName) + '</td>' +
                '<td>' + escapeHtml(report.edad != null ? report.edad : '-') + '</td>' +
                '<td><span class="status-badge ' + status + '">' + escapeHtml(statusLabel(status)) + '</span></td>' +
                '<td>' + coords + '</td>' +
            '</tr>';
    }).join('');

    tbody.querySelectorAll('.coords-link').forEach(function(link) {
        link.addEventListener('click', function() {
            map.setView([Number(link.dataset.lat), Number(link.dataset.lng)], 17);
        });
    });
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusSelect').value = 'todos';
    document.getElementById('userSelect').value = 'todos';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('ageMin').value = '';
    document.getElementById('ageMax').value = '';

    document.querySelectorAll('#typePills .pill, #genderPills .pill').forEach(function(pill) {
        pill.classList.remove('active');
    });
    document.querySelector('#typePills .pill[data-value="todos"]').classList.add('active');
    document.querySelector('#genderPills .pill[data-value="todos"]').classList.add('active');

    filters.type = 'todos';
    filters.gender = 'todos';
    document.getElementById('timeSlider').noUiSlider.set([0, 1440]);
}

function setConnectionState(state, message) {
    var dot = document.getElementById('connectionDot');
    var text = document.getElementById('connectionText');
    dot.classList.remove('online', 'offline');
    dot.classList.add(state);
    text.textContent = message;
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

    ws.onerror = function() {
        ws.close();
    };
}

function loadUsuarios() {
    fetch(API_URL + '/usuarios', { cache: 'no-store' })
        .then(function(response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(function(data) {
            allUsers = Array.isArray(data) ? data : [];
            populateUserSelect();
            updateKpis();
        })
        .catch(function(error) {
            console.error('Error cargando usuarios:', error);
        });
}

document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('statusSelect').addEventListener('change', applyFilters);
document.getElementById('userSelect').addEventListener('change', applyFilters);
document.getElementById('dateFrom').addEventListener('change', applyFilters);
document.getElementById('dateTo').addEventListener('change', applyFilters);
document.getElementById('ageMin').addEventListener('input', applyFilters);
document.getElementById('ageMax').addEventListener('input', applyFilters);
document.getElementById('btnResetFilters').addEventListener('click', resetFilters);
document.getElementById('btnFitBounds').addEventListener('click', fitMapBounds);

setupPills('typePills', 'type');
setupPills('genderPills', 'gender');
setupMapModeControl();
initMap();
initTimeSlider();
loadUsuarios();
connectAlertas();
