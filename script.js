document.addEventListener('DOMContentLoaded', function() {
    // Check if the device is touch-capable
    if ('ontouchstart' in window || navigator.maxTouchPoints) {
        // If it's a touch device, hide the custom cursor
        document.querySelectorAll('.cursor').forEach(cursor => {
            cursor.style.display = 'none';
        });
    } else {
        // Mousemove event for non-touch devices
        document.addEventListener('mousemove', function(e) {
            let cursor = document.createElement('div');
            cursor.className = 'cursor';
            document.body.appendChild(cursor);

            cursor.style.left = e.pageX + 'px';
            cursor.style.top = e.pageY + 'px';

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
            }, 500); // Extend the time to see the trail longer
        });
    }
});
