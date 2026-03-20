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
    panTotalDist: 0
};

const PALETTE = [
    { id: 'cyan', std: '#00fbff' }, { id: 'lime', std: '#39ff14' },
    { id: 'magenta', std: '#ff00ff' }, { id: 'yellow', std: '#fffb00' },
    { id: 'orange', std: '#ff6600' }, { id: 'red', std: '#ff0055' }
];

function init() {
    engine.generateBaseLayer();
    renderPalette();
    attachListeners();
    updateJSONOutput();
    animate();
}

function renderPalette() {
    const container = document.getElementById('palette-container');
    container.innerHTML = PALETTE.map(c => `
        <div class="swatch ${state.activeColorId === c.id ? 'active' : ''}" 
             style="background-color: ${c.std}" 
             onclick="setActiveColor('${c.id}')"></div>
    `).join('');
}

window.setActiveColor = (id) => {
    state.activeColorId = id;
    renderPalette();
};

function attachListeners() {
    // Resize
    window.addEventListener('resize', () => {
        engine.canvas.width = window.innerWidth;
        engine.canvas.height = window.innerHeight;
    });
    window.dispatchEvent(new Event('resize'));

    // Panning & Interaction (Mouse Down)
    window.addEventListener('mousedown', e => {
        if (e.target.closest('#ui-top') || e.target.closest('#sidebar') || e.target.closest('.fab-container')) return;
        state.isPanning = true;
        state.panStart = { x: e.clientX, y: e.clientY };
        state.panTotalDist = 0;
        document.getElementById('context-menu').style.display = 'none';
    });

    // Panning & Hover (Mouse Move)
    window.addEventListener('mousemove', e => {
        state.mouse = { x: e.clientX, y: e.clientY };
        
        if (state.isPanning) {
            const dx = e.clientX - state.panStart.x;
            const dy = e.clientY - state.panStart.y;
            engine.view.x += dx;
            engine.view.y += dy;
            state.panTotalDist += Math.abs(dx) + Math.abs(dy);
            state.panStart = { x: e.clientX, y: e.clientY };
        }

        const h = engine.pixelToHex(e.clientX, e.clientY);
        document.getElementById('coords-hud').innerText = `Q: ${h.q} R: ${h.r} S: ${h.s}`;
    });

    // Panning End & Click Logic (Mouse Up)
    window.addEventListener('mouseup', e => {
        const wasDrag = state.panTotalDist > 10;
        state.isPanning = false;

        if (!wasDrag && e.target.id === 'mapCanvas') {
            handleMapClick(e);
        }
    });

    // Zoom (Mouse Wheel)
    engine.canvas.addEventListener('wheel', handleZoom, { passive: false });

    // UI Buttons & Inputs
    document.getElementById('cb-toggle').onclick = function() {
        this.classList.toggle('active');
        document.body.classList.toggle('cb-mode');
    };

    document.getElementById('center-map').onclick = function() {
        engine.view = { x: 0, y: 0, zoom: 0.8 };
    };

    document.getElementById('spacing-ctrl').oninput = (e) => {
        state.spacing = parseInt(e.target.value);
        document.getElementById('spacing-val').innerText = state.spacing;
        updateJSONOutput();
    };

    // Context Menu Actions
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
    
    // JSON I/O
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
            document.getElementById('spacing-ctrl').value = state.spacing;
            document.getElementById('spacing-val').innerText = state.spacing;
        } catch(e) { alert("Invalid JSON"); }
    };

    document.getElementById('btn-clear').onclick = () => {
        if(confirm("Wipe all non-turret objects?")) {
            state.hqs = state.hqs.filter(h => h.isTurret);
            updateJSONOutput();
        }
    };
}

function handleZoom(e) {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const factor = 1 + (e.deltaY > 0 ? -1 : 1) * zoomSpeed;
    const mouseWorldX = (e.clientX - engine.canvas.width / 2 - engine.view.x) / engine.view.zoom;
    const mouseWorldY = (e.clientY - engine.canvas.height / 2 - engine.view.y) / engine.view.zoom;
    const newZoom = Math.min(Math.max(engine.view.zoom * factor, 0.1), 5);
    
    engine.view.x -= mouseWorldX * (newZoom - engine.view.zoom);
    engine.view.y -= mouseWorldY * (newZoom - engine.view.zoom);
    engine.view.zoom = newZoom;
}

