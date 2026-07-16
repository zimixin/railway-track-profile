// ============================================================
// DATA MODEL — positions in km (float, precision 0.001 = 1m)
// ============================================================
const state = {
    direction: 'odd', // odd: km decreasing L→R; even: km increasing L→R
    editMode: false,
    startKm: 127,
    endKm: 154,
    pxPerPK: 12, // 1 ПК = 100м
    selectedId: null,
    selectedType: null,
    dragging: null,
    idCounter: 1,
    importedFromFile: false, // true when data loaded from import
    data: {
        stations: [],
        signals: [],
        elevations: [],
        slopes: [],
        curves: [],
        recommendations: [],
        speedLimits: [],
        crossings: []
    }
};

function newId() { return 'id_' + (state.idCounter++); }

// Convert km+meters to position (float km)
function toPos(km, m) { return km + (m || 0) / 1000; }
// Convert position to {km, m}
function fromPos(pos) {
    const km = Math.floor(pos);
    const m = Math.round((pos - km) * 1000);
    return { km, m };
}
// Format position as "X км Y м"
function formatPos(pos) {
    const { km, m } = fromPos(pos);
    return `${km} км ${m} м`;
}

// ============================================================
// AUTO RANGE — вычисляет startKm/endKm из данных
// ============================================================
const RANGE_PAD = 2; // запас км по краям
const DEFAULT_RANGE = 10; // если данных нет

function calcRange() {
    let minKm = Infinity, maxKm = -Infinity;
    const d = state.data;

    d.elevations.forEach(pt => { if (pt.position < minKm) minKm = pt.position; if (pt.position > maxKm) maxKm = pt.position; });
    d.stations.forEach(st => {
        if (st.start !== undefined && st.start < minKm) minKm = st.start;
        if (st.end !== undefined && st.end > maxKm) maxKm = st.end;
        if (st.position < minKm) minKm = st.position;
        if (st.position > maxKm) maxKm = st.position;
    });
    d.signals.forEach(sig => { if (sig.position < minKm) minKm = sig.position; if (sig.position > maxKm) maxKm = sig.position; });
    d.slopes.forEach(sl => { if (sl.startPos < minKm) minKm = sl.startPos; if (sl.endPos > maxKm) maxKm = sl.endPos; });
    d.curves.forEach(cv => { if (cv.startPos < minKm) minKm = cv.startPos; if (cv.endPos > maxKm) maxKm = cv.endPos; });
    d.recommendations.forEach(rec => { if (rec.startPos < minKm) minKm = rec.startPos; if (rec.endPos > maxKm) maxKm = rec.endPos; });
    d.speedLimits.forEach(sl => { if (sl.startPos < minKm) minKm = sl.startPos; if (sl.endPos > maxKm) maxKm = sl.endPos; });
    d.crossings.forEach(cr => { if (cr.position < minKm) minKm = cr.position; if (cr.position > maxKm) maxKm = cr.position; });

    if (!isFinite(minKm)) {
        // Нет данных — показать заглушку
        state.startKm = 0;
        state.endKm = DEFAULT_RANGE;
        return;
    }

    state.startKm = Math.floor(minKm) - RANGE_PAD;
    state.endKm = Math.ceil(maxKm) + RANGE_PAD;
    if (state.startKm < 0) state.startKm = 0;
    if (state.endKm - state.startKm < DEFAULT_RANGE) state.endKm = state.startKm + DEFAULT_RANGE;
}

function updateRouteLabel() {
    const st = state.data.stations;
    const el = document.getElementById('routeName');
    if (st.length === 0) {
        el.textContent = `${state.startKm} — ${state.endKm} км`;
        return;
    }
    const sorted = [...st].sort((a, b) => a.position - b.position);
    const first = sorted[0], last = sorted[sorted.length - 1];
    el.textContent = `${first.name} (${Math.floor(first.position)} км) → ${last.name} (${Math.floor(last.position)} км)`;
}

function updateRangeLabel() {
    const el = document.getElementById('rangeLabel');
    if (el) el.textContent = `${Math.floor(state.startKm)} — ${Math.ceil(state.endKm)} км`;
}

// ============================================================
// DATA — чистый старт, без демо-данных
// ============================================================
function loadDemo() {
    state.data.elevations = [];
    state.data.stations = [];
    state.data.signals = [];
    state.data.slopes = [];
    state.data.curves = [];
    state.data.recommendations = [];
    state.data.speedLimits = [];
    state.data.crossings = [];
}

// ============================================================
// UNDO / REDO
// ============================================================
const undoHistory = { stack: [], index: -1, maxSize: 50 };

function saveSnapshot() {
    if (undoHistory.index < undoHistory.stack.length - 1) {
        undoHistory.stack = undoHistory.stack.slice(0, undoHistory.index + 1);
    }
    undoHistory.stack.push(JSON.parse(JSON.stringify(state.data)));
    if (undoHistory.stack.length > undoHistory.maxSize) undoHistory.stack.shift();
    undoHistory.index = undoHistory.stack.length - 1;
    saveToLocalStorage();
}

function undo() {
    if (undoHistory.index <= 0) return;
    undoHistory.index--;
    state.data = JSON.parse(JSON.stringify(undoHistory.stack[undoHistory.index]));
    state.selectedId = null; state.selectedType = null;
    closeSelectedEditor();
    ['stations', 'signals', 'elevations', 'slopes', 'curves', 'crossings', 'recommendations', 'speedLimits'].forEach(refreshEditorList);
    draw();
}

function redo() {
    if (undoHistory.index >= undoHistory.stack.length - 1) return;
    undoHistory.index++;
    state.data = JSON.parse(JSON.stringify(undoHistory.stack[undoHistory.index]));
    state.selectedId = null; state.selectedType = null;
    closeSelectedEditor();
    ['stations', 'signals', 'elevations', 'slopes', 'curves', 'crossings', 'recommendations', 'speedLimits'].forEach(refreshEditorList);
    draw();
}

// ============================================================
// THEME (AMOLED / dark)
// ============================================================
let isAmoled = false;
const theme = {
    get bg() { return isAmoled ? '#000000' : '#0d1117'; },
    get gridMajor() { return isAmoled ? '#111111' : '#21262d'; },
    get gridMinor() { return isAmoled ? '#0a0a0a' : '#161b22'; },
    get border() { return isAmoled ? '#141414' : '#30363d'; },
    get axisLabel() { return isAmoled ? '#555555' : '#8b949e'; },
    get axisValue() { return isAmoled ? '#b0b0b0' : '#c9d1d9'; },
    get profileFill() { return isAmoled ? 'rgba(239,83,80,0.12)' : 'rgba(239,83,80,0.25)'; },
    get profileFillEnd() { return isAmoled ? 'rgba(239,83,80,0.01)' : 'rgba(239,83,80,0.02)'; },
    get sectionLabel() { return isAmoled ? '#555555' : '#8b949e'; },
    get recBg() { return isAmoled ? 'rgba(5,5,5,0.95)' : 'rgba(22,27,34,0.95)'; },
};

// ============================================================
// VALIDATION
// ============================================================
function validateKm(val, fieldName) {
    const n = parseInt(val);
    if (isNaN(n) || n < 0) {
        throw new Error(`${fieldName}: целое число >= 0`);
    }
    return n;
}
function validateM(val) {
    const n = parseInt(val);
    if (isNaN(n) || n < 0 || n > 999) throw new Error('Метры: 0-999');
    return n;
}
function validateRequired(val, name) {
    if (!val || !val.trim()) throw new Error(`${name}: обязательно`);
    return val.trim();
}
function validatePosRange(start, end, name) {
    if (start >= end) throw new Error(`${name}: начало должно быть до конца`);
}
function showValidationError(msg) {
    const statusText = document.getElementById('statusText');
    const old = statusText.innerHTML;
    statusText.innerHTML = '⚠ ' + msg;
    statusText.style.color = '#f85149';
    setTimeout(() => { statusText.innerHTML = old; statusText.style.color = ''; }, 3000);
}
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const canvasWrap = document.getElementById('canvasWrap');

const MARGIN = { top: 80, right: 60, bottom: 60, left: 70 };
const MIN_SECTION_HEIGHT = 30; // minimum usable height for any section

// Dynamic section heights — fit to viewport
function getSectionHeights(h) {
    const avail = h - MARGIN.top - MARGIN.bottom - 4 - 2 * 20; // 4=gap speed→profile, 2*20=SECTION_GAPs
    // distribute: speed 20%, profile 40%, axis 12%, plan 10%, slope 18%
    const speed = Math.max(60, Math.round(avail * 0.2));
    const profile = Math.max(100, Math.round(avail * 0.40));
    const axis = Math.max(40, Math.round(avail * 0.12));
    const plan = Math.max(30, Math.round(avail * 0.10));
    const slope = Math.max(60, avail - speed - profile - axis - plan);
    return { speed, profile, axis, plan, slope };
}

// Y positions of each section
function sectionY() {
    const sh = getSectionHeights(canvasWrap.clientHeight || 700);
    const speedTop = MARGIN.top;
    const speedBottom = speedTop + sh.speed;
    const profileTop = speedBottom + 4;
    const profileBottom = profileTop + sh.profile;
    const axisTop = profileBottom;
    const axisBottom = axisTop + sh.axis;
    const planTop = axisBottom + 20;
    const planBottom = planTop + sh.plan;
    const slopeTop = planBottom + 20;
    const slopeBottom = slopeTop + sh.slope;
    return { profileTop, profileBottom, axisTop, axisBottom, planTop, planBottom, slopeTop, slopeBottom, speedTop, speedBottom, sectionHeights: sh };
}

// ResizeObserver — перерисовка при изменении размера контейнера
const resizeObserver = new ResizeObserver(() => { draw(); });
resizeObserver.observe(canvasWrap);

// ============================================================
// COORDINATE TRANSFORMS
// ============================================================
// ODD direction: km DECREASING left→right (startKm on right, endKm on left)
// EVEN direction: km INCREASING left→right (startKm on left, endKm on right)
function positionToX(pos) {
    const range = state.endKm - state.startKm;
    let normalized;
    if (state.direction === 'odd') {
        // decreasing: endKm on left, startKm on right
        normalized = (state.endKm - pos) / range;
    } else {
        // increasing: startKm on left, endKm on right
        normalized = (pos - state.startKm) / range;
    }
    return MARGIN.left + normalized * range * 10 * state.pxPerPK;
}

function xToPosition(x) {
    const range = state.endKm - state.startKm;
    const normalized = (x - MARGIN.left) / (range * 10 * state.pxPerPK);
    if (state.direction === 'odd') {
        return state.endKm - normalized * range;
    } else {
        return state.startKm + normalized * range;
    }
}

// ============================================================
// SCROLL TO ELEMENT
// ============================================================
function scrollToX(x) {
    const visibleWidth = canvasWrap.clientWidth;
    const targetScroll = x - visibleWidth / 2;
    canvasWrap.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: 'smooth'
    });
}

// ============================================================
// DRAWING
// ============================================================
function draw() {
    calcRange();
    const range = state.endKm - state.startKm;
    const sy = sectionY();
    const totalWidth = MARGIN.left + range * 10 * state.pxPerPK + MARGIN.right;
    const totalHeight = sy.slopeBottom + MARGIN.bottom;

    canvas.width = totalWidth;
    canvas.height = totalHeight;

    ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, totalWidth, totalHeight);

    drawGrid(totalWidth, totalHeight, sy);
    drawStations(sy);
    drawProfile(sy);
    drawKmAxis(sy);      // axis with km/pk BELOW profile
    drawPlanPath(sy);
    drawSlopes(sy);
    drawSignals(sy);
    drawCrossings(sy);
    drawSpeedGraph(sy);
    drawDirectionArrow(sy);
    drawRecommendations(sy);

    updateStats();
}

function drawGrid(totalWidth, totalHeight, sy) {
    // Vertical lines per PK (100m)
    for (let km = state.startKm; km <= state.endKm; km++) {
        for (let pk = 0; pk < 10; pk++) {
            const pos = toPos(km, pk * 100);
            const x = positionToX(pos);
            ctx.strokeStyle = pk === 0 ? theme.gridMajor : theme.gridMinor;
            ctx.lineWidth = pk === 0 ? 1 : 0.5;
            ctx.beginPath();
            ctx.moveTo(x, sy.profileTop);
            ctx.lineTo(x, sy.slopeBottom);
            ctx.stroke();
        }
    }

    // Horizontal section separators
    ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        [sy.speedBottom, sy.profileBottom, sy.axisBottom, sy.planBottom, sy.slopeBottom].forEach(y => {
            ctx.beginPath();
            ctx.moveTo(MARGIN.left, y);
            ctx.lineTo(MARGIN.left + (state.endKm - state.startKm) * 10 * state.pxPerPK, y);
            ctx.stroke();
        });

        // Section labels
        ctx.fillStyle = theme.sectionLabel;
        ctx.font = '10px Segoe UI';
        ctx.textAlign = 'left';
        ctx.fillText('ПРОФИЛЬ ПУТИ', 10, sy.profileTop + 16);
        ctx.fillText('ПЛАН ПУТИ (КРИВЫЕ)', 10, sy.planTop + 16);
        ctx.fillText('УКЛОНЫ (вычислено из профиля)', 10, sy.slopeTop + 16);
}

