import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const AppState = {
    files: {}, activePng: null, activeMcmeta: null, activeFrame: 0,
    drawing: false, currentTool: 'pencil', tickMs: 50,
    zoom: 1, brushSize: 1, history: [], historyStep: -1
};

// --- Настройка 3D (Исправлен черно-розовый куб) ---
const view3d = document.getElementById('view-3d-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#181818');
const camera = new THREE.PerspectiveCamera(45, view3d.clientWidth / view3d.clientHeight, 0.1, 100);
camera.position.set(2, 2, 2);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('webgl-canvas'), antialias: true });
renderer.setSize(view3d.clientWidth, view3d.clientHeight);
const controls = new OrbitControls(camera, renderer.domElement);

const faceMap = { right: 0, left: 1, top: 2, bottom: 3, front: 4, back: 5 };
const faceCanvases = Array.from({length: 6}, () => { const c = document.createElement('canvas'); c.width = 16; c.height = 16; return c; });
const faceCtxs = faceCanvases.map(c => c.getContext('2d', {willReadFrequently: true}));
const faceTextures = faceCanvases.map(c => {
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    return tex;
});
// Заливаем базовым цветом, чтобы не было розового куба до загрузки
faceCtxs.forEach(ctx => { ctx.fillStyle = '#555'; ctx.fillRect(0,0,16,16); });
faceTextures.forEach(t => t.needsUpdate = true);

const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), faceTextures.map(tex => new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
scene.add(cube);
const faceAssignments = [null, null, null, null, null, null];
const faceTicks = [0,0,0,0,0,0]; const faceSeqIndices = [0,0,0,0,0,0];
let lastTime = performance.now();

// --- Сплит-скрин (Ресайз) ---
const resizer = document.getElementById('resizer');
let isResizing = false;
resizer.addEventListener('mousedown', () => isResizing = true);
window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const offsetTop = view3d.getBoundingClientRect().top;
    let newHeight = e.clientY - offsetTop;
    if (newHeight < 100) newHeight = 100;
    view3d.style.height = `${newHeight}px`;
    renderer.setSize(view3d.clientWidth, view3d.clientHeight);
    camera.aspect = view3d.clientWidth / view3d.clientHeight; camera.updateProjectionMatrix();
});
window.addEventListener('mouseup', () => isResizing = false);

// --- Загрузка файлов ---
document.getElementById('file-input').addEventListener('change', async (e) => {
    for (let f of Array.from(e.target.files)) {
        const baseName = f.name.replace('.png.mcmeta', '').replace('.mcmeta', '').replace('.json', '').replace('.png', '');
        if (!AppState.files[baseName]) AppState.files[baseName] = { name: baseName, mcmetaObj: { animation: { frametime: 2 } } };
        
        if (f.name.endsWith('.png')) {
            const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = URL.createObjectURL(f); });
            const mCvs = document.createElement('canvas'); mCvs.width = img.width; mCvs.height = img.height;
            mCvs.getContext('2d').drawImage(img, 0, 0);
            AppState.files[baseName] = { ...AppState.files[baseName], pngFile: f, img, width: img.width, frames: Math.floor(img.height/img.width) || 1, masterCanvas: mCvs };
            assignToCubeFaces(baseName);
        } else {
            const text = await new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsText(f); });
            try { AppState.files[baseName].mcmetaObj = JSON.parse(text); } catch(e){}
        }
        parseSequence(baseName);
    }
    renderFileList(); e.target.value = '';
});

function assignToCubeFaces(baseName) {
    const ln = baseName.toLowerCase(); let assigned = false;
    if (ln.includes('top')) { faceAssignments[faceMap.top] = baseName; assigned = true; }
    if (ln.includes('bottom')) { faceAssignments[faceMap.bottom] = baseName; assigned = true; }
    if (ln.includes('side')) { [0,1,4,5].forEach(i => faceAssignments[i] = baseName); assigned = true; }
    if (!assigned) faceAssignments.fill(baseName); // Применяем ко всем, если нет тегов
    updateCubeFaces();
}

function parseSequence(baseName) {
    const fd = AppState.files[baseName]; if (!fd.width) return;
    const ft = fd.mcmetaObj.animation?.frametime || 2;
    const frames = fd.mcmetaObj.animation?.frames;
    fd.sequence = [];
    if (Array.isArray(frames)) {
        frames.forEach(f => fd.sequence.push(typeof f === 'number' ? {index: f, time: ft} : {index: f.index, time: f.time ?? ft}));
    } else {
        for (let i=0; i<fd.frames; i++) fd.sequence.push({index: i, time: ft});
    }
}

function updateCubeFaces() {
    faceAssignments.forEach((baseName, i) => {
        if (!baseName || !AppState.files[baseName]?.masterCanvas) return;
        const fd = AppState.files[baseName];
        const frameIdx = fd.sequence?.[faceSeqIndices[i]]?.index || 0;
        faceCanvases[i].width = fd.width; faceCanvases[i].height = fd.width;
        faceCtxs[i].clearRect(0,0,fd.width,fd.width);
        faceCtxs[i].drawImage(fd.masterCanvas, 0, frameIdx*fd.width, fd.width, fd.width, 0, 0, fd.width, fd.width);
        faceTextures[i].needsUpdate = true;
    });
}