function handleMapClick(e) {
    const hex = engine.pixelToHex(e.clientX, e.clientY);
    
    // 1. Check if clicking an existing HQ
    const hIdx = state.hqs.findIndex(h => engine.getDistance(hex, h) <= (h.isTurret ? 3 : 1));
    if (hIdx > -1 && state.moveIdx === -1) {
        state.selectedIdx = hIdx; 
        const menu = document.getElementById('context-menu');
        menu.style.display = 'block'; 
        menu.style.left = e.clientX + 'px'; 
        menu.style.top = e.clientY + 'px';
        return;
    }

    // 2. Validate Placement
    const error = checkCollision(hex, state.moveIdx);
    if (error) {
        showWarning(error);
        return;
    }

    // 3. Process Placement (Move or New)
    if (state.moveIdx > -1) {
        state.hqs[state.moveIdx] = { ...state.hqs[state.moveIdx], ...hex };
        state.moveIdx = -1;
        updateJSONOutput();
    } else {
        const nameInput = document.getElementById('player-name');
        const names = nameInput.value.split(',').map(n => n.trim()).filter(n => n);
        
        if (names.length > 0) {
            const isRandom = document.getElementById('random-toggle').checked;
            const finalColor = isRandom ? PALETTE[Math.floor(Math.random() * PALETTE.length)].id : state.activeColorId;
            
            state.hqs.push({
                ...hex,
                player: names.shift(),
                colorId: finalColor,
                isTurret: false
            });
            nameInput.value = names.join(', ');
            updateJSONOutput();
        }
    }
}

function checkCollision(target, excludeIdx = -1) {
    const d = (Math.abs(target.q) + Math.abs(target.r) + Math.abs(target.s)) / 2;
    if (d <= 18.5) return "RESTRICTED AREA";
    
    for (let i = 0; i < state.hqs.length; i++) {
        if (i === excludeIdx) continue;
        const hq = state.hqs[i];
        const dist = engine.getDistance(target, hq);
        if (hq.isTurret && dist < 5) return "TURRET OVERLAP";
        if (!hq.isTurret && dist < (3 + state.spacing)) return "SPACING VIOLATION";
    }
    return null;
}

function showWarning(msg) {
    const el = document.getElementById('warning-overlay');
    el.innerText = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1500);
}

function updateJSONOutput() {
    document.getElementById('io-area').value = JSON.stringify({ hqs: state.hqs, spacing: state.spacing });
}

function animate() {
    render();
    requestAnimationFrame(animate);
}

function render() {
    const { ctx, canvas, view, hexMap } = engine;
    ctx.fillStyle = "#0c0c0c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(canvas.width / 2 + view.x, canvas.height / 2 + view.y);
    ctx.scale(view.zoom, view.zoom);

    const hoverHex = engine.pixelToHex(state.mouse.x, state.mouse.y);
    const style = getComputedStyle(document.body);
    const nameInputActive = document.getElementById('player-name').value.trim().length > 0;

    hexMap.forEach((val, key) => {
        const [q, r, s] = key.split(',').map(Number);
        const px = engine.hexSize * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
        const py = engine.hexSize * (3/2 * r);
        
        let color = style.getPropertyValue('--' + val.type);
        let border = "rgba(255,255,255,0.03)";

        // Draw Placed Entities
        state.hqs.forEach((hq, idx) => {
            if (idx === state.moveIdx) return; // Hide original position if moving
            const dist = engine.getDistance({q,r,s}, hq);
            if (dist <= (hq.isTurret ? 3 : 1)) {
                color = (idx === state.selectedIdx) ? style.getPropertyValue('--selected') : PALETTE.find(p => p.id === hq.colorId).std;
                border = "white";
                if (hq.isTurret && dist > 2.5) color = "rgba(255,255,255,0.1)"; // Turret inner ring effect
            }
        });

        // Draw Ghost
        if (engine.getDistance({q,r,s}, hoverHex) <= 1) {
            const err = checkCollision(hoverHex, state.moveIdx);
            if (err) {
                color = "rgba(255,0,0,0.4)";
            } else if (nameInputActive || state.moveIdx > -1) {
                const isRandom = document.getElementById('random-toggle').checked;
                let baseColorHex;
                if (state.moveIdx > -1) baseColorHex = PALETTE.find(p => p.id === state.hqs[state.moveIdx].colorId).std;
                else baseColorHex = isRandom ? "#ffffff" : PALETTE.find(p => p.id === state.activeColorId).std;
                color = baseColorHex + "4d"; // Translucent version
            }
        }

        engine.drawHex(px, py, color, border);
    });

    // Draw Text Labels
    state.hqs.forEach((hq, idx) => {
        const pos = (idx === state.moveIdx) ? hoverHex : hq;
        const px = engine.hexSize * (Math.sqrt(3) * pos.q + Math.sqrt(3)/2 * pos.r);
        const py = engine.hexSize * (3/2 * pos.r);
        ctx.fillStyle = "white";
        ctx.font = hq.isTurret ? "bold 13px Inter" : "10px Inter";
        ctx.textAlign = "center";
        ctx.fillText(hq.player.toUpperCase(), px, py + 5);
    });

    ctx.restore();
}

init();
