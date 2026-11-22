/**
 * Main entry point for the checkers web app
 * Wires together: GameState, SearchManager, TurnController, MoveInput, BoardUI
 */

const _v = new URL(import.meta.url).searchParams.get('v') || '';
const _q = _v ? `?v=${_v}` : '';
const { getEngine } = await import(`./engine-api.js${_q}`);
const { GameState } = await import(`./game-state.js${_q}`);
const { SearchManager } = await import(`./search-manager.js${_q}`);
const { TurnController } = await import(`./turn-controller.js${_q}`);
const { MoveInput } = await import(`./move-input.js${_q}`);
const { BoardUI } = await import(`./board-ui.js${_q}`);
const { playMoveSound, playCaptureSound, playKingSound, playStartSound, playGameOverSound, getVolume, setVolume } = await import(`./sound.js${_q}`);
const { TablebaseLoader, loadNNModelFile } = await import(`./tablebase-loader.js${_q}`);
const { initGameStorage, pushGames, upsertGame, saveGame, getGames, setGames, deleteGame, deleteGames, clearGames, computeStats } = await import(`./game-storage.js${_q}`);
await initGameStorage();
const FG = await import(`./fastgame.js${_q}`);
const I18N = await import(`./i18n.js${_q}`);
const { GameClock, fmtClock } = await import(`./clock.js${_q}`);
const { isSoundEnabled, setSoundEnabled } = await import(`./sound.js${_q}`);

// --- Module instances (set during init) ---
let engine = null;
let gameState = null;
let searchManager = null;
let turnController = null;
let moveInput = null;
let boardUI = null;
let tablebaseLoader = null;

// Edit mode state
let editMode = false;
let probComputer = 'black';   // camp du moteur dans le mode Problème : 'black' | 'white' | 'none'
let editPieceType = 'empty';  // 'empty', 'white-man', 'white-king', 'black-man', 'black-king'
let editWhiteToMove = true;
let editBoard = { white: 0, black: 0, kings: 0 };

// Analysis display state
let showAnalysis = false;

// Match play state
let matchPlayActive = false;
let matchStats = { wins: 0, draws: 0, losses: 0 };
const MATCH_STATS_KEY = 'torquemada-match-stats';
let drawOfferResolve = null;

// Opening book state
let useBook = true;

// Opening names: maps "white,black,kings" position key to opening name
const openingNames = new Map();

// Saved options for restoring after match play
let savedPonder = false;
let savedShowAnalysis = false;
let savedUseBook = true;

/**
 * Initialize the application
 */
async function init() {
    const canvas = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const loadingEl = document.getElementById('loading');
    const gameContainerEl = document.getElementById('game-container');

    if (loadingEl) loadingEl.style.display = 'flex';
    if (gameContainerEl) gameContainerEl.style.display = 'none';

    try {
        // Initialize engine
        try { I18N.initI18n(); } catch (e) { console.warn('i18n:', e); }
        updateLoadingStatus('Démarrage du jeu...');
        engine = getEngine();
        await engine.init();

        // Initialize tablebase loader
        try {
            tablebaseLoader = new TablebaseLoader();
            await tablebaseLoader.init();
        } catch (err) {
            console.warn('OPFS not available:', err);
        }

        // Load NN model
        updateLoadingStatus('Chargement du réseau de neurones...');
        try {
            const nnData = await loadNNModelFile('./models/model_007.bin');
            await engine.loadNNModel(nnData);
        } catch (err) {
            console.warn('Could not load NN model:', err);
        }

        // Load opening book
        try {
            const bookResponse = await fetch('./opening-a822ebc72d1b.cbook');
            if (bookResponse.ok) {
                const bookText = await bookResponse.text();
                await engine.loadOpeningBook(bookText);
                console.log('Opening book loaded');
            }
        } catch (err) {
            console.warn('Could not load opening book:', err);
        }

        // Load opening names
        try {
            const resp = await fetch('./openings.txt');
            if (resp.ok) {
                const text = await resp.text();
                for (const line of text.split('\n')) {
                    if (!line.trim()) continue;
                    const match = line.match(/^([0-9a-f]+)\s+([0-9a-f]+)\s+([0-9a-f]+)\s+(.+)$/);
                    if (match) {
                        const w = parseInt(match[1], 16);
                        const b = parseInt(match[2], 16);
                        const k = parseInt(match[3], 16);
                        openingNames.set(`${w},${b},${k}`, match[4]);
                    }
                }
                console.log('Opening names loaded:', openingNames.size);
            }
        } catch (err) {
            console.warn('Could not load opening names:', err);
        }

        // Create modules
        updateLoadingStatus('Démarrage de la partie...');
        boardUI = new BoardUI(canvas); window.__boardUI = boardUI;
        gameState = new GameState(engine);
        searchManager = new SearchManager(engine);
        turnController = new TurnController(gameState, searchManager);
        moveInput = new MoveInput();

        // Wire events BEFORE init so we don't miss the initial legalMovesUpdated
        wireGameStateEvents();
        wireSearchManagerEvents();
        wireTurnControllerEvents();
        wireBoardClicks();

        // Initialize
        await gameState.init();
        turnController.init();

        // Restore preferences
        await restoreSavedPreferences();

        // Set up UI event handlers
        setupEventHandlers();
        updateBoardFromState();
        updateModeButtons();
        updateOptionsButtons();
        updateUndoRedoButtons();
        updatePlayButton();

        // Update status
        statusEl.textContent = 'Nouvelle partie';

        // Hide loading, show game
        if (loadingEl) loadingEl.style.display = 'none';
        if (gameContainerEl) gameContainerEl.style.display = 'flex';

        const status = await engine.getStatus();
        console.log('Engine status:', status);

    } catch (err) {
        console.error('Initialization failed:', err);
        updateLoadingStatus(`Erreur : ${err.message}`);
    }
}

// --- Event wiring ---

function wireGameStateEvents() {
    gameState.addEventListener('newGame', (e) => {
        updateBoardFromState();
        clearInputState();
        boardUI.setSelected(null);
        boardUI.clearLastMove();
        clearSearchInfo();
        updateMoveHistory();
        updateUndoRedoButtons();
        updatePlayButton();
        searchManager.clearPV();
        updateOpeningName(null);
        updateStatus('');
    });

    gameState.addEventListener('move', (e) => {
        const { move, board, gameOver } = e.detail;
        updateBoardFromState();
        clearInputState(false);
        boardUI.setLastMove(move.from, move.to, move.notation);
        updateMoveHistory();
        updateUndoRedoButtons();
        updatePlayButton();
        updateOpeningName(board);
        if (!gameOver) {
            updateStatus('');
        }
    });

    gameState.addEventListener('undo', (e) => {
        const { board, undoneMove } = e.detail;
        updateBoardFromState();
        clearInputState();
        boardUI.setSelected(null);
        // Restore last move highlight if there's still history
        if (gameState.history.length > 0) {
            const prevMove = gameState.history[gameState.history.length - 1].move;
            boardUI.setLastMove(prevMove.from, prevMove.to, prevMove.notation);
        }
        updateMoveHistory();
        updateUndoRedoButtons();
        updatePlayButton();
        searchManager.clearPV();
        updateOpeningName(board);
        updateStatus('');
    });

    gameState.addEventListener('redo', (e) => {
        const { board, move } = e.detail;
        updateBoardFromState();
        clearInputState();
        boardUI.setSelected(null);
        boardUI.setLastMove(move.from, move.to, move.notation);
        updateMoveHistory();
        updateUndoRedoButtons();
        updatePlayButton();
        searchManager.clearPV();
        updateOpeningName(board);
        updateStatus('');
    });

    gameState.addEventListener('positionChanged', (e) => {
        updateBoardFromState();
        clearInputState();
        boardUI.setSelected(null);
        boardUI.clearLastMove();
        updateMoveHistory();
        updateUndoRedoButtons();
        updatePlayButton();
        updateOpeningName(null);
        updateStatus('');
    });

    gameState.addEventListener('gameLoaded', (e) => {
        updateBoardFromState();
        clearInputState();
        boardUI.setSelected(null);
        boardUI.clearLastMove();
        updateMoveHistory();
        updateUndoRedoButtons();
        updatePlayButton();
        updateOpeningName(gameState.board);
        updateStatus('Partie chargée');
    });

    gameState.addEventListener('legalMovesUpdated', (e) => {
        const { moves } = e.detail;
        moveInput.setLegalMoves(moves);
        boardUI.setLegalMoves(moves);
    });

    gameState.addEventListener('gameOver', (e) => {
        const { winner, reason } = e.detail;
        try {
            const hc = turnController.humanColor;
            playGameOverSound(winner === 'draw' ? 'draw' : (hc === 'both' || winner === hc) ? 'win' : 'loss');
        } catch (err) {}
        showGameOver(winner, reason);
        updatePlayButton();
    });
}

function wireSearchManagerEvents() {
    searchManager.addEventListener('searchInfo', (e) => {
        updateSearchInfo(e.detail);
        updatePlayButton();
    });

    let thinkT0 = 0, thinkIv = null;
    const thinkEl = () => document.getElementById('think-timer');
    const thinkStop = () => { if (thinkIv) { clearInterval(thinkIv); thinkIv = null; } };
    searchManager.addEventListener('searchEnd', thinkStop);
    searchManager.addEventListener('searchStart', (e) => {
        if (e.detail.type === 'think') {
            updateStatus('Le moteur réfléchit...');
            thinkStop(); thinkT0 = Date.now();
            thinkIv = setInterval(() => { const el = thinkEl(); if (el) el.textContent = '⏱ ' + ((Date.now() - thinkT0) / 1000).toFixed(1) + ' s'; }, 100);
        }
        updatePlayButton();
        updateUndoRedoButtons();
    });

    searchManager.addEventListener('searchEnd', () => {
        updatePlayButton();
        updateUndoRedoButtons();
    });

    searchManager.addEventListener('timeUpdate', (e) => {
        updateTimeDisplay(e.detail.secondsLeft);
    });
}

function wireTurnControllerEvents() {
    turnController.addEventListener('humanColorChanged', () => {
        updateModeButtons();
        updatePlayButton();
    });

    turnController.addEventListener('drawOffer', (e) => {
        const { resolve } = e.detail;
        drawOfferResolve = resolve;
        document.getElementById('draw-offer-dialog').style.display = 'flex';
    });

    // Engine move: animate + sound + commit, then signal done
    turnController.addEventListener('engineMove', async (e) => {
        const { move, resolve } = e.detail;
        await animateAndMakeMove(move, true);  // always animate engine moves
        resolve();
    });
}

function wireBoardClicks() {
    boardUI.onClick = async (square) => {
        if (editMode) {
            handleEditClick(square);
            return;
        }

        if (gameState.gameOver) return;
        if (searchManager.state === 'thinking') return;
        if (!turnController.isHumanTurn()) return;

        // Stop pondering so the worker is free
        if (searchManager.state === 'pondering') {
            await searchManager.abort();
        }

        const result = moveInput.handleClick(square);

        if (!result) {
            // Click didn't match — clear highlights
            clearInputState();
            return;
        }

        if (result.move) {
            await animateAndMakeMove(result.move, result.animate);
        } else if (result.highlights) {
            applyHighlights(result.highlights);
        }
    };
}

// --- Board / UI helpers ---

function updateBoardFromState() {
    if (!gameState.board) return;
    const b = gameState.board;
    boardUI.setPosition(b.white, b.black, b.kings, b.whiteToMove);
}

function clearInputState(render = true) {
    moveInput.clear();
    boardUI.selectedSquare = null;
    boardUI.partialPath = [];
    boardUI.outOfOrderClicks = [];
    boardUI.flexibleHighlights = [];
    boardUI.lastMove = null;
    if (render) {
        boardUI.setLegalMoves(gameState.legalMoves);
    } else {
        boardUI.legalMoves = gameState.legalMoves;
    }
}

function applyHighlights(highlights) {
    boardUI.legalMoves = [];  // suppress default green highlights
    boardUI.outOfOrderClicks = highlights.selected;
    boardUI.flexibleHighlights = highlights.valid;
    if (highlights.partialPath.length > 0) {
        boardUI.selectedSquare = highlights.partialPath[0];
        boardUI.partialPath = highlights.partialPath;
    } else {
        boardUI.selectedSquare = null;
        boardUI.partialPath = [];
    }
    boardUI.render();
}

/**
 * Animate multi-jump moves step-by-step, then commit the move.
 */
