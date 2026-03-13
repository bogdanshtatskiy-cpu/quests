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
    history: [],
    historyIndex: -1,
    activeModId: null, 
    originalData: null, 
    isImportMode: false, 
    lootGroups: {}, 
    questSettings: null,
    viewStates: {},
    
    scale: 1, 
    panX: 0, 
    panY: 0, 
    isPanning: false, 
    panStartX: 0, 
    panStartY: 0, 
    initialPanX: 0, 
    initialPanY: 0,
    
    draggedQuestId: null, 
    draggedCommentId: null, // Добавлено для комментариев
    mouseStartX: 0, 
    mouseStartY: 0, 
    nodeStartX: 0, 
    nodeStartY: 0, 
    hasMovedNode: false,
    linkingFromNodeId: null, 
    
    contextNodeId: null, 
    contextCommentId: null, // Для ПКМ по комментарию
    editingNodeId: null, 
    editingCommentId: null, // Для окна редактирования коммента
    hoveredQuestId: null,
    hoveredCommentId: null, // Для тултипа коммента
    
    pickerCallback: null, 
    tempReqs: [], 
    tempRewards: [], 
    tempParents: [],
    tempQuestIcon: null, 
    tempQuestIconItem: null, 
    editingModId: null, 
    tempModIcon: null, 
    saveTimeout: null,
    tempNbtTarget: null,

    saveViewState() {
        if (this.activeModId) {
            this.viewStates[this.activeModId] = { scale: this.scale, panX: this.panX, panY: this.panY };
        }
    },

    init() {
        this.bindCanvasEvents(); 
        this.bindModModalEvents(); 
        this.bindQuestModalEvents();
        this.bindCommentModalEvents(); // Инициализация окна комментов
        this.bindItemPickerEvents(); 
        this.bindTopBarEvents();
        this.bindNbtModalEvents(); 
        this.bindHotkeys();
        this.bindTemplatesEvents();
    },

    bindHotkeys() {
        window.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
                e.preventDefault();
                this.redo();
            }
        });
    },

    pushHistory() {
        if (!Auth.user || this.isImportMode) return;
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(JSON.parse(JSON.stringify(this.data.mods)));
        if (this.history.length > 30) {
            this.history.shift();
            this.historyIndex--;
        }
        this.historyIndex++;
    },

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.data.mods = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            DB.saveQuestsSilent(this.data.mods);
            this.renderSidebar();
            this.renderCanvas();
        }
    },

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.data.mods = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            DB.saveQuestsSilent(this.data.mods);
            this.renderSidebar();
            this.renderCanvas();
        }
    },

    hideTooltip() {
        const tooltip = document.getElementById('quest-tooltip');
        if (tooltip) tooltip.classList.add('hidden');
        this.hoveredQuestId = null;
        this.hoveredCommentId = null;
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
            if (summaryPanel.classList.contains('minimized')) btnToggleSummary.innerText = '▲';
            else btnToggleSummary.innerText = '▼';
        });

        const fileInput = document.getElementById('bq-file-input');
        document.getElementById('btn-import-bq').addEventListener('click', () => {
            this.hideTooltip();
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => { 
                BQ.parseData(event.target.result, this); 
                fileInput.value = ''; 
            };
            reader.readAsText(file);
        });

        document.getElementById('btn-cancel-import').addEventListener('click', () => {
            if (confirm('Отменить импорт? Все текущие незагруженные изменения пропадут.')) {
                this.isImportMode = false;
                this.data.mods = JSON.parse(JSON.stringify(this.originalData)); 
                if (this.data.mods.length > 0) this.activeModId = this.data.mods[0].id;
                else this.activeModId = null;
                
                document.getElementById('import-mode-bar').classList.add('hidden');
                document.body.classList.remove('import-mode');
                this.renderSidebar(); this.renderCanvas(); this.centerCanvas();
            }
        });

        document.getElementById('btn-apply-import').addEventListener('click', async () => {
            if (confirm('ВНИМАНИЕ! Это полностью перезапишет базу квестов. Вы уверены?')) {
                this.isImportMode = false;
                document.getElementById('import-mode-bar').classList.add('hidden');
                document.body.classList.remove('import-mode');
                await DB.saveQuestsSilent(this.data.mods);
                DB.logAction('Выполнил импорт базы BetterQuesting');
                alert('База успешно сохранена!');
            }
        });

        document.getElementById('btn-export-bq').addEventListener('click', () => {
            this.hideTooltip();
            BQ.exportData(this.data.mods, this);
        });
    },

    triggerAutoSave() {
        if (!Auth.user || this.isImportMode) return; 
        
        // Добавляем текущее состояние в историю перед сохранением
        this.pushHistory();

        const indicator = document.getElementById('save-indicator');
        indicator.classList.remove('hidden'); 
        indicator.innerText = "Сохранение..."; 
        indicator.style.color = "#ffaa00";

        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            await DB.saveQuestsSilent(this.data.mods);
            indicator.innerText = "Сохранено ✔"; 
            indicator.style.color = "#55ff55";
            setTimeout(() => { indicator.classList.add('hidden'); }, 2000);
        }, 300); // Быстрое сохранение (300мс) для лучшей синхронизации
    },

    centerCanvas(force = false) {
        if (!force && this.activeModId && this.viewStates[this.activeModId]) {
            const state = this.viewStates[this.activeModId];
            this.scale = state.scale;
            this.panX = state.panX;
            this.panY = state.panY;
            this.updateTransform();
            return;
        }

        const mod = this.getActiveMod();
        const container = document.getElementById('canvas-container');
        
        if (!mod || !mod.quests || mod.quests.length === 0) {
            this.scale = 1; 
            this.panX = container.clientWidth / 2 - 26; 
            this.panY = container.clientHeight / 2 - 26;
            this.updateTransform(); 
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        mod.quests.forEach(q => {
            const size = SIZE_MAP[getSafeSize(q.size)];
            if (q.x < minX) minX = q.x; 
            if (q.y < minY) minY = q.y;
            if (q.x + size > maxX) maxX = q.x + size; 
            if (q.y + size > maxY) maxY = q.y + size;
        });

        const padding = 100; 
        const boxWidth = maxX - minX; 
        const boxHeight = maxY - minY;
        const scaleX = (container.clientWidth - padding * 2) / (boxWidth || 1); 
        const scaleY = (container.clientHeight - padding * 2) / (boxHeight || 1);
        
        this.scale = Math.max(0.1, Math.min(scaleX, scaleY, 1.5));
        const centerX = minX + boxWidth / 2; 
        const centerY = minY + boxHeight / 2;
        
        this.panX = (container.clientWidth / 2) - centerX * this.scale; 
        this.panY = (container.clientHeight / 2) - centerY * this.scale;
        
        this.updateTransform();
    },

    bindCanvasEvents() {
        const container = document.getElementById('canvas-container');
        const tooltip = document.getElementById('quest-tooltip');
        
        const canvasMenu = document.getElementById('canvas-context-menu');
        const nodeMenu = document.getElementById('node-context-menu');
        const commentMenu = document.getElementById('comment-context-menu');

        // Скрытие всех меню при клике мимо
        window.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) {
                if (canvasMenu) canvasMenu.classList.add('hidden');
                if (nodeMenu) nodeMenu.classList.add('hidden');
                if (commentMenu) commentMenu.classList.add('hidden');
            }
        });

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.hideTooltip();
            const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left; 
            const mouseY = e.clientY - rect.top;
            
            const canvasX = (mouseX - this.panX) / this.scale; 
            const canvasY = (mouseY - this.panY) / this.scale;

            this.scale = Math.min(Math.max(0.1, this.scale * zoomAmount), 3);
            this.panX = mouseX - canvasX * this.scale; 
            this.panY = mouseY - canvasY * this.scale;
            
            this.updateTransform();
        });

        container.addEventListener('mousedown', (e) => {
            if (nodeMenu) nodeMenu.classList.add('hidden');
            if (canvasMenu) canvasMenu.classList.add('hidden');
            if (commentMenu) commentMenu.classList.add('hidden');

            if (!e.target.closest('.quest-node') && !e.target.closest('.quest-comment') && !e.target.closest('.ui-element') && e.button === 0) {
                this.isPanning = true; 
                this.panStartX = e.clientX; 
                this.panStartY = e.clientY;
                this.initialPanX = this.panX; 
                this.initialPanY = this.panY; 
                container.style.cursor = 'grabbing';
                this.hideTooltip();
            }
        });

        container.addEventListener('mousemove', (e) => {
            if (this.isPanning || this.draggedQuestId || this.draggedCommentId) {
                this.hideTooltip();
            }
            
            if (this.isPanning) {
                this.panX = this.initialPanX + (e.clientX - this.panStartX);
                this.panY = this.initialPanY + (e.clientY - this.panStartY);
                this.updateTransform();
            }
            
            // Движение квеста
            if (this.draggedQuestId) {
                const quest = this.getActiveMod().quests.find(q => q.id === this.draggedQuestId);
                const dx = (e.clientX - this.mouseStartX) / this.scale; 
                const dy = (e.clientY - this.mouseStartY) / this.scale;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.hasMovedNode = true;
                quest.x = this.nodeStartX + dx; 
                quest.y = this.nodeStartY + dy;
                this.renderCanvas(true); 
            }

            // Движение комментария
            if (this.draggedCommentId) {
                const comment = this.getActiveMod().comments.find(c => c.id === this.draggedCommentId);
                const dx = (e.clientX - this.mouseStartX) / this.scale; 
                const dy = (e.clientY - this.mouseStartY) / this.scale;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.hasMovedNode = true;
                comment.x = this.nodeStartX + dx; 
                comment.y = this.nodeStartY + dy;
                this.renderCanvas(true); 
            }

            const hoveredNode = e.target.closest('.quest-node');
            const hoveredComment = e.target.closest('.quest-comment');
            
            const isMenuHidden = (!nodeMenu || nodeMenu.classList.contains('hidden')) && 
                                 (!canvasMenu || canvasMenu.classList.contains('hidden')) &&
                                 (!commentMenu || commentMenu.classList.contains('hidden'));

            // Логика Тултипов
            if (hoveredNode && !this.isPanning && !this.draggedQuestId && !this.draggedCommentId && isMenuHidden) {
                const questId = hoveredNode.dataset.id;
                if (this.hoveredQuestId !== questId) {
                    this.hoveredQuestId = questId;
                    this.hoveredCommentId = null;
                    const quest = this.getActiveMod().quests.find(q => q.id === questId);
                    if (quest) this.showTooltip(quest);
                }
                tooltip.style.left = (e.clientX + 15) + 'px'; 
                tooltip.style.top = (e.clientY + 15) + 'px';
            } 
            else if (hoveredComment && !this.isPanning && !this.draggedQuestId && !this.draggedCommentId && isMenuHidden) {
                const cId = hoveredComment.dataset.id;
                if (this.hoveredCommentId !== cId) {
                    this.hoveredCommentId = cId;
                    this.hoveredQuestId = null;
                    const comment = this.getActiveMod().comments?.find(c => c.id === cId);
                    if (comment) this.showCommentTooltip(comment);
                }
                tooltip.style.left = (e.clientX + 15) + 'px'; 
                tooltip.style.top = (e.clientY + 15) + 'px';
            } 
            else { 
                this.hideTooltip();
            }
        });

        container.addEventListener('mouseleave', () => {
            this.hideTooltip();
            this.isPanning = false;
            if ((this.draggedQuestId || this.draggedCommentId) && this.hasMovedNode) this.triggerAutoSave();
            this.draggedQuestId = null;
            this.draggedCommentId = null;
        });

        window.addEventListener('mouseup', () => {
            this.isPanning = false;
            if ((this.draggedQuestId || this.draggedCommentId) && this.hasMovedNode) this.triggerAutoSave();
            this.draggedQuestId = null; 
            this.draggedCommentId = null; 
            container.style.cursor = 'default';
        });

        // ПКМ по пустому холсту -> Меню холста
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.hideTooltip(); 
            
            if (!Auth.user) return; 
            if (!this.activeModId) return alert('Сначала выберите или создайте ветку квестов!');
            
            // Если клик был не по квесту и не по комменту
            if (e.target.closest('.quest-node') || e.target.closest('.quest-comment') || e.target.closest('.ui-element')) return;

            if (nodeMenu) nodeMenu.classList.add('hidden');
            if (commentMenu) commentMenu.classList.add('hidden');

            const rect = container.getBoundingClientRect();
            this.newQuestX = (e.clientX - rect.left - this.panX) / this.scale - 26; 
            this.newQuestY = (e.clientY - rect.top - this.panY) / this.scale - 26;

            canvasMenu.style.left = `${e.clientX}px`; 
            canvasMenu.style.top = `${e.clientY}px`;
            canvasMenu.classList.remove('hidden');
        });

        // КНОПКИ МЕНЮ ХОЛСТА
        document.getElementById('menu-add-quest')?.addEventListener('click', () => {
            document.getElementById('canvas-context-menu').classList.add('hidden');
            this.openQuestModal();
        });
        document.getElementById('menu-add-template')?.addEventListener('click', async () => {
            document.getElementById('canvas-context-menu').classList.add('hidden');
            this.openTemplatesModal();
        });
        document.getElementById('menu-add-comment')?.addEventListener('click', () => {
            document.getElementById('canvas-context-menu').classList.add('hidden');
            this.openCommentModal();
        });

        // КНОПКИ МЕНЮ КВЕСТА
        document.getElementById('menu-copy')?.addEventListener('click', () => { 
            nodeMenu.classList.add('hidden'); 
            this.copyQuest(this.contextNodeId); 
        });
        document.getElementById('menu-save-template')?.addEventListener('click', () => { 
            nodeMenu.classList.add('hidden'); 
            this.saveQuestAsTemplate(this.contextNodeId); 
        });
        document.getElementById('menu-delete')?.addEventListener('click', () => { 
            nodeMenu.classList.add('hidden'); 
            this.deleteQuest(this.contextNodeId); 
        });
        document.getElementById('menu-edit')?.addEventListener('click', () => { 
            nodeMenu.classList.add('hidden'); 
            this.openQuestModal(this.contextNodeId); 
        });
        document.getElementById('menu-link')?.addEventListener('click', () => { 
            nodeMenu.classList.add('hidden'); 
            this.linkingFromNodeId = this.contextNodeId; 
            this.renderCanvas(); 
        });

        // КНОПКИ МЕНЮ КОММЕНТАРИЯ
        document.getElementById('menu-edit-comment')?.addEventListener('click', () => {
            commentMenu.classList.add('hidden');
            this.openCommentModal(this.contextCommentId);
        });
        document.getElementById('menu-delete-comment')?.addEventListener('click', () => {
            commentMenu.classList.add('hidden');
            if (confirm('Удалить комментарий?')) {
                const mod = this.getActiveMod();
                mod.comments = mod.comments.filter(c => c.id !== this.contextCommentId);
                this.triggerAutoSave();
                this.renderCanvas();
            }
        });
    },

    bindTemplatesEvents() {
        document.getElementById('btn-close-templates').addEventListener('click', () => {
            document.getElementById('templates-modal').classList.add('hidden');
        });
    },

    saveQuestAsTemplate(questId) {
        const mod = this.getActiveMod();
        const quest = mod.quests.find(q => q.id === questId);
        if (!quest) return;

        const name = prompt("Введите название для шаблона:", quest.title);
        if (name && name.trim()) {
            const templateData = JSON.parse(JSON.stringify(quest));
            // Удаляем специфичные данные
            delete templateData.id;
            delete templateData.x;
            delete templateData.y;
            delete templateData.parents;
            
            DB.saveTemplate(name.trim(), templateData);
            alert("Шаблон успешно сохранен!");
        }
    },

    async openTemplatesModal() {
        const modal = document.getElementById('templates-modal');
        const list = document.getElementById('templates-list');
        list.innerHTML = '<div style="padding:10px; color:#aaa;">Загрузка...</div>';
        modal.classList.remove('hidden');

        const templates = await DB.getTemplates();
        list.innerHTML = '';
        
        if (templates.length === 0) {
            list.innerHTML = '<div style="padding:10px; color:#aaa;">Нет сохраненных шаблонов</div>';
            return;
        }

        templates.forEach(t => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            
            let iconPath = ItemsDB.getImageUrl('book.png');
            if (t.quest.icon) iconPath = ItemsDB.getImageUrl(t.quest.icon);
            else if (t.quest.reqs && t.quest.reqs[0] && t.quest.reqs[0].item) iconPath = ItemsDB.getImageUrl(t.quest.reqs[0].item.image);

            div.innerHTML = `<img src="${iconPath}" width="32" height="32" style="image-rendering:pixelated;"><span>${ItemsDB.formatMC(t.name)}</span>`;
            
            div.addEventListener('click', () => {
                modal.classList.add('hidden');
                this.insertQuestFromTemplate(t.quest);
            });
            list.appendChild(div);
        });
    },

    insertQuestFromTemplate(templateData) {
        const mod = this.getActiveMod();
        const newQuest = JSON.parse(JSON.stringify(templateData));
        newQuest.id = 'q_' + Date.now();
        newQuest.x = this.newQuestX;
        newQuest.y = this.newQuestY;
        newQuest.parents = [];
        
        mod.quests.push(newQuest);
        this.triggerAutoSave();
        this.renderCanvas();
    },

    updateTransform() { 
        document.getElementById('quest-canvas').style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`; 
    },

    renderCanvas(skipSave = false) {
        const nodesLayer = document.getElementById('nodes-layer');
        const linesLayer = document.getElementById('connections-layer');
        
        nodesLayer.innerHTML = ''; 
        linesLayer.innerHTML = '';
        
        const mod = this.getActiveMod();
        if (!mod) { 
            this.updateSummary(); 
            return; 
        }

        const nodesFragment = document.createDocumentFragment();
        const linesFragment = document.createDocumentFragment();

        // Линии связей
        mod.quests.forEach(quest => {
            if (quest.parents) {
                quest.parents.forEach(pId => {
                    const parent = mod.quests.find(q => q.id === pId);
                    if (parent) {
                        this.drawLine(linesFragment, parent, quest);
                    }
                });
            }
        });

        // Отрисовка комментариев
        if (mod.comments && mod.comments.length > 0) {
            mod.comments.forEach(c => {
                const cNode = document.createElement('div');
                cNode.className = 'quest-comment';
                cNode.style.left = `${c.x}px`;
                cNode.style.top = `${c.y}px`;
                cNode.dataset.id = c.id;
                cNode.innerHTML = `i`; // Иконка инфо

                cNode.addEventListener('mousedown', (e) => {
                    if (e.button === 0 && Auth.user) {
                        e.stopPropagation();
                        this.draggedCommentId = c.id;
                        this.hasMovedNode = false;
                        this.mouseStartX = e.clientX;
                        this.mouseStartY = e.clientY;
                        this.nodeStartX = c.x;
                        this.nodeStartY = c.y;
                    }
                });

                cNode.addEventListener('contextmenu', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    this.hideTooltip();
                    if (!Auth.user) return;
                    this.contextCommentId = c.id;
                    
                    document.getElementById('canvas-context-menu').classList.add('hidden');
                    document.getElementById('node-context-menu').classList.add('hidden');
                    
                    const menu = document.getElementById('comment-context-menu');
                    menu.style.left = `${e.clientX}px`;
                    menu.style.top = `${e.clientY}px`;
                    menu.classList.remove('hidden');
                });

                nodesFragment.appendChild(cNode);
            });
        }

        // Отрисовка квестов
        mod.quests.forEach(quest => {
            const node = document.createElement('div');
            const nodeSize = getSafeSize(quest.size);
            node.className = `quest-node size-${nodeSize}`;
            
            if (this.linkingFromNodeId === quest.id) {
                node.classList.add('selected');
            }
            
            node.style.left = `${quest.x}px`; 
            node.style.top = `${quest.y}px`;
            node.dataset.id = quest.id;
            
            let iconFile = quest.icon;
            if (!iconFile && quest.reqs && quest.reqs.length > 0) {
                if (quest.reqs[0].item && quest.reqs[0].item.image) iconFile = quest.reqs[0].item.image;
            }
            if (!iconFile && quest.rewards && quest.rewards.length > 0) {
                if (quest.rewards[0].item && quest.rewards[0].item.image) iconFile = quest.rewards[0].item.image;
            }
            if (!iconFile) iconFile = 'book.png';

            const iconPath = ItemsDB.getImageUrl(iconFile);

            let hasExternalParents = false;
            if (quest.parents && quest.parents.length > 0) {
                quest.parents.forEach(pId => {
                    if (!mod.quests.find(q => q.id === pId)) {
                        hasExternalParents = true;
                    }
                });
            }

            const externalIndicatorHtml = hasExternalParents 
                ? `<div style="position:absolute; top:-8px; right:-8px; background:#ffaa00; border:2px solid #333; color:#000; border-radius:50%; width:22px; height:22px; font-size:12px; display:flex; align-items:center; justify-content:center; z-index:10; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);" title="Зависит от квестов из других веток">🔗</div>` 
                : '';

            node.innerHTML = `
                <img src="${iconPath}" loading="lazy">
                <div class="node-title">${ItemsDB.formatMC(quest.title)}</div>
                ${externalIndicatorHtml}
            `;

            node.addEventListener('mousedown', (e) => {
                if (e.button === 0 && Auth.user) {
                    if (e.shiftKey || this.linkingFromNodeId) {
                        e.stopPropagation();
                        if (!this.linkingFromNodeId) {
                            this.linkingFromNodeId = quest.id;
                        } else {
                            if (this.linkingFromNodeId !== quest.id) {
                                if (!quest.parents) quest.parents = [];
                                const idx = quest.parents.indexOf(this.linkingFromNodeId);
                                if (idx > -1) {
                                    quest.parents.splice(idx, 1);
                                } else {
                                    quest.parents.push(this.linkingFromNodeId);
                                }
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
                e.preventDefault(); 
                e.stopPropagation();
                this.hideTooltip(); 
                
                if (!Auth.user) return; 
                this.contextNodeId = quest.id;
                
                document.getElementById('canvas-context-menu').classList.add('hidden');
                document.getElementById('comment-context-menu').classList.add('hidden');
                
                const menu = document.getElementById('node-context-menu');
                menu.style.left = `${e.clientX}px`; 
                menu.style.top = `${e.clientY}px`;
                menu.classList.remove('hidden');
            });

            nodesFragment.appendChild(node);
        });

        linesLayer.appendChild(linesFragment);
        nodesLayer.appendChild(nodesFragment);

        if (!skipSave) {
            this.updateSummary();
        }
    },

    drawLine(svg, parent, child) {
        const pSize = SIZE_MAP[getSafeSize(parent.size)] / 2; 
        const cSize = SIZE_MAP[getSafeSize(child.size)] / 2;
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', parent.x + pSize); 
        line.setAttribute('y1', parent.y + pSize);
        line.setAttribute('x2', child.x + cSize); 
        line.setAttribute('y2', child.y + cSize);
        line.setAttribute('class', 'quest-line'); 
        
        svg.appendChild(line);
    },

    getTaskLabel(r) {
        const t = r.taskType || 'retrieval';
        let name = r.customName || (r.item ? r.item.name : 'Предмет');
        
        if (t === 'hunt') return `Убить: ${ItemsDB.formatMC(name)}`;
        if (t === 'block_break') return `Сломать: ${ItemsDB.formatMC(name)}`;
        if (t === 'crafting') return `Создать: ${ItemsDB.formatMC(name)}`;
        if (t === 'fluid') return `Жидкость: ${ItemsDB.formatMC(name)}`;
        if (t === 'checkbox') return `Галочка: ${ItemsDB.formatMC(name)}`;
        
        return ItemsDB.formatMC(name);
    },

    getRewardLabel(r) {
        if (r.taskType === 'command') return `Команда: /${r.command || '...'}`;
        if (r.taskType === 'xp') return `Опыт (Уровни)`;
        
        let name = r.customName || (r.item ? r.item.name : 'Награда');
        
        if (r.item && (r.item.string_id === 'bq_standard:loot_chest' || r.item.item_key === 'bq_standard:loot_chest')) {
            const tierName = this.lootGroups && this.lootGroups[r.damage] ? this.lootGroups[r.damage] : `Тир ${r.damage||0}`;
            return `🎁 Лутбокс [${tierName}]`;
        }
        
        return ItemsDB.formatMC(name);
    },

    formatNBTForTooltip(nbt) {
        if (!nbt || Object.keys(nbt).length === 0) return '';
        let html = '<div class="nbt-tooltip-data" style="margin-left: 28px; font-size: 11px; color: #aaa; margin-bottom: 4px; border-left: 2px solid #555; padding-left: 5px;">';
        
        // Поиск чар
        const enchants = nbt['StoredEnchantments:9'] || nbt['ench:9'];
        if (enchants) {
            html += '<div style="color: #55ffff;">✨ Чары:</div>';
            for (let key in enchants) {
                const e = enchants[key];
                if (e && e['id:2'] !== undefined) {
                    html += `<div>- ID: ${e['id:2']} (Ур. ${e['lvl:2'] || e['lvl:4']})</div>`;
                }
            }
        }
        
        // Поиск Display Name / Lore
        const display = nbt['display:10'];
        if (display) {
            if (display['Name:8']) html += `<div style="color: #ffaa00;">📛 ${display['Name:8']}</div>`;
            const lore = display['Lore:9'];
            if (lore) {
                for (let key in lore) {
                    html += `<div style="color: #aa00aa; font-style: italic;">"${lore[key].replace(/§[0-9a-fk-or]/gi, '')}"</div>`;
                }
            }
        }
        
        if (!enchants && !display) {
            const keys = Object.keys(nbt).map(k => k.split(':')[0]).join(', ');
            html += `<div>📦 Теги: <span style="color:#55ff55;">${keys}</span></div>`;
        }

        html += '</div>';
        return html;
    },

    // Тултип для комментария
    showCommentTooltip(comment) {
        const tt = document.getElementById('quest-tooltip');
        document.getElementById('tt-title').innerHTML = "<span style='color:#ffaa00;'>Комментарий</span>";
        document.getElementById('tt-desc').innerHTML = ItemsDB.formatMC(comment.text || '');
        
        document.getElementById('tt-parents-container').style.display = 'none';
        document.getElementById('tt-reqs-container').style.display = 'none';
        document.getElementById('tt-rewards-container').style.display = 'none';
        
        tt.classList.remove('hidden');
    },

    showTooltip(quest) {
        const tt = document.getElementById('quest-tooltip');
        document.getElementById('tt-title').innerHTML = ItemsDB.formatMC(quest.title);
        document.getElementById('tt-desc').innerHTML = ItemsDB.formatMC(quest.desc || '');
        
        // Включаем обратно скрытые блоки, если тултип переключился с комментария
        document.getElementById('tt-reqs-container').style.display = 'block';
        document.getElementById('tt-rewards-container').style.display = 'block';

        const parentsContainer = document.getElementById('tt-parents-container');
        if (quest.parents && quest.parents.length > 0) {
            let pNames = [];
            quest.parents.forEach(pId => {
                let foundTitle = pId;
                let foundModName = "?";
                this.data.mods.forEach(m => {
                    const found = m.quests.find(q => q.id === pId);
                    if(found) {
                        foundTitle = found.title;
                        foundModName = m.name;
                    }
                });
                pNames.push(`• ${ItemsDB.formatMC(foundTitle)} <small>[${ItemsDB.formatMC(foundModName)}]</small>`);
            });
            parentsContainer.innerHTML = `<div style="color:#ffaa00; font-size:13px; margin-bottom:10px; border-bottom:1px solid #555; padding-bottom:5px;">Зависит от:<br>${pNames.join('<br>')}</div>`;
            parentsContainer.style.display = 'block';
        } else {
            parentsContainer.style.display = 'none';
        }

        let reqHtml = '';
        if (quest.reqs && quest.reqs.length > 0) {
            quest.reqs.forEach(r => {
                const consumeTag = (r.taskType !== 'hunt' && r.taskType !== 'block_break' && r.taskType !== 'checkbox' && r.taskType !== 'xp') 
                    ? (r.consume !== false ? ' <span style="color:#ff5555; font-size:12px; margin-left:6px;">[Забрать]</span>' : ' <span style="color:#aaaaaa; font-size:12px; margin-left:6px;">[Наличие]</span>')
                    : '';
                const imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');
                reqHtml += `<div class="tt-item"><img src="${imgPath}">${this.getTaskLabel(r)} x${r.count}${consumeTag}</div>`;
                reqHtml += this.formatNBTForTooltip(r.nbtTag);
            });
        } else {
            reqHtml = 'Нет требований';
        }
        document.getElementById('tt-reqs').innerHTML = reqHtml;

        let rewHtml = '';
        if (quest.rewards && quest.rewards.length > 0) {
            quest.rewards.forEach(r => {
                const choiceTag = r.isChoice ? ' <span style="color:#ffff55; font-size:12px; margin-left:6px;">[На выбор]</span>' : '';
                const imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');
                rewHtml += `<div class="tt-item"><img src="${imgPath}">${this.getRewardLabel(r)} x${r.count}${choiceTag}</div>`;
                rewHtml += this.formatNBTForTooltip(r.nbtTag);
            });
        } else {
            rewHtml = 'Нет наград';
        }
        document.getElementById('tt-rewards').innerHTML = rewHtml;

        tt.classList.remove('hidden');
    },

    updateSummary() {
        const container = document.getElementById('rewards-summary-list');
        const summaryPanel = document.getElementById('rewards-summary');
        
        const mod = this.getActiveMod();
        if (!mod) { 
            summaryPanel.classList.add('hidden'); 
            container.innerHTML = ''; 
            return; 
        }

        const totals = {};
        mod.quests.forEach(q => {
            (q.rewards || []).forEach(r => {
                const name = this.getRewardLabel(r);
                const key = name + (r.isChoice ? '___CHOICE' : '___GUARANTEED');
                if (!totals[key]) {
                    totals[key] = { count: 0, item: r.item, name: name, isChoice: r.isChoice };
                }
                totals[key].count += parseInt(r.count || 1);
            });
        });

        if (Object.keys(totals).length > 0) {
            summaryPanel.classList.remove('hidden');
            let htmlStr = ''; 
            for (const key in totals) {
                const choiceTag = totals[key].isChoice ? ' <span style="color:#ffff55; font-size:12px; margin-left:4px;">[На выбор]</span>' : '';
                const imgPath = totals[key].item && totals[key].item.image ? ItemsDB.getImageUrl(totals[key].item.image) : ItemsDB.getImageUrl('book.png');
                htmlStr += `<div class="summary-item"><img src="${imgPath}"> ${totals[key].count}x ${totals[key].name}${choiceTag}</div>`;
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
                    if (this.tempNbtTarget.item) {
                        this.tempNbtTarget.customName = BQ.getCustomName(this.tempNbtTarget.item, parsed);
                    }
                }
                
                document.getElementById('nbt-editor-modal').classList.add('hidden');
                errDiv.innerText = '';
                this.renderQuestEditForm(); 
            } catch(e) {
                errDiv.innerText = 'Ошибка JSON! Проверьте скобки и запятые. Подробно: ' + e.message;
            }
        });
    },

    // Окно Комментария (Новое)
    bindCommentModalEvents() {
        const modal = document.getElementById('comment-edit-modal');
        
        document.getElementById('btn-close-comment').addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        document.getElementById('btn-save-comment').addEventListener('click', () => {
            const text = document.getElementById('comment-text').value;
            const mod = this.getActiveMod();
            
            if (!mod.comments) mod.comments = [];
            
            if (this.editingCommentId) {
                const c = mod.comments.find(item => item.id === this.editingCommentId);
                if (c) c.text = text;
            } else {
                mod.comments.push({
                    id: 'c_' + Date.now(),
                    x: this.newQuestX + 13, // небольшой сдвиг, чтобы отцентровать круг на мышке
                    y: this.newQuestY + 13,
                    text: text
                });
            }
            
            this.triggerAutoSave();
            modal.classList.add('hidden');
            this.renderCanvas();
        });
    },

    openCommentModal(commentId = null) {
        this.editingCommentId = commentId;
        const modal = document.getElementById('comment-edit-modal');
        
        if (commentId) {
            const c = this.getActiveMod().comments.find(item => item.id === commentId);
            document.getElementById('comment-text').value = c ? (c.text || '') : '';
        } else {
            document.getElementById('comment-text').value = '';
        }
        
        modal.classList.remove('hidden');
        setTimeout(() => document.getElementById('comment-text').focus(), 50);
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
                if (targetInp) { 
                    r.target = targetInp.value; 
                    if (r.taskType === 'fluid') {
                        r.customName = BQ.FLUIDS[r.target] || r.target;
                    } else {
                        r.customName = r.target;
                    }
                }
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

            if (r.taskType === 'command') {
                if (cmdInp) r.command = cmdInp.value;
            } else if (r.taskType !== 'xp') {
                if (nameInp) r.customName = nameInp.value;
            }
            
            if (tierSel) r.damage = parseInt(tierSel.value);
            if (choiceCb) r.isChoice = choiceCb.checked;
        });
    },

    copyQuest(questId) {
        const mod = this.getActiveMod();
        const originalQuest = mod.quests.find(q => q.id === questId);
        if (!originalQuest) return;

        const newQuest = {
            id: 'q_' + Date.now(),
            x: originalQuest.x + 60, 
            y: originalQuest.y + 60, 
            title: originalQuest.title + ' (Копия)', 
            desc: originalQuest.desc,
            size: originalQuest.size, 
            icon: originalQuest.icon,
            iconItem: originalQuest.iconItem,
            reqs: JSON.parse(JSON.stringify(originalQuest.reqs || [])),
            rewards: JSON.parse(JSON.stringify(originalQuest.rewards || [])),
            parents: [] 
        };

        mod.quests.push(newQuest);
        DB.logAction(`Скопировал квест: ${originalQuest.title}`);
        this.triggerAutoSave(); 
        this.renderCanvas();
    },

    deleteQuest(questId) {
        const mod = this.getActiveMod();
        mod.quests = mod.quests.filter(q => q.id !== questId);
        
        this.data.mods.forEach(m => {
            m.quests.forEach(q => {
                if (q.parents) {
                    q.parents = q.parents.filter(pId => pId !== questId);
                }
            });
        });
        
        this.triggerAutoSave(); 
        this.renderCanvas();
    },

    populateParentsSelect() {
        const select = document.getElementById('parent-quest-select');
        select.innerHTML = '<option value="">-- Выберите квест для привязки --</option>';
        
        this.data.mods.forEach(mod => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = ItemsDB.formatMC(mod.name);
            
            mod.quests.forEach(q => {
                if (q.id !== this.editingNodeId && !this.tempParents.includes(q.id)) {
                    const opt = document.createElement('option');
                    opt.value = q.id;
                    opt.textContent = (q.title || 'Безымянный квест').replace(/[§&][0-9a-fk-or]/gi, '');
                    optgroup.appendChild(opt);
                }
            });
            
            if (optgroup.children.length > 0) {
                select.appendChild(optgroup);
            }
        });
    },

    renderParentsList() {
        const container = document.getElementById('parents-list');
        container.innerHTML = '';
        
        this.tempParents.forEach((pId, idx) => {
            let pQuest = null;
            let pMod = null;
            
            this.data.mods.forEach(m => {
                const found = m.quests.find(q => q.id === pId);
                if (found) { pQuest = found; pMod = m; }
            });

            const title = pQuest ? pQuest.title : `Неизвестный ID: ${pId}`;
            const modName = pMod ? pMod.name : '?';

            const div = document.createElement('div');
            div.className = 'reward-row';
            div.style.backgroundColor = '#1a1a1a';
            div.innerHTML = `
                <span style="flex:1; color:#fff;">🔗 ${ItemsDB.formatMC(title)} <small style="color:#aaa;">[${ItemsDB.formatMC(modName)}]</small></span>
                <button class="mc-button danger btn-del-parent" data-idx="${idx}" style="padding: 2px 6px;">X</button>
            `;
            
            div.querySelector('.btn-del-parent').addEventListener('click', () => {
                this.tempParents.splice(idx, 1);
                this.renderParentsList();
                this.populateParentsSelect(); 
            });
            
            container.appendChild(div);
        });
    },

    bindQuestModalEvents() {
        const modal = document.getElementById('quest-edit-modal');
        
        document.getElementById('btn-close-view').addEventListener('click', () => {
            document.getElementById('quest-view-modal').classList.add('hidden');
        });
        
        document.getElementById('btn-toggle-all-consume').addEventListener('click', () => {
            this.saveTempState(); 
            const targetState = this.tempReqs.some(r => r.consume === false);
            this.tempReqs.forEach(r => r.consume = targetState);
            this.renderQuestEditForm();
        });

        document.getElementById('btn-select-quest-icon').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((item) => {
                this.tempQuestIcon = item.image;
                this.tempQuestIconItem = item; 
                document.getElementById('quest-icon-preview').innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" style="width: 32px; height: 32px; image-rendering: pixelated;">`;
            });
        });

        document.getElementById('btn-add-req').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((item) => { 
                this.tempReqs.push({ 
                    item: item, 
                    rawId: item.string_id || item.item_key, 
                    rawDamage: item.damage !== undefined ? item.damage : 0,
                    count: 1, 
                    customName: BQ.getCustomName(item, null), 
                    consume: true, 
                    taskType: 'retrieval', 
                    nbtTag: null 
                }); 
                this.renderQuestEditForm(); 
            });
        });

        document.getElementById('btn-add-reward').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((item) => { 
                this.tempRewards.push({ 
                    item: item, 
                    rawId: item.string_id || item.item_key, 
                    rawDamage: item.damage !== undefined ? item.damage : 0,
                    count: 1, 
                    customName: BQ.getCustomName(item, null), 
                    isChoice: false, 
                    damage: item.damage || 0, 
                    taskType: 'item', 
                    nbtTag: null 
                }); 
                this.renderQuestEditForm(); 
            });
        });

        document.getElementById('btn-add-parent').addEventListener('click', () => {
            const select = document.getElementById('parent-quest-select');
            const val = select.value;
            if (val && !this.tempParents.includes(val)) {
                this.tempParents.push(val);
                this.renderParentsList();
                this.populateParentsSelect();
            }
        });

        document.getElementById('btn-save-quest').addEventListener('click', () => {
            this.saveTempState(); 
            
            const mod = this.getActiveMod();
            const title = document.getElementById('quest-title').value || 'Новый квест';
            const desc = document.getElementById('quest-desc').value;
            const size = document.getElementById('quest-size').value;

            if (this.editingNodeId) {
                const q = mod.quests.find(item => item.id === this.editingNodeId);
                q.title = title; 
                q.desc = desc; 
                q.size = size; 
                q.icon = this.tempQuestIcon;
                q.iconItem = this.tempQuestIconItem; 
                q.reqs = [...this.tempReqs]; 
                q.rewards = [...this.tempRewards];
                q.parents = [...this.tempParents]; 
                DB.logAction(`Отредактировал квест: ${title}`);
            } else {
                mod.quests.push({
                    id: 'q_' + Date.now(), 
                    x: this.newQuestX, 
                    y: this.newQuestY,
                    title: title, 
                    desc: desc, 
                    size: size, 
                    icon: this.tempQuestIcon,
                    iconItem: this.tempQuestIconItem, 
                    reqs: [...this.tempReqs], 
                    rewards: [...this.tempRewards], 
                    parents: [...this.tempParents]
                });
                DB.logAction(`Создал квест: ${title}`);
            }
            this.triggerAutoSave();
            modal.classList.add('hidden');
            this.renderCanvas();
        });

        document.getElementById('btn-delete-quest').addEventListener('click', () => {
            if(this.editingNodeId && confirm('Удалить квест?')) {
                this.deleteQuest(this.editingNodeId);
                modal.classList.add('hidden');
            }
        });

        document.getElementById('btn-close-quest').addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    },

    openQuestViewModal(questId) {
        this.hideTooltip(); 
        
        const mod = this.getActiveMod();
        const quest = mod.quests.find(q => q.id === questId);
        if (!quest) return;

        const modal = document.getElementById('quest-view-modal');
        
        let iconFile = quest.icon;
        if (!iconFile && quest.reqs && quest.reqs.length > 0 && quest.reqs[0].item) iconFile = quest.reqs[0].item.image;
        if (!iconFile && quest.rewards && quest.rewards.length > 0 && quest.rewards[0].item) iconFile = quest.rewards[0].item.image;
        if (!iconFile) iconFile = 'book.png';
        
        document.getElementById('view-quest-icon').innerHTML = `<img src="${ItemsDB.getImageUrl(iconFile)}" style="width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated;">`;
        document.getElementById('view-quest-title').innerHTML = ItemsDB.formatMC(quest.title);
        document.getElementById('view-quest-desc').innerHTML = ItemsDB.formatMC(quest.desc || 'Нет описания.');

        const pContainer = document.getElementById('view-parents-container');
        const pList = document.getElementById('view-parents-list');
        if (quest.parents && quest.parents.length > 0) {
            pContainer.classList.remove('hidden');
            let phtml = '';
            quest.parents.forEach(pId => {
                let pQuest = null; let pMod = null;
                this.data.mods.forEach(m => {
                    const f = m.quests.find(q => q.id === pId);
                    if (f) { pQuest = f; pMod = m; }
                });
                const t = pQuest ? pQuest.title : `Скрытый квест: ${pId}`;
                const m = pMod ? pMod.name : '?';
                phtml += `<div style="color:#fff; font-size:16px; margin-bottom:6px;">🔗 ${ItemsDB.formatMC(t)} <span style="color:#aaa; font-size:14px;">[${ItemsDB.formatMC(m)}]</span></div>`;
            });
            pList.innerHTML = phtml;
        } else {
            pContainer.classList.add('hidden');
        }

        const reqsBox = document.getElementById('view-reqs-list');
        reqsBox.innerHTML = '';
        if (quest.reqs && quest.reqs.length > 0) {
            quest.reqs.forEach(r => {
                const consumeText = (r.taskType !== 'hunt' && r.taskType !== 'block_break' && r.taskType !== 'checkbox' && r.taskType !== 'xp') 
                    ? (r.consume !== false ? '<span style="color:#ff5555;">[Забирается]</span>' : '<span style="color:#aaaaaa;">[Только наличие]</span>') : '';
                const imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');
                reqsBox.innerHTML += `
                    <div class="view-item-row" style="display:block;">
                        <div style="display:flex; gap:10px; align-items:center;">
                            <div class="mc-slot"><img src="${imgPath}"></div>
                            <div class="item-info" style="display:flex; flex-direction:column; justify-content:center;">
                                <span class="item-name">${r.count}x ${this.getTaskLabel(r)}</span>
                                <span class="item-meta">${consumeText}</span>
                            </div>
                        </div>
                        ${this.formatNBTForTooltip(r.nbtTag)}
                    </div>`;
            });
        } else { reqsBox.innerHTML = '<div style="padding: 15px; color: #aaa; font-size: 16px;">Нет требований</div>'; }

        const rewsBox = document.getElementById('view-rewards-list');
        rewsBox.innerHTML = '';
        if (quest.rewards && quest.rewards.length > 0) {
            quest.rewards.forEach(r => {
                const choiceText = r.isChoice ? '<span style="color:#ffff55;">[На выбор]</span>' : '<span style="color:#55ff55;">[Гарантировано]</span>';
                const imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');
                rewsBox.innerHTML += `
                    <div class="view-item-row" style="display:block;">
                        <div style="display:flex; gap:10px; align-items:center;">
                            <div class="mc-slot"><img src="${imgPath}"></div>
                            <div class="item-info" style="display:flex; flex-direction:column; justify-content:center;">
                                <span class="item-name">${r.count}x ${this.getRewardLabel(r)}</span>
                                <span class="item-meta">${choiceText}</span>
                            </div>
                        </div>
                        ${this.formatNBTForTooltip(r.nbtTag)}
                    </div>`;
            });
        } else { rewsBox.innerHTML = '<div style="padding: 15px; color: #aaa; font-size: 16px;">Нет наград</div>'; }

        modal.classList.remove('hidden');
    },

    openQuestModal(questId = null) {
        this.hideTooltip(); 

        this.editingNodeId = questId;
        const modal = document.getElementById('quest-edit-modal');
        document.getElementById('btn-delete-quest').style.display = questId ? 'inline-block' : 'none';

        if (questId) {
            const q = this.getActiveMod().quests.find(item => item.id === questId);
            document.getElementById('quest-title').value = q.title || '';
            document.getElementById('quest-desc').value = q.desc || '';
            document.getElementById('quest-size').value = getSafeSize(q.size);
            this.tempQuestIcon = q.icon || null;
            this.tempQuestIconItem = q.iconItem || null;
            
            let reqs = q.reqs || [];
            if (q.req && reqs.length === 0) reqs = [q.req]; 
            
            this.tempReqs = JSON.parse(JSON.stringify(reqs));
            this.tempRewards = q.rewards ? JSON.parse(JSON.stringify(q.rewards)) : [];
            this.tempParents = q.parents ? JSON.parse(JSON.stringify(q.parents)) : [];
        } else {
            document.getElementById('quest-title').value = '';
            document.getElementById('quest-desc').value = '';
            document.getElementById('quest-size').value = 'x1';
            this.tempQuestIcon = null;
            this.tempQuestIconItem = null;
            this.tempReqs = []; 
            this.tempRewards = [];
            this.tempParents = [];
        }
        
        if (this.tempQuestIcon) {
            document.getElementById('quest-icon-preview').innerHTML = `<img src="${ItemsDB.getImageUrl(this.tempQuestIcon)}" style="width: 32px; height: 32px; image-rendering: pixelated;">`;
        } else {
            document.getElementById('quest-icon-preview').innerHTML = '';
        }

        this.renderQuestEditForm();
        this.renderParentsList();
        this.populateParentsSelect();
        
        modal.classList.remove('hidden');
    },

    renderQuestEditForm() {
        const reqBox = document.getElementById('reqs-list');
        reqBox.innerHTML = '';
        
        this.tempReqs.forEach((r, idx) => {
            const div = document.createElement('div');
            div.className = 'reward-row';
            const tType = r.taskType || 'retrieval';
            const isChecked = r.consume !== false ? 'checked' : '';
            
            let targetInputHtml = '';
            if (tType === 'hunt') targetInputHtml = `<input type="text" id="req-target-${idx}" list="mob-list" class="mc-input custom-name-input" value="${r.target || r.customName || ''}" placeholder="Моб (напр. Creeper)">`;
            else if (tType === 'fluid') targetInputHtml = `<input type="text" id="req-target-${idx}" class="mc-input custom-name-input" value="${r.target || ''}" placeholder="Жидкость (напр. water)">`;
            else if (tType === 'checkbox') targetInputHtml = `<input type="text" id="req-name-${idx}" class="mc-input custom-name-input" value="Нажать галочку" disabled>`;
            else if (tType === 'xp') targetInputHtml = `<input type="text" id="req-name-${idx}" class="mc-input custom-name-input" value="Сдать уровни опыта" disabled>`;
            else targetInputHtml = `<input type="text" id="req-name-${idx}" class="mc-input custom-name-input" value="${r.customName || ''}" placeholder="Название">`;

            const showConsume = (tType === 'hunt' || tType === 'block_break' || tType === 'checkbox' || tType === 'xp') ? 'display:none;' : '';
            let nbtBtnStyle = r.nbtTag ? 'color: #55ffff; border-color: #55ffff;' : '';
            const imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');

            div.innerHTML = `
                <div class="mc-slot item-icon-btn" title="Изменить иконку" style="cursor: pointer; flex-shrink:0;">
                    <img src="${imgPath}" width="24" height="24">
                </div>
                
                <select id="req-type-${idx}" class="mc-input task-type-select">
                    <option value="retrieval" ${tType === 'retrieval' ? 'selected' : ''}>Принести</option>
                    <option value="crafting" ${tType === 'crafting' ? 'selected' : ''}>Создать</option>
                    <option value="block_break" ${tType === 'block_break' ? 'selected' : ''}>Сломать</option>
                    <option value="hunt" ${tType === 'hunt' ? 'selected' : ''}>Убить</option>
                    <option value="fluid" ${tType === 'fluid' ? 'selected' : ''}>Жидкость</option>
                    <option value="xp" ${tType === 'xp' ? 'selected' : ''}>Опыт (Сдать)</option>
                    <option value="checkbox" ${tType === 'checkbox' ? 'selected' : ''}>Галочка</option>
                </select>

                <input type="number" id="req-count-${idx}" class="mc-input" value="${r.count}" title="Количество">
                ${targetInputHtml}
                
                <button class="mc-button btn-nbt" style="padding: 4px; font-size:12px; margin-left:5px; ${nbtBtnStyle}" title="NBT Данные">[NBT]</button>

                <label class="mc-checkbox" style="${showConsume}">
                    <input type="checkbox" id="req-consume-${idx}" ${isChecked}> Забрать
                </label>
                <button class="mc-button danger" data-idx="${idx}">X</button>
            `;
            
            div.querySelector('.item-icon-btn').addEventListener('click', () => {
                this.saveTempState();
                this.openItemPicker((pickedItem) => { 
                    this.tempReqs[idx].item = pickedItem; 
                    this.tempReqs[idx].rawId = pickedItem.string_id || pickedItem.item_key;
                    this.tempReqs[idx].rawDamage = pickedItem.damage || 0;
                    this.tempReqs[idx].customName = BQ.getCustomName(pickedItem, this.tempReqs[idx].nbtTag);
                    this.renderQuestEditForm(); 
                });
            });

            div.querySelector('.task-type-select').addEventListener('change', (e) => {
                this.saveTempState(); 
                this.tempReqs[idx].taskType = e.target.value;
                if(e.target.value === 'xp') this.tempReqs[idx].item = { item_key: 'xp', name: 'Опыт', image: 'experience_bottle.png', mod: 'Система' };
                if(e.target.value === 'checkbox') this.tempReqs[idx].item = { item_key: 'checkbox', name: 'Галочка', image: 'checkbox.png', mod: 'Система' };
                this.renderQuestEditForm(); 
            });
            
            div.querySelector('.btn-nbt').addEventListener('click', () => {
                this.saveTempState();
                this.tempNbtTarget = this.tempReqs[idx];
                const currentNbt = this.tempReqs[idx].nbtTag ? JSON.stringify(this.tempReqs[idx].nbtTag, null, 2) : "";
                document.getElementById('nbt-editor-textarea').value = currentNbt;
                document.getElementById('nbt-editor-error').innerText = '';
                document.getElementById('nbt-editor-modal').classList.remove('hidden');
            });

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
            const rType = r.taskType || 'item';
            const isChoice = r.isChoice ? 'checked' : '';
            const isLootBox = (rType === 'item' && r.item && (r.item.string_id === 'bq_standard:loot_chest' || r.item.item_key === 'bq_standard:loot_chest'));
            
            let tierSelectHtml = '';
            if (isLootBox) {
                const groups = this.lootGroups || {};
                const options = Object.entries(groups).map(([id, name]) => `<option value="${id}" ${r.damage == id ? 'selected' : ''}>${name}</option>`).join('');
                const fallbackOption = !(r.damage in groups) ? `<option value="${r.damage || 0}" selected>Тир ${r.damage || 0}</option>` : '';
                tierSelectHtml = `<select id="rew-tier-${idx}" class="mc-input task-type-select" style="width: 140px;">${options}${fallbackOption}</select>`;
            }

            let targetInputHtml = '';
            if (rType === 'command') targetInputHtml = `<input type="text" id="rew-command-${idx}" class="mc-input custom-name-input" value="${r.command || ''}" placeholder="Консольная команда (без /)">`;
            else if (rType === 'xp') targetInputHtml = `<input type="text" id="rew-name-${idx}" class="mc-input custom-name-input" value="Выдать уровни опыта" disabled>`;
            else targetInputHtml = `<input type="text" id="rew-name-${idx}" class="mc-input custom-name-input" value="${r.customName || ''}" placeholder="Название">`;

            const showChoice = (rType === 'command' || rType === 'xp') ? 'display:none;' : '';
            let nbtBtnStyle = r.nbtTag ? 'color: #55ffff; border-color: #55ffff;' : '';
            const imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');

            div.innerHTML = `
                <div class="mc-slot item-icon-btn" title="Изменить иконку" style="cursor: pointer; flex-shrink:0;">
                    <img src="${imgPath}" width="24" height="24">
                </div>
                
                <select id="rew-type-${idx}" class="mc-input task-type-select">
                    <option value="item" ${rType === 'item' ? 'selected' : ''}>Предмет</option>
                    <option value="command" ${rType === 'command' ? 'selected' : ''}>Команда</option>
                    <option value="xp" ${rType === 'xp' ? 'selected' : ''}>Опыт</option>
                </select>

                <input type="number" id="rew-count-${idx}" class="mc-input" value="${r.count}" title="Количество">
                
                ${isLootBox ? tierSelectHtml : ''}
                ${targetInputHtml}

                <button class="mc-button btn-nbt" style="padding: 4px; font-size:12px; margin-left:5px; ${rType !== 'item' ? 'display:none;' : ''} ${nbtBtnStyle}" title="NBT Данные">[NBT]</button>

                <label class="mc-checkbox" style="${showChoice}">
                    <input type="checkbox" id="rew-choice-${idx}" ${isChoice}> На выбор
                </label>
                <button class="mc-button danger" data-idx="${idx}">X</button>
            `;
            
            div.querySelector('.item-icon-btn').addEventListener('click', () => {
                this.saveTempState();
                this.openItemPicker((pickedItem) => { 
                    this.tempRewards[idx].item = pickedItem; 
                    this.tempRewards[idx].rawId = pickedItem.string_id || pickedItem.item_key;
                    this.tempRewards[idx].rawDamage = pickedItem.damage || 0;
                    this.tempRewards[idx].customName = BQ.getCustomName(pickedItem, this.tempRewards[idx].nbtTag);
                    this.renderQuestEditForm(); 
                });
            });

            div.querySelector('.task-type-select').addEventListener('change', (e) => {
                this.saveTempState(); 
                this.tempRewards[idx].taskType = e.target.value;
                if(e.target.value === 'xp') this.tempRewards[idx].item = { item_key: 'xp', name: 'Опыт', image: 'experience_bottle.png', mod: 'Система' };
                if(e.target.value === 'command') this.tempRewards[idx].item = { item_key: 'command', name: 'Команда', image: 'command_block.png', mod: 'Система' };
                this.renderQuestEditForm(); 
            });
            
            if(rType === 'item') {
                div.querySelector('.btn-nbt').addEventListener('click', () => {
                    this.saveTempState();
                    this.tempNbtTarget = this.tempRewards[idx];
                    const currentNbt = this.tempRewards[idx].nbtTag ? JSON.stringify(this.tempRewards[idx].nbtTag, null, 2) : "";
                    document.getElementById('nbt-editor-textarea').value = currentNbt;
                    document.getElementById('nbt-editor-error').innerText = '';
                    document.getElementById('nbt-editor-modal').classList.remove('hidden');
                });
            }

            div.querySelector('.danger').addEventListener('click', () => { 
                this.tempRewards.splice(idx, 1); 
                this.renderQuestEditForm(); 
            });

            rewBox.appendChild(div);
        });
    },

    bindItemPickerEvents() {
        const modal = document.getElementById('item-picker-modal');
        const filterMod = document.getElementById('picker-mod-filter');
        const searchInp = document.getElementById('picker-search');
        
        const resultsContainer = document.getElementById('picker-results');
        const favContainer = document.getElementById('picker-fav-results');
        const lootContainer = document.getElementById('picker-loot-results');

        let currentSearchData = [];
        let itemsLimit = 50;

        const createItemElement = (item, isLootbox = false) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            
            if (isLootbox) {
                div.innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" width="32" height="32" loading="lazy"><span>🎁 ${item.name} <small style="color:#888;">[Лутбокс]</small></span>`;
            } else {
                const isFav = ItemsDB.favorites.includes(item.item_key);
                div.innerHTML = `<span class="fav-star ${isFav ? 'active' : ''}" data-key="${item.item_key}">★</span><img src="${ItemsDB.getImageUrl(item.image)}" width="32" height="32" loading="lazy"><span>${ItemsDB.formatMC(item.name)} <small style="color:#888;">[${item.mod}]</small></span>`;
                
                div.querySelector('.fav-star').addEventListener('click', (e) => { 
                    e.stopPropagation(); 
                    ItemsDB.toggleFavorite(item.item_key); 
                    updateBothLists(); 
                });
            }
            
            div.addEventListener('click', () => { 
                modal.classList.add('hidden'); 
                if (this.pickerCallback) this.pickerCallback(item); 
            });
            return div;
        };

        const renderMainResults = () => {
            resultsContainer.innerHTML = '';
            const fragment = document.createDocumentFragment(); 
            currentSearchData.slice(0, itemsLimit).forEach(item => {
                fragment.appendChild(createItemElement(item));
            });
            resultsContainer.appendChild(fragment);
        };

        const renderFavResults = () => {
            favContainer.innerHTML = '';
            const fragment = document.createDocumentFragment();
            ItemsDB.getFavorites().forEach(item => {
                fragment.appendChild(createItemElement(item));
            });
            favContainer.appendChild(fragment);
        };

        const renderLootResults = () => {
            if (!lootContainer) return;
            lootContainer.innerHTML = '';
            
            if (Object.keys(this.lootGroups || {}).length === 0) {
                lootContainer.innerHTML = '<div style="padding:10px; color:#666; font-size:14px; text-align:center;">База лутбоксов не загружена</div>';
                return;
            }

            const fragment = document.createDocumentFragment();
            Object.entries(this.lootGroups).forEach(([id, name]) => {
                const mockLootItem = {
                    item_key: 'bq_standard:loot_chest',
                    string_id: 'bq_standard:loot_chest',
                    name: name,
                    image: 'chest.png',
                    damage: parseInt(id),
                    mod: 'Лутбоксы'
                };
                fragment.appendChild(createItemElement(mockLootItem, true));
            });
            lootContainer.appendChild(fragment);
        };

        const updateBothLists = () => {
            renderMainResults();
            renderFavResults();
            renderLootResults();
        };

        const triggerSearch = () => {
            currentSearchData = ItemsDB.search(searchInp.value, filterMod.value);
            itemsLimit = 50; 
            resultsContainer.scrollTop = 0;
            updateBothLists();
        };

        searchInp.addEventListener('input', triggerSearch);
        filterMod.addEventListener('change', triggerSearch);
        
        resultsContainer.addEventListener('scroll', () => {
            if (resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - 20) {
                if (itemsLimit < currentSearchData.length) {
                    itemsLimit += 50;
                    renderMainResults();
                }
            }
        });

        document.getElementById('btn-picker-cancel').addEventListener('click', () => modal.classList.add('hidden'));

        document.getElementById('btn-upload-custom-item').addEventListener('click', () => {
            const fileInput = document.getElementById('custom-item-file');
            const nameInput = document.getElementById('custom-item-name');
            const file = fileInput.files[0];
            const name = nameInput.value.trim();

            if (!file) return alert("Выберите картинку!");
            if (!name) return alert("Введите название предмета!");

            const btn = document.getElementById('btn-upload-custom-item');
            btn.innerText = "Грузим...";
            btn.disabled = true;

            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = async function() {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 64; 
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                    } else {
                        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const base64String = canvas.toDataURL('image/png');
                    const newItem = await DB.saveCustomItem(name, base64String);

                    btn.innerText = "Добавить";
                    btn.disabled = false;
                    fileInput.value = '';
                    nameInput.value = '';

                    if (newItem) {
                        ItemsDB.addCustomItems([newItem]);
                        searchInp.value = name;
                        triggerSearch(); 
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });

        this.openItemPicker = (cb) => {
            this.hideTooltip();
            this.pickerCallback = cb;
            
            if (filterMod.options.length <= 1) {
                filterMod.innerHTML = '<option value="">Все моды</option>';
                ItemsDB.mods.forEach(m => {
                    filterMod.innerHTML += `<option value="${m}">${m}</option>`;
                });
            }
            
            searchInp.value = '';
            triggerSearch();
            modal.classList.remove('hidden');
            
            setTimeout(() => searchInp.focus(), 50); 
        };
    },

    bindModModalEvents() {
        const modal = document.getElementById('add-mod-modal');

        document.getElementById('btn-add-mod').addEventListener('click', () => {
            this.hideTooltip();
            this.editingModId = null; 
            this.tempModIcon = null;
            document.getElementById('new-mod-name').value = '';
            document.getElementById('mod-icon-preview').innerHTML = '';
            document.getElementById('mod-modal-title').innerText = 'Новая ветка';
            modal.classList.remove('hidden');
        });

        document.getElementById('btn-close-mod').addEventListener('click', () => {
            modal.classList.add('hidden');
        });

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
                const mod = this.data.mods.find(m => m.id === this.editingModId);
                mod.name = name; 
                mod.icon = this.tempModIcon;
                DB.logAction(`Изменил ветку: ${name}`);
            } else {
                const id = 'mod_' + Date.now();
                this.data.mods.push({ id, name, icon: this.tempModIcon, quests: [] });
                this.activeModId = id;
                DB.logAction(`Создал ветку: ${name}`);
            }
            
            this.triggerAutoSave();
            modal.classList.add('hidden');
            this.renderSidebar(); 
            this.renderCanvas();
        });
    },

    renderSidebar() {
        const list = document.getElementById('mod-list');
        list.innerHTML = '';
        
        let draggedIndex = null;
        let draggedLi = null;

        const fragment = document.createDocumentFragment(); 

        this.data.mods.forEach((mod, index) => {
            const li = document.createElement('li');
            li.className = 'mod-item';
            if (this.activeModId === mod.id) {
                li.classList.add('active');
            }
            
            li.innerHTML = `
                <div class="mod-item-content">
                    <img src="${ItemsDB.getImageUrl(mod.icon)}" width="24" height="24" loading="lazy">
                    <span>${ItemsDB.formatMC(mod.name)}</span>
                </div>
                <div class="mod-item-actions admin-only">
                    <button class="mod-btn edit" title="Редактировать">✏️</button>
                    <button class="mod-btn delete" title="Удалить">❌</button>
                </div>
            `;
            
            li.querySelector('.mod-item-content').addEventListener('click', () => {
                if (this.activeModId !== mod.id) {
                    this.saveViewState();
                    this.activeModId = mod.id;
                    this.renderSidebar(); 
                    this.renderCanvas(); 
                    this.centerCanvas(); 
                }
            });

            if (Auth.user) {
                li.draggable = true;

                li.addEventListener('dragstart', (e) => {
                    draggedLi = li; 
                    draggedIndex = index; 
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => li.style.opacity = '0.5', 0); 
                });

                li.addEventListener('dragover', (e) => {
                    e.preventDefault(); 
                    if (draggedIndex === index) return;
                    const rect = li.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) { 
                        li.classList.add('drag-top'); 
                        li.classList.remove('drag-bottom'); 
                    } else { 
                        li.classList.add('drag-bottom'); 
                        li.classList.remove('drag-top'); 
                    }
                });

                li.addEventListener('dragleave', () => {
                    li.classList.remove('drag-top', 'drag-bottom');
                });
                
                li.addEventListener('dragend', () => {
                    if (draggedLi) draggedLi.style.opacity = '1';
                    document.querySelectorAll('.mod-item').forEach(el => el.classList.remove('drag-top', 'drag-bottom'));
                });

                li.addEventListener('drop', (e) => {
                    e.preventDefault(); 
                    li.classList.remove('drag-top', 'drag-bottom');
                    if (draggedIndex === index || draggedIndex === null) return;

                    const rect = li.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    let newIndex = index;
                    if (e.clientY > midY) newIndex++;
                    if (draggedIndex < newIndex) newIndex--;

                    const movedItem = this.data.mods.splice(draggedIndex, 1)[0];
                    this.data.mods.splice(newIndex, 0, movedItem);

                    DB.logAction(`Изменил порядок веток: ${movedItem.name}`);
                    this.triggerAutoSave();
                    this.renderSidebar();
                });

                li.querySelector('.edit').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editingModId = mod.id; 
                    this.tempModIcon = mod.icon;
                    document.getElementById('new-mod-name').value = mod.name;
                    document.getElementById('mod-icon-preview').innerHTML = `<div class="mc-slot"><img src="${ItemsDB.getImageUrl(mod.icon)}" width="32" height="32"></div>`;
                    document.getElementById('mod-modal-title').innerText = 'Редактировать ветку';
                    document.getElementById('add-mod-modal').classList.remove('hidden');
                });

                li.querySelector('.delete').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Удалить ветку "${mod.name}" со всеми квестами?`)) {
                        this.data.mods = this.data.mods.filter(m => m.id !== mod.id);
                        if (this.activeModId === mod.id) this.activeModId = null;
                        DB.logAction(`Удалил ветку: ${mod.name}`);
                        this.triggerAutoSave();
                        this.renderSidebar(); 
                        this.renderCanvas();
                    }
                });
            }
            fragment.appendChild(li);
        });
        
        list.appendChild(fragment); 
    },

    getActiveMod() { 
        return this.data.mods.find(m => m.id === this.activeModId); 
    }
};
