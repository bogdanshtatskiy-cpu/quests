import { ItemsDB } from './items.js';
import { DB } from './db.js';
import { Auth } from './auth.js';
import { BQ } from './bq.js';

const SIZE_MAP = { x1: 52, x2: 104, x3: 156, x4: 208 };
const getSafeSize = (s) => { const compat = { sm: 'x1', md: 'x1', lg: 'x2' }; return compat[s] || s || 'x1'; };

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
        document.getElementById('btn-toggle-titles').addEventListener('click', () => document.body.classList.toggle('show-titles'));
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
            if (confirm('Отменить импорт? Вернется старая база квестов.')) {
                this.isImportMode = false;
                this.data.mods = JSON.parse(JSON.stringify(this.originalData)); 
                this.activeModId = this.data.mods.length > 0 ? this.data.mods[0].id : null;
                document.getElementById('import-mode-bar').classList.add('hidden');
                document.body.classList.remove('import-mode');
                this.renderSidebar(); this.renderCanvas(); this.centerCanvas();
            }
        });

        document.getElementById('btn-apply-import').addEventListener('click', async () => {
            if (confirm('ВНИМАНИЕ! Это перезапишет базу квестов. Вы уверены?')) {
                this.isImportMode = false;
                document.getElementById('import-mode-bar').classList.add('hidden');
                document.body.classList.remove('import-mode');
                await DB.saveQuestsSilent(this.data.mods);
                DB.logAction('Выполнил импорт базы BetterQuesting');
                alert('Импорт успешно сохранен!');
            }
        });

        document.getElementById('btn-export-bq').addEventListener('click', () => BQ.exportData(this.data.mods));
    },

    triggerAutoSave() {
        if (!Auth.user || this.isImportMode) return; 
        const indicator = document.getElementById('save-indicator');
        indicator.classList.remove('hidden'); indicator.innerText = "Сохранение..."; 
        indicator.style.display = 'block';

        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            await DB.saveQuestsSilent(this.data.mods);
            indicator.innerText = "Сохранено ✔"; 
            setTimeout(() => {
                indicator.classList.add('hidden');
                indicator.style.display = 'none';
            }, 2000);
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

        const padding = 100; const boxWidth = maxX - minX; const boxHeight = maxY - minY;
        const contW = container.clientWidth; const contH = container.clientHeight;
        const scaleX = (contW - padding * 2) / (boxWidth || 1); const scaleY = (contH - padding * 2) / (boxHeight || 1);
        
        this.scale = Math.max(0.1, Math.min(scaleX, scaleY, 1.5));
        const centerX = minX + boxWidth / 2; const centerY = minY + boxHeight / 2;
        this.panX = (contW / 2) - centerX * this.scale; this.panY = (contH / 2) - centerY * this.scale;
        this.updateTransform();
    },

    bindCanvasEvents() {
        const container = document.getElementById('canvas-container');
        const tooltip = document.getElementById('quest-tooltip');
        const contextMenu = document.getElementById('node-context-menu');

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
            const canvasX = (mouseX - this.panX) / this.scale; const canvasY = (mouseY - this.panY) / this.scale;

            this.scale = Math.min(Math.max(0.1, this.scale * zoomAmount), 3);
            this.panX = mouseX - canvasX * this.scale; this.panY = mouseY - canvasY * this.scale;
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
                const dx = (e.clientX - this.mouseStartX) / this.scale; const dy = (e.clientY - this.mouseStartY) / this.scale;
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

        container.addEventListener('mouseleave', () => {
            tooltip.classList.add('hidden'); this.hoveredQuestId = null; this.isPanning = false;
            if(this.draggedQuestId && this.hasMovedNode) this.triggerAutoSave();
            this.draggedQuestId = null;
        });

        window.addEventListener('mouseup', () => {
            this.isPanning = false;
            if (this.draggedQuestId && this.hasMovedNode) this.triggerAutoSave();
            this.draggedQuestId = null; container.style.cursor = 'default';
        });

        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!Auth.user) return; 
            if (!this.activeModId) return alert('Выберите ветку квестов!');
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

        const nodesFragment = document.createDocumentFragment();
        const linesFragment = document.createDocumentFragment();

        mod.quests.forEach(quest => {
            if (quest.parents) {
                quest.parents.forEach(pId => {
                    const parent = mod.quests.find(q => q.id === pId);
                    if (parent) this.drawLine(linesFragment, parent, quest);
                });
            }
        });

        mod.quests.forEach(quest => {
            const node = document.createElement('div');
            const nodeSize = getSafeSize(quest.size);
            node.className = `quest-node size-${nodeSize}`;
            
            if (this.linkingFromNodeId === quest.id) node.classList.add('selected');
            node.style.left = `${quest.x}px`; node.style.top = `${quest.y}px`;
            node.dataset.id = quest.id;
            
            let iconStr = '';
            if (quest.icon) iconStr = quest.icon;
            else if (quest.reqs && quest.reqs.length > 0) iconStr = quest.reqs[0].item.image;

            const iconPath = iconStr ? ItemsDB.getImageUrl(iconStr) : '';
            node.innerHTML = `${iconPath ? `<img src="${iconPath}" loading="lazy">` : ''}<div class="node-title">${ItemsDB.formatMC(quest.title)}</div>`;

            nodesFragment.appendChild(node);
        });

        linesLayer.appendChild(linesFragment);
        nodesLayer.appendChild(nodesFragment);

        if (!skipSave) this.updateSummary();
    },

    drawLine(svg, parent, child) {
        const pSize = SIZE_MAP[getSafeSize(parent.size)] / 2; const cSize = SIZE_MAP[getSafeSize(child.size)] / 2;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', parent.x + pSize); line.setAttribute('y1', parent.y + pSize);
        line.setAttribute('x2', child.x + cSize); line.setAttribute('y2', child.y + cSize);
        line.setAttribute('class', 'quest-line'); svg.appendChild(line);
    },

    getTaskLabel(r) {
        const t = r.taskType || 'retrieval';
        let name = r.customName || r.item.name;
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
        let name = r.customName || r.item.name;
        if (r.item && (r.item.string_id === 'bq_standard:loot_chest' || r.item.item_key === 'bq_standard:loot_chest')) {
            const tierName = this.lootGroups && this.lootGroups[r.damage] ? this.lootGroups[r.damage] : `Тир ${r.damage||0}`;
            return `🎁 Лутбокс [${tierName}]`;
        }
        return ItemsDB.formatMC(name);
    },

    showTooltip(quest) {
        const tt = document.getElementById('quest-tooltip');
        document.getElementById('tt-title').innerHTML = ItemsDB.formatMC(quest.title);
        document.getElementById('tt-desc').innerHTML = ItemsDB.formatMC(quest.desc || '');
        
        let reqHtml = '';
        if (quest.reqs && quest.reqs.length > 0) {
            quest.reqs.forEach(r => { 
                const consumeTag = (r.taskType !== 'hunt' && r.taskType !== 'block_break' && r.taskType !== 'checkbox' && r.taskType !== 'xp') 
                    ? (r.consume !== false ? '<span style="color:#ff5555; font-size:12px; margin-left:6px;">[Забрать]</span>' : '<span style="color:#aaaaaa; font-size:12px; margin-left:6px;">[Наличие]</span>')
                    : '';
                reqHtml += `<div class="tt-item"><img src="${ItemsDB.getImageUrl(r.item.image)}" loading="lazy">${this.getTaskLabel(r)} x${r.count}${consumeTag}</div>`; 
            });
        } else reqHtml = 'Нет требований';
        document.getElementById('tt-reqs').innerHTML = reqHtml;

        let rewHtml = '';
        if (quest.rewards && quest.rewards.length > 0) {
            quest.rewards.forEach(r => { 
                const choiceTag = r.isChoice ? '<span style="color:#ffff55; font-size:12px; margin-left:6px;">[На выбор]</span>' : '';
                rewHtml += `<div class="tt-item"><img src="${ItemsDB.getImageUrl(r.item.image)}" loading="lazy">${this.getRewardLabel(r)} x${r.count}${choiceTag}</div>`; 
            });
        } else rewHtml = 'Нет наград';
        document.getElementById('tt-rewards').innerHTML = rewHtml;

        tt.classList.remove('hidden');
    },

    updateSummary() {
        const container = document.getElementById('rewards-summary-list');
        const summaryPanel = document.getElementById('rewards-summary');
        
        const mod = this.getActiveMod();
        if (!mod) { summaryPanel.classList.add('hidden'); container.innerHTML = ''; return; }

        const totals = {};
        mod.quests.forEach(q => {
            (q.rewards || []).forEach(r => {
                const name = this.getRewardLabel(r);
                const key = name + (r.isChoice ? '___CHOICE' : '___GUARANTEED');
                if (!totals[key]) totals[key] = { count: 0, item: r.item, name: name, isChoice: r.isChoice };
                totals[key].count += parseInt(r.count || 1);
            });
        });

        if (Object.keys(totals).length > 0) {
            summaryPanel.classList.remove('hidden');
            let htmlStr = ''; 
            for (const key in totals) {
                const choiceTag = totals[key].isChoice ? '<span style="color:#ffff55; font-size:12px; margin-left:4px;">[На выбор]</span>' : '';
                htmlStr += `<div class="summary-item"><img src="${ItemsDB.getImageUrl(totals[key].item.image)}" loading="lazy"> ${totals[key].count}x ${totals[key].name}${choiceTag}</div>`;
            }
            container.innerHTML = htmlStr;
        } else {
            summaryPanel.classList.add('hidden');
            container.innerHTML = '';
        }
    },

    bindNbtModalEvents() {
        document.getElementById('btn-close-nbt').addEventListener('click', () => {
            document.getElementById('nbt-editor-modal').classList.add('hidden');
            this.tempNbtTarget = null;
        });

        document.getElementById('btn-save-nbt').addEventListener('click', () => {
            const text = document.getElementById('nbt-editor-textarea').value;
            const errDiv = document.getElementById('nbt-editor-error');
            try {
                const parsed = text.trim() === '' || text.trim() === '{}' ? null : JSON.parse(text);
                if (this.tempNbtTarget) {
                    this.tempNbtTarget.nbtTag = parsed;
                    this.tempNbtTarget.customName = BQ.getCustomName(this.tempNbtTarget.item, parsed);
                }
                document.getElementById('nbt-editor-modal').classList.add('hidden');
                errDiv.innerText = '';
                this.renderQuestEditForm(); 
            } catch(e) { errDiv.innerText = 'Ошибка JSON! ' + e.message; }
        });
    },

    saveTempState() {
        this.tempReqs.forEach((r, idx) => {
            const typeSel = document.getElementById(`req-type-${idx}`);
            if(typeSel) r.taskType = typeSel.value;
            const countInp = document.getElementById(`req-count-${idx}`);
            if (countInp) r.count = countInp.value;
            const targetInp = document.getElementById(`req-target-${idx}`);
            const nameInp = document.getElementById(`req-name-${idx}`);
            if (r.taskType === 'hunt' || r.taskType === 'fluid') {
                if (targetInp) { r.target = targetInp.value; r.customName = targetInp.value; }
            } else if (r.taskType !== 'xp' && r.taskType !== 'checkbox') {
                if (nameInp) r.customName = nameInp.value;
            }
            const consumeCb = document.getElementById(`req-consume-${idx}`);
            if (consumeCb) r.consume = consumeCb.checked;
        });
        this.tempRewards.forEach((r, idx) => {
            const typeSel = document.getElementById(`rew-type-${idx}`);
            if(typeSel) r.taskType = typeSel.value;
            const countInp = document.getElementById(`rew-count-${idx}`);
            if (countInp) r.count = countInp.value;
            const nameInp = document.getElementById(`rew-name-${idx}`);
            const cmdInp = document.getElementById(`rew-command-${idx}`);
            const tierSel = document.getElementById(`rew-tier-${idx}`);
            const choiceCb = document.getElementById(`rew-choice-${idx}`);
            if (r.taskType === 'command') { if (cmdInp) r.command = cmdInp.value; } 
            else if (r.taskType !== 'xp') { if (nameInp) r.customName = nameInp.value; }
            if (tierSel) r.damage = parseInt(tierSel.value);
            if (choiceCb) r.isChoice = choiceCb.checked;
        });
    },

    copyQuest(questId) {
        const mod = this.getActiveMod();
        const q = mod.quests.find(q => q.id === questId);
        if (!q) return;
        const newQuest = {
            id: 'q_' + Date.now(), x: q.x + 60, y: q.y + 60, title: q.title + ' (Копия)', desc: q.desc,
            size: q.size, icon: q.icon, reqs: JSON.parse(JSON.stringify(q.reqs || [])),
            rewards: JSON.parse(JSON.stringify(q.rewards || [])), parents: [] 
        };
        mod.quests.push(newQuest);
        this.triggerAutoSave(); this.renderCanvas();
    },

    bindQuestModalEvents() {
        const modal = document.getElementById('quest-edit-modal');
        document.getElementById('btn-close-view').addEventListener('click', () => document.getElementById('quest-view-modal').classList.add('hidden'));
        document.getElementById('btn-toggle-all-consume').addEventListener('click', () => {
            this.saveTempState(); 
            const target = this.tempReqs.some(r => r.consume === false);
            this.tempReqs.forEach(r => r.consume = target);
            this.renderQuestEditForm();
        });
        document.getElementById('btn-select-quest-icon').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((item) => {
                this.tempQuestIcon = item.image;
                document.getElementById('quest-icon-preview').innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" style="width:32px; height:32px; image-rendering:pixelated;">`;
            });
        });
        document.getElementById('btn-add-req').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((item) => { 
                this.tempReqs.push({ item: item, count: 1, customName: BQ.getCustomName(item, null), consume: true, taskType: 'retrieval', nbtTag: null }); 
                this.renderQuestEditForm(); 
            });
        });
        document.getElementById('btn-add-reward').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((item) => { 
                this.tempRewards.push({ item: item, count: 1, customName: BQ.getCustomName(item, null), isChoice: false, damage: item.damage || 0, taskType: 'item', nbtTag: null }); 
                this.renderQuestEditForm(); 
            });
        });
        document.getElementById('btn-save-quest').addEventListener('click', () => {
            this.saveTempState(); 
            const mod = this.getActiveMod();
            const q = this.editingNodeId ? mod.quests.find(q => q.id === this.editingNodeId) : null;
            const data = {
                title: document.getElementById('quest-title').value || 'Безымянный квест',
                desc: document.getElementById('quest-desc').value,
                size: document.getElementById('quest-size').value,
                icon: this.tempQuestIcon, reqs: [...this.tempReqs], rewards: [...this.tempRewards]
            };
            if (q) Object.assign(q, data);
            else mod.quests.push({ id: 'q_' + Date.now(), x: this.newQuestX, y: this.newQuestY, parents: [], ...data });
            this.triggerAutoSave(); modal.classList.add('hidden'); this.renderCanvas();
        });
        document.getElementById('btn-delete-quest').addEventListener('click', () => {
            if(this.editingNodeId && confirm('Удалить квест?')) {
                const mod = this.getActiveMod();
                mod.quests = mod.quests.filter(q => q.id !== this.editingNodeId);
                this.triggerAutoSave(); modal.classList.add('hidden'); this.renderCanvas();
            }
        });
        document.getElementById('btn-close-quest').addEventListener('click', () => modal.classList.add('hidden'));
    },

    openQuestViewModal(questId) {
        const mod = this.getActiveMod();
        const quest = mod.quests.find(q => q.id === questId);
        if (!quest) return;
        const modal = document.getElementById('quest-view-modal');
        let iconStr = quest.icon || (quest.reqs?.[0]?.item?.image);
        document.getElementById('view-quest-icon').innerHTML = iconStr ? `<img src="${ItemsDB.getImageUrl(iconStr)}" style="width:100%; height:100%; object-fit:contain; image-rendering:pixelated;">` : '';
        document.getElementById('view-quest-title').innerHTML = ItemsDB.formatMC(quest.title);
        document.getElementById('view-quest-desc').innerHTML = ItemsDB.formatMC(quest.desc || 'Нет описания.');
        
        document.getElementById('view-reqs-list').innerHTML = (quest.reqs || []).map(r => `
            <div class="view-item-row">
                <div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item.image)}"></div>
                <div class="item-info"><span class="item-name">${this.getTaskLabel(r)} x${r.count}</span></div>
            </div>
        `).join('') || '<div style="padding:15px; color:#aaa;">Нет требований</div>';

        document.getElementById('view-rewards-list').innerHTML = (quest.rewards || []).map(r => `
            <div class="view-item-row">
                <div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item.image)}"></div>
                <div class="item-info"><span class="item-name">${this.getRewardLabel(r)} x${r.count}</span></div>
            </div>
        `).join('') || '<div style="padding:15px; color:#aaa;">Нет наград</div>';
        modal.classList.remove('hidden');
    },

    openQuestModal(questId = null) {
        this.editingNodeId = questId;
        const modal = document.getElementById('quest-edit-modal');
        const q = questId ? this.getActiveMod().quests.find(q => q.id === questId) : null;
        document.getElementById('quest-title').value = q ? q.title : '';
        document.getElementById('quest-desc').value = q ? q.desc : '';
        document.getElementById('quest-size').value = q ? getSafeSize(q.size) : 'x1';
        this.tempQuestIcon = q ? q.icon : null;
        this.tempReqs = q ? JSON.parse(JSON.stringify(q.reqs || [])) : [];
        this.tempRewards = q ? JSON.parse(JSON.stringify(q.rewards || [])) : [];
        document.getElementById('quest-icon-preview').innerHTML = this.tempQuestIcon ? `<img src="${ItemsDB.getImageUrl(this.tempQuestIcon)}" style="width:32px; height:32px; image-rendering:pixelated;">` : '';
        this.renderQuestEditForm();
        modal.classList.remove('hidden');
    },

    renderQuestEditForm() {
        const renderList = (box, list, isRew) => {
            box.innerHTML = list.map((r, idx) => {
                const t = r.taskType || (isRew ? 'item' : 'retrieval');
                const nbtStyle = r.nbtTag ? 'color:#55ffff; border-color:#55ffff;' : '';
                const isLoot = isRew && r.item?.item_key === 'bq_standard:loot_chest';
                return `
                    <div class="reward-row">
                        <div class="mc-slot item-icon-btn" data-idx="${idx}" style="cursor:pointer; flex-shrink:0;">
                            <img src="${ItemsDB.getImageUrl(r.item.image)}" width="24" height="24">
                        </div>
                        <input type="number" id="${isRew?'rew':'req'}-count-${idx}" class="mc-input" style="width:60px;" value="${r.count}">
                        <input type="text" id="${isRew?'rew':'req'}-name-${idx}" class="mc-input custom-name-input" value="${r.customName || ''}">
                        <button class="mc-button btn-nbt" data-idx="${idx}" style="${nbtStyle}">[NBT]</button>
                        <button class="mc-button danger" data-idx="${idx}">X</button>
                    </div>
                `;
            }).join('');
            
            box.querySelectorAll('.item-icon-btn').forEach(btn => btn.addEventListener('click', (e) => {
                this.saveTempState();
                this.openItemPicker((item) => { 
                    list[btn.dataset.idx].item = item; 
                    list[btn.dataset.idx].customName = BQ.getCustomName(item, list[btn.dataset.idx].nbtTag);
                    this.renderQuestEditForm(); 
                });
            }));
            box.querySelectorAll('.btn-nbt').forEach(btn => btn.addEventListener('click', () => {
                this.saveTempState();
                this.tempNbtTarget = list[btn.dataset.idx];
                document.getElementById('nbt-editor-textarea').value = JSON.stringify(this.tempNbtTarget.nbtTag || {}, null, 2);
                document.getElementById('nbt-editor-modal').classList.remove('hidden');
            }));
            box.querySelectorAll('.danger').forEach(btn => btn.addEventListener('click', () => { list.splice(btn.dataset.idx, 1); this.renderQuestEditForm(); }));
        };
        renderList(document.getElementById('reqs-list'), this.tempReqs, false);
        renderList(document.getElementById('rewards-list'), this.tempRewards, true);
    },

    bindItemPickerEvents() {
        const modal = document.getElementById('item-picker-modal');
        const resultsContainer = document.getElementById('picker-results');
        const searchInp = document.getElementById('picker-search');
        
        const createItemElement = (item, isLoot = false) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" width="32" height="32" loading="lazy"><span>${ItemsDB.formatMC(item.name)}</span>`;
            div.addEventListener('click', () => { 
                modal.classList.add('hidden'); 
                if (this.pickerCallback) this.pickerCallback(item); 
            });
            return div;
        };

        const triggerSearch = () => {
            const data = ItemsDB.search(searchInp.value, '');
            resultsContainer.innerHTML = '';
            const frag = document.createDocumentFragment();
            data.slice(0, 50).forEach(item => frag.appendChild(createItemElement(item)));
            resultsContainer.appendChild(frag);
        };

        searchInp.addEventListener('input', triggerSearch);
        document.getElementById('btn-picker-cancel').addEventListener('click', () => modal.classList.add('hidden'));

        this.openItemPicker = (cb) => {
            this.pickerCallback = cb;
            searchInp.value = '';
            triggerSearch();
            
            // Рендер лутбоксов в правую панель
            const lootBox = document.getElementById('picker-loot-results');
            lootBox.innerHTML = Object.entries(this.lootGroups).map(([id, name]) => `
                <div class="search-result-item loot-item" data-id="${id}" data-name="${name}">
                    <img src="${ItemsDB.getImageUrl('chest.png')}" width="24" height="24">
                    <span>${ItemsDB.formatMC(name)}</span>
                </div>
            `).join('') || '<div style="color:#666; font-size:12px; padding:10px;">Нет лутбоксов</div>';
            
            lootBox.querySelectorAll('.loot-item').forEach(btn => btn.addEventListener('click', () => {
                modal.classList.add('hidden');
                cb({ item_key: 'bq_standard:loot_chest', string_id: 'bq_standard:loot_chest', name: btn.dataset.name, image: 'chest.png', damage: parseInt(btn.dataset.id) });
            }));

            modal.classList.remove('hidden');
        };
    },

    bindModModalEvents() {
        const modal = document.getElementById('add-mod-modal');
        document.getElementById('btn-add-mod').addEventListener('click', () => {
            this.editingModId = null; this.tempModIcon = null;
            document.getElementById('new-mod-name').value = '';
            document.getElementById('mod-icon-preview').innerHTML = '';
            modal.classList.remove('hidden');
        });
        document.getElementById('btn-close-mod').addEventListener('click', () => modal.classList.add('hidden'));
        document.getElementById('btn-select-mod-icon').addEventListener('click', () => {
            this.openItemPicker((item) => {
                this.tempModIcon = item.image;
                document.getElementById('mod-icon-preview').innerHTML = `<div class="mc-slot"><img src="${ItemsDB.getImageUrl(item.image)}" width="32" height="32"></div>`;
            });
        });
        document.getElementById('btn-save-mod').addEventListener('click', () => {
            const name = document.getElementById('new-mod-name').value;
            if (!name || !this.tempModIcon) return alert('Заполните данные!');
            if (this.editingModId) {
                const m = this.data.mods.find(m => m.id === this.editingModId);
                m.name = name; m.icon = this.tempModIcon;
            } else {
                this.data.mods.push({ id: 'mod_' + Date.now(), name, icon: this.tempModIcon, quests: [] });
            }
            this.triggerAutoSave(); modal.classList.add('hidden'); this.renderSidebar();
        });
    },

    renderSidebar() {
        document.getElementById('mod-list').innerHTML = this.data.mods.map((mod) => `
            <li class="mod-item ${this.activeModId === mod.id ? 'active' : ''}" data-id="${mod.id}">
                <div class="mod-item-content">
                    <img src="${ItemsDB.getImageUrl(mod.icon)}" width="24" height="24">
                    <span>${ItemsDB.formatMC(mod.name)}</span>
                </div>
            </li>
        `).join('');
        document.querySelectorAll('.mod-item').forEach(li => li.addEventListener('click', () => {
            this.activeModId = li.dataset.id; this.renderSidebar(); this.renderCanvas(); this.centerCanvas();
        }));
    },

    getActiveMod() { return this.data.mods.find(m => m.id === this.activeModId); }
};
