        let isDragging = false;
        let isScaling = false;
        let scaleFactor = 1;

        const radioContainer = document.getElementById('radio-container');

        // Enable dragging functionality
        radioContainer.addEventListener('mousedown', (e) => {
            if (!isDragging) return;

            const rect = radioContainer.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;

            const onMouseMove = (e) => {
                radioContainer.style.left = `${e.clientX - offsetX}px`;
                radioContainer.style.top = `${e.clientY - offsetY}px`;
                radioContainer.style.right = 'auto';
                radioContainer.style.bottom = 'auto';
                radioContainer.style.position = 'absolute';
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Enable scaling functionality
        radioContainer.addEventListener('wheel', (e) => {
            if (!isScaling) return;

            e.preventDefault();
            scaleFactor += e.deltaY > 0 ? -0.05 : 0.05;
            scaleFactor = Math.min(Math.max(scaleFactor, 0.5), 2);
            radioContainer.style.transform = `scale(${scaleFactor})`;
        });

        // Toggling drag and scale functionality
        document.getElementById('drag-toggle').addEventListener('click', () => {
            isDragging = !isDragging;
            document.getElementById('drag-toggle').textContent = 
                isDragging ? 'Disable Drag' : 'Enable Drag';
        });

        document.getElementById('scale-toggle').addEventListener('click', () => {
            isScaling = !isScaling;
            document.getElementById('scale-toggle').textContent = 
                isScaling ? 'Disable Scale' : 'Enable Scale';
        });

        // Reset position and scale to default
  document.getElementById('reset-position').addEventListener('click', () => {
    // Remove all inline styles to let CSS defaults take over
    radioContainer.style.left = null;
    radioContainer.style.top = null;
    radioContainer.style.right = null;
    radioContainer.style.bottom = null;
    radioContainer.style.transform = null; // Reset scaling
    radioContainer.style.position = null; // Clear inline position if set
    scaleFactor = 1; // Reset scale factor
});
        // Focus handling for the container
        radioContainer.addEventListener('focus', () => {
            radioContainer.classList.add('focus-visible');
        });

        radioContainer.addEventListener('blur', () => {
            radioContainer.classList.remove('focus-visible');
        });
