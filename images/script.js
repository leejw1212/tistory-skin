document.addEventListener('DOMContentLoaded', () => {
    // Header shadow on scroll
    const header = document.getElementById('header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
            header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
        } else {
            header.style.boxShadow = 'none';
        }
    });
});