function drawProfile(sy) {
    const elevations = state.data.elevations;
    if (elevations.length < 2) return;

    const ys = elevations.map(e => e.y);
    const minY = Math.min(...ys) - 1;
    const maxY = Math.max(...ys) + 1;
    const rangeY = maxY - minY || 1;
    const padding = 20;

    // Fill
    ctx.beginPath();
    elevations.forEach((pt, i) => {
        const x = positionToX(pt.position);
        const normalizedY = (pt.y - minY) / rangeY;
        const y = sy.profileBottom - padding - normalizedY * (sy.sectionHeights.profile - 2 * padding);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    const lastPt = elevations[elevations.length - 1];
    ctx.lineTo(positionToX(lastPt.position), sy.profileBottom - 5);
    ctx.lineTo(positionToX(elevations[0].position), sy.profileBottom - 5);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, sy.profileTop, 0, sy.profileBottom);
        grad.addColorStop(0, theme.profileFill);
        grad.addColorStop(1, theme.profileFillEnd);
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.strokeStyle = '#ef5350';
        ctx.lineWidth = 2;
        ctx.beginPath();
        elevations.forEach((pt, i) => {
            const x = positionToX(pt.position);
            const normalizedY = (pt.y - minY) / rangeY;
            const y = sy.profileBottom - padding - normalizedY * (sy.sectionHeights.profile - 2 * padding);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Points
        elevations.forEach(pt => {
            const x = positionToX(pt.position);
            const normalizedY = (pt.y - minY) / rangeY;
            const y = sy.profileBottom - padding - normalizedY * (sy.sectionHeights.profile - 2 * padding);
            const isSelected = state.selectedId === pt.id;
            const radius = state.editMode ? 4 : 1.5;
            ctx.fillStyle = isSelected ? '#58a6ff' : (state.editMode ? '#ffa726' : '#ef5350');
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        if (isSelected) {
            ctx.strokeStyle = '#58a6ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.stroke();
        }
    });
}

function drawKmAxis(sy) {
    // Main axis line at top of axis section
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, sy.axisTop);
    ctx.lineTo(MARGIN.left + (state.endKm - state.startKm) * 10 * state.pxPerPK, sy.axisTop);
    ctx.stroke();

    ctx.textAlign = 'center';

    // KM labels (major ticks)
    for (let km = state.startKm; km <= state.endKm; km++) {
        const x = positionToX(km);
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, sy.axisTop);
        ctx.lineTo(x, sy.axisTop + 10);
        ctx.stroke();

        ctx.fillStyle = '#c9d1d9';
        ctx.font = 'bold 11px Consolas, monospace';
        ctx.fillText(km + ' км', x, sy.axisTop + 24);

        // PK sub-ticks (100m each)
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 0.7;
        for (let pk = 1; pk < 10; pk++) {
            const pos = toPos(km, pk * 100);
            const pkX = positionToX(pos);
            ctx.beginPath();
            ctx.moveTo(pkX, sy.axisTop);
            ctx.lineTo(pkX, sy.axisTop + 5);
            ctx.stroke();

            // Show PK number (1-9) — these are 100m increments
            if (state.pxPerPK >= 8) {
                ctx.fillStyle = '#8b949e';
                ctx.font = '9px Consolas, monospace';
                ctx.fillText(pk, pkX, sy.axisTop + 40);
            }
        }
    }

    // "км" label
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px Segoe UI';
    ctx.textAlign = 'left';
    ctx.fillText('км', MARGIN.left - 25, sy.axisTop + 24);
    ctx.textAlign = 'center';
}

function drawSlopes(sy) {
    const elevations = state.data.elevations;
    if (elevations.length < 2) return;

    // Sort elevations by position
    const sorted = [...elevations].sort((a, b) => a.position - b.position);

    // Build segments between consecutive elevation points
    const segments = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        const dx = Math.abs(p2.position - p1.position) * 1000; // meters
        if (dx < 1) continue;
        const dy = p2.y - p1.y;
        const gradientPct = (dy / dx) * 100;
        const gradientPermille = (dy / dx) * 1000;
        const x1 = positionToX(p1.position);
        const x2 = positionToX(p2.position);
        if (Math.abs(x2 - x1) < 5) continue; // too narrow to draw

        segments.push({
            x1: Math.min(x1, x2),
            x2: Math.max(x1, x2),
            length: Math.round(dx),
            dy: dy,
            gradientPermille: Math.round(gradientPermille * 10) / 10,
            gradientPct: Math.round(gradientPct * 10) / 10,
            direction: dy > 0.05 ? 'up' : (dy < -0.05 ? 'down' : 'flat')
        });
    }

    if (!segments.length) return;

    // Draw each segment
    segments.forEach(seg => {
        const midX = (seg.x1 + seg.x2) / 2;

        // Background fill
        ctx.fillStyle = seg.direction === 'up' ? 'rgba(255,167,38,0.12)' :
                        (seg.direction === 'down' ? 'rgba(66,165,245,0.12)' : 'rgba(139,148,158,0.08)');
        ctx.fillRect(seg.x1, sy.slopeTop + 5, seg.x2 - seg.x1, sy.sectionHeights.slope - 15);

        // Border
        ctx.strokeStyle = seg.direction === 'up' ? '#ffa726' :
                          (seg.direction === 'down' ? '#42a5f5' : '#8b949e');
        ctx.lineWidth = 1;
        ctx.strokeRect(seg.x1, sy.slopeTop + 5, seg.x2 - seg.x1, sy.sectionHeights.slope - 15);

        // Separator line at each elevation point
        ctx.strokeStyle = 'rgba(139,148,158,0.3)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(seg.x1, sy.slopeTop + 5);
        ctx.lineTo(seg.x1, sy.slopeBottom - 5);
        ctx.stroke();
        ctx.setLineDash([]);

        // Direction arrow (top)
        ctx.fillStyle = seg.direction === 'up' ? '#ffa726' :
                        (seg.direction === 'down' ? '#42a5f5' : '#8b949e');
        ctx.font = 'bold 16px Segoe UI';
        ctx.textAlign = 'center';
        if (seg.direction === 'up') {
            ctx.fillText('↑', midX, sy.slopeTop + 22);
        } else if (seg.direction === 'down') {
            ctx.fillText('↓', midX, sy.slopeTop + 22);
        } else {
            ctx.fillText('—', midX, sy.slopeTop + 22);
        }

        // Gradient in % (upper area)
        ctx.font = 'bold 11px Consolas, monospace';
        const gradLabel = (seg.direction === 'up' ? '+' : (seg.direction === 'down' ? '' : '')) +
                          seg.gradientPct + '%';
        ctx.fillText(gradLabel, midX, sy.slopeTop + 40);

        // Length in meters (lower area)
        ctx.font = '10px Consolas, monospace';
        ctx.fillStyle = '#8b949e';
        ctx.fillText(seg.length + 'м', midX, sy.slopeTop + 60);

        // Height difference (bottom)
        ctx.font = '9px Consolas, monospace';
        ctx.fillStyle = seg.direction === 'up' ? '#ffa726' : '#42a5f5';
        const dyLabel = (seg.direction === 'up' ? '+' : '') + seg.dy.toFixed(1) + 'м';
        ctx.fillText(dyLabel, midX, sy.slopeTop + 76);

        // Also show per mille gradient in parentheses
        ctx.font = '8px Consolas, monospace';
        ctx.fillStyle = '#6e7681';
        ctx.fillText('(' + seg.gradientPermille + '‰)', midX, sy.slopeTop + 88);

        ctx.textAlign = 'left';
    });
}

function drawPlanPath(sy) {
    const baseY = sy.planTop + sy.sectionHeights.plan / 2;

    // Base line
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, baseY);
    ctx.lineTo(MARGIN.left + (state.endKm - state.startKm) * 10 * state.pxPerPK, baseY);
    ctx.stroke();

    state.data.curves.forEach(curve => {
        let x1 = positionToX(curve.startPos);
        let x2 = positionToX(curve.endPos);
        if (x2 < x1) { const t = x1; x1 = x2; x2 = t; }

        const isSelected = state.selectedId === curve.id;
                const curveDir = curve.curveDir || 'left';
                const arcHeight = 20;
                // In odd direction: left = bulge UP (negative Y), right = bulge DOWN (positive Y)
                // In even direction: flip — looking from the other side
                const dirFactor = state.direction === 'even' ? -1 : 1;
                const sign = (curveDir === 'left' ? -1 : 1) * dirFactor;
                // Direction display arrow: show the curve's own direction even when flipped
                const displayDir = curveDir === 'left' ? '←' : '→';

        if (curve.type === 'curve') {
            ctx.strokeStyle = isSelected ? '#ffffff' : '#58a6ff';
            ctx.lineWidth = isSelected ? 4 : 3;
            ctx.beginPath();
            ctx.moveTo(x1, baseY);
            ctx.quadraticCurveTo((x1 + x2) / 2, baseY + sign * arcHeight, x2, baseY);
            ctx.stroke();

            // Direction indicator arrow
                        const midX = (x1 + x2) / 2;
                        const arrowY = baseY + sign * arcHeight;
                        ctx.fillStyle = '#58a6ff';
                        ctx.font = 'bold 12px Segoe UI';
                        ctx.textAlign = 'center';
                        ctx.fillText(displayDir, midX, arrowY + sign * 4);

            // Radius label
            ctx.font = '9px Consolas, monospace';
            ctx.fillText('R=' + curve.radius, midX, arrowY + sign * 16);
        } else {
            ctx.strokeStyle = isSelected ? '#ffffff' : '#8b949e';
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.beginPath();
            ctx.moveTo(x1, baseY);
            ctx.lineTo(x2, baseY);
            ctx.stroke();
        }
        ctx.textAlign = 'left';
    });
}

function drawStations(sy) {
    state.data.stations.forEach(station => {
        let x = positionToX(station.position);
        let xStart = positionToX(station.start);
        let xEnd = positionToX(station.end);
        if (xEnd < xStart) { const t = xStart; xStart = xEnd; xEnd = t; }

        const isSelected = state.selectedId === station.id;

        ctx.fillStyle = isSelected ? 'rgba(102, 187, 106, 0.15)' : 'rgba(102, 187, 106, 0.06)';
        ctx.fillRect(xStart, sy.profileTop, xEnd - xStart, sy.sectionHeights.profile);

        ctx.strokeStyle = isSelected ? '#66bb6a' : 'rgba(102, 187, 106, 0.5)';
        ctx.lineWidth = isSelected ? 2 : 1.5;
        ctx.setLineDash([4, 3]);
        [xStart, xEnd].forEach(bx => {
            ctx.beginPath();
            ctx.moveTo(bx, sy.profileTop);
            ctx.lineTo(bx, sy.slopeBottom);
            ctx.stroke();
        });
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(102, 187, 106, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(x, sy.profileTop);
        ctx.lineTo(x, sy.slopeBottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Station label — above the speed section
        ctx.font = 'bold 11px Segoe UI';
        const labelWidth = Math.max(ctx.measureText(station.name).width + 20, 80);
        const labelX = x - labelWidth / 2;
        const labelY = sy.speedTop - 35;

        ctx.fillStyle = isSelected ? '#2ea043' : '#238636';
        roundRect(ctx, labelX, labelY, labelWidth, 22, 4);
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#58a6ff' : '#2ea043';
        ctx.lineWidth = isSelected ? 2 : 1;
        roundRect(ctx, labelX, labelY, labelWidth, 22, 4);
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(station.name, x, labelY + 15);

        ctx.fillStyle = '#66bb6a';
        ctx.font = '9px Consolas, monospace';
        ctx.fillText(formatPos(station.position), x, labelY + 32);
        ctx.textAlign = 'left';
    });
}

function drawSignals(sy) {
    const signals = state.data.signals.filter(s => s.dir === state.direction || s.dir === 'both');
    const yBase = sy.profileTop;

    signals.forEach(sig => {
        const x = positionToX(sig.position);
        const y = yBase + sy.sectionHeights.profile - 20;
        const isSelected = state.selectedId === sig.id;

        let color, shape;
        switch (sig.type) {
            case 'passing': color = '#ffa726'; shape = 'cross'; break;
            case 'input': color = '#66bb6a'; shape = 'triangle'; break;
            case 'maneuver': color = '#ab47bc'; shape = 'diamond'; break;
            case 'output': color = '#ef5350'; shape = 'square'; break;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, yBase + 40);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        if (shape === 'cross') {
            ctx.beginPath();
            ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5);
            ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5);
            ctx.stroke();
        } else if (shape === 'triangle') {
            ctx.beginPath();
            ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4);
            ctx.closePath(); ctx.fill();
        } else if (shape === 'diamond') {
            ctx.beginPath();
            ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 5, y);
            ctx.closePath(); ctx.fill();
        } else if (shape === 'square') {
            ctx.fillRect(x - 5, y - 5, 10, 10);
        }

        ctx.fillStyle = color;
        ctx.font = 'bold 11px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(sig.label, x, yBase + 36);

        if (isSelected) {
            ctx.strokeStyle = '#58a6ff';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(x, y, 12, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.textAlign = 'left';
    });
}