// --- UI Логика ---
function renderFileList() {
    const list = document.getElementById('file-list'); list.innerHTML = '';
    Object.keys(AppState.files).forEach(name => {
        if(AppState.files[name].pngFile) {
            const d = document.createElement('div'); d.className = `file-item ${AppState.activePng === name ? 'active-png':''}`;
            d.innerText = `PNG: ${name}`; d.onclick = () => { AppState.activePng = name; AppState.activeFrame = 0; renderFileList(); loadCanvas(); };
            list.appendChild(d);
        }
        if(AppState.files[name].mcmetaObj) {
            const d = document.createElement('div'); d.className = `file-item ${AppState.activeMcmeta === name ? 'active-mcmeta':''}`;
            d.innerText = `META: ${name}`; d.onclick = () => { 
                AppState.activeMcmeta = name; renderFileList(); 
                document.getElementById('json-editor').value = JSON.stringify(AppState.files[name].mcmetaObj, null, 2);
                document.getElementById('json-editor').disabled = false; document.getElementById('btn-apply-json').disabled = false;
            };
            list.appendChild(d);
        }
    });
}

// --- 2D РЕДАКТОР (Зум, Сетка, Кисть, Отмена) ---
const drawCvs = document.getElementById('draw-canvas'); const drawCtx = drawCvs.getContext('2d', {willReadFrequently: true});
const cvsWrapper = document.getElementById('canvas-wrapper'); const cursor = document.getElementById('brush-cursor');

function loadCanvas() {
    const fd = AppState.files[AppState.activePng]; if(!fd) return;
    drawCvs.width = fd.width; drawCvs.height = fd.width;
    drawCvs.style.width = `${fd.width * 16}px`; drawCvs.style.height = `${fd.width * 16}px`; // Базовый визуал
    drawCtx.clearRect(0,0,fd.width,fd.width);
    drawCtx.drawImage(fd.masterCanvas, 0, AppState.activeFrame*fd.width, fd.width, fd.width, 0, 0, fd.width, fd.width);
    renderFrames(); saveHistory(); AppState.zoom = 1; updateZoom();
}

function renderFrames() {
    const box = document.getElementById('frames-container'); box.innerHTML = '';
    const fd = AppState.files[AppState.activePng]; if(!fd) return;
    for(let i=0; i<fd.frames; i++) {
        const b = document.createElement('div'); b.className = `frame-btn ${AppState.activeFrame === i ? 'active':''}`; b.innerText = i;
        b.onclick = () => { AppState.activeFrame = i; loadCanvas(); }; box.appendChild(b);
    }
}

// Зум колесиком
document.getElementById('editor-workspace').addEventListener('wheel', (e) => {
    e.preventDefault();
    AppState.zoom += e.deltaY * -0.005;
    AppState.zoom = Math.min(Math.max(.1, AppState.zoom), 10);
    updateZoom();
});
function updateZoom() { cvsWrapper.style.transform = `scale(${AppState.zoom})`; }

// Логика кисти и курсора
document.getElementById('brush-size').addEventListener('change', e => AppState.brushSize = parseInt(e.target.value));
document.querySelectorAll('.tool-btn').forEach(b => {
    if(b.id === 'tool-pencil' || b.id === 'tool-picker') b.onclick = (e) => { AppState.currentTool = b.id.split('-')[1]; document.querySelectorAll('.tool-btn').forEach(btn=>btn.classList.remove('active')); b.classList.add('active'); }
});

