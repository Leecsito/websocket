function initHeader() {
    const navLinks = document.querySelectorAll('.main-nav a');
    const profile = document.querySelector('.profile');

    if (navLinks) {
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                navLinks.forEach(l => l.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
    }

    if (profile) {
        profile.addEventListener('click', () => {
            profile.classList.toggle('active');
        });
    }
}

document.addEventListener('DOMContentLoaded', initHeader);
document.addEventListener('headerLoaded', initHeader);