async function animateAndMakeMove(move, animate) {
    const isCapture = !!(move.notation && String(move.notation).includes('x'));
    const kingsBefore = bitCount(gameState.board.kings);
    if (animate && move.path && move.path.length > 2) {
        for (let i = 1; i < move.path.length; i++) {
            const partialPath = move.path.slice(0, i + 1);
            boardUI.setPartialPath(partialPath);
            boardUI.render();
            playCaptureSound();
            await sleep(200);
        }
    } else {
        if (isCapture) playCaptureSound(); else playMoveSound();
    }
    await gameState.makeMove(move);
    try { if (bitCount(gameState.board.kings) > kingsBefore) setTimeout(playKingSound, 140); } catch (e) {}
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getOpeningName(board) {
    if (!board) return null;
    const key = `${board.white},${board.black},${board.kings}`;
    return openingNames.get(key) || null;
}

function updateStatus(message) {
    const el = document.getElementById('status');
    if (el) el.textContent = message;
}

function updateOpeningName(board) {
    const el = document.getElementById('opening-name');
    if (el) el.textContent = getOpeningName(board) || '';
}

function updateLoadingStatus(message) {
    const el = document.getElementById('loading-status');
    if (el) el.textContent = message;
}

// --- Mode buttons ---

function updateModeButtons() {
    const btnEngineWhite = document.getElementById('btn-engine-white');
    const btnEngineBlack = document.getElementById('btn-engine-black');
    const btnTwoPlayer = document.getElementById('btn-two-player');

    if (!btnEngineWhite || !btnEngineBlack || !btnTwoPlayer) return;

    btnEngineWhite.classList.remove('active');
    btnEngineBlack.classList.remove('active');
    btnTwoPlayer.classList.remove('active');

    switch (turnController.humanColor) {
        case 'black':
            btnEngineWhite.classList.add('active');
            break;
        case 'white':
            btnEngineBlack.classList.add('active');
            break;
        case 'both':
            btnTwoPlayer.classList.add('active');
            break;
    }
}

// --- Preferences ---

const PREFS_KEY = 'torquemada-preferences';

function savePreferences() {
    const prefs = {
        ponder: turnController.ponderEnabled,
        showAnalysis,
        useBook,
        sound: isSoundEnabled(),
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function loadPreferences() {
    try {
        const data = localStorage.getItem(PREFS_KEY);
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

async function restoreSavedPreferences() {
    const prefs = loadPreferences();
    if (!prefs) return;

    if (prefs.ponder) await togglePondering(true);
    if (prefs.showAnalysis) toggleShowAnalysis(true);
    if (prefs.useBook === false) {
        useBook = false;
        engine.setUseBook(false);
    }
    setSoundEnabled(prefs.sound !== false);
}

function updateOptionsButtons() {
    const chkPonder = document.getElementById('chk-ponder');
    const chkUseBook = document.getElementById('chk-use-book');
    const chkShowAnalysis = document.getElementById('chk-show-analysis');

    if (chkPonder) chkPonder.checked = turnController.ponderEnabled;
    if (chkUseBook) chkUseBook.checked = useBook;
    if (chkShowAnalysis) chkShowAnalysis.checked = showAnalysis;

    const chkSound = document.getElementById('chk-sound');
    if (chkSound) chkSound.checked = isSoundEnabled();
}

// --- Undo/Redo ---

function updateUndoRedoButtons() {
    if (!gameState) return;
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    const { canUndo, canRedo } = gameState.getUndoRedoState();
    const thinking = searchManager.state === 'thinking';

    // Undo is allowed during thinking (aborts search first)
    if (undoBtn) undoBtn.disabled = !canUndo;
    // Redo is blocked during thinking (engine is about to play)
    if (redoBtn) redoBtn.disabled = !canRedo || thinking;
}

// --- Edit Mode ---

async function enterEditMode() {
    await searchManager.abort();
    clearSearchInfo();
    const evalBar = document.getElementById('eval-bar');
    if (evalBar) evalBar.style.visibility = 'hidden';
    editMode = true;

    const board = gameState.board;
    editBoard = { white: board.white, black: board.black, kings: board.kings };
    editWhiteToMove = board.whiteToMove;

    editPieceType = 'empty';
    updatePieceSelector();

    document.getElementById('game-controls').style.display = 'none';
    document.getElementById('edit-controls').style.display = 'block';
    document.querySelectorAll('.controls-section .control-group:not(#game-controls):not(#edit-controls)').forEach(el => {
        el.style.display = 'none';
    });

    updateSideToMoveButtons(); updateProbButtons();
    boardUI.setLegalMoves([]);
    boardUI.setSelected(null);
    updatePlayButton();
}

async function exitEditMode() {
    editMode = false;

    // Temporarily disable auto-play so setPosition doesn't trigger engine
    const savedAutoPlay = turnController.autoPlay;
    turnController.autoPlay = false;
    searchManager.resetTimeBank();
    turnController.drawDeclined = false;
    await gameState.setPosition(editBoard.white, editBoard.black, editBoard.kings, editWhiteToMove);
    turnController.autoPlay = savedAutoPlay;

    // Camp du moteur choisi dans le mode Problème
    turnController.setHumanColor(probComputer === 'black' ? 'white' : probComputer === 'white' ? 'black' : 'both');

    document.getElementById('game-controls').style.display = 'flex';
    document.getElementById('edit-controls').style.display = 'none';
    document.querySelectorAll('.controls-section .control-group:not(#game-controls):not(#edit-controls)').forEach(el => {
        el.style.display = 'block';
    });

    if (showAnalysis) {
        const evalBar = document.getElementById('eval-bar');
        if (evalBar) evalBar.style.visibility = '';
    }

    updateMoveHistory();
    updateUndoRedoButtons();
    updateModeButtons();
    updatePlayButton();
    // « Joueur joue » : si c'est au moteur de jouer, il joue tout de suite
    if (turnController.autoPlay && probComputer !== 'none') { try { await turnController._evaluateTurn(); } catch (e) { console.warn(e); } }
}

function updateProbButtons() {
    const o = document.getElementById('btn-prob-orient'), c = document.getElementById('btn-prob-comp');
    if (o) o.textContent = boardUI && boardUI.flipped ? 'Blancs : Haut → Bas' : 'Blancs : Bas → Haut';
    if (c) c.textContent = probComputer === 'black' ? 'Ordinateur noir' : probComputer === 'white' ? 'Ordinateur blanc' : "Pas d'ordinateur";
}

function getPieceAt(square) {
    const bit = 1 << (square - 1);
    const isWhite = (editBoard.white & bit) !== 0;
    const isBlack = (editBoard.black & bit) !== 0;
    const isKing = (editBoard.kings & bit) !== 0;

    if (isWhite && isKing) return 'white-king';
    if (isWhite) return 'white-man';
    if (isBlack && isKing) return 'black-king';
    if (isBlack) return 'black-man';
    return 'empty';
}

function nextPieceType(current) {
    const order = ['empty', 'white-man', 'white-king', 'black-man', 'black-king'];
    const idx = order.indexOf(current);
    return order[(idx + 1) % order.length];
}

function updatePieceSelector() {
    document.querySelectorAll('.piece-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.piece === editPieceType);
    });
}

function isInvalidPlacement(pieceType, square) {
    // White men can't be placed on rank 8 (squares 29-32) — they would promote
    if (pieceType === 'white-man' && square >= 29) return true;
    // Black men can't be placed on rank 1 (squares 1-4) — they would promote
    if (pieceType === 'black-man' && square <= 4) return true;
    return false;
}

function handleEditClick(square) {
    if (!editMode || square < 1 || square > 32) return;

    const bit = 1 << (square - 1);

    const currentPiece = getPieceAt(square);
    if (currentPiece === editPieceType || isInvalidPlacement(editPieceType, square)) {
        editPieceType = nextPieceType(editPieceType);
        if (isInvalidPlacement(editPieceType, square)) {
            editPieceType = nextPieceType(editPieceType);
        }
        updatePieceSelector();
    }

    editBoard.white &= ~bit;
    editBoard.black &= ~bit;
    editBoard.kings &= ~bit;

    switch (editPieceType) {
        case 'white-man':
            editBoard.white |= bit;
            break;
        case 'white-king':
            editBoard.white |= bit;
            editBoard.kings |= bit;
            break;
        case 'black-man':
            editBoard.black |= bit;
            break;
        case 'black-king':
            editBoard.black |= bit;
            editBoard.kings |= bit;
            break;
    }

    boardUI.setPosition(editBoard.white, editBoard.black, editBoard.kings, editWhiteToMove);
}

function clearEditBoard() {
    editBoard = { white: 0, black: 0, kings: 0 };
    boardUI.setPosition(0, 0, 0, editWhiteToMove);
}

function updateSideToMoveButtons() {
    const whiteBtn = document.getElementById('btn-white-to-move');
    const blackBtn = document.getElementById('btn-black-to-move');
    if (whiteBtn && blackBtn) {
        whiteBtn.classList.toggle('active', editWhiteToMove);
        blackBtn.classList.toggle('active', !editWhiteToMove);
    }
}

// --- Time dialog ---

function showTimeDialog() {
    const dialog = document.getElementById('time-dialog');
    const input = document.getElementById('time-input');
    if (dialog && input) {
        input.value = searchManager.secondsPerMove;
        dialog.style.display = 'flex';
        input.select();
    }
}

function hideTimeDialog() {
    const dialog = document.getElementById('time-dialog');
    if (dialog) dialog.style.display = 'none';
}

function applyTimePerMove() {
    const input = document.getElementById('time-input');
    if (!input) return;

    let value = parseFloat(input.value);
    if (isNaN(value) || value < 0.1) value = 0.1;

    searchManager.setSecondsPerMove(value);
    searchManager.resetTimeBank();
    updateTimePerMoveLabel(value);
    hideTimeDialog();
}

function updateTimePerMoveLabel(seconds) {
    const el = document.getElementById('btn-time-per-move');
    if (!el) return;
    const s = (seconds >= 1 && seconds === Math.floor(seconds)) ? String(seconds) : String(parseFloat(seconds.toFixed(1)));
    el.textContent = I18N.t('clock.pm', { s });
}

// --- New game dialog ---

function showNewGameDialog() {
    const dialog = document.getElementById('new-game-dialog');
    try { const s = document.getElementById('new-opening'); if (s) s.value = localStorage.getItem('sambrk.opening') || '0'; } catch (e) {}
    if (dialog) dialog.style.display = 'flex';
}

function hideNewGameDialog() {
    const dialog = document.getElementById('new-game-dialog');
    if (dialog) dialog.style.display = 'none';
}

// --- Listes officielles d'ouvertures tirées au sort (2 coups : 43, 3 coups : 238) ---
const OPEN2 = ["9-13 21-17","9-13 21-18","9-13 22-19","9-13 23-19","9-13 23-20","9-13 24-20","10-13 21-17","10-13 21-18","10-13 22-19","10-13 23-19","10-13 23-20","10-13 24-20","10-14 21-17","10-14 21-18","10-14 22-18","10-14 22-19","10-14 23-19","10-14 23-20","10-14 24-20","11-14 21-17","11-14 21-18","11-14 22-18","11-14 22-19","11-14 23-19","11-14 23-20","11-14 24-20","11-15 21-17","11-15 21-18","11-15 22-18","11-15 23-19","11-15 23-20","12-15 21-17","12-15 21-18","12-15 22-18","12-15 23-19","12-15 23-20","12-16 21-17","12-16 21-18","12-16 22-18","12-16 22-19","12-16 23-19","12-16 23-20","12-16 24-20"];
const OPEN3 = ["9-13 21-17 5-9","9-13 21-17 10-14","9-13 21-17 11-14","9-13 21-17 12-16","9-13 21-18 13-17","9-13 21-18 5-9","9-13 22-19 13-17","9-13 22-19 13-18","9-13 22-19 5-9","9-13 22-19 10-14","9-13 22-19 11-14","9-13 22-19 12-15","9-13 22-19 12-16","9-13 23-19 13-17","9-13 23-19 5-9","9-13 23-19 13-18","9-13 23-19 11-15","9-13 23-19 12-15","9-13 23-19 12-16","9-13 23-20 13-17","9-13 23-20 13-18","9-13 23-20 5-9","9-13 24-20 13-17","9-13 24-20 13-18","9-13 24-20 5-9","9-13 24-20 12-15","9-13 24-20 12-16","10-13 21-17 13-18","10-13 21-17 5-10","10-13 21-17 6-10","10-13 21-17 11-14","10-13 21-17 11-15","10-13 21-17 12-15","10-13 21-17 12-16","10-13 21-18 13-17","10-13 21-18 5-10","10-13 21-18 6-10","10-13 21-18 11-14","10-13 21-18 11-15","10-13 21-18 12-15","10-13 21-18 12-16","10-13 22-19 13-17","10-13 22-19 13-18","10-13 22-19 11-14","10-13 22-19 5-10","10-13 22-19 6-10","10-13 22-19 11-15","10-13 22-19 12-15","10-13 22-19 12-16","10-13 23-19 13-17","10-13 23-19 13-18","10-13 23-19 5-10","10-13 23-19 6-10","10-13 23-19 11-14","10-13 23-19 11-15","10-13 23-19 12-15","10-13 23-19 12-16","10-13 23-20 13-17","10-13 23-20 13-18","10-13 23-20 5-10","10-13 23-20 6-10","10-13 23-20 11-14","10-13 23-20 11-15","10-13 23-20 12-15","10-13 23-20 12-16","10-13 24-20 13-17","10-13 24-20 13-18","10-13 24-20 5-10","10-13 24-20 6-10","10-13 24-20 11-14","10-13 24-20 11-15","10-13 24-20 12-15","10-13 24-20 12-16","10-14 21-17 9-13","10-14 21-17 5-10","10-14 21-17 6-10","10-14 21-17 14-18","10-14 21-17 11-15","10-14 21-17 12-15","10-14 21-17 12-16","10-14 21-18 14x21","10-14 22-18 5-10","10-14 22-18 6-10","10-14 22-18 11-15","10-14 22-18 12-15","10-14 22-18 12-16","10-14 22-19 9-13","10-14 22-19 5-10","10-14 22-19 6-10","10-14 22-19 14-18","10-14 22-19 11-15","10-14 22-19 12-15","10-14 22-19 12-16","10-14 23-19 14x23","10-14 23-20 5-10","10-14 23-20 6-10","10-14 23-20 14-18","10-14 23-20 14-19","10-14 23-20 11-15","10-14 23-20 12-15","10-14 23-20 12-16","10-14 24-20 5-10","10-14 24-20 6-10","10-14 24-20 14-18","10-14 24-20 11-15","10-14 24-20 12-15","10-14 24-20 12-16","11-14 21-17 9-13","11-14 21-17 10-13","11-14 21-17 14-18","11-14 21-17 14-19","11-14 21-17 6-11","11-14 21-17 7-11","11-14 21-17 12-15","11-14 21-17 12-16","11-14 21-18 14x21","11-14 22-18 10-13","11-14 22-18 14-19","11-14 22-18 6-11","11-14 22-18 7-11","11-14 22-18 12-15","11-14 22-18 12-16","11-14 22-19 9-13","11-14 22-19 10-13","11-14 22-19 6-11","11-14 22-19 7-11","11-14 22-19 12-15","11-14 22-19 12-16","11-14 23-19 14x23","11-14 23-20 10-13","11-14 23-20 14-18","11-14 23-20 14-19","11-14 23-20 6-11","11-14 23-20 7-11","11-14 23-20 12-15","11-14 23-20 12-16","11-14 24-20 10-13","11-14 24-20 14-19","11-14 24-20 6-11","11-14 24-20 7-11","11-14 24-20 12-15","11-14 24-20 12-16","11-15 21-17 10-13","11-15 21-17 10-14","11-15 21-17 6-11","11-15 21-17 7-11","11-15 21-17 15-19","11-15 21-17 12-16","11-15 21-18 10-13","11-15 21-18 10-14","11-15 21-18 6-11","11-15 21-18 7-11","11-15 21-18 15-19","11-15 21-18 12-16","11-15 22-18 10-13","11-15 22-18 10-14","11-15 22-18 6-11","11-15 22-18 7-11","11-15 22-18 15-19","11-15 22-18 12-16","11-15 23-19 9-13","11-15 23-19 10-13","11-15 23-19 10-14","11-15 23-19 6-11","11-15 23-19 7-11","11-15 23-19 12-16","11-15 23-20 10-13","11-15 23-20 10-14","11-15 23-20 6-11","11-15 23-20 7-11","11-15 23-20 12-16","11-15 23-20 15-19","12-15 21-17 10-13","12-15 21-17 10-14","12-15 21-17 11-14","12-15 21-17 7-12","12-15 21-17 8-12","12-15 21-18 10-13","12-15 21-18 10-14","12-15 21-18 11-14","12-15 21-18 7-12","12-15 21-18 8-12","12-15 22-18 10-13","12-15 22-18 10-14","12-15 22-18 15-19","12-15 22-18 7-12","12-15 22-18 8-12","12-15 22-18 11-14","12-15 23-19 9-13","12-15 23-19 10-13","12-15 23-19 10-14","12-15 23-19 11-14","12-15 23-19 7-12","12-15 23-19 8-12","12-15 23-20 10-13","12-15 23-20 10-14","12-15 23-20 11-14","12-15 23-20 7-12","12-15 23-20 8-12","12-16 21-17 9-13","12-16 21-17 10-13","12-16 21-17 10-14","12-16 21-17 11-14","12-16 21-17 11-15","12-16 21-17 7-12","12-16 21-17 8-12","12-16 21-18 10-13","12-16 21-18 10-14","12-16 21-18 11-14","12-16 21-18 11-15","12-16 21-18 7-12","12-16 21-18 8-12","12-16 22-18 10-13","12-16 22-18 10-14","12-16 22-18 11-14","12-16 22-18 11-15","12-16 22-18 7-12","12-16 22-18 8-12","12-16 22-19 9-13","12-16 22-19 10-13","12-16 22-19 10-14","12-16 22-19 11-14","12-16 22-19 11-15","12-16 22-19 7-12","12-16 22-19 8-12","12-16 23-19 9-13","12-16 23-19 10-13","12-16 23-19 10-14","12-16 23-19 11-14","12-16 23-19 11-15","12-16 23-19 7-12","12-16 23-20 16x23","12-16 24-20 9-13","12-16 24-20 10-13","12-16 24-20 10-14","12-16 24-20 11-14","12-16 24-20 11-15","12-16 24-20 7-12"];

async function playRandomOpening(plies) {
    const list = plies === 2 ? OPEN2 : plies === 3 ? OPEN3 : null;
    let done = 0;
    if (list) {
        const pick = list[Math.floor(Math.random() * list.length)];
        for (const tok of pick.split(' ')) {
            if (gameState.gameOver) break;
            const m = (gameState.legalMoves || []).find(x => x.notation === tok);
            if (!m) break;
            await gameState.makeMove(m);
            done++;
        }
        if (done === plies) { try { window.__lastOpening = pick; } catch (e) {} return; }
    }
    // secours : coups au hasard pour compléter
    for (let i = done; i < plies && !gameState.gameOver; i++) {
        const moves = gameState.legalMoves;
        if (!moves || !moves.length) break;
        await gameState.makeMove(moves[Math.floor(Math.random() * moves.length)]);
    }
}

async function startNewGame(playAs) {
    hideNewGameDialog();
    clearSearchInfo();
    const sel = document.getElementById('new-opening');
    const plies = sel ? parseInt(sel.value, 10) || 0 : 0;
    try { localStorage.setItem('sambrk.opening', String(plies)); } catch (e) {}

    await searchManager.abort();
    const wasAuto = turnController.autoPlay, wasPonder = turnController.ponderEnabled;
    if (plies) { turnController.autoPlay = false; turnController.ponderEnabled = false; }
    await gameState.newGame();
    playStartSound();

    if (playAs === 'white') {
        boardUI.setFlipped(false);
        turnController.setHumanColor('white');
    } else if (playAs === 'black') {
        boardUI.setFlipped(true);
        turnController.setHumanColor('black');
    } else {
        boardUI.setFlipped(false);
        turnController.setHumanColor('both');
    }

    if (plies) {
        await playRandomOpening(plies);
        if (gameClock) gameClock.reset();
        turnController.autoPlay = wasAuto; turnController.ponderEnabled = wasPonder;
    }

    updateModeButtons();
    updateUndoRedoButtons();
    updateMoveHistory();
    updatePlayButton();
    if (plies) { try { await turnController._evaluateTurn(); } catch (e) { console.warn(e); } }
}

// --- Analyse étendue (réflexion sur tous les coups) ---

let extRun = 0;
let extActive = false;
let extRows = [];
let extSel = -1;

function fmtScore(s) {
    if (Math.abs(s) > 29000) {
        const m = Math.ceil((30000 - Math.abs(s)) / 2);
        return s > 0 ? `M${m}` : `-M${m}`;
    }
    if (Math.abs(s) <= 10000) return (s >= 0 ? '+' : '') + (s / 100).toFixed(2);
    const raw = s > 0 ? s - 10000 : s + 10000;
    return (raw > 0 ? '+' : '') + (raw / 100).toFixed(2);
}

function extLine(row) {
    const all = [row.move.notation, ...(row.pv || [])];
    let out = '', n = 1;
    all.forEach((m, i) => {
        if (i % 2 === 0) out += `${i ? ' ' : ''}${n++}.${m}`; else out += ` ${m}`;
    });
    return out;
}

function renderExt() {
    const box = document.getElementById('ext-rows');
    if (!box) return;
    const sorted = extRows.map((r, i) => ({ r, i })).sort((a, b) => b.r.score - a.r.score);
    box.innerHTML = '';
    sorted.forEach(({ r, i }) => {
        const d = document.createElement('div');
        d.className = 'ext-row' + (i === extSel ? ' sel' : '');
        const sc = r.done || r.depth ? fmtScore(r.score) : '...';
        d.innerHTML = `<span class="sc ${r.score > 20 ? 'pos' : r.score < -20 ? 'neg' : ''}">${sc}</span><span class="dp">${r.depth ? '[' + r.depth + ']' : ''}</span><span class="ln"></span>`;
        d.querySelector('.ln').textContent = extLine(r);
        d.addEventListener('click', () => {
            extSel = i;
            const nums = (r.move.notation.match(/\d+/g) || []).map(Number);
            if (boardUI && nums.length > 1) boardUI.setArrow(nums);
            renderExt();
        });
        box.appendChild(d);
    });
}

function setExtStatus(t) {
    const el = document.getElementById('ext-status');
    if (el) el.textContent = t;
}

function stopExtAnalysis() {
    if (!extActive) return;
    extRun++;
    extActive = false;
    engine.stopSearch();
}

async function startExtAnalysis() {
    if (extActive) { stopExtAnalysis(); return; }
    if (editMode || gameState.gameOver || !gameState.legalMoves.length) return;
    if (searchManager.state === 'thinking') { setExtStatus("Attendez la fin du coup de l'ordinateur."); document.getElementById('ext-panel').style.display = 'block'; return; }

    const run = ++extRun;
    extActive = true;
    const panel = document.getElementById('ext-panel');
    const lp = document.getElementById('learn-panel'); if (lp) lp.style.display = 'none';
    panel.style.display = 'block';
    const board = gameState.board;
    const moves = gameState.legalMoves.slice();
    const secs = parseFloat(document.getElementById('ext-time').value) || 2;
    const wasPonder = turnController.ponderEnabled;
    const savedAuto = turnController.autoPlay;
    turnController.autoPlay = false;
    if (wasPonder) await togglePondering(false);
    await searchManager.abort();
    if (boardUI) boardUI.setArrow(null);

    extRows = moves.map(m => ({ move: m, score: -99999, depth: 0, pv: [], done: false }));
    extSel = -1;
    renderExt();

    try {
        for (let k = 0; k < moves.length; k++) {
            if (run !== extRun || gameState.board !== board) break;
            setExtStatus(`Coup ${k + 1} / ${moves.length} : ${moves[k].notation} (${secs} s par coup)`);
            const child = await engine.makeMove(board, moves[k]);
            const reply = await engine.getLegalMoves(child);
            const row = extRows[k];
            if (reply.length === 0) {
                row.score = 30000; row.depth = 0; row.done = true; renderExt(); continue;
            }
            const onProg = (r) => {
                if (run !== extRun || r.score === undefined) return;
                row.score = -r.score; row.depth = r.depth; row.pv = r.pv || [];
                renderExt();
            };
            const res = await engine.search(child, secs, secs, onProg, true);
            if (run !== extRun) break;
            if (res && !res.error && res.score !== undefined) {
                row.score = -res.score; row.depth = res.depth; row.pv = res.pv || [];
            }
            row.done = true;
            renderExt();
        }
        if (run === extRun) {
            setExtStatus('Analyse terminée. Cliquez sur une ligne pour voir la flèche.');
            const best = extRows.reduce((b, r, i) => (b < 0 || r.score > extRows[b].score) ? i : b, -1);
            if (best >= 0) {
                extSel = best;
                const nums = (extRows[best].move.notation.match(/\d+/g) || []).map(Number);
                if (boardUI && nums.length > 1) boardUI.setArrow(nums);
                renderExt();
            }
        } else {
            setExtStatus('Analyse arrêtée.');
        }
    } catch (err) {
        console.error('Analyse étendue:', err);
        setExtStatus('Erreur pendant l\'analyse.');
    } finally {
        if (run === extRun) extActive = false;
        turnController.autoPlay = savedAuto;
        if (wasPonder && !turnController.ponderEnabled) await togglePondering(true);
        const b = document.getElementById('btn-ext');
        if (b) b.textContent = 'Réflexion';
    }
}

function setupExtAnalysis() {
    const btn = document.getElementById('btn-ext');
    if (btn) btn.addEventListener('click', () => {
        const panel = document.getElementById('ext-panel');
        if (extActive) { stopExtAnalysis(); return; }
        if (panel.style.display !== 'none') { panel.style.display = 'none'; if (boardUI) boardUI.setArrow(null); return; }
        startExtAnalysis();
    });
    const stop = document.getElementById('ext-stop');
    if (stop) stop.addEventListener('click', () => { if (extActive) stopExtAnalysis(); else startExtAnalysis(); });
    const close = document.getElementById('ext-close');
    if (close) close.addEventListener('click', () => {
        stopExtAnalysis();
        document.getElementById('ext-panel').style.display = 'none';
        if (boardUI) boardUI.setArrow(null);
    });
    const panelIds = ['ext-panel', 'learn-panel'];
    const refreshOpen = () => {
        const open = panelIds.some(id => { const el = document.getElementById(id); return el && el.style.display !== 'none'; });
        document.body.classList.toggle('ext-open', open);
        window.dispatchEvent(new Event('resize'));
        setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    };
    panelIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) new MutationObserver(refreshOpen).observe(el, { attributes: true, attributeFilter: ['style'] });
    });
    if (gameState) gameState.addEventListener('move', () => { stopExtAnalysis(); const p = document.getElementById('ext-panel'); if (p) p.style.display = 'none'; });
}

// --- Enregistrement automatique des parties ---

let autoSaveId = null;
let autoSaveOff = false;   // partie chargée pour analyse : pas d'enregistrement
let autoSaveCustom = false; // partie commencée depuis une position composée

let autoSaveEnabled = false;   // choix de l'utilisateur : pas d'enregistrement automatique par défaut
let savedPly = -1;             // nombre de coups au dernier enregistrement

function getPlayerNames() {
    const w = (document.getElementById('inp-white-name') || {}).value || '';
    const b = (document.getElementById('inp-black-name') || {}).value || '';
    return { white: w.trim(), black: b.trim() };
}

function autoSaveGame(result, reason, force) {
    if (!force && !autoSaveEnabled) return;
    if (matchPlayActive || autoSaveOff || !gameState) return;
    const moves = gameState.history.map(h => h.notation);
    if (moves.length < 2) return;
    if (!autoSaveId) autoSaveId = Date.now();
    const prev = getGames().find(g => g.id === autoSaveId);
    const startBoard = gameState.history[0] && gameState.history[0].board;
    const names = getPlayerNames();
    upsertGame({
        id: autoSaveId,
        start: autoSaveCustom && startBoard
            ? { white: startBoard.white, black: startBoard.black, kings: startBoard.kings, whiteToMove: startBoard.whiteToMove }
            : undefined,
        date: prev ? prev.date : new Date().toISOString(),
        moves,
        result: result || (gameState.gameOver ? gameState.winner : (prev && prev.result) || 'unfinished'),
        resultReason: reason || (prev && prev.resultReason) || null,
        playerColor: turnController.humanColor,
        white: names.white || (prev && prev.white) || undefined,
        black: names.black || (prev && prev.black) || undefined,
        free: true
    });
    savedPly = moves.length;
}

function manualSaveGame() {
    if (!gameState || matchPlayActive || autoSaveOff) return;
    const res = gameState.gameOver ? gameState.winner : null;
    autoSaveGame(res, gameState.gameOver ? (gameState.gameOverReason || null) : null, true);
    updateSaveButton();
}

function updateSaveButton() {
    const b = document.getElementById('btn-save-game');
    if (!b || !gameState) return;
    const n = gameState.history.length;
    const can = n >= 2 && !autoSaveOff && !matchPlayActive;
    const saved = can && autoSaveId && savedPly === n;
    b.disabled = !can || saved;
    b.classList.toggle('saved', !!saved);
    b.classList.toggle('pulse', can && !saved && !!gameState.gameOver);
    b.textContent = saved ? '✓ Enregistrée' : '💾 Enregistrer';
}

function setupSaveAndNames() {
    try {
        const nm = JSON.parse(localStorage.getItem('sambrk.names') || '{}');
        const w = document.getElementById('inp-white-name'), b = document.getElementById('inp-black-name');
        if (w && nm.white) w.value = nm.white;
        if (b && nm.black) b.value = nm.black;
        autoSaveEnabled = localStorage.getItem('sambrk.autosave') === '1';
    } catch (e) {}
    const chk = document.getElementById('chk-autosave');
    if (chk) {
        chk.checked = autoSaveEnabled;
        chk.addEventListener('change', () => {
            autoSaveEnabled = chk.checked;
            try { localStorage.setItem('sambrk.autosave', autoSaveEnabled ? '1' : '0'); } catch (e) {}
            if (autoSaveEnabled) autoSaveGame();
            updateSaveButton();
        });
    }
    for (const id of ['inp-white-name', 'inp-black-name']) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            try { localStorage.setItem('sambrk.names', JSON.stringify(getPlayerNames())); } catch (e) {}
            // si la partie est déjà enregistrée, le nom suit
            if (autoSaveId && savedPly >= 0) { savedPly = -1; if (autoSaveEnabled) autoSaveGame(); }
            updateSaveButton();
        });
    }
    const sb = document.getElementById('btn-save-game');
    if (sb) sb.addEventListener('click', manualSaveGame);
    setInterval(updateSaveButton, 400);
    updateSaveButton();
}

