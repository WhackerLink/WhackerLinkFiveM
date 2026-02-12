/*
* WhackerLink - WhackerLinkFiveM
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* Copyright (C) 2024 Caleb, K4PHP
*
*/

let isDragging = false;
let isScaling = false;
let scaleFactor = 1;

const radioContainer = document.getElementById('radio-container');
radioContainer.style.transformOrigin = 'right bottom';

function clampRadioToViewport() {
    const rect = radioContainer.getBoundingClientRect();
    const maxRight = Math.max(window.innerWidth - rect.width, 0);
    const maxBottom = Math.max(window.innerHeight - rect.height, 0);

    const currentRight =
        parseFloat(radioContainer.style.right) ||
        Math.max(window.innerWidth - rect.right, 0);
    const currentBottom =
        parseFloat(radioContainer.style.bottom) ||
        Math.max(window.innerHeight - rect.bottom, 0);

    const clampedRight = Math.min(Math.max(currentRight, 0), maxRight);
    const clampedBottom = Math.min(Math.max(currentBottom, 0), maxBottom);

    radioContainer.style.right = `${clampedRight}px`;
    radioContainer.style.bottom = `${clampedBottom}px`;
    radioContainer.style.left = 'auto';
    radioContainer.style.top = 'auto';
    radioContainer.style.position = 'absolute';
}

function saveUIState() {
    const uiState = {
        right: radioContainer.style.right || null,
        bottom: radioContainer.style.bottom || null,
        position: radioContainer.style.position || null,
        transform: `scale(${scaleFactor})` || null,
        scale: scaleFactor
    };

    fetch(`https://${GetParentResourceName()}/saveUIState`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiState, model: radioModel })
    }).then(response => response.json())
        .then(data => {
            if (data.status !== 'success') {
                console.error('Failed to save UI state');
            }
        }).catch(err => console.error('Error saving UI state:', err));
}

function loadUIState() {
    fetch(`https://${GetParentResourceName()}/loadUIState`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: radioModel })
    }).then(response => response.json())
        .then(data => {
            const uiState = data.uiState;

            if (uiState) {
                if (uiState.right) radioContainer.style.right = uiState.right;
                if (uiState.bottom) radioContainer.style.bottom = uiState.bottom;
                if (uiState.position) radioContainer.style.position = uiState.position;
                if (uiState.scale) scaleFactor = uiState.scale;

                if (uiState.transform) {
                    const match = uiState.transform.match(/scale\(([\d.]+)\)/);
                    if (match) {
                        scaleFactor = parseFloat(match[1]);
                        radioContainer.style.transform = uiState.transform;
                    }
                }

                console.log("Used loaded UI state");
            } else {
                console.log("No UI state set");
                radioContainer.style.right = null;
                radioContainer.style.bottom = null;
                radioContainer.style.left = 'auto';
                radioContainer.style.top = 'auto';
                radioContainer.style.transform = null;
                radioContainer.style.position = null;
                scaleFactor = 1;
                resetUI();
                loadRadioModelAssets(radioModel);
            }
        })
        .catch(err => {
            console.error('Failed to load UI state:', err);
            resetUI();
            loadRadioModelAssets(radioModel);
        });
}

function resetUI() {
    radioContainer.style.right = null;
    radioContainer.style.bottom = null;
    radioContainer.style.left = 'auto';
    radioContainer.style.top = 'auto';
    radioContainer.style.transform = null;
    radioContainer.style.position = null;
    scaleFactor = 1;
}

radioContainer.addEventListener('mousedown', (e) => {
    if (!isDragging) return;

    const rect = radioContainer.getBoundingClientRect();
    const offsetX = e.clientX - rect.right + rect.width;
    const offsetY = e.clientY - rect.bottom + rect.height;

    const onMouseMove = (e) => {
        const newRight = window.innerWidth - e.clientX - offsetX;
        const newBottom = window.innerHeight - e.clientY - offsetY;
        radioContainer.style.right = `${newRight}px`;
        radioContainer.style.bottom = `${newBottom}px`;
        radioContainer.style.left = 'auto';
        radioContainer.style.top = 'auto';
        radioContainer.style.position = 'absolute';
        clampRadioToViewport();
        saveUIState();
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        saveUIState();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
});

radioContainer.addEventListener('wheel', (e) => {
    if (!isScaling) return;

    e.preventDefault();
    scaleFactor += e.deltaY > 0 ? -0.05 : 0.05;
    scaleFactor = Math.min(Math.max(scaleFactor, 0.5), 2);
    radioContainer.style.transform = `scale(${scaleFactor})`;
    clampRadioToViewport();

    saveUIState();
});

document.getElementById('reset-position').addEventListener('click', () => {
    resetUI();
    saveUIState();
});

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

radioContainer.addEventListener('focus', () => {
    radioContainer.classList.add('focus-visible');
});

radioContainer.addEventListener('blur', () => {
    radioContainer.classList.remove('focus-visible');
});

document.addEventListener('DOMContentLoaded', loadUIState);
window.addEventListener('resize', clampRadioToViewport);