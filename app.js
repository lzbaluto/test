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
    mouse: { x: 0, y: 0 }
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
    window.addEventListener('resize', () => {
        engine.canvas.width = window.innerWidth;
        engine.canvas.height = window.innerHeight;
    });
    window.dispatchEvent(new Event('resize'));

    engine.canvas.addEventListener('wheel', handleZoom, { passive: false });
    engine.canvas.addEventListener('mousemove', e => {
        state.mouse = { x: e.clientX, y: e.clientY };
        const h = engine.pixelToHex(e.clientX, e.clientY);
        document.getElementById('coords-hud').innerText = `Q: ${h.q} R: ${h.r} S: ${h.s}`;
    });

    engine.canvas.addEventListener('mouseup', handleMapClick);

    // Sidebar buttons
    document.getElementById('spacing-ctrl').oninput = (e) => {
        state.spacing = parseInt(e.target.value);
        document.getElementById('spacing-val').innerText = state.spacing;
    };
    
    document.getElementById('btn-copy').onclick = () => {
        const area = document.getElementById('io-area');
        area.value = JSON.stringify({ hqs: state.hqs, spacing: state.spacing });
        area.select();
        document.execCommand('copy');
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
    const collision = checkCollision(hex);
    
    if (collision) {
        showWarning(collision);
        return;
    }

    const nameInput = document.getElementById('player-name');
    const names = nameInput.value.split(',').map(n => n.trim()).filter(n => n);
    
    if (names.length > 0) {
        state.hqs.push({
            ...hex,
            player: names.shift(),
            colorId: state.activeColorId,
            isTurret: false
        });
        nameInput.value = names.join(', ');
    }
}

function checkCollision(target) {
    const d = (Math.abs(target.q) + Math.abs(target.r) + Math.abs(target.s)) / 2;
    if (d <= 18.5) return "RESTRICTED AREA";
    
    for (const hq of state.hqs) {
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

        // Draw HQs/Turrets
        state.hqs.forEach(hq => {
            const dist = engine.getDistance({q,r,s}, hq);
            if (dist <= (hq.isTurret ? 3 : 1)) {
                color = PALETTE.find(p => p.id === hq.colorId).std;
                border = "white";
            }
        });

        // Ghost
        if (engine.getDistance({q,r,s}, hoverHex) <= 1) {
            const err = checkCollision(hoverHex);
            color = err ? "rgba(255,0,0,0.4)" : (PALETTE.find(p => p.id === state.activeColorId).std + "4d");
        }

        engine.drawHex(px, py, color, border);
    });

    // Draw Labels
    state.hqs.forEach(hq => {
        const px = engine.hexSize * (Math.sqrt(3) * hq.q + Math.sqrt(3)/2 * hq.r);
        const py = engine.hexSize * (3/2 * hq.r);
        ctx.fillStyle = "white";
        ctx.font = hq.isTurret ? "bold 13px Inter" : "10px Inter";
        ctx.textAlign = "center";
        ctx.fillText(hq.player.toUpperCase(), px, py + 5);
    });

    ctx.restore();
}

init();
