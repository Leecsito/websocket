document.addEventListener('DOMContentLoaded', () => {
    // Animación simple de entrada para elementos visuales
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Seleccionar elementos a animar
    const animatedElements = document.querySelectorAll('.fade-in-up');
    
    // Pequeño retraso para que la carga inicial se vea fluida
    setTimeout(() => {
        animatedElements.forEach(el => {
            observer.observe(el);
        });
    }, 100);

    // Carousel logic
    const slides = document.querySelectorAll('.carousel-img');
    const indicators = document.querySelectorAll('.indicator');
    let currentSlide = 0;
    
    if (slides.length > 0) {
        function showSlide(index) {
            slides.forEach(slide => slide.classList.remove('active'));
            indicators.forEach(ind => ind.classList.remove('active'));
            
            slides[index].classList.add('active');
            indicators[index].classList.add('active');
            currentSlide = index;
        }

        function nextSlide() {
            let next = (currentSlide + 1) % slides.length;
            showSlide(next);
        }

        let slideInterval = setInterval(nextSlide, 4000);

        indicators.forEach((indicator, index) => {
            indicator.addEventListener('click', () => {
                clearInterval(slideInterval);
                showSlide(index);
                slideInterval = setInterval(nextSlide, 4000);
            });
        });
    }
});