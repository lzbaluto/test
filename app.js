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
    lastPinchDist: 0
};

const PALETTE = [
    { id: 'cyan', std: '#00fbff' }, { id: 'lime', std: '#39ff14' },
    { id: 'magenta', std: '#ff00ff' }, { id: 'yellow', std: '#fffb00' },
    { id: 'orange', std: '#ff6600' }, { id: 'red', std: '#ff0055' },
    { id: 'blue', std: '#3498db' }, { id: 'gray', std: '#7f8c8d' }
];

function init() {
    engine.generateBaseLayer();
    attachListeners();
    updateJSONOutput();
    animate();
}

function attachListeners() {
    window.addEventListener('resize', () => {
        engine.canvas.width = window.innerWidth;
        engine.canvas.height = window.innerHeight;
    });
    window.dispatchEvent(new Event('resize'));

    // Color Dropdown
    document.getElementById('colorSelect').onchange = (e) => {
        state.activeColorId = e.target.value;
    };

    // Unified Pointer Events
    window.addEventListener('pointerdown', e => {
        if (e.target.closest('#ui-top') || e.target.closest('#sidebar') || e.target.closest('.fab-container')) return;
        state.isPanning = true;
        state.panStart = { x: e.clientX, y: e.clientY };
        state.panTotalDist = 0;
        document.getElementById('context-menu').style.display = 'none';
        if(e.target.id === 'mapCanvas') engine.canvas.setPointerCapture(e.pointerId);
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
        document.getElementById('coords-hud').innerText = `Q: ${h.q} R: ${h.r} S: ${h.s}`;
    });

    window.addEventListener('pointerup', e => {
        const wasDrag = state.panTotalDist > 10;
        state.isPanning = false;
        if (!wasDrag && e.target.id === 'mapCanvas') handleMapClick(e);
        if (engine.canvas.releasePointerCapture) engine.canvas.releasePointerCapture(e.pointerId);
    });

    // Zoom Math
    const applyZoom = (f, cx, cy) => {
        const wx = (cx - engine.canvas.width/2 - engine.view.x) / engine.view.zoom;
        const wy = (cy - engine.canvas.height/2 - engine.view.y) / engine.view.zoom;
        const nz = Math.min(Math.max(engine.view.zoom * f, 0.1), 5);
        engine.view.x -= wx * (nz - engine.view.zoom);
        engine.view.y -= wy * (nz - engine.view.zoom);
        engine.view.zoom = nz;
    };

    engine.canvas.addEventListener('wheel', e => {
        e.preventDefault();
        applyZoom(1 + (e.deltaY > 0 ? -1 : 1) * 0.1, e.clientX, e.clientY);
    }, { passive: false });

    // Pinch Zoom
    engine.canvas.addEventListener('touchmove', e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const d = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            if (state.lastPinchDist > 0) applyZoom(d / state.lastPinchDist, (e.touches[0].pageX + e.touches[1].pageX)/2, (e.touches[0].pageY + e.touches[1].pageY)/2);
            state.lastPinchDist = d;
        }
    }, { passive: false });
    engine.canvas.addEventListener('touchend', () => state.lastPinchDist = 0);

    // UI Actions
    document.getElementById('cb-toggle').onclick = () => document.body.classList.toggle('cb-mode');
    document.getElementById('center-map').onclick = () => engine.view = { x: 0, y: 0, zoom: 0.8 };
    document.getElementById('spacing-ctrl').oninput = (e) => {
        state.spacing = parseInt(e.target.value);
        document.getElementById('spacing-val').innerText = state.spacing;
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
        document.getElementById('io-area').select();
        document.execCommand('copy');
    };

    document.getElementById('btn-import').onclick = () => {
        try {
            const data = JSON.parse(document.getElementById('io-area').value);
            state.hqs = data.hqs; state.spacing = data.spacing;
            document.getElementById('spacing-ctrl').value = state.spacing;
            document.getElementById('spacing-val').innerText = state.spacing;
        } catch(e) { alert("Invalid JSON"); }
    };

    document.getElementById('btn-clear').onclick = () => {
        if(confirm("Wipe all?")) { state.hqs = state.hqs.filter(h => h.isTurret); updateJSONOutput(); }
    };
}

function handleMapClick(e) {
    const hex = engine.pixelToHex(e.clientX, e.clientY);
    const hIdx = state.hqs.findIndex(h => engine.getDistance(hex, h) <= (h.isTurret ? 3 : 1));
    
    if (hIdx > -1 && state.moveIdx === -1) {
        state.selectedIdx = hIdx;
        const menu = document.getElementById('context-menu');
        menu.style.display = 'block';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        return;
    }

    const error = checkCollision(hex, state.moveIdx);
    if (error) { showWarning(error); return; }

    if (state.moveIdx > -1) {
        state.hqs[state.moveIdx] = { ...state.hqs[state.moveIdx], ...hex };
        state.moveIdx = -1;
    } else {
        const nameInput = document.getElementById('player-name');
        const names = nameInput.value.split(',').map(n => n.trim()).filter(n => n);
        if (names.length > 0) {
            const isRandom = document.getElementById('random-toggle').checked;
            const finalColor = isRandom ? PALETTE[Math.floor(Math.random() * PALETTE.length)].id : state.activeColorId;
            state.hqs.push({ ...hex, player: names.shift(), colorId: finalColor, isTurret: false });
            nameInput.value = names.join(', ');
        }
    }
    updateJSONOutput();
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
    el.innerText = msg; el.classList.add('show');
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

    hexMap.forEach((val, key) => {
        const [q, r, s] = key.split(',').map(Number);
        const px = engine.hexSize * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
        const py = engine.hexSize * (3/2 * r);
        let color = style.getPropertyValue('--' + val.type);
        let border = "rgba(255,255,255,0.03)";

        state.hqs.forEach((hq, idx) => {
            if (idx === state.moveIdx) return;
            if (engine.getDistance({q,r,s}, hq) <= (hq.isTurret ? 3 : 1)) {
                color = (idx === state.selectedIdx) ? style.getPropertyValue('--selected') : PALETTE.find(p => p.id === hq.colorId).std;
                border = "white";
            }
        });

        if (engine.getDistance({q,r,s}, hoverHex) <= 1) {
            color = checkCollision(hoverHex, state.moveIdx) ? "rgba(255,0,0,0.4)" : "rgba(255,255,255,0.2)";
        }
        engine.drawHex(px, py, color, border);
    });

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
