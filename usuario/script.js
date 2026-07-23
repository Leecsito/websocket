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
    var source = user.nombre || user.email || user.phone || 'U';
    return source.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(function(part) {
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
        var name = user.nombre || 'Usuario sin nombre';
        return '' +
            '<tr>' +
                '<td><div class="user-cell"><span class="user-avatar">' + escapeHtml(initials(user)) + '</span><span>' + escapeHtml(name) + '</span></div></td>' +
                '<td>' + (user.email ? escapeHtml(user.email) : '<span class="muted">Sin correo</span>') + '</td>' +
                '<td>' + (user.phone ? escapeHtml(user.phone) : '<span class="muted">Sin telefono</span>') + '</td>' +
                '<td>' + formatDate(user.created_at) + '</td>' +
                '<td>' + formatDate(user.last_sign_in_at) + '</td>' +
            '</tr>';
    }).join('');
}

function applySearch() {
    var query = searchInput.value.trim().toLowerCase();
    filteredUsuarios = usuarios.filter(function(user) {
        var text = [
            user.nombre,
            user.email,
            user.phone,
            user.id
        ].join(' ').toLowerCase();
        return !query || text.indexOf(query) !== -1;
    });
    renderUsuarios();
}

function loadUsuarios() {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Cargando usuarios...</td></tr>';
    fetch(API_URL + '/usuarios', { cache: 'no-store' })
        .then(function(response) {
            if (!response.ok) throw new Error('Error HTTP ' + response.status);
            return response.json();
        })
        .then(function(data) {
            usuarios = Array.isArray(data) ? data : [];
            filteredUsuarios = usuarios.slice();
            applySearch();
        })
        .catch(function(error) {
            console.error('Error cargando usuarios:', error);
            totalUsers.textContent = '0';
            tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No se pudieron cargar los usuarios.</td></tr>';
        });
}

searchInput.addEventListener('input', applySearch);
btnReload.addEventListener('click', loadUsuarios);

loadUsuarios();