function drawCrossings(sy) {
    const crossings = state.data.crossings;
    const yBase = sy.profileTop;
    const y = yBase + sy.sectionHeights.profile - 20;

    crossings.forEach(cr => {
        const x = positionToX(cr.position);
        const isSelected = state.selectedId === cr.id;

        // Vertical line
        ctx.strokeStyle = '#e53935';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, yBase + 40);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Red-white diamond (◆) — draw filled red with white border
        const sz = 7;
        ctx.beginPath();
        ctx.moveTo(x, y - sz);
        ctx.lineTo(x + sz, y);
        ctx.lineTo(x, y + sz);
        ctx.lineTo(x - sz, y);
        ctx.closePath();
        ctx.fillStyle = '#e53935';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#e53935';
        ctx.font = 'bold 11px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(cr.label || 'Переезд', x, yBase + 36);

        if (isSelected) {
            ctx.strokeStyle = '#58a6ff';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(x, y, 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.textAlign = 'left';
    });
}

function drawRecommendations(sy) {
    const recs = state.data.recommendations;
    if (!recs.length) return;
    const categoryColors = {
        note: '#d29922',
        warning: '#f85149',
        info: '#58a6ff'
    };
    const categoryIcons = { note: '📝', warning: '⚠', info: 'ℹ' };

    recs.forEach(rec => {
        const x1 = positionToX(rec.startPos);
        const x2 = positionToX(rec.endPos);
        const bx1 = Math.min(x1, x2), bx2 = Math.max(x1, x2);
        const midX = (bx1 + bx2) / 2;
        const color = categoryColors[rec.category] || '#d29922';
        const isSelected = state.selectedId === rec.id;
        const icon = categoryIcons[rec.category] + ' ';
        const rangeStr = formatPos(rec.startPos) + ' → ' + formatPos(rec.endPos);

        // --- Vertical 'I' markers at start and end ---
        const barTop = sy.profileTop + 6;
        const barBot = sy.profileTop + sy.sectionHeights.profile - 6;
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.globalAlpha = isSelected ? 0.9 : 0.5;
        // Start marker
        ctx.beginPath();
        ctx.moveTo(bx1, barTop);
        ctx.lineTo(bx1, barBot);
        ctx.stroke();
        // End marker
        if (bx2 - bx1 > 10) {
            ctx.beginPath();
            ctx.moveTo(bx2, barTop);
            ctx.lineTo(bx2, barBot);
            ctx.stroke();
        }
        // Horizontal connector at top
        ctx.beginPath();
        ctx.moveTo(bx1, barTop);
        ctx.lineTo(bx2, barTop);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Dots at top of markers
        const dotR = isSelected ? 5 : 3.5;
        ctx.beginPath();
        ctx.arc(bx1, barTop, dotR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#fff' : '#0d1117';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (bx2 - bx1 > 10) {
            ctx.beginPath();
            ctx.arc(bx2, barTop, dotR, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#fff' : '#0d1117';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // --- Adaptive 3-line label above the profile ---
        // Wrap text to fit
        const maxWidth = Math.max(180, bx2 - bx1 + 40);
        const fullText = icon + rec.text;
        ctx.font = (isSelected ? 'bold 11px ' : '10px ') + 'Segoe UI';
        const lines = wordWrap(ctx, fullText, maxWidth - 20);
        const cappedLines = lines.slice(0, 3);
        const lineH = 14;
        const textH = cappedLines.length * lineH + 4;
        const labelW = maxWidth;
        const labelX = Math.max(MARGIN.left + 2, Math.min(midX - labelW / 2, 
            MARGIN.left + (state.endKm - state.startKm) * 10 * state.pxPerPK - labelW - 2));
        const labelY = sy.profileTop + 2;

        // Background
        ctx.fillStyle = isSelected ? 'rgba(22,27,34,0.97)' : 'rgba(13,17,23,0.92)';
        roundRect(ctx, labelX, labelY, labelW, textH + 16, 5);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.5;
        roundRect(ctx, labelX, labelY, labelW, textH + 16, 5);
        ctx.stroke();

        // Range string (always visible)
        ctx.fillStyle = '#8b949e';
        ctx.font = '8px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(rangeStr, labelX + 8, labelY + 10);

        // Text lines
        ctx.fillStyle = color;
        ctx.font = (isSelected ? 'bold 10px ' : '9px ') + 'Segoe UI';
        cappedLines.forEach((line, i) => {
            ctx.fillText(line, labelX + 8, labelY + 25 + i * lineH);
        });

        // If text was truncated
        if (cappedLines.length < lines.length) {
            ctx.fillStyle = '#6e7681';
            ctx.font = '8px Segoe UI';
            ctx.fillText('...', labelX + labelW - 20, labelY + textH + 14);
        }

        ctx.textAlign = 'left';

        // Selection ring
        if (isSelected) {
            ctx.strokeStyle = '#58a6ff';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(midX, barTop, 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });
}

function wordWrap(ctx, text, maxWidth) {
    const words = text.split(/(?<=\s)/);
    const lines = [];
    let current = '';
    for (const word of words) {
        const test = current ? current + word : word;
        if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current.trim());
            current = word;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current.trim());
    return lines.length ? lines : [text];
}

function drawSpeedGraph(sy) {
    const limits = state.data.speedLimits;
    if (!limits.length) return;

    function speedColor(speed) {
        if (speed >= 120) return '#2ea043';
        if (speed >= 80) return '#d29922';
        if (speed >= 40) return '#ffa726';
        return '#ef5350';
    }

    const yTop = sy.speedTop + 2;
    const yBottom = sy.speedBottom - 2;
    const bandH = yBottom - yTop;
    const baseX1 = MARGIN.left;
    const baseX2 = MARGIN.left + (state.endKm - state.startKm) * 10 * state.pxPerPK;

    // Find max speed for Y scale
    let maxSpeed = 0;
    limits.forEach(l => { if (l.speed > maxSpeed) maxSpeed = l.speed; });
    maxSpeed = Math.max(maxSpeed, 10);
    const speedRange = maxSpeed * 1.15; // 15% headroom

    // Background
    ctx.fillStyle = isAmoled ? '#050505' : '#161b22';
    ctx.fillRect(baseX1, yTop, baseX2 - baseX1, bandH);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(baseX1, yTop, baseX2 - baseX1, bandH);

    // Section label
    ctx.fillStyle = theme.sectionLabel;
    ctx.font = '10px Segoe UI';
    ctx.textAlign = 'left';
    ctx.fillText('СКОРОСТИ', 10, sy.speedTop + 14);

    // Y-axis on left side with speed values
    ctx.fillStyle = theme.axisLabel;
    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'right';
    // Auto-compute nice step values
    let maxTick = Math.ceil(maxSpeed / 10) * 10;
    if (maxTick < 20) maxTick = 20;
    const step = maxTick <= 40 ? 10 : (maxTick <= 80 ? 20 : (maxTick <= 120 ? 25 : 30));
    for (let s = 0; s <= maxTick; s += step) {
        if (s > maxSpeed * 1.15) break;
        const y = yBottom - (s / speedRange) * bandH;
        ctx.fillText(s + '', MARGIN.left - 6, y + 3);
        // Grid line
        ctx.strokeStyle = 'rgba(48,54,61,0.3)';
        ctx.lineWidth = 0.3;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(baseX2, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.textAlign = 'left';

    // "км/ч" label on left Y-axis
    ctx.fillStyle = theme.axisLabel;
    ctx.font = '7px Segoe UI';
    ctx.fillText('км/ч', MARGIN.left - 6, yTop + 10);

    // Build continuous stepped line with overlap resolution (min speed wins)
    // Collect all unique breakpoints
    const breaks = new Set();
    limits.forEach(l => { breaks.add(l.startPos); breaks.add(l.endPos); });
    const sortedBreaks = Array.from(breaks).sort((a, b) => a - b);
    
    // For each interval, compute effective speed (minimum of all active limits)
    const segments = [];
    for (let i = 0; i < sortedBreaks.length - 1; i++) {
        const mid = (sortedBreaks[i] + sortedBreaks[i + 1]) / 2;
        let minSpeed = Infinity;
        limits.forEach(l => {
            const s = Math.min(l.startPos, l.endPos);
            const e = Math.max(l.startPos, l.endPos);
            if (mid >= s && mid < e) {
                if (l.speed < minSpeed) minSpeed = l.speed;
            }
        });
        if (minSpeed !== Infinity) {
            segments.push({ from: sortedBreaks[i], to: sortedBreaks[i + 1], speed: minSpeed });
        }
    }

    if (!segments.length) return;

    // Build polyline points — always push both points per segment
    const polyPoints = [];
    segments.forEach((seg) => {
        const x1 = positionToX(seg.from);
        const x2 = positionToX(seg.to);
        const y = yBottom - (seg.speed / speedRange) * bandH;
        polyPoints.push({ x: x1, y, speed: seg.speed });
        polyPoints.push({ x: x2, y, speed: seg.speed });
    });

    if (!polyPoints.length) return;

    // Find which segments belong to selected limit (for highlight)
    const selectedSegments = new Set();
    if (state.selectedId && state.selectedType === 'speedLimits') {
        const selLimit = state.data.speedLimits.find(l => l.id === state.selectedId);
        if (selLimit) {
            const s = Math.min(selLimit.startPos, selLimit.endPos);
            const e = Math.max(selLimit.startPos, selLimit.endPos);
            segments.forEach((seg, idx) => {
                const midSeg = (seg.from + seg.to) / 2;
                if (midSeg >= s && midSeg < e) selectedSegments.add(idx);
            });
        }
    }

    // Draw horizontal segments (even->odd pairs)
    for (let i = 0; i < polyPoints.length; i += 2) {
        const p1 = polyPoints[i];
        const p2 = polyPoints[i + 1];
        if (!p2) break;
        const segIdx = i / 2;
        const color = speedColor(p1.speed);
        const isSelected = selectedSegments.has(segIdx);
        
        // White glow for selected
        if (isSelected) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
        
        // Colored segment
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        
        // Speed label
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        if (p2.x - p1.x > 20) {
            ctx.font = 'bold 9px Consolas, monospace';
            ctx.fillText(p1.speed + '', (p1.x + p2.x) / 2, p1.y - 6);
        } else {
            ctx.font = 'bold 8px Consolas, monospace';
            ctx.fillText(p1.speed + '', p1.x, p1.y - 4);
        }
        ctx.textAlign = 'left';
        
        // Start dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // End dot
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw vertical steps between segments where speed changes
    for (let i = 2; i < polyPoints.length; i += 2) {
        const prevEnd = polyPoints[i - 1];   // previous segment end
        const currStart = polyPoints[i];      // current segment start
        if (prevEnd.x === currStart.x && prevEnd.y !== currStart.y) {
            ctx.strokeStyle = speedColor(currStart.speed);
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(currStart.x, prevEnd.y);
            ctx.lineTo(currStart.x, currStart.y);
            ctx.stroke();
        }
    }
}

function drawDirectionArrow(sy) {
    const y = sy.speedBottom + 4;
    const range = state.endKm - state.startKm;
    const x1 = MARGIN.left + 20;
    const x2 = MARGIN.left + range * 10 * state.pxPerPK - 20;
    const midX = (x1 + x2) / 2;

    const color = state.direction === 'odd' ? '#ef5350' : '#42a5f5';
    // ODD: km decreasing L→R, so arrow points LEFT
    // EVEN: km increasing L→R, so arrow points RIGHT
    const label = state.direction === 'odd'
            ? 'НЕЧЁТНОЕ: км уменьшаются ←'
            : 'ЧЁТНОЕ: км увеличиваются →';

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    if (state.direction === 'odd') {
        // Arrow points left
        ctx.moveTo(x1, y);
        ctx.lineTo(x1 + 8, y - 4);
        ctx.lineTo(x1 + 8, y + 4);
    } else {
        // Arrow points right
        ctx.moveTo(x2, y);
        ctx.lineTo(x2 - 8, y - 4);
        ctx.lineTo(x2 - 8, y + 4);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = 'bold 11px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(label, midX, y - 6);
    ctx.textAlign = 'left';
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ============================================================
// INTERACTION
// ============================================================
function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

// ============================================================
// TOUCH SUPPORT — Android-friendly: pan + tap
// ============================================================
let touchStartX = 0, touchStartY = 0, touchMoved = false, touchScrollLeft = 0;
canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return; // ignore multi-touch
    const touch = e.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchMoved = false;
    touchScrollLeft = canvasWrap.scrollLeft;
    // Don't prevent default — let native scroll work
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) touchMoved = true;
    // Pan the canvas-wrap horizontally
    canvasWrap.scrollLeft = touchScrollLeft - dx;
    // Prevent vertical page scroll during horizontal pan
    if (Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
    }
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
    if (!touchMoved) {
        // Tap — forward to click handler
        const touch = e.changedTouches[0];
        const mouseEvent = new MouseEvent('click', {
            clientX: touch.clientX, clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    }
    // Long-press context menu
}, { passive: true });
// Long-press for context menu on mobile
let longPressTimer = null;
canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;
    longPressTimer = setTimeout(() => {
        if (!touchMoved) {
            const touch = e.changedTouches[0];
            const ctxEvent = new MouseEvent('contextmenu', {
                clientX: touch.clientX, clientY: touch.clientY,
                button: 2
            });
            canvas.dispatchEvent(ctxEvent);
            navigator.vibrate && navigator.vibrate(20);
        }
    }, 500);
}, { passive: true });
canvas.addEventListener('touchmove', () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
}, { passive: true });
canvas.addEventListener('touchend', () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
}, { passive: true });
canvas.addEventListener('touchcancel', () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
}, { passive: true });

function findElevationAt(mx, my) {
    if (!state.editMode) return null;
    const elevations = state.data.elevations;
    const ys = elevations.map(e => e.y);
    const minY = Math.min(...ys) - 1;
    const maxY = Math.max(...ys) + 1;
    const rangeY = maxY - minY || 1;
    const padding = 20;
    const sy = sectionY();

    for (const pt of elevations) {
        const x = positionToX(pt.position);
        const normalizedY = (pt.y - minY) / rangeY;
        const y = sy.profileBottom - padding - normalizedY * (sy.sectionHeights.profile - 2 * padding);
        if (Math.hypot(mx - x, my - y) < 8) return pt;
    }
    return null;
}

function findSignalAt(mx, my) {
    const signals = state.data.signals.filter(s => s.dir === state.direction || s.dir === 'both');
    const sy = sectionY();
    for (const sig of signals) {
        const x = positionToX(sig.position);
        const y = sy.profileTop + sy.sectionHeights.profile - 20;
        if (Math.hypot(mx - x, my - y) < 12) return sig;
    }
    return null;
}

function findStationAt(mx, my) {
    const sy = sectionY();
    for (const st of state.data.stations) {
        const x = positionToX(st.position);
        const labelY = sy.speedTop - 35;
        if (mx > x - 60 && mx < x + 60 && my > labelY && my < labelY + 22) return st;
    }
    return null;
}

function findRecommendationAt(mx, my) {
    const sy = sectionY();
    for (const rec of state.data.recommendations) {
        const x1 = positionToX(rec.startPos);
        const x2 = positionToX(rec.endPos);
        const bx1 = Math.min(x1, x2), bx2 = Math.max(x1, x2);
        // Hit on vertical markers (wide swipe area) or label area
        const inRangeX = mx >= bx1 - 8 && mx <= bx2 + 8;
        const inMarkerY = my >= sy.profileTop + 2 && my <= sy.profileBottom - 2;
        const inLabelArea = my >= sy.profileTop - 4 && my <= sy.profileTop + 60;
        if (inRangeX && (inMarkerY || inLabelArea)) return rec;
    }
    return null;
}

function findSpeedLimitAt(mx, my) {
    const sy = sectionY();
    const yTop = sy.speedTop + 2;
    const yBottom = sy.speedBottom - 2;
    for (const limit of state.data.speedLimits) {
        const x1 = positionToX(limit.startPos);
        const x2 = positionToX(limit.endPos);
        const bx1 = Math.min(x1, x2), bx2 = Math.max(x1, x2);
        if (mx >= bx1 - 5 && mx <= bx2 + 5 && my >= yTop - 4 && my <= yBottom + 4) return limit;
    }
    return null;
}

function findCrossingAt(mx, my) {
    if (!state.editMode) return null;
    const sy = sectionY();
    const y = sy.profileTop + sy.sectionHeights.profile - 20;
    for (const cr of state.data.crossings) {
        const x = positionToX(cr.position);
        if (Math.hypot(mx - x, my - y) < 10) return cr;
    }
    return null;
}

function findStationBoundaryAt(mx, my) {
    if (!state.editMode) return null;
    const sy = sectionY();
    for (const st of state.data.stations) {
        const xStart = positionToX(st.start);
        const xEnd = positionToX(st.end);
        if (Math.abs(mx - xStart) < 8 && my >= sy.profileTop && my <= sy.slopeBottom) {
            return { type: 'start', item: st };
        }
        if (Math.abs(mx - xEnd) < 8 && my >= sy.profileTop && my <= sy.slopeBottom) {
            return { type: 'end', item: st };
        }
    }
    return null;
}

function findCurveBoundaryAt(mx, my) {
    if (!state.editMode) return null;
    const sy = sectionY();
    const baseY = sy.planTop + sy.sectionHeights.plan / 2;
    for (const cv of state.data.curves) {
        const x1 = positionToX(cv.startPos);
        const x2 = positionToX(cv.endPos);
        if (Math.abs(mx - x1) < 8 && Math.abs(my - baseY) < 20) {
            return { type: 'start', item: cv };
        }
        if (Math.abs(mx - x2) < 8 && Math.abs(my - baseY) < 20) {
            return { type: 'end', item: cv };
        }
    }
    return null;
}

function findSpeedBoundaryAt(mx, my) {
    if (!state.editMode) return null;
    const sy = sectionY();
    const yTop = sy.speedTop + 2;
    const yBottom = sy.speedBottom - 2;
    for (const sp of state.data.speedLimits) {
        const x1 = positionToX(sp.startPos);
        const x2 = positionToX(sp.endPos);
        if (Math.abs(mx - x1) < 8 && my >= yTop - 4 && my <= yBottom + 4) {
            return { type: 'start', item: sp };
        }
        if (Math.abs(mx - x2) < 8 && my >= yTop - 4 && my <= yBottom + 4) {
            return { type: 'end', item: sp };
        }
    }
    return null;
}

canvas.addEventListener('mousedown', (e) => {
    if (!state.editMode) return;
    const { x, y } = getMousePos(e);

    // Try to find a drag target
    const pt = findElevationAt(x, y);
    if (pt) {
        state.dragging = { type: 'elevation', item: pt };
        // Заморозить ось Y на момент начала перетаскивания
        const elevations = state.data.elevations;
        const ys = elevations.map(e => e.y);
        state.dragAxisMin = Math.min(...ys) - 1;
        state.dragAxisMax = Math.max(...ys) + 1;
        selectItem('elevations', pt.id, false);
        canvas.style.cursor = 'grabbing';
        return;
    }

    const sig = findSignalAt(x, y);
    if (sig) {
        state.dragging = { type: 'signal', item: sig, field: 'position' };
        selectItem('signals', sig.id, false);
        canvas.style.cursor = 'grabbing';
        return;
    }

    const cr = findCrossingAt(x, y);
    if (cr) {
        state.dragging = { type: 'crossing', item: cr, field: 'position' };
        selectItem('crossings', cr.id, false);
        canvas.style.cursor = 'grabbing';
        return;
    }

    const stBound = findStationBoundaryAt(x, y);
    if (stBound) {
        state.dragging = { type: 'stationBoundary', item: stBound.item, field: stBound.type === 'start' ? 'start' : 'end' };
        selectItem('stations', stBound.item.id, false);
        canvas.style.cursor = 'grabbing';
        return;
    }

    const cvBound = findCurveBoundaryAt(x, y);
    if (cvBound) {
        state.dragging = { type: 'curveBoundary', item: cvBound.item, field: cvBound.type === 'start' ? 'startPos' : 'endPos' };
        selectItem('curves', cvBound.item.id, false);
        canvas.style.cursor = 'grabbing';
        return;
    }

    const spBound = findSpeedBoundaryAt(x, y);
    if (spBound) {
        state.dragging = { type: 'speedBoundary', item: spBound.item, field: spBound.type === 'start' ? 'startPos' : 'endPos' };
        selectItem('speedLimits', spBound.item.id, false);
        canvas.style.cursor = 'grabbing';
        return;
    }
});

canvas.addEventListener('mousemove', (e) => {
    const { x, y } = getMousePos(e);

    if (state.dragging) {
        const newPos = xToPosition(x);
        const clamped = Math.max(state.startKm, Math.min(state.endKm, newPos));
        const rounded = Math.round(clamped * 1000) / 1000;

        if (state.dragging.type === 'elevation') {
            state.dragging.item.position = rounded;
            const sy = sectionY();
            const padding = 20;
            const axisMin = state.dragAxisMin;
            const axisMax = state.dragAxisMax;
            const rangeY = (axisMax - axisMin) || 1;
            const normalizedY = Math.min(1, Math.max(0, 1 - (y - (sy.profileTop + padding)) / (sy.sectionHeights.profile - 2 * padding)));
            state.dragging.item.y = Math.round((axisMin + normalizedY * rangeY) * 10) / 10;
        } else {
            state.dragging.item[state.dragging.field] = rounded;
        }
        draw();
        updateSelectedEditorFields();
        return;
    }

    if (state.editMode) {
        const pt = findElevationAt(x, y);
        const sig = !pt ? findSignalAt(x, y) : null;
        const cr = !pt && !sig ? findCrossingAt(x, y) : null;
        const st = !pt && !sig && !cr ? findStationAt(x, y) : null;
        const rec = !pt && !sig && !cr && !st ? findRecommendationAt(x, y) : null;
        const sp = !pt && !sig && !cr && !st && !rec ? findSpeedLimitAt(x, y) : null;
        const anyBound = !pt && !sig && !cr && !st && !rec && !sp
            ? (findStationBoundaryAt(x, y) || findCurveBoundaryAt(x, y) || findSpeedBoundaryAt(x, y))
            : null;
        canvas.style.cursor = (pt || sig || cr || st || rec || sp || anyBound) ? 'pointer' : 'crosshair';

        const tooltip = document.getElementById('tooltip');
        if (pt) {
            const elevs = state.data.elevations;
            const idx = elevs.indexOf(pt);
            let gradStr = '';
            if (idx >= 0 && idx < elevs.length - 1) {
                const next = elevs[idx + 1];
                const dy = next.y - pt.y;
                const dx = (next.position - pt.position) * 1000;
                if (dx !== 0) {
                    const grad = (dy / dx * 100).toFixed(1);
                    const dir = dy > 0 ? '\u2191' : '\u2193';
                    gradStr = `<div class="tt-row"><span>\u0423\u043A\u043B\u043E\u043D:</span><span class="tt-val">${dir} ${Math.abs(grad)}%</span></div>`;
                }
            }
            tooltip.innerHTML = `<b>\u0422\u043E\u0447\u043A\u0430 \u0440\u0435\u043B\u044C\u0435\u0444\u0430</b><div class="tt-row"><span>\u041F\u043E\u0437\u0438\u0446\u0438\u044F:</span><span class="tt-val">${formatPos(pt.position)}</span></div><div class="tt-row"><span>\u0412\u044B\u0441\u043E\u0442\u0430:</span><span class="tt-val">${pt.y} \u043C</span></div>${gradStr}`;
            showTooltip(e, tooltip);
        } else if (sig) {
            tooltip.innerHTML = `<b>\u0421\u0438\u0433\u043D\u0430\u043B ${sig.label}</b><div class="tt-row"><span>\u041F\u043E\u0437\u0438\u0446\u0438\u044F:</span><span class="tt-val">${formatPos(sig.position)}</span></div>${sig.station ? `<div class="tt-row"><span>\u0421\u0442\u0430\u043D\u0446\u0438\u044F:</span><span class="tt-val">${sig.station}</span></div>` : ''}`;
            showTooltip(e, tooltip);
        } else if (cr) {
            tooltip.innerHTML = `<b>\u041F\u0435\u0440\u0435\u0435\u0437\u0434</b><div class="tt-row"><span>\u041F\u043E\u0437\u0438\u0446\u0438\u044F:</span><span class="tt-val">${formatPos(cr.position)}</span></div>${cr.label ? `<div class="tt-row"><span>\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435:</span><span class="tt-val">${cr.label}</span></div>` : ''}`;
            showTooltip(e, tooltip);
        } else if (st) {
            tooltip.innerHTML = `<b>${st.name}</b><div class="tt-row"><span>\u041F\u043E\u0437\u0438\u0446\u0438\u044F:</span><span class="tt-val">${formatPos(st.position)}</span></div><div class="tt-row"><span>\u0413\u0440\u0430\u043D\u0438\u0446\u044B:</span><span class="tt-val">${formatPos(st.start)} &mdash; ${formatPos(st.end)}</span></div>`;
            showTooltip(e, tooltip);
        } else if (rec) {
            tooltip.innerHTML = `<b>\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u044F</b><div class="tt-row"><span>\u041E\u0442:</span><span class="tt-val">${formatPos(rec.startPos)}</span></div><div class="tt-row"><span>\u0414\u043E:</span><span class="tt-val">${formatPos(rec.endPos)}</span></div><div style="margin-top:4px;color:#c9d1d9;">${rec.text}</div>`;
            showTooltip(e, tooltip);
        } else if (sp) {
            tooltip.innerHTML = `<b>\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u0441\u043A\u043E\u0440\u043E\u0441\u0442\u0438</b><div class="tt-row"><span>\u041E\u0442:</span><span class="tt-val">${formatPos(sp.startPos)}</span></div><div class="tt-row"><span>\u0414\u043E:</span><span class="tt-val">${formatPos(sp.endPos)}</span></div><div class="tt-row"><span>\u0421\u043A\u043E\u0440\u043E\u0441\u0442\u044C:</span><span class="tt-val">${sp.speed} \u043A\u043C/\u0447</span></div>${sp.remark ? `<div style="margin-top:4px;color:#c9d1d9;">${sp.remark}</div>` : ''}`;
            showTooltip(e, tooltip);
        } else if (anyBound) {
            const bound = anyBound;
            const item = bound.item;
            const field = bound.type === 'start' ? 'start' : 'end';
            let typeName = '';
            let fieldVal = '';
            if (item.name !== undefined) {
                typeName = '\u0421\u0442\u0430\u043D\u0446\u0438\u044F ' + item.name;
                fieldVal = formatPos(field === 'start' ? item.start : item.end);
            } else if (item.radius !== undefined) {
                typeName = '\u041A\u0440\u0438\u0432\u0430\u044F R=' + item.radius;
                fieldVal = formatPos(field === 'start' ? item.startPos : item.endPos);
            } else if (item.speed !== undefined) {
                typeName = '\u0421\u043A\u043E\u0440\u043E\u0441\u0442\u044C ' + item.speed + ' \u043A\u043C/\u0447';
                fieldVal = formatPos(field === 'start' ? item.startPos : item.endPos);
            }
            tooltip.innerHTML = `<b>${typeName}</b><div class="tt-row"><span>${bound.type === 'start' ? '\u041D\u0430\u0447\u0430\u043B\u043E' : '\u041A\u043E\u043D\u0435\u0446'}:</span><span class="tt-val">${fieldVal}</span></div><div style="color:#ffa726;font-size:9px;margin-top:2px;">\u27F7 \u043F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0433\u0440\u0430\u043D\u0438\u0446\u0443</div>`;
            showTooltip(e, tooltip);
        } else {
            tooltip.style.display = 'none';
        }
    } else {
        document.getElementById('tooltip').style.display = 'none';
    }
});

canvas.addEventListener('mouseup', () => {
    if (state.dragging) {
        const type = state.dragging.type;
        let listType = 'elevations';
        if (type === 'signal') listType = 'signals';
        else if (type === 'crossing') listType = 'crossings';
        else if (type === 'stationBoundary') listType = 'stations';
        else if (type === 'curveBoundary') listType = 'curves';
        else if (type === 'speedBoundary') listType = 'speedLimits';
        else if (type === 'elevation') listType = 'elevations';

        state.dragging = null;
        canvas.style.cursor = state.editMode ? 'crosshair' : 'default';

        if (type === 'elevation') {
            state.data.elevations.sort((a, b) => a.position - b.position);
        } else if (type === 'curveBoundary') {
            state.data.curves.sort((a, b) => a.startPos - b.startPos);
        } else if (type === 'speedBoundary') {
            state.data.speedLimits.sort((a, b) => a.startPos - b.startPos);
        } else if (type === 'stationBoundary') {
            state.data.stations.sort((a, b) => a.position - b.position);
        }
        draw();
        refreshEditorList(listType);
    }
});

canvas.addEventListener('click', (e) => {
    if (state.dragging) return;
    const { x, y } = getMousePos(e);

    if (state.editMode) {
        const pt = findElevationAt(x, y);
        if (pt) { selectItem('elevations', pt.id, true); return; }
        const sig = findSignalAt(x, y);
        if (sig) { selectItem('signals', sig.id, true); return; }
        const st = findStationAt(x, y);
        if (st) { selectItem('stations', st.id, true); return; }
        const cr = findCrossingAt(x, y);
        if (cr) { selectItem('crossings', cr.id, true); return; }
        const rec = findRecommendationAt(x, y);
        if (rec) { selectItem('recommendations', rec.id, true); return; }
        const sp = findSpeedLimitAt(x, y);
        if (sp) { selectItem('speedLimits', sp.id, true); return; }
        const stBound = findStationBoundaryAt(x, y);
        if (stBound) { selectItem('stations', stBound.item.id, true); return; }
        const cvBound = findCurveBoundaryAt(x, y);
        if (cvBound) { selectItem('curves', cvBound.item.id, true); return; }
        const spBound = findSpeedBoundaryAt(x, y);
        if (spBound) { selectItem('speedLimits', spBound.item.id, true); return; }

        // Точечное нанесение рельефа — клик на профиле
        const activeTab = document.querySelector('.editor-tab.active');
        if (activeTab && activeTab.dataset.tab === 'elevations') {
            const sy = sectionY();
            if (y >= sy.profileTop + 15 && y <= sy.profileBottom - 5) {
                const km = Math.round(xToPosition(x) * 1000) / 1000;
                const elevationYs = state.data.elevations.map(e => e.y);
                const minY = elevationYs.length ? Math.min(...elevationYs) - 1 : -1;
                const maxY = elevationYs.length ? Math.max(...elevationYs) + 1 : 10;
                const rangeY = (maxY - minY) || 1;
                const padding = 20;
                const normalizedY = Math.min(1, Math.max(0, 1 - (y - (sy.profileTop + padding)) / (sy.sectionHeights.profile - 2 * padding)));
                const elevationY = Math.round((minY + normalizedY * rangeY) * 10) / 10;
                
                saveSnapshot();
                const id = newId();
                state.data.elevations.push({ id, position: km, y: elevationY });
                state.data.elevations.sort((a, b) => a.position - b.position);
                refreshEditorList('elevations');
                selectItem('elevations', id, true);
                draw();
            }
        }
    }
});

canvas.addEventListener('mouseleave', () => {
    document.getElementById('tooltip').style.display = 'none';
});

// ============================================================
// CONTEXT MENU (ПКМ)
// ============================================================
const ctxMenu = document.getElementById('ctxMenu');
let ctxKm = null; // km position clicked

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const { x } = getMousePos(e);
    ctxKm = Math.round(xToPosition(x) * 1000) / 1000;

    // Position menu at mouse
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';

    // Show/hide delete item
    const delItem = ctxMenu.querySelector('[data-action="delete-selected"]');
    delItem.style.display = (state.selectedId && state.selectedType) ? 'flex' : 'none';

    ctxMenu.classList.add('show');
});

// Close context menu on any click outside
document.addEventListener('click', (e) => {
    if (!ctxMenu.contains(e.target)) {
        ctxMenu.classList.remove('show');
    }
});

// Context menu action handlers
ctxMenu.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        ctxMenu.classList.remove('show');
        handleCtxAction(action);
    });
});

