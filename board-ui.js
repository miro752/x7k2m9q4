/**
 * Canvas-based checkers board rendering
 * Uses standard checkers notation (1-32 squares)
 *
 * Board layout matches C++ convention (0-indexed internally):
 *   31  30  29  28      (row 8 - black's back rank, top of screen)
 *     27  26  25  24    (row 7)
 *   23  22  21  20      (row 6)
 *     19  18  17  16    (row 5)
 *   15  14  13  12      (row 4)
 *     11  10  09  08    (row 3)
 *   07  06  05  04      (row 2)
 *     03  02  01  00    (row 1 - white's back rank, bottom of screen)
 *
 * Square 1 (index 0) is at bottom-right (H1)
 * Square 32 (index 31) is at top-left (A8)
 */

// Convert square number (1-32) to canvas row/col
// Returns {row, col} where row 0 is top, col 0 is left (column A)
function squareToRowCol(sq) {
    // sq is 1-32, convert to 0-31 for calculation
    const idx = sq - 1;
    const boardRow = Math.floor(idx / 4);  // 0-7, where 0 is row 1 (bottom)
    const posInRow = idx % 4;              // 0-3, position within the row

    // Canvas row: 0 = top (row 8), 7 = bottom (row 1)
    const canvasRow = 7 - boardRow;

    // Column depends on whether it's an even or odd board row
    // Even board rows (1,3,5,7): dark squares on columns B,D,F,H (1,3,5,7)
    // Odd board rows (2,4,6,8): dark squares on columns A,C,E,G (0,2,4,6)
    let col;
    if (boardRow % 2 === 0) {
        // Even board row: pos 0 = col 7 (H), pos 3 = col 1 (B)
        col = 7 - 2 * posInRow;
    } else {
        // Odd board row: pos 0 = col 6 (G), pos 3 = col 0 (A)
        col = 6 - 2 * posInRow;
    }

    return { row: canvasRow, col };
}

// Convert canvas row/col to square number (1-32), returns 0 if not a dark square
function rowColToSquare(canvasRow, col) {
    // Canvas row to board row
    const boardRow = 7 - canvasRow;  // 0 = row 1, 7 = row 8

    // Check if this is a dark square and get position in row
    let posInRow;
    if (boardRow % 2 === 0) {
        // Even board row: dark squares on columns 1,3,5,7
        if (col % 2 !== 1) return 0;
        posInRow = (7 - col) / 2;
    } else {
        // Odd board row: dark squares on columns 0,2,4,6
        if (col % 2 !== 0) return 0;
        posInRow = (6 - col) / 2;
    }

    if (posInRow < 0 || posInRow > 3) return 0;

    // Square index = boardRow * 4 + posInRow
    const idx = boardRow * 4 + posInRow;
    return idx + 1;  // Convert to 1-32
}

// Find the captured square between two landing squares in a capture move
export function getCapturedSquare(fromSq, toSq) {
    const from = squareToRowCol(fromSq);
    const to = squareToRowCol(toSq);

    // The captured piece is at the midpoint
    const midRow = (from.row + to.row) / 2;
    const midCol = (from.col + to.col) / 2;

    // Convert back to square number
    return rowColToSquare(midRow, midCol);
}

// Find captured piece between two path squares by scanning the diagonal
// for an opponent piece, skipping any already-captured pieces
function findCapturedOnDiagonal(fromSq, toSq, opponentBits, excludeSet) {
    const from = squareToRowCol(fromSq);
    const to = squareToRowCol(toSq);
    const dRow = Math.sign(to.row - from.row);
    const dCol = Math.sign(to.col - from.col);
    let r = from.row + dRow;
    let c = from.col + dCol;
    while (r !== to.row || c !== to.col) {
        const sq = rowColToSquare(r, c);
        if (sq > 0 && !excludeSet.has(sq) && (opponentBits & (1 << (sq - 1)))) {
            return sq;
        }
        r += dRow;
        c += dCol;
    }
    return 0;
}

export class BoardUI {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.size = Math.min(canvas.width, canvas.height);
        this.squareSize = this.size / 8;

        // Board state (bitboards from engine)
        this.white = 0x00000FFF;  // Initial position
        this.black = 0xFFF00000;
        this.kings = 0;
        this.whiteToMove = true;

        // UI state
        this.selectedSquare = null;  // Currently selected piece (1-32)
        this.legalMoves = [];        // Legal moves from engine
        this.lastMove = null;        // Last move made (for highlighting)
        this.flipped = false;        // Board orientation
        this.partialPath = [];       // Squares in current partial capture path
        this.outOfOrderClicks = [];  // Squares clicked out of path order
        this.flexibleHighlights = []; // Squares to highlight green (flexible input)

        // Colors
        this.colors = {
            lightSquare: '#e8eef4',
            darkSquare: '#4a6a8a',
            whitePiece: '#1fbf2a',
            whitePieceStroke: '#333333',
            blackPiece: '#333333',
            blackPieceStroke: '#000000',
            selected: 'rgba(255, 255, 0, 0.5)',
            legalMove: 'rgba(0, 255, 0, 0.4)',
            lastMove: 'rgba(155, 199, 0, 0.4)',
            partialPath: 'rgba(255, 165, 0, 0.5)',  // Orange for intermediate capture squares
            selectedOutline: 'rgba(255, 0, 0, 0.85)',   // Red outline for selected squares
            validOutline: 'rgba(255, 165, 0, 0.85)',     // Orange outline for valid next squares
            kingMark: '#ffd45a'
        };

        // Personnalisation (couleurs du damier et des pions), gardée dans le navigateur
        this.pieceStyle = 'brillant';
        this.squareStyle = 'flat';   // 'flat' (couleurs unies) ou un marbre
        this.showNumbers = true;
        this.showArrow = true;
        this.boardSize = 560;     // taille du damier en pixels (réglable)
        this.focusMode = false;   // mode grand damier : panneaux masqués
        this.arrow = null;   // {from,to} flèche du meilleur coup
        this.look = Object.assign({}, BoardUI.DEFAULT_LOOK);
        this._loadCustom();
        try { this.scene3d = localStorage.getItem('damas.scene') || '2d'; this.tilt3d = parseInt(localStorage.getItem('damas.tilt') || '1'); this.sceneSq = localStorage.getItem('damas.scenesq') === 'scene' ? 'scene' : 'mine'; } catch (e) { this.scene3d = '2d'; this.tilt3d = 1; this.sceneSq = 'mine'; }
        this._buildCustomPanel();

        // Event handling
        this.onClick = null;  // Callback: (square) => void

