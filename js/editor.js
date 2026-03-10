// js/editor.js
import { ItemsDB } from './items.js';

export const Editor = {
    data: {
        mods: [] // { id, name, icon, quests: [] }
    },
    activeModId: null,
    
    // Переменные холста
    scale: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    startX: 0,
    startY: 0,

    // Переменные узлов
    draggedNode: null,
    linkingFromNodeId: null,
    contextNodeId: null,
    editingNodeId: null, // Если null - создаем новый, если есть - редактируем

    init() {
        this.bindModModalEvents();
        this.bindCanvasEvents();
        this.bindQuestModalEvents();
        this.renderSidebar();
    },

    // =========================================
    // 1. УПРАВЛЕНИЕ ХОЛСТОМ (Pan & Zoom)
    // =========================================
    bindCanvasEvents() {
        const container = document.getElementById('canvas-container');
        const canvas = document.getElementById('quest-canvas');
        const contextMenu = document.getElementById('node-context-menu');

        // Зум колесиком
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
            this.scale *= zoomAmount;
            // Ограничения зума
            this.scale = Math.min(Math.max(0.3, this.scale), 3);
            this.updateTransform();
        });

        // Перемещение холста
        container.addEventListener('mousedown', (e) => {
            if (e.button === 0 && e.target === container || e.target === document.getElementById('connections-layer')) {
                this.isPanning = true;
                this.startX = e.clientX - this.panX;
                this.startY = e.clientY - this.panY;
                container.style.cursor = 'grabbing';
                contextMenu.classList.add('hidden');
            }
        });

        window.addEventListener('mousemove', (e) => {
            // Двигаем холст
            if (this.isPanning) {
                this.panX = e.clientX - this.startX;
                this.panY = e.clientY - this.startY;
                this.updateTransform();
            }

            // Двигаем квест
            if (this.draggedNode) {
                const rect = container.getBoundingClientRect();
                // Высчитываем координаты с учетом зума и сдвига
                const x = (e.clientX - rect.left - this.panX) / this.scale;
                const y = (e.clientY - rect.top - this.panY) / this.scale;
                
                // Привязка к сетке (Grid Snapping 32x32)
                const gridX = Math.round(x / 32) * 32;
                const gridY = Math.round(y / 32) * 32;

                const mod = this.getActiveMod();
                const quest = mod.quests.find(q => q.id === this.draggedNode);
                if (quest) {
                    quest.x = gridX - 26; // 26 = половина ширины слота (52/2) для центрирования
                    quest.y = gridY - 26;
                    this.renderCanvas(); // Перерисовываем узлы и линии
                }
            }
        });

        window.addEventListener('mouseup', () => {
            this.isPanning = false;
            this.draggedNode = null;
            container.style.cursor = 'default';
        });

        // ПКМ по холсту - Добавить квест
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!this.activeModId) return alert('Сначала выберите или создайте вкладку мода слева!');
            if (e.target.closest('.quest-node')) return; // Если кликнули на узел, ничего не делаем

            contextMenu.classList.add('hidden');
            const rect = container.getBoundingClientRect();
            
            // Сохраняем координаты клика для нового квеста
            this.newQuestX = (e.clientX - rect.left - this.panX) / this.scale;
            this.newQuestY = (e.clientY - rect.top - this.panY) / this.scale;

            this.openQuestModal();
        });

        // Скрытие контекстного меню при клике
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) {
                contextMenu.classList.add('hidden');
            }
        });

        // Кнопки контекстного меню
        document.getElementById('menu-delete').addEventListener('click', () => this.deleteQuest(this.contextNodeId));
        document.getElementById('menu-edit').addEventListener('click', () => {
            contextMenu.classList.add('hidden');
            this.openQuestModal(this.contextNodeId);
        });
        document.getElementById('menu-link').addEventListener('click', () => {
            contextMenu.classList.add('hidden');
            this.startLinking(this.contextNodeId);
        });
    },

    updateTransform() {
        const canvas = document.getElementById('quest-canvas');
        canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    },

    // =========================================
    // 2. ОТРИСОВКА КВЕСТОВ И ЛИНИЙ
    // =========================================
    renderCanvas() {
        const nodesLayer = document.getElementById('nodes-layer');
        const linesLayer = document.getElementById('connections-layer');
        nodesLayer.innerHTML = '';
        linesLayer.innerHTML = '';

        const mod = this.getActiveMod();
        if (!mod) return;

        // 1. Сначала рисуем линии (чтобы они были ПОД слотами)
        mod.quests.forEach(quest => {
            if (quest.parents && quest.parents.length > 0) {
                quest.parents.forEach(parentId => {
                    const parent = mod.quests.find(q => q.id === parentId);
                    if (parent) {
                        this.drawLine(linesLayer, parent, quest);
                    }
                });
            }
        });

        // 2. Рисуем слоты квестов
        mod.quests.forEach(quest => {
            const node = document.createElement('div');
            node.className = 'quest-node';
            node.style.left = `${quest.x}px`;
            node.style.top = `${quest.y}px`;
            node.dataset.id = quest.id;

            // Если режим связывания - подсвечиваем родителя
            if (this.linkingFromNodeId === quest.id) node.classList.add('linking');

            node.innerHTML = `
                <img src="${ItemsDB.getImageUrl(quest.icon)}">
                <div class="node-title">${quest.title}</div>
            `;

            // Перетаскивание
            node.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    if (e.shiftKey || this.linkingFromNodeId) {
                        // Режим связывания
                        this.finishLinking(quest.id);
                    } else {
                        // Режим таскания
                        this.draggedNode = quest.id;
                    }
                }
            });

            // Контекстное меню узла
            node.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.contextNodeId = quest.id;
                const menu = document.getElementById('node-context-menu');
                menu.style.left = `${e.clientX}px`;
                menu.style.top = `${e.clientY}px`;
                menu.classList.remove('hidden');
            });

            nodesLayer.appendChild(node);
        });
    },

    drawLine(svgContainer, parent, child) {
        // Центры слотов (размер слота 52x52)
        const x1 = parent.x + 26;
        const y1 = parent.y + 26;
        const x2 = child.x + 26;
        const y2 = child.y + 26;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('class', 'quest-line');
        
        // Удаление связи по клику на линию
        line.addEventListener('click', () => {
            if(confirm('Удалить связь?')) {
                child.parents = child.parents.filter(id => id !== parent.id);
                this.renderCanvas();
            }
        });

        svgContainer.appendChild(line);
    },

    // =========================================
    // 3. ЛОГИКА СВЯЗЕЙ (Зависимости)
    // =========================================
    startLinking(nodeId) {
        this.linkingFromNodeId = nodeId;
        this.renderCanvas(); // Подсветим узел
        console.log("Выберите квест, который должен открыться после этого (Shift+Клик или просто ЛКМ).");
    },

    finishLinking(targetNodeId) {
        if (!this.linkingFromNodeId) return;
        if (this.linkingFromNodeId !== targetNodeId) {
            const mod = this.getActiveMod();
            const child = mod.quests.find(q => q.id === targetNodeId);
            if (!child.parents) child.parents = [];
            // Проверка на дубликаты
            if (!child.parents.includes(this.linkingFromNodeId)) {
                child.parents.push(this.linkingFromNodeId);
            }
        }
        this.linkingFromNodeId = null; // Выключаем режим
        this.renderCanvas();
    },

    // =========================================
    // 4. ОКНО РЕДАКТИРОВАНИЯ КВЕСТА
    // =========================================
    bindQuestModalEvents() {
        const modal = document.getElementById('quest-edit-modal');
        const btnSave = document.getElementById('btn-save-quest');
        const btnClose = document.getElementById('btn-close-quest');
        
        const searchInput = document.getElementById('item-search');
        const resultsContainer = document.getElementById('search-results');
        const previewContainer = document.getElementById('selected-item-preview');

        // Поиск предметов
        searchInput.addEventListener('input', (e) => {
            const results = ItemsDB.search(e.target.value);
            resultsContainer.innerHTML = ''; 
            
            results.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" width="32" height="32"><span>${item.name}</span>`;
                
                div.addEventListener('click', () => {
                    this.tempQuestIcon = item.image;
                    document.getElementById('custom-item-name').value = item.name;
                    previewContainer.innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" width="48" height="48" style="image-rendering: pixelated;"><span style="color: #00ffff;">Выбрано</span>`;
                    resultsContainer.innerHTML = ''; 
                    searchInput.value = '';
                });
                resultsContainer.appendChild(div);
            });
        });

        // Сохранить квест
        btnSave.addEventListener('click', () => {
            const title = document.getElementById('quest-title').value || 'Новый квест';
            const desc = document.getElementById('quest-desc').value;
            const customName = document.getElementById('custom-item-name').value;
            const icon = this.tempQuestIcon || 'default.png'; // Заглушка, если ничего не выбрано

            const mod = this.getActiveMod();

            if (this.editingNodeId) {
                // Обновляем существующий
                const quest = mod.quests.find(q => q.id === this.editingNodeId);
                quest.title = customName || title;
                quest.desc = desc;
                quest.icon = icon;
            } else {
                // Создаем новый
                mod.quests.push({
                    id: 'q_' + Date.now(),
                    x: this.newQuestX - 26,
                    y: this.newQuestY - 26,
                    title: customName || title,
                    desc: desc,
                    icon: icon,
                    parents: []
                });
            }

            modal.classList.add('hidden');
            this.renderCanvas();
        });

        btnClose.addEventListener('click', () => modal.classList.add('hidden'));
    },

    openQuestModal(questId = null) {
        this.editingNodeId = questId;
        const modal = document.getElementById('quest-edit-modal');
        const titleInput = document.getElementById('quest-title');
        const descInput = document.getElementById('quest-desc');
        const nameInput = document.getElementById('custom-item-name');
        const preview = document.getElementById('selected-item-preview');
        document.getElementById('search-results').innerHTML = '';

        if (questId) {
            // Режим редактирования
            const quest = this.getActiveMod().quests.find(q => q.id === questId);
            titleInput.value = quest.title;
            descInput.value = quest.desc || '';
            nameInput.value = quest.title;
            this.tempQuestIcon = quest.icon;
            preview.innerHTML = `<img src="${ItemsDB.getImageUrl(quest.icon)}" width="48" height="48" style="image-rendering: pixelated;">`;
        } else {
            // Создание нового
            titleInput.value = '';
            descInput.value = '';
            nameInput.value = '';
            this.tempQuestIcon = null;
            preview.innerHTML = '';
        }

        modal.classList.remove('hidden');
    },

    deleteQuest(questId) {
        if(confirm('Точно удалить квест?')) {
            const mod = this.getActiveMod();
            // Удаляем сам квест
            mod.quests = mod.quests.filter(q => q.id !== questId);
            // Удаляем связи с ним у других квестов
            mod.quests.forEach(q => {
                if(q.parents) q.parents = q.parents.filter(id => id !== questId);
            });
            this.renderCanvas();
        }
    },

    // =========================================
    // ЛОГИКА ВКЛАДОК (МОДЫ) - (Осталась почти без изменений)
    // =========================================
    bindModModalEvents() {
        const modal = document.getElementById('add-mod-modal');
        const btnAdd = document.getElementById('btn-add-mod');
        const btnClose = document.getElementById('btn-close-mod');
        const btnSave = document.getElementById('btn-save-mod');
        const searchInput = document.getElementById('mod-icon-search');
        const resultsContainer = document.getElementById('mod-icon-results');
        const previewContainer = document.getElementById('mod-icon-preview');

        let selectedIconPath = null;

        btnAdd.addEventListener('click', () => modal.classList.remove('hidden'));
        btnClose.addEventListener('click', () => modal.classList.add('hidden'));

        searchInput.addEventListener('input', (e) => {
            const results = ItemsDB.search(e.target.value);
            resultsContainer.innerHTML = ''; 
            results.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" loading="lazy" width="32" height="32"><span>${item.name}</span>`;
                div.addEventListener('click', () => {
                    selectedIconPath = item.image;
                    previewContainer.innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" width="48" height="48" style="image-rendering: pixelated;"><span style="color: #00ffff; margin-left: 10px;">Иконка выбрана!</span>`;
                    resultsContainer.innerHTML = ''; 
                    searchInput.value = '';
                });
                resultsContainer.appendChild(div);
            });
        });

        btnSave.addEventListener('click', () => {
            const name = document.getElementById('new-mod-name').value.trim();
            if (!name || !selectedIconPath) return alert('Введите название и выберите иконку!');
            
            const modId = 'mod_' + Date.now();
            this.data.mods.push({ id: modId, name: name, icon: selectedIconPath, quests: [] });
            this.activeModId = modId;
            
            document.getElementById('new-mod-name').value = '';
            previewContainer.innerHTML = '';
            selectedIconPath = null;
            modal.classList.add('hidden');

            this.renderSidebar();
            this.renderCanvas(); // Перерисовываем холст под новую пустую вкладку
        });
    },

    renderSidebar() {
        const list = document.getElementById('mod-list');
        list.innerHTML = '';
        this.data.mods.forEach(mod => {
            const li = document.createElement('li');
            li.className = 'mod-item';
            if (this.activeModId === mod.id) li.classList.add('active');
            li.innerHTML = `<img src="${ItemsDB.getImageUrl(mod.icon)}" width="32" height="32"><span>${mod.name}</span>`;
            li.addEventListener('click', () => {
                this.activeModId = mod.id;
                this.renderSidebar(); 
                this.renderCanvas(); 
            });
            list.appendChild(li);
        });
    },

    getActiveMod() {
        return this.data.mods.find(m => m.id === this.activeModId);
    }
};