// --- Vidéo de la partie (caméra et micro facultatifs) ---

let recState = null;

function pickMime() {
    const list = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    if (typeof MediaRecorder === 'undefined') return null;
    for (const t of list) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (e) {} }
    return '';
}

function drawRecFrame(r) {
    const { cv, ctx, board, video, W, H, SP } = r;
    ctx.fillStyle = '#2b1a0e'; ctx.fillRect(0, 0, W, H);
    const bs = H;
    const sc = Math.min(bs / board.width, bs / board.height);
    const bw = board.width * sc, bh = board.height * sc;
    try { ctx.drawImage(board, (bs - bw) / 2, (bs - bh) / 2, bw, bh); } catch (e) {}
    const x0 = bs + 14; let y = 14;
    if (video && video.videoWidth) {
        const cw = SP - 28, ch = Math.round(cw * video.videoHeight / video.videoWidth);
        try { ctx.drawImage(video, x0, y, cw, ch); } catch (e) {}
        ctx.strokeStyle = '#f0c35e'; ctx.lineWidth = 2; ctx.strokeRect(x0, y, cw, ch);
        y += ch + 14;
    }
    const names = getPlayerNames();
    ctx.fillStyle = '#f5e6c8'; ctx.font = 'bold 17px sans-serif'; ctx.textBaseline = 'top';
    ctx.fillText('⚪ ' + (names.white || 'Blancs'), x0, y); y += 24;
    ctx.fillText('⚫ ' + (names.black || 'Noirs'), x0, y); y += 32;
    ctx.font = '15px sans-serif'; ctx.fillStyle = '#e8d3a8';
    const mv = gameState ? gameState.history.map(h => h.notation) : [];
    const rows = [];
    for (let i = 0; i < mv.length; i += 2) rows.push((i / 2 + 1) + '. ' + mv[i] + (mv[i + 1] ? '  ' + mv[i + 1] : ''));
    const maxRows = Math.max(1, Math.floor((H - y - 36) / 20));
    for (const line of rows.slice(-maxRows)) { ctx.fillText(line, x0, y); y += 20; }
    const s = Math.floor((Date.now() - r.t0) / 1000);
    ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(x0 + 8, H - 22, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'), x0 + 22, H - 31);
}

async function startRec() {
    const btn = document.getElementById('btn-rec');
    const board = document.getElementById('board');
    const mime = pickMime();
    if (mime === null || !board || !board.captureStream && !HTMLCanvasElement.prototype.captureStream) {
        alert("Ce navigateur ne sait pas filmer. Essayez avec Chrome, Edge ou Firefox.");
        return;
    }
    const useCam = !!(document.getElementById('chk-rec-cam') || {}).checked;
    const useMic = !!(document.getElementById('chk-rec-mic') || {}).checked;
    let media = null, video = null;
    if ((useCam || useMic) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            media = await navigator.mediaDevices.getUserMedia({
                video: useCam ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false,
                audio: useMic
            });
        } catch (e) {
            alert("Caméra ou micro refusés ou introuvables. La partie sera filmée sans.");
            media = null;
        }
    } else if (useCam || useMic) {
        alert("La caméra n'est pas disponible ici (il faut un site sécurisé https). La partie sera filmée sans.");
    }
    if (media && useCam && media.getVideoTracks().length) {
        video = document.createElement('video');
        video.muted = true; video.playsInline = true; video.srcObject = media;
        try { await video.play(); } catch (e) {}
    }
    const H = 640, SP = 260, W = H + SP;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const r = { cv, ctx, board, video, W, H, SP, t0: Date.now(), media, chunks: [] };
    drawRecFrame(r);
    const out = cv.captureStream(15);
    if (media) for (const t of media.getAudioTracks()) out.addTrack(t);
    let mr;
    try { mr = mime ? new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 2500000 }) : new MediaRecorder(out); }
    catch (e) { alert('Impossible de démarrer la vidéo : ' + e.message); if (media) media.getTracks().forEach(t => t.stop()); return; }
    r.mr = mr;
    mr.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
    mr.onstop = () => {
        clearInterval(r.timer);
        if (media) media.getTracks().forEach(t => t.stop());
        const type = (mr.mimeType || mime || 'video/webm');
        const blob = new Blob(r.chunks, { type });
        const ext = /mp4/.test(type) ? 'mp4' : 'webm';
        const d = new Date(), pad = n => String(n).padStart(2, '0');
        const name = `sambrk-partie-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        recState = null;
        if (btn) { btn.classList.remove('recording'); btn.textContent = '🎥 Filmer'; }
        r.blob = blob; window.__lastRec = { name, size: blob.size, type };
    };
    r.timer = setInterval(() => {
        drawRecFrame(r);
        if (btn) {
            const s = Math.floor((Date.now() - r.t0) / 1000);
            btn.textContent = '⏹ Arrêter ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
        }
    }, 66);
    mr.start(1000);
    recState = r;
    if (btn) btn.classList.add('recording');
}

function toggleRec() {
    if (recState) { try { recState.mr.stop(); } catch (e) {} return; }
    startRec();
}

function setupRec() {
    const b = document.getElementById('btn-rec');
    if (b) b.addEventListener('click', toggleRec);
}

function setupAutoSave() {
    if (!gameState) return;
    gameState.addEventListener('newGame', () => { savedPly = -1; autoSaveId = null; autoSaveOff = false; autoSaveCustom = false; });
    gameState.addEventListener('positionChanged', () => { savedPly = -1; autoSaveId = null; autoSaveOff = false; autoSaveCustom = true; });
    gameState.addEventListener('gameLoaded', () => { savedPly = -1; autoSaveId = null; autoSaveOff = true; autoSaveCustom = false; });
    gameState.addEventListener('move', () => autoSaveGame());
    gameState.addEventListener('gameOver', (e) => autoSaveGame(e.detail.winner, e.detail.reason));
}

// --- Navigation : début / fin / revoir la partie automatiquement ---

let autoRun = 0;
let autoPlaying = false;

function updateNavButtons() {
    if (!gameState) return;
    const { canUndo, canRedo } = gameState.getUndoRedoState();
    const busy = searchManager.state === 'thinking';
    const s = document.getElementById('btn-start'), e = document.getElementById('btn-end'), a = document.getElementById('btn-auto');
    if (s) s.disabled = !canUndo || busy || autoPlaying;
    if (e) e.disabled = !canRedo || busy || autoPlaying;
    if (a) a.disabled = (!canUndo && !canRedo) || (busy && !autoPlaying) || editMode;
    const pl = document.getElementById('btn-play-replay'), pa = document.getElementById('btn-pause-replay'), st = document.getElementById('btn-stop-replay');
    const any = (canUndo || canRedo) && !editMode;
    if (pl) pl.disabled = !any || autoPlaying || busy;
    if (pa) pa.disabled = !autoPlaying;
    if (st) st.disabled = !autoPlaying;
    if (pl) pl.classList.toggle('on', autoPlaying);
}

async function reviewSession(fn) {
    const savedAuto = turnController.autoPlay;
    const wasPonder = turnController.ponderEnabled;
    turnController.autoPlay = false;
    if (wasPonder) await togglePondering(false);
    await searchManager.abort();
    try { await fn(); } finally {
        turnController.autoPlay = savedAuto;
        if (wasPonder && !turnController.ponderEnabled) await togglePondering(true);
        updateNavButtons();
    }
}

function stopAutoReplay() {
    if (!autoPlaying) return;
    autoRun++;
    autoPlaying = false;
    const a = document.getElementById('btn-auto');
    if (a) { a.textContent = '▶ Revoir la partie'; a.classList.remove('playing'); }
    updateNavButtons();
}

async function goStart() {
    stopAutoReplay();
    await reviewSession(async () => { while (gameState.getUndoRedoState().canUndo) await gameState.undo(); });
}

async function goEnd() {
    stopAutoReplay();
    await reviewSession(async () => { while (gameState.getUndoRedoState().canRedo) await gameState.redo(); });
}

async function toggleAutoReplay() {
    if (autoPlaying) { stopAutoReplay(); return; }
    if (editMode) return;
    const run = ++autoRun;
    autoPlaying = true;
    const a = document.getElementById('btn-auto');
    a.textContent = '⏸ Pause'; a.classList.add('playing');
    updateNavButtons();
    const ext = document.getElementById('ext-panel');
    await reviewSession(async () => {
        // si on est déjà à la fin, on recommence depuis le début
        if (!gameState.getUndoRedoState().canRedo) {
            while (run === autoRun && gameState.getUndoRedoState().canUndo) await gameState.undo();
            if (run === autoRun) await new Promise(r => setTimeout(r, 600));
        }
        while (run === autoRun && gameState.getUndoRedoState().canRedo) {
            await gameState.redo();
            const delay = parseInt(document.getElementById('auto-speed').value) || 1200;
            await new Promise(r => setTimeout(r, delay));
        }
    });
    if (run === autoRun) {
        autoPlaying = false;
        a.textContent = '▶ Revoir la partie'; a.classList.remove('playing');
        updateNavButtons();
    }
}

function setupNavButtons() {
    const s = document.getElementById('btn-start'), e = document.getElementById('btn-end'), a = document.getElementById('btn-auto');
    if (s) s.addEventListener('click', goStart);
    if (e) e.addEventListener('click', goEnd);
    if (a) a.addEventListener('click', toggleAutoReplay);
    const pl = document.getElementById('btn-play-replay'), pa = document.getElementById('btn-pause-replay'), st = document.getElementById('btn-stop-replay');
    if (pl) pl.addEventListener('click', () => { if (!autoPlaying) toggleAutoReplay(); });
    if (pa) pa.addEventListener('click', () => stopAutoReplay());
    if (st) st.addEventListener('click', () => goEnd());
    // toute action manuelle arrête la lecture automatique
    for (const id of ['btn-undo', 'btn-redo', 'btn-new-game', 'btn-edit', 'btn-play']) {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', stopAutoReplay, true);
    }
    if (gameState) for (const ev of ['move', 'undo', 'redo', 'newGame', 'positionChanged', 'gameLoaded']) {
        gameState.addEventListener(ev, updateNavButtons);
    }
    searchManager.addEventListener('searchStart', updateNavButtons);
    searchManager.addEventListener('searchEnd', updateNavButtons);
    updateNavButtons();
}

// --- Mémoire des erreurs ---

const MEM_KEY = 'sambrk.errors';
function memLoad() { try { return JSON.parse(localStorage.getItem(MEM_KEY)) || {}; } catch (e) { return {}; } }
function memSave(m) { try { localStorage.setItem(MEM_KEY, JSON.stringify(m)); } catch (e) { console.warn(e); } }
function memPosKey(b) { return `${b.white},${b.black},${b.kings}`; }
function memCount() { return Object.keys(memLoad()).length; }

let learnRun = 0;
let learnActive = false;

function setLearnStatus(t) { const el = document.getElementById('learn-status'); if (el) el.textContent = t; }
function showLearnPanel() {
    const ep = document.getElementById('ext-panel'); if (ep) ep.style.display = 'none';
    document.getElementById('learn-panel').style.display = 'block';
}
function stopLearn() {
    if (!learnActive) return;
    learnRun++;
    learnActive = false;
    engine.stopSearch();
}

async function learnFromGame() {
    if (learnActive) { stopLearn(); return; }
    showLearnPanel();
    const rows = document.getElementById('learn-rows');
    rows.innerHTML = '';
    if (editMode) { setLearnStatus('Quittez le mode édition avant.'); return; }
    const hc = turnController.humanColor;
    if (hc === 'both') { setLearnStatus('Choisissez « Moteur blancs » (B) ou « Moteur noirs » (N), pour que je sache quels coups du moteur analyser.'); return; }
    if (searchManager.state === 'thinking') { setLearnStatus("Attendez la fin du coup de l'ordinateur."); return; }
    const hist = gameState.history.slice();
    if (hist.length < 4) { setLearnStatus('La partie est trop courte pour apprendre quelque chose.'); return; }

    const engineWhite = hc === 'black';
    const boards = hist.map(h => h.board);
    const startBoard = gameState.board;
    boards.push(startBoard);
    const run = ++learnRun;
    learnActive = true;
    const secs = parseFloat(document.getElementById('learn-time').value) || 2;
    const thr = parseInt(document.getElementById('learn-thr').value) || 50;

    const savedAuto = turnController.autoPlay;
    const wasPonder = turnController.ponderEnabled;
    turnController.autoPlay = false;
    if (wasPonder) await togglePondering(false);
    await searchManager.abort();

    const cache = new Map();
    const alive = () => run === learnRun && gameState.board === startBoard;
    async function evalPos(i) {
        if (cache.has(i)) return cache.get(i);
        const b = boards[i];
        const legal = await engine.getLegalMoves(b);
        let r;
        if (legal.length === 0) r = { score: -30000, bestMove: null, legalCount: 0 };
        else {
            const s = await engine.search(b, secs, secs, null, true);
            r = (s && !s.error && s.score !== undefined) ? { score: s.score, bestMove: s.bestMove, legalCount: legal.length } : null;
        }
        cache.set(i, r);
        return r;
    }

    const mem = memLoad();
    let found = 0;
    const engineIdx = [];
    for (let k = 0; k < hist.length; k++) if (boards[k].whiteToMove === engineWhite) engineIdx.push(k);
    try {
        for (let n = 0; n < engineIdx.length; n++) {
            if (!alive()) break;
            const k = engineIdx[n];
            setLearnStatus(`Analyse du coup ${n + 1} / ${engineIdx.length} du moteur (${secs} s par position) — ${found} erreur(s) trouvée(s)`);
            const a = await evalPos(k);
            if (!alive() || !a || a.legalCount < 2 || !a.bestMove) continue;
            const b = await evalPos(k + 1);
            if (!alive() || !b) continue;
            const eBefore = a.score, eAfter = -b.score;
            if ((eBefore <= -800 && eAfter <= -800) || (eBefore >= 800 && eAfter >= 800)) continue;
            const loss = eBefore - eAfter;
            const played = hist[k].notation;
            const better = a.bestMove.notation;
            if (loss >= thr && better && better !== played) {
                const key = memPosKey(boards[k]);
                const old = mem[key];
                const bad = Array.from(new Set([...((old && old.bad) || []), played]));
                mem[key] = { ...(old || {}), bad, better, loss: Math.round(loss), date: new Date().toISOString() };
                memSave(mem);
                found++;
                const d = document.createElement('div');
                d.className = 'ext-row';
                d.innerHTML = '<span class="sc neg"></span><span class="dp"></span><span class="ln"></span>';
                d.querySelector('.sc').textContent = loss >= 1500 ? 'perdu' : '-' + (loss / 100).toFixed(2);
                d.querySelector('.dp').textContent = '#' + (Math.floor(k / 2) + 1);
                d.querySelector('.ln').textContent = `Coup joué ${played} → mieux : ${better}`;
                rows.appendChild(d);
            }
        }
        if (alive()) {
            setLearnStatus(found
                ? `Terminé : ${found} erreur(s) retenue(s). Mémoire totale : ${memCount()} position(s). Le moteur jouera autrement s'il retrouve ces positions.`
                : `Terminé : aucune erreur nette trouvée (seuil ${(thr / 100).toFixed(2)}). Mémoire totale : ${memCount()} position(s).`);
        } else {
            setLearnStatus(`Analyse arrêtée. ${found} erreur(s) retenue(s). Mémoire totale : ${memCount()} position(s).`);
        }
    } catch (err) {
        console.error('Apprentissage:', err);
        setLearnStatus("Erreur pendant l'analyse.");
    } finally {
        if (run === learnRun) learnActive = false;
        turnController.autoPlay = savedAuto;
        if (wasPonder && !turnController.ponderEnabled) await togglePondering(true);
    }
}