function handleCtxAction(action) {
    if (!ctxKm) ctxKm = state.startKm + (state.endKm - state.startKm) / 2;

    if (action === 'add-station') {
        // Ensure editor is open with stations tab
        openEditorTab('stations');
        const km = Math.floor(ctxKm);
        const m = Math.round((ctxKm - km) * 1000);
        document.getElementById('st-km').value = km;
        document.getElementById('st-m').value = Math.min(m, 999);
        document.getElementById('st-start-km').value = km;
        document.getElementById('st-start-m').value = Math.max(0, m - 500);
        document.getElementById('st-end-km').value = km;
        document.getElementById('st-end-m').value = Math.min(m + 500, 999);
        document.getElementById('st-name').focus();
    } else if (action === 'add-signal') {
        openEditorTab('signals');
        const km = Math.floor(ctxKm);
        const m = Math.round((ctxKm - km) * 1000);
        document.getElementById('sg-km').value = km;
        document.getElementById('sg-m').value = Math.min(m, 999);
        document.getElementById('sg-label').focus();
    } else if (action === 'add-crossing') {
        openEditorTab('crossings');
        const km = Math.floor(ctxKm);
        const m = Math.round((ctxKm - km) * 1000);
        document.getElementById('cr-km').value = km;
        document.getElementById('cr-m').value = Math.min(m, 999);
        document.getElementById('cr-name').focus();
    } else if (action === 'add-speed') {
        openEditorTab('speedLimits');
        const km = Math.floor(ctxKm);
        const m = Math.round((ctxKm - km) * 1000);
        document.getElementById('sp-start-km').value = km;
        document.getElementById('sp-start-m').value = Math.min(m, 999);
        document.getElementById('sp-end-km').value = km;
        document.getElementById('sp-end-m').value = Math.min(m + 500, 999);
        document.getElementById('sp-speed').focus();
    } else if (action === 'add-elevation') {
        openEditorTab('elevations');
        const km = Math.floor(ctxKm);
        const pk = Math.floor((ctxKm - km) * 10);
        const m = Math.round(((ctxKm - km) * 1000) % 100);
        document.getElementById('el-km').value = km;
        document.getElementById('el-pk').value = pk;
        document.getElementById('el-m').value = m;
        autoCalcElevY();
        document.getElementById('el-y').focus();
    } else if (action === 'delete-selected') {
        if (!state.selectedId || !state.selectedType) return;
        const type = state.selectedType;
        const item = findItemById(type, state.selectedId);
        if (!item) return;
        saveSnapshot();
        state.data[type] = state.data[type].filter(x => x.id !== item.id);
        closeSelectedEditor();
        refreshEditorList(type);
        draw();
    }
}

