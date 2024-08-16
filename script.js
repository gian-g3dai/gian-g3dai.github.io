document.addEventListener('mousemove', function(e) {
    let cursor = document.querySelector('.cursor');
    cursor.style.left = e.pageX + 'px';
    cursor.style.top = e.pageY + 'px';
    
    cursor.style.transform = 'translate(-50%, -50%) scale(1)';
    cursor.style.opacity = '1';
    
    setTimeout(() => {
        cursor.style.transform = 'translate(-50%, -50%) scale(0.5)';
        cursor.style.opacity = '0';
    }, 100);
});
