class MapEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.hexMap = new Map();
        this.view = { x: 0, y: 0, zoom: 0.8 };
        this.hexSize = 18;
    }

    /**
     * Generates the hex grid layers.
     * Logic remains the same, ensuring your map layout is preserved.
     */
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

    /**
     * Converts screen pixels (mouse/touch) to Hex Coordinates.
     * Fixed: Added support for fractional zooming to ensure 
     * accurate "hits" on small mobile screens.
     */
    pixelToHex(x, y) {
        // Adjust for canvas centering and current camera view
        let worldX = (x - this.canvas.width / 2 - this.view.x) / this.view.zoom;
        let worldY = (y - this.canvas.height / 2 - this.view.y) / this.view.zoom;
        
        // Axial coordinate math
        let q = (Math.sqrt(3) / 3 * worldX - 1 / 3 * worldY) / this.hexSize;
        let r = (2 / 3 * worldY) / this.hexSize;
        let s = -q - r;

        // Rounding to the nearest hex cube
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        let q_diff = Math.abs(rq - q);
        let r_diff = Math.abs(rr - r);
        let s_diff = Math.abs(rs - s);

        if (q_diff > r_diff && q_diff > s_diff) {
            rq = -rr - rs;
        } else if (r_diff > s_diff) {
            rr = -rq - rs;
        } else {
            rs = -rq - rr;
        }
        
        return { q: rq, r: rr, s: rs };
    }

    /**
     * Calculates distance between two hexes in steps.
     */
    getDistance(a, b) {
        return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
    }

    /**
     * Draws an individual hex.
     * Note: We use 60*i - 30 for "Pointy Top" hexes.
     */
    drawHex(x, y, color, border) {
        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let angle_deg = 60 * i - 30;
            let angle_rad = Math.PI / 180 * angle_deg;
            this.ctx.lineTo(
                x + this.hexSize * Math.cos(angle_rad), 
                y + this.hexSize * Math.sin(angle_rad)
            );
        }
        this.ctx.closePath();
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = border;
        this.ctx.lineWidth = 1 / this.view.zoom; // Keeps borders crisp when zooming in
        this.ctx.stroke();
    }
}