function openEditorTab(tabId) {
    // Open editor panel if not open
    if (!state.editMode) {
        state.editMode = true;
        editBtn.classList.add('active');
        editorPanel.classList.add('open');
        canvas.classList.add('edit-mode');
        document.getElementById('editBanner').classList.add('show');
        document.getElementById('statusDot').classList.add('edit');
        document.getElementById('statusText').textContent = 'Режим редактирования';
    }
    // Switch to tab
    const tab = document.querySelector(`.editor-tab[data-tab="${tabId}"]`);
    if (tab) {
        document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.editor-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('sec-' + tabId).classList.add('active');
    }
}

function showTooltip(e, tooltip) {
    const rect = canvasWrap.getBoundingClientRect();
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX - rect.left + 15) + 'px';
    tooltip.style.top = (e.clientY - rect.top + 15) + 'px';
}

// ============================================================
// SELECTION & EDITOR
// ============================================================
function selectItem(type, id, doScroll = true) {
    state.selectedId = id;
    state.selectedType = type;
    // Switch to the appropriate tab
    const tab = document.querySelector(`.editor-tab[data-tab="${type}"]`);
    if (tab) {
        document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.editor-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('sec-' + type).classList.add('active');
    }
    refreshEditorList(type);
    showSelectedEditor(type, id);
    draw();

    if (doScroll) {
        const item = findItemById(type, id);
        if (item) {
            let x;
            if (type === 'elevations' || type === 'signals') {
                x = positionToX(item.position);
            } else if (type === 'stations') {
                x = positionToX(item.position);
            } else if (type === 'recommendations' || type === 'slopes' || type === 'curves' || type === 'speedLimits') {
                x = (positionToX(item.startPos) + positionToX(item.endPos)) / 2;
            }
            if (x !== undefined) scrollToX(x);
        }
    }
}