// --- Auto-apprentissage : ordinateur contre ordinateur ---
let selfRun = 0, selfActive = false;
function setSelfBtn() { const b = document.getElementById('learn-self'); if (b) b.textContent = selfActive ? '■ Arrêter l\'auto-apprentissage' : '▶ Auto-apprentissage (ordi contre ordi)'; }

async function selfLearnLoop() {
    if (selfActive) { selfRun++; selfActive = false; try { engine.stopSearch(); } catch (e) {} setSelfBtn(); return; }
    if (editMode) { showLearnPanel(); setLearnStatus('Quittez le mode édition avant.'); return; }
    if (learnActive) stopLearn();
    showLearnPanel();
    const rows = document.getElementById('learn-rows'); rows.innerHTML = '';
    const run = ++selfRun; selfActive = true; setSelfBtn();
    const playSecs = parseFloat(document.getElementById('self-time').value) || 0.5;
    const anaSecs = parseFloat(document.getElementById('learn-time').value) || 2;
    const thr = parseInt(document.getElementById('learn-thr').value) || 50;
    const alive = () => run === selfRun;
    const savedAuto = turnController.autoPlay, wasPonder = turnController.ponderEnabled, savedHC = turnController.humanColor;
    turnController.autoPlay = false;
    if (wasPonder) await togglePondering(false);
    await searchManager.abort();
    let games = 0, found = 0;
    try {
        while (alive()) {
            // 1) nouvelle partie avec ouverture tirée au sort (2 ou 3 coups)
            await gameState.newGame();
            turnController.setHumanColor('both');
            await playRandomOpening(Math.random() < 0.5 ? 2 : 3);
            // 2) partie jouée par le moteur contre lui-même
            let ply = 0, still = 0, lastSig = '';
            const pop = x => { x = x >>> 0; let c = 0; while (x) { x &= x - 1; c++; } return c; };
            while (alive() && !gameState.gameOver && ply < 400) {
                { const b = gameState.board, sig = pop(b.white) + ',' + pop(b.black) + ',' + pop((b.white | b.black) & ~b.kings);
                  if (sig === lastSig) still++; else { still = 0; lastSig = sig; }
                  if (still >= 80) break; }   // nulle : 80 coups sans prise ni coup de pion
                const legal = gameState.legalMoves || [];
                if (!legal.length) break;
                let mv = legal[0];
                if (legal.length > 1) {
                    setLearnStatus(`Partie ${games + 1} — coup ${ply + 1} (${playSecs} s/coup) — ${found} erreur(s) mémorisée(s), ${memCount()} position(s) en mémoire`);
                    const r = await engine.search(gameState.board, playSecs, playSecs, null, true);
                    if (!alive()) break;
                    if (r && r.bestMove) mv = legal.find(m => m.notation === r.bestMove.notation) || legal[0];
                }
                await gameState.makeMove(mv);
                ply++;
            }
            if (!alive()) break;
            // 3) analyse de la partie : les erreurs des deux camps sont mémorisées
            const hist = gameState.history.slice();
            if (hist.length >= 4) {
                const boards = hist.map(h => h.board); boards.push(gameState.board);
                const cache = new Map();
                const evalPos = async (i) => {
                    if (cache.has(i)) return cache.get(i);
                    const b = boards[i]; const legal = await engine.getLegalMoves(b); let r;
                    if (!legal.length) r = { score: -30000, bestMove: null, legalCount: 0 };
                    else { const q = await engine.search(b, anaSecs, anaSecs, null, true); r = (q && !q.error && q.score !== undefined) ? { score: q.score, bestMove: q.bestMove, legalCount: legal.length } : null; }
                    cache.set(i, r); return r;
                };
                const mem = memLoad();
                for (let k = 0; k < hist.length && alive(); k++) {
                    setLearnStatus(`Partie ${games + 1} terminée — analyse ${k + 1} / ${hist.length} — ${found} erreur(s) mémorisée(s), ${memCount()} position(s) en mémoire`);
                    const a = await evalPos(k); if (!alive() || !a || a.legalCount < 2 || !a.bestMove) continue;
                    const b = await evalPos(k + 1); if (!alive() || !b) continue;
                    const eBefore = a.score, eAfter = -b.score;
                    if ((eBefore <= -800 && eAfter <= -800) || (eBefore >= 800 && eAfter >= 800)) continue;
                    const loss = eBefore - eAfter, played = hist[k].notation, better = a.bestMove.notation;
                    if (loss >= thr && better && better !== played) {
                        const key = memPosKey(boards[k]); const old = mem[key];
                        const bad = Array.from(new Set([...((old && old.bad) || []), played]));
                        mem[key] = { ...(old || {}), bad, better, loss: Math.round(loss), date: new Date().toISOString() };
                        memSave(mem); found++;
                    }
                }
            }
            if (!alive()) break;
            games++;
            const d = document.createElement('div'); d.className = 'ext-row';
            d.textContent = `Partie ${games} : ${hist.length} coups — mémoire : ${memCount()} position(s)`;
            rows.prepend(d);
        }
    } catch (err) { console.error('Auto-apprentissage:', err); setLearnStatus("Erreur pendant l'auto-apprentissage."); }
    finally {
        const wasMine = run === selfRun;
        selfActive = false; setSelfBtn();
        turnController.autoPlay = savedAuto;
        if (wasPonder && !turnController.ponderEnabled) await togglePondering(true);
        turnController.setHumanColor(savedHC);
        if (wasMine) setLearnStatus(`Auto-apprentissage terminé : ${games} partie(s), ${found} erreur(s) retenue(s). Mémoire : ${memCount()} position(s).`);
        else setLearnStatus(`Auto-apprentissage arrêté : ${games} partie(s) terminée(s), ${found} erreur(s) retenue(s). Mémoire : ${memCount()} position(s).`);
    }
}

// --- Export / import du fichier d'apprentissage ---
function exportLearning() {
    const mem = memLoad();
    const blob = new Blob([JSON.stringify({ sambrk: 'apprentissage', version: 1, date: new Date().toISOString(), positions: mem })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'apprentissage-sambrk-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setLearnStatus(`Fichier exporté : ${Object.keys(mem).length} position(s).`);
}
async function importLearning(file) {
    try {
        const j = JSON.parse(await file.text());
        const inc = j && j.positions ? j.positions : null;
        if (!inc || typeof inc !== 'object') throw new Error('format');
        const mem = memLoad(); let add = 0, upd = 0;
        for (const [k, v] of Object.entries(inc)) {
            if (!/^\d+,\d+,\d+$/.test(k) || !v || typeof v !== 'object') continue;
            const old = mem[k];
            if (!old) { mem[k] = v; add++; continue; }
            const bad = Array.from(new Set([...(old.bad || []), ...(v.bad || [])]));
            mem[k] = { ...old, ...v, bad: bad.length ? bad : undefined }; upd++;
        }
        memSave(mem);
        showLearnPanel();
        setLearnStatus(`Import terminé : ${add} position(s) ajoutée(s), ${upd} fusionnée(s). Mémoire totale : ${memCount()} position(s).`);
    } catch (e) { showLearnPanel(); setLearnStatus("Fichier d'apprentissage non valide."); }
}
function setupSelfLearning() {
    const b = document.getElementById('learn-self'); if (b) b.addEventListener('click', selfLearnLoop);
    const ex = document.getElementById('learn-export'); if (ex) ex.addEventListener('click', exportLearning);
    const im = document.getElementById('learn-import'), fi = document.getElementById('learn-file');
    if (im && fi) { im.addEventListener('click', () => fi.click()); fi.addEventListener('change', async () => { if (fi.files[0]) await importLearning(fi.files[0]); fi.value = ''; }); }
    const stop = document.getElementById('learn-stop'); if (stop) stop.addEventListener('click', () => { if (selfActive) selfLearnLoop(); });
    const close = document.getElementById('learn-close'); if (close) close.addEventListener('click', () => { if (selfActive) selfLearnLoop(); });
}


// --- Livre d'ouvertures personnel (arbre) ---
const BOOK_KEY = 'sambrk.book';
function bookLoad() { try { return JSON.parse(localStorage.getItem(BOOK_KEY)) || {}; } catch (e) { return {}; } }
function bookSave(b) { try { localStorage.setItem(BOOK_KEY, JSON.stringify(b)); } catch (e) { console.warn(e); } }
function bookKey(b) { return `${b.white},${b.black},${b.kings},${b.whiteToMove ? 'w' : 'b'}`; }
function bookCount() { return Object.keys(bookLoad()).length; }
function bookMovesHere() { return bookLoad()[bookKey(gameState.board)] || []; }
function refreshBook() {
    const el = document.getElementById('book-here'); if (!el) return;
    el.textContent = '';
    const mv = bookMovesHere();
    const info = document.createElement('span');
    info.textContent = `Livre : ${bookCount()} position(s). Ici : ` + (mv.length ? '' : 'aucun coup. ');
    el.appendChild(info);
    // coups légaux : clic = ajouter / retirer du livre pour la position affichée
    (gameState.legalMoves || []).forEach(m => {
        const b = document.createElement('button'); const inB = mv.includes(m.notation);
        b.className = 'btn btn-small no-tr'; b.style.margin = '0 3px 3px 0';
        b.textContent = (inB ? '✓ ' : '') + m.notation;
        b.title = inB ? 'Dans le livre — cliquer pour retirer' : 'Cliquer pour ajouter ce coup au livre';
        b.addEventListener('click', () => {
            const bk = bookLoad(), key = bookKey(gameState.board); const l = bk[key] || [];
            const i = l.indexOf(m.notation);
            if (i >= 0) l.splice(i, 1); else l.push(m.notation);
            if (l.length) bk[key] = l; else delete bk[key];
            bookSave(bk); refreshBook();
        });
        el.appendChild(b);
    });
}
function setupBook() {
    const $ = id => document.getElementById(id);
    if ($('btn-book')) $('btn-book').addEventListener('click', () => { showLearnPanel(); refreshBook(); setLearnStatus("Livre d'ouvertures : jouez les coups sur l'échiquier (mode 2 joueurs) puis « Ajouter cette ligne », ou cliquez un coup légal ci-dessous pour l'ajouter à la position affichée. Le moteur jouera ces coups (au hasard s'il y en a plusieurs)."); });
    for (const ev of ['move', 'undo', 'redo', 'newGame', 'positionChanged', 'gameLoaded']) gameState.addEventListener(ev, () => { const p = $('learn-panel'); if (p && p.style.display !== 'none') refreshBook(); });
    if ($('book-add-game')) $('book-add-game').addEventListener('click', () => {
        const n = parseInt($('book-plies').value) || 16;
        const hist = gameState.history.slice(0, n);
        if (!hist.length) { setLearnStatus("Aucun coup à ajouter : jouez d'abord une ligne sur l'échiquier."); return; }
        const bk = bookLoad(); let add = 0;
        for (const h of hist) {
            const key = bookKey(h.board); const l = bk[key] || [];
            if (!l.includes(h.notation)) { l.push(h.notation); add++; }
            bk[key] = l;
        }
        bookSave(bk); refreshBook();
        setLearnStatus(`${add} coup(s) ajouté(s) au livre (${hist.length} coup(s) de la ligne). Le livre contient ${bookCount()} position(s).`);
    });
    if ($('book-clear')) $('book-clear').addEventListener('click', () => { if (confirm(`Vider le livre (${bookCount()} position(s)) ?`)) { localStorage.removeItem(BOOK_KEY); refreshBook(); setLearnStatus('Livre vidé.'); } });
    if ($('book-export')) $('book-export').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify({ sambrk: 'livre', version: 1, date: new Date().toISOString(), book: bookLoad() })], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'livre-sambrk-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        setLearnStatus(`Livre exporté : ${bookCount()} position(s).`);
    });
    if ($('book-import') && $('book-file')) {
        $('book-import').addEventListener('click', () => $('book-file').click());
        $('book-file').addEventListener('change', async () => {
            const f = $('book-file').files[0]; $('book-file').value = ''; if (!f) return;
            try {
                const j = JSON.parse(await f.text()); if (!j.book || typeof j.book !== 'object') throw 0;
                const bk = bookLoad(); let add = 0;
                for (const [k, l] of Object.entries(j.book)) {
                    if (!/^\d+,\d+,\d+,[wb]$/.test(k) || !Array.isArray(l)) continue;
                    const cur = bk[k] || [];
                    for (const m of l) if (typeof m === 'string' && !cur.includes(m)) { cur.push(m); add++; }
                    bk[k] = cur;
                }
                bookSave(bk); refreshBook(); setLearnStatus(`Livre importé : ${add} coup(s) ajouté(s). Total : ${bookCount()} position(s).`);
            } catch (e) { setLearnStatus('Fichier de livre non valide.'); }
        });
    }
    // le moteur joue d'abord le livre personnel
    const prev = turnController.errorMemoryHook;
    turnController.errorMemoryHook = (board, best) => {
        const l = bookLoad()[bookKey(board)];
        if (l && l.length) {
            const legal = (gameState.board && bookKey(gameState.board) === bookKey(board)) ? (gameState.legalMoves || []) : [];
            const cands = legal.filter(m => l.includes(m.notation));
            if (cands.length) return cands[Math.floor(Math.random() * cands.length)];
        }
        return prev ? prev(board, best) : null;
    };
}

function setupLearning() {
    const btn = document.getElementById('btn-learn');
    if (btn) btn.addEventListener('click', learnFromGame);
    const stop = document.getElementById('learn-stop');
    if (stop) stop.addEventListener('click', () => { if (learnActive) stopLearn(); else if (!selfActive) learnFromGame(); });
    const teach = document.getElementById('learn-teach');
    if (teach) teach.addEventListener('click', () => {
        showLearnPanel();
        const rows = document.getElementById('learn-rows');
        rows.innerHTML = '';
        const hist = gameState.history;
        if (!hist.length) { setLearnStatus("Jouez d'abord la partie (par exemple en mode 2 joueurs), puis cliquez ici."); return; }
        const side = document.getElementById('teach-side').value;
        const mem = memLoad();
        let n = 0;
        hist.forEach((h, k) => {
            const isWhite = h.board.whiteToMove;
            if (side === 'white' && !isWhite) return;
            if (side === 'black' && isWhite) return;
            const key = memPosKey(h.board);
            mem[key] = { ...(mem[key] || {}), play: h.notation, date: new Date().toISOString() };
            n++;
            const d = document.createElement('div');
            d.className = 'ext-row';
            d.innerHTML = '<span class="sc pos"></span><span class="dp"></span><span class="ln"></span>';
            d.querySelector('.sc').textContent = isWhite ? 'Blancs' : 'Noirs';
            d.querySelector('.dp').textContent = '#' + (Math.floor(k / 2) + 1);
            d.querySelector('.ln').textContent = `Coup retenu : ${h.notation}`;
            rows.appendChild(d);
        });
        memSave(mem);
        setLearnStatus(`${n} coup(s) retenu(s). Mémoire totale : ${memCount()} position(s). Le moteur les jouera s'il retrouve ces positions.`);
    });
    const close = document.getElementById('learn-close');
    if (close) close.addEventListener('click', () => { stopLearn(); document.getElementById('learn-panel').style.display = 'none'; });
    const clear = document.getElementById('learn-clear');
    if (clear) clear.addEventListener('click', () => {
        if (confirm(`Effacer les ${memCount()} position(s) mémorisées ?`)) {
            localStorage.removeItem(MEM_KEY);
            document.getElementById('learn-rows').innerHTML = '';
            setLearnStatus('Mémoire effacée.');
        }
    });
    // le moteur évite les coups déjà reconnus comme mauvais
    turnController.errorMemoryHook = (board, best) => {
        const e = memLoad()[memPosKey(board)];
        if (!e) return null;
        const cur = gameState.legalMoves.find(m => m.from_xor_to === best.from_xor_to && m.captures === best.captures);
        const notation = cur ? cur.notation : best.notation;
        if (e.play) {
            if (notation === e.play) return null;
            const pm = gameState.legalMoves.find(m => m.notation === e.play);
            if (pm) return pm;
        }
        if (!e.bad || !e.bad.includes(notation)) return null;
        return gameState.legalMoves.find(m => m.notation === e.better) || null;
    };
}

