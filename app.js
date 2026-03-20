const engine = new MapEngine('mapCanvas');

const state = {
    hqs: [
        {"q":0,"r":-17,"s":17,"player":"TURRET ALPHA","colorId":"cyan","isTurret":true},
        {"q":-17,"r":17,"s":0,"player":"TURRET BETA","colorId":"cyan","isTurret":true},
        {"q":17,"r":0,"s":-17,"player":"TURRET GAMMA","colorId":"cyan","isTurret":true}
    ],
    spacing: 1,
    activeColorId: 'cyan',
    moveIdx: -1,
    selectedIdx: -1,
    mouse: { x: 0, y: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    panTotalDist: 0,
    // Mobile-specific state
    lastPinchDist: 0
};

const PALETTE = [
    { id: 'cyan', std: '#00fbff', type: 'neon' }, { id: 'lime', std: '#39ff14', type: 'neon' },
    { id: 'magenta', std: '#ff00ff', type: 'neon' }, { id: 'yellow', std: '#fffb00', type: 'neon' },
    { id: 'orange', std: '#ff6600', type: 'flat' }, { id: 'red', std: '#ff0055', type: 'flat' },
    { id: 'blue', std: '#3498db', type: 'flat' }, { id: 'gray', std: '#7f8c8d', type: 'flat' }
];

function init() {
    engine.generateBaseLayer();
    renderColorDropdown(); // Updated from renderPalette
    attachListeners();
    updateJSONOutput();
    animate();
}

// Updated to handle the grouped <select> in index.html
function renderColorDropdown() {
    const select = document.getElementById('colorSelect');
    if (!select) return;

    select.onchange = (e) => {
        state.activeColorId = e.target.value;
    };
}

function attachListeners() {
    // Resize
    window.addEventListener('resize', () => {
        engine.canvas.width = window.innerWidth;
        engine.canvas.height = window.innerHeight;
    });
    window.dispatchEvent(new Event('resize'));

    /**
     * UNIFIED POINTER LISTENERS (Mobile + Mouse)
     */
    window.addEventListener('pointerdown', e => {
        // Prevent UI clicks from triggering map logic
        if (e.target.closest('#ui-top') || e.target.closest('#sidebar') || e.target.closest('.fab-container') || e.target.closest('.ui-container')) return;
        
        state.isPanning = true;
        state.panStart = { x: e.clientX, y: e.clientY };
        state.panTotalDist = 0;
        document.getElementById('context-menu').style.display = 'none';

        // Essential for mobile dragging
        if (e.target.id === 'mapCanvas') {
            engine.canvas.setPointerCapture(e.pointerId);
        }
    });

    window.addEventListener('pointermove', e => {
        state.mouse = { x: e.clientX, y: e.clientY };
        
        if (state.isPanning) {
            const dx = e.clientX - state.panStart.x;
            const dy = e.clientY - state.panStart.y;
            engine.view.x += dx;
            engine.view.y += dy;
            state.panTotalDist += Math.sqrt(dx*dx + dy*dy);
            state.panStart = { x: e.clientX, y: e.clientY };
        }

        const h = engine.pixelToHex(e.clientX, e.clientY);
        const hud = document.getElementById('coords-hud');
        if (hud) hud.innerText = `Q: ${h.q} R: ${h.r} S: ${h.s}`;
    });

    window.addEventListener('pointerup', e => {
        const wasDrag = state.panTotalDist > 10;
        state.isPanning = false;

        if (!wasDrag && e.target.id === 'mapCanvas') {
            handleMapClick(e);
        }

        if (engine.canvas.releasePointerCapture) {
            engine.canvas.releasePointerCapture(e.pointerId);
        }
    });

    // Handle Wheel Zoom (Desktop)
    engine.canvas.addEventListener('wheel', handleZoom, { passive: false });

    // Handle Pinch Zoom (Mobile)
    engine.canvas.addEventListener('touchmove', e => {
        if (e.touches.length === 2) {
            e.preventDefault(); // Stop page scaling
            const dist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            
            if (state.lastPinchDist > 0) {
                const factor = dist / state.lastPinchDist;
                const midX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
                const midY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
                applyZoom(factor, midX, midY);
            }
            state.lastPinchDist = dist;
        }
    }, { passive: false });

    engine.canvas.addEventListener('touchend', () => {
        state.lastPinchDist = 0;
    });

    // --- REMAINDER OF YOUR ORIGINAL UI LISTENERS ---
    document.getElementById('cb-toggle').onclick = function() {
        this.classList.toggle('active');
        document.body.classList.toggle('cb-mode');
    };

    document.getElementById('center-map').onclick = function() {
        engine.view = { x: 0, y: 0, zoom: 0.8 };
    };

    document.getElementById('spacing-ctrl').oninput = (e) => {
        state.spacing = parseInt(e.target.value);
        const valLabel = document.getElementById('spacing-val');
        if (valLabel) valLabel.innerText = state.spacing;
        updateJSONOutput();
    };

    document.getElementById('menu-move').onclick = () => {
        state.moveIdx = state.selectedIdx;
        document.getElementById('context-menu').style.display = 'none';
    };

    document.getElementById('menu-delete').onclick = () => {
        state.hqs.splice(state.selectedIdx, 1);
        state.selectedIdx = -1;
        document.getElementById('context-menu').style.display = 'none';
        updateJSONOutput();
    };
    
    document.getElementById('btn-copy').onclick = () => {
        const area = document.getElementById('io-area');
        area.select();
        document.execCommand('copy');
    };

    document.getElementById('btn-import').onclick = () => {
        try {
            const data = JSON.parse(document.getElementById('io-area').value);
            state.hqs = data.hqs;
            state.spacing = data.spacing;
            const ctrl = document.getElementById('spacing-ctrl');
            const val = document.getElementById('spacing-val');
            if(ctrl) ctrl.value = state.spacing;
            if(val) val.innerText = state.spacing;
        } catch(e) { alert("Invalid JSON"); }
    };

    document.getElementById('btn-clear').onclick = () => {
        if(confirm("Wipe all non-turret objects?")) {
            state.hqs = state.hqs.filter(h => h.isTurret);
            updateJSONOutput();
        }
    };
}

// Shared zoom logic for Wheel and Pinch
function applyZoom(factor, centerX, centerY) {
    const mouseWorldX = (centerX - engine.canvas.width / 2 - engine.view.x) / engine.view.zoom;
    const mouseWorldY = (centerY - engine.canvas.height / 2 - engine.view.y) / engine.view.zoom;
    
    const newZoom = Math.min(Math.max(engine.view.zoom * factor, 0.1), 5);
    
    engine.view.x -= mouseWorldX * (newZoom - engine.view.zoom);
    engine.view.y -= mouseWorldY * (newZoom - engine.view.zoom);
    engine.view.zoom = newZoom;
}

function handleZoom(e) {
    e.preventDefault();
    const factor = 1 + (e.deltaY > 0 ? -1 : 1) * 0.1;
    applyZoom(factor, e.clientX, e.clientY);
}

// Your original Logic Functions (handleMapClick, checkCollision, showWarning, updateJSONOutput, animate, render)
// ... Keep them exactly as they were ...