function findItemById(type, id) {
    if (type === 'signals') return state.data.signals.find(s => s.id === id);
    return state.data[type].find(x => x.id === id);
}

function showSelectedEditor(type, id) {
    ['stations', 'signals', 'elevations', 'slopes', 'curves', 'crossings', 'recommendations', 'speedLimits'].forEach(t => {
        document.getElementById('sel-' + t).classList.remove('active');
    });
    if (!id) return;
    document.getElementById('sel-' + type).classList.add('active');
    updateSelectedEditorFields();
}

function updateSelectedEditorFields() {
    if (!state.selectedId || !state.selectedType) return;
    const item = findItemById(state.selectedType, state.selectedId);
    if (!item) return;

    const t = state.selectedType;
    if (t === 'stations') {
        const p = fromPos(item.position);
        const s = fromPos(item.start);
        const e = fromPos(item.end);
        document.getElementById('sel-st-name').value = item.name || '';
        document.getElementById('sel-st-km').value = p.km;
        document.getElementById('sel-st-m').value = p.m;
        document.getElementById('sel-st-start-km').value = s.km;
        document.getElementById('sel-st-start-m').value = s.m;
        document.getElementById('sel-st-end-km').value = e.km;
        document.getElementById('sel-st-end-m').value = e.m;
    } else if (t === 'signals') {
        const p = fromPos(item.position);
        document.getElementById('sel-sg-label').value = item.label || '';
        document.getElementById('sel-sg-type').value = item.type;
                document.getElementById('sel-sg-dir').value = item.dir || 'odd';
                document.getElementById('sel-sg-km').value = p.km;
                document.getElementById('sel-sg-m').value = p.m;
    } else if (t === 'elevations') {
        const p = fromPos(item.position);
        document.getElementById('sel-el-km').value = p.km;
        document.getElementById('sel-el-m').value = p.m;
        document.getElementById('sel-el-y').value = item.y;
        // Also populate quick-add fields
        const pk = Math.floor(p.m / 100);
        const m = p.m % 100;
        document.getElementById('el-km').value = p.km;
        document.getElementById('el-pk').value = pk;
        document.getElementById('el-m').value = m;
        document.getElementById('el-y').value = item.y;
    } else if (t === 'slopes') {
        const s = fromPos(item.startPos);
        const e = fromPos(item.endPos);
        document.getElementById('sel-sl-start-km').value = s.km;
        document.getElementById('sel-sl-start-m').value = s.m;
        document.getElementById('sel-sl-end-km').value = e.km;
        document.getElementById('sel-sl-end-m').value = e.m;
        document.getElementById('sel-sl-grad').value = item.gradient;
        document.getElementById('sel-sl-dir').value = item.direction;
    } else if (t === 'curves') {
        const s = fromPos(item.startPos);
        const e = fromPos(item.endPos);
        document.getElementById('sel-cv-start-km').value = s.km;
        document.getElementById('sel-cv-start-m').value = s.m;
        document.getElementById('sel-cv-end-km').value = e.km;
        document.getElementById('sel-cv-end-m').value = e.m;
        document.getElementById('sel-cv-type').value = item.type;
        document.getElementById('sel-cv-radius').value = item.radius;
        document.getElementById('sel-cv-dir').value = item.curveDir || 'left';
    } else if (t === 'recommendations') {
            const s = fromPos(item.startPos);
            const e = fromPos(item.endPos);
            document.getElementById('sel-rc-start-km').value = s.km;
            document.getElementById('sel-rc-start-m').value = s.m;
            document.getElementById('sel-rc-end-km').value = e.km;
            document.getElementById('sel-rc-end-m').value = e.m;
            document.getElementById('sel-rc-category').value = item.category;
            document.getElementById('sel-rc-text').value = item.text || '';
        } else if (t === 'speedLimits') {
            const s = fromPos(item.startPos);
            const e = fromPos(item.endPos);
            document.getElementById('sel-sp-start-km').value = s.km;
            document.getElementById('sel-sp-start-m').value = s.m;
            document.getElementById('sel-sp-end-km').value = e.km;
            document.getElementById('sel-sp-end-m').value = e.m;
            document.getElementById('sel-sp-speed').value = item.speed || 60;
            document.getElementById('sel-sp-remark').value = item.remark || '';
        } else if (t === 'crossings') {
            const p = fromPos(item.position);
            document.getElementById('sel-cr-name').value = item.label || '';
            document.getElementById('sel-cr-km').value = p.km;
            document.getElementById('sel-cr-m').value = p.m;
        }
}

function closeSelectedEditor() {
    state.selectedId = null;
    state.selectedType = null;
    ['stations', 'signals', 'elevations', 'slopes', 'curves', 'crossings', 'recommendations', 'speedLimits'].forEach(t => {
        document.getElementById('sel-' + t).classList.remove('active');
    });
    refreshCurrentList();
    draw();
}

// Save handlers
// Один клик по "Сохранить" = один saveSnapshot() = одна запись в undo-истории.
// postProcess склеивает временные _km/_m/... поля в реальные position/startPos/endPos
// и удаляет временные поля — выполняется ОДИН раз, в том же обработчике, что и снепшот.
const SORT_COMPARATORS = {
    elevations: (a, b) => a.position - b.position,
    stations: (a, b) => a.position - b.position,
    slopes: (a, b) => a.startPos - b.startPos,
    curves: (a, b) => a.startPos - b.startPos,
    speedLimits: (a, b) => a.startPos - b.startPos,
    recommendations: (a, b) => a.startPos - b.startPos
};

function sortType(type) {
    const cmp = SORT_COMPARATORS[type];
    if (cmp) state.data[type].sort(cmp);
}

function setupSaveHandler(type, fieldMap, postProcess) {
    document.querySelector(`[data-save="${type}"]`).addEventListener('click', () => {
        const item = findItemById(type, state.selectedId);
        if (!item) return;
        saveSnapshot();
        fieldMap.forEach(([inputId, field, parser]) => {
            const val = document.getElementById(inputId).value;
            item[field] = parser ? parser(val) : val;
        });
        if (postProcess) postProcess(item);
        sortType(type);
        refreshEditorList(type);
        draw();
    });
    document.querySelector(`[data-cancel="${type}"]`).addEventListener('click', closeSelectedEditor);
    document.querySelector(`[data-close="${type}"]`).addEventListener('click', closeSelectedEditor);
}

// Auto-apply: on input change, update the item immediately and redraw (без saveSnapshot —
// история пишется только по явному клику "Сохранить", иначе undo-стек флудился бы на каждую нажатую клавишу)
function setupAutoApply(type, fieldMap) {
    fieldMap.forEach(([inputId, field, parser]) => {
        const el = document.getElementById(inputId);
        if (!el) return;
        el.addEventListener('input', () => {
            const item = findItemById(type, state.selectedId);
            if (!item) return;
            const val = el.value;
            item[field] = parser ? parser(val) : val;
            draw();
        });
    });
}
// Live-версия postProcess для km+m compound fields — только пересчёт позиции,
// временные поля НЕ удаляются (форма ещё открыта, "Сохранить" не нажат)
function debounceAutoApply(type, fn) {
    const allInputs = document.querySelectorAll(`#sel-${type} input[type="number"]`);
    allInputs.forEach(el => {
        el.addEventListener('input', () => {
            const item = findItemById(type, state.selectedId);
            if (!item) return;
            fn(item);
            draw();
        });
    });
}

// postProcess-функции: финальная сборка position/startPos/endPos + удаление временных полей
function ppStations(item) {
    item.position = toPos(item._km, item._m);
    item.start = toPos(item._skm, item._sm);
    item.end = toPos(item._ekm, item._em);
    delete item._km; delete item._m; delete item._skm; delete item._sm; delete item._ekm; delete item._em;
}
function ppSinglePos(item) {
    item.position = toPos(item._km, item._m);
    delete item._km; delete item._m;
}
function ppRange(item) {
    item.startPos = toPos(item._skm, item._sm);
    item.endPos = toPos(item._ekm, item._em);
    delete item._skm; delete item._sm; delete item._ekm; delete item._em;
}
// Live-версии (без delete — форма ещё редактируется)
function liveStations(item) {
    item.position = toPos(item._km, item._m);
    item.start = toPos(item._skm, item._sm);
    item.end = toPos(item._ekm, item._em);
}
function liveSinglePos(item) {
    item.position = toPos(item._km, item._m);
}
function liveRange(item) {
    item.startPos = toPos(item._skm, item._sm);
    item.endPos = toPos(item._ekm, item._em);
}

const stationsFields = [
    ['sel-st-name', 'name'],
    ['sel-st-km', '_km', parseInt],
    ['sel-st-m', '_m', parseInt],
    ['sel-st-start-km', '_skm', parseInt],
    ['sel-st-start-m', '_sm', parseInt],
    ['sel-st-end-km', '_ekm', parseInt],
    ['sel-st-end-m', '_em', parseInt]
];
setupSaveHandler('stations', stationsFields, ppStations);
setupAutoApply('stations', stationsFields);
debounceAutoApply('stations', liveStations);

const signalsFields = [
    ['sel-sg-label', 'label'],
    ['sel-sg-type', 'type'],
    ['sel-sg-dir', 'dir'],
    ['sel-sg-km', '_km', parseInt],
    ['sel-sg-m', '_m', parseInt]
];
setupSaveHandler('signals', signalsFields, ppSinglePos);
setupAutoApply('signals', signalsFields);
debounceAutoApply('signals', liveSinglePos);

const elevationsFields = [
    ['sel-el-km', '_km', parseInt],
    ['sel-el-m', '_m', parseInt],
    ['sel-el-y', 'y', parseFloat]
];
setupSaveHandler('elevations', elevationsFields, ppSinglePos);
setupAutoApply('elevations', elevationsFields);
debounceAutoApply('elevations', liveSinglePos);

const slopesFields = [
    ['sel-sl-start-km', '_skm', parseInt],
    ['sel-sl-start-m', '_sm', parseInt],
    ['sel-sl-end-km', '_ekm', parseInt],
    ['sel-sl-end-m', '_em', parseInt],
    ['sel-sl-grad', 'gradient', parseInt],
    ['sel-sl-dir', 'direction']
];
setupSaveHandler('slopes', slopesFields, ppRange);
setupAutoApply('slopes', slopesFields);
debounceAutoApply('slopes', liveRange);

const curvesFields = [
    ['sel-cv-start-km', '_skm', parseInt],
    ['sel-cv-start-m', '_sm', parseInt],
    ['sel-cv-end-km', '_ekm', parseInt],
    ['sel-cv-end-m', '_em', parseInt],
    ['sel-cv-type', 'type'],
    ['sel-cv-radius', 'radius', parseInt],
    ['sel-cv-dir', 'curveDir']
];
setupSaveHandler('curves', curvesFields, ppRange);
setupAutoApply('curves', curvesFields);
debounceAutoApply('curves', liveRange);

const crossingsFields = [
    ['sel-cr-name', 'label'],
    ['sel-cr-km', '_km', parseInt],
    ['sel-cr-m', '_m', parseInt]
];
setupSaveHandler('crossings', crossingsFields, ppSinglePos);
setupAutoApply('crossings', crossingsFields);
debounceAutoApply('crossings', liveSinglePos);

const recommendationsFields = [
    ['sel-rc-start-km', '_skm', parseInt],
    ['sel-rc-start-m', '_sm', parseInt],
    ['sel-rc-end-km', '_ekm', parseInt],
    ['sel-rc-end-m', '_em', parseInt],
    ['sel-rc-category', 'category'],
    ['sel-rc-text', 'text']
];
setupSaveHandler('recommendations', recommendationsFields, ppRange);
setupAutoApply('recommendations', recommendationsFields);
debounceAutoApply('recommendations', liveRange);

const speedLimitsFields = [
    ['sel-sp-start-km', '_skm', parseInt],
    ['sel-sp-start-m', '_sm', parseInt],
    ['sel-sp-end-km', '_ekm', parseInt],
    ['sel-sp-end-m', '_em', parseInt],
    ['sel-sp-speed', 'speed', parseInt],
    ['sel-sp-remark', 'remark']
];
setupSaveHandler('speedLimits', speedLimitsFields, ppRange);
setupAutoApply('speedLimits', speedLimitsFields);
debounceAutoApply('speedLimits', liveRange);

// ============================================================
// LEGEND TOGGLE
// ============================================================
document.getElementById('legendHeader').addEventListener('click', () => {
    document.getElementById('legend').classList.toggle('collapsed');
});