// --- Prise obligatoire automatique ---

let forcedTimer = null;
function setupAutoCapture() {
    const chk = document.getElementById('chk-autocapture');
    try { const v = localStorage.getItem('sambrk.autoCapture'); if (chk && v !== null) chk.checked = v === '1'; } catch (e) {}
    if (chk) chk.addEventListener('change', () => { try { localStorage.setItem('sambrk.autoCapture', chk.checked ? '1' : '0'); } catch (e) {} });
    gameState.addEventListener('move', () => {
        clearTimeout(forcedTimer);
        const board = gameState.board;
        forcedTimer = setTimeout(async () => {
            if (!chk || !chk.checked) return;
            if (gameState.board !== board || gameState.gameOver || editMode) return;
            if (extActive || learnActive || autoPlaying) return;
            if (searchManager.state === 'thinking' || !turnController.isHumanTurn()) return;
            const moves = gameState.legalMoves;
            if (moves.length !== 1 || !String(moves[0].notation).includes('x')) return;
            await animateAndMakeMove(moves[0], true);
        }, 500);
    });
}

// --- Raccourcis clavier (PC) ---

function setupShortcuts() {
    const click = (id) => { const b = document.getElementById(id); if (b && !b.disabled) b.click(); };
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        const t = e.target;
        if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return;
        if (document.querySelector('.dialog')) {
            for (const d of document.querySelectorAll('.dialog')) if (d.style.display && d.style.display !== 'none') return;
        }
        switch (e.key) {
            case 'b': case 'B': click('btn-engine-white'); break;
            case 'n': case 'N': click('btn-engine-black'); break;
            case 'j': case 'J': case '2': click('btn-two-player'); break;
            case 'r': case 'R': click('btn-ext'); break;
            case 'ArrowLeft': click('btn-undo'); break;
            case 'ArrowRight': click('btn-redo'); break;
            case 'Home': click('btn-start'); break;
            case 'End': click('btn-end'); break;
            case ' ':
                if (t && t.tagName === 'BUTTON') return;
                click('btn-auto'); break;
            default: return;
        }
        e.preventDefault();
    });
}

// --- Play button ---

function updatePlayButton() {
    const playBtn = document.getElementById('btn-play');
    if (!playBtn) return;

    const searchInfo = document.getElementById('search-info');
    if (searchInfo && showAnalysis && !editMode) {
        searchInfo.style.display = 'block';
    }

    if (editMode || gameState.gameOver || gameState.legalMoves.length === 0) {
        playBtn.disabled = true;
        return;
    }

    if (searchManager.state === 'pondering') {
        playBtn.disabled = searchManager.currentPV.length === 0;
        return;
    }

    if (searchManager.state === 'thinking') {
        playBtn.disabled = false;
        return;
    }

    // Idle: enabled if it's human's turn
    playBtn.disabled = !turnController.isHumanTurn();
}

// --- Time display ---

