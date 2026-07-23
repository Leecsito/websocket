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

function getIconForType(tipo) {
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

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${ev.id}</td>
            <td>${ev.fecha_hora ? ev.fecha_hora.substring(0,16) : ''}</td>
            <td>${ev.nombres}</td>
            <td>${ev.genero} / ${ev.edad}</td>
            <td>${ev.tipo}</td>
            <td><button class="btn-action" onclick="centrarMapa(${ev.lat}, ${ev.lng})">Ubicar</button></td>
        `;
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
    dateMin: 0,
    dateMax: 0,
    timeMin: 0,
    timeMax: 1440,
    ageMin: 0,
    ageMax: 120
};

// Age Slider
const sliderAge = document.getElementById('slider-age');
noUiSlider.create(sliderAge, {
    start: [0, 120],
    connect: true,
    range: { 'min': 0, 'max': 120 },
    step: 1
});
sliderAge.noUiSlider.on('update', function (values) {
    let min = Math.round(values[0]);
    let max = Math.round(values[1]);
    document.getElementById('age-min').textContent = min;
    document.getElementById('age-max').textContent = max;
    filterValues.ageMin = min;
    filterValues.ageMax = max;
    if (allEvents.length > 0) aplicarFiltros();
});

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

// Date Slider (Unix timestamps: 30 days ago to now)
const sliderDate = document.getElementById('slider-date');
const dateMaxNow = new Date();
const dateMinPast = new Date(dateMaxNow.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
noUiSlider.create(sliderDate, {
    start: [dateMinPast.getTime(), dateMaxNow.getTime()],
    connect: true,
    range: {
        'min': dateMinPast.getTime(),
        'max': dateMaxNow.getTime()
    },
    step: 24 * 60 * 60 * 1000 // 1 day
});
function formatDate(ms) {
    const d = new Date(parseInt(ms));
    return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
}
sliderDate.noUiSlider.on('update', function (values) {
    let min = parseInt(values[0]);
    let max = parseInt(values[1]);
    document.getElementById('date-min').textContent = formatDate(min);
    document.getElementById('date-max').textContent = formatDate(max);
    filterValues.dateMin = min;
    filterValues.dateMax = max + (24 * 60 * 60 * 1000) - 1; // End of the selected day
    if (allEvents.length > 0) aplicarFiltros();
});

function aplicarFiltros() {
    filterValues.gender = document.getElementById('filterGender').value;

    const filteredEvents = allEvents.filter(ev => {
        let match = true;
        if (filterValues.gender !== 'Todos' && ev.genero !== filterValues.gender) match = false;
        if (ev.edad < filterValues.ageMin || ev.edad > filterValues.ageMax) match = false;
        
        if (ev.fecha_hora) {
            const evDateObj = new Date(ev.fecha_hora);
            const evTimeMs = evDateObj.getTime();
            
            // Check Date Range
            if (evTimeMs < filterValues.dateMin || evTimeMs > filterValues.dateMax) match = false;
            
            // Check Time Range
            const evMinutes = evDateObj.getHours() * 60 + evDateObj.getMinutes();
            if (evMinutes < filterValues.timeMin || evMinutes > filterValues.timeMax) match = false;
        }
        return match;
    });

    renderEvents(filteredEvents);
}

document.getElementById('filterGender').addEventListener('change', aplicarFiltros);

// Limpiar filtros
document.getElementById('btnClearFilters').addEventListener('click', () => {
    document.getElementById('filterGender').value = 'Todos';
    sliderAge.noUiSlider.set([0, 120]);
    sliderTime.noUiSlider.set([0, 1440]);
    sliderDate.noUiSlider.set([dateMinPast.getTime(), dateMaxNow.getTime()]);
});

// Inicializar conexión
setTimeout(conectarWebSocket, 500);