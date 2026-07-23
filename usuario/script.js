var usuarios = [];
var filteredUsuarios = [];

var tbody = document.getElementById('usersTableBody');
var totalUsers = document.getElementById('totalUsers');
var searchInput = document.getElementById('searchInput');
var btnReload = document.getElementById('btnReload');

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(value) {
    if (!value) return '<span class="muted">Sin registro</span>';
    var date = new Date(String(value).replace(' ', 'T'));
    if (isNaN(date.getTime())) return '<span class="muted">Sin registro</span>';
    return date.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function initials(user) {
    var name = ((user.nombres || '') + ' ' + (user.apellidos || '')).trim() || 'U';
    return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(function(part) {
        return part.charAt(0).toUpperCase();
    }).join('') || 'U';
}

function renderUsuarios() {
    totalUsers.textContent = filteredUsuarios.length;

    if (!filteredUsuarios.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No hay usuarios para mostrar.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredUsuarios.map(function(user) {
        var name = ((user.nombres || '') + ' ' + (user.apellidos || '')).trim() || 'Usuario sin nombre';
        return '' +
            '<tr>' +
                '<td><div class="user-cell"><span class="user-avatar">' + escapeHtml(initials(user)) + '</span><span>' + escapeHtml(name) + '</span></div></td>' +
                '<td>' + (user.cedula ? escapeHtml(user.cedula) : '<span class="muted">Sin cédula</span>') + '</td>' +
                '<td>' + (user.celular ? escapeHtml(user.celular) : '<span class="muted">Sin teléfono</span>') + '</td>' +
                '<td>' + (user.genero ? escapeHtml(user.genero) : '<span class="muted">-</span>') + '</td>' +
                '<td>' + formatDate(user.fecha_nacimiento) + '</td>' +
            '</tr>';
    }).join('');
}

function applySearch() {
    var query = searchInput.value.trim().toLowerCase();
    filteredUsuarios = usuarios.filter(function(user) {
        var name = ((user.nombres || '') + ' ' + (user.apellidos || '')).trim();
        var text = [
            name,
            user.cedula,
            user.celular,
            user.id
        ].join(' ').toLowerCase();
        return !query || text.indexOf(query) !== -1;
    });
    renderUsuarios();
}

var socket = null;
var reconnectDelay = 3000;

function connectWebSocket() {
    if (!usuarios.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Cargando usuarios...</td></tr>';
    }
    
    if (socket) {
        socket.onclose = null; // Prevent reconnect loop if we force close
        socket.close();
    }
    
    socket = new WebSocket(WS_URL + '/ws/usuarios');

    socket.onopen = function() {
        reconnectDelay = 3000;
    };

    socket.onmessage = function(event) {
        try {
            var data = JSON.parse(event.data);
            usuarios = Array.isArray(data) ? data : [];
            applySearch();
        } catch (error) {
            console.error('Error procesando usuarios:', error);
            totalUsers.textContent = '0';
            tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Error en los datos de usuarios.</td></tr>';
        }
    };

    socket.onclose = function() {
        setTimeout(connectWebSocket, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay + 2000, 15000);
    };

    socket.onerror = function() {
        socket.close();
    };
}

searchInput.addEventListener('input', applySearch);
btnReload.addEventListener('click', connectWebSocket);

connectWebSocket();
