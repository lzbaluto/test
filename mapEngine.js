class MapEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.hexMap = new Map();
        this.view = { x: 0, y: 0, zoom: 0.8 };
        this.hexSize = 18;
    }

    generateBaseLayer() {
        for (let q = -60; q <= 60; q++) {
            for (let r = Math.max(-60, -q - 60); r <= Math.min(60, -q + 60); r++) {
                let s = -q - r;
                let d = (Math.abs(q) + Math.abs(r) + Math.abs(s)) / 2;
                let type = d <= 18 ? 'restricted' : (d <= 42 ? 'capital' : 'grass');
                this.hexMap.set(`${q},${r},${s}`, { type });
            }
        }
    }

    pixelToHex(x, y) {
        let worldX = (x - this.canvas.width / 2 - this.view.x) / this.view.zoom;
        let worldY = (y - this.canvas.height / 2 - this.view.y) / this.view.zoom;
        let q = (Math.sqrt(3) / 3 * worldX - 1 / 3 * worldY) / this.hexSize;
        let r = (2 / 3 * worldY) / this.hexSize;
        let s = -q - r;
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        if (Math.abs(rq - q) > Math.abs(rr - r) && Math.abs(rq - q) > Math.abs(rs - s)) rq = -rr - rs;
        else if (Math.abs(rr - r) > Math.abs(rs - s)) rr = -rq - rs;
        else rs = -rq - rr;
        return { q: rq, r: rr, s: rs };
    }

    getDistance(a, b) {
        return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
    }

    drawHex(x, y, color, border) {
        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let a = Math.PI / 180 * (60 * i - 30);
            this.ctx.lineTo(x + this.hexSize * Math.cos(a), y + this.hexSize * Math.sin(a));
        }
        this.ctx.closePath();
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = border;
        this.ctx.lineWidth = 1 / this.view.zoom;
        this.ctx.stroke();
    }
}