function updateTimeDisplay(seconds) {
    const el = document.getElementById('engine-time-left');
    if (!el) return;

    if (seconds < 0) seconds = 0;

    // Round to tenths first to avoid "00:60.0" when e.g. 59.96 rounds up
    const tenths = Math.round(seconds * 10) / 10;

    let text;
    if (tenths >= 3600) {
        const h = Math.floor(tenths / 3600);
        const m = Math.floor((tenths % 3600) / 60);
        const s = Math.floor(tenths % 60);
        text = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
        const m = Math.floor(tenths / 60);
        const s = tenths % 60;
        text = `${String(m).padStart(2, '0')}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
    }
    el.textContent = text;
}

// --- Search info ---

function clearSearchInfo() {
    try { updateMateOverlay(null); } catch (e) {}
    const searchInfo = document.getElementById('search-info');
    if (searchInfo) searchInfo.style.display = 'none';
    if (boardUI) boardUI.setArrow(null);
}

function updateSearchInfo(info) {
    const searchInfo = document.getElementById('search-info');
    if (!searchInfo) return;

    if (showAnalysis && !editMode) searchInfo.style.display = 'block';

    const summaryEl = document.getElementById('search-summary');
    const pvEl = document.getElementById('search-pv');

    if (summaryEl) {
        let depth = info.depth || '-';
        if (info.phase) {
            const phaseLabel = info.phase === 'winning' ? 'gagnant' : info.phase === 'losing' ? 'perdant' : info.phase;
            depth += ` (${phaseLabel})`;
        }
        const score = info.scoreStr || '-';
        const nodes = info.nodes || 0;
        const nodesStr = nodes.toLocaleString();
        const nps = info.nps || 0;
        let npsStr;
        if (nps >= 1000000) {
            npsStr = (nps / 1000000).toFixed(1) + 'M';
        } else if (nps >= 1000) {
            npsStr = (nps / 1000).toFixed(0) + 'k';
        } else {
            npsStr = nps > 0 ? nps.toString() : '-';
        }
        summaryEl.innerHTML = `${depth}. ${score} <span class="search-label">nodes:</span> ${nodesStr} <span class="search-label">nps:</span> ${npsStr}`;
    }
    if (pvEl) pvEl.textContent = info.pvStr || '-';
    if (boardUI && showAnalysis && !editMode && info.pvStr) {
        const mv = /^\s*(\d+(?:\s*[-x]\s*\d+)+)/.exec(info.pvStr);
        if (mv) boardUI.setArrow(mv[1].match(/\d+/g).map(Number));
    }

    // Root moves display
    let rootMovesEl = document.getElementById('search-root-moves');
    if (info.rootMoves && info.rootMoves.length > 0) {
        if (!rootMovesEl) {
            rootMovesEl = document.createElement('div');
            rootMovesEl.id = 'search-root-moves';
            rootMovesEl.className = 'search-info-row search-root-moves';
            searchInfo.appendChild(rootMovesEl);
        }
        const parts = info.rootMoves.map(m => {
            let s;
            if (Math.abs(m.score) > 29000) {
                const mateIn = Math.ceil((30000 - Math.abs(m.score)) / 2);
                s = m.score > 0 ? `M${mateIn}` : `-M${mateIn}`;
            } else if (Math.abs(m.score) <= 10000) {
                const val = (m.score / 100).toFixed(2);
                s = (m.score >= 0 ? '+' : '') + val + '=';
            } else {
                const raw = m.score > 0 ? m.score - 10000 : m.score + 10000;
                const val = (raw / 100).toFixed(2);
                s = raw > 0 ? `+${val}` : val;
            }
            return `${m.notation}: ${s}`;
        });
        rootMovesEl.textContent = parts.join('  ');
        rootMovesEl.style.display = '';
    } else if (rootMovesEl) {
        rootMovesEl.style.display = 'none';
    }

    // Book moves display
    let bookMovesEl = document.getElementById('search-book-moves');
    if (info.bookMoves && info.bookMoves.length > 0) {
        if (!bookMovesEl) {
            bookMovesEl = document.createElement('div');
            bookMovesEl.id = 'search-book-moves';
            bookMovesEl.className = 'search-info-row search-book-moves';
            searchInfo.appendChild(bookMovesEl);
        }
        const parts = info.bookMoves.map(m => {
            const pct = (m.probability * 100).toFixed(0);
            const q = (m.q / 100).toFixed(1);
            return `${m.notation}: ${pct}% (${q})`;
        });
        bookMovesEl.innerHTML = `<span class="search-label">livre :</span> ${parts.join('  ')}`;
        bookMovesEl.style.display = '';
    } else if (bookMovesEl) {
        bookMovesEl.style.display = 'none';
    }

    // Update eval bar
    if (info.score !== undefined) {
        updateEvalBar(info.score);
    }
}

// --- Eval bar ---

function normalizeScore(score) {
    if (Math.abs(score) <= 10000) return 0;
    if (Math.abs(score) > 28000) return score > 0 ? 10000 : -10000;
    return score > 0 ? score - 10000 : score + 10000;
}

let lastEvalScore = null;

function updateMateOverlay(score) {
    const box = document.getElementById('board-container');
    if (!box) return;
    let el = document.getElementById('mate-overlay');
    if (!el) { el = document.createElement('div'); el.id = 'mate-overlay'; el.className = 'no-tr'; box.appendChild(el); }
    if (score === null || score === undefined || Math.abs(score) <= 29000 || Math.abs(score) > 30000 || !showAnalysis) { el.style.display = 'none'; return; }
    const n = Math.max(1, Math.ceil((30000 - Math.abs(score)) / 2));
    // score vu du camp au trait : > 0 = le camp au trait gagne
    el.textContent = (score > 0 ? '#' : '-#') + n;
    el.className = 'no-tr ' + (score > 0 ? 'win' : 'lose');
    el.style.display = 'block';
}

function updateEvalBar(score) {
    lastEvalScore = score;
    try { updateMateOverlay(score); } catch (e) {}
    const bar = document.getElementById('eval-bar-white');
    if (!bar) return;

    const flipped = boardUI.flipped;
    const whiteScore = boardUI.whiteToMove ? score : -score;
    const displayScore = normalizeScore(whiteScore);
    const clamped = Math.max(-10000, Math.min(10000, displayScore));
    const pct = ((clamped + 10000) / 20000) * 100;
    bar.style.height = `${pct}%`;

    if (flipped) {
        bar.style.bottom = '';
        bar.style.top = '0';
    } else {
        bar.style.top = '';
        bar.style.bottom = '0';
    }
}

// --- Move history ---

function updateMoveHistory() {
    const historyEl = document.getElementById('move-history');
    if (!historyEl || !gameState) return;

    const { history, redo } = gameState.getMoveHistoryForDisplay();
    const allMoves = [...history, ...redo];

    if (allMoves.length === 0) {
        historyEl.innerHTML = '';
        return;
    }

    let html = '';
    const lastPlayedIndex = history.length - 1;
    for (let i = 0; i < allMoves.length; i++) {
        const moveNum = Math.floor(i / 2) + 1;
        const isRedo = i >= history.length;

        if (i % 2 === 0) {
            html += `${moveNum}. `;
        }

        if (isRedo) {
            html += `<span class="redo-move">${allMoves[i]}</span> `;
        } else if (i === lastPlayedIndex) {
            html += `<span id="last-played-move">${allMoves[i]}</span> `;
        } else {
            html += `${allMoves[i]} `;
        }
    }

    historyEl.innerHTML = html.trim();

    if (history.length > 0) {
        const lastEl = document.getElementById('last-played-move');
        if (lastEl) {
            // Scroll within the history container only, not the page
            const top = lastEl.offsetTop - historyEl.offsetTop;
            historyEl.scrollTop = top - historyEl.clientHeight / 2;
        }
    } else {
        historyEl.scrollTop = 0;
    }
}

// --- Game over ---

function showGameOver(winner, reason) {
    let message;
    if (winner === 'draw') {
        message = reason ? `Partie nulle — ${reason} !` : 'Partie nulle !';
    } else {
        const name = winner === 'white' ? 'blancs' : 'noirs';
        message = reason ? `Les ${name} gagnent (${reason}) !` : `Les ${name} gagnent !`;
    }

    // Update status text
    if (winner === 'draw') {
        const msg = reason ? `Partie nulle — ${reason} !` : 'Partie nulle !';
        updateStatus(msg);
    } else {
        const winnerName = winner === 'white' ? 'blancs' : 'noirs';
        updateStatus(`Les ${winnerName} gagnent !`);
    }

    console.log(message);

    if (matchPlayActive) {
        saveGame({
            id: Date.now(),
            date: new Date().toISOString(),
            moves: gameState.history.map(h => h.notation),
            result: winner,
            resultReason: reason || null,
            playerColor: turnController.humanColor
        });

        matchStats = computeStats();

        let title, resultMsg;
        if (winner === 'draw') {
            title = 'Partie nulle';
            resultMsg = message;
        } else if (winner === turnController.humanColor) {
            title = 'Vous avez gagné !';
            resultMsg = message;
        } else {
            title = 'Vous avez perdu';
            resultMsg = message;
        }
        setTimeout(() => showMatchResultDialog(title, resultMsg), 100);
    } else {
        setTimeout(() => alert(message), 100);
    }
}

// --- Analysis display ---

function toggleShowAnalysis(enabled) {
    showAnalysis = enabled;

    const evalBar = document.getElementById('eval-bar');
    const searchInfo = document.getElementById('search-info');

    if (enabled) {
        if (evalBar) evalBar.style.visibility = '';
        if (searchInfo) searchInfo.style.display = 'block';
    } else {
        if (evalBar) evalBar.style.visibility = 'hidden';
        if (searchInfo) searchInfo.style.display = 'none';
    }

    updateOptionsButtons();
    savePreferences();
}

// --- Pondering ---

async function togglePondering(enabled) {
    if (enabled) {
        if (turnController.ponderEnabled) return;
        turnController.setPonderEnabled(true);
        updateOptionsButtons();
        updatePlayButton();
    } else {
        if (!turnController.ponderEnabled) return;
        turnController.setPonderEnabled(false);
        updateOptionsButtons();
        updatePlayButton();
    }
    savePreferences();
}


// --- Langues + horloges de la partie ---

const CLOCK_KEY = 'sambrk.clock';
let gameClock = null;

function loadClockCfg() {
    try { const c = JSON.parse(localStorage.getItem(CLOCK_KEY)); if (c && c.mode) return c; } catch (e) {}
    return null;
}

function updateClockUI() {
    if (!gameClock) return;
    const c = gameClock.cfg, act = gameClock.active;
    const w = document.getElementById('clock-w'), b = document.getElementById('clock-b');
    if (w) w.textContent = act ? fmtClock(gameClock.remainingMs('white')) : '--:--';
    if (b) b.textContent = act ? fmtClock(gameClock.remainingMs('black')) : '--:--';
    for (const [side, id, tid] of [['white', 'clock-row-white', 'clock-w'], ['black', 'clock-row-black', 'clock-b']]) {
        const row = document.getElementById(id), tel = document.getElementById(tid);
        if (row) row.classList.toggle('running', gameClock.running === side);
        if (tel) tel.classList.toggle('low', act && gameClock.remainingMs(side) < 30000);
    }
    const pb = document.getElementById('btn-clock-pause');
    if (pb) {
        pb.disabled = !act || (!gameClock.running && !gameClock.paused);
        const want = gameClock.paused ? 'Reprendre' : 'Pause';
        if (pb.dataset.want !== want || !pb.textContent.trim()) { pb.dataset.want = want; pb.textContent = want; }
    }
}

function clockModeLabel() {
    const c = gameClock.cfg, T = I18N.t;
    if (c.mode === 'fixed') return T('clock.fixed', { t: `${Math.floor(((c.min || 0) * 60 + (c.sec || 0)) / 60)}:${String(((c.min || 0) * 60 + (c.sec || 0)) % 60).padStart(2, '0')}` });
    if (c.mode === 'normal') return T('clock.normal', { m: c.min, i: c.inc || 0 });
    if (c.mode === 'tourn') return T('clock.tourn', { m: c.min, n: c.n });
    return T('clock.inf');
}

function applyClockCfg(cfg, save = true) {
    gameClock.setConfig(cfg);
    const c = gameClock.cfg;
    if (save) { try { localStorage.setItem(CLOCK_KEY, JSON.stringify(c)); } catch (e) {} }
    if (c.mode === 'inf' && c.pm >= 0.1) {
        searchManager.setSecondsPerMove(c.pm);
        updateTimePerMoveLabel(c.pm);
    }
    searchManager.resetTimeBank();
    document.body.classList.toggle('clock-hide-bank', c.mode !== 'inf');
    const lab = document.getElementById('clock-mode-label');
    if (lab) lab.textContent = clockModeLabel();
    updateClockUI();
}

function setupClockAndLang() {
    gameClock = new GameClock();
    window.gameClock = () => gameClock;

    // Temps accordé au moteur selon le mode
    searchManager.timeProvider = (board) => {
        const c = gameClock.cfg;
        const side = board.whiteToMove ? 'white' : 'black';
        if (c.mode === 'fixed') {
            const T = Math.max(0.1, (c.min || 0) * 60 + (c.sec || 0));
            return { soft: T, hard: T };
        }
        if (c.mode === 'normal' || c.mode === 'tourn') {
            const R = Math.max(0.3, gameClock.remainingMs(side) / 1000);
            const inc = c.mode === 'normal' ? (c.inc || 0) : 0;
            const soft = Math.min(R / gameClock.movesToGo(side) * 0.9 + inc * 0.8, R * 0.5);
            const hard = Math.max(0.1, Math.min(soft * 3, R - 0.25));
            return { soft: Math.min(soft, hard), hard };
        }
        return null;
    };

    gameClock.addEventListener('tick', updateClockUI);
    gameClock.addEventListener('flag', (e) => {
        const loser = e.detail.side;
        const winner = loser === 'white' ? 'black' : 'white';
        try { searchManager.abort(); } catch (err) {}
        if (!gameState.gameOver) gameState.setGameOver(winner, 'temps écoulé');
        updateClockUI();
    });

    gameState.addEventListener('move', (e) => {
        const { board, gameOver } = e.detail;
        const mover = board.whiteToMove ? 'black' : 'white';
        gameClock.moveMade(mover);
        if (gameOver) gameClock.stop();
        else gameClock.start(board.whiteToMove ? 'white' : 'black');
    });
    gameState.addEventListener('gameOver', () => gameClock.stop());
    for (const ev of ['undo', 'redo', 'positionChanged']) gameState.addEventListener(ev, () => gameClock.stop());
    for (const ev of ['newGame', 'gameLoaded']) gameState.addEventListener(ev, () => gameClock.reset());

    // Dialogue de réglage
    const dlg = document.getElementById('clock-dialog');
    const $ = (id) => document.getElementById(id);
    const modeOf = () => (dlg.querySelector('input[name="clock-mode"]:checked') || {}).value || 'inf';
    const syncFields = () => {
        const mode = modeOf();
        dlg.querySelectorAll('[data-for]').forEach(el => { el.style.display = el.dataset.for.split(' ').includes(mode) ? '' : 'none'; });
    };
    dlg.querySelectorAll('input[name="clock-mode"]').forEach(r => r.addEventListener('change', syncFields));
    $('btn-clock-set').addEventListener('click', () => {
        const c = gameClock.cfg;
        dlg.querySelectorAll('input[name="clock-mode"]').forEach(r => { r.checked = r.value === c.mode; });
        $('ck-min').value = c.min; $('ck-sec').value = c.sec; $('ck-inc').value = c.inc; $('ck-n').value = c.n;
        $('ck-pm').value = searchManager.secondsPerMove;
        syncFields();
        dlg.style.display = 'flex';
    });
    $('btn-clock-cancel').addEventListener('click', () => { dlg.style.display = 'none'; });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.style.display = 'none'; });
    $('btn-clock-ok').addEventListener('click', () => {
        const num = (id, d, lo, hi) => { let v = parseFloat($(id).value); if (isNaN(v)) v = d; return Math.min(hi, Math.max(lo, v)); };
        const mode = modeOf();
        const cfg = {
            mode,
            min: num('ck-min', 5, 0, 600),
            sec: num('ck-sec', 0, 0, 59),
            inc: num('ck-inc', 0, 0, 60),
            n: Math.round(num('ck-n', 30, 1, 200)),
            pm: num('ck-pm', 3, 0.1, 600)
        };
        if ((mode === 'normal' || mode === 'tourn') && cfg.min < 1) cfg.min = 1;
        if (mode === 'fixed' && cfg.min * 60 + cfg.sec < 0.1) cfg.sec = 1;
        dlg.style.display = 'none';
        applyClockCfg(cfg);
    });
    $('btn-clock-pause').addEventListener('click', () => {
        if (gameClock.paused) gameClock.resume(); else gameClock.pause();
        updateClockUI();
    });

    // Réglage mémorisé
    const saved = loadClockCfg();
    applyClockCfg(saved || gameClock.cfg, false);

    // Langue
    const sel = $('lang-select');
    if (sel) {
        sel.value = I18N.getLang();
        sel.addEventListener('change', () => I18N.setLang(sel.value));
    }
    I18N.onLang((l) => {
        if (sel) sel.value = l;
        const lab = document.getElementById('clock-mode-label');
        if (lab) lab.textContent = clockModeLabel();
        const pb = document.getElementById('btn-clock-pause');
        if (pb) { pb.dataset.want = ''; }
        updateClockUI();
        const tp = document.getElementById('btn-time-per-move');
        if (tp) updateTimePerMoveLabel(searchManager.secondsPerMove);
    });

    // Masque les boutons flottants (Couleurs / Agrandir) quand une fenêtre est ouverte
    const refreshDialogOpen = () => {
        const open = [...document.querySelectorAll('.dialog')].some(d => d.style.display === 'flex');
        document.body.classList.toggle('dialog-open', open);
    };
    const mo = new MutationObserver(refreshDialogOpen);
    document.querySelectorAll('.dialog').forEach(d => mo.observe(d, { attributes: true, attributeFilter: ['style'] }));
    refreshDialogOpen();
}

// --- Match Play ---

function getLegacyStats() {
    try {
        const data = localStorage.getItem(MATCH_STATS_KEY);
        if (data) return JSON.parse(data);
    } catch (e) { /* ignore */ }
    return null;
}

async function startMatchPlay() {
    hideNewGameDialog();

    savedPonder = turnController.ponderEnabled;
    savedShowAnalysis = showAnalysis;
    savedUseBook = useBook;

    toggleShowAnalysis(false);

    matchStats = computeStats();
    matchPlayActive = true;
    document.body.classList.add('match-play');
    document.getElementById('game-controls').style.display = 'none';
    document.getElementById('match-toolbar').style.display = 'flex';
    clearSearchInfo();

    const games = getGames();
    const lastGame = games.length > 0 ? games[games.length - 1] : null;
    const color = lastGame ? (lastGame.playerColor === 'white' ? 'black' : 'white') : 'white';

    searchManager.setSecondsPerMove(3);
    useBook = true;
    engine.setUseBook(true);

    await searchManager.abort();
    await gameState.newGame();
    boardUI.setFlipped(color === 'black');
    turnController.setHumanColor(color);

    await togglePondering(true);
}

let resignResolve = null;

function matchResign() {
    document.getElementById('resign-confirm-dialog').style.display = 'flex';
    return new Promise(resolve => {
        resignResolve = resolve;
    }).then(async (confirmed) => {
        if (!confirmed) return;
        await searchManager.abort();

        const engineColor = turnController.humanColor === 'white' ? 'black' : 'white';
        saveGame({
            id: Date.now(),
            date: new Date().toISOString(),
            moves: gameState.history.map(h => h.notation),
            result: engineColor,
            resultReason: 'abandon',
            playerColor: turnController.humanColor
        });
        matchStats = computeStats();
        showMatchResultDialog('Abandon', 'Vous avez abandonné la partie.');
    });
}

function showMatchResultDialog(title, message) {
    document.getElementById('match-result-title').textContent = title;
    document.getElementById('match-result-message').textContent = message;
    document.getElementById('match-stat-w').textContent = matchStats.wins;
    document.getElementById('match-stat-d').textContent = matchStats.draws;
    document.getElementById('match-stat-l').textContent = matchStats.losses;
    document.getElementById('match-result-dialog').style.display = 'flex';
}

// --- Base de parties ---

const BASES_KEY = 'sambrk.bases';
const DEFAULT_BASE = 'Mes parties';
let currentBase = DEFAULT_BASE;
let baseQuery = '';
let basePlayer = '';
let baseFilter = null;          // Map id -> numéro du coup où la position apparaît
let selectedGameId = null;
const selIds = new Set();        // parties sélectionnées (sélection multiple)
let lastClickedId = null, multiMode = false;
let fltResult = '', fltFrom = '', fltTo = '', fltOpen = '', fltSort = 'dateDesc';
let baseBusy = false;
let shownCount = 200;
const PAGE = 200;

function getBases() {
    let b = null;
    try { b = JSON.parse(localStorage.getItem(BASES_KEY)); } catch (e) {}
    if (!Array.isArray(b)) b = [];
    if (!b.includes(DEFAULT_BASE)) b.unshift(DEFAULT_BASE);
    for (const g of getGames()) { const n = g.base || DEFAULT_BASE; if (!b.includes(n)) b.push(n); }
    return b;
}
function saveBases(b) { try { localStorage.setItem(BASES_KEY, JSON.stringify(b)); } catch (e) {} }
function gameBase(g) { return g.base || DEFAULT_BASE; }
function setBaseStatus(t) { const el = document.getElementById('base-status'); if (el) el.textContent = t; }
function bitCount(n) { n = n >>> 0; let c = 0; while (n) { n &= n - 1; c++; } return c; }

const nMoves = (g) => g.ms ? g.ms.split(' ').length : 0;
const textCache = new WeakMap();
function gameText(g) {
    let t = textCache.get(g);
    if (t === undefined) { t = `${g.white || ''} ${g.black || ''} ${g.event || ''} ${g.date || ''} ${g.ms || ''}`.toLowerCase(); textCache.set(g, t); }
    return t;
}
const normTxt = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const playerCache = new WeakMap();
function playerText(g) {
    let t = playerCache.get(g);
    if (t === undefined) { t = normTxt(`${g.white || ''} ${g.black || ''}`); playerCache.set(g, t); }
    return t;
}
function refreshPlayerList() {
    const dl = document.getElementById('base-players');
    if (!dl) return;
    const cnt = new Map();
    for (const g of getGames()) {
        if (gameBase(g) !== currentBase) continue;
        for (const n of [g.white, g.black]) { const k = (n || '').trim(); if (k) cnt.set(k, (cnt.get(k) || 0) + 1); }
    }
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300);
    dl.innerHTML = '';
    for (const [n] of top) { const o = document.createElement('option'); o.value = n; dl.appendChild(o); }
}
const keyCache = new Map();   // id -> Uint32Array (empreintes de position, en mémoire seulement)
const yieldUI = () => new Promise(r => setTimeout(r, 0));

function filteredGames() {
    let games = getGames().filter(g => gameBase(g) === currentBase);
    const q = baseQuery.trim().toLowerCase();
    if (q) {
        const toks = q.split(/\s+/);
        games = games.filter(g => { const text = gameText(g); return text.includes(q) || toks.every(t => text.includes(t)); });
    }
    const pq = normTxt(basePlayer).trim();
    if (pq) { const pt = pq.split(/\s+/); games = games.filter(g => { const t = playerText(g); return pt.every(x => t.includes(x)); }); }
    if (baseFilter) games = games.filter(g => baseFilter.has(g.id));
    if (fltResult) games = games.filter(g => g.result === fltResult);
    if (fltFrom || fltTo) {
        const a = fltFrom ? Date.parse(fltFrom + 'T00:00:00') : -Infinity, b = fltTo ? Date.parse(fltTo + 'T23:59:59') : Infinity;
        games = games.filter(g => { const t = Date.parse(g.date); return !isNaN(t) && t >= a && t <= b; });
    }
    const op = normMoves(fltOpen);
    if (op) games = games.filter(g => !g.start && (g.ms === op || (g.ms || '').startsWith(op + ' ')));
    const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id);
    const cmp = {
        dateDesc: byDate,
        dateAsc: (a, b) => -byDate(a, b),
        movesDesc: (a, b) => nMoves(b) - nMoves(a),
        movesAsc: (a, b) => nMoves(a) - nMoves(b),
        whiteAZ: (a, b) => normTxt(a.white).localeCompare(normTxt(b.white)),
        blackAZ: (a, b) => normTxt(a.black).localeCompare(normTxt(b.black)),
        result: (a, b) => resRank(a.result) - resRank(b.result)
    }[fltSort] || byDate;
    return games.sort(cmp);
}
function normMoves(t) { return (t || '').trim().replace(/\s+/g, ' ').replace(/(^|[\s\-x])0+(\d)/g, '$1$2'); }
function resRank(r) { return r === 'white' ? 0 : r === 'draw' ? 1 : r === 'black' ? 2 : 3; }

function renderBase() {
    const sel = document.getElementById('base-select');
    const bases = getBases();
    if (!bases.includes(currentBase)) currentBase = DEFAULT_BASE;
    sel.innerHTML = '';
    for (const b of bases) {
        const o = document.createElement('option');
        o.value = b;
        o.textContent = `${b} (${getGames().filter(g => gameBase(g) === b).length})`;
        if (b === currentBase) o.selected = true;
        sel.appendChild(o);
    }
    const stats = computeStats();
    const legacy = getLegacyStats();
    const ds = (stats.wins + stats.draws + stats.losses > 0) ? stats : legacy || { wins: 0, draws: 0, losses: 0 };
    document.getElementById('history-stat-w').textContent = ds.wins;
    document.getElementById('history-stat-d').textContent = ds.draws;
    document.getElementById('history-stat-l').textContent = ds.losses;

    const games = filteredGames();
    const listEl = document.getElementById('history-list');
    listEl.innerHTML = '';
    if (!games.length) {
        const d = document.createElement('div');
        d.className = 'history-empty';
        d.textContent = baseFilter || baseQuery || basePlayer || fltResult || fltFrom || fltTo || fltOpen ? 'Aucune partie ne correspond.' : 'Aucune partie dans cette base.';
        listEl.appendChild(d);
    }
    const total = games.length;
    for (const g of games.slice(0, shownCount)) {
        const d = new Date(g.date);
        const dateStr = isNaN(d) ? (g.date || '') : d.toLocaleDateString('fr', { day: 'numeric', month: 'short', year: '2-digit' });
        const row = document.createElement('div');
        row.className = 'history-item' + (selIds.has(g.id) ? ' selected' : '');
        row.dataset.id = g.id;
        const names = (g.white || g.black) ? `${g.white || '?'} – ${g.black || '?'}` : '';
        const mvl = g.ms ? g.ms.split(' ') : [];
        const preview = mvl.slice(0, 6).join(' ') + (mvl.length > 6 ? ' ...' : '');
        let label, cls = 'draw';
        if (g.free || g.imported) label = g.result === 'white' ? '1-0' : g.result === 'black' ? '0-1' : g.result === 'draw' ? '½' : '…';
        else if (g.result === 'draw') label = 'N';
        else if (g.result === g.playerColor) { label = 'V'; cls = 'win'; } else { label = 'D'; cls = 'loss'; }
        const ply = baseFilter ? baseFilter.get(g.id) : null;
        row.innerHTML = '<span class="history-date"></span><span class="history-moves"></span><span class="history-result"></span>';
        row.querySelector('.history-date').textContent = dateStr;
        const mv = row.querySelector('.history-moves');
        mv.textContent = `${names ? names + ' · ' : ''}${g.event ? g.event + ' · ' : ''}${preview} (${mvl.length} coups${g.start ? ', position composée' : ''}${ply != null ? ', position au coup ' + ply : ''})`;
        const r = row.querySelector('.history-result');
        r.textContent = label; r.classList.add(cls);
        listEl.appendChild(row);
    }
    if (total > shownCount) {
        const more = document.createElement('button');
        more.className = 'history-more';
        more.textContent = `Afficher ${Math.min(PAGE, total - shownCount)} de plus (${shownCount} / ${total})`;
        more.addEventListener('click', () => { shownCount += PAGE; renderBase(); });
        listEl.appendChild(more);
    } else if (total > PAGE) {
        const e = document.createElement('div'); e.className = 'history-empty'; e.textContent = `${total} parties affichées.`; listEl.appendChild(e);
    }
    updateHistoryButtons();
}

function showHistoryDialog() {
    const dialog = document.getElementById('history-dialog');
    if (!dialog) return;
    selectedGameId = null; selIds.clear();
    baseFilter = null;
    baseQuery = '';
    basePlayer = '';
    shownCount = PAGE;
    document.getElementById('base-search').value = '';
    const bpl = document.getElementById('base-player'); if (bpl) bpl.value = '';
    resetFilterUI();
    refreshPlayerList();
    setBaseStatus('');
    renderBase();
    dialog.style.display = 'flex';
}

function resetFilterUI() {
    fltResult = ''; fltFrom = ''; fltTo = ''; fltOpen = ''; fltSort = 'dateDesc'; lastClickedId = null;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    set('flt-result', ''); set('flt-from', ''); set('flt-to', ''); set('flt-open', ''); set('flt-sort', 'dateDesc');
}

function hideHistoryDialog() {
    const dialog = document.getElementById('history-dialog');
    if (dialog) dialog.style.display = 'none';
    selectedGameId = null; selIds.clear();
}

function updateHistoryButtons() {
    const one = selIds.size === 1 && selectedGameId, many = selIds.size >= 1;
    const set = (id, on) => { const b = document.getElementById(id); if (b) b.disabled = !on || baseBusy; };
    set('btn-history-watch', one); set('btn-history-analyze', one); set('btn-history-info', one);
    set('btn-history-move', many); set('btn-history-delete', many);
}

function selectedGame() { return getGames().find(g => g.id === selectedGameId); }

// ---- format PDN ----
function sqList(mask, kings, wantKings) {
    const out = [];
    for (let i = 0; i < 32; i++) if ((mask >>> i) & 1) { const k = (kings >>> i) & 1; if (!!k === wantKings) out.push(i + 1); }
    return out;
}
function fenOf(s) {
    const side = (m) => [...sqList(m & s.kings, s.kings, true).map(n => 'K' + n), ...sqList(m & ~s.kings, s.kings, false)].join(',');
    // dames d'abord, puis pions
    const w = [...sqList(s.white & s.kings, s.kings, true).map(n => 'K' + n), ...sqList(s.white & ~s.kings, s.kings, false).map(String)].join(',');
    const bl = [...sqList(s.black & s.kings, s.kings, true).map(n => 'K' + n), ...sqList(s.black & ~s.kings, s.kings, false).map(String)].join(',');
    return `${s.whiteToMove ? 'W' : 'B'}:W${w}:B${bl}`;
}
function parseFen(fen) {
    const m = /^\s*([WB])\s*:\s*W([^:]*):\s*B([^:]*)\s*$/i.exec(fen || '');
    if (!m) return null;
    const mask = (txt) => { let w = 0, k = 0; for (const t of txt.split(',')) { const mm = /^\s*(K?)(\d+)\.?\s*$/i.exec(t); if (!mm) continue; const bit = (parseInt(mm[2]) - 1) >>> 0; if (bit > 31) continue; w |= (1 << bit); if (mm[1]) k |= (1 << bit); } return { w: w >>> 0, k: k >>> 0 }; };
    const a = mask(m[2]), b = mask(m[3]);
    return { white: a.w, black: b.w, kings: (a.k | b.k) >>> 0, whiteToMove: m[1].toUpperCase() === 'W' };
}
function toPDN(g) {
    const res = g.result === 'white' ? '1-0' : g.result === 'black' ? '0-1' : g.result === 'draw' ? '1/2-1/2' : '*';
    const d = new Date(g.date);
    const ds = isNaN(d) ? '????.??.??' : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    let t = `[Event "${g.event || ''}"]\n[Date "${ds}"]\n[White "${g.white || ''}"]\n[Black "${g.black || ''}"]\n[Result "${res}"]\n`;
    if (g.start) t += `[SetUp "1"]\n[FEN "${fenOf(g.start)}"]\n`;
    let mt = '';
    const blackFirst = g.start && !g.start.whiteToMove;
    g.moves.forEach((m, i) => {
        const idx = blackFirst ? i + 1 : i;
        if (idx % 2 === 0) mt += `${Math.floor(idx / 2) + 1}.${m} `; else mt += (i === 0 ? `1... ` : '') + `${m} `;
    });
    return t + '\n' + mt.trim() + ' ' + res + '\n';
}
function parsePDN(text) {
    const games = [];
    const chunks = [];
    {
        let cur = [], hasMoves = false;
        for (const line of text.replace(/\r/g, '').replace(/^\uFEFF/, '').split('\n')) {
            const isTag = /^\s*\[\w+\s+"/.test(line);
            if (isTag && hasMoves) { chunks.push(cur.join('\n')); cur = []; hasMoves = false; }
            cur.push(line);
            if (!isTag && /\d+\s*[-x:]\s*\d+/.test(line)) hasMoves = true;
        }
        if (cur.length) chunks.push(cur.join('\n'));
    }
    for (const ch of chunks) {
        const tags = {};
        ch.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => { tags[k] = v; return ''; });
        let mt = ch.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/;[^\n]*/g, ' ');
        const moves = [];
        for (let tok of mt.split(/\s+/)) {
            if (!tok) continue;
            if (/^(1-0|0-1|2-0|0-2|1\/2-1\/2|½-½|\*)$/.test(tok)) continue;
            tok = tok.replace(/^\d+\.(\.\.)?/, '').replace(/^\.\.+/, '');
            if (!tok) continue;
            tok = tok.replace(/[+#!?]+$/g, '').replace(/\b0(\d)/g, '$1').replace(/[:]/g, 'x');
            if (/^\d+([-x]\d+)+$/.test(tok)) moves.push(tok);
        }
        if (moves.length) games.push({ tags, moves });
    }
    return games;
}
function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

async function importFile(file) {
    baseBusy = true; updateHistoryButtons();
    try {
        const text = await file.text();
        const existing = getGames();
        let added = 0, failed = 0;
        let incoming = [];
        const t = text.trim();
        if (t.startsWith('[') && /^\[\s*[{\]]/.test(t) || t.startsWith('{')) {
            let data = JSON.parse(t);
            if (!Array.isArray(data)) data = data.games || [];
            incoming = data.filter(g => g && (Array.isArray(g.moves) || typeof g.ms === 'string')).map(g => ({ ...g, json: true }));
        } else {
            for (const p of parsePDN(text)) {
                const res = p.tags.Result || '';
                incoming.push({
                    moves: p.moves, white: p.tags.White || '', black: p.tags.Black || '', event: p.tags.Event || '',
                    date: (p.tags.Date && /^\d{4}\.\d\d\.\d\d$/.test(p.tags.Date)) ? p.tags.Date.replace(/\./g, '-') : undefined,
                    result: res === '1-0' ? 'white' : res === '0-1' ? 'black' : /1\/2|½/.test(res) ? 'draw' : 'unfinished',
                    start: p.tags.FEN ? parseFen(p.tags.FEN) || undefined : undefined
                });
            }
        }
        let n = 0, buf = [];
        const t0 = Date.now(), baseId = Date.now() * 1000;
        const dedupe = new Set();
        for (const g of existing) if (gameBase(g) === currentBase && g.imported) dedupe.add(g.ms);
        let dup = 0;
        for (const g of incoming) {
            n++;
            if (n % 500 === 0) { setBaseStatus(`Import : partie ${n} / ${incoming.length}…`); await yieldUI(); }
            const mv = Array.isArray(g.moves) ? g.moves : (typeof g.ms === 'string' && g.ms ? g.ms.split(' ') : []);
            const startPos = g.start ? FG.startPosOf(g) : null;
            const r = mv.length ? FG.replayMoves(startPos, mv) : { ok: false };
            if (!r.ok) { failed++; continue; }
            const ms = mv.join(' ');
            if (dedupe.has(ms) && !g.start) { dup++; continue; }
            dedupe.add(ms);
            const rec = {
                id: baseId + added, date: g.date ? new Date(g.date).toISOString() : new Date().toISOString(),
                ms, result: g.result || 'unfinished', playerColor: 'white', free: true, imported: true,
                white: g.white, black: g.black, event: g.event, start: g.start, base: g.base && g.json ? g.base : currentBase
            };
            buf.push(rec); added++;
        }
        setBaseStatus('Enregistrement dans la base…');
        await pushGames(buf);
        refreshPlayerList();
        setBaseStatus(`${added} partie(s) importée(s) dans « ${currentBase} »${failed ? `, ${failed} ignorée(s) (coups illisibles)` : ''}${dup ? `, ${dup} doublon(s) écarté(s)` : ''}.`);
    } catch (err) {
        console.error(err);
        setBaseStatus("Impossible de lire ce fichier (" + (err && err.message || err) + "). Formats acceptés : PDN (.pdn, .txt) ou sauvegarde SAM_brk (.json).");
    } finally {
        baseBusy = false;
        renderBase();
    }
}

async function searchPosition() {
    if (baseBusy) return;
    baseBusy = true; updateHistoryButtons();
    try {
        const target = FG.hashPos(FG.posFromBoard(gameState.board));
        const inBase = getGames().filter(g => gameBase(g) === currentBase);
        baseFilter = new Map();
        let i = 0;
        for (const g of inBase) {
            i++;
            if (i % 1000 === 0) { setBaseStatus(`Recherche de la position : ${i} / ${inBase.length}…`); await yieldUI(); }
            let k = keyCache.get(g.id);
            if (!k) { k = FG.replayMoves(FG.startPosOf(g), g.ms ? g.ms.split(' ') : []).keys; keyCache.set(g.id, k); }
            const p = k.indexOf(target); if (p >= 0) baseFilter.set(g.id, p);
        }
        setBaseStatus(baseFilter.size
            ? `${baseFilter.size} partie(s) contiennent la position actuelle du damier. Cliquez sur une partie, puis « Analyser » pour l'ouvrir à cet endroit.`
            : 'Aucune partie de cette base ne contient la position actuelle du damier.');
    } catch (err) { console.error(err); setBaseStatus('Erreur pendant la recherche.'); }
    finally { baseBusy = false; renderBase(); }
}

