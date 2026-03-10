// js/editor.js
import { ItemsDB } from './items.js';

export const Editor = {
    data: { mods: [] }, 
    /* Структура квеста: 
       { id, x, y, title, desc, reqs: [{item, count, customName}], rewards: [{item, count, customName}], parents: [] }
    */
    activeModId: null,
    
    // Canvas state
    scale: 1, panX: 0, panY: 0,
    isPanning: false, panStartX: 0, panStartY: 0, initialPanX: 0, initialPanY: 0,
    
    // Node state
    draggedQuestId: null, mouseStartX: 0, mouseStartY: 0, nodeStartX: 0, nodeStartY: 0, hasMovedNode: false,
    linkingFromNodeId: null, contextNodeId: null, editingNodeId: null,
    
    // Pickers and Modal State
    pickerCallback: null,
    tempReqs: [],
    tempRewards: [],
    
    // Mod Modal State
    editingModId: null,
    tempModIcon: null,

    init() {
        this.bindCanvasEvents();
        this.bindModModalEvents();
        this.bindQuestModalEvents();
        this.bindItemPickerEvents();
        this.bindTopBarEvents();
        this.renderSidebar();
    },

    bindTopBarEvents() {
        document.getElementById('btn-toggle-titles').addEventListener('click', () => {
            document.body.classList.toggle('show-titles');
        });

        const btnSummary = document.getElementById('btn-toggle-summary');
        const summaryPanel = document.getElementById('rewards-summary');
        
        btnSummary.addEventListener('click', () => {
            summaryPanel.classList.toggle('hidden');
            btnSummary.innerText = summaryPanel.classList.contains('hidden') ? 'Показать награды' : 'Скрыть награды';
        });
    },

    // ==========================================
    // ХОЛСТ: Перемещение, Зум
    // ==========================================
    bindCanvasEvents() {
        const container = document.getElementById('canvas-container');
        const tooltip = document.getElementById('quest-tooltip');
        const contextMenu = document.getElementById('node-context-menu');

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
            this.scale = Math.min(Math.max(0.3, this.scale * zoomAmount), 3);
            this.updateTransform();
        });

        container.addEventListener('mousedown', (e) => {
            contextMenu.classList.add('hidden');
            if (!e.target.closest('.quest-node') && !e.target.closest('.ui-element')) {
                if (e.button === 0) {
                    this.isPanning = true;
                    this.panStartX = e.clientX; this.panStartY = e.clientY;
                    this.initialPanX = this.panX; this.initialPanY = this.panY;
                    container.style.cursor = 'grabbing';
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            // При любом перемещении (drag/pan) прячем тултип чтобы не моргал
            if (this.isPanning || this.draggedQuestId) {
                tooltip.classList.add('hidden');
            }

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
                this.renderCanvas();
            }

            if (!tooltip.classList.contains('hidden')) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            }
        });

        window.addEventListener('mouseup', () => {
            this.isPanning = false;
            this.draggedQuestId = null;
            container.style.cursor = 'default';
        });

        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!this.activeModId) return alert('Выберите ветку квестов!');
            if (e.target.closest('.quest-node') || e.target.closest('.ui-element')) return;

            contextMenu.classList.add('hidden');
            const rect = container.getBoundingClientRect();
            this.newQuestX = (e.clientX - rect.left - this.panX) / this.scale - 24; 
            this.newQuestY = (e.clientY - rect.top - this.panY) / this.scale - 24;
            this.openQuestModal();
        });

        // Кнопки ПКМ-меню узла
        document.getElementById('menu-delete').addEventListener('click', () => {
            contextMenu.classList.add('hidden');
            this.deleteQuest(this.contextNodeId);
        });
        document.getElementById('menu-edit').addEventListener('click', () => {
            contextMenu.classList.add('hidden');
            this.openQuestModal(this.contextNodeId);
        });
        document.getElementById('menu-link').addEventListener('click', () => {
            contextMenu.classList.add('hidden');
            this.linkingFromNodeId = this.contextNodeId;
            this.renderCanvas();
        });
    },

    updateTransform() {
        document.getElementById('quest-canvas').style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    },

    // ==========================================
    // ОТРИСОВКА УЗЛОВ И ЛИНИЙ
    // ==========================================
    renderCanvas() {
        const nodesLayer = document.getElementById('nodes-layer');
        const linesLayer = document.getElementById('connections-layer');
        nodesLayer.innerHTML = ''; linesLayer.innerHTML = '';
        
        const mod = this.getActiveMod();
        if (!mod) { this.updateSummary(); return; }

        mod.quests.forEach(quest => {
            if (quest.parents) {
                quest.parents.forEach(pId => {
                    const parent = mod.quests.find(q => q.id === pId);
                    if (parent) this.drawLine(linesLayer, parent, quest);
                });
            }
        });

        mod.quests.forEach(quest => {
            const node = document.createElement('div');
            node.className = 'quest-node';
            if (this.linkingFromNodeId === quest.id) node.classList.add('selected');
            node.style.left = `${quest.x}px`; node.style.top = `${quest.y}px`;
            
            // Если есть требования - берем первую иконку. Иначе пусто.
            const iconPath = (quest.reqs && quest.reqs.length > 0) ? ItemsDB.getImageUrl(quest.reqs[0].item.image) : '';
            const imgHtml = iconPath ? `<img src="${iconPath}">` : '';

            node.innerHTML = `
                ${imgHtml}
                <div class="node-title">${ItemsDB.formatMC(quest.title)}</div>
            `;

            node.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    if (e.shiftKey || this.linkingFromNodeId) {
                        e.stopPropagation();
                        if (!this.linkingFromNodeId) {
                            this.linkingFromNodeId = quest.id;
                        } else {
                            if (this.linkingFromNodeId !== quest.id) {
                                if (!quest.parents) quest.parents = [];
                                const idx = quest.parents.indexOf(this.linkingFromNodeId);
                                if (idx > -1) quest.parents.splice(idx, 1); // Разорвать
                                else quest.parents.push(this.linkingFromNodeId); // Соединить
                            }
                            this.linkingFromNodeId = null;
                        }
                        this.renderCanvas();
                    } else {
                        e.stopPropagation();
                        this.draggedQuestId = quest.id;
                        this.hasMovedNode = false;
                        this.mouseStartX = e.clientX; this.mouseStartY = e.clientY;
                        this.nodeStartX = quest.x; this.nodeStartY = quest.y;
                    }
                }
            });

            node.addEventListener('contextmenu', (e) => {
                e.preventDefault(); e.stopPropagation();
                this.contextNodeId = quest.id;
                const menu = document.getElementById('node-context-menu');
                menu.style.left = `${e.clientX}px`;
                menu.style.top = `${e.clientY}px`;
                menu.classList.remove('hidden');
            });

            node.addEventListener('mouseenter', () => this.showTooltip(quest));
            node.addEventListener('mouseleave', () => document.getElementById('quest-tooltip').classList.add('hidden'));

            nodesLayer.appendChild(node);
        });

        this.updateSummary();
    },

    drawLine(svg, parent, child) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', parent.x + 24); line.setAttribute('y1', parent.y + 24);
        line.setAttribute('x2', child.x + 24); line.setAttribute('y2', child.y + 24);
        line.setAttribute('class', 'quest-line');
        svg.appendChild(line);
    },

    showTooltip(quest) {
        if (this.isPanning || this.draggedQuestId) return; // Не показываем при перетаскивании
        const tt = document.getElementById('quest-tooltip');
        document.getElementById('tt-title').innerHTML = ItemsDB.formatMC(quest.title);
        document.getElementById('tt-desc').innerText = quest.desc || '';
        
        let reqHtml = '';
        if (quest.reqs && quest.reqs.length > 0) {
            quest.reqs.forEach(r => {
                reqHtml += `<div class="tt-item"><img src="${ItemsDB.getImageUrl(r.item.image)}">${r.count}x ${ItemsDB.formatMC(r.customName || r.item.name)}</div>`;
            });
        } else reqHtml = 'Нет требований';
        document.getElementById('tt-reqs').innerHTML = reqHtml;

        let rewHtml = '';
        if (quest.rewards && quest.rewards.length > 0) {
            quest.rewards.forEach(r => {
                rewHtml += `<div class="tt-item"><img src="${ItemsDB.getImageUrl(r.item.image)}">${r.count}x ${ItemsDB.formatMC(r.customName || r.item.name)}</div>`;
            });
        } else rewHtml = 'Нет наград';
        document.getElementById('tt-rewards').innerHTML = rewHtml;

        tt.classList.remove('hidden');
    },

    updateSummary() {
        const container = document.getElementById('rewards-summary-list');
        container.innerHTML = '';
        const mod = this.getActiveMod();
        if (!mod) return;

        const totals = {};
        mod.quests.forEach(q => {
            (q.rewards || []).forEach(r => {
                const name = r.customName || r.item.name;
                if (!totals[name]) totals[name] = { count: 0, item: r.item };
                totals[name].count += parseInt(r.count || 1);
            });
        });

        for (const key in totals) {
            container.innerHTML += `<div class="summary-item"><img src="${ItemsDB.getImageUrl(totals[key].item.image)}"> ${totals[key].count}x ${ItemsDB.formatMC(key)}</div>`;
        }
    },

    // ==========================================
    // ОКНО РЕДАКТИРОВАНИЯ КВЕСТА
    // ==========================================
    bindQuestModalEvents() {
        const modal = document.getElementById('quest-edit-modal');
        
        document.getElementById('btn-add-req').addEventListener('click', () => {
            this.openItemPicker((item) => {
                this.tempReqs.push({ item: item, count: 1, customName: item.name });
                this.renderQuestEditForm();
            });
        });

        document.getElementById('btn-add-reward').addEventListener('click', () => {
            this.openItemPicker((item) => {
                this.tempRewards.push({ item: item, count: 1, customName: item.name });
                this.renderQuestEditForm();
            });
        });

        document.getElementById('btn-save-quest').addEventListener('click', () => {
            const mod = this.getActiveMod();
            const title = document.getElementById('quest-title').value || 'Новый квест';
            const desc = document.getElementById('quest-desc').value;
            
            // Читаем из инпутов
            this.tempReqs.forEach((r, idx) => {
                r.count = document.getElementById(`req-count-${idx}`).value;
                r.customName = document.getElementById(`req-name-${idx}`).value;
            });
            this.tempRewards.forEach((r, idx) => {
                r.count = document.getElementById(`rew-count-${idx}`).value;
                r.customName = document.getElementById(`rew-name-${idx}`).value;
            });

            if (this.editingNodeId) {
                const q = mod.quests.find(q => q.id === this.editingNodeId);
                q.title = title; q.desc = desc; 
                q.reqs = [...this.tempReqs]; q.rewards = [...this.tempRewards];
            } else {
                mod.quests.push({
                    id: 'q_' + Date.now(), x: this.newQuestX, y: this.newQuestY,
                    title: title, desc: desc, reqs: [...this.tempReqs], rewards: [...this.tempRewards], parents: []
                });
            }
            modal.classList.add('hidden');
            this.renderCanvas();
        });

        document.getElementById('btn-delete-quest').addEventListener('click', () => {
            if(this.editingNodeId && confirm('Удалить квест?')) {
                this.deleteQuest(this.editingNodeId);
                modal.classList.add('hidden');
            }
        });

        document.getElementById('btn-close-quest').addEventListener('click', () => modal.classList.add('hidden'));
    },

    openQuestModal(questId = null) {
        this.editingNodeId = questId;
        const modal = document.getElementById('quest-edit-modal');
        document.getElementById('btn-delete-quest').style.display = questId ? 'inline-block' : 'none';

        if (questId) {
            const q = this.getActiveMod().quests.find(q => q.id === questId);
            document.getElementById('quest-title').value = q.title || '';
            document.getElementById('quest-desc').value = q.desc || '';
            
            // Адаптация старых сейвов (если было req, переводим в массив reqs)
            let reqs = q.reqs || [];
            if (q.req && reqs.length === 0) reqs = [q.req]; 
            
            this.tempReqs = JSON.parse(JSON.stringify(reqs));
            this.tempRewards = q.rewards ? JSON.parse(JSON.stringify(q.rewards)) : [];
        } else {
            document.getElementById('quest-title').value = '';
            document.getElementById('quest-desc').value = '';
            this.tempReqs = []; this.tempRewards = [];
        }
        
        this.renderQuestEditForm();
        modal.classList.remove('hidden');
    },

    renderQuestEditForm() {
        const reqBox = document.getElementById('reqs-list');
        reqBox.innerHTML = '';
        this.tempReqs.forEach((r, idx) => {
            const div = document.createElement('div');
            div.className = 'reward-row';
            div.innerHTML = `
                <div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item.image)}" width="24" height="24"></div>
                <input type="number" id="req-count-${idx}" class="mc-input" value="${r.count}">
                <input type="text" id="req-name-${idx}" class="mc-input custom-name-input" value="${r.customName}">
                <button class="mc-button danger" data-idx="${idx}">X</button>
            `;
            div.querySelector('.danger').addEventListener('click', () => {
                this.tempReqs.splice(idx, 1);
                this.renderQuestEditForm();
            });
            reqBox.appendChild(div);
        });

        const rewBox = document.getElementById('rewards-list');
        rewBox.innerHTML = '';
        this.tempRewards.forEach((r, idx) => {
            const div = document.createElement('div');
            div.className = 'reward-row';
            div.innerHTML = `
                <div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item.image)}" width="24" height="24"></div>
                <input type="number" id="rew-count-${idx}" class="mc-input" value="${r.count}">
                <input type="text" id="rew-name-${idx}" class="mc-input custom-name-input" value="${r.customName}">
                <button class="mc-button danger" data-idx="${idx}">X</button>
            `;
            div.querySelector('.danger').addEventListener('click', () => {
                this.tempRewards.splice(idx, 1);
                this.renderQuestEditForm();
            });
            rewBox.appendChild(div);
        });
    },

    deleteQuest(questId) {
        if(confirm('Точно удалить квест?')) {
            const mod = this.getActiveMod();
            mod.quests = mod.quests.filter(q => q.id !== questId);
            mod.quests.forEach(q => { if(q.parents) q.parents = q.parents.filter(id => id !== questId); });
            this.renderCanvas();
        }
    },

    // ==========================================
    // ВЫБОР ПРЕДМЕТА И ЛОГИКА ВКЛАДОК (МОДОВ)
    // ==========================================
    bindItemPickerEvents() {
        const modal = document.getElementById('item-picker-modal');
        const filterMod = document.getElementById('picker-mod-filter');
        const searchInp = document.getElementById('picker-search');
        const favCb = document.getElementById('picker-fav-only');
        
        const renderResults = () => {
            const res = ItemsDB.search(searchInp.value, filterMod.value, favCb.checked);
            const container = document.getElementById('picker-results');
            container.innerHTML = '';
            res.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                const isFav = ItemsDB.favorites.includes(item.item_key);
                
                div.innerHTML = `
                    <span class="fav-star ${isFav ? 'active' : ''}" data-key="${item.item_key}">★</span>
                    <img src="${ItemsDB.getImageUrl(item.image)}" width="32" height="32">
                    <span>${ItemsDB.formatMC(item.name)} <small style="color:#888;">[${item.mod}]</small></span>
                `;
                
                div.querySelector('.fav-star').addEventListener('click', (e) => {
                    e.stopPropagation();
                    ItemsDB.toggleFavorite(item.item_key);
                    renderResults(); 
                });

                div.addEventListener('click', () => {
                    modal.classList.add('hidden');
                    if (this.pickerCallback) this.pickerCallback(item);
                });
                container.appendChild(div);
            });
        };

        searchInp.addEventListener('input', renderResults);
        filterMod.addEventListener('change', renderResults);
        favCb.addEventListener('change', renderResults);

        document.getElementById('btn-picker-cancel').addEventListener('click', () => modal.classList.add('hidden'));

        this.openItemPicker = (cb) => {
            this.pickerCallback = cb;
            if (filterMod.options.length <= 1) {
                filterMod.innerHTML = '<option value="">Все моды</option>';
                ItemsDB.mods.forEach(m => filterMod.innerHTML += `<option value="${m}">${m}</option>`);
            }
            searchInp.value = '';
            renderResults();
            modal.classList.remove('hidden');
        };
    },

    bindModModalEvents() {
        const modal = document.getElementById('add-mod-modal');

        document.getElementById('btn-add-mod').addEventListener('click', () => {
            this.editingModId = null;
            this.tempModIcon = null;
            document.getElementById('new-mod-name').value = '';
            document.getElementById('mod-icon-preview').innerHTML = '';
            document.getElementById('mod-modal-title').innerText = 'Новая ветка';
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
            if (!name || !this.tempModIcon) return alert('Введите название и выберите иконку!');
            
            if (this.editingModId) {
                // Редактируем существующую
                const mod = this.data.mods.find(m => m.id === this.editingModId);
                mod.name = name;
                mod.icon = this.tempModIcon;
            } else {
                // Создаем новую
                const id = 'mod_' + Date.now();
                this.data.mods.push({ id, name, icon: this.tempModIcon, quests: [] });
                this.activeModId = id;
            }
            
            modal.classList.add('hidden');
            this.renderSidebar(); this.renderCanvas();
        });
    },

    renderSidebar() {
        const list = document.getElementById('mod-list');
        list.innerHTML = '';
        this.data.mods.forEach(mod => {
            const li = document.createElement('li');
            li.className = 'mod-item';
            if (this.activeModId === mod.id) li.classList.add('active');
            
            li.innerHTML = `
                <div class="mod-item-content">
                    <img src="${ItemsDB.getImageUrl(mod.icon)}" width="24" height="24">
                    <span>${ItemsDB.formatMC(mod.name)}</span>
                </div>
                <div class="mod-item-actions">
                    <button class="mod-btn edit" title="Редактировать">✏️</button>
                    <button class="mod-btn delete" title="Удалить">❌</button>
                </div>
            `;
            
            // Клик по самой вкладке
            li.querySelector('.mod-item-content').addEventListener('click', () => {
                this.activeModId = mod.id;
                this.renderSidebar(); this.renderCanvas(); 
            });

            // Редактирование
            li.querySelector('.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                this.editingModId = mod.id;
                this.tempModIcon = mod.icon;
                document.getElementById('new-mod-name').value = mod.name;
                document.getElementById('mod-icon-preview').innerHTML = `<div class="mc-slot"><img src="${ItemsDB.getImageUrl(mod.icon)}" width="32" height="32"></div>`;
                document.getElementById('mod-modal-title').innerText = 'Редактировать ветку';
                document.getElementById('add-mod-modal').classList.remove('hidden');
            });

            // Удаление
            li.querySelector('.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Удалить ветку "${mod.name}" со всеми квестами?`)) {
                    this.data.mods = this.data.mods.filter(m => m.id !== mod.id);
                    if (this.activeModId === mod.id) this.activeModId = null;
                    this.renderSidebar(); this.renderCanvas();
                }
            });

            list.appendChild(li);
        });
    },

    getActiveMod() { return this.data.mods.find(m => m.id === this.activeModId); }
};
