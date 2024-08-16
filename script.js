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
        cursor.style.transform = 'translate(-50%, -50%) scale(0)';
        cursor.style.opacity = '0';
    }, 200); // Longer duration to make the trail more visible

    // Remove the cursor element from the DOM after the animation ends
    setTimeout(() => {
        cursor.remove();
    }, 600); // Make sure to remove the element after it fades out
});
