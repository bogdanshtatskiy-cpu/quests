import { ItemsDB } from './items.js';
import { DB } from './db.js';
import { Auth } from './auth.js';
import { BQ } from './bq.js';

// Константы размеров для квестов
const SIZE_MAP = { x1: 52, x2: 104, x3: 156, x4: 208 };
const getSafeSize = (s) => { 
    const compat = { sm: 'x1', md: 'x1', lg: 'x2' }; 
    return compat[s] || s || 'x1'; 
};

export const Editor = {
    data: { mods: [] }, 
    activeModId: null, 
    originalData: null, 
    isImportMode: false, 
    lootGroups: {}, // Загруженные группы лутбоксов
    
    // Камера (Зум и перемещение)
    scale: 1, 
    panX: 0, 
    panY: 0, 
    isPanning: false, 
    panStartX: 0, 
    panStartY: 0, 
    initialPanX: 0, 
    initialPanY: 0,
    
    // Состояние узлов
    draggedQuestId: null, 
    mouseStartX: 0, 
    mouseStartY: 0, 
    nodeStartX: 0, 
    nodeStartY: 0, 
    hasMovedNode: false,
    linkingFromNodeId: null, 
    contextNodeId: null, 
    editingNodeId: null, 
    hoveredQuestId: null,
    
    // Временные данные для модалок
    pickerCallback: null, 
    tempReqs: [], 
    tempRewards: [], 
    tempQuestIcon: null, 
    editingModId: null, 
    tempModIcon: null, 
    saveTimeout: null,
    tempNbtTarget: null,

    /**
     * Запуск всех слушателей событий
     */
    init() {
        this.bindCanvasEvents(); 
        this.bindModModalEvents(); 
        this.bindQuestModalEvents();
        this.bindItemPickerEvents(); 
        this.bindTopBarEvents();
        this.bindNbtModalEvents(); 
    },

    // Скрывает подсказку (вызываем при открытии любых окон)
    hideTooltip() {
        const tt = document.getElementById('quest-tooltip');
        if (tt) tt.classList.add('hidden');
        this.hoveredQuestId = null;
    },

    /**
     * Логика верхней панели
     */
    bindTopBarEvents() {
        document.getElementById('btn-toggle-titles').addEventListener('click', () => {
            document.body.classList.toggle('show-titles');
        });

        const btnToggleSummary = document.getElementById('btn-toggle-summary-size');
        const summaryPanel = document.getElementById('rewards-summary');
        btnToggleSummary.addEventListener('click', () => {
            summaryPanel.classList.toggle('minimized');
            btnToggleSummary.innerText = summaryPanel.classList.contains('minimized') ? '▲' : '▼';
        });

        // Импорт BetterQuesting
        const fileInput = document.getElementById('bq-file-input');
        document.getElementById('btn-import-bq').addEventListener('click', () => {
            this.hideTooltip();
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => { BQ.parseData(event.target.result, this); fileInput.value = ''; };
            reader.readAsText(file);
        });

        document.getElementById('btn-cancel-import').addEventListener('click', () => {
            if (confirm('Отменить импорт? Все текущие изменения будут стерты.')) {
                this.isImportMode = false;
                this.data.mods = JSON.parse(JSON.stringify(this.originalData)); 
                this.activeModId = this.data.mods.length > 0 ? this.data.mods[0].id : null;
                document.getElementById('import-mode-bar').classList.add('hidden');
                document.body.classList.remove('import-mode');
                this.renderSidebar(); this.renderCanvas(); this.centerCanvas();
            }
        });

        document.getElementById('btn-apply-import').addEventListener('click', async () => {
            if (confirm('ВНИМАНИЕ! Это действие перезапишет базу квестов на сервере. Вы уверены?')) {
                this.isImportMode = false;
                document.getElementById('import-mode-bar').classList.add('hidden');
                document.body.classList.remove('import-mode');
                await DB.saveQuestsSilent(this.data.mods);
                DB.logAction('Выполнил импорт базы BetterQuesting');
                alert('База обновлена!');
            }
        });

        document.getElementById('btn-export-bq').addEventListener('click', () => BQ.exportData(this.data.mods));
    },

    /**
     * Автосохранение
     */
    triggerAutoSave() {
        if (!Auth.user || this.isImportMode) return; 
        const indicator = document.getElementById('save-indicator');
        indicator.classList.remove('hidden'); 
        indicator.innerText = "Сохранение..."; 

        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            await DB.saveQuestsSilent(this.data.mods);
            indicator.innerText = "Сохранено ✔"; 
            setTimeout(() => indicator.classList.add('hidden'), 2000);
        }, 1500);
    },

    /**
     * Центрирование камеры
     */
    centerCanvas() {
        const mod = this.getActiveMod();
        const container = document.getElementById('canvas-container');
        if (!mod || !mod.quests || mod.quests.length === 0) {
            this.scale = 1; this.panX = container.clientWidth / 2 - 26; this.panY = container.clientHeight / 2 - 26;
            this.updateTransform(); return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        mod.quests.forEach(q => {
            const size = SIZE_MAP[getSafeSize(q.size)];
            if (q.x < minX) minX = q.x; if (q.y < minY) minY = q.y;
            if (q.x + size > maxX) maxX = q.x + size; if (q.y + size > maxY) maxY = q.y + size;
        });

        const padding = 100;
        const boxW = maxX - minX;
        const boxH = maxY - minY;
        const scaleX = (container.clientWidth - padding * 2) / (boxW || 1);
        const scaleY = (container.clientHeight - padding * 2) / (boxH || 1);
        
        this.scale = Math.max(0.1, Math.min(scaleX, scaleY, 1.5));
        this.panX = (container.clientWidth / 2) - (minX + boxW / 2) * this.scale;
        this.panY = (container.clientHeight / 2) - (minY + boxH / 2) * this.scale;
        this.updateTransform();
    },

    /**
     * Управление холстом (Мышь)
     */
    bindCanvasEvents() {
        const container = document.getElementById('canvas-container');
        const tooltip = document.getElementById('quest-tooltip');
        const contextMenu = document.getElementById('node-context-menu');

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoom = e.deltaY > 0 ? 0.9 : 1.1;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const canvasX = (mouseX - this.panX) / this.scale;
            const canvasY = (mouseY - this.panY) / this.scale;
            this.scale = Math.min(Math.max(0.1, this.scale * zoom), 3);
            this.panX = mouseX - canvasX * this.scale;
            this.panY = mouseY - canvasY * this.scale;
            this.updateTransform();
        });

        container.addEventListener('mousedown', (e) => {
            contextMenu.classList.add('hidden');
            if (!e.target.closest('.quest-node') && !e.target.closest('.ui-element') && e.button === 0) {
                this.isPanning = true; 
                this.panStartX = e.clientX; 
                this.panStartY = e.clientY;
                this.initialPanX = this.panX; 
                this.initialPanY = this.panY; 
                container.style.cursor = 'grabbing';
            }
        });

        container.addEventListener('mousemove', (e) => {
            if (this.isPanning || this.draggedQuestId) tooltip.classList.add('hidden');
            
            if (this.isPanning) {
                this.panX = this.initialPanX + (e.clientX - this.panStartX);
                this.panY = this.initialPanY + (e.clientY - this.panStartY);
                this.updateTransform();
            }

            if (this.draggedQuestId) {
                const quest = this.getActiveMod().quests.find(q => q.id === this.draggedQuestId);
                const dx = (e.clientX - this.mouseStartX) / this.scale; 
                const dy = (e.clientY - this.mouseStartY) / this.scale;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.hasMovedNode = true;
                quest.x = this.nodeStartX + dx; 
                quest.y = this.nodeStartY + dy;
                this.renderCanvas(true); 
            }

            const hovered = e.target.closest('.quest-node');
            if (hovered && !this.isPanning && !this.draggedQuestId && contextMenu.classList.contains('hidden')) {
                const id = hovered.dataset.id;
                if (this.hoveredQuestId !== id) {
                    this.hoveredQuestId = id;
                    const q = this.getActiveMod().quests.find(item => item.id === id);
                    if (q) this.showTooltip(q);
                }
                tooltip.style.left = (e.clientX + 15) + 'px'; 
                tooltip.style.top = (e.clientY + 15) + 'px';
            } else { 
                this.hoveredQuestId = null; 
                tooltip.classList.add('hidden'); 
            }
        });

        window.addEventListener('mouseup', () => {
            this.isPanning = false;
            if (this.draggedQuestId && this.hasMovedNode) this.triggerAutoSave();
            this.draggedQuestId = null; 
            container.style.cursor = 'default';
        });

        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.hideTooltip();
            if (!Auth.user || !this.activeModId) return;
            if (e.target.closest('.quest-node') || e.target.closest('.ui-element')) return;

            contextMenu.classList.add('hidden');
            const rect = container.getBoundingClientRect();
            this.newQuestX = (e.clientX - rect.left - this.panX) / this.scale - 26; 
            this.newQuestY = (e.clientY - rect.top - this.panY) / this.scale - 26;
            this.openQuestModal();
        });

        document.getElementById('menu-copy').addEventListener('click', () => { contextMenu.classList.add('hidden'); this.copyQuest(this.contextNodeId); });
        document.getElementById('menu-delete').addEventListener('click', () => { contextMenu.classList.add('hidden'); this.deleteQuest(this.contextNodeId); });
        document.getElementById('menu-edit').addEventListener('click', () => { contextMenu.classList.add('hidden'); this.openQuestModal(this.contextNodeId); });
        document.getElementById('menu-link').addEventListener('click', () => { contextMenu.classList.add('hidden'); this.linkingFromNodeId = this.contextNodeId; this.renderCanvas(); });
    },

    updateTransform() { 
        document.getElementById('quest-canvas').style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`; 
    },

    /**
     * Отрисовка холста (Оптимизирована фрагментами)
     */
    renderCanvas(skipSave = false) {
        const nodesLayer = document.getElementById('nodes-layer');
        const linesLayer = document.getElementById('connections-layer');
        nodesLayer.innerHTML = ''; 
        linesLayer.innerHTML = '';
        
        const mod = this.getActiveMod();
        if (!mod) { this.updateSummary(); return; }

        const nodesFrag = document.createDocumentFragment();
        const linesFrag = document.createDocumentFragment();

        // Линии
        mod.quests.forEach(q => {
            if (q.parents) {
                q.parents.forEach(pId => {
                    const p = mod.quests.find(item => item.id === pId);
                    if (p) this.drawLine(linesFrag, p, q);
                });
            }
        });

        // Узлы
        mod.quests.forEach(quest => {
            const node = document.createElement('div');
            const sz = getSafeSize(quest.size);
            node.className = `quest-node size-${sz}`;
            if (this.linkingFromNodeId === quest.id) node.classList.add('selected');
            node.style.left = `${quest.x}px`; 
            node.style.top = `${quest.y}px`;
            node.dataset.id = quest.id;
            
            // ЛОГИКА ИКОНОК: Проверка на пустоту
            let iconFile = quest.icon;
            if (!iconFile && quest.reqs && quest.reqs.length > 0 && quest.reqs[0].item) {
                iconFile = quest.reqs[0].item.image;
            }
            if (!iconFile && quest.rewards && quest.rewards.length > 0 && quest.rewards[0].item) {
                iconFile = quest.rewards[0].item.image;
            }
            if (!iconFile) iconFile = 'book.png';

            node.innerHTML = `
                <img src="${ItemsDB.getImageUrl(iconFile)}" loading="lazy">
                <div class="node-title">${ItemsDB.formatMC(quest.title)}</div>
            `;

            node.addEventListener('mousedown', (e) => {
                if (e.button === 0 && Auth.user) {
                    if (e.shiftKey || this.linkingFromNodeId) {
                        e.stopPropagation();
                        if (!this.linkingFromNodeId) this.linkingFromNodeId = quest.id;
                        else {
                            if (this.linkingFromNodeId !== quest.id) {
                                if (!quest.parents) quest.parents = [];
                                const idx = quest.parents.indexOf(this.linkingFromNodeId);
                                if (idx > -1) quest.parents.splice(idx, 1);
                                else quest.parents.push(this.linkingFromNodeId);
                                this.triggerAutoSave(); 
                            }
                            this.linkingFromNodeId = null;
                        }
                        this.renderCanvas();
                    } else {
                        e.stopPropagation(); 
                        this.draggedQuestId = quest.id; 
                        this.hasMovedNode = false;
                        this.mouseStartX = e.clientX; 
                        this.mouseStartY = e.clientY;
                        this.nodeStartX = quest.x; 
                        this.nodeStartY = quest.y;
                    }
                }
            });

            node.addEventListener('click', (e) => {
                this.hideTooltip();
                if (e.button !== 0 || (e.shiftKey && Auth.user) || this.hasMovedNode) return; 
                this.openQuestViewModal(quest.id);
            });

            node.addEventListener('contextmenu', (e) => {
                e.preventDefault(); e.stopPropagation();
                this.hideTooltip();
                if (!Auth.user) return; 
                this.contextNodeId = quest.id;
                const menu = document.getElementById('node-context-menu');
                menu.style.left = `${e.clientX}px`; 
                menu.style.top = `${e.clientY}px`;
                menu.classList.remove('hidden');
            });

            nodesFrag.appendChild(node);
        });

        linesLayer.appendChild(linesFrag);
        nodesLayer.appendChild(nodesFrag);
        if (!skipSave) this.updateSummary();
    },

    drawLine(svg, p, c) {
        const ps = SIZE_MAP[getSafeSize(p.size)] / 2; 
        const cs = SIZE_MAP[getSafeSize(c.size)] / 2;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p.x + ps); line.setAttribute('y1', p.y + ps);
        line.setAttribute('x2', c.x + cs); line.setAttribute('y2', c.y + cs);
        line.setAttribute('class', 'quest-line'); svg.appendChild(line);
    },

    /**
     * Помощники для текста
     */
    getTaskLabel(r) {
        const t = r.taskType || 'retrieval';
        let name = r.customName || (r.item ? r.item.name : 'Предмет');
        if (t === 'hunt') return `Убить: ${r.target || name}`;
        if (t === 'block_break') return `Сломать: ${ItemsDB.formatMC(name)}`;
        if (t === 'crafting') return `Создать: ${ItemsDB.formatMC(name)}`;
        if (t === 'fluid') return `Жидкость: ${ItemsDB.formatMC(r.target || name)}`;
        if (t === 'checkbox') return `Галочка: ${ItemsDB.formatMC(name)}`;
        return ItemsDB.formatMC(name);
    },

    getRewardLabel(r) {
        if (r.taskType === 'command') return `Команда: /${r.command || '...'}`;
        if (r.taskType === 'xp') return `Опыт (Уровни)`;
        let name = r.customName || (r.item ? r.item.name : 'Награда');
        if (r.item && (r.item.string_id === 'bq_standard:loot_chest' || r.item.item_key === 'bq_standard:loot_chest')) {
            const t = this.lootGroups && this.lootGroups[r.damage] ? this.lootGroups[r.damage] : `Тир ${r.damage||0}`;
            return `🎁 Лутбокс [${t}]`;
        }
        return ItemsDB.formatMC(name);
    },

    /**
     * Тултип и Статистика
     */
    showTooltip(q) {
        const tt = document.getElementById('quest-tooltip');
        document.getElementById('tt-title').innerHTML = ItemsDB.formatMC(q.title);
        document.getElementById('tt-desc').innerHTML = ItemsDB.formatMC(q.desc || '');
        
        let reqs = (q.reqs || []).map(r => {
            const img = r.item ? ItemsDB.getImageUrl(r.item.image) : '';
            return `<div class="tt-item"><img src="${img}">${this.getTaskLabel(r)} x${r.count}</div>`;
        }).join('') || 'Нет требований';
        document.getElementById('tt-reqs').innerHTML = reqs;

        let rews = (q.rewards || []).map(r => {
            const img = r.item ? ItemsDB.getImageUrl(r.item.image) : '';
            return `<div class="tt-item"><img src="${img}">${this.getRewardLabel(r)} x${r.count}</div>`;
        }).join('') || 'Нет наград';
        document.getElementById('tt-rewards').innerHTML = rews;

        tt.classList.remove('hidden');
    },

    updateSummary() {
        const box = document.getElementById('rewards-summary-list');
        const pan = document.getElementById('rewards-summary');
        const mod = this.getActiveMod();
        if (!mod) { pan.classList.add('hidden'); return; }
        const totals = {};
        mod.quests.forEach(q => {
            (q.rewards || []).forEach(r => {
                const n = this.getRewardLabel(r);
                const k = n + (r.isChoice ? '_C' : '_G');
                if (!totals[k]) totals[k] = { count: 0, item: r.item, name: n, isChoice: r.isChoice };
                totals[k].count += parseInt(r.count || 1);
            });
        });
        if (Object.keys(totals).length > 0) {
            pan.classList.remove('hidden');
            box.innerHTML = Object.values(totals).map(t => `<div class="summary-item"><img src="${ItemsDB.getImageUrl(t.item?t.item.image:'')}"> ${t.count}x ${t.name}</div>`).join('');
        } else pan.classList.add('hidden');
    },

    /**
     * NBT Редактор
     */
    bindNbtModalEvents() {
        document.getElementById('btn-close-nbt').addEventListener('click', () => {
            document.getElementById('nbt-editor-modal').classList.add('hidden');
        });
        document.getElementById('btn-save-nbt').addEventListener('click', () => {
            const text = document.getElementById('nbt-editor-textarea').value;
            const err = document.getElementById('nbt-editor-error');
            try {
                const p = text.trim()===''||text.trim()==='{}' ? null : JSON.parse(text);
                if (this.tempNbtTarget) {
                    this.tempNbtTarget.nbtTag = p;
                    this.tempNbtTarget.customName = BQ.getCustomName(this.tempNbtTarget.item, p);
                }
                document.getElementById('nbt-editor-modal').classList.add('hidden');
                this.renderQuestEditForm(); 
            } catch(e) { err.innerText = 'Ошибка JSON: ' + e.message; }
        });
    },

    /**
     * Копирование и удаление
     */
    copyQuest(id) {
        const mod = this.getActiveMod();
        const q = mod.quests.find(item => item.id === id);
        if (!q) return;
        const n = JSON.parse(JSON.stringify(q));
        n.id = 'q_' + Date.now();
        n.x += 60; n.y += 60; n.parents = [];
        mod.quests.push(n); this.triggerAutoSave(); this.renderCanvas();
    },

    deleteQuest(id) {
        const mod = this.getActiveMod();
        mod.quests = mod.quests.filter(q => q.id !== id);
        mod.quests.forEach(q => { if(q.parents) q.parents = q.parents.filter(p => p !== id); });
        this.triggerAutoSave(); this.renderCanvas();
    },

    /**
     * Окно редактирования квеста
     */
    bindQuestModalEvents() {
        const modal = document.getElementById('quest-edit-modal');
        document.getElementById('btn-close-view').addEventListener('click', () => document.getElementById('quest-view-modal').classList.add('hidden'));

        document.getElementById('btn-select-quest-icon').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((i) => {
                this.tempQuestIcon = i.image;
                document.getElementById('quest-icon-preview').innerHTML = `<img src="${ItemsDB.getImageUrl(i.image)}" style="width:32px; height:32px;">`;
            });
        });

        document.getElementById('btn-add-req').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((i) => { 
                this.tempReqs.push({ item: i, count: 1, customName: BQ.getCustomName(i, null), consume: true, taskType: 'retrieval', nbtTag: null }); 
                this.renderQuestEditForm(); 
            });
        });

        document.getElementById('btn-add-reward').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((i) => { 
                this.tempRewards.push({ item: i, count: 1, customName: BQ.getCustomName(i, null), isChoice: false, damage: i.damage || 0, taskType: 'item', nbtTag: null }); 
                this.renderQuestEditForm(); 
            });
        });

        document.getElementById('btn-save-quest').addEventListener('click', () => {
            this.saveTempState();
            const mod = this.getActiveMod();
            const q = this.editingNodeId ? mod.quests.find(item => item.id === this.editingNodeId) : null;
            const d = {
                title: document.getElementById('quest-title').value || 'Квест',
                desc: document.getElementById('quest-desc').value,
                size: document.getElementById('quest-size').value,
                icon: this.tempQuestIcon,
                reqs: [...this.tempReqs],
                rewards: [...this.tempRewards]
            };
            if (q) Object.assign(q, d);
            else mod.quests.push({ id: 'q_' + Date.now(), x: this.newQuestX, y: this.newQuestY, parents: [], ...d });
            this.triggerAutoSave(); modal.classList.add('hidden'); this.renderCanvas();
        });

        document.getElementById('btn-close-quest').addEventListener('click', () => modal.classList.add('hidden'));
        document.getElementById('btn-delete-quest').addEventListener('click', () => {
            if(this.editingNodeId && confirm('Удалить?')) { this.deleteQuest(this.editingNodeId); modal.classList.add('hidden'); }
        });
    },

    saveTempState() {
        this.tempReqs.forEach((r, i) => {
            const c = document.getElementById(`req-count-${i}`);
            const n = document.getElementById(`req-name-${i}`);
            const cb = document.getElementById(`req-consume-${i}`);
            if (c) r.count = c.value;
            if (n) r.customName = n.value;
            if (cb) r.consume = cb.checked;
        });
        this.tempRewards.forEach((r, i) => {
            const c = document.getElementById(`rew-count-${i}`);
            const n = document.getElementById(`rew-name-${i}`);
            const cb = document.getElementById(`rew-choice-${i}`);
            if (c) r.count = c.value;
            if (n) r.customName = n.value;
            if (cb) r.isChoice = cb.checked;
        });
    },

    /**
     * Отрисовка списков в модалке (Полная версия)
     */
    renderQuestEditForm() {
        const reqBox = document.getElementById('reqs-list');
        reqBox.innerHTML = this.tempReqs.map((r, i) => `
            <div class="reward-row">
                <div class="mc-slot item-btn" data-idx="${i}" style="cursor:pointer;"><img src="${ItemsDB.getImageUrl(r.item?r.item.image:'')}" width="24"></div>
                <input type="number" id="req-count-${i}" class="mc-input" style="width:60px;" value="${r.count}">
                <input type="text" id="req-name-${i}" class="mc-input custom-name-input" value="${r.customName || ''}">
                <button class="mc-button btn-nbt" data-idx="${i}" style="${r.nbtTag?'color:#5ff; border-color:#5ff;':''}">[NBT]</button>
                <label class="mc-checkbox"><input type="checkbox" id="req-consume-${i}" ${r.consume!==false?'checked':''}> Забрать</label>
                <button class="mc-button danger btn-del" data-idx="${i}">X</button>
            </div>
        `).join('');

        const rewBox = document.getElementById('rewards-list');
        rewBox.innerHTML = this.tempRewards.map((r, i) => `
            <div class="reward-row">
                <div class="mc-slot item-btn" data-idx="${i}" style="cursor:pointer;"><img src="${ItemsDB.getImageUrl(r.item?r.item.image:'')}" width="24"></div>
                <input type="number" id="rew-count-${i}" class="mc-input" style="width:60px;" value="${r.count}">
                <input type="text" id="rew-name-${i}" class="mc-input custom-name-input" value="${r.customName || ''}">
                <button class="mc-button btn-nbt" data-idx="${i}" style="${r.nbtTag?'color:#5ff; border-color:#5ff;':''}">[NBT]</button>
                <label class="mc-checkbox"><input type="checkbox" id="rew-choice-${i}" ${r.isChoice?'checked':''}> Выбор</label>
                <button class="mc-button danger btn-del" data-idx="${i}">X</button>
            </div>
        `).join('');

        // События
        const bindRows = (box, list) => {
            box.querySelectorAll('.item-btn').forEach(b => b.addEventListener('click', () => {
                this.saveTempState();
                this.openItemPicker(it => { 
                    list[b.dataset.idx].item = it; 
                    list[b.dataset.idx].customName = BQ.getCustomName(it, list[b.dataset.idx].nbtTag);
                    this.renderQuestEditForm(); 
                });
            }));
            box.querySelectorAll('.btn-nbt').forEach(b => b.addEventListener('click', () => {
                this.saveTempState();
                this.tempNbtTarget = list[b.dataset.idx];
                document.getElementById('nbt-editor-textarea').value = JSON.stringify(this.tempNbtTarget.nbtTag || {}, null, 2);
                document.getElementById('nbt-editor-modal').classList.remove('hidden');
            }));
            box.querySelectorAll('.btn-del').forEach(b => b.addEventListener('click', () => {
                list.splice(b.dataset.idx, 1); this.renderQuestEditForm();
            }));
        };
        bindRows(reqBox, this.tempReqs);
        bindRows(rewBox, this.tempRewards);
    },

    /**
     * Поиск предметов и Лутбоксы
     */
    bindItemPickerEvents() {
        const modal = document.getElementById('item-picker-modal');
        const res = document.getElementById('picker-results');
        const s = document.getElementById('picker-search');

        s.addEventListener('input', () => {
            const data = ItemsDB.search(s.value, '');
            res.innerHTML = '';
            const frag = document.createDocumentFragment();
            data.slice(0, 60).forEach(i => {
                const d = document.createElement('div'); d.className = 'search-result-item';
                d.innerHTML = `<img src="${ItemsDB.getImageUrl(i.image)}" width="32"><span>${ItemsDB.formatMC(i.name)}</span>`;
                d.addEventListener('click', () => { modal.classList.add('hidden'); if(this.pickerCallback) this.pickerCallback(i); });
                frag.appendChild(d);
            });
            res.appendChild(frag);
        });

        document.getElementById('btn-picker-cancel').addEventListener('click', () => modal.classList.add('hidden'));

        this.openItemPicker = (cb) => {
            this.hideTooltip();
            this.pickerCallback = cb; s.value = ''; s.dispatchEvent(new Event('input'));
            const lb = document.getElementById('picker-loot-results');
            lb.innerHTML = Object.entries(this.lootGroups).map(([id, n]) => `
                <div class="search-result-item loot-item" data-id="${id}" data-name="${n}">
                    <img src="${ItemsDB.getImageUrl('chest.png')}" width="24"><span>${ItemsDB.formatMC(n)}</span>
                </div>
            `).join('') || '<div style="padding:10px; color:#666;">Нет данных</div>';
            
            lb.querySelectorAll('.loot-item').forEach(b => b.addEventListener('click', () => {
                modal.classList.add('hidden');
                cb({ item_key: 'bq_standard:loot_chest', string_id: 'bq_standard:loot_chest', name: b.dataset.name, image: 'chest.png', damage: parseInt(b.dataset.id) });
            }));
            modal.classList.remove('hidden');
        };
    },

    /**
     * Сайдбар (Ветки квестов + Drag-and-Drop)
     */
    bindModModalEvents() {
        const modal = document.getElementById('add-mod-modal');
        document.getElementById('btn-add-mod').addEventListener('click', () => {
            this.hideTooltip();
            this.editingModId = null; this.tempModIcon = null;
            document.getElementById('new-mod-name').value = '';
            document.getElementById('mod-icon-preview').innerHTML = '';
            modal.classList.remove('hidden');
        });

        document.getElementById('btn-close-mod').addEventListener('click', () => modal.classList.add('hidden'));

        document.getElementById('btn-select-mod-icon').addEventListener('click', () => {
            this.openItemPicker(it => {
                this.tempModIcon = it.image;
                document.getElementById('mod-icon-preview').innerHTML = `<div class="mc-slot"><img src="${ItemsDB.getImageUrl(it.image)}" width="32"></div>`;
            });
        });

        document.getElementById('btn-save-mod').addEventListener('click', () => {
            const n = document.getElementById('new-mod-name').value;
            if (!n || !this.tempModIcon) return alert('Заполните данные!');
            if (this.editingModId) {
                const m = this.data.mods.find(item => item.id === this.editingModId);
                m.name = n; m.icon = this.tempModIcon;
            } else {
                const id = 'mod_' + Date.now();
                this.data.mods.push({ id, name: n, icon: this.tempModIcon, quests: [] });
                this.activeModId = id;
            }
            this.triggerAutoSave(); modal.classList.add('hidden'); this.renderSidebar(); this.renderCanvas();
        });
    },

    renderSidebar() {
        const list = document.getElementById('mod-list');
        list.innerHTML = '';
        const frag = document.createDocumentFragment();

        this.data.mods.forEach((mod, index) => {
            const li = document.createElement('li');
            li.className = `mod-item ${this.activeModId === mod.id ? 'active' : ''}`;
            li.draggable = true;
            li.innerHTML = `
                <div class="mod-item-content">
                    <img src="${ItemsDB.getImageUrl(mod.icon)}" width="24">
                    <span>${ItemsDB.formatMC(mod.name)}</span>
                </div>
                <div class="mod-item-actions admin-only">
                    <button class="mod-btn edit">✏️</button>
                    <button class="mod-btn delete">❌</button>
                </div>
            `;

            li.addEventListener('click', () => {
                this.activeModId = mod.id; this.renderSidebar(); this.renderCanvas(); this.centerCanvas();
            });

            // DRAG AND DROP ЛОГИКА
            li.addEventListener('dragstart', (e) => {
                li.style.opacity = '0.5';
                e.dataTransfer.setData('index', index);
            });
            li.addEventListener('dragend', () => li.style.opacity = '1');
            li.addEventListener('dragover', (e) => e.preventDefault());
            li.addEventListener('drop', (e) => {
                const fromIdx = e.dataTransfer.getData('index');
                const toIdx = index;
                const item = this.data.mods.splice(fromIdx, 1)[0];
                this.data.mods.splice(toIdx, 0, item);
                this.triggerAutoSave(); this.renderSidebar();
            });

            // Кнопки внутри
            li.querySelector('.edit').addEventListener('click', (e) => {
                e.stopPropagation(); this.editingModId = mod.id; this.tempModIcon = mod.icon;
                document.getElementById('new-mod-name').value = mod.name;
                document.getElementById('mod-icon-preview').innerHTML = `<img src="${ItemsDB.getImageUrl(mod.icon)}" width="32">`;
                document.getElementById('add-mod-modal').classList.remove('hidden');
            });

            li.querySelector('.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Удалить ветку?')) {
                    this.data.mods = this.data.mods.filter(m => m.id !== mod.id);
                    this.triggerAutoSave(); this.renderSidebar(); this.renderCanvas();
                }
            });

            frag.appendChild(li);
        });
        list.appendChild(frag);
    },

    /**
     * Окно ПРОСМОТРА
     */
    openQuestViewModal(id) {
        const q = this.getActiveMod().quests.find(item => item.id === id);
        if (!q) return;
        const modal = document.getElementById('quest-view-modal');
        
        let icon = q.icon || (q.reqs?.[0]?.item?.image) || 'book.png';
        document.getElementById('view-quest-icon').innerHTML = `<img src="${ItemsDB.getImageUrl(icon)}" width="64">`;
        document.getElementById('view-quest-title').innerHTML = ItemsDB.formatMC(q.title);
        document.getElementById('view-quest-desc').innerHTML = ItemsDB.formatMC(q.desc || 'Нет описания.');
        
        const renderBox = (id, list) => {
            document.getElementById(id).innerHTML = list.map(r => `
                <div class="view-item-row">
                    <div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item?r.item.image:'')}"></div>
                    <div class="item-info"><span>${ItemsDB.formatMC(r.customName || (r.item?r.item.name:''))} x${r.count}</span></div>
                </div>
            `).join('') || '<div style="padding:10px; color:#666;">Пусто</div>';
        };
        renderBox('view-reqs-list', q.reqs || []);
        renderBox('view-rewards-list', q.rewards || []);
        modal.classList.remove('hidden');
    },

    getActiveMod() { return this.data.mods.find(m => m.id === this.activeModId); }
};
