// Configuración inicial del Mapa (Centrado en Riobamba)
const map = L.map('map').setView([-1.6669, -78.6521], 13);

// Capa base de OpenStreetMap
const mapaBase = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors | SICOA'
}).addTo(map);

// Variables globales
let markersLayer = L.layerGroup().addTo(map);
let allEvents = []; 

// --- Capas de GeoServer ---
const urlGeoServer = "https://school-invite-aspects-minimize.trycloudflare.com/geoserver";
const urlWms = `${urlGeoServer}/geoalerta/wms`;

map.createPane("panelVias");
map.getPane("panelVias").style.zIndex = "410";
map.getPane("panelVias").style.pointerEvents = "none";

map.createPane("panelLimiteHalo");
map.getPane("panelLimiteHalo").style.zIndex = "425";
map.getPane("panelLimiteHalo").style.pointerEvents = "none";

map.createPane("panelLimite");
map.getPane("panelLimite").style.zIndex = "430";
map.getPane("panelLimite").style.pointerEvents = "none";

const capaVias = L.tileLayer.wms(urlWms, {
    layers: "geoalerta:riobamba_vias_urbanas",
    styles: "vias_geoalerta",
    format: "image/png",
    transparent: true,
    version: "1.1.1",
    tiled: true,
    opacity: 0.82,
    pane: "panelVias",
}).addTo(map);

const capaLimiteHalo = L.geoJSON(null, {
    pane: "panelLimiteHalo",
    interactive: false,
    style: { color: "#FFFFFF", weight: 8, opacity: 0.96, fillOpacity: 0, lineCap: "round", lineJoin: "round" }
});

const capaLimitePrincipal = L.geoJSON(null, {
    pane: "panelLimite",
    interactive: false,
    style: { color: "#6D28D9", weight: 4, opacity: 1, fillColor: "#6D28D9", fillOpacity: 0.025, lineCap: "round", lineJoin: "round" }
});

const capaLimite = L.layerGroup([capaLimiteHalo, capaLimitePrincipal]).addTo(map);

// Cargar limite urbano por WFS
async function cargarLimiteUrbano() {
    const url = `${urlGeoServer}/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=geoalerta:riobamba_limite_urbano&outputFormat=application/json&srsName=EPSG:4326`;
    try {
        const respuesta = await fetch(url, { method: "GET", cache: "no-store", headers: { Accept: "application/json" }});
        if (respuesta.ok) {
            const geojson = await respuesta.json();
            capaLimiteHalo.addData(geojson);
            capaLimitePrincipal.addData(geojson);
        }
    } catch (e) {
        console.error("Error cargando limite urbano:", e);
    }
}
cargarLimiteUrbano();

// Añadir control de capas
const baseLayers = {
    "OpenStreetMap": mapaBase
};
const overlayLayers = {
    "Límite urbano": capaLimite,
    "Vías urbanas": capaVias,
    "Reportes": markersLayer
};
L.control.layers(baseLayers, overlayLayers, {position: 'topright'}).addTo(map);


// Función para conectarse al WebSocket real
// API_URL y WS_URL provienen de ../config.js
function conectarWebSocket() {
    const badge = document.getElementById('connectionBadge');
    badge.textContent = 'Conectando...';
    
    const wsUrl = WS_URL + '/ws/alertas';
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        badge.textContent = 'Conectado (WS)';
        badge.classList.remove('offline');
        badge.classList.add('online');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Transformar los datos de la DB al formato que usa el mapa
            allEvents = data.map(item => {
                // La API ya devuelve latitud y longitud directamente
                const lat = item.latitud || 0;
                const lng = item.longitud || 0;
                
                return {
                    id: item.id,
                    lat: lat,
                    lng: lng,
                    fecha_hora: item.fecha_hora || '',
                    nombres: (item.nombres || '') + " " + (item.apellidos || ''),
                    genero: item.genero || 'No especificado',
                    edad: item.edad || 0,
                    tipo: item.tipo_reporte || 'Desconocido',
                    descripcion: item.descripcion || ''
                };
            });

            
            aplicarFiltros(); // Renderiza usando los filtros actuales
            

        } catch (error) {
            console.error('Error parseando datos:', error);
        }
    };

    ws.onclose = () => {
        badge.textContent = 'Sin conexión';
        badge.classList.remove('online');
        badge.classList.add('offline');
        // Reintentar conexión en 3 segundos
        setTimeout(conectarWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
        ws.close();
    };
}

