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
    data: {
        stations: [],
        signals: [],
        elevations: [],
        slopes: [],
        curves: [],
        recommendations: [],
        speedLimits: []
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
}

// ============================================================
// UNDO / REDO
// ============================================================
const history = { stack: [], index: -1, maxSize: 50 };

function saveSnapshot() {
    if (history.index < history.stack.length - 1) {
        history.stack = history.stack.slice(0, history.index + 1);
    }
    history.stack.push(JSON.parse(JSON.stringify(state.data)));
    if (history.stack.length > history.maxSize) history.stack.shift();
    history.index = history.stack.length - 1;
    saveToLocalStorage();
}

function undo() {
    if (history.index <= 0) return;
    history.index--;
    state.data = JSON.parse(JSON.stringify(history.stack[history.index]));
    state.selectedId = null; state.selectedType = null;
    closeSelectedEditor();
    ['stations', 'signals', 'elevations', 'slopes', 'curves', 'recommendations', 'speedLimits'].forEach(refreshEditorList);
    draw();
}

function redo() {
    if (history.index >= history.stack.length - 1) return;
    history.index++;
    state.data = JSON.parse(JSON.stringify(history.stack[history.index]));
    state.selectedId = null; state.selectedType = null;
    closeSelectedEditor();
    ['stations', 'signals', 'elevations', 'slopes', 'curves', 'recommendations', 'speedLimits'].forEach(refreshEditorList);
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
const PROFILE_HEIGHT = 180;
const KM_AXIS_HEIGHT = 50;   // horizontal axis with km/pk — placed BELOW profile
const PLAN_HEIGHT = 70;
const SLOPE_HEIGHT = 50;
const SPEED_HEIGHT = 24;
const SECTION_GAP = 30;

// Y positions of each section
function sectionY() {
    const profileTop = MARGIN.top;
    const profileBottom = profileTop + PROFILE_HEIGHT;
    const axisTop = profileBottom;
    const axisBottom = axisTop + KM_AXIS_HEIGHT;
    const planTop = axisBottom + SECTION_GAP;
    const planBottom = planTop + PLAN_HEIGHT;
    const slopeTop = planBottom + SECTION_GAP;
    const slopeBottom = slopeTop + SLOPE_HEIGHT;
    const speedTop = slopeBottom + SECTION_GAP;
    const speedBottom = speedTop + SPEED_HEIGHT;
    return { profileTop, profileBottom, axisTop, axisBottom, planTop, planBottom, slopeTop, slopeBottom, speedTop, speedBottom };
}

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
    drawRecommendations(sy);
    drawSpeedLimits(sy);
    drawDirectionArrow(sy);

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
        [sy.profileTop, sy.profileBottom, sy.axisBottom, sy.planBottom, sy.slopeBottom, sy.speedBottom].forEach(y => {
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
        ctx.fillText('ПЛАН ПУТИ', 10, sy.planTop + 16);
        ctx.fillText('УКЛОНЫ', 10, sy.slopeTop + 16);
        ctx.fillStyle = theme.sectionLabel;
        ctx.font = '10px Segoe UI';
        ctx.textAlign = 'left';
        ctx.fillText('СКОРОСТИ', 10, sy.speedTop + 16);
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
        const y = sy.profileBottom - padding - normalizedY * (PROFILE_HEIGHT - 2 * padding);
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
            const y = sy.profileBottom - padding - normalizedY * (PROFILE_HEIGHT - 2 * padding);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Points
        elevations.forEach(pt => {
            const x = positionToX(pt.position);
            const normalizedY = (pt.y - minY) / rangeY;
            const y = sy.profileBottom - padding - normalizedY * (PROFILE_HEIGHT - 2 * padding);
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

    // Y axis labels
    ctx.fillStyle = '#8b949e';
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'right';
    for (let v = Math.ceil(minY); v <= Math.floor(maxY); v++) {
        const normalizedY = (v - minY) / rangeY;
        const y = sy.profileBottom - padding - normalizedY * (PROFILE_HEIGHT - 2 * padding);
        ctx.fillText(v + 'м', MARGIN.left - 8, y + 3);
        ctx.strokeStyle = '#161b22';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(MARGIN.left + (state.endKm - state.startKm) * 10 * state.pxPerPK, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.textAlign = 'left';
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
    state.data.slopes.forEach(slope => {
        let x1 = positionToX(slope.startPos);
        let x2 = positionToX(slope.endPos);
        if (x2 < x1) { const t = x1; x1 = x2; x2 = t; }

        const isSelected = state.selectedId === slope.id;

        ctx.fillStyle = slope.direction === 'up' ? 'rgba(255, 167, 38, 0.15)' : 'rgba(66, 165, 245, 0.15)';
        ctx.fillRect(x1, sy.slopeTop + 5, x2 - x1, SLOPE_HEIGHT - 15);

        ctx.strokeStyle = isSelected ? '#58a6ff' : (slope.direction === 'up' ? '#ffa726' : '#42a5f5');
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(x1, sy.slopeTop + 5, x2 - x1, SLOPE_HEIGHT - 15);

        const midX = (x1 + x2) / 2;
        ctx.fillStyle = slope.direction === 'up' ? '#ffa726' : '#42a5f5';
        ctx.font = 'bold 11px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(slope.gradient + '‰', midX, sy.slopeTop + 22);
        ctx.font = '12px Segoe UI';
        ctx.fillText(slope.direction === 'up' ? '↑' : '↓', midX, sy.slopeTop + 36);
        ctx.textAlign = 'left';
    });
}

function drawPlanPath(sy) {
    const baseY = sy.planTop + PLAN_HEIGHT / 2;

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
        ctx.fillRect(xStart, sy.profileTop, xEnd - xStart, PROFILE_HEIGHT);

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

        // Station label
        ctx.font = 'bold 11px Segoe UI';
        const labelWidth = Math.max(ctx.measureText(station.name).width + 20, 80);
        const labelX = x - labelWidth / 2;
        const labelY = sy.profileTop - 38;

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
        const y = yBase + PROFILE_HEIGHT - 20;
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

function drawRecommendations(sy) {
    const recs = state.data.recommendations;
    const categoryColors = {
        note: '#d29922',
        warning: '#f85149',
        restriction: '#a371f7',
        info: '#58a6ff'
    };
    const categoryIcons = { note: '📝', warning: '⚠', restriction: '🚧', info: 'ℹ' };
    const speedColors = { red: '#ef5350', blue: '#42a5f5' };

    recs.forEach(rec => {
        const x1 = positionToX(rec.startPos);
        const x2 = positionToX(rec.endPos);
        const y = sy.profileTop + 12;
        const color = categoryColors[rec.category] || '#d29922';
        const isSelected = state.selectedId === rec.id;
        const bandHeight = 4;

        // Background band
        const alpha = isSelected ? 0.25 : 0.12;
        ctx.fillStyle = color.replace(')', `,${alpha})`).replace('rgb', 'rgba');
        if (!color.includes('rgba')) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
        }
        const bx1 = Math.min(x1, x2), bx2 = Math.max(x1, x2);
        ctx.fillRect(bx1, y, bx2 - bx1 || 2, bandHeight);
        ctx.globalAlpha = 1;

        // Segment outline
        ctx.strokeStyle = isSelected ? '#ffffff' : color;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.setLineDash(rec.category === 'warning' ? [4, 3] : []);
        ctx.strokeRect(bx1, y, bx2 - bx1 || 2, bandHeight);
        ctx.setLineDash([]);

        // End marks
        [bx1, bx2].forEach(mx => {
            ctx.fillStyle = color;
            ctx.fillRect(mx - 1, y - 2, 2, bandHeight + 4);
        });

        // Icon + text label — always visible
        const midX = (bx1 + bx2) / 2;
        const labelY = y - 12;
        const text = rec.text.length > 35 ? rec.text.substring(0, 32) + '…' : rec.text;
        const rangeStr = formatPos(rec.startPos) + ' → ' + formatPos(rec.endPos);

        // Text background
        ctx.font = 'bold 10px Segoe UI';
        const tw = ctx.measureText(text).width;
        const rw = ctx.measureText(rangeStr).width;
        const labelW = Math.max(tw, rw) + 24;
        const lx = Math.max(MARGIN.left, Math.min(midX - labelW / 2, bx1 + (bx2 - bx1) / 2 - labelW / 2));
        const ly = labelY - 20;

        ctx.fillStyle = theme.recBg;
        roundRect(ctx, lx, ly, labelW, 38, 4);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 1.5 : 0.5;
        roundRect(ctx, lx, ly, labelW, 38, 4);
        ctx.stroke();

        // Range line
        ctx.fillStyle = theme.axisLabel;
        ctx.font = '8px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(rangeStr, lx + labelW / 2, ly + 11);

        // Icon
        ctx.font = '10px Segoe UI';
        ctx.fillStyle = color;
        ctx.fillText(categoryIcons[rec.category] + ' ' + text, lx + 10, ly + 26);

        // Speed badge for restrictions
        if (rec.category === 'restriction' && rec.speed) {
            const sc = speedColors[rec.speedColor] || '#ef5350';
            const badgeText = rec.speed + ' км/ч';
            ctx.font = 'bold 9px Consolas, monospace';
            const bw = ctx.measureText(badgeText).width + 10;
            const bx = lx + labelW + 4;

            ctx.fillStyle = sc;
            roundRect(ctx, bx, ly + 2, bw, 16, 8);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(badgeText, bx + bw / 2, ly + 14);

            // Color stripe on the rail band
            ctx.fillStyle = sc;
            ctx.globalAlpha = 0.5;
            ctx.fillRect(bx1, y + bandHeight + 1, bx2 - bx1 || 2, 3);
            ctx.globalAlpha = 1;
        }

        // Selection highlight
        if (isSelected) {
            ctx.strokeStyle = '#58a6ff';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(midX, y, 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.textAlign = 'left';
    });
}

function drawSpeedLimits(sy) {
    const limits = state.data.speedLimits;
    if (!limits.length) return;

    function speedColor(speed) {
        if (speed >= 120) return '#2ea043';
        if (speed >= 80) return '#d29922';
        if (speed >= 40) return '#ffa726';
        return '#ef5350';
    }

    const bandH = SPEED_HEIGHT - 8;
    const y = sy.speedTop + 4;
    const baseX1 = MARGIN.left;
    const baseX2 = MARGIN.left + (state.endKm - state.startKm) * 10 * state.pxPerPK;

    // Background track
    ctx.fillStyle = isAmoled ? '#050505' : '#161b22';
    ctx.fillRect(baseX1, y, baseX2 - baseX1, bandH);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(baseX1, y, baseX2 - baseX1, bandH);

    limits.forEach(limit => {
        const x1 = positionToX(limit.startPos);
        const x2 = positionToX(limit.endPos);
        if (x2 <= x1) return;
        const color = speedColor(limit.speed);
        const isSelected = state.selectedId === limit.id;

        // Colored bar
        const alpha = isSelected ? 0.5 : 0.7;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(x1, y, x2 - x1, bandH);
        ctx.globalAlpha = 1;

        // Border between segments
        ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = isSelected ? 2 : 0.5;
        ctx.strokeRect(x1, y, x2 - x1, bandH);

        // Speed label (if wide enough)
        if (x2 - x1 > 40) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(limit.speed + ' км/ч', (x1 + x2) / 2, y + 14);
            ctx.textAlign = 'left';
        }

        // Selection ring
        if (isSelected) {
            ctx.strokeStyle = '#58a6ff';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.arc((x1 + x2) / 2, y + bandH / 2, bandH + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });
}

function drawDirectionArrow(sy) {
    const y = sy.profileTop - 55;
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
    return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}

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
        const y = sy.profileBottom - padding - normalizedY * (PROFILE_HEIGHT - 2 * padding);
        if (Math.hypot(mx - x, my - y) < 8) return pt;
    }
    return null;
}

function findSignalAt(mx, my) {
    const signals = state.data.signals.filter(s => s.dir === state.direction || s.dir === 'both');
    const sy = sectionY();
    for (const sig of signals) {
        const x = positionToX(sig.position);
        const y = sy.profileTop + PROFILE_HEIGHT - 20;
        if (Math.hypot(mx - x, my - y) < 12) return sig;
    }
    return null;
}

function findStationAt(mx, my) {
    const sy = sectionY();
    for (const st of state.data.stations) {
        const x = positionToX(st.position);
        const labelY = sy.profileTop - 38;
        if (mx > x - 60 && mx < x + 60 && my > labelY && my < labelY + 22) return st;
    }
    return null;
}

function findRecommendationAt(mx, my) {
    const sy = sectionY();
    for (const rec of state.data.recommendations) {
        const x1 = positionToX(rec.startPos);
        const x2 = positionToX(rec.endPos);
        const y = sy.profileTop + 12;
        const bx1 = Math.min(x1, x2), bx2 = Math.max(x1, x2);
        if (mx >= bx1 - 5 && mx <= bx2 + 5 && my >= y - 6 && my <= y + 10) return rec;
    }
    return null;
}

function findSpeedLimitAt(mx, my) {
    const sy = sectionY();
    const bandH = SPEED_HEIGHT - 8;
    const y = sy.speedTop + 4;
    for (const limit of state.data.speedLimits) {
        const x1 = positionToX(limit.startPos);
        const x2 = positionToX(limit.endPos);
        const bx1 = Math.min(x1, x2), bx2 = Math.max(x1, x2);
        if (mx >= bx1 - 3 && mx <= bx2 + 3 && my >= y - 3 && my <= y + bandH + 3) return limit;
    }
    return null;
}

canvas.addEventListener('mousedown', (e) => {
    if (!state.editMode) return;
    const { x, y } = getMousePos(e);
    const pt = findElevationAt(x, y);
    if (pt) {
        state.dragging = pt;
        // Заморозить ось Y на момент начала перетаскивания
        const elevations = state.data.elevations;
        const ys = elevations.map(e => e.y);
        state.dragAxisMin = Math.min(...ys) - 1;
        state.dragAxisMax = Math.max(...ys) + 1;
        selectItem('elevations', pt.id, false);
        canvas.style.cursor = 'grabbing';
    }
});

canvas.addEventListener('mousemove', (e) => {
    const { x, y } = getMousePos(e);

    if (state.dragging) {
        const newPos = xToPosition(x);
        const clamped = Math.max(state.startKm, Math.min(state.endKm, newPos));
        // Snap to 1m precision
        state.dragging.position = Math.round(clamped * 1000) / 1000;

        const sy = sectionY();
        const padding = 20;
        const axisMin = state.dragAxisMin;
        const axisMax = state.dragAxisMax;
        const rangeY = (axisMax - axisMin) || 1;
        const normalizedY = Math.min(1, Math.max(0, 1 - (y - (sy.profileTop + padding)) / (PROFILE_HEIGHT - 2 * padding)));
        state.dragging.y = Math.round((axisMin + normalizedY * rangeY) * 10) / 10;
        draw();
        updateSelectedEditorFields();
        return;
    }

    if (state.editMode) {
        const pt = findElevationAt(x, y);
        const sig = !pt ? findSignalAt(x, y) : null;
        const st = !pt && !sig ? findStationAt(x, y) : null;
        const rec = !pt && !sig && !st ? findRecommendationAt(x, y) : null;
        const sp = !pt && !sig && !st && !rec ? findSpeedLimitAt(x, y) : null;
        canvas.style.cursor = (pt || sig || st || rec || sp) ? 'pointer' : 'crosshair';

        const tooltip = document.getElementById('tooltip');
        if (pt) {
            tooltip.innerHTML = `<b>Точка рельефа</b><div class="tt-row"><span>Позиция:</span><span class="tt-val">${formatPos(pt.position)}</span></div><div class="tt-row"><span>Высота:</span><span class="tt-val">${pt.y} м</span></div>`;
            showTooltip(e, tooltip);
        } else if (sig) {
            tooltip.innerHTML = `<b>Сигнал ${sig.label}</b><div class="tt-row"><span>Позиция:</span><span class="tt-val">${formatPos(sig.position)}</span></div>${sig.station ? `<div class="tt-row"><span>Станция:</span><span class="tt-val">${sig.station}</span></div>` : ''}`;
            showTooltip(e, tooltip);
        } else if (st) {
            tooltip.innerHTML = `<b>${st.name}</b><div class="tt-row"><span>Позиция:</span><span class="tt-val">${formatPos(st.position)}</span></div><div class="tt-row"><span>Границы:</span><span class="tt-val">${formatPos(st.start)} — ${formatPos(st.end)}</span></div>`;
            showTooltip(e, tooltip);
        } else if (rec) {
            tooltip.innerHTML = `<b>Рекомендация</b><div class="tt-row"><span>От:</span><span class="tt-val">${formatPos(rec.startPos)}</span></div><div class="tt-row"><span>До:</span><span class="tt-val">${formatPos(rec.endPos)}</span></div><div style="margin-top:4px;color:#c9d1d9;">${rec.text}</div>`;
            showTooltip(e, tooltip);
        } else if (sp) {
            tooltip.innerHTML = `<b>Ограничение скорости</b><div class="tt-row"><span>От:</span><span class="tt-val">${formatPos(sp.startPos)}</span></div><div class="tt-row"><span>До:</span><span class="tt-val">${formatPos(sp.endPos)}</span></div><div class="tt-row"><span>Скорость:</span><span class="tt-val">${sp.speed} км/ч</span></div>${sp.remark ? `<div style="margin-top:4px;color:#c9d1d9;">${sp.remark}</div>` : ''}`;
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
        state.dragging = null;
        canvas.style.cursor = state.editMode ? 'crosshair' : 'default';
        state.data.elevations.sort((a, b) => a.position - b.position);
        draw();
        refreshEditorList('elevations');
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
        const rec = findRecommendationAt(x, y);
        if (rec) { selectItem('recommendations', rec.id, true); return; }
        const sp = findSpeedLimitAt(x, y);
        if (sp) { selectItem('speedLimits', sp.id, true); return; }

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
                const normalizedY = Math.min(1, Math.max(0, 1 - (y - (sy.profileTop + padding)) / (PROFILE_HEIGHT - 2 * padding)));
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

// ПКМ — удалить выделенный элемент
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!state.selectedId || !state.selectedType) return;
    const type = state.selectedType;
    const item = findItemById(type, state.selectedId);
    if (!item) return;
    saveSnapshot();
    state.data[type] = state.data[type].filter(x => x.id !== item.id);
    closeSelectedEditor();
    refreshEditorList(type);
    draw();
});

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
            if (type === 'elevations' || type === 'signals' || type === 'recommendations') {
                x = positionToX(item.position);
            } else if (type === 'stations') {
                x = positionToX(item.position);
            } else if (type === 'slopes' || type === 'curves' || type === 'speedLimits') {
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
    ['stations', 'signals', 'elevations', 'slopes', 'curves', 'recommendations', 'speedLimits'].forEach(t => {
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
            document.getElementById('sel-rc-speed').value = item.speed || '';
            document.getElementById('sel-rc-speed-color').value = item.speedColor || 'red';
        } else if (t === 'speedLimits') {
            const s = fromPos(item.startPos);
            const e = fromPos(item.endPos);
            document.getElementById('sel-sp-start-km').value = s.km;
            document.getElementById('sel-sp-start-m').value = s.m;
            document.getElementById('sel-sp-end-km').value = e.km;
            document.getElementById('sel-sp-end-m').value = e.m;
            document.getElementById('sel-sp-speed').value = item.speed || 60;
            document.getElementById('sel-sp-remark').value = item.remark || '';
        }
}

function closeSelectedEditor() {
    state.selectedId = null;
    state.selectedType = null;
    ['stations', 'signals', 'elevations', 'slopes', 'curves', 'recommendations', 'speedLimits'].forEach(t => {
        document.getElementById('sel-' + t).classList.remove('active');
    });
    refreshCurrentList();
    draw();
}

// Save handlers
function setupSaveHandler(type, fieldMap) {
    document.querySelector(`[data-save="${type}"]`).addEventListener('click', () => {
            const item = findItemById(type, state.selectedId);
            if (!item) return;
            saveSnapshot();
            fieldMap.forEach(([inputId, field, parser]) => {
            const val = document.getElementById(inputId).value;
            item[field] = parser ? parser(val) : val;
        });
        // Sort
        if (type === 'elevations') state.data.elevations.sort((a, b) => a.position - b.position);
        else if (type === 'slopes') state.data.slopes.sort((a, b) => a.startPos - b.startPos);
        else if (type === 'curves') state.data.curves.sort((a, b) => a.startPos - b.startPos);
        else if (type === 'stations') state.data.stations.sort((a, b) => a.position - b.position);
        refreshEditorList(type);
        draw();
    });
    document.querySelector(`[data-cancel="${type}"]`).addEventListener('click', closeSelectedEditor);
    document.querySelector(`[data-close="${type}"]`).addEventListener('click', closeSelectedEditor);
}

setupSaveHandler('stations', [
    ['sel-st-name', 'name'],
    ['sel-st-km', '_km', parseInt],
    ['sel-st-m', '_m', parseInt],
    ['sel-st-start-km', '_skm', parseInt],
    ['sel-st-start-m', '_sm', parseInt],
    ['sel-st-end-km', '_ekm', parseInt],
    ['sel-st-end-m', '_em', parseInt]
]);
// Post-process for stations (combine km+m)
document.querySelector('[data-save="stations"]').addEventListener('click', () => {
    const item = findItemById('stations', state.selectedId);
    if (!item) return;
    saveSnapshot();
    item.position = toPos(item._km, item._m);
    item.start = toPos(item._skm, item._sm);
    item.end = toPos(item._ekm, item._em);
    delete item._km; delete item._m; delete item._skm; delete item._sm; delete item._ekm; delete item._em;
    state.data.stations.sort((a, b) => a.position - b.position);
    refreshEditorList('stations');
    draw();
});

setupSaveHandler('signals', [
    ['sel-sg-label', 'label'],
        ['sel-sg-type', 'type'],
        ['sel-sg-dir', 'dir'],
        ['sel-sg-km', '_km', parseInt],
        ['sel-sg-m', '_m', parseInt]
]);
document.querySelector('[data-save="signals"]').addEventListener('click', () => {
    const item = findItemById('signals', state.selectedId);
    if (!item) return;
    saveSnapshot();
    item.position = toPos(item._km, item._m);
    delete item._km; delete item._m;
    refreshEditorList('signals');
    draw();
});

setupSaveHandler('elevations', [
    ['sel-el-km', '_km', parseInt],
    ['sel-el-m', '_m', parseInt],
    ['sel-el-y', 'y', parseFloat]
]);
document.querySelector('[data-save="elevations"]').addEventListener('click', () => {
    const item = findItemById('elevations', state.selectedId);
    if (!item) return;
    saveSnapshot();
    item.position = toPos(item._km, item._m);
    delete item._km; delete item._m;
    state.data.elevations.sort((a, b) => a.position - b.position);
    refreshEditorList('elevations');
    draw();
});

setupSaveHandler('slopes', [
    ['sel-sl-start-km', '_skm', parseInt],
    ['sel-sl-start-m', '_sm', parseInt],
    ['sel-sl-end-km', '_ekm', parseInt],
    ['sel-sl-end-m', '_em', parseInt],
    ['sel-sl-grad', 'gradient', parseInt],
    ['sel-sl-dir', 'direction']
]);
document.querySelector('[data-save="slopes"]').addEventListener('click', () => {
    const item = findItemById('slopes', state.selectedId);
    if (!item) return;
    saveSnapshot();
    item.startPos = toPos(item._skm, item._sm);
    item.endPos = toPos(item._ekm, item._em);
    delete item._skm; delete item._sm; delete item._ekm; delete item._em;
    state.data.slopes.sort((a, b) => a.startPos - b.startPos);
    refreshEditorList('slopes');
    draw();
});

setupSaveHandler('curves', [
    ['sel-cv-start-km', '_skm', parseInt],
    ['sel-cv-start-m', '_sm', parseInt],
    ['sel-cv-end-km', '_ekm', parseInt],
    ['sel-cv-end-m', '_em', parseInt],
    ['sel-cv-type', 'type'],
    ['sel-cv-radius', 'radius', parseInt],
    ['sel-cv-dir', 'curveDir']
]);
document.querySelector('[data-save="curves"]').addEventListener('click', () => {
    const item = findItemById('curves', state.selectedId);
    if (!item) return;
    saveSnapshot();
    item.startPos = toPos(item._skm, item._sm);
    item.endPos = toPos(item._ekm, item._em);
    delete item._skm; delete item._sm; delete item._ekm; delete item._em;
    state.data.curves.sort((a, b) => a.startPos - b.startPos);
    refreshEditorList('curves');
    draw();
});

setupSaveHandler('recommendations', [
    ['sel-rc-start-km', '_skm', parseInt],
    ['sel-rc-start-m', '_sm', parseInt],
    ['sel-rc-end-km', '_ekm', parseInt],
    ['sel-rc-end-m', '_em', parseInt],
    ['sel-rc-category', 'category'],
    ['sel-rc-text', 'text'],
    ['sel-rc-speed', 'speed', parseInt],
    ['sel-rc-speed-color', 'speedColor']
]);
document.querySelector('[data-save="recommendations"]').addEventListener('click', () => {
    const item = findItemById('recommendations', state.selectedId);
    if (!item) return;
    item.startPos = toPos(item._skm, item._sm);
    item.endPos = toPos(item._ekm, item._em);
    delete item._skm; delete item._sm; delete item._ekm; delete item._em;
    state.data.recommendations.sort((a, b) => a.startPos - b.startPos);
    refreshEditorList('recommendations');
    draw();
});

setupSaveHandler('speedLimits', [
    ['sel-sp-start-km', '_skm', parseInt],
    ['sel-sp-start-m', '_sm', parseInt],
    ['sel-sp-end-km', '_ekm', parseInt],
    ['sel-sp-end-m', '_em', parseInt],
    ['sel-sp-speed', 'speed', parseInt],
    ['sel-sp-remark', 'remark']
]);
document.querySelector('[data-save="speedLimits"]').addEventListener('click', () => {
    const item = findItemById('speedLimits', state.selectedId);
    if (!item) return;
    item.startPos = toPos(item._skm, item._sm);
    item.endPos = toPos(item._ekm, item._em);
    delete item._skm; delete item._sm; delete item._ekm; delete item._em;
    state.data.speedLimits.sort((a, b) => a.startPos - b.startPos);
    refreshEditorList('speedLimits');
    draw();
});

// ============================================================
// LEGEND TOGGLE
// ============================================================
document.getElementById('legendHeader').addEventListener('click', () => {
    document.getElementById('legend').classList.toggle('collapsed');
});

// ============================================================
// RESTRICTION FIELDS TOGGLE
// ============================================================
function toggleRestrictionFields() {
    const cat = document.getElementById('rc-category').value;
    document.getElementById('rc-restriction-fields').style.display = cat === 'restriction' ? 'flex' : 'none';
    const selCat = document.getElementById('sel-rc-category');
    if (selCat) {
        document.getElementById('sel-rc-restriction-fields').style.display = selCat.value === 'restriction' ? 'flex' : 'none';
    }
}
// Bind to sel-rc-category change too
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'sel-rc-category') {
        document.getElementById('sel-rc-restriction-fields').style.display = e.target.value === 'restriction' ? 'flex' : 'none';
    }
});
toggleRestrictionFields();

// ============================================================
// EDITOR PANEL
// ============================================================
const editorPanel = document.getElementById('editorPanel');
const editBtn = document.getElementById('editBtn');
const closeEditorBtn = document.getElementById('closeEditorBtn');

editBtn.addEventListener('click', () => {
    state.editMode = !state.editMode;
    editBtn.classList.toggle('active', state.editMode);
    editorPanel.classList.add('open');
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

document.getElementById('addElevBtn').addEventListener('click', () => {
    const pt = {
        id: newId(),
        position: readKmM('el-km', 'el-m'),
        y: parseFloat(document.getElementById('el-y').value)
    };
    state.data.elevations.push(pt);
        saveSnapshot();
        state.data.elevations.sort((a, b) => a.position - b.position);
        refreshEditorList('elevations');
        selectItem('elevations', pt.id, true);
});

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
        if (category === 'restriction') {
            rec.speed = parseInt(document.getElementById('rc-speed').value) || 60;
            rec.speedColor = document.getElementById('rc-speed-color').value;
        }
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

// ============================================================
// LISTS
// ============================================================
function refreshEditorList(type) {
    const listIdMap = {
        stations: 'stationsList', signals: 'signalsList', elevations: 'elevationsList',
        slopes: 'slopesList', curves: 'curvesList', recommendations: 'recommendationsList'
    };
    const typeColors = { passing: '#ffa726', input: '#66bb6a', maneuver: '#ab47bc', output: '#ef5350' };
    const categoryColors = { note: '#d29922', warning: '#f85149', restriction: '#a371f7', info: '#58a6ff' };
    const list = document.getElementById(listIdMap[type]);
    if (!list) return;
    list.innerHTML = '';

    const items = type === 'signals'
        ? state.data.signals.filter(s => s.dir === state.direction || s.dir === 'both')
        : state.data[type];

    items.forEach(item => {
        const label = renderLabel(type, item, typeColors, categoryColors);
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
    return '#8b949e';
}

function renderLabel(type, item, typeColors, categoryColors) {
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
const ROUTES = {
    'abdulino-kinel': {
        name: 'Абдулино → Кинель',
        direction: 'odd',
        startKm: 127,
        endKm: 154,
        stations: [
            { name: 'Абдулино', position: 127.5, start: 126.5, end: 128.5 },
            { name: 'Асекеево', position: 133.0, start: 131.8, end: 134.2 },
            { name: 'Бугуруслан', position: 140.3, start: 139.0, end: 141.8 },
            { name: 'Похвистнево', position: 146.7, start: 145.5, end: 148.0 },
            { name: 'Кинель', position: 153.2, start: 152.0, end: 154.0 }
        ]
    },
    'kinel-abdulino': {
        name: 'Кинель → Абдулино',
        direction: 'even',
        startKm: 127,
        endKm: 154,
        stations: [
            { name: 'Кинель', position: 153.2, start: 152.0, end: 154.0 },
            { name: 'Похвистнево', position: 146.7, start: 145.5, end: 148.0 },
            { name: 'Бугуруслан', position: 140.3, start: 139.0, end: 141.8 },
            { name: 'Асекеево', position: 133.0, start: 131.8, end: 134.2 },
            { name: 'Абдулино', position: 127.5, start: 126.5, end: 128.5 }
        ]
    },
    'ufa-chelyabinsk': {
        name: 'Уфа → Челябинск',
        direction: 'odd',
        startKm: 0,
        endKm: 40,
        stations: [
            { name: 'Уфа', position: 1.0, start: 0.0, end: 3.0 },
            { name: 'Аша', position: 12.5, start: 11.0, end: 14.0 },
            { name: 'Миньяр', position: 20.0, start: 18.5, end: 21.5 },
            { name: 'Сим', position: 28.5, start: 27.0, end: 30.0 },
            { name: 'Челябинск-Главный', position: 39.0, start: 37.0, end: 40.0 }
        ]
    },
    'chelyabinsk-ufa': {
        name: 'Челябинск → Уфа',
        direction: 'even',
        startKm: 0,
        endKm: 40,
        stations: [
            { name: 'Челябинск-Главный', position: 39.0, start: 37.0, end: 40.0 },
            { name: 'Сим', position: 28.5, start: 27.0, end: 30.0 },
            { name: 'Миньяр', position: 20.0, start: 18.5, end: 21.5 },
            { name: 'Аша', position: 12.5, start: 11.0, end: 14.0 },
            { name: 'Уфа', position: 1.0, start: 0.0, end: 3.0 }
        ]
    }
};

function loadRoute(routeId) {
    const route = ROUTES[routeId];
    if (!route) return;
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
    ['stations','signals','elevations','slopes','curves','recommendations','speedLimits'].forEach(refreshEditorList);
    closeSelectedEditor();
    updateStats();
    draw();
    document.getElementById('statusText').innerHTML = `✅ Маршрут: ${route.name}`;
}

document.getElementById('routeSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    loadRoute(val);
    e.target.value = ''; // reset to placeholder after loading
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
        const optional = ['speedLimits'];
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
            const required = ['stations','signals','elevations','slopes','curves','recommendations','speedLimits'];
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
                speedLimits: parsed.speedLimits || []
            };
            saveSnapshot();
            saveToLocalStorage();
            ['stations','signals','elevations','slopes','curves','recommendations'].forEach(refreshEditorList);
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
    updateRouteLabel();
    updateRangeLabel();
}

// ============================================================
// INIT
// ============================================================
if (!loadFromLocalStorage()) {
    loadDemo();
}
saveSnapshot();
document.getElementById('statusText').innerHTML = state.data.stations.length
    ? '✅ Восстановлено из сохранения'
    : '⚡ Новый профиль';
['stations', 'signals', 'elevations', 'slopes', 'curves', 'recommendations', 'speedLimits'].forEach(refreshEditorList);
draw();

// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        console.log('SW registered:', reg.scope);
    }).catch(err => {
        console.warn('SW registration failed:', err);
    });
}