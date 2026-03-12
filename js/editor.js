import { ItemsDB } from './items.js';
import { DB } from './db.js';
import { Auth } from './auth.js';
import { BQ } from './bq.js';

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
    lootGroups: {}, 
    
    scale: 1, panX: 0, panY: 0, 
    isPanning: false, panStartX: 0, panStartY: 0, initialPanX: 0, initialPanY: 0,
    
    draggedQuestId: null, mouseStartX: 0, mouseStartY: 0, nodeStartX: 0, nodeStartY: 0, hasMovedNode: false,
    linkingFromNodeId: null, contextNodeId: null, editingNodeId: null, hoveredQuestId: null,
    
    pickerCallback: null, tempReqs: [], tempRewards: [], tempQuestIcon: null, editingModId: null, tempModIcon: null, saveTimeout: null,
    tempNbtTarget: null,

    init() {
        this.bindCanvasEvents(); 
        this.bindModModalEvents(); 
        this.bindQuestModalEvents();
        this.bindItemPickerEvents(); 
        this.bindTopBarEvents();
        this.bindNbtModalEvents(); 
    },

    addMobToDatalist(mobName) {
        const datalist = document.getElementById('mob-list');
        if (!datalist) return;
        const exists = Array.from(datalist.options).some(opt => opt.value === mobName);
        if (!exists) { 
            const opt = document.createElement('option'); 
            opt.value = mobName; 
            datalist.appendChild(opt); 
        }
    },

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

        const fileInput = document.getElementById('bq-file-input');
        document.getElementById('btn-import-bq').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => { BQ.parseData(event.target.result, this); fileInput.value = ''; };
            reader.readAsText(file);
        });

        document.getElementById('btn-cancel-import').addEventListener('click', () => {
            if (confirm('Отменить импорт?')) {
                this.isImportMode = false;
                this.data.mods = JSON.parse(JSON.stringify(this.originalData)); 
                this.activeModId = this.data.mods.length > 0 ? this.data.mods[0].id : null;
                document.getElementById('import-mode-bar').classList.add('hidden');
                document.body.classList.remove('import-mode');
                this.renderSidebar(); this.renderCanvas(); this.centerCanvas();
            }
        });

        document.getElementById('btn-apply-import').addEventListener('click', async () => {
            if (confirm('ВНИМАНИЕ! Это перезапишет базу. Продолжить?')) {
                this.isImportMode = false;
                document.getElementById('import-mode-bar').classList.add('hidden');
                document.body.classList.remove('import-mode');
                await DB.saveQuestsSilent(this.data.mods);
                DB.logAction('Выполнил импорт базы BetterQuesting');
            }
        });

        document.getElementById('btn-export-bq').addEventListener('click', () => BQ.exportData(this.data.mods));
    },

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
        this.scale = Math.max(0.1, Math.min((container.clientWidth - padding*2)/(maxX-minX || 1), (container.clientHeight - padding*2)/(maxY-minY || 1), 1.5));
        this.panX = (container.clientWidth / 2) - (minX + (maxX - minX) / 2) * this.scale;
        this.panY = (container.clientHeight / 2) - (minY + (maxY - minY) / 2) * this.scale;
        this.updateTransform();
    },

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
                this.isPanning = true; this.panStartX = e.clientX; this.panStartY = e.clientY;
                this.initialPanX = this.panX; this.initialPanY = this.panY; container.style.cursor = 'grabbing';
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
                quest.x = this.nodeStartX + dx; quest.y = this.nodeStartY + dy;
                this.renderCanvas(true); 
            }
            const hoveredNode = e.target.closest('.quest-node');
            if (hoveredNode && !this.isPanning && !this.draggedQuestId && contextMenu.classList.contains('hidden')) {
                const questId = hoveredNode.dataset.id;
                if (this.hoveredQuestId !== questId) {
                    this.hoveredQuestId = questId;
                    const quest = this.getActiveMod().quests.find(q => q.id === questId);
                    if (quest) this.showTooltip(quest);
                }
                tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px';
            } else { this.hoveredQuestId = null; tooltip.classList.add('hidden'); }
        });

        window.addEventListener('mouseup', () => {
            this.isPanning = false;
            if (this.draggedQuestId && this.hasMovedNode) this.triggerAutoSave();
            this.draggedQuestId = null; container.style.cursor = 'default';
        });

        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            // ФИКС ТУЛТИПА: Скрываем при вызове меню
            tooltip.classList.add('hidden');

            if (!Auth.user) return; 
            if (!this.activeModId) return;
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

    updateTransform() { document.getElementById('quest-canvas').style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`; },

    renderCanvas(skipSave = false) {
        const nodesLayer = document.getElementById('nodes-layer');
        const linesLayer = document.getElementById('connections-layer');
        nodesLayer.innerHTML = ''; linesLayer.innerHTML = '';
        const mod = this.getActiveMod();
        if (!mod) { this.updateSummary(); return; }

        const nodesFrag = document.createDocumentFragment();
        const linesFrag = document.createDocumentFragment();

        mod.quests.forEach(q => {
            if (q.parents) {
                q.parents.forEach(pId => {
                    const p = mod.quests.find(quest => quest.id === pId);
                    if (p) this.drawLine(linesFrag, p, q);
                });
            }
        });

        mod.quests.forEach(quest => {
            const node = document.createElement('div');
            const sz = getSafeSize(quest.size);
            node.className = `quest-node size-${sz}`;
            if (this.linkingFromNodeId === quest.id) node.classList.add('selected');
            node.style.left = `${quest.x}px`; node.style.top = `${quest.y}px`;
            node.dataset.id = quest.id;
            
            // ФИКС КАРТИНОК: Более надежная логика выбора иконки
            let iconPath = '';
            let iconFile = quest.icon;
            if (!iconFile && quest.reqs && quest.reqs.length > 0) {
                // Берем картинку первого требования
                iconFile = quest.reqs[0].item ? quest.reqs[0].item.image : '';
            }
            if (!iconFile && quest.rewards && quest.rewards.length > 0) {
                // Или первой награды
                iconFile = quest.rewards[0].item ? quest.rewards[0].item.image : '';
            }
            // Если совсем ничего нет — ставим заглушку (книга или сундук)
            if (!iconFile) iconFile = 'book.png'; 

            iconPath = ItemsDB.getImageUrl(iconFile);

            node.innerHTML = `<img src="${iconPath}" loading="lazy"><div class="node-title">${ItemsDB.formatMC(quest.title)}</div>`;

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
                        e.stopPropagation(); this.draggedQuestId = quest.id; this.hasMovedNode = false;
                        this.mouseStartX = e.clientX; this.mouseStartY = e.clientY;
                        this.nodeStartX = quest.x; this.nodeStartY = quest.y;
                    }
                }
            });

            node.addEventListener('click', (e) => {
                // ФИКС ТУЛТИПА: Скрываем при клике
                document.getElementById('quest-tooltip').classList.add('hidden');
                if (e.button !== 0 || (e.shiftKey && Auth.user) || this.hasMovedNode) return; 
                this.openQuestViewModal(quest.id);
            });

            nodesFrag.appendChild(node);
        });

        linesLayer.appendChild(linesFrag);
        nodesLayer.appendChild(nodesFrag);
        if (!skipSave) this.updateSummary();
    },

    drawLine(svg, p, c) {
        const ps = SIZE_MAP[getSafeSize(p.size)] / 2; const cs = SIZE_MAP[getSafeSize(c.size)] / 2;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p.x + ps); line.setAttribute('y1', p.y + ps);
        line.setAttribute('x2', c.x + cs); line.setAttribute('y2', c.y + cs);
        line.setAttribute('class', 'quest-line'); svg.appendChild(line);
    },

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

    showTooltip(quest) {
        const tt = document.getElementById('quest-tooltip');
        document.getElementById('tt-title').innerHTML = ItemsDB.formatMC(quest.title);
        document.getElementById('tt-desc').innerHTML = ItemsDB.formatMC(quest.desc || '');
        document.getElementById('tt-reqs').innerHTML = (quest.reqs || []).map(r => {
            const con = (r.taskType !== 'hunt' && r.taskType !== 'block_break' && r.taskType !== 'checkbox') ? (r.consume !== false ? ' <span style="color:#f55;">[Забрать]</span>' : ' <span style="color:#aaa;">[Наличие]</span>') : '';
            const img = r.item ? ItemsDB.getImageUrl(r.item.image) : '';
            return `<div class="tt-item"><img src="${img}" loading="lazy">${this.getTaskLabel(r)} x${r.count}${con}</div>`;
        }).join('') || 'Нет требований';
        document.getElementById('tt-rewards').innerHTML = (quest.rewards || []).map(r => {
            const ch = r.isChoice ? ' <span style="color:#ff5;">[Выбор]</span>' : '';
            const img = r.item ? ItemsDB.getImageUrl(r.item.image) : '';
            return `<div class="tt-item"><img src="${img}" loading="lazy">${this.getRewardLabel(r)} x${r.count}${ch}</div>`;
        }).join('') || 'Нет наград';
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
            box.innerHTML = Object.values(totals).map(t => `<div class="summary-item"><img src="${ItemsDB.getImageUrl(t.item?t.item.image:'')}" loading="lazy"> ${t.count}x ${t.name}${t.isChoice ? ' <small>[Выбор]</small>':''}</div>`).join('');
        } else pan.classList.add('hidden');
    },

    bindNbtModalEvents() {
        document.getElementById('btn-close-nbt').addEventListener('click', () => {
            document.getElementById('nbt-editor-modal').classList.add('hidden');
            this.tempNbtTarget = null;
        });
        document.getElementById('btn-save-nbt').addEventListener('click', () => {
            const text = document.getElementById('nbt-editor-textarea').value;
            const err = document.getElementById('nbt-editor-error');
            try {
                const p = text.trim()===''||text.trim()==='{}' ? null : JSON.parse(text);
                if (this.tempNbtTarget) { this.tempNbtTarget.nbtTag = p; this.tempNbtTarget.customName = BQ.getCustomName(this.tempNbtTarget.item, p); }
                document.getElementById('nbt-editor-modal').classList.add('hidden');
                err.innerText = ''; this.renderQuestEditForm(); 
            } catch(e) { err.innerText = 'Ошибка JSON: ' + e.message; }
        });
    },

    saveTempState() {
        const save = (l, p) => {
            l.forEach((r, i) => {
                const c = document.getElementById(`${p}-count-${i}`);
                const n = document.getElementById(`${p}-name-${i}`);
                if (c) r.count = c.value;
                if (n) r.customName = n.value;
                if (p === 'req') { const cb = document.getElementById(`req-consume-${i}`); if (cb) r.consume = cb.checked; }
                else { const cb = document.getElementById(`rew-choice-${i}`); if (cb) r.isChoice = cb.checked; }
            });
        };
        save(this.tempReqs, 'req'); save(this.tempRewards, 'rew');
    },

    copyQuest(id) {
        const mod = this.getActiveMod();
        const q = mod.quests.find(q => q.id === id);
        if (!q) return;
        const n = { id: 'q_' + Date.now(), x: q.x + 60, y: q.y + 60, title: q.title + ' (Копия)', desc: q.desc, size: q.size, icon: q.icon, reqs: JSON.parse(JSON.stringify(q.reqs || [])), rewards: JSON.parse(JSON.stringify(q.rewards || [])), parents: [] };
        mod.quests.push(n); this.triggerAutoSave(); this.renderCanvas();
    },

    bindQuestModalEvents() {
        const modal = document.getElementById('quest-edit-modal');
        document.getElementById('btn-close-view').addEventListener('click', () => document.getElementById('quest-view-modal').classList.add('hidden'));
        document.getElementById('btn-toggle-all-consume').addEventListener('click', () => {
            this.saveTempState(); this.tempReqs.forEach(r => r.consume = this.tempReqs.some(req => req.consume === false));
            this.renderQuestEditForm();
        });
        document.getElementById('btn-select-quest-icon').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((i) => { this.tempQuestIcon = i.image; document.getElementById('quest-icon-preview').innerHTML = `<img src="${ItemsDB.getImageUrl(i.image)}" style="width:32px; height:32px;">`; });
        });
        document.getElementById('btn-add-req').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((i) => { this.tempReqs.push({ item: i, count: 1, customName: BQ.getCustomName(i, null), consume: true, taskType: 'retrieval', nbtTag: null }); this.renderQuestEditForm(); });
        });
        document.getElementById('btn-add-reward').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((i) => { this.tempRewards.push({ item: i, count: 1, customName: BQ.getCustomName(i, null), isChoice: false, damage: i.damage || 0, taskType: 'item', nbtTag: null }); this.renderQuestEditForm(); });
        });
        document.getElementById('btn-save-quest').addEventListener('click', () => {
            this.saveTempState(); 
            const mod = this.getActiveMod();
            const q = this.editingNodeId ? mod.quests.find(q => q.id === this.editingNodeId) : null;
            const d = { title: document.getElementById('quest-title').value || 'Безымянный квест', desc: document.getElementById('quest-desc').value, size: document.getElementById('quest-size').value, icon: this.tempQuestIcon, reqs: [...this.tempReqs], rewards: [...this.tempRewards] };
            if (q) Object.assign(q, d); else mod.quests.push({ id: 'q_' + Date.now(), x: this.newQuestX, y: this.newQuestY, parents: [], ...d });
            this.triggerAutoSave(); modal.classList.add('hidden'); this.renderCanvas();
        });
        document.getElementById('btn-delete-quest').addEventListener('click', () => {
            if(this.editingNodeId && confirm('Удалить?')) { this.getActiveMod().quests = this.getActiveMod().quests.filter(q => q.id !== this.editingNodeId); this.triggerAutoSave(); modal.classList.add('hidden'); this.renderCanvas(); }
        });
        document.getElementById('btn-close-quest').addEventListener('click', () => modal.classList.add('hidden'));
    },

    openQuestViewModal(id) {
        const mod = this.getActiveMod();
        const q = mod.quests.find(q => q.id === id);
        if (!q) return;
        const modal = document.getElementById('quest-view-modal');
        let iconStr = q.icon || (q.reqs?.[0]?.item?.image) || 'book.png';
        document.getElementById('view-quest-icon').innerHTML = `<img src="${ItemsDB.getImageUrl(iconStr)}" style="width:100%; height:100%; image-rendering:pixelated;">`;
        document.getElementById('view-quest-title').innerHTML = ItemsDB.formatMC(q.title);
        document.getElementById('view-quest-desc').innerHTML = ItemsDB.formatMC(q.desc || 'Нет описания.');
        document.getElementById('view-reqs-list').innerHTML = (q.reqs || []).map(r => `<div class="view-item-row"><div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item?r.item.image:'')}"></div><div class="item-info"><span class="item-name">${this.getTaskLabel(r)} x${r.count}</span></div></div>`).join('') || '<div style="padding:15px; color:#aaa;">Нет требований</div>';
        document.getElementById('view-rewards-list').innerHTML = (q.rewards || []).map(r => `<div class="view-item-row"><div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item?r.item.image:'')}"></div><div class="item-info"><span class="item-name">${this.getRewardLabel(r)} x${r.count}</span></div></div>`).join('') || '<div style="padding:15px; color:#aaa;">Нет наград</div>';
        modal.classList.remove('hidden');
    },

    openQuestModal(id = null) {
        // ФИКС ТУЛТИПА: Скрываем при открытии редактора
        document.getElementById('quest-tooltip').classList.add('hidden');

        this.editingNodeId = id;
        const modal = document.getElementById('quest-edit-modal');
        const q = id ? this.getActiveMod().quests.find(q => q.id === id) : null;
        document.getElementById('quest-title').value = q ? q.title : '';
        document.getElementById('quest-desc').value = q ? q.desc : '';
        document.getElementById('quest-size').value = q ? getSafeSize(q.size) : 'x1';
        this.tempQuestIcon = q ? q.icon : null;
        this.tempReqs = q ? JSON.parse(JSON.stringify(q.reqs || [])) : [];
        this.tempRewards = q ? JSON.parse(JSON.stringify(q.rewards || [])) : [];
        document.getElementById('quest-icon-preview').innerHTML = this.tempQuestIcon ? `<img src="${ItemsDB.getImageUrl(this.tempQuestIcon)}" style="width:32px; height:32px;">` : '';
        this.renderQuestEditForm();
        modal.classList.remove('hidden');
    },

    renderQuestEditForm() {
        const render = (c, l, p) => {
            c.innerHTML = l.map((r, i) => `
                <div class="reward-row">
                    <div class="mc-slot item-icon-btn" data-idx="${i}" style="cursor:pointer; flex-shrink:0;"><img src="${ItemsDB.getImageUrl(r.item?r.item.image:'')}" width="24" height="24"></div>
                    <input type="number" id="${p}-count-${i}" class="mc-input" style="width:65px;" value="${r.count}">
                    <input type="text" id="${p}-name-${i}" class="mc-input custom-name-input" value="${r.customName || ''}">
                    <button class="mc-button btn-nbt" data-idx="${i}" style="${r.nbtTag?'color:#5ff; border-color:#5ff;':''}">[NBT]</button>
                    ${p==='req' ? `<label class="mc-checkbox" style="font-size:10px;"><input type="checkbox" id="req-consume-${i}" ${r.consume!==false?'checked':''}> Забрать</label>` : `<label class="mc-checkbox" style="font-size:10px;"><input type="checkbox" id="rew-choice-${i}" ${r.isChoice?'checked':''}> Выбор</label>`}
                    <button class="mc-button danger btn-del" data-idx="${i}">X</button>
                </div>
            `).join('');
            c.querySelectorAll('.item-icon-btn').forEach(b => b.addEventListener('click', () => { this.saveTempState(); this.openItemPicker(it => { l[b.dataset.idx].item = it; l[b.dataset.idx].customName = BQ.getCustomName(it, l[b.dataset.idx].nbtTag); this.renderQuestEditForm(); }); }));
            c.querySelectorAll('.btn-nbt').forEach(b => b.addEventListener('click', () => { this.saveTempState(); this.tempNbtTarget = l[b.dataset.idx]; document.getElementById('nbt-editor-textarea').value = JSON.stringify(this.tempNbtTarget.nbtTag || {}, null, 2); document.getElementById('nbt-editor-modal').classList.remove('hidden'); }));
            c.querySelectorAll('.btn-del').forEach(b => b.addEventListener('click', () => { l.splice(b.dataset.idx, 1); this.renderQuestEditForm(); }));
        };
        render(document.getElementById('reqs-list'), this.tempReqs, 'req');
        render(document.getElementById('rewards-list'), this.tempRewards, 'rew');
    },

    bindItemPickerEvents() {
        const modal = document.getElementById('item-picker-modal');
        const res = document.getElementById('picker-results');
        const s = document.getElementById('picker-search');
        const create = (i) => {
            const d = document.createElement('div'); d.className = 'search-result-item';
            d.innerHTML = `<img src="${ItemsDB.getImageUrl(i.image)}" width="32" height="32" loading="lazy"><span>${ItemsDB.formatMC(i.name)}</span>`;
            d.addEventListener('click', () => { modal.classList.add('hidden'); if(this.pickerCallback) this.pickerCallback(i); });
            return d;
        };
        s.addEventListener('input', () => {
            const data = ItemsDB.search(s.value, ''); res.innerHTML = '';
            const f = document.createDocumentFragment(); data.slice(0, 60).forEach(i => f.appendChild(create(i))); res.appendChild(f);
        });
        document.getElementById('btn-picker-cancel').addEventListener('click', () => modal.classList.add('hidden'));
        this.openItemPicker = (cb) => {
            this.pickerCallback = cb; s.value = ''; s.dispatchEvent(new Event('input'));
            const lb = document.getElementById('picker-loot-results');
            lb.innerHTML = Object.entries(this.lootGroups).map(([id, n]) => `<div class="search-result-item loot-item" data-id="${id}" data-name="${n}"><img src="${ItemsDB.getImageUrl('chest.png')}" width="24" height="24"><span>${ItemsDB.formatMC(n)}</span></div>`).join('') || '<div style="color:#666; font-size:12px; padding:10px;">Нет лутбоксов</div>';
            lb.querySelectorAll('.loot-item').forEach(b => b.addEventListener('click', () => { modal.classList.add('hidden'); cb({ item_key: 'bq_standard:loot_chest', string_id: 'bq_standard:loot_chest', name: b.dataset.name, image: 'chest.png', damage: parseInt(b.dataset.id) }); }));
            modal.classList.remove('hidden');
        };
    },

    bindModModalEvents() {
        const modal = document.getElementById('add-mod-modal');
        document.getElementById('btn-add-mod').addEventListener('click', () => { this.editingModId = null; this.tempModIcon = null; document.getElementById('new-mod-name').value = ''; document.getElementById('mod-icon-preview').innerHTML = ''; modal.classList.remove('hidden'); });
        document.getElementById('btn-close-mod').addEventListener('click', () => modal.classList.add('hidden'));
        document.getElementById('btn-select-mod-icon').addEventListener('click', () => { this.openItemPicker(it => { this.tempModIcon = it.image; document.getElementById('mod-icon-preview').innerHTML = `<div class="mc-slot"><img src="${ItemsDB.getImageUrl(it.image)}" width="32" height="32"></div>`; }); });
        document.getElementById('btn-save-mod').addEventListener('click', () => {
            const n = document.getElementById('new-mod-name').value;
            if (!n || !this.tempModIcon) return alert('Заполните данные!');
            if (this.editingModId) { const m = this.data.mods.find(m => m.id === this.editingModId); m.name = n; m.icon = this.tempModIcon; }
            else { this.data.mods.push({ id: 'mod_' + Date.now(), name: n, icon: this.tempModIcon, quests: [] }); }
            this.triggerAutoSave(); modal.classList.add('hidden'); this.renderSidebar();
        });
    },

    renderSidebar() {
        document.getElementById('mod-list').innerHTML = this.data.mods.map(m => `<li class="mod-item ${this.activeModId === m.id ? 'active' : ''}" data-id="${m.id}"><div class="mod-item-content"><img src="${ItemsDB.getImageUrl(m.icon)}" width="24" height="24"><span>${ItemsDB.formatMC(m.name)}</span></div></li>`).join('');
        document.querySelectorAll('.mod-item').forEach(li => li.addEventListener('click', () => { this.activeModId = li.dataset.id; this.renderSidebar(); this.renderCanvas(); this.centerCanvas(); }));
    },

    getActiveMod() { return this.data.mods.find(m => m.id === this.activeModId); }
};
