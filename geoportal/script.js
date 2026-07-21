// Configuración inicial del Mapa (Centrado en Riobamba)
const map = L.map('map').setView([-1.6669, -78.6521], 13);

// Capa base de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors | SICOA'
}).addTo(map);

// ── Capa WMS de GeoServer ─────────────────────────────────────
const urlGeoServerWMS = 'https://michael-photography-savings-commonly.trycloudflare.com/geoserver/seguridad_riobamba/wms';
const capaGeoServer = L.tileLayer.wms(urlGeoServerWMS, {
    layers: 'seguridad_riobamba:geoalerta_capas',
    format: 'image/png',
    transparent: true,
    version: '1.1.0',
    zIndex: 1000
});
capaGeoServer.addTo(map);

// Variables globales
let markersLayer = L.layerGroup().addTo(map);
let allEvents = []; 

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
                let lat = 0, lng = 0;
                if (item.geom) {
                    try {
                        const geo = JSON.parse(item.geom);
                        if (geo.coordinates) {
                            lng = geo.coordinates[0];
                            lat = geo.coordinates[1];
                        }
                    } catch(e) {}
                }
                
                return {
                    id: item.id,
                    lat: lat,
                    lng: lng,
                    fecha: item.fecha || '',
                    hora: item.hora || '',
                    nombres: (item.nombres || '') + " " + (item.apellidos || ''),
                    genero: item.genero || 'No especificado',
                    edad: item.edad || 0,
                    tipo: item.tipo_evento || 'Desconocido',
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

// Función para renderizar los puntos en el mapa y la tabla
function renderEvents(events) {
    markersLayer.clearLayers();
    const tableBody = document.getElementById('logTableBody');
    tableBody.innerHTML = '';
    
    document.getElementById('activeEvents').textContent = events.length;

    events.forEach(ev => {
        const marker = L.circleMarker([ev.lat, ev.lng], {
            radius: 8,
            fillColor: ev.tipo.toLowerCase().includes('robo') || ev.tipo.toLowerCase().includes('asalto') ? '#ef4444' : '#f59e0b',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        });

        const popupContent = `
            <b>Alerta: ${ev.tipo}</b><br>
            <strong>Víctima:</strong> ${ev.nombres}<br>
            <strong>Género:</strong> ${ev.genero}<br>
            <strong>Edad:</strong> ${ev.edad} años<br>
            <strong>Fecha:</strong> ${ev.fecha} ${ev.hora}<br>
            <strong>Detalle:</strong> ${ev.descripcion}
        `;
        marker.bindPopup(popupContent);
        markersLayer.addLayer(marker);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${ev.id}</td>
            <td>${ev.fecha} ${ev.hora.substring(0,5)}</td>
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

// Lógica de Filtros
function aplicarFiltros() {
    const filterGender = document.getElementById('filterGender').value;
    const filterDate = document.getElementById('filterDate').value;
    const filterTime = document.getElementById('filterTime').value;
    const filterAgeMin = parseInt(document.getElementById('filterAgeMin').value) || 0;
    const filterAgeMax = parseInt(document.getElementById('filterAgeMax').value) || 120;

    const filteredEvents = allEvents.filter(ev => {
        let match = true;
        if (filterGender !== 'Todos' && ev.genero !== filterGender) match = false;
        if (filterDate && ev.fecha !== filterDate) match = false;
        if (filterTime && ev.hora < filterTime) match = false;
        if (ev.edad < filterAgeMin || ev.edad > filterAgeMax) match = false;
        return match;
    });

    renderEvents(filteredEvents);
}

document.getElementById('btnApplyFilters').addEventListener('click', aplicarFiltros);

// Limpiar filtros
document.getElementById('btnClearFilters').addEventListener('click', () => {
    document.getElementById('filterGender').value = 'Todos';
    document.getElementById('filterDate').value = '';
    document.getElementById('filterTime').value = '';
    document.getElementById('filterAgeMin').value = '';
    document.getElementById('filterAgeMax').value = '';
    aplicarFiltros();
});

// Botón de forzar actualización 
document.getElementById('btnForceUpdate').addEventListener('click', () => {
    aplicarFiltros(); // Simplemente vuelve a renderizar, el WS ya tiene los datos vivos
});

// Inicializar conexión
setTimeout(conectarWebSocket, 500);