        // Set up click handler (works for both mouse and touch)
        this.canvas.addEventListener('click', (e) => this._handleClick(e));
        // Prevent double-tap zoom on mobile
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (e.changedTouches.length > 0) {
                const touch = e.changedTouches[0];
                this._handleTouch(touch);
            }
        });

        window.addEventListener('resize', () => this.applySize());
        this.applySize();
        setTimeout(() => this.applySize(), 400);
        setTimeout(() => this.applySize(), 1500);

        // Initial render
        this.render();
    }

    /** Adapte la taille du damier (réglage + espace disponible) et la netteté de l'écran */
    applySize() {
        const c = this.canvas, dpr = window.devicePixelRatio || 1;
        const vw = window.innerWidth, vh = window.innerHeight;
        const wide = vw > 1000;
        document.body.classList.toggle('focus-board', this.focusMode);
        // cadre + barre d'évaluation : mesurés sur la page (valeur de secours : 70 px)
        const cont = c.parentElement;
        let frame = 70;
        if (cont && c.offsetWidth > 0) frame = Math.max(30, cont.getBoundingClientRect().width - c.getBoundingClientRect().width);
        let avail = wide ? (this.focusMode ? vw - 190 - 90 : vw - 190 - 300 - 100) : vw - 26;
        avail -= frame;
        let size = this.focusMode ? avail : Math.min(this.boardSize, avail);
        if (this.focusMode && wide) size = Math.min(size, vh - 150);
        if (!wide && this.focusMode) size = Math.min(size, Math.max(vh - 260, 260));
        size = Math.max(240, Math.floor(size));
        document.documentElement.style.setProperty('--bs', size + 'px');
        c.style.width = size + 'px'; c.style.height = size + 'px'; c.style.maxWidth = 'none';
        this.resize(Math.round(size * dpr));
    }

    /**
     * Update board state from engine
     */
    setPosition(white, black, kings, whiteToMove) {
        this.white = white >>> 0;  // Ensure unsigned
        this.black = black >>> 0;
        this.kings = kings >>> 0;
        this.whiteToMove = whiteToMove;
        this.arrow = null;
        this.render();
    }

    /** Flèche indiquant le meilleur coup (cases 1-32) ; setArrow(null) l'efface */
    setArrow(from, to) {
        if (Array.isArray(from)) this.arrow = from.length >= 2 ? { from: from[0], to: from[from.length - 1], path: from } : null;
        else this.arrow = (from && to) ? { from, to, path: [from, to] } : null;
        this.render();
    }

    /**
     * Set legal moves (for highlighting)
     */
    setLegalMoves(moves) {
        this.legalMoves = moves || [];
        // Clear all transient highlights — they're tied to the old move set
        this.outOfOrderClicks = [];
        this.flexibleHighlights = [];
        this.partialPath = [];
        this.lastMove = null;
        this.render();
    }

    /**
     * Set selected square
     */
    setSelected(square) {
        this.selectedSquare = square;
        this.render();
    }

    /**
     * Set last move (for highlighting)
     */
    setLastMove(from, to, notation) {
        let path = [from, to];
        if (typeof notation === 'string') {
            const nums = (notation.match(/\d+/g) || []).map(Number);
            if (nums.length >= 2 && nums.every(n => n >= 1 && n <= 32)) path = nums;
        }
        this.lastMove = { from, to, path };
        this.render();
    }

    /**
     * Clear last move highlight
     */
    clearLastMove() {
        this.lastMove = null;
        this.render();
    }

    /**
     * Set partial path for step-by-step capture visualization
     */
    setPartialPath(path) {
        this.partialPath = path || [];
        this.render();
    }

    /**
     * Set out-of-order click squares for highlighting
     */
    setOutOfOrderClicks(squares) {
        this.outOfOrderClicks = squares || [];
        this.render();
    }

    /**
     * Flip board orientation
     */
    setFlipped(flipped) {
        this.flipped = flipped;
        this.render();
    }

    /**
     * Resize canvas
     */
    resize(size) {
        this.canvas.width = size;
        this.canvas.height = size;
        this.size = size;
        this.squareSize = size / 8;
        this.render();
    }

    /**
     * Main render function
     */
    render() {
        if (this.scene3d && this.scene3d !== '2d') return this._render3d();
        return this._renderFlat();
    }

    _renderFlat() {
        const ctx = this.ctx;
        const sq = this.squareSize;

        // Clear canvas
        ctx.clearRect(0, 0, this.size, this.size);

        // Draw board squares
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const displayRow = this.flipped ? 7 - row : row;
                const displayCol = this.flipped ? 7 - col : col;
                const x = displayCol * sq;
                const y = displayRow * sq;

                // Square color
                const isDark = (row + col) % 2 === 1;
                const tex = this.squareStyle !== 'flat' ? this._marbleTex() : null;
                if (tex) {
                    const src = isDark ? tex.dark : tex.light, k = src.width / (sq * 8);
                    ctx.drawImage(src, x * k, y * k, sq * k, sq * k, x, y, sq, sq);
                } else {
                    ctx.fillStyle = isDark ? this.colors.darkSquare : this.colors.lightSquare;
                    ctx.fillRect(x, y, sq, sq);
                }
            }
        }

        // Highlight last move
        if (this.lastMove) {
            this._highlightSquare(this.lastMove.from, this.colors.lastMove);
            this._highlightSquare(this.lastMove.to, this.colors.lastMove);
        }

        // Calculate captured squares and moving piece info for partial path visualization
        let capturedSquares = new Set();
        let movingPieceOriginal = null;  // Original square of moving piece
        let movingPieceCurrent = null;   // Current position of moving piece
        let movingPieceIsWhite = false;
        let movingPieceIsKing = false;

        if (this.partialPath && this.partialPath.length > 1) {
            movingPieceOriginal = this.partialPath[0];
            movingPieceCurrent = this.partialPath[this.partialPath.length - 1];

            // Determine piece color and type
            const bit = 1 << (movingPieceOriginal - 1);
            movingPieceIsWhite = (this.white & bit) !== 0;
            movingPieceIsKing = (this.kings & bit) !== 0;

            // Calculate captured squares by scanning diagonals for opponent pieces
            const opponentBits = movingPieceIsWhite ? this.black : this.white;
            for (let i = 0; i < this.partialPath.length - 1; i++) {
                const captured = findCapturedOnDiagonal(
                    this.partialPath[i], this.partialPath[i + 1],
                    opponentBits, capturedSquares);
                if (captured > 0) {
                    capturedSquares.add(captured);
                }
            }

            // Highlight the path squares
            for (let i = 1; i < this.partialPath.length; i++) {
                this._highlightSquare(this.partialPath[i], this.colors.partialPath);
            }
        }

        // Highlight selected square (original position of piece, yellow fill)
        if (this.selectedSquare) {
            this._highlightSquare(this.selectedSquare, this.colors.selected);
        }

        // Red outlines on selected/clicked squares
        if (this.outOfOrderClicks && this.outOfOrderClicks.length > 0) {
            for (const sq of this.outOfOrderClicks) {
                this._outlineSquare(sq, this.colors.selectedOutline);
            }
        }

        // Orange outlines on valid next squares (flexible input)
        if (this.flexibleHighlights && this.flexibleHighlights.length > 0) {
            for (const sq of this.flexibleHighlights) {
                this._outlineSquare(sq, this.colors.validOutline);
            }
        }

        // Draw pieces
        for (let sqNum = 1; sqNum <= 32; sqNum++) {
            const bit = 1 << (sqNum - 1);
            const isWhite = (this.white & bit) !== 0;
            const isBlack = (this.black & bit) !== 0;
            const isKing = (this.kings & bit) !== 0;

            if (isWhite || isBlack) {
                // Skip the moving piece at its original position
                if (movingPieceOriginal && sqNum === movingPieceOriginal) {
                    continue;
                }

                // Draw captured pieces as semi-transparent
                if (capturedSquares.has(sqNum)) {
                    this._drawPiece(sqNum, isWhite, isKing, 0.3);
                } else {
                    this._drawPiece(sqNum, isWhite, isKing);
                }
            }
        }

        // Draw the moving piece at its current position
        if (movingPieceCurrent && movingPieceOriginal) {
            this._drawPiece(movingPieceCurrent, movingPieceIsWhite, movingPieceIsKing);
        }

        if (this.showArrow && this.lastMove && this.lastMove.from && this.lastMove.to && this.lastMove.from !== this.lastMove.to) {
            this._drawArrow(this.lastMove.path || [this.lastMove.from, this.lastMove.to], this.look.arrLast, this._shade(this.look.arrLast, -0.75));   // dernier coup joué : orange
        }
        if (this.arrow && this.showArrow) this._drawArrow(this.arrow.path || [this.arrow.from, this.arrow.to], this.look.arrBest, this._shade(this.look.arrBest, -0.75));   // meilleur coup : vert

        // Draw square numbers (for debugging/learning)
        if (this.showNumbers) this._drawSquareNumbers();
    }


    // ---------- Vue 3D (perspective) : scènes ----------
    static SCENES = {
        classique:   { name: 'Classique',    sq: ['#f0d9b5', '#a8744a'], frame: '#4a2d12', wall: ['#e9d9b8', '#b79a6b'], floor: ['#6b4423', '#3f2713'], kind: 'wood' },
        nuit:        { name: 'Nuit',         sq: ['#9aa4d6', '#2a2f55'], frame: '#0e1128', wall: ['#05071a', '#1c2552'], floor: ['#10142e', '#05061a'], kind: 'night' },
        inferno:     { name: 'Inferno',      sq: ['#f0a35a', '#5a1308'], frame: '#1a0603', wall: ['#2b0500', '#ff5a10'], floor: ['#240804', '#0d0200'], kind: 'fire' },
        malaga:      { name: 'Malaga',       sq: ['#fff4d6', '#2b7ab8'], frame: '#c9a15a', wall: ['#7fd0ff', '#fdf6e3'], floor: ['#d9b26a', '#a97d38'], kind: 'sea' },
        luxe:        { name: 'Luxe',         sq: ['#efe6d2', '#7b1f2b'], frame: '#c8a24a', wall: ['#3a0b14', '#7b1f2b'], floor: ['#2a0a10', '#14040a'], kind: 'luxe' },
        grandluxe:   { name: 'Grand luxe',   sq: ['#f4ead0', '#1c1c1c'], frame: '#d4af37', wall: ['#000000', '#2a2412'], floor: ['#161208', '#050402'], kind: 'gold' },
        guadalquivir:{ name: 'Guadalquivir', sq: ['#ecdcae', '#4f7a4a'], frame: '#6e4b24', wall: ['#ffb36b', '#6fb3c8'], floor: ['#3f5d3a', '#223a22'], kind: 'river' },
        mataro:      { name: 'Mataró',       sq: ['#f3e4cf', '#b3562f'], frame: '#7a3a1d', wall: ['#f2d3a8', '#cf8a55'], floor: ['#b3562f', '#7a3a1d'], kind: 'terra' }
    };
    static SCENE_ORDER = ['classique', 'nuit', 'inferno', 'malaga', 'luxe', 'grandluxe', 'guadalquivir', 'mataro', '2d'];
    setScene(name) {
        this.scene3d = (name && name !== '2d' && BoardUI.SCENES[name]) ? name : '2d';
        try { localStorage.setItem('damas.scene', this.scene3d); } catch (e) {}
        this.render();
    }
    setSceneSq(v) { this.sceneSq = v; try { localStorage.setItem('damas.scenesq', v); } catch (e) {} this.render(); }
    setTilt(n) { this.tilt3d = n; try { localStorage.setItem('damas.tilt', String(n)); } catch (e) {} this.render(); }
    // géométrie : cases (u,v) -> écran, avec perspective sur l'axe vertical
    _geo3d() {
        const S = this.size;
        const tilt = (this.tilt3d === 0 || this.tilt3d === 2) ? this.tilt3d : 1;      // 0 = presque à plat, 1 = moyen, 2 = fort
        const s0 = [0.92, 0.82, 0.68][tilt];
        const near = S * [0.93, 0.91, 0.86][tilt], cx = S / 2;
        const top = S * [0.07, 0.11, 0.2][tilt], bot = S * [0.915, 0.89, 0.88][tilt];
        const sOf = t => 1 / (1 + (1 / s0 - 1) * (1 - t));
        const yOf = t => top + (bot - top) * (sOf(t) - s0) / (1 - s0);
        const g = {
            S, near, cx, top, bot, sOf, yOf,
            fwd: (u, v) => { const t = v / 8; const sc = sOf(t); return { x: cx + (u - 4) / 8 * near * sc, y: yOf(t), sc }; },
            inv: (x, y) => {
                if (y < top || y > bot) return null;
                const sv = s0 + (y - top) / (bot - top) * (1 - s0);
                const t = 1 - (1 / sv - 1) / (1 / s0 - 1);
                const sc = sOf(t);
                return { u: 4 + (x - cx) / (near * sc) * 8, v: t * 8 };
            }
        };
        return g;
    }
    _sceneBackground(ctx, sc, g) {
        const S = g.S, horizon = S * 0.30;
        const w = ctx.createLinearGradient(0, 0, 0, horizon + S * 0.05);
        w.addColorStop(0, sc.wall[0]); w.addColorStop(1, sc.wall[1]);
        ctx.fillStyle = w; ctx.fillRect(0, 0, S, S);
        // décor selon la scène
        const rnd = (() => { let a = 12345; return () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296; })();
        if (sc.kind === 'night') {
            ctx.fillStyle = '#fff'; for (let i = 0; i < 70; i++) { ctx.globalAlpha = 0.3 + rnd() * 0.7; ctx.fillRect(rnd() * S, rnd() * horizon, 1.5, 1.5); } ctx.globalAlpha = 1;
            const m = ctx.createRadialGradient(S * .8, S * .1, 2, S * .8, S * .1, S * .09); m.addColorStop(0, '#fffbe0'); m.addColorStop(1, 'rgba(255,251,224,0)'); ctx.fillStyle = m; ctx.beginPath(); ctx.arc(S * .8, S * .1, S * .09, 0, 7); ctx.fill();
        } else if (sc.kind === 'fire') {
            for (let i = 0; i < 22; i++) { const x = rnd() * S, h = S * (0.08 + rnd() * 0.18), w2 = S * (0.03 + rnd() * 0.05);
                const f = ctx.createLinearGradient(0, horizon, 0, horizon - h); f.addColorStop(0, 'rgba(255,210,40,.9)'); f.addColorStop(.5, 'rgba(255,90,10,.7)'); f.addColorStop(1, 'rgba(120,0,0,0)');
                ctx.fillStyle = f; ctx.beginPath(); ctx.moveTo(x - w2, horizon + 4); ctx.quadraticCurveTo(x - w2 * .2, horizon - h * .5, x, horizon - h); ctx.quadraticCurveTo(x + w2 * .2, horizon - h * .5, x + w2, horizon + 4); ctx.fill(); }
        } else if (sc.kind === 'sea') {
            ctx.fillStyle = '#1e90c8'; ctx.fillRect(0, horizon * .55, S, horizon * .45);
            ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 14; i++) ctx.fillRect(rnd() * S, horizon * (.6 + rnd() * .4), S * .06, 2);
            ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(S * .15, S * .08, S * .05, 0, 7); ctx.fill();
        } else if (sc.kind === 'river') {
            ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.arc(S * .5, horizon * .8, S * .08, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(30,90,120,.8)'; ctx.fillRect(0, horizon * .75, S, horizon * .25);
            ctx.fillStyle = 'rgba(255,200,120,.5)'; for (let i = 0; i < 10; i++) ctx.fillRect(S * (.35 + rnd() * .3), horizon * (.78 + rnd() * .2), S * .08, 2);
        } else if (sc.kind === 'luxe' || sc.kind === 'gold') {
            ctx.strokeStyle = sc.frame; ctx.globalAlpha = .55; ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) { ctx.strokeRect(S * (.04 + i * .16), S * .03, S * .13, horizon - S * .06); } ctx.globalAlpha = 1;
        } else if (sc.kind === 'terra') {
            ctx.fillStyle = 'rgba(120,50,20,.25)'; for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) ctx.fillRect(i * S / 9 + 2, j * horizon / 3 + 2, S / 9 - 4, horizon / 3 - 4);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 8; i++) ctx.fillRect(i * S / 8, 0, 2, horizon);
        }
        // sol / table
        const f = ctx.createLinearGradient(0, horizon, 0, S);
        f.addColorStop(0, sc.floor[1]); f.addColorStop(1, sc.floor[0]);
        ctx.fillStyle = f; ctx.fillRect(0, horizon, S, S - horizon);
        if (sc.kind === 'wood' || sc.kind === 'terra' || sc.kind === 'sea' || sc.kind === 'river') {
            ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 1;
            for (let i = 0; i < 26; i++) { const y = horizon + (S - horizon) * (i / 26) ** 1.6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
        }
    }
    _render3d() {
        const sc = BoardUI.SCENES[this.scene3d]; const g = this._geo3d(); const S = g.S;
        // 1) damier à plat (sans pions) sur un canevas hors écran
        if (!this._flat || this._flat.width !== S) { this._flat = document.createElement('canvas'); this._flat.width = S; this._flat.height = S; }
        const mainCtx = this.ctx, savedColors = { ...this.colors }, savedStyle = this.squareStyle;
        this.ctx = this._flat.getContext('2d'); this._collect = [];
        if (this.sceneSq === 'scene') { this.colors.lightSquare = sc.sq[0]; this.colors.darkSquare = sc.sq[1]; this.squareStyle = 'flat'; }
        const pieces = this._collect;
        let flatSize = this.size;
        try { this._renderFlat(); } finally { this.ctx = mainCtx; this._collect = null; Object.assign(this.colors, savedColors); this.squareStyle = savedStyle; }
        const ctx = mainCtx; ctx.clearRect(0, 0, S, S);
        this._sceneBackground(ctx, sc, g);
        // 2) cadre (trapèze un peu plus grand)
        const m = 0.1, A = g.fwd(-m, -m), B = g.fwd(8 + m, -m), C = g.fwd(8 + m, 8 + m), D = g.fwd(-m, 8 + m), th = S * 0.022;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = S * 0.03; ctx.shadowOffsetY = S * 0.015;
        ctx.fillStyle = this._shade(sc.frame, -0.35); ctx.beginPath(); ctx.moveTo(D.x, D.y + th); ctx.lineTo(C.x, C.y + th); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.fill(); ctx.restore();
        const fg = ctx.createLinearGradient(0, A.y, 0, D.y); fg.addColorStop(0, this._shade(sc.frame, 0.12)); fg.addColorStop(1, sc.frame);
        ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.fill();
        // 3) projection du damier : une bande par ligne d'écran
        const sqF = flatSize / 8;
        const yTop = Math.floor(g.top), yBot = Math.ceil(g.bot);
        for (let y = yTop; y < yBot; y++) {
            const a = g.inv(g.cx, y + 0.5); if (!a) continue;
            const v0 = Math.max(0, a.v * sqF), sc2 = g.sOf(a.v / 8), wpx = g.near * sc2;
            const v1 = g.inv(g.cx, y + 1.5); const dv = v1 ? Math.max(0.5, (v1.v - a.v) * sqF) : 1;
            ctx.drawImage(this._flat, 0, v0, flatSize, dv, g.cx - wpx / 2, y, wpx, 1.4);
        }
        // 4) pions : de l'arrière vers l'avant
        const items = pieces.map(p => { const { row, col } = squareToRowCol(p.square); const dr = this.flipped ? 7 - row : row, dc = this.flipped ? 7 - col : col; return { ...p, dr, dc }; }).sort((a, b) => a.dr - b.dr);
        const spriteN = 96; if (!this._sprite) { this._sprite = document.createElement('canvas'); this._sprite.width = spriteN; this._sprite.height = spriteN; }
        for (const p of items) {
            const c = g.fwd(p.dc + 0.5, p.dr + 0.5); const t = (p.dr + 0.5) / 8;
            const rx = 0.4 * g.near / 8 * c.sc;
            const dy = (g.yOf(Math.min(1, t + 0.02)) - g.yOf(t - 0.02)) / 0.04 / 8;      // hauteur d'écran d'une case
            const ry = 0.4 * dy;
            const th2 = rx * 0.26, base = p.isWhite ? this.colors.whitePiece : this.colors.blackPiece;
            // sprite du dessus de pion (style courant) dessiné à plat
            const sp = this._sprite, sctx = sp.getContext('2d'); sctx.clearRect(0, 0, spriteN, spriteN);
            const bs = this.size, bsq = this.squareSize, bctx = this.ctx, bflip = this.flipped, bsize = this.squareSize;
            this.ctx = sctx; this.flipped = false; this.squareSize = spriteN / 2 / 0.4 * 0.4 * 1.25; // rayon = 0.4*squareSize
            const r0 = spriteN * 0.46; this.squareSize = r0 / 0.4;
            const { row: r1, col: c1 } = squareToRowCol(1);
            sctx.save(); sctx.translate(spriteN / 2 - (c1 + 0.5) * this.squareSize, spriteN / 2 - (r1 + 0.5) * this.squareSize);
            try { this._drawPiece(1, p.isWhite, p.isKing, 1); } finally { sctx.restore(); this.ctx = bctx; this.flipped = bflip; this.squareSize = bsize; }
            ctx.save(); ctx.globalAlpha = p.opacity;
            const layers = p.isKing ? 2 : 1;
            // ombre
            ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(c.x + rx * 0.15, c.y + ry * 0.2, rx * 1.05, ry * 1.0, 0, 0, 7); ctx.fill();
            for (let L = 0; L < layers; L++) {
                const cy = c.y - L * th2 * 1.05;
                // flanc du cylindre
                const sg = ctx.createLinearGradient(c.x - rx, 0, c.x + rx, 0); sg.addColorStop(0, this._shade(base, -0.55)); sg.addColorStop(0.45, this._shade(base, -0.15)); sg.addColorStop(1, this._shade(base, -0.6));
                ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(c.x, cy, rx, ry, 0, 0, Math.PI); ctx.lineTo(c.x - rx, cy - th2); ctx.ellipse(c.x, cy - th2, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = this._shade(base, -0.7); ctx.lineWidth = 1; ctx.stroke();
                // dessus : sprite écrasé en ellipse
                ctx.drawImage(sp, c.x - rx * (spriteN / (2 * r0)), cy - th2 - ry * (spriteN / (2 * r0)), rx * spriteN / r0, ry * spriteN / r0);
            }
            ctx.restore();
        }
    }

    /**
     * Highlight a square
     */
    _highlightSquare(square, color) {
        if (!square || square < 1 || square > 32) return;

        const { row, col } = squareToRowCol(square);
        const displayRow = this.flipped ? 7 - row : row;
        const displayCol = this.flipped ? 7 - col : col;
        const x = displayCol * this.squareSize;
        const y = displayRow * this.squareSize;

        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, this.squareSize, this.squareSize);
    }

    /**
     * Draw an outline around a square
     */
    _outlineSquare(square, color, lineWidth = 3) {
        if (!square || square < 1 || square > 32) return;

        const { row, col } = squareToRowCol(square);
        const displayRow = this.flipped ? 7 - row : row;
        const displayCol = this.flipped ? 7 - col : col;
        const x = displayCol * this.squareSize;
        const y = displayRow * this.squareSize;
        const inset = lineWidth / 2;

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.strokeRect(x + inset, y + inset,
            this.squareSize - lineWidth, this.squareSize - lineWidth);
    }

    /**
     * Draw a piece
     * @param {number} square - Square number (1-32)
     * @param {boolean} isWhite - True if white piece
     * @param {boolean} isKing - True if king
     * @param {number} opacity - Opacity (0-1), default 1.0
     */
    _drawPiece(square, isWhite, isKing, opacity = 1.0) {
        if (this._collect) { this._collect.push({ square, isWhite, isKing, opacity }); return; }
        const { row, col } = squareToRowCol(square);
        const displayRow = this.flipped ? 7 - row : row;
        const displayCol = this.flipped ? 7 - col : col;
        const x = displayCol * this.squareSize + this.squareSize / 2;
        const y = displayRow * this.squareSize + this.squareSize / 2;
        const radius = this.squareSize * 0.4;

        const ctx = this.ctx;
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = opacity;

        // Draw piece body
        const base = isWhite ? this.colors.whitePiece : this.colors.blackPiece;
        const edge = isWhite ? this.colors.whitePieceStroke : this.colors.blackPieceStroke;
        if (['jeton', 'bouton', 'gemme', 'verre', 'metal', 'brillant'].includes(this.pieceStyle)) {
            this._drawFancyPiece(x, y, radius, base, edge, isKing);
            ctx.globalAlpha = prevAlpha;
            return;
        }
        if (this.pieceStyle === 'anneaux') {
            const lum = parseInt(base.slice(1, 3), 16) * 0.3 + parseInt(base.slice(3, 5), 16) * 0.59 + parseInt(base.slice(5, 7), 16) * 0.11;
            const ink = lum > 150 ? '#111111' : '#f2f2f2';
            const t = radius * 0.14;
            const disc = (cx, cy, side) => {
                if (side) {
                    ctx.fillStyle = base; ctx.strokeStyle = '#111111'; ctx.lineWidth = 2.5;
                    ctx.beginPath(); ctx.arc(cx, cy + t, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                    ctx.fillStyle = base; ctx.fillRect(cx - radius, cy, radius * 2, t);
                    ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx - radius, cy + t);
                    ctx.moveTo(cx + radius, cy); ctx.lineTo(cx + radius, cy + t); ctx.stroke();
                }
                ctx.fillStyle = base; ctx.strokeStyle = '#111111'; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.2, radius * 0.06);
                ctx.beginPath(); ctx.arc(cx, cy, radius * 0.76, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.arc(cx, cy, radius * 0.52, 0, Math.PI * 2); ctx.stroke();
            };
            if (isKing) { disc(x, y + t * 0.7, true); disc(x, y - t * 1.1, true); } else disc(x, y, false);
            ctx.globalAlpha = prevAlpha;
            return;
        }
        if (this.pieceStyle === 'disc3d') {
            const t = radius * 0.2;       // épaisseur du pion
            const disc = (cx, cy) => {
                const side = this._shade(base, -0.5);
                ctx.fillStyle = side; ctx.strokeStyle = this._shade(base, -0.75); ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(cx, cy + t, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.fillRect(cx - radius, cy, radius * 2, t);
                ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx - radius, cy + t);
                ctx.moveTo(cx + radius, cy); ctx.lineTo(cx + radius, cy + t); ctx.stroke();
                const g = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.05, cx, cy, radius);
                g.addColorStop(0, this._shade(base, 0.35)); g.addColorStop(1, base);
                ctx.fillStyle = g; ctx.strokeStyle = this._shade(base, -0.55); ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.strokeStyle = this._shade(base, -0.25); ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2); ctx.stroke();
            };
            if (isKing) { disc(x, y + t * 0.6); disc(x, y - t * 1.1); } else disc(x, y - t * 0.2);
            ctx.globalAlpha = prevAlpha;
            return;
        }
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (this.pieceStyle === 'relief') {
            const g = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.1, x, y, radius);
            g.addColorStop(0, this._shade(base, 0.45));
            g.addColorStop(0.55, base);
            g.addColorStop(1, this._shade(base, -0.3));
            ctx.fillStyle = g;
        } else if (this.pieceStyle === 'ring') {
            ctx.fillStyle = base;
        } else {
            ctx.fillStyle = base;
        }
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (this.pieceStyle === 'ring') {
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2);
            ctx.strokeStyle = edge;
            ctx.lineWidth = Math.max(2, radius * 0.1);
            ctx.stroke();
        }

        // Draw king crown
        if (isKing) {
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = this.colors.kingMark;
            ctx.fill();
            ctx.strokeStyle = isWhite ? this.colors.whitePieceStroke : this._shade(this.colors.blackPiece, 0.4);
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.globalAlpha = prevAlpha;
    }

    /** Dessine une flèche qui suit les cases du chemin (prises multiples : la ligne passe par chaque case d'arrivée). */
    _drawArrow(path, fill = '#2ee62e', outline = '#0b3d0b') {
        if (!path || path.length < 2) return;
        const ctx = this.ctx, s = this.squareSize;
        const pts = path.map((sq) => {
            const q = squareToRowCol(sq);
            return { x: (this.flipped ? 7 - q.col : q.col) * s + s / 2, y: (this.flipped ? 7 - q.row : q.row) * s + s / 2 };
        });
        // pointe : on raccourcit un peu le dernier segment
        const n = pts.length, L = pts[n - 1], P = pts[n - 2];
        const dx = L.x - P.x, dy = L.y - P.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        const ak = (this.look.arrW || 100) / 100, head = s * 0.34 * (0.6 + 0.4 * ak), w = s * 0.085 * ak;
        const tip = { x: L.x - ux * s * 0.08, y: L.y - uy * s * 0.08 };
        const base = { x: tip.x - ux * head, y: tip.y - uy * head };
        const first = pts[0], f1 = pts[1];
        const fl = Math.hypot(f1.x - first.x, f1.y - first.y) || 1;
        const start = { x: first.x + (f1.x - first.x) / fl * s * 0.18, y: first.y + (f1.y - first.y) / fl * s * 0.18 };
        const line = [start, ...pts.slice(1, n - 1), base];
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const [col, extra] of [[outline, 3], [fill, 0]]) {
            ctx.strokeStyle = col; ctx.lineWidth = w + extra * 2;
            ctx.beginPath(); ctx.moveTo(line[0].x, line[0].y);
            for (let k = 1; k < line.length; k++) ctx.lineTo(line[k].x, line[k].y);
            ctx.stroke();
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(tip.x + ux * extra, tip.y + uy * extra);
            ctx.lineTo(base.x - uy * (head * 0.5 + extra), base.y + ux * (head * 0.5 + extra));
            ctx.lineTo(base.x + uy * (head * 0.5 + extra), base.y - ux * (head * 0.5 + extra));
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }

    // ---------- Autres types de pions ----------
    _crown(x, y, r) {
        const ctx = this.ctx, w = r * 0.62, hgt = r * 0.5;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x - w, y + hgt * 0.6);
        ctx.lineTo(x - w, y - hgt * 0.5);
        ctx.lineTo(x - w * 0.5, y + hgt * 0.05);
        ctx.lineTo(x, y - hgt * 0.8);
        ctx.lineTo(x + w * 0.5, y + hgt * 0.05);
        ctx.lineTo(x + w, y - hgt * 0.5);
        ctx.lineTo(x + w, y + hgt * 0.6);
        ctx.closePath();
        ctx.fillStyle = this.colors.kingMark; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(60,35,0,.85)'; ctx.stroke();
        ctx.restore();
    }
    _drawFancyPiece(x, y, r, base, edge, isKing) {
        const ctx = this.ctx, st = this.pieceStyle;
        // ombre portée
        ctx.beginPath(); ctx.ellipse(x + r * 0.06, y + r * 0.16, r * 1.0, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
        if (st === 'jeton') {
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = this._shade(base, -0.25); ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = edge; ctx.stroke();
            // encoches sur le bord
            ctx.fillStyle = this._shade(base, 0.6);
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6;
                ctx.save(); ctx.translate(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86); ctx.rotate(a);
                ctx.fillRect(-r * 0.09, -r * 0.2, r * 0.18, r * 0.4); ctx.restore();
            }
            ctx.beginPath(); ctx.arc(x, y, r * 0.66, 0, Math.PI * 2);
            const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.05, x, y, r * 0.66);
            g.addColorStop(0, this._shade(base, 0.35)); g.addColorStop(1, base);
            ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = this._shade(base, -0.45); ctx.stroke();
        } else if (st === 'bouton') {
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
            const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
            g.addColorStop(0, this._shade(base, 0.3)); g.addColorStop(1, this._shade(base, -0.15));
            ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = edge; ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
            ctx.lineWidth = r * 0.1; ctx.strokeStyle = this._shade(base, -0.3); ctx.stroke();
            ctx.fillStyle = this._shade(base, -0.65);
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                ctx.beginPath(); ctx.arc(x + dx * r * 0.2, y + dy * r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
            }
        } else if (st === 'gemme') {
            const pts = [];
            for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
            ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath();
            const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
            g.addColorStop(0, this._shade(base, 0.55)); g.addColorStop(0.5, base); g.addColorStop(1, this._shade(base, -0.4));
            ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = edge; ctx.stroke();
            ctx.beginPath(); pts.forEach(([px, py]) => { ctx.moveTo(x, y); ctx.lineTo(px, py); });
            ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.beginPath(); pts.forEach(([px, py], i) => { const qx = x + (px - x) * 0.55, qy = y + (py - y) * 0.55; i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); }); ctx.closePath();
            ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
        } else if (st === 'metal') {
            this._drawMetal(x, y, r, base, isKing);
        } else if (st === 'brillant') {
            this._drawGloss(x, y, r, base, isKing);
            return;
        } else { // verre
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
            const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
            g.addColorStop(0, this._shade(base, 0.7)); g.addColorStop(0.45, base); g.addColorStop(1, this._shade(base, -0.55));
            ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = this._shade(base, -0.6); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(x - r * 0.28, y - r * 0.4, r * 0.4, r * 0.22, -0.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
        }
        if (isKing) this._crown(x, y + r * 0.04, r);
    }



    // Pion « brillant » : bille de verre, liseré doré, couronne pour les dames
    _drawGloss(x, y, r, base, isKing) {
        const ctx = this.ctx;
        const n = parseInt(base.slice(1), 16), lum = ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11);
        // liseré doré
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        const rim = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        rim.addColorStop(0, '#fff3c4'); rim.addColorStop(0.5, '#d9b24a'); rim.addColorStop(1, '#fff0b8');
        ctx.fillStyle = rim; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(80,55,10,.7)'; ctx.stroke();
        // bille
        const rr = r * 0.9;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(x - rr * 0.25, y - rr * 0.3, rr * 0.05, x, y, rr);
        g.addColorStop(0, this._shade(base, 0.45)); g.addColorStop(0.45, base); g.addColorStop(1, this._shade(base, -0.55));
        ctx.fillStyle = g; ctx.fill();
        // reflet haut
        ctx.beginPath(); ctx.ellipse(x - rr * 0.1, y - rr * 0.5, rr * 0.55, rr * 0.28, -0.1, 0, Math.PI * 2);
        const h = ctx.createLinearGradient(0, y - rr * 0.8, 0, y - rr * 0.2);
        h.addColorStop(0, 'rgba(255,255,255,' + (lum < 90 ? 0.55 : 0.8) + ')'); h.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = h; ctx.fill();
        // reflet bas discret
        ctx.beginPath(); ctx.ellipse(x, y + rr * 0.55, rr * 0.5, rr * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
        if (isKing) this._crownGloss(x, y + rr * 0.05, rr, lum < 110);
    }
    _crownGloss(x, y, r, onDark) {
        const ctx = this.ctx, w = r * 0.58, hgt = r * 0.46;
        const col = onDark ? '#ffd45a' : '#161616';
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x - w, y + hgt * 0.7);
        ctx.lineTo(x - w * 1.05, y - hgt * 0.45);
        ctx.lineTo(x - w * 0.5, y + hgt * 0.1);
        ctx.lineTo(x, y - hgt * 0.85);
        ctx.lineTo(x + w * 0.5, y + hgt * 0.1);
        ctx.lineTo(x + w * 1.05, y - hgt * 0.45);
        ctx.lineTo(x + w, y + hgt * 0.7);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = onDark ? 'rgba(80,45,0,.9)' : 'rgba(255,255,255,.55)'; ctx.stroke();
        // base et boules
        ctx.fillStyle = col;
        ctx.fillRect(x - w, y + hgt * 0.78, w * 2, hgt * 0.28);
        for (const [px, py] of [[-w * 1.05, -hgt * 0.5], [0, -hgt * 0.9], [w * 1.05, -hgt * 0.5]]) {
            ctx.beginPath(); ctx.arc(x + px, y + py, r * 0.07, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    // ---------- Marbre (texture générée, gardée en mémoire) ----------
    static get MARBLES() {
        return {
            marbreNoir:  { dark: { base: [18, 18, 20], cloud: [52, 52, 56], vein: [226, 226, 232], v: 0.55 }, light: { base: [239, 233, 214], cloud: [214, 203, 172], vein: [167, 148, 99], v: 0.5 } },
            marbreVert:  { dark: { base: [18, 53, 36], cloud: [34, 98, 66], vein: [196, 232, 212], v: 0.5 }, light: { base: [243, 242, 235], cloud: [220, 220, 208], vein: [150, 160, 140], v: 0.45 } },
            marbreRouge: { dark: { base: [58, 18, 22], cloud: [104, 36, 44], vein: [236, 206, 196], v: 0.5 }, light: { base: [244, 237, 226], cloud: [224, 207, 190], vein: [181, 138, 122], v: 0.45 } }
        };
    }
    _marbleTex() {
        const pal = BoardUI.MARBLES[this.squareStyle] || BoardUI.WOODSQ[this.squareStyle];
        if (!pal) return null;
        const px = Math.max(64, Math.round(this.squareSize * 8 / 2) * 2);
        const key = this.squareStyle + ':' + px;
        if (this._mc && this._mc.key === key) return this._mc.tex;
        const mk = (pp, sd) => pp.wood ? this._woodMake(px, pp, sd) : this._marbleMake(px, pp, sd);
        const tex = { dark: mk(pal.dark, 11), light: mk(pal.light, 5) };
        this._mc = { key, tex };
        return tex;
    }
    _marbleMake(size, pal, seed) {
        const w = Math.max(32, size >> 1), c = document.createElement('canvas');
        c.width = c.height = w;
        const g = c.getContext('2d'), img = g.createImageData(w, w), d = img.data;
        let st = seed * 2654435761 >>> 0;
        const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const N = 64, lat = new Float32Array(N * N);
        for (let i = 0; i < lat.length; i++) lat[i] = rnd();
        const sm = t => t * t * (3 - 2 * t);
        const noise = (x, y) => {
            const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
            const a = lat[(yi & 63) * N + (xi & 63)], b = lat[(yi & 63) * N + ((xi + 1) & 63)];
            const c2 = lat[((yi + 1) & 63) * N + (xi & 63)], d2 = lat[((yi + 1) & 63) * N + ((xi + 1) & 63)];
            return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d2) * u * v;
        };
        const fbm = (x, y, o) => { let a = 0, amp = 0.5, f = 1; for (let i = 0; i < o; i++) { a += amp * noise(x * f, y * f); f *= 2; amp *= 0.5; } return a; };
        for (let y = 0; y < w; y++) {
            for (let x = 0; x < w; x++) {
                const nx = x / w * 4.2, ny = y / w * 4.2;
                const wx = fbm(nx + 5.2, ny + 1.3, 3), wy = fbm(nx + 9.7, ny + 3.1, 3);
                const n = fbm(nx + 2.4 * wx, ny + 2.4 * wy, 4);
                const ridge = Math.pow(Math.max(0, 1 - Math.abs(2 * n - 1) * 8), 1.5);   // lignes fines
                const cl = fbm(nx * 1.6 + 7, ny * 1.6 + 2, 3);
                const i = (y * w + x) * 4, vv = ridge * pal.v;
                for (let k = 0; k < 3; k++) {
                    let col = pal.base[k] + (pal.cloud[k] - pal.base[k]) * cl * 0.7;
                    col = col + (pal.vein[k] - col) * vv;
                    d[i + k] = col;
                }
                d[i + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
        return c;
    }
    _drawMetal(x, y, r, base, isKing) {
        const ctx = this.ctx;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = this._shade(base, -0.45); ctx.fill();
        const body = (rr) => {
            ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2);
            if (ctx.createConicGradient) {
                const g = ctx.createConicGradient(0.35, x, y);
                const L = this._shade(base, 0.6), M = base, D = this._shade(base, -0.28);
                [[0, L], [0.12, M], [0.25, D], [0.38, L], [0.5, M], [0.62, D], [0.78, L], [0.9, M], [1, L]].forEach(([o, c]) => g.addColorStop(o, c));
                ctx.fillStyle = g;
            } else {
                const g = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.3, rr * 0.1, x, y, rr);
                g.addColorStop(0, this._shade(base, 0.5)); g.addColorStop(1, this._shade(base, -0.2));
                ctx.fillStyle = g;
            }
            ctx.fill();
        };
        body(r * 0.95);
        // fines rainures circulaires (aspect métal brossé)
        ctx.lineWidth = 1;
        for (let k = 1; k <= 7; k++) {
            ctx.beginPath(); ctx.arc(x, y, r * 0.95 * k / 8, 0, Math.PI * 2);
            ctx.strokeStyle = k % 2 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.10)'; ctx.stroke();
        }
        // bord biseauté
        ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1.5, r * 0.06); ctx.strokeStyle = this._shade(base, 0.45); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
        ctx.lineWidth = 1.5; ctx.strokeStyle = this._shade(base, -0.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, r * 0.76, 0, Math.PI * 2);
        ctx.lineWidth = 1; ctx.strokeStyle = this._shade(base, -0.4); ctx.stroke();
    }

    // ---------- Personnalisation ----------
    _loadCustom() {
        try {
            const o = JSON.parse(localStorage.getItem('damas.custom') || 'null');
            if (o) {
                for (const k of ['lightSquare', 'darkSquare', 'whitePiece', 'blackPiece', 'kingMark']) if (o[k]) this.colors[k] = o[k];
                if (o.pieceStyle) this.pieceStyle = o.pieceStyle;
                if (o.squareStyle) this.squareStyle = o.squareStyle;
                if (typeof o.showNumbers === 'boolean') this.showNumbers = o.showNumbers;
                if (typeof o.showArrow === 'boolean') this.showArrow = o.showArrow;
                if (typeof o.boardSize === 'number' && o.boardSize >= 260 && o.boardSize <= 1400) this.boardSize = o.boardSize;
                if (typeof o.focusMode === 'boolean') this.focusMode = o.focusMode && window.innerWidth > 1000;
                if (o.look && typeof o.look === 'object') Object.assign(this.look, o.look); else { this.look.bg = 'none'; this.look.frame = 'none'; }
            }
        } catch (e) {}
        this._deriveStrokes();
        try { this._applyLook(); } catch (e) {}
    }
    _saveCustom() {
        try {
            const c = this.colors;
            localStorage.setItem('damas.custom', JSON.stringify({ lightSquare: c.lightSquare, darkSquare: c.darkSquare, whitePiece: c.whitePiece, blackPiece: c.blackPiece, kingMark: c.kingMark, pieceStyle: this.pieceStyle, squareStyle: this.squareStyle, showNumbers: this.showNumbers, showArrow: this.showArrow, boardSize: this.boardSize, focusMode: this.focusMode, look: this.look }));
        } catch (e) {}
    }
    _shade(hex, f) { // f<0 assombrit, f>0 éclaircit
        const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
        return '#' + c.map(v => { v = Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f); return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'); }).join('');
    }
    _deriveStrokes() {
        this.colors.whitePieceStroke = this._shade(this.colors.whitePiece, -0.6);
        this.colors.blackPieceStroke = this._shade(this.colors.blackPiece, -0.6);
    }
    // ---------- Fond, cadre, bois : textures générées (aucun fichier) ----------
    static get DEFAULT_LOOK() {
        return { bg: 'ardoise', frame: 'ebene', frameColor: '#6b4226', numberColor: '', hiLast: '', hiSel: '', arrBest: '#2ee62e', arrLast: '#ffb020', arrW: 100 };
    }
    static get WOODS() {
        return {
            boisClair: { wood: 1, c1: [226, 190, 140], c2: [182, 130, 76] },
            noyer:     { wood: 1, c1: [124, 82, 52],  c2: [64, 40, 24] },
            cerisier:  { wood: 1, c1: [194, 104, 62], c2: [124, 56, 30] },
            cedre:     { wood: 1, c1: [208, 156, 110], c2: [152, 100, 62] },
            ebene:     { wood: 1, c1: [64, 46, 38],   c2: [24, 16, 13] }
        };
    }
    static get WOODSQ() {
        return {
            boisClassique: { light: { wood: 1, c1: [238, 212, 166], c2: [214, 176, 118] }, dark: { wood: 1, c1: [158, 104, 64], c2: [104, 64, 36] } },
            boisSombre:    { light: { wood: 1, c1: [214, 172, 118], c2: [176, 128, 78] },  dark: { wood: 1, c1: [52, 36, 30],   c2: [24, 16, 13] } }
        };
    }
    _noiseKit(seed) {
        let st = seed * 2654435761 >>> 0;
        const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const N = 64, lat = new Float32Array(N * N);
        for (let i = 0; i < lat.length; i++) lat[i] = rnd();
        const sm = t => t * t * (3 - 2 * t);
        const noise = (x, y) => {
            const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
            const a = lat[(yi & 63) * N + (xi & 63)], b = lat[(yi & 63) * N + ((xi + 1) & 63)];
            const c2 = lat[((yi + 1) & 63) * N + (xi & 63)], d2 = lat[((yi + 1) & 63) * N + ((xi + 1) & 63)];
            return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d2) * u * v;
        };
        const fbm = (x, y, o) => { let a = 0, amp = 0.5, f = 1; for (let i = 0; i < o; i++) { a += amp * noise(x * f, y * f); f *= 2; amp *= 0.5; } return a; };
        return { noise, fbm };
    }
    _woodMake(size, pal, seed) {
        const w = Math.max(32, size >> 1), c = document.createElement('canvas');
        c.width = c.height = w;
        const g = c.getContext('2d'), img = g.createImageData(w, w), d = img.data;
        const { noise, fbm } = this._noiseKit(seed + 3);
        for (let y = 0; y < w; y++) {
            for (let x = 0; x < w; x++) {
                const nx = x / w, ny = y / w;
                const warp = fbm(nx * 2.4 + seed, ny * 1.3 + 3, 3);
                const r = ny * 9 + warp * 3.4;
                let gr = r - Math.floor(r); gr = Math.pow(Math.abs(gr * 2 - 1), 1.6);
                const fib = noise(nx * 70 + seed, ny * 5);
                const t = Math.min(1, Math.max(0, gr * 0.62 + fib * 0.38));
                const i = (y * w + x) * 4;
                for (let k = 0; k < 3; k++) d[i + k] = pal.c1[k] + (pal.c2[k] - pal.c1[k]) * t;
                d[i + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
        return c;
    }
    /** Texture (canvas carré) pour le fond de la page ou le cadre */
    _texCanvas(name) {
        this._tc = this._tc || {};
        if (this._tc[name]) return this._tc[name];
        let c = null;
        const W = BoardUI.WOODS[name], M = BoardUI.MARBLES[name];
        if (W) c = this._woodMake(640, W, 17);
        else if (M) c = this._marbleMake(640, M.dark, 23);
        else if (name === 'ardoise' || name === 'feutre' || name === 'nuit') {
            const n = 256; c = document.createElement('canvas'); c.width = c.height = n;
            const g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data;
            const { fbm } = this._noiseKit(31);
            const base = name === 'ardoise' ? [58, 64, 74] : name === 'feutre' ? [30, 92, 58] : [18, 22, 52];
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
                const v = fbm(x / n * 18, y / n * 18, 3), gx = name === 'nuit' ? 1 - 0.6 * (y / n) : 1;
                const i = (y * n + x) * 4, f = (0.82 + v * 0.36) * gx;
                for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, base[k] * f));
                d[i + 3] = 255;
            }
            g.putImageData(img, 0, 0);
        }
        if (c) this._tc[name] = c;
        return c;
    }
    _hexA(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    }
    _bgUrl(name) {
        this._tu = this._tu || {};
        if (name === 'photo') { try { return localStorage.getItem('damas.bgphoto') || ''; } catch (e) { return ''; } }
        if (this._tu[name]) return this._tu[name];
        const c = this._texCanvas(name);
        if (!c) return '';
        try { this._tu[name] = c.toDataURL('image/jpeg', 0.86); } catch (e) { this._tu[name] = ''; }
        return this._tu[name];
    }
    /** Applique fond de page, cadre et surbrillances (le look par défaut ne touche à rien) */
    _applyLook() {
        if (typeof document === 'undefined' || !document.body) return;
        const L = this.look, b = document.body;
        if (L.bg === 'photo') L.bg = 'none';
        const url = L.bg !== 'none' ? this._bgUrl(L.bg) : '';
        if (url) {
            b.style.backgroundImage = `url("${url}")`;
            b.style.backgroundSize = 'cover'; b.style.backgroundPosition = 'center'; b.style.backgroundAttachment = 'fixed';
        } else {
            b.style.backgroundImage = ''; b.style.backgroundSize = ''; b.style.backgroundPosition = ''; b.style.backgroundAttachment = '';
        }
        const bc = document.querySelector('.board-container');
        if (bc) {
            if (L.frame === 'color') { bc.style.background = L.frameColor; bc.style.backgroundSize = ''; }
            else if (L.frame !== 'none' && this._bgUrl(L.frame)) { bc.style.background = `url("${this._bgUrl(L.frame)}") center/cover`; }
            else bc.style.background = '';
            bc.style.padding = L.frame !== 'none' ? '0.8rem' : '';
        }
        const rs = document.documentElement.style;
        rs.setProperty('--pc-w', this.colors.whitePiece); rs.setProperty('--pc-b', this.colors.blackPiece); rs.setProperty('--pc-k', this.colors.kingMark);
        this.colors.lastMove = L.hiLast ? this._hexA(L.hiLast, 0.5) : 'rgba(155, 199, 0, 0.4)';
        this.colors.selected = L.hiSel ? this._hexA(L.hiSel, 0.55) : 'rgba(255, 255, 0, 0.5)';
    }

    _buildCustomPanel() {
        if (typeof document === 'undefined' || document.getElementById('custom-btn')) return;
        const DEF = { lightSquare: '#e8eef4', darkSquare: '#4a6a8a', whitePiece: '#1fbf2a', blackPiece: '#1b1b1b', kingMark: '#ffd45a', pieceStyle: 'brillant' };
        const SK = {
            nouveau: { name: 'Nouveau', colors: DEF, pieceStyle: 'brillant', squareStyle: 'flat', numbers: true, look: { bg: 'ardoise', frame: 'ebene' } },
            classique: { name: 'Ancien', colors: { lightSquare: '#F0D9B5', darkSquare: '#B58863', whitePiece: '#FFFFFF', blackPiece: '#333333', kingMark: '#FFD700' }, pieceStyle: 'relief', squareStyle: 'flat', numbers: false, look: { bg: 'none', frame: 'none' } },
            bois:      { name: 'Bois', colors: { lightSquare: '#F0D9B5', darkSquare: '#B58863', whitePiece: '#f3e8d0', blackPiece: '#3b2a1e', kingMark: '#ffd45a' }, pieceStyle: 'relief', squareStyle: 'boisClassique', numbers: true, look: { bg: 'noyer', frame: 'ebene' } },
            marbre:    { name: 'Marbre', colors: { whitePiece: '#cdd2da', blackPiece: '#d9a62e', kingMark: '#ffe08a' }, pieceStyle: 'metal', squareStyle: 'marbreNoir', numbers: true, look: { bg: 'ardoise', frame: 'marbreNoir' } },
            brillant:  { name: 'Brillant', colors: { lightSquare: '#d3a96b', darkSquare: '#c19347', whitePiece: '#1fbf2a', blackPiece: '#1b1b1b', kingMark: '#ffd45a' }, pieceStyle: 'brillant', squareStyle: 'flat', numbers: true, look: { bg: 'cedre' } },
            photo:     { name: 'Photo', colors: { lightSquare: '#1d1d3d', darkSquare: '#dc1f46', whitePiece: '#b9b5ea', blackPiece: '#e51c1c', kingMark: '#FFD700' }, pieceStyle: 'disc3d', squareStyle: 'flat', numbers: true, look: {} },
            nuit:      { name: 'Nuit', colors: { lightSquare: '#7d86b8', darkSquare: '#2a2f55', whitePiece: '#e8ecff', blackPiece: '#14162b', kingMark: '#ffd45a' }, pieceStyle: 'verre', squareStyle: 'flat', numbers: true, look: { bg: 'nuit', frame: 'color', frameColor: '#1b1f3a', arrBest: '#35e0ff', arrLast: '#ffb020' } },
            tournoi:   { name: 'Tournoi vert', colors: { lightSquare: '#ece6c9', darkSquare: '#2f6b4a', whitePiece: '#ffffff', blackPiece: '#222222', kingMark: '#FFD700' }, pieceStyle: 'relief', squareStyle: 'flat', numbers: true, look: { bg: 'feutre', frame: 'ebene' } }
        };
        const btn = document.createElement('button');
        btn.id = 'custom-btn'; btn.textContent = '\u{1F3A8} Couleurs';
        btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;padding:8px 12px;border-radius:8px;border:1px solid #888;background:#fff;color:#222;font:14px sans-serif;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3)';
        const zoomBtn = document.createElement('button');
        zoomBtn.id = 'zoom-btn'; zoomBtn.textContent = this.focusMode ? '\u{1F50D} Réduire' : '\u{1F50D} Agrandir';
        zoomBtn.style.cssText = btn.style.cssText + ';right:128px';
        zoomBtn.addEventListener('click', () => {
            this.focusMode = !this.focusMode;
            zoomBtn.textContent = this.focusMode ? '\u{1F50D} Réduire' : '\u{1F50D} Agrandir';
            this._saveCustom(); sync(); this.applySize();
        });
        const panel = document.createElement('div');
        panel.id = 'custom-panel';
        panel.style.cssText = 'position:fixed;right:12px;bottom:56px;z-index:9999;display:none;padding:10px 12px;border-radius:10px;border:1px solid #888;background:#fff;color:#222;font:14px sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35);width:300px;max-width:calc(100vw - 24px);max-height:calc(100vh - 80px);overflow:auto;box-sizing:border-box';
        const ROW = 'display:flex;justify-content:space-between;align-items:center;margin:5px 0';
        const color = (k, l) => `<label style="${ROW}">${l}<input type="color" data-k="${k}" style="margin-left:12px;width:48px;height:28px;padding:0;border:1px solid #888"></label>`;
        const check = (k, l) => `<label style="${ROW}">${l}<input type="checkbox" data-k="${k}" style="margin-left:12px;width:20px;height:20px"></label>`;
        const select = (k, l, opts) => `<label style="${ROW}">${l}<select data-k="${k}" style="margin-left:12px;max-width:150px">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`;
        const WOODOPT = [['boisClair', 'Bois clair'], ['noyer', 'Noyer'], ['cerisier', 'Cerisier'], ['cedre', 'Cèdre'], ['ebene', 'Ébène'], ['marbreNoir', 'Marbre noir'], ['marbreVert', 'Marbre vert']];
        const tabs = [['skins', 'Skins'], ['damier', 'Damier'], ['pieces', 'Pièces'], ['fond', 'Fond'], ['fleches', 'Flèches'], ['scene', 'Vue 3D'], ['affich', 'Affichage']];
        const pages = {
            skins: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' + Object.entries(SK).map(([k, v]) => `<button data-skin="${k}" style="padding:8px 6px;cursor:pointer">${v.name}</button>`).join('') + '</div><div style="height:8px"></div><button data-reset style="padding:5px 10px;cursor:pointer">Tout remettre par défaut</button>',
            damier: select('squareStyle', 'Cases', [['flat', 'Couleurs unies'], ['boisClassique', 'Bois clair/foncé'], ['boisSombre', 'Bois et ébène'], ['marbreNoir', 'Marbre noir et crème'], ['marbreVert', 'Marbre vert'], ['marbreRouge', 'Marbre rouge']]) + color('lightSquare', 'Cases claires') + color('darkSquare', 'Cases foncées') + select('frame', 'Cadre', [['none', 'Par défaut'], ['color', 'Couleur unie'], ...WOODOPT]) + color('frameColor', 'Couleur du cadre') + color('hiLast', 'Dernier coup (case)') + color('hiSel', 'Case choisie') + check('showNumbers', 'Numéros des cases (1-32)') + color('numberColor', 'Couleur des numéros'),
            pieces: select('pieceStyle', 'Style des pions', [['relief', 'Relief'], ['flat', 'Plat'], ['ring', 'Anneau'], ['anneaux', 'Anneaux (photo)'], ['disc3d', 'Disque 3D'], ['jeton', 'Jeton'], ['bouton', 'Bouton'], ['gemme', 'Gemme'], ['verre', 'Verre'], ['metal', 'Métal'], ['brillant', 'Brillant (liseré doré)']]) + color('whitePiece', 'Pions blancs') + color('blackPiece', 'Pions noirs') + color('kingMark', 'Marque des dames'),
            fond: select('bg', 'Fond de la page', [['none', 'Par défaut'], ...WOODOPT, ['ardoise', 'Ardoise'], ['feutre', 'Feutre vert'], ['nuit', 'Nuit bleue']]),
            fleches: check('showArrow', 'Flèches (dernier coup / meilleur coup)') + color('arrLast', 'Dernier coup joué') + color('arrBest', 'Meilleur coup') + `<label style="${ROW}">Épaisseur<input type="range" data-k="arrW" min="50" max="170" step="5" style="margin-left:12px;width:120px"></label>`,
            scene: '<div style="font-size:12px;margin-bottom:6px">Choisissez une scène 3D (ou « Damier 2D »).</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' + BoardUI.SCENE_ORDER.map(k => `<button data-scene="${k}" style="padding:8px 6px;cursor:pointer">${k === '2d' ? 'Damier 2D' : BoardUI.SCENES[k].name}</button>`).join('') + '</div>' + '<div style="font-size:12px;margin:10px 0 4px">Inclinaison du damier</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"><button data-tilt="0" style="padding:8px 4px;cursor:pointer">Presque à plat</button><button data-tilt="1" style="padding:8px 4px;cursor:pointer">Moyenne</button><button data-tilt="2" style="padding:8px 4px;cursor:pointer">Forte</button></div>' + '<div style="font-size:12px;margin:10px 0 4px">Couleurs des cases</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><button data-sq="mine" style="padding:8px 4px;cursor:pointer">Mes couleurs</button><button data-sq="scene" style="padding:8px 4px;cursor:pointer">Celles de la scène</button></div>',
            affich: `<label style="${ROW}">Taille du damier<input type="range" data-k="boardSize" min="300" max="1000" step="10" style="margin-left:12px;width:120px"></label>` + check('focusMode', 'Grand damier (masque les panneaux)')
        };
        let html = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">' + tabs.map(([k, l]) => `<button data-tab="${k}" style="padding:5px 8px;cursor:pointer;border:1px solid #aaa;border-radius:6px;background:#eee;color:#222">${l}</button>`).join('') + '</div>';
        html += tabs.map(([k]) => `<div data-page="${k}" style="display:none">${pages[k]}</div>`).join('');
        panel.innerHTML = html;
        const showTab = (t) => {
            panel.querySelectorAll('[data-page]').forEach(d => { d.style.display = d.dataset.page === t ? 'block' : 'none'; });
            panel.querySelectorAll('[data-tab]').forEach(b => { const on = b.dataset.tab === t; b.style.background = on ? '#c8872e' : '#eee'; b.style.color = on ? '#fff' : '#222'; });
            try { localStorage.setItem('damas.tab', t); } catch (e) {}
        };
        const LOOKCOL = ['frame', 'frameColor', 'numberColor', 'hiLast', 'hiSel', 'arrBest', 'arrLast', 'arrW', 'bg'];
        const sync = () => panel.querySelectorAll('[data-k]').forEach(el => {
            const k = el.dataset.k;
            if (k === 'showNumbers') el.checked = this.showNumbers; else if (k === 'showArrow') el.checked = this.showArrow; else if (k === 'focusMode') el.checked = this.focusMode;
            else if (k === 'boardSize') el.value = this.boardSize;
            else if (k === 'pieceStyle') el.value = this.pieceStyle; else if (k === 'squareStyle') el.value = this.squareStyle;
            else if (LOOKCOL.includes(k)) { let v = this.look[k]; if (v === '' || v == null) v = k === 'numberColor' ? '#ffffff' : k === 'hiLast' ? '#9bc700' : k === 'hiSel' ? '#ffff00' : ''; el.value = v; }
            else el.value = this.colors[k];
        });
        const redo = () => { this._deriveStrokes(); this._applyLook(); this._saveCustom(); this.render(); };
        panel.addEventListener('input', (e) => {
            const k = e.target.dataset && e.target.dataset.k; if (!k) return;
            if (k === 'showNumbers') this.showNumbers = e.target.checked; else if (k === 'showArrow') this.showArrow = e.target.checked; else if (k === 'focusMode') this.focusMode = e.target.checked; else if (k === 'boardSize') this.boardSize = parseInt(e.target.value, 10); else if (k === 'pieceStyle') this.pieceStyle = e.target.value; else if (k === 'squareStyle') this.squareStyle = e.target.value;
            else if (LOOKCOL.includes(k)) this.look[k] = k === 'arrW' ? parseInt(e.target.value, 10) : e.target.value;
            else this.colors[k] = e.target.value;
            redo();
            if (k === 'focusMode' || k === 'boardSize') { this.applySize(); zoomBtn.textContent = this.focusMode ? '\u{1F50D} Réduire' : '\u{1F50D} Agrandir'; }
        });
        panel.addEventListener('click', (e) => {
            const t = e.target.closest('[data-tab]'); if (t) { showTab(t.dataset.tab); return; }
            const sq3 = e.target.closest('[data-sq]'); if (sq3) { this.setSceneSq(sq3.dataset.sq); return; }
            const tl3 = e.target.closest('[data-tilt]'); if (tl3) { this.setTilt(parseInt(tl3.dataset.tilt)); return; }
            const sc3 = e.target.closest('[data-scene]'); if (sc3) { this.setScene(sc3.dataset.scene); return; }
            const sk = e.target.closest('[data-skin]');
            if (sk) {
                const S = SK[sk.dataset.skin];
                Object.assign(this.colors, S.colors); this.pieceStyle = S.pieceStyle; this.squareStyle = S.squareStyle;
                this.showNumbers = S.numbers; this.showArrow = true;
                this.look = Object.assign({}, BoardUI.DEFAULT_LOOK, S.look);
                redo(); sync(); return;
            }
            if (e.target.closest('[data-reset]')) {
                Object.assign(this.colors, DEF); this.pieceStyle = 'brillant'; this.squareStyle = 'flat';
                this.showNumbers = true; this.showArrow = true; this.boardSize = 560; this.focusMode = false;
                this.look = Object.assign({}, BoardUI.DEFAULT_LOOK);
                redo(); sync(); this.applySize(); zoomBtn.textContent = '\u{1F50D} Agrandir'; return;
            }
        });
        btn.addEventListener('click', () => {
            sync();
            let t = 'skins'; try { t = localStorage.getItem('damas.tab') || 'skins'; } catch (e) {}
            showTab(t);
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        document.body.appendChild(panel); document.body.appendChild(btn); document.body.appendChild(zoomBtn);
        this._applyLook();
    }

    /**
     * Draw square numbers (for debugging)
     */
    _drawSquareNumbers() {
        const ctx = this.ctx;
        ctx.font = `bold ${this.squareSize * 0.19}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let sq = 1; sq <= 32; sq++) {
            const { row, col } = squareToRowCol(sq);
            const displayRow = this.flipped ? 7 - row : row;
            const displayCol = this.flipped ? 7 - col : col;
            const x = displayCol * this.squareSize + this.squareSize * 0.06;
            const y = displayRow * this.squareSize + this.squareSize * 0.04;
            const bg = this.colors.lightSquare; // les pièces se posent sur ces cases
            const lum = parseInt(bg.slice(1, 3), 16) * 0.3 + parseInt(bg.slice(3, 5), 16) * 0.59 + parseInt(bg.slice(5, 7), 16) * 0.11;
            ctx.fillStyle = this.look.numberColor || (lum < 140 ? this._shade(bg, 0.8) : this._shade(bg, -0.6));
            ctx.fillText(sq.toString(), x, y);
        }
    }

    /**
     * Handle click events
     */
    _handleClick(e) { this._clickAt(e.clientX, e.clientY); }
    _handleTouch(touch) { this._clickAt(touch.clientX, touch.clientY); }
    _clickAt(cx, cy) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (cx - rect.left) * (this.canvas.width / rect.width);
        const y = (cy - rect.top) * (this.canvas.height / rect.height);
        let col, row;
        if (this.scene3d && this.scene3d !== '2d') {
            const g = this._geo3d(); const u = g.inv(x, y);
            if (!u || u.u < 0 || u.u >= 8 || u.v < 0 || u.v >= 8) return;
            col = Math.floor(u.u); row = Math.floor(u.v);
        } else {
            col = Math.floor(x / this.squareSize); row = Math.floor(y / this.squareSize);
        }
        if (this.flipped) { row = 7 - row; col = 7 - col; }
        const square = rowColToSquare(row, col);
        if (square > 0 && this.onClick) this.onClick(square);
    }

    /**
     * Check if a square has a piece of the current side to move
     */
    hasPieceToMove(square) {
        if (square < 1 || square > 32) return false;
        const bit = 1 << (square - 1);
        if (this.whiteToMove) {
            return (this.white & bit) !== 0;
        } else {
            return (this.black & bit) !== 0;
        }
    }

    /**
     * Get moves from a specific square
     */
    getMovesFromSquare(square) {
        return this.legalMoves.filter(m => m.from === square);
    }

    /**
     * Check if a move to a target square is legal from the selected square
     */
    getMoveToSquare(fromSquare, toSquare) {
        return this.legalMoves.find(m => m.from === fromSquare && m.to === toSquare);
    }
}