// ============================================================
// EDITOR PANEL
// ============================================================
const editorPanel = document.getElementById('editorPanel');
const editBtn = document.getElementById('editBtn');
const closeEditorBtn = document.getElementById('closeEditorBtn');

editBtn.addEventListener('click', () => {
    state.editMode = !state.editMode;
    editBtn.classList.toggle('active', state.editMode);
    editorPanel.classList.toggle('open');
    canvas.classList.toggle('edit-mode', state.editMode);
    document.getElementById('editBanner').classList.toggle('show', state.editMode);
    document.getElementById('statusDot').classList.toggle('edit', state.editMode);
    document.getElementById('statusText').textContent = state.editMode ? 'Режим редактирования' : 'Режим просмотра';
    draw();
});

closeEditorBtn.addEventListener('click', () => {
    editorPanel.classList.remove('open');
});

document.querySelectorAll('.editor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.editor-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('sec-' + tab.dataset.tab).classList.add('active');
    });
});

// ============================================================
// ADD ACTIONS
// ============================================================
function readKmM(kmId, mId) {
    return toPos(parseInt(document.getElementById(kmId).value), parseInt(document.getElementById(mId).value));
}

document.getElementById('addStationBtn').addEventListener('click', () => {
    const st = {
        id: newId(),
        position: readKmM('st-km', 'st-m'),
        name: document.getElementById('st-name').value,
        start: readKmM('st-start-km', 'st-start-m'),
        end: readKmM('st-end-km', 'st-end-m')
    };
    state.data.stations.push(st);
        saveSnapshot();
        state.data.stations.sort((a, b) => a.position - b.position);
        refreshEditorList('stations');
        selectItem('stations', st.id, true);
});

document.getElementById('addSignalBtn').addEventListener('click', () => {
    const sig = {
        id: newId(),
        position: readKmM('sg-km', 'sg-m'),
        type: document.getElementById('sg-type').value,
        label: document.getElementById('sg-label').value,
        dir: document.getElementById('sg-dir').value
    };
    state.data.signals.push(sig);
    saveSnapshot();
    refreshEditorList('signals');
    selectItem('signals', sig.id, true);
});

// Elevation quick-input: tab/enter navigation + auto height
const elevInputs = ['el-km', 'el-pk', 'el-m', 'el-y'];
elevInputs.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', (e) => {
        // Tab → next field
        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            const next = elevInputs[i + 1];
            if (next) document.getElementById(next).focus();
        }
        // Shift+Tab → previous field
        if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            const prev = elevInputs[i - 1];
            if (prev) document.getElementById(prev).focus();
        }
        // Enter → add point
        if (e.key === 'Enter') {
            e.preventDefault();
            addElevationPoint();
        }
    });
});
// Auto-calc height from previous point when km changes
document.getElementById('el-km').addEventListener('input', autoCalcElevY);
document.getElementById('el-pk').addEventListener('input', autoCalcElevY);
document.getElementById('el-m').addEventListener('input', autoCalcElevY);

function autoCalcElevY() {
    const yField = document.getElementById('el-y');
    // Don't auto-calc if user has manually set a value
    if (yField.dataset.userSet === 'true') return;
    
    const km = parseInt(document.getElementById('el-km').value) || 0;
    const pk = parseInt(document.getElementById('el-pk').value) || 0;
    const m = parseInt(document.getElementById('el-m').value) || 0;
    const pos = toPos(km, pk * 100 + m);
    const elevs = state.data.elevations;
    
    // Find previous point
    let prev = null;
    for (const e of elevs) {
        if (e.position <= pos) prev = e;
        if (e.position >= pos) break;
    }
    
    if (prev && prev.position < pos) {
        const diff = (pos - prev.position) * 1000; // meters
        if (diff > 0) {
            // Interpolate from previous point
            yField.placeholder = `~${prev.y}`;
            yField.value = '';
        }
    } else if (prev) {
        yField.placeholder = `~${prev.y}`;
        yField.value = '';
    } else if (elevs.length > 0) {
        yField.placeholder = `~${elevs[0].y}`;
        yField.value = '';
    } else {
        yField.placeholder = 'авто';
    }
}
// Mark Y as user-set when user edits it
document.getElementById('el-y').addEventListener('input', () => {
    if (document.getElementById('el-y').value) {
        document.getElementById('el-y').dataset.userSet = 'true';
    } else {
        delete document.getElementById('el-y').dataset.userSet;
    }
});

function addElevationPoint() {
    const km = parseInt(document.getElementById('el-km').value) || 0;
    const pk = parseInt(document.getElementById('el-pk').value) || 0;
    const m = parseInt(document.getElementById('el-m').value) || 0;
    const pos = toPos(km, pk * 100 + m);
    const elevs = state.data.elevations;
    
    // Auto-calculate height if empty
    let y = parseFloat(document.getElementById('el-y').value);
    if (isNaN(y)) {
        let prev = null;
        for (const e of elevs) {
            if (e.position <= pos) prev = e;
            if (e.position >= pos) break;
        }
        y = prev ? prev.y : 5;
    }
    
    // Check if point already exists at same position — update instead
    const existing = elevs.find(e => Math.abs(e.position - pos) < 0.001);
    if (existing) {
        existing.y = Math.round(y * 10) / 10;
        state.data.elevations.sort((a, b) => a.position - b.position);
        refreshEditorList('elevations');
        selectItem('elevations', existing.id, true);
        draw();
        prepNextElevPoint(km, pk, m);
        return;
    }
    
    const pt = {
        id: newId(),
        position: pos,
        y: Math.round(y * 10) / 10
    };
    state.data.elevations.push(pt);
    saveSnapshot();
    state.data.elevations.sort((a, b) => a.position - b.position);
    refreshEditorList('elevations');
    selectItem('elevations', pt.id, true);
    draw();
    prepNextElevPoint(km, pk, m);
}

function prepNextElevPoint(km, pk, m) {
    let nextPk = pk + 1;
    let nextM = m;
    let nextKm = km;
    if (nextPk > 9) { nextPk = 0; nextKm++; }
    document.getElementById('el-km').value = nextKm;
    document.getElementById('el-pk').value = nextPk;
    document.getElementById('el-m').value = nextM;
    document.getElementById('el-y').value = '';
    delete document.getElementById('el-y').dataset.userSet;
    document.getElementById('el-km').focus();
    autoCalcElevY();
}

document.getElementById('addElevBtn').addEventListener('click', addElevationPoint);

document.getElementById('addSlopeBtn').addEventListener('click', () => {
    const sl = {
        id: newId(),
        startPos: readKmM('sl-start-km', 'sl-start-m'),
        endPos: readKmM('sl-end-km', 'sl-end-m'),
        gradient: parseInt(document.getElementById('sl-grad').value),
        direction: document.getElementById('sl-dir').value
    };
    state.data.slopes.push(sl);
        saveSnapshot();
        state.data.slopes.sort((a, b) => a.startPos - b.startPos);
        refreshEditorList('slopes');
        selectItem('slopes', sl.id, true);
});

document.getElementById('addCurveBtn').addEventListener('click', () => {
    const cv = {
        id: newId(),
        startPos: readKmM('cv-start-km', 'cv-start-m'),
        endPos: readKmM('cv-end-km', 'cv-end-m'),
        type: document.getElementById('cv-type').value,
        radius: parseInt(document.getElementById('cv-radius').value),
        curveDir: document.getElementById('cv-dir').value
    };
    state.data.curves.push(cv);
        saveSnapshot();
        state.data.curves.sort((a, b) => a.startPos - b.startPos);
        refreshEditorList('curves');
        selectItem('curves', cv.id, true);
});

document.getElementById('addRecBtn').addEventListener('click', () => {
    try {
        const startKm = validateKm(document.getElementById('rc-start-km').value, 'Начало км');
        const startM = validateM(document.getElementById('rc-start-m').value);
        const endKm = validateKm(document.getElementById('rc-end-km').value, 'Конец км');
        const endM = validateM(document.getElementById('rc-end-m').value);
        const startPos = toPos(startKm, startM);
        const endPos = toPos(endKm, endM);
        validatePosRange(startPos, endPos, 'Рекомендация');
        const category = document.getElementById('rc-category').value;
        const text = validateRequired(document.getElementById('rc-text').value, 'Текст');
        const rec = {
            id: newId(),
            startPos, endPos,
            category, text
        };
        saveSnapshot();
        state.data.recommendations.push(rec);
        state.data.recommendations.sort((a, b) => a.startPos - b.startPos);
        refreshEditorList('recommendations');
        selectItem('recommendations', rec.id, true);
        document.getElementById('rc-text').value = '';
    } catch (e) { showValidationError(e.message); }
});

document.getElementById('addSpeedBtn').addEventListener('click', () => {
    const sp = {
        id: newId(),
        startPos: readKmM('sp-start-km', 'sp-start-m'),
        endPos: readKmM('sp-end-km', 'sp-end-m'),
        speed: parseInt(document.getElementById('sp-speed').value) || 60,
        remark: document.getElementById('sp-remark').value || ''
    };
    state.data.speedLimits.push(sp);
    saveSnapshot();
    state.data.speedLimits.sort((a, b) => a.startPos - b.startPos);
    refreshEditorList('speedLimits');
    selectItem('speedLimits', sp.id, true);
});

// Add crossing button
document.getElementById('addCrossingBtn').addEventListener('click', () => {
    const cr = {
        id: newId(),
        position: readKmM('cr-km', 'cr-m'),
        label: document.getElementById('cr-name').value || ''
    };
    state.data.crossings.push(cr);
    saveSnapshot();
    refreshEditorList('crossings');
    selectItem('crossings', cr.id, true);
});

// ============================================================
// LISTS
// ============================================================
function refreshEditorList(type) {
    const listIdMap = {
        stations: 'stationsList', signals: 'signalsList', elevations: 'elevationsList',
        slopes: 'slopesList', curves: 'curvesList', recommendations: 'recommendationsList',
        speedLimits: 'speedLimitsList', crossings: 'crossingsList'
    };
    const typeColors = { passing: '#ffa726', input: '#66bb6a', maneuver: '#ab47bc', output: '#ef5350' };
    const categoryColors = { note: '#d29922', warning: '#f85149', info: '#58a6ff' };
    const list = document.getElementById(listIdMap[type]);
    if (!list) return;
    list.innerHTML = '';

    const items = type === 'signals'
        ? state.data.signals.filter(s => s.dir === state.direction || s.dir === 'both')
        : state.data[type];

    items.forEach(item => {
        const label = renderLabel(type, item);
        const color = renderColor(type, item, typeColors, categoryColors);
        const row = document.createElement('div');
        row.className = 'item-row' + (state.selectedId === item.id ? ' selected' : '');
        row.innerHTML = `<span class="item-color" style="background:${color}"></span><span class="item-label">${label}</span>`;
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        const del = document.createElement('button');
        del.className = 'btn btn-danger';
        del.textContent = '✕';
        del.onclick = (e) => {
            e.stopPropagation();
            saveSnapshot();
            state.data[type] = state.data[type].filter(x => x.id !== item.id);
            if (state.selectedId === item.id) closeSelectedEditor();
            refreshEditorList(type); draw();
        };
        actions.appendChild(del);
        row.appendChild(actions);
        row.onclick = () => selectItem(type, item.id, true);
        list.appendChild(row);
    });
}

function renderColor(type, item, typeColors, categoryColors) {
    if (type === 'stations') return '#66bb6a';
    if (type === 'signals') return typeColors[item.type] || '#8b949e';
    if (type === 'elevations') return '#ef5350';
    if (type === 'slopes') return item.direction === 'up' ? '#ffa726' : '#42a5f5';
    if (type === 'curves') return '#58a6ff';
    if (type === 'recommendations') return categoryColors[item.category] || '#d29922';
    if (type === 'speedLimits') return '#d29922';
    if (type === 'crossings') return '#e53935';
    return '#8b949e';
}

function renderLabel(type, item) {
    if (type === 'stations') return `${item.name} · ${formatPos(item.position)}`;
    if (type === 'signals') return `${item.label} · ${formatPos(item.position)}${item.station ? ' · ' + item.station : ''}`;
    if (type === 'elevations') return `${formatPos(item.position)} → <b>${item.y}м</b>`;
    if (type === 'slopes') return `${formatPos(item.startPos)}→${formatPos(item.endPos)} · <b>${item.gradient}‰ ${item.direction === 'up' ? '↑' : '↓'}</b>`;
    if (type === 'curves') {
        const dirIcon = item.curveDir === 'left' ? '←' : '→';
        return `${formatPos(item.startPos)}→${formatPos(item.endPos)} · ${item.type === 'curve' ? 'R=' + item.radius + ' ' + dirIcon : 'прямая'}`;
    }
    if (type === 'recommendations') {
        const preview = item.text.substring(0, 30) + (item.text.length > 30 ? '...' : '');
        return `${formatPos(item.startPos)}→${formatPos(item.endPos)} · ${preview}`;
    }
    if (type === 'speedLimits') {
        const remark = item.remark ? ` · ${item.remark}` : '';
        return `${formatPos(item.startPos)}→${formatPos(item.endPos)} · <b>${item.speed} км/ч</b>${remark}`;
    }
    if (type === 'crossings') {
        return `${formatPos(item.position)}${item.label ? ' · ' + item.label : ''}`;
    }
    return '';
}