function getIconDataForType(tipo) {
    let iconClass = 'fa-solid fa-bell';
    let bgClass = 'icon-default';
    let t = tipo.toLowerCase();
    
    if (t.includes('robo') || t.includes('asalto') || t.includes('sospechoso')) {
        iconClass = 'fa-solid fa-person-rifle';
        bgClass = 'icon-robo';
    } else if (t.includes('accidente') || t.includes('choque')) {
        iconClass = 'fa-solid fa-car-burst';
        bgClass = 'icon-accidente';
    } else if (t.includes('medica') || t.includes('salud') || t.includes('médica')) {
        iconClass = 'fa-solid fa-truck-medical';
        bgClass = 'icon-medico';
    } else if (t.includes('incendio')) {
        iconClass = 'fa-solid fa-fire';
        bgClass = 'icon-robo';
    }
    
    return { iconClass, bgClass };
}

function getIconForType(tipo) {
    const { iconClass, bgClass } = getIconDataForType(tipo);

    return L.divIcon({
        html: `<div class="custom-map-icon ${bgClass}" style="width:100%; height:100%;"><i class="${iconClass}"></i></div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

// Función para renderizar los puntos en el mapa y la tabla
function renderEvents(events) {
    markersLayer.clearLayers();
    const tableBody = document.getElementById('logTableBody');
    tableBody.innerHTML = '';
    
    document.getElementById('activeEvents').textContent = events.length;
    const eventsToRender = events.slice(-50).reverse(); // Últimos 50, más recientes arriba

    eventsToRender.forEach(ev => {
        const marker = L.marker([ev.lat, ev.lng], {
            icon: getIconForType(ev.tipo)
        });

        const popupContent = `
            <b>Alerta: ${ev.tipo}</b><br>
            <strong>Víctima:</strong> ${ev.nombres}<br>
            <strong>Género:</strong> ${ev.genero}<br>
            <strong>Edad:</strong> ${ev.edad} años<br>
            <strong>Fecha:</strong> ${ev.fecha_hora ? ev.fecha_hora.substring(0,16) : ''}<br>
            <strong>Detalle:</strong> ${ev.descripcion}
        `;
        marker.bindPopup(popupContent);
        markersLayer.addLayer(marker);

        let genderIcon = '<i class="fa-solid fa-user" style="color: #64748b; margin-right: 8px;"></i>';
        if (ev.genero === 'Masculino') {
            genderIcon = '<i class="fa-solid fa-person" style="color: #3b82f6; margin-right: 8px;"></i>';
        } else if (ev.genero === 'Femenino') {
            genderIcon = '<i class="fa-solid fa-person-dress" style="color: #ec4899; margin-right: 8px;"></i>';
        }

        const { iconClass, bgClass } = getIconDataForType(ev.tipo);
        const alertHtml = `<div style="display:flex; align-items:center; gap:8px;"><div class="custom-map-icon ${bgClass}" style="width:24px; height:24px; position:static;"><i class="${iconClass}" style="font-size: 10px;"></i></div><span style="font-size:0.8rem; font-weight:600;">${ev.tipo}</span></div>`;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: 500; display:flex; align-items:center;">${genderIcon} ${ev.nombres}</td>
            <td>${ev.edad}<br><span style="font-size:0.7rem;color:#64748b">años</span></td>
            <td>${alertHtml}</td>
        `;
        // Add click event to row for centering map instead of a separate button
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => centrarMapa(ev.lat, ev.lng));
        
        tableBody.appendChild(row);
    });
}

// Función para centrar el mapa desde la tabla
window.centrarMapa = function(lat, lng) {
    map.setView([lat, lng], 17);
}

// Lógica de Filtros y Sliders
let filterValues = {
    gender: 'Todos',
    timeMin: 0,
    timeMax: 1440
};

// Filter Cards Logic
function setupFilterCards(containerId, inputId, filterKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const cards = container.querySelectorAll('.filter-card');
    const input = document.getElementById(inputId);
    
    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            input.value = card.dataset.value;
            filterValues[filterKey] = card.dataset.value;
            if (allEvents.length > 0) aplicarFiltros();
        });
    });
}
setupFilterCards('genderCards', 'filterGender', 'gender');
setupFilterCards('typeCards', 'filterType', 'type');

