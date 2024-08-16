document.addEventListener('DOMContentLoaded', function() {
    // Remove any existing cursors
    document.querySelectorAll('.cursor').forEach(cursor => cursor.remove());

    // Mousemove event for both desktop and mobile
    document.addEventListener('mousemove', function(e) {
        createTrail(e.pageX, e.pageY);
    });

    // Touchmove event for mobile devices
    document.addEventListener('touchmove', function(e) {
        let touch = e.touches[0];
        createTrail(touch.pageX, touch.pageY);
    });

    function createTrail(x, y) {
        let cursor = document.createElement('div');
        cursor.className = 'cursor';
        document.body.appendChild(cursor);

        cursor.style.left = x + 'px';
        cursor.style.top = y + 'px';

        // Animate the trail effect
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.opacity = '1';

        // Fade out and remove the cursor element after a short delay
        setTimeout(() => {
            cursor.style.transform = 'translate(-50%, -50%) scale(0.5)';
            cursor.style.opacity = '0';
        }, 100);

        // Remove the cursor element from the DOM after the animation ends
        setTimeout(() => {
            cursor.remove();
        }, 500);
    }
});