function setupHistoryDialogHandlers() {
    const dialog = document.getElementById('history-dialog');
    if (!dialog) return;
    const listEl = document.getElementById('history-list');
    const paintSel = () => listEl.querySelectorAll('.history-item').forEach(el => el.classList.toggle('selected', selIds.has(parseInt(el.dataset.id))));
    listEl.addEventListener('click', (e) => {
        const item = e.target.closest('.history-item');
        if (!item) return;
        const id = parseInt(item.dataset.id);
        if (e.shiftKey && lastClickedId != null) {
            const ids = [...listEl.querySelectorAll('.history-item')].map(x => parseInt(x.dataset.id));
            const a = ids.indexOf(lastClickedId), b = ids.indexOf(id);
            if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selIds.add(ids[i]);
        } else if (e.ctrlKey || e.metaKey || multiMode) {
            if (selIds.has(id)) selIds.delete(id); else selIds.add(id);
        } else { selIds.clear(); selIds.add(id); }
        lastClickedId = id;
        selectedGameId = selIds.has(id) ? id : (selIds.size ? [...selIds][selIds.size - 1] : null);
        paintSel(); updateHistoryButtons();
        setBaseStatus(selIds.size > 1 ? `${selIds.size} parties sélectionnées.` : '');
    });
    const rerender = () => { shownCount = PAGE; renderBase(); };
    document.getElementById('flt-result').addEventListener('change', (e) => { fltResult = e.target.value; rerender(); });
    document.getElementById('flt-from').addEventListener('change', (e) => { fltFrom = e.target.value; rerender(); });
    document.getElementById('flt-to').addEventListener('change', (e) => { fltTo = e.target.value; rerender(); });
    document.getElementById('flt-sort').addEventListener('change', (e) => { fltSort = e.target.value; rerender(); });
    let _ft = null;
    document.getElementById('flt-open').addEventListener('input', (e) => { fltOpen = e.target.value; clearTimeout(_ft); _ft = setTimeout(rerender, 300); });
    document.getElementById('btn-multi').addEventListener('click', (e) => {
        multiMode = !multiMode; e.currentTarget.classList.toggle('on', multiMode);
        setBaseStatus(multiMode ? 'Sélection multiple : touchez les parties pour les cocher ou décocher.' : '');
    });
    document.getElementById('btn-selall').addEventListener('click', () => {
        const all = filteredGames(); selIds.clear(); for (const g of all) selIds.add(g.id);
        selectedGameId = all.length ? all[all.length - 1].id : null; renderBase();
        setBaseStatus(`${selIds.size} partie(s) sélectionnée(s) (toutes celles de la liste filtrée).`);
    });
    document.getElementById('btn-selnone').addEventListener('click', () => { selIds.clear(); selectedGameId = null; renderBase(); setBaseStatus(''); });
    document.getElementById('btn-history-close').addEventListener('click', hideHistoryDialog);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) hideHistoryDialog(); });

    document.getElementById('base-select').addEventListener('change', (e) => { currentBase = e.target.value; baseFilter = null; selectedGameId = null; selIds.clear(); refreshPlayerList(); setBaseStatus(''); renderBase(); });
    document.getElementById('base-new').addEventListener('click', () => {
        const n = (prompt('Nom de la nouvelle base :') || '').trim();
        if (!n) return;
        const b = getBases();
        if (!b.includes(n)) { b.push(n); saveBases(b); }
        currentBase = n; baseFilter = null; renderBase(); setBaseStatus(`Base « ${n} » créée. Importez ou déplacez-y des parties.`);
    });
    document.getElementById('base-rename').addEventListener('click', () => {
        if (currentBase === DEFAULT_BASE) { setBaseStatus('La base « Mes parties » ne peut pas être renommée.'); return; }
        const n = (prompt('Nouveau nom :', currentBase) || '').trim();
        if (!n || n === currentBase) return;
        const games = getGames(); games.forEach(g => { if (gameBase(g) === currentBase) g.base = n; });
        setGames(games);
        saveBases(getBases().map(b => b === currentBase ? n : b));
        currentBase = n; renderBase();
    });
    document.getElementById('base-del').addEventListener('click', () => {
        if (currentBase === DEFAULT_BASE) { setBaseStatus('La base « Mes parties » ne peut pas être supprimée.'); return; }
        const cnt = getGames().filter(g => gameBase(g) === currentBase).length;
        if (!confirm(`Supprimer la base « ${currentBase} » et ses ${cnt} partie(s) ?`)) return;
        setGames(getGames().filter(g => gameBase(g) !== currentBase));
        saveBases(getBases().filter(b => b !== currentBase));
        currentBase = DEFAULT_BASE; baseFilter = null; selectedGameId = null; selIds.clear(); renderBase();
    });
    let _dbt = null;
    document.getElementById('base-player').addEventListener('input', (e) => { basePlayer = e.target.value; shownCount = PAGE; clearTimeout(_dbt); _dbt = setTimeout(renderBase, 300); });
    document.getElementById('base-search').addEventListener('input', (e) => { baseQuery = e.target.value; shownCount = PAGE; clearTimeout(_dbt); _dbt = setTimeout(renderBase, 300); });
    document.getElementById('base-pos').addEventListener('click', searchPosition);
    document.getElementById('base-all').addEventListener('click', () => { baseFilter = null; baseQuery = ''; basePlayer = ''; resetFilterUI(); document.getElementById('base-player').value = ''; document.getElementById('base-search').value = ''; setBaseStatus(''); renderBase(); });
    document.getElementById('base-import').addEventListener('click', () => document.getElementById('base-file').click());
    document.getElementById('base-file').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await importFile(f); });
    document.getElementById('base-export-pdn').addEventListener('click', () => {
        const games = filteredGames().slice().reverse();
        if (!games.length) { setBaseStatus('Rien à exporter.'); return; }
        download(`${currentBase.replace(/[^\w-]+/g, '_')}.pdn`, games.map(toPDN).join('\n'), 'text/plain');
        setBaseStatus(`${games.length} partie(s) exportée(s) au format PDN.`);
    });
    document.getElementById('base-export-json').addEventListener('click', () => {
        const games = getGames().map(g => ({ ...g }));
        download('sambrk-sauvegarde.json', JSON.stringify({ bases: getBases(), games }, null, 1), 'application/json');
        setBaseStatus(`Sauvegarde complète : ${games.length} partie(s), toutes bases.`);
    });

    document.getElementById('btn-history-delete').addEventListener('click', () => {
        if (!selIds.size) return;
        const n = selIds.size;
        if (!confirm(n === 1 ? 'Supprimer cette partie ?' : `Supprimer ces ${n} parties ?`)) return;
        deleteGames([...selIds]);
        selectedGameId = null; selIds.clear();
        refreshPlayerList(); renderBase(); setBaseStatus(`${n} partie(s) supprimée(s).`);
    });

    // ---- Modifier une partie ----
    const $ = (id) => document.getElementById(id);
    const localDay = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const hideDlg = (id) => { $(id).style.display = 'none'; };
    for (const id of ['edit-dialog', 'move-dialog', 'stats-dialog']) $(id).addEventListener('click', (e) => { if (e.target === $(id)) hideDlg(id); });
    $('btn-history-info').addEventListener('click', () => {
        const g = selectedGame(); if (!g) return;
        $('ed-white').value = g.white || ''; $('ed-black').value = g.black || ''; $('ed-event').value = g.event || '';
        $('ed-result').value = ['white', 'black', 'draw'].includes(g.result) ? g.result : '';
        $('ed-date').value = localDay(g.date);
        $('edit-dialog').style.display = 'flex';
    });
    $('ed-cancel').addEventListener('click', () => hideDlg('edit-dialog'));
    $('ed-save').addEventListener('click', () => {
        const g = selectedGame(); if (!g) { hideDlg('edit-dialog'); return; }
        const ng = { ...g };
        ng.white = $('ed-white').value.trim(); ng.black = $('ed-black').value.trim(); ng.event = $('ed-event').value.trim();
        ng.result = $('ed-result').value || 'unfinished';
        const dv = $('ed-date').value;
        if (dv && dv !== localDay(g.date)) ng.date = new Date(dv + 'T12:00:00').toISOString();
        upsertGame(ng);
        hideDlg('edit-dialog'); refreshPlayerList(); renderBase(); setBaseStatus('Partie modifiée.');
    });

    // ---- Déplacer / copier (une ou plusieurs parties) ----
    const mvSel = $('mv-base'), mvNew = $('mv-new');
    $('btn-history-move').addEventListener('click', () => {
        if (!selIds.size) return;
        const bases = getBases();
        mvSel.innerHTML = '';
        for (const b of bases) { const o = document.createElement('option'); o.value = b; o.textContent = b; mvSel.appendChild(o); }
        const o = document.createElement('option'); o.value = '__new__'; o.textContent = '➕ Nouvelle base…'; mvSel.appendChild(o);
        const other = bases.find(b => b !== currentBase); mvSel.value = other || '__new__';
        mvNew.style.display = mvSel.value === '__new__' ? 'block' : 'none'; mvNew.value = '';
        $('mv-count').textContent = `${selIds.size} partie(s) sélectionnée(s), base actuelle : « ${currentBase} ».`;
        $('move-dialog').style.display = 'flex';
    });
    mvSel.addEventListener('change', () => { mvNew.style.display = mvSel.value === '__new__' ? 'block' : 'none'; });
    $('mv-cancel').addEventListener('click', () => hideDlg('move-dialog'));
    const targetBase = () => {
        let t = mvSel.value === '__new__' ? mvNew.value.trim() : mvSel.value;
        if (!t) { alert('Donnez un nom à la nouvelle base.'); return null; }
        const bs = getBases(); if (!bs.includes(t)) saveBases([...bs, t]);
        return t;
    };
    $('mv-move').addEventListener('click', () => {
        const t = targetBase(); if (!t) return;
        const list = getGames().filter(g => selIds.has(g.id));
        for (const g of list) upsertGame({ ...g, base: t });
        const n = list.length;
        selIds.clear(); selectedGameId = null; hideDlg('move-dialog'); refreshPlayerList(); renderBase();
        setBaseStatus(`${n} partie(s) déplacée(s) vers « ${t} ».`);
    });
    $('mv-copy').addEventListener('click', async () => {
        const t = targetBase(); if (!t) return;
        if (t === currentBase) { alert('Choisissez une autre base pour copier.'); return; }
        const list = getGames().filter(g => selIds.has(g.id));
        const b0 = Date.now() * 1000;
        const copies = list.map((g, i) => ({ ...g, id: b0 + i, base: t }));
        await pushGames(copies);
        hideDlg('move-dialog'); renderBase();
        setBaseStatus(`${copies.length} partie(s) copiée(s) vers « ${t} ». Les originales restent ici.`);
    });

    // ---- Statistiques ----
    const body = $('stats-body');
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const pc = (a, n) => (n ? Math.round(a * 100 / n) : 0);
    const bar = (w, d, l) => {
        const n = w + d + l, b = el('div', 'stats-bar');
        for (const [c, v, t] of [['sw', w, 'Blancs gagnent'], ['sd', d, 'Nulles'], ['sl', l, 'Noirs gagnent']]) { const s = el('span', c); s.style.width = (n ? v * 100 / n : 0) + '%'; s.title = `${t} : ${v}`; b.appendChild(s); }
        return b;
    };
    const table = (head, rows) => {
        const t = el('table', 'stats-table'), tr = el('tr');
        head.forEach((h, i) => tr.appendChild(el('th', i ? 'n' : '', h))); t.appendChild(tr);
        for (const r of rows) { const x = el('tr'); r.forEach((c, i) => x.appendChild(el('td', i ? 'n' : '', c))); t.appendChild(x); }
        return t;
    };
    const tally = () => ({ n: 0, w: 0, d: 0, l: 0 });
    const addRes = (o, r) => { o.n++; if (r === 'white') o.w++; else if (r === 'draw') o.d++; else if (r === 'black') o.l++; };
    const resCells = (o) => { const f = o.w + o.d + o.l; return [String(o.n), pc(o.w, f) + ' %', pc(o.d, f) + ' %', pc(o.l, f) + ' %']; };
    let posSection = null;
    function buildStats() {
        const games = filteredGames(); body.innerHTML = '';
        body.appendChild(el('div', 'stats-line', `${games.length} partie(s) dans la liste actuelle (base « ${currentBase} »). Les filtres et la recherche en cours s'appliquent.`));
        if (!games.length) return;
        const all = tally(); for (const g of games) addRes(all, g.result);
        body.appendChild(el('h3', '', 'Résultats'));
        body.appendChild(bar(all.w, all.d, all.l));
        const f = all.w + all.d + all.l;
        body.appendChild(el('div', 'stats-line', `Blancs gagnent : ${all.w} (${pc(all.w, f)} %) · Nulles : ${all.d} (${pc(all.d, f)} %) · Noirs gagnent : ${all.l} (${pc(all.l, f)} %)` + (all.n > f ? ` · non terminées : ${all.n - f}` : '')));
        const pq = normTxt(basePlayer).trim().split(/\s+/).filter(Boolean);
        if (pq.length) {
            const has = (name) => { const t = normTxt(name); return pq.every(x => t.includes(x)); };
            let pw = 0, pd = 0, pl = 0, n = 0;
            for (const g of games) {
                const side = has(g.white) ? 'white' : has(g.black) ? 'black' : null;
                if (!side) continue; n++;
                if (g.result === 'draw') pd++; else if (g.result === side) pw++; else if (g.result === 'white' || g.result === 'black') pl++;
            }
            body.appendChild(el('h3', '', `Joueur « ${basePlayer.trim()} »`));
            const dec = pw + pd + pl;
            body.appendChild(bar(pw, pd, pl));
            body.appendChild(el('div', 'stats-line', `${n} partie(s) : victoires ${pw}, nulles ${pd}, défaites ${pl}` + (dec ? ` · score ${Math.round((pw + pd / 2) * 100 / dec)} %` : '')));
        }
        const op = new Map();
        for (const g of games) {
            if (g.start) continue; const t = (g.ms || '').split(' '); if (t.length < 2) continue;
            const k = t[0] + ' ' + t[1]; let o = op.get(k); if (!o) { o = tally(); op.set(k, o); } addRes(o, g.result);
        }
        if (op.size) {
            body.appendChild(el('h3', '', 'Ouvertures les plus jouées (2 premiers coups)'));
            body.appendChild(table(['Coups', 'Parties', '1-0', '½', '0-1'], [...op.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([k, o]) => [k, ...resCells(o)])));
        }
        if (posSection) {
            body.appendChild(el('h3', '', posSection.title));
            if (posSection.rows.length) body.appendChild(table(['Coup suivant', 'Parties', '1-0', '½', '0-1'], posSection.rows)); else body.appendChild(el('div', 'stats-line', 'Aucune partie de la liste ne passe par cette position.'));
        }
    }
    $('btn-dbstats').addEventListener('click', () => { posSection = null; buildStats(); $('stats-dialog').style.display = 'flex'; });
    $('stats-close').addEventListener('click', () => hideDlg('stats-dialog'));
    $('stats-pos').addEventListener('click', async () => {
        if (baseBusy) return;
        baseBusy = true;
        try {
            const target = FG.hashPos(FG.posFromBoard(gameState.board));
            const games = filteredGames(), next = new Map(); let found = 0, i = 0;
            for (const g of games) {
                i++;
                if (i % 1000 === 0) { body.insertBefore(el('div', 'stats-line', `Calcul : ${i} / ${games.length}…`), body.firstChild); await yieldUI(); body.removeChild(body.firstChild); }
                let k = keyCache.get(g.id);
                if (!k) { k = FG.replayMoves(FG.startPosOf(g), g.ms ? g.ms.split(' ') : []).keys; keyCache.set(g.id, k); }
                const p = k.indexOf(target); if (p < 0) continue;
                found++;
                const mv = (g.ms || '').split(' ')[p]; if (!mv) continue;
                let o = next.get(mv); if (!o) { o = tally(); next.set(mv, o); } addRes(o, g.result);
            }
            posSection = { title: `Position du damier : ${found} partie(s)`, rows: [...next.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([k, o]) => [k, ...resCells(o)]) };
        } catch (err) { console.error(err); }
        finally { baseBusy = false; buildStats(); updateHistoryButtons(); }
    });

    document.getElementById('btn-history-watch').addEventListener('click', () => {
        const game = selectedGame();
        if (game) { hideHistoryDialog(); watchGame(game); }
    });
    document.getElementById('btn-history-analyze').addEventListener('click', async () => {
        const game = selectedGame();
        if (!game) return;
        const ply = baseFilter ? baseFilter.get(game.id) : 0;
        hideHistoryDialog();
        await loadGameForAnalysis(game);
        for (let i = 0; i < (ply || 0); i++) await gameState.redo();
        updateMoveHistory(); updateUndoRedoButtons(); updateNavButtons();
    });
}