// Time Slider (0 to 1440 minutes)
const sliderTime = document.getElementById('slider-time');
noUiSlider.create(sliderTime, {
    start: [0, 1440],
    connect: true,
    range: { 'min': 0, 'max': 1440 },
    step: 30
});
function formatMinutes(minutes) {
    let h = Math.floor(minutes / 60);
    let m = Math.floor(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
sliderTime.noUiSlider.on('update', function (values) {
    let min = parseInt(values[0]);
    let max = parseInt(values[1]);
    document.getElementById('time-min').textContent = formatMinutes(min);
    document.getElementById('time-max').textContent = formatMinutes(max);
    filterValues.timeMin = min;
    filterValues.timeMax = max;
    if (allEvents.length > 0) aplicarFiltros();
});


function aplicarFiltros() {
    filterValues.gender = document.getElementById('filterGender').value;
    filterValues.type = document.getElementById('filterType').value;
    const dateMinStr = document.getElementById('filterDateMin').value;
    const dateMaxStr = document.getElementById('filterDateMax').value;
    const ageMin = parseInt(document.getElementById('filterAgeMin').value);
    const ageMax = parseInt(document.getElementById('filterAgeMax').value);

    // Convert date strings to timestamps if they exist
    const dateMinTs = dateMinStr ? new Date(dateMinStr + 'T00:00:00').getTime() : null;
    const dateMaxTs = dateMaxStr ? new Date(dateMaxStr + 'T23:59:59').getTime() : null;

    const filteredEvents = allEvents.filter(ev => {
        let match = true;
        if (filterValues.gender !== 'Todos' && ev.genero !== filterValues.gender) match = false;
        
        if (filterValues.type && filterValues.type !== 'Todos') {
            const evTipo = ev.tipo.toLowerCase();
            const ft = filterValues.type.toLowerCase();
            // 'Medica' might have accent
            if (ft === 'medica' && !evTipo.includes('medica') && !evTipo.includes('médica') && !evTipo.includes('salud')) match = false;
            else if (ft === 'robo' && !evTipo.includes('robo') && !evTipo.includes('asalto') && !evTipo.includes('sospechoso')) match = false;
            else if (ft === 'accidente' && !evTipo.includes('accidente') && !evTipo.includes('choque')) match = false;
        }
        
        // Age filter
        if (!isNaN(ageMin) && ev.edad < ageMin) match = false;
        if (!isNaN(ageMax) && ev.edad > ageMax) match = false;
        
        if (ev.fecha_hora) {
            // "2024-05-10 14:30:00" -> Safari/iOS might need "2024-05-10T14:30:00"
            const safeDateStr = ev.fecha_hora.replace(' ', 'T');
            const evDateObj = new Date(safeDateStr);
            const evTimeMs = evDateObj.getTime();
            
            // Check Date Range
            if (dateMinTs && evTimeMs < dateMinTs) match = false;
            if (dateMaxTs && evTimeMs > dateMaxTs) match = false;
            
            // Check Time Range
            const evMinutes = evDateObj.getHours() * 60 + evDateObj.getMinutes();
            if (evMinutes < filterValues.timeMin || evMinutes > filterValues.timeMax) match = false;
        }
        return match;
    });

    renderEvents(filteredEvents);
}

// Attach change listeners to standard inputs
['filterType', 'filterDateMin', 'filterDateMax', 'filterAgeMin', 'filterAgeMax'].forEach(id => {
    document.getElementById(id).addEventListener('change', aplicarFiltros);
    document.getElementById(id).addEventListener('input', aplicarFiltros);
});

// Limpiar filtros
document.getElementById('btnClearFilters').addEventListener('click', () => {
    // Reset gender cards
    const genderCards = document.querySelectorAll('#genderCards .filter-card');
    genderCards.forEach(c => c.classList.remove('active'));
    document.querySelector('#genderCards .filter-card[data-value="Todos"]').classList.add('active');
    document.getElementById('filterGender').value = 'Todos';

    // Reset type cards
    const typeCards = document.querySelectorAll('#typeCards .filter-card');
    typeCards.forEach(c => c.classList.remove('active'));
    document.querySelector('#typeCards .filter-card[data-value="Todos"]').classList.add('active');
    document.getElementById('filterType').value = 'Todos';

    // Reset standard inputs
    document.getElementById('filterDateMin').value = '';
    document.getElementById('filterDateMax').value = '';
    document.getElementById('filterAgeMin').value = '';
    document.getElementById('filterAgeMax').value = '';

    // Reset slider
    sliderTime.noUiSlider.set([0, 1440]);
    
    // aplicarFiltros is called by slider update
});

// Inicializar conexión
setTimeout(conectarWebSocket, 500);