function refreshCurrentList() {
    const activeTab = document.querySelector('.editor-tab.active').dataset.tab;
    refreshEditorList(activeTab);
}

// ============================================================
// DIRECTION FLIP
// ============================================================
document.getElementById('flipBtn').addEventListener('click', () => {
    // Запомнить центр видимой области в километрах до флипа
    const visibleWidth = canvasWrap.clientWidth;
    const centerX = canvasWrap.scrollLeft + visibleWidth / 2;
    const centerKm = xToPosition(centerX);

    state.direction = state.direction === 'odd' ? 'even' : 'odd';
    const badge = document.getElementById('dirBadge');
    const routeName = document.getElementById('routeName');
    if (state.direction === 'odd') {
            badge.textContent = 'НЕЧЁТНОЕ';
            badge.className = 'direction-badge odd';
            routeName.textContent = '';
        } else {
            badge.textContent = 'ЧЁТНОЕ';
            badge.className = 'direction-badge even';
            routeName.textContent = '';
        }
    refreshEditorList('signals');
    draw();

    // Восстановить позицию — прокрутить к тому же км
    const newX = positionToX(centerKm);
    canvasWrap.scrollLeft = Math.max(0, newX - visibleWidth / 2);
});

// ============================================================
// ZOOM
// ============================================================
document.getElementById('zoomInBtn').addEventListener('click', () => {
    state.pxPerPK = Math.min(state.pxPerPK + 2, 30);
    updateZoomLabel(); draw();
});
document.getElementById('zoomOutBtn').addEventListener('click', () => {
    state.pxPerPK = Math.max(state.pxPerPK - 2, 4);
    updateZoomLabel(); draw();
});
document.getElementById('zoomResetBtn').addEventListener('click', () => {
    state.pxPerPK = 12;
    updateZoomLabel(); draw();
});
function updateZoomLabel() {
    document.getElementById('zoomLabel').textContent = `1 ПК = ${state.pxPerPK}px`;
}

// ============================================================
// ROUTE PRESETS
// ============================================================
// ============================================================
// ROUTE PRESETS (loaded from routes.json)
// ============================================================
let ROUTES_DATA = null;
let CURRENT_ROUTE_ID = null;

function loadRoute(routeId) {
    const route = ROUTES_DATA && ROUTES_DATA.routes[routeId];
    if (!route) return;
    state.importedFromFile = false;
    CURRENT_ROUTE_ID = routeId;
    saveSnapshot();
    loadDemo();
    state.direction = route.direction;
    state.startKm = route.startKm;
    state.endKm = route.endKm;
    route.stations.forEach(st => {
        state.data.stations.push({ id: newId(), ...st });
    });
    state.data.stations.sort((a, b) => a.position - b.position);
    const badge = document.getElementById('dirBadge');
    if (state.direction === 'odd') {
        badge.textContent = 'НЕЧЁТНОЕ';
        badge.className = 'direction-badge odd';
    } else {
        badge.textContent = 'ЧЁТНОЕ';
        badge.className = 'direction-badge even';
    }
    ['stations','signals','elevations','slopes','curves','crossings','recommendations','speedLimits'].forEach(refreshEditorList);
    closeSelectedEditor();
    updateStats();
    draw();
    document.getElementById('statusText').innerHTML = `✅ Маршрут: ${route.name}`;

    // Auto-load sample data if available
    if (ROUTES_DATA && ROUTES_DATA.sampleData && ROUTES_DATA.sampleData[routeId]) {
        loadTestData(routeId);
    }
}

function loadTestData(routeId) {
    if (!ROUTES_DATA || !ROUTES_DATA.sampleData) return;
    const data = ROUTES_DATA.sampleData[routeId];
    if (!data) return;
    saveSnapshot();
    // Merge sample data into current state
    const types = ['elevations', 'signals', 'slopes', 'curves', 'crossings', 'recommendations', 'speedLimits'];
    types.forEach(type => {
        if (data[type]) {
            data[type].forEach(item => {
                state.data[type].push({ id: newId(), ...item });
            });
            if (['elevations', 'slopes', 'curves', 'speedLimits'].includes(type)) {
                state.data[type].sort((a, b) => (a.startPos || a.position) - (b.startPos || b.position));
            }
        }
    });
    // Also override stations with route data if available
    types.forEach(refreshEditorList);
    draw();
    updateStats();
    document.getElementById('statusText').innerHTML = '✅ Данные маршрута загружены';
}

document.getElementById('routeSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    e.target.value = '';
    if (ROUTES_DATA) {
        loadRoute(val);
    } else {
        // Defer — routes.json hasn't loaded yet
        document.getElementById('statusText').innerHTML = '⏳ Загрузка маршрутов...';
        const checkLoaded = setInterval(() => {
            if (ROUTES_DATA) {
                clearInterval(checkLoaded);
                loadRoute(val);
            }
        }, 200);
    }
});

// Fetch routes.json on load
fetch('routes.json').then(r => r.json()).then(data => {
    ROUTES_DATA = data;
}).catch(err => {
    console.warn('Failed to load routes.json:', err);
    document.getElementById('statusText').innerHTML = '⚠ Ошибка загрузки routes.json';
});

// ============================================================
// AMOLED THEME TOGGLE
// ============================================================
document.getElementById('amoledBtn').addEventListener('click', () => {
    isAmoled = !isAmoled;
    document.body.classList.toggle('amoled', isAmoled);
    document.getElementById('amoledBtn').textContent = isAmoled ? '☀️' : '🌙';
    draw();
});

// ============================================================
// UNDO/REDO KEYBOARD
// ============================================================
document.addEventListener('keydown', (e) => {
    // Не перехватывать, если фокус в поле ввода (нативный Ctrl+Z/Y в input)
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y' || e.key === 'Z')) return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Z') {
        e.preventDefault();
        redo();
    }
    // Delete/Backspace — удалить выделенный элемент
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey) {
        if (tag === 'INPUT' || tag === 'TEXTAREA') return; // native delete in input
        if (state.selectedId && state.selectedType) {
            e.preventDefault();
            const type = state.selectedType;
            const item = findItemById(type, state.selectedId);
            if (!item) return;
            saveSnapshot();
            state.data[type] = state.data[type].filter(x => x.id !== item.id);
            closeSelectedEditor();
            refreshEditorList(type);
            draw();
        }
    }
});

// ============================================================
// SAVE / LOAD / EXPORT
// ============================================================

// localStorage key
const STORAGE_KEY = 'railway_track_profile_data';

function saveToLocalStorage() {
    try {
        const data = {
            _version: '0.0.1',
            _savedAt: new Date().toISOString(),
            ...state.data
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('localStorage save failed:', e);
    }
}

function loadFromLocalStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        // Strip meta fields
        delete parsed._version;
        delete parsed._savedAt;
        // Validate basic structure
        const required = ['stations','signals','elevations','slopes','curves','recommendations'];
        const optional = ['speedLimits', 'crossings'];
        for (const key of required) {
            if (!Array.isArray(parsed[key])) return false;
        }
        for (const key of optional) {
            if (!Array.isArray(parsed[key])) parsed[key] = [];
        }
        state.data = parsed;
        return true;
    } catch (e) {
        return false;
    }
}

function clearLocalStorage() {
    localStorage.removeItem(STORAGE_KEY);
}

function buildExportData() {
    return {
        _version: '0.0.1',
        _exportedAt: new Date().toISOString(),
        ...state.data
    };
}

// Export — download as JSON file
document.getElementById('exportBtn').addEventListener('click', () => {
    const json = JSON.stringify(buildExportData(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `track_profile_${state.direction}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

// Import — load from JSON file
document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importInput').click();
});

document.getElementById('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);
            const required = ['stations','signals','elevations','slopes','curves','recommendations','speedLimits','crossings'];
                        for (const key of required) {
                            if (!Array.isArray(parsed[key])) {
                                throw new Error(`Файл повреждён: нет массива "${key}"`);
                            }
                        }
                        state.data = {
                            stations: parsed.stations,
                            signals: parsed.signals,
                            elevations: parsed.elevations,
                            slopes: parsed.slopes,
                            curves: parsed.curves,
                            recommendations: parsed.recommendations,
                            speedLimits: parsed.speedLimits || [],
                            crossings: parsed.crossings || []
                        };
                        state.importedFromFile = true;
                        CURRENT_ROUTE_ID = null;
                        saveSnapshot();
                        saveToLocalStorage();
                        ['stations','signals','elevations','slopes','curves','recommendations','speedLimits','crossings'].forEach(refreshEditorList);
            draw();
            updateStats();
            document.getElementById('statusText').innerHTML = '✅ Загружено из файла';
            setTimeout(() => updateStats(), 100);
        } catch (err) {
            showValidationError('Ошибка загрузки: ' + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be re-imported
});

// Save — explicitly save to localStorage
document.getElementById('saveBtn').addEventListener('click', () => {
    saveToLocalStorage();
    document.getElementById('statusText').innerHTML = '✅ Сохранено';
    setTimeout(() => updateStats(), 100);
});

// ============================================================
// STATS
// ============================================================
function updateStats() {
    document.getElementById('statPts').textContent = state.data.elevations.length;
    document.getElementById('statSt').textContent = state.data.stations.length;
    const sigCount = state.data.signals.filter(s => s.dir === state.direction || s.dir === 'both').length;
    document.getElementById('statSg').textContent = sigCount;
    document.getElementById('statSp').textContent = state.data.speedLimits.length;
    document.getElementById('statCr').textContent = state.data.crossings.length;
    updateRouteLabel();
    updateRangeLabel();
    // Update data source indicator in status bar
    const sourceEl = document.getElementById('dataSource');
    if (sourceEl) {
        if (state.importedFromFile) {
            sourceEl.textContent = '📂 Файл';
            sourceEl.style.color = '#58a6ff';
        } else if (CURRENT_ROUTE_ID) {
            const route = ROUTES_DATA && ROUTES_DATA.routes[CURRENT_ROUTE_ID];
            sourceEl.textContent = route ? route.name : '🗺 Маршрут';
            sourceEl.style.color = '#d29922';
        } else if (state.data.stations.length) {
            sourceEl.textContent = '💾 Сохр.';
            sourceEl.style.color = '#8b949e';
        } else {
            sourceEl.textContent = '⚡ Новый';
            sourceEl.style.color = '#8b949e';
        }
    }
}

// ============================================================
// INIT — auto-load track_profile_odd.json
// ============================================================
fetch('track_profile_odd.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(parsed => {
        const required = ['stations', 'signals', 'elevations', 'slopes', 'curves', 'recommendations', 'speedLimits', 'crossings'];
        for (const key of required) {
            if (!Array.isArray(parsed[key])) parsed[key] = [];
        }
        state.data = {
            stations: parsed.stations,
            signals: parsed.signals,
            elevations: parsed.elevations,
            slopes: parsed.slopes,
            curves: parsed.curves,
            recommendations: parsed.recommendations,
            speedLimits: parsed.speedLimits || [],
            crossings: parsed.crossings || []
        };
        state.importedFromFile = true;
        saveSnapshot();
        saveToLocalStorage();
        ['stations', 'signals', 'elevations', 'slopes', 'curves', 'crossings', 'recommendations', 'speedLimits'].forEach(refreshEditorList);
        draw();
        document.getElementById('statusText').innerHTML = '✅ Загружен track_profile_odd.json';
        setTimeout(() => updateStats(), 100);
    })
    .catch(err => {
        console.warn('Failed to load track_profile_odd.json, falling back to localStorage:', err);
        // Fallback to localStorage
        if (!loadFromLocalStorage()) {
            loadDemo();
        }
        saveSnapshot();
        document.getElementById('statusText').innerHTML = state.data.stations.length
            ? '✅ Восстановлено из сохранения'
            : '⚡ Новый профиль';
        ['stations', 'signals', 'elevations', 'slopes', 'curves', 'crossings', 'recommendations', 'speedLimits'].forEach(refreshEditorList);
        draw();
    });

// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        console.log('SW registered:', reg.scope);
    }).catch(err => {
        console.warn('SW registration failed:', err);
    });
}