async function loadGameForAnalysis(game) {
    await togglePondering(false);
    clearSearchInfo();

    const savedAutoPlay = turnController.autoPlay;
    turnController.autoPlay = false;
    await searchManager.abort();
    await gameState.loadGame(game.moves, game.start || null);
    turnController.autoPlay = savedAutoPlay;

    boardUI.setFlipped(game.playerColor === 'black');
    turnController.setHumanColor('both');
    toggleShowAnalysis(true);
    await togglePondering(true);

    updateMoveHistory();
    updateUndoRedoButtons();
    updateModeButtons();
}

async function watchGame(game) {
    stopExtAnalysis();
    stopLearn();
    stopAutoReplay();
    await togglePondering(false);
    clearSearchInfo();
    const savedAutoPlay = turnController.autoPlay;
    turnController.autoPlay = false;
    await searchManager.abort();
    await gameState.loadGame(game.moves, game.start || null);
    turnController.autoPlay = savedAutoPlay;
    boardUI.setFlipped(game.playerColor === 'black');
    turnController.setHumanColor('both');
    toggleShowAnalysis(false);
    updateMoveHistory();
    updateUndoRedoButtons();
    updateModeButtons();
    updateNavButtons();
    await new Promise(r => setTimeout(r, 400));
    toggleAutoReplay();
}

async function exitMatchPlay() {
    matchPlayActive = false;
    document.body.classList.remove('match-play');
    document.getElementById('match-toolbar').style.display = 'none';
    document.getElementById('game-controls').style.display = 'flex';
    document.getElementById('match-result-dialog').style.display = 'none';

    await togglePondering(savedPonder);
    toggleShowAnalysis(savedShowAnalysis);
    useBook = savedUseBook;
    engine.setUseBook(useBook);
    updateOptionsButtons();

    updateModeButtons();
    updateUndoRedoButtons();
    updateMoveHistory();
}

// --- Tablebase download ---

async function showDownloadDialog(type = 'dtm') {
    const dialog = document.getElementById('download-dialog');
    if (!dialog) {
        alert('Téléchargement des finales indisponible');
        return;
    }

    if (!tablebaseLoader || !tablebaseLoader.isAvailable()) {
        alert('Le stockage des finales demande OPFS, qui nécessite HTTPS ou localhost.');
        return;
    }

    dialog.style.display = 'flex';

    const progressEl = dialog.querySelector('.progress');
    const statusEl = dialog.querySelector('.status');
    const titleEl = dialog.querySelector('h2');
    const cancelBtn = dialog.querySelector('.cancel-btn');

    if (titleEl) {
        titleEl.textContent = type === 'cwdl'
            ? 'Téléchargement des finales WDL 6-8 pièces'
            : 'Téléchargement des finales DTM 5-7 pièces';
    }

    let cancelled = false;
    cancelBtn.onclick = () => {
        cancelled = true;
        dialog.style.display = 'none';
    };

    try {
        const downloadFn = type === 'cwdl'
            ? tablebaseLoader.downloadCWDLTablebases.bind(tablebaseLoader)
            : tablebaseLoader.downloadTablebases.bind(tablebaseLoader);

        await downloadFn((loaded, total, file) => {
            if (cancelled) return;
            const pct = Math.round((loaded / total) * 100);
            if (progressEl) progressEl.style.width = `${pct}%`;
            if (statusEl) statusEl.textContent = `Téléchargement : ${file} (${loaded}/${total})`;
        });

        if (!cancelled) {
            statusEl.textContent = 'Terminé ! Elles seront utilisées automatiquement.';
            setTimeout(() => {
                dialog.style.display = 'none';
                window.location.reload();
            }, 1500);
        }
    } catch (err) {
        if (statusEl) statusEl.textContent = `Erreur : ${err.message}`;
    }
}

// --- Event handlers setup ---

function setupEventHandlers() {
    // New game
    const newGameBtn = document.getElementById('btn-new-game');
    if (newGameBtn) newGameBtn.addEventListener('click', showNewGameDialog);

    const playWhiteBtn = document.getElementById('btn-play-white');
    const playBlackBtn = document.getElementById('btn-play-black');
    const playBothBtn = document.getElementById('btn-play-both');
    if (playWhiteBtn) playWhiteBtn.addEventListener('click', () => startNewGame('white'));
    if (playBlackBtn) playBlackBtn.addEventListener('click', () => startNewGame('black'));
    if (playBothBtn) playBothBtn.addEventListener('click', () => startNewGame('both'));

    const newGameDialog = document.getElementById('new-game-dialog');
    if (newGameDialog) {
        newGameDialog.addEventListener('click', (e) => {
            if (e.target === newGameDialog) hideNewGameDialog();
        });
    }

    // Undo/Redo
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) {
        undoBtn.addEventListener('click', async () => {
            await searchManager.abort();
            await gameState.undo();
        });
    }

    const redoBtn = document.getElementById('btn-redo');
    if (redoBtn) {
        redoBtn.addEventListener('click', async () => {
            if (searchManager.state === 'thinking') return;
            if (searchManager.state === 'pondering') await searchManager.abort();
            await gameState.redo();
        });
    }

    // Flip board
    const flipBtn = document.getElementById('btn-flip');
    if (flipBtn) {
        flipBtn.addEventListener('click', () => {
            boardUI.setFlipped(!boardUI.flipped);
            if (lastEvalScore !== null) updateEvalBar(lastEvalScore);
        });
    }

    // Mode toggle buttons
    const btnEngineWhite = document.getElementById('btn-engine-white');
    const btnEngineBlack = document.getElementById('btn-engine-black');
    const btnTwoPlayer = document.getElementById('btn-two-player');

    if (btnEngineWhite) {
        btnEngineWhite.addEventListener('click', async () => {
            if (searchManager.state === 'pondering') await searchManager.abort();
            turnController.setHumanColor('black');
        });
    }
    if (btnEngineBlack) {
        btnEngineBlack.addEventListener('click', async () => {
            if (searchManager.state === 'pondering') await searchManager.abort();
            turnController.setHumanColor('white');
        });
    }
    if (btnTwoPlayer) {
        btnTwoPlayer.addEventListener('click', async () => {
            if (searchManager.state === 'pondering') await searchManager.abort();
            turnController.setHumanColor('both');
        });
    }

    // Pondering checkbox
    const chkPonder = document.getElementById('chk-ponder');
    if (chkPonder) {
        chkPonder.addEventListener('change', () => togglePondering(chkPonder.checked));
    }

    // Time per move
    const timePerMoveBtn = document.getElementById('btn-time-per-move');
    if (timePerMoveBtn) timePerMoveBtn.addEventListener('click', showTimeDialog);

    // Book checkbox
    const chkUseBook = document.getElementById('chk-use-book');
    if (chkUseBook) {
        chkUseBook.addEventListener('change', () => {
            useBook = chkUseBook.checked;
            engine.setUseBook(useBook);
            savePreferences();
        });
    }

    // Analysis display checkbox
    const chkShowAnalysis = document.getElementById('chk-show-analysis');
    if (chkShowAnalysis) {
        chkShowAnalysis.addEventListener('change', () => toggleShowAnalysis(chkShowAnalysis.checked));
    }

    // Sound checkbox
    const chkSound = document.getElementById('chk-sound');
    if (chkSound) {
        chkSound.addEventListener('change', () => {
            setSoundEnabled(chkSound.checked);
            savePreferences();
        });
    }

    // Time dialog
    const timeDialog = document.getElementById('time-dialog');
    const timeInput = document.getElementById('time-input');
    const timeOkBtn = document.getElementById('btn-time-ok');
    const timeCancelBtn = document.getElementById('btn-time-cancel');

    if (timeDialog) {
        timeDialog.addEventListener('click', (e) => {
            if (e.target === timeDialog) hideTimeDialog();
        });
    }
    if (timeOkBtn) timeOkBtn.addEventListener('click', applyTimePerMove);
    if (timeCancelBtn) timeCancelBtn.addEventListener('click', hideTimeDialog);
    if (timeInput) {
        timeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyTimePerMove();
            if (e.key === 'Escape') hideTimeDialog();
        });
    }

    // Play button
    const playBtn = document.getElementById('btn-play');
    if (playBtn) {
        playBtn.addEventListener('click', async () => {
            if (searchManager.state === 'pondering') {
                await turnController.playPonderMove();
            } else if (searchManager.state === 'thinking') {
                searchManager.stop();
            } else {
                await turnController.engineMoveNow();
            }
        });
    }

    // Download tablebases
    const downloadBtn = document.getElementById('btn-download-tb');
    if (downloadBtn) downloadBtn.addEventListener('click', () => showDownloadDialog('dtm'));

    const downloadCwdlBtn = document.getElementById('btn-download-cwdl');
    if (downloadCwdlBtn) downloadCwdlBtn.addEventListener('click', () => showDownloadDialog('cwdl'));

    const clearTbBtn = document.getElementById('btn-clear-tb');
    if (clearTbBtn) clearTbBtn.addEventListener('click', async () => {
        if (!tablebaseLoader || !tablebaseLoader.isAvailable()) {
            alert('Aucune finale enregistrée.');
            return;
        }
        if (!confirm('Supprimer toutes les finales téléchargées ?')) return;
        await tablebaseLoader.clearTablebases();
        // Also remove legacy "tablebases" directory if it exists
        try {
            const opfsRoot = await navigator.storage.getDirectory();
            await opfsRoot.removeEntry('tablebases', { recursive: true });
        } catch (e) {
            // Ignore if it doesn't exist
        }
        alert('Finales supprimées.');
        window.location.reload();
    });

    // Volume
    const vol = document.getElementById('rng-volume');
    if (vol) {
        vol.value = Math.round(getVolume() * 100);
        vol.addEventListener('input', () => setVolume(parseInt(vol.value, 10) / 100));
        vol.addEventListener('change', () => { playCaptureSound(); });
    }
    // Aide
    { const hb = document.getElementById('btn-help'), hd = document.getElementById('help-dialog');
      if (hb && hd) {
          hb.addEventListener('click', () => { hd.style.display = 'flex'; });
          document.getElementById('btn-help-close').addEventListener('click', () => { hd.style.display = 'none'; });
          hd.addEventListener('click', (e) => { if (e.target === hd) hd.style.display = 'none'; });
      } }

    // Edit mode
    const editBtn = document.getElementById('btn-edit');
    if (editBtn) editBtn.addEventListener('click', enterEditMode);

    // Piece selector
    document.querySelectorAll('.piece-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.piece-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            editPieceType = btn.dataset.piece;
        });
    });

    // Clear board
    const clearBtn = document.getElementById('btn-clear-board');
    if (clearBtn) clearBtn.addEventListener('click', clearEditBoard);

    const fillBtn = document.getElementById('btn-fill-board');
    if (fillBtn) fillBtn.addEventListener('click', () => {
        editBoard = { white: 0x00000FFF, black: 0xFFF00000, kings: 0 };
        editWhiteToMove = true; updateSideToMoveButtons();
        boardUI.setPosition(editBoard.white, editBoard.black, editBoard.kings, editWhiteToMove);
    });
    const orientBtn = document.getElementById('btn-prob-orient');
    if (orientBtn) orientBtn.addEventListener('click', () => { boardUI.setFlipped(!boardUI.flipped); updateProbButtons(); });
    const compBtn = document.getElementById('btn-prob-comp');
    if (compBtn) compBtn.addEventListener('click', () => { probComputer = probComputer === 'black' ? 'white' : probComputer === 'white' ? 'none' : 'black'; updateProbButtons(); });

    // Side to move
    const whiteToMoveBtn = document.getElementById('btn-white-to-move');
    const blackToMoveBtn = document.getElementById('btn-black-to-move');
    if (whiteToMoveBtn) {
        whiteToMoveBtn.addEventListener('click', () => {
            editWhiteToMove = true;
            updateSideToMoveButtons();
        });
    }
    if (blackToMoveBtn) {
        blackToMoveBtn.addEventListener('click', () => {
            editWhiteToMove = false;
            updateSideToMoveButtons();
        });
    }

    // Done button
    const doneBtn = document.getElementById('btn-edit-done');
    if (doneBtn) doneBtn.addEventListener('click', exitEditMode);

    // Draw offer dialog
    const acceptDrawBtn = document.getElementById('btn-accept-draw');
    const declineDrawBtn = document.getElementById('btn-decline-draw');
    if (acceptDrawBtn) {
        acceptDrawBtn.addEventListener('click', () => {
            document.getElementById('draw-offer-dialog').style.display = 'none';
            if (drawOfferResolve) { drawOfferResolve(true); drawOfferResolve = null; }
        });
    }
    if (declineDrawBtn) {
        declineDrawBtn.addEventListener('click', () => {
            document.getElementById('draw-offer-dialog').style.display = 'none';
            if (drawOfferResolve) { drawOfferResolve(false); drawOfferResolve = null; }
        });
    }

    // Match play
    const matchPlayBtn = document.getElementById('btn-match-play');
    if (matchPlayBtn) matchPlayBtn.addEventListener('click', startMatchPlay);

    setupExtAnalysis();
    setupAutoSave();
    setupSaveAndNames();
    setupRec();
    setupNavButtons();
    setupLearning(); setupSelfLearning(); setupBook();
    setupAutoCapture();
    setupShortcuts();
    setupClockAndLang();
    { const lg = document.getElementById('app-logo'), ab = document.getElementById('about-dialog'); if (lg && ab) { lg.addEventListener('click', () => { ab.style.display = 'flex'; }); document.getElementById('btn-about-close').addEventListener('click', () => { ab.style.display = 'none'; }); ab.addEventListener('click', (e) => { if (e.target === ab) ab.style.display = 'none'; }); } }

    const statsBtn = document.getElementById('btn-stats');
    if (statsBtn) statsBtn.addEventListener('click', showHistoryDialog);

    const matchResignBtn = document.getElementById('btn-match-resign');
    if (matchResignBtn) matchResignBtn.addEventListener('click', matchResign);

    // Resign confirm dialog
    const resignYesBtn = document.getElementById('btn-resign-yes');
    const resignNoBtn = document.getElementById('btn-resign-no');
    const resignDialog = document.getElementById('resign-confirm-dialog');
    if (resignYesBtn) {
        resignYesBtn.addEventListener('click', () => {
            resignDialog.style.display = 'none';
            if (resignResolve) { resignResolve(true); resignResolve = null; }
        });
    }
    if (resignNoBtn) {
        resignNoBtn.addEventListener('click', () => {
            resignDialog.style.display = 'none';
            if (resignResolve) { resignResolve(false); resignResolve = null; }
        });
    }
    if (resignDialog) {
        resignDialog.addEventListener('click', (e) => {
            if (e.target === resignDialog) {
                resignDialog.style.display = 'none';
                if (resignResolve) { resignResolve(false); resignResolve = null; }
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && resignDialog.style.display !== 'none') {
                resignDialog.style.display = 'none';
                if (resignResolve) { resignResolve(false); resignResolve = null; }
            }
        });
    }

    // Match result dialog
    const matchResultOkBtn = document.getElementById('btn-match-result-ok');
    if (matchResultOkBtn) matchResultOkBtn.addEventListener('click', exitMatchPlay);

    // History dialog
    setupHistoryDialogHandlers();
}

// --- Board resize ---

function resizeBoard() {
    if (boardUI && boardUI.applySize) boardUI.applySize();
}

// Start application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for debugging
window.gameState = () => gameState;
window.searchManager = () => searchManager;
window.turnController = () => turnController;
window.engine = getEngine;