function getMouse(e) {
    const rect = drawCvs.getBoundingClientRect();
    const scaleX = drawCvs.width / rect.width; const scaleY = drawCvs.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

drawCvs.addEventListener('mousemove', e => {
    if (!AppState.activePng) return;
    const pos = getMouse(e);
    const snapX = Math.floor(pos.x / AppState.brushSize) * AppState.brushSize;
    const snapY = Math.floor(pos.y / AppState.brushSize) * AppState.brushSize;
    
    // Отрисовка превью кисти (магнитится к сетке)
    cursor.style.display = 'block';
    cursor.style.width = `${AppState.brushSize * (drawCvs.clientWidth / drawCvs.width)}px`;
    cursor.style.height = `${AppState.brushSize * (drawCvs.clientHeight / drawCvs.height)}px`;
    cursor.style.left = `${snapX * (drawCvs.clientWidth / drawCvs.width)}px`;
    cursor.style.top = `${snapY * (drawCvs.clientHeight / drawCvs.height)}px`;

    if (AppState.drawing && AppState.currentTool === 'pencil') draw(snapX, snapY);
});
drawCvs.addEventListener('mouseleave', () => cursor.style.display = 'none');

drawCvs.addEventListener('mousedown', e => {
    if(!AppState.activePng) return;
    const pos = getMouse(e);
    if(AppState.currentTool === 'picker') {
        const p = drawCtx.getImageData(pos.x, pos.y, 1, 1).data;
        if(p[3]>0) document.getElementById('draw-color').value = "#" + ((1<<24)+(p[0]<<16)+(p[1]<<8)+p[2]).toString(16).slice(1);
        document.getElementById('tool-pencil').click();
    } else {
        AppState.drawing = true;
        draw(Math.floor(pos.x / AppState.brushSize) * AppState.brushSize, Math.floor(pos.y / AppState.brushSize) * AppState.brushSize);
    }
});
window.addEventListener('mouseup', () => { if(AppState.drawing) { AppState.drawing = false; saveHistory(); }});

function draw(x, y) {
    drawCtx.fillStyle = document.getElementById('draw-color').value;
    drawCtx.fillRect(x, y, AppState.brushSize, AppState.brushSize);
    
    // Синхронизация с 3D в реальном времени
    const fd = AppState.files[AppState.activePng];
    fd.masterCanvas.getContext('2d').clearRect(0, AppState.activeFrame*fd.width, fd.width, fd.width);
    fd.masterCanvas.getContext('2d').drawImage(drawCvs, 0, AppState.activeFrame*fd.width);
    updateCubeFaces(); // Сразу обновляем 3D модель!
}

// Система History (Отмена/Повтор)
function saveHistory() {
    if(!AppState.activePng) return;
    AppState.historyStep++;
    AppState.history.length = AppState.historyStep; // обрезаем ветку redo
    AppState.history.push(drawCtx.getImageData(0,0,drawCvs.width, drawCvs.height));
}
document.getElementById('btn-undo').onclick = () => {
    if(AppState.historyStep > 0) {
        AppState.historyStep--;
        drawCtx.putImageData(AppState.history[AppState.historyStep], 0, 0);
        syncMaster();
    }
};
document.getElementById('btn-redo').onclick = () => {
    if(AppState.historyStep < AppState.history.length - 1) {
        AppState.historyStep++;
        drawCtx.putImageData(AppState.history[AppState.historyStep], 0, 0);
        syncMaster();
    }
};
function syncMaster() {
    const fd = AppState.files[AppState.activePng];
    fd.masterCanvas.getContext('2d').clearRect(0, AppState.activeFrame*fd.width, fd.width, fd.width);
    fd.masterCanvas.getContext('2d').drawImage(drawCvs, 0, AppState.activeFrame*fd.width);
    updateCubeFaces();
}

// Копирование и Очистка кадра
document.getElementById('btn-copy-frame').onclick = () => {
    if(!AppState.activePng) return;
    let target = prompt(`Введи номер кадра (от 0 до ${AppState.files[AppState.activePng].frames-1}), КУДА скопировать текущий кадр:`);
    if(target !== null && target >= 0 && target < AppState.files[AppState.activePng].frames) {
        const fd = AppState.files[AppState.activePng];
        fd.masterCanvas.getContext('2d').clearRect(0, target*fd.width, fd.width, fd.width);
        fd.masterCanvas.getContext('2d').drawImage(drawCvs, 0, target*fd.width);
        alert(`Кадр ${AppState.activeFrame} скопирован в ${target}!`);
        updateCubeFaces();
    }
};
document.getElementById('btn-clear-frame').onclick = () => {
    if(!AppState.activePng) return;
    drawCtx.clearRect(0,0,drawCvs.width, drawCvs.height);
    syncMaster(); saveHistory();
};

// --- Цикл Анимации 3D ---
function animate(t) {
    requestAnimationFrame(animate); controls.update();
    let delta = t - lastTime;
    faceAssignments.forEach((baseName, i) => {
        if(!baseName || !AppState.files[baseName]?.sequence) return;
        const fd = AppState.files[baseName];
        faceTicks[i] += delta;
        if(faceTicks[i] >= (fd.sequence[faceSeqIndices[i]]?.time || 2) * AppState.tickMs) {
            faceTicks[i] = 0;
            faceSeqIndices[i] = (faceSeqIndices[i] + 1) % fd.sequence.length;
            updateCubeFaces();
        }
    });
    lastTime = t; renderer.render(scene, camera);
}
animate(performance.now());

// --- Остальной экспорт и настройки ---
document.getElementById('bg-color-3d').addEventListener('input', e => scene.background.set(e.target.value));
document.getElementById('btn-apply-json').onclick = () => {
    try { AppState.files[AppState.activeMcmeta].mcmetaObj = JSON.parse(document.getElementById('json-editor').value); parseSequence(AppState.activeMcmeta); } 
    catch(e) { alert("Ошибка JSON"); }
};
document.getElementById('btn-dl-all').onclick = async () => {
    const zip = new JSZip();
    Object.values(AppState.files).forEach(fd => {
        if(fd.masterCanvas) zip.file(`${fd.name}.png`, fd.masterCanvas.toDataURL().split(',')[1], {base64: true});
        if(fd.mcmetaObj) zip.file(`${fd.name}.png.mcmeta`, JSON.stringify(fd.mcmetaObj, null, 2));
    });
    const content = await zip.generateAsync({type:"blob"});
    const a = document.createElement('a'); a.href = URL.createObjectURL(content); a.download = "texture_pack.zip"; a.click();
};
