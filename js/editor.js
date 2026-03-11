import { ItemsDB } from './items.js';
import { DB } from './db.js';
import { Auth } from './auth.js';

const SIZE_MAP = { x1: 52, x2: 104, x3: 156, x4: 208 };
const getSafeSize = (s) => { const compat = { sm: 'x1', md: 'x1', lg: 'x2' }; return compat[s] || s || 'x1'; };

export const Editor = {
    data: { mods: [] }, 
    activeModId: null,
    originalData: null, 
    isImportMode: false, 
    
    scale: 1, panX: 0, panY: 0,
    isPanning: false, panStartX: 0, panStartY: 0, initialPanX: 0, initialPanY: 0,
    
    draggedQuestId: null, mouseStartX: 0, mouseStartY: 0, nodeStartX: 0, nodeStartY: 0, hasMovedNode: false,
    linkingFromNodeId: null, contextNodeId: null, editingNodeId: null,
    hoveredQuestId: null,
    
    pickerCallback: null, tempReqs: [], tempRewards: [], tempQuestIcon: null, editingModId: null, tempModIcon: null,
    
    saveTimeout: null,

    init() {
        this.bindCanvasEvents();
        this.bindModModalEvents();
        this.bindQuestModalEvents();
        this.bindItemPickerEvents();
        this.bindTopBarEvents();
        this.renderSidebar();
        this.renderCanvas(); 
        this.centerCanvas(); 
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
            reader.onload = (event) => {
                this.parseBQData(event.target.result);
                fileInput.value = ''; 
            };
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

        document.getElementById('btn-export-bq').addEventListener('click', () => {
            this.exportToBQ();
        });
    },

    parseBQData(jsonString) {
        try {
            const rawData = JSON.parse(jsonString);
            
            const cleanKeys = (obj) => {
                if (Array.isArray(obj)) return obj.map(cleanKeys);
                if (obj !== null && typeof obj === 'object') {
                    const cleaned = {};
                    for (let key in obj) {
                        const cleanKey = key.split(':')[0];
                        cleaned[cleanKey] = cleanKeys(obj[key]);
                    }
                    return cleaned;
                }
                return obj;
            };

            const data = cleanKeys(rawData);
            const questsMap = {};

            if (data.questDatabase) {
                Object.entries(data.questDatabase).forEach(([qKey, q]) => {
                    const actualId = String(q.questID !== undefined ? q.questID : qKey);
                    let reqs = [];
                    let rewards = [];
                    
                    if (q.tasks) {
                        Object.values(q.tasks).forEach(task => {
                            if (task.requiredItems && task.taskID === 'bq_standard:retrieval') {
                                Object.values(task.requiredItems).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    reqs.push({ item: foundItem, count: item.Count || 1, customName: foundItem.name === item.id ? item.id : foundItem.name, consume: task.consume || false, taskType: 'retrieval' });
                                });
                            }
                            else if (task.requiredItems && task.taskID === 'bq_standard:crafting') {
                                Object.values(task.requiredItems).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    reqs.push({ item: foundItem, count: item.Count || 1, customName: foundItem.name === item.id ? item.id : foundItem.name, consume: false, taskType: 'crafting' });
                                });
                            }
                            else if (task.blocks && task.taskID === 'bq_standard:block_break') {
                                Object.values(task.blocks).forEach(block => {
                                    const foundItem = ItemsDB.findItemByBQ(block.blockID || block.id, block.meta || block.Damage);
                                    reqs.push({ item: foundItem, count: block.amount || block.Count || 1, customName: foundItem.name === block.blockID ? block.blockID : foundItem.name, consume: false, taskType: 'block_break' });
                                });
                            }
                            else if (task.taskID === 'bq_standard:hunt' || task.target) {
                                 const target = task.target || "Моб";
                                 reqs.push({ item: { item_key: `mob_${target}`, name: target, image: '', mod: 'Мобы' }, count: task.required || 1, target: target, customName: target, consume: false, taskType: 'hunt' });
                            }
                        });
                    }
                    
                    if (q.rewards) {
                        Object.values(q.rewards).forEach(rew => {
                            if (rew.rewards) {
                                Object.values(rew.rewards).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    rewards.push({ item: foundItem, count: item.Count || 1, customName: foundItem.name === item.id ? item.id : foundItem.name, isChoice: false });
                                });
                            }
                            if (rew.choices) {
                                Object.values(rew.choices).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    rewards.push({ item: foundItem, count: item.Count || 1, customName: foundItem.name === item.id ? item.id : foundItem.name, isChoice: true });
                                });
                            }
                        });
                    }

                    let parents = [];
                    if (q.preRequisites) {
                        if (Array.isArray(q.preRequisites)) {
                            parents = q.preRequisites.map(p => 'bq_' + p);
                        } else {
                            parents = Object.values(q.preRequisites).map(p => 'bq_' + p);
                        }
                    }

                    let questIconStr = '';
                    if (q.properties?.betterquesting?.icon?.id) {
                        const iconItem = ItemsDB.findItemByBQ(q.properties.betterquesting.icon.id, q.properties.betterquesting.icon.Damage);
                        questIconStr = iconItem.image || '';
                    }

                    questsMap[actualId] = {
                        id: 'bq_' + actualId,
                        title: q.properties?.betterquesting?.name || 'Безымянный квест',
                        desc: q.properties?.betterquesting?.desc || '',
                        icon: questIconStr,
                        parents: parents,
                        reqs: reqs,
                        rewards: rewards
                    };
                });
            }

            const newMods = [];
            if (data.questLines) {
                Object.keys(data.questLines).forEach(key => {
                    const ql = data.questLines[key];
                    const lineQuests = [];
                    const addedIds = new Set();
                    
                    if (ql.quests) {
                        Object.values(ql.quests).forEach(pos => {
                            const qIdStr = String(pos.id !== undefined ? pos.id : (pos.questID !== undefined ? pos.questID : ""));
                            if (!qIdStr || addedIds.has(qIdStr)) return;
                            addedIds.add(qIdStr);

                            const baseQ = questsMap[qIdStr];
                            if (baseQ) {
                                lineQuests.push({
                                    ...JSON.parse(JSON.stringify(baseQ)),
                                    x: (pos.x || 0) * 3,
                                    y: (pos.y || 0) * 3,
                                    size: pos.sizeX > 24 ? 'x2' : 'x1' 
                                });
                            }
                        });
                    }

                    newMods.push({
                        id: 'bq_mod_' + key,
                        name: ql.properties?.betterquesting?.name || 'Ветка ' + key,
                        icon: '',
                        quests: lineQuests
                    });
                });
            }

            this.originalData = JSON.parse(JSON.stringify(this.data.mods)); 
            this.isImportMode = true;
            this.data.mods = newMods;
            this.activeModId = newMods.length > 0 ? newMods[0].id : null;
            
            document.getElementById('import-mode-bar').classList.remove('hidden');
            document.body.classList.add('import-mode');
            
            this.renderSidebar(); this.renderCanvas(); this.centerCanvas();
        } catch (e) {
            console.error(e);
            alert('Ошибка парсинга файла! Убедитесь, что это QuestDatabase.json');
        }
    },

    exportToBQ() {
        const bqData = {
            "build:8": "3.0.328",
            "format:8": "2.0.0",
            "questDatabase:9": {},
            "questLines:9": {}
        };

        let questNumericId = 0;
        const idMap = {}; 

        this.data.mods.forEach(mod => {
            mod.quests.forEach(q => {
                if(idMap[q.id] === undefined) idMap[q.id] = questNumericId++;
            });
        });

        this.data.mods.forEach(mod => {
            mod.quests.forEach(q => {
                const bqId = idMap[q.id];
                const preReqs = (q.parents || []).map(p => idMap[p]).filter(p => p !== undefined);

                const tasks = {};
                let taskIdx = 0;

                const retrievals = [];
                const craftings = [];
                const blockBreaks = [];
                const hunts = [];

                if (q.reqs) {
                    q.reqs.forEach(req => {
                        let tType = req.taskType;
                        if (!tType) {
                            const nameStr = req.customName || req.item.name || "";
                            if (nameStr.startsWith('Убить: ')) { tType = 'hunt'; req.target = nameStr.replace('Убить: ', '').trim(); }
                            else if (nameStr.startsWith('Сломать: ')) { tType = 'block_break'; req.customName = nameStr.replace('Сломать: ', '').trim(); }
                            else if (nameStr.startsWith('Создать: ')) { tType = 'crafting'; req.customName = nameStr.replace('Создать: ', '').trim(); }
                            else tType = 'retrieval';
                            req.taskType = tType;
                        }

                        if (tType === 'hunt') hunts.push(req);
                        else if (tType === 'block_break') blockBreaks.push(req);
                        else if (tType === 'crafting') craftings.push(req);
                        else retrievals.push(req);
                    });
                }

                const createItemsDict = (arr) => {
                    const dict = {};
                    arr.forEach((req, idx) => {
                        let sysId = req.item.string_id || req.item.item_key || "minecraft:stone";
                        let damage = req.item.damage !== undefined ? req.item.damage : 0;
                        if (!req.item.string_id && sysId.includes(':') && !sysId.match(/[a-zA-Z]/)) {
                            const parts = sysId.split(':');
                            sysId = parts[0]; damage = parseInt(parts[1]) || 0;
                        }
                        dict[`${idx}:10`] = { "id:8": sysId, "Count:3": parseInt(req.count) || 1, "Damage:2": damage, "OreDict:8": "" };
                    });
                    return dict;
                };

                const createBlocksDict = (arr) => {
                    const dict = {};
                    arr.forEach((req, idx) => {
                        let sysId = req.item.string_id || req.item.item_key || "minecraft:stone";
                        let damage = req.item.damage !== undefined ? req.item.damage : -1;
                        if (!req.item.string_id && sysId.includes(':') && !sysId.match(/[a-zA-Z]/)) {
                            const parts = sysId.split(':');
                            sysId = parts[0]; damage = parseInt(parts[1]) || -1;
                        }
                        dict[`${idx}:10`] = { "blockID:8": sysId, "amount:3": parseInt(req.count) || 1, "meta:3": damage, "oreDict:8": "", "nbt:10": {} };
                    });
                    return dict;
                };

                if (retrievals.length > 0) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:retrieval", "consume:1": retrievals[0].consume ? 1 : 0, "requiredItems:9": createItemsDict(retrievals) };
                if (craftings.length > 0) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:crafting", "allowAnvil:1": 0, "allowSmelt:1": 0, "allowCraft:1": 1, "requiredItems:9": createItemsDict(craftings) };
                if (blockBreaks.length > 0) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:block_break", "blocks:9": createBlocksDict(blockBreaks) };
                
                hunts.forEach(h => {
                    let target = h.target || h.customName || h.item.name;
                    tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:hunt", "target:8": target, "required:3": parseInt(h.count) || 1, "subtypes:1": 1 };
                });

                const rewards = {};
                let rewIdx = 0;
                if (q.rewards) {
                    const standardRews = q.rewards.filter(r => !r.isChoice);
                    const choiceRews = q.rewards.filter(r => r.isChoice);

                    if (standardRews.length > 0) rewards[`${rewIdx++}:10`] = { "rewardID:8": "bq_standard:item", "rewards:9": createItemsDict(standardRews) };
                    if (choiceRews.length > 0) rewards[`${rewIdx++}:10`] = { "rewardID:8": "bq_standard:choice", "choices:9": createItemsDict(choiceRews) };
                }

                bqData["questDatabase:9"][`${bqId}:10`] = {
                    "questID:3": bqId,
                    "preRequisites:11": preReqs,
                    "properties:10": {
                        "betterquesting:10": {
                            "name:8": q.title,
                            "desc:8": q.desc || "",
                            "icon:10": { "id:8": "minecraft:stone", "Count:3": 1, "Damage:2": 0, "OreDict:8": "" }
                        }
                    },
                    "tasks:9": tasks,
                    "rewards:9": rewards
                };
            });
        });

        let lineId = 0;
        this.data.mods.forEach(mod => {
            const lineQuests = {};
            mod.quests.forEach(q => {
                const bqId = idMap[q.id];
                const sz = q.size === 'x2' ? 48 : 24;
                lineQuests[`${bqId}:10`] = {
                    "x:3": Math.round(q.x / 3),
                    "y:3": Math.round(q.y / 3),
                    "id:3": bqId,
                    "sizeX:3": sz,
                    "sizeY:3": sz
                };
            });

            bqData["questLines:9"][`${lineId}:10`] = {
                "lineID:3": lineId,
                "properties:10": { "betterquesting:10": { "name:8": mod.name, "desc:8": "Сгенерировано в редакторе" } },
                "quests:9": lineQuests
            };
            lineId++;
        });

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bqData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "QuestDatabase_Export.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        
        DB.logAction('Сделал экспорт базы в JSON');
    },

    triggerAutoSave() {
        if (!Auth.user) return;
        if (this.isImportMode) return; 

        const indicator = document.getElementById('save-indicator');
        indicator.classList.remove('hidden');
        indicator.innerText = "Сохранение...";
        indicator.style.color = "#ffaa00";

        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            await DB.saveQuestsSilent(this.data.mods);
            indicator.innerText = "Сохранено ✔";
            indicator.style.color = "#55ff55";
            setTimeout(() => indicator.classList.add('hidden'), 2000);
        }, 1500);
    },

    centerCanvas() {
        const mod = this.getActiveMod();
        const container = document.getElementById('canvas-container');
        
        if (!mod || !mod.quests || mod.quests.length === 0) {
            this.scale = 1;
            this.panX = container.clientWidth / 2 - 26;
            this.panY = container.clientHeight / 2 - 26;
            this.updateTransform();
            return;
        }

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

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
        
        const contW = container.clientWidth;
        const contH = container.clientHeight;

        const scaleX = (contW - padding * 2) / (boxWidth || 1);
        const scaleY = (contH - padding * 2) / (boxHeight || 1);
        
        this.scale = Math.min(scaleX, scaleY, 1.5);
        this.scale = Math.max(0.1, this.scale);

        const centerX = minX + boxWidth / 2;
        const centerY = minY + boxHeight / 2;

        this.panX = (contW / 2) - centerX * this.scale;
        this.panY = (contH / 2) - centerY * this.scale;

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

        container.addEventListener('mousemove', (e) => {
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
                this.renderCanvas(true); 
            }

            const hoveredNode = e.target.closest('.quest-node');
            const isMenuHidden = contextMenu.classList.contains('hidden');
            
            if (hoveredNode && !this.isPanning && !this.draggedQuestId && isMenuHidden) {
                const questId = hoveredNode.dataset.id;
                if (this.hoveredQuestId !== questId) {
                    this.hoveredQuestId = questId;
                    const quest = this.getActiveMod().quests.find(q => q.id === questId);
                    if (quest) this.showTooltip(quest);
                }
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            } else {
                this.hoveredQuestId = null;
                tooltip.classList.add('hidden');
            }
        });

        container.addEventListener('mouseleave', () => {
            tooltip.classList.add('hidden');
            this.hoveredQuestId = null;
            this.isPanning = false;
            if(this.draggedQuestId && this.hasMovedNode) this.triggerAutoSave();
            this.draggedQuestId = null;
        });

        window.addEventListener('mouseup', () => {
            this.isPanning = false;
            if (this.draggedQuestId && this.hasMovedNode) {
                this.triggerAutoSave();
            }
            this.draggedQuestId = null;
            container.style.cursor = 'default';
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

        document.getElementById('menu-copy').addEventListener('click', () => {
            contextMenu.classList.add('hidden');
            this.copyQuest(this.contextNodeId);
        });

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

    renderCanvas(skipSave = false) {
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
            const nodeSize = getSafeSize(quest.size);
            node.className = `quest-node size-${nodeSize}`;
            
            if (this.linkingFromNodeId === quest.id) node.classList.add('selected');
            node.style.left = `${quest.x}px`; node.style.top = `${quest.y}px`;
            node.dataset.id = quest.id;
            
            let iconStr = '';
            if (quest.icon) iconStr = quest.icon;
            else if (quest.reqs && quest.reqs.length > 0) iconStr = quest.reqs[0].item.image;

            const iconPath = iconStr ? ItemsDB.getImageUrl(iconStr) : '';
            const imgHtml = iconPath ? `<img src="${iconPath}">` : '';

            node.innerHTML = `${imgHtml}<div class="node-title">${ItemsDB.formatMC(quest.title)}</div>`;

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
                        this.mouseStartX = e.clientX; this.mouseStartY = e.clientY;
                        this.nodeStartX = quest.x; this.nodeStartY = quest.y;
                    }
                }
            });

            node.addEventListener('click', (e) => {
                if (e.button !== 0) return;
                if (e.shiftKey && Auth.user) return;
                if (this.hasMovedNode) return; 
                this.openQuestViewModal(quest.id);
            });

            node.addEventListener('contextmenu', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (!Auth.user) return; 
                this.contextNodeId = quest.id;
                const menu = document.getElementById('node-context-menu');
                menu.style.left = `${e.clientX}px`;
                menu.style.top = `${e.clientY}px`;
                menu.classList.remove('hidden');
            });

            nodesLayer.appendChild(node);
        });

        if (!skipSave) this.updateSummary();
    },

    drawLine(svg, parent, child) {
        const pSize = SIZE_MAP[getSafeSize(parent.size)] / 2;
        const cSize = SIZE_MAP[getSafeSize(child.size)] / 2;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', parent.x + pSize); line.setAttribute('y1', parent.y + pSize);
        line.setAttribute('x2', child.x + cSize); line.setAttribute('y2', child.y + cSize);
        line.setAttribute('class', 'quest-line');
        svg.appendChild(line);
    },

    getTaskLabel(r) {
        const t = r.taskType || 'retrieval';
        let name = r.customName || r.item.name;
        if (t === 'hunt') return `Убить: ${r.target || name}`;
        if (t === 'block_break') return `Сломать: ${ItemsDB.formatMC(name)}`;
        if (t === 'crafting') return `Создать: ${ItemsDB.formatMC(name)}`;
        return ItemsDB.formatMC(name);
    },

    showTooltip(quest) {
        const tt = document.getElementById('quest-tooltip');
        document.getElementById('tt-title').innerHTML = ItemsDB.formatMC(quest.title);
        document.getElementById('tt-desc').innerText = quest.desc || '';
        
        let reqHtml = '';
        if (quest.reqs && quest.reqs.length > 0) {
            quest.reqs.forEach(r => { 
                const consumeTag = (r.taskType !== 'hunt' && r.taskType !== 'block_break') 
                    ? (r.consume !== false ? '<span style="color:#ff5555; font-size:12px; margin-left:6px;">[Забрать]</span>' : '<span style="color:#aaaaaa; font-size:12px; margin-left:6px;">[Наличие]</span>')
                    : '';
                reqHtml += `<div class="tt-item"><img src="${ItemsDB.getImageUrl(r.item.image)}">${r.count}x ${this.getTaskLabel(r)}${consumeTag}</div>`; 
            });
        } else reqHtml = 'Нет требований';
        document.getElementById('tt-reqs').innerHTML = reqHtml;

        let rewHtml = '';
        if (quest.rewards && quest.rewards.length > 0) {
            quest.rewards.forEach(r => { 
                const choiceTag = r.isChoice ? '<span style="color:#ffff55; font-size:12px; margin-left:6px;">[На выбор]</span>' : '';
                rewHtml += `<div class="tt-item"><img src="${ItemsDB.getImageUrl(r.item.image)}">${r.count}x ${ItemsDB.formatMC(r.customName || r.item.name)}${choiceTag}</div>`; 
            });
        } else rewHtml = 'Нет наград';
        document.getElementById('tt-rewards').innerHTML = rewHtml;

        tt.classList.remove('hidden');
    },

    updateSummary() {
        const container = document.getElementById('rewards-summary-list');
        const summaryPanel = document.getElementById('rewards-summary');
        container.innerHTML = '';
        
        const mod = this.getActiveMod();
        if (!mod) { summaryPanel.classList.add('hidden'); return; }

        const totals = {};
        mod.quests.forEach(q => {
            (q.rewards || []).forEach(r => {
                const name = r.customName || r.item.name;
                const key = name + (r.isChoice ? '___CHOICE' : '___GUARANTEED');
                if (!totals[key]) totals[key] = { count: 0, item: r.item, name: name, isChoice: r.isChoice };
                totals[key].count += parseInt(r.count || 1);
            });
        });

        if (Object.keys(totals).length > 0) {
            summaryPanel.classList.remove('hidden');
            for (const key in totals) {
                const choiceTag = totals[key].isChoice ? '<span style="color:#ffff55; font-size:12px; margin-left:4px;">[На выбор]</span>' : '';
                container.innerHTML += `<div class="summary-item"><img src="${ItemsDB.getImageUrl(totals[key].item.image)}"> ${totals[key].count}x ${ItemsDB.formatMC(totals[key].name)}${choiceTag}</div>`;
            }
        } else {
            summaryPanel.classList.add('hidden');
        }
    },

    saveTempState() {
        this.tempReqs.forEach((r, idx) => {
            const typeSel = document.getElementById(`req-type-${idx}`);
            if(typeSel) r.taskType = typeSel.value;

            const countInp = document.getElementById(`req-count-${idx}`);
            if (countInp) r.count = countInp.value;
            
            if (r.taskType === 'hunt') {
                const targetInp = document.getElementById(`req-target-${idx}`);
                if (targetInp) r.target = targetInp.value;
            } else {
                const nameInp = document.getElementById(`req-name-${idx}`);
                if (nameInp) r.customName = nameInp.value;
            }

            const consumeCb = document.getElementById(`req-consume-${idx}`);
            if (consumeCb) r.consume = consumeCb.checked;
        });
        this.tempRewards.forEach((r, idx) => {
            const countInp = document.getElementById(`rew-count-${idx}`);
            const nameInp = document.getElementById(`rew-name-${idx}`);
            const choiceCb = document.getElementById(`rew-choice-${idx}`);
            if (countInp) r.count = countInp.value;
            if (nameInp) r.customName = nameInp.value;
            if (choiceCb) r.isChoice = choiceCb.checked;
        });
    },

    copyQuest(questId) {
        const mod = this.getActiveMod();
        const originalQuest = mod.quests.find(q => q.id === questId);
        if (!originalQuest) return;

        const copiedReqs = JSON.parse(JSON.stringify(originalQuest.reqs || []));
        const copiedRewards = JSON.parse(JSON.stringify(originalQuest.rewards || []));

        const newQuest = {
            id: 'q_' + Date.now(),
            x: originalQuest.x + 60, 
            y: originalQuest.y + 60, 
            title: originalQuest.title + ' (Копия)',
            desc: originalQuest.desc,
            size: originalQuest.size,
            icon: originalQuest.icon,
            reqs: copiedReqs,
            rewards: copiedRewards,
            parents: [] 
        };

        mod.quests.push(newQuest);
        DB.logAction(`Скопировал квест: ${originalQuest.title}`);
        this.triggerAutoSave();
        this.renderCanvas();
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
                document.getElementById('quest-icon-preview').innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" style="width: 32px; height: 32px; image-rendering: pixelated;">`;
            });
        });

        document.getElementById('btn-add-req').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((item) => { 
                this.tempReqs.push({ item: item, count: 1, customName: item.name, consume: true, taskType: 'retrieval' }); 
                this.renderQuestEditForm(); 
            });
        });

        document.getElementById('btn-add-reward').addEventListener('click', () => {
            this.saveTempState();
            this.openItemPicker((item) => { 
                this.tempRewards.push({ item: item, count: 1, customName: item.name, isChoice: false }); 
                this.renderQuestEditForm(); 
            });
        });

        document.getElementById('btn-save-quest').addEventListener('click', () => {
            this.saveTempState(); 
            
            const mod = this.getActiveMod();
            const title = document.getElementById('quest-title').value || 'Новый квест';
            const desc = document.getElementById('quest-desc').value;
            const size = document.getElementById('quest-size').value;

            if (this.editingNodeId) {
                const q = mod.quests.find(q => q.id === this.editingNodeId);
                q.title = title; q.desc = desc; q.size = size; q.icon = this.tempQuestIcon;
                q.reqs = [...this.tempReqs]; q.rewards = [...this.tempRewards];
                DB.logAction(`Отредактировал квест: ${title}`);
            } else {
                mod.quests.push({
                    id: 'q_' + Date.now(), x: this.newQuestX, y: this.newQuestY,
                    title: title, desc: desc, size: size, icon: this.tempQuestIcon,
                    reqs: [...this.tempReqs], rewards: [...this.tempRewards], parents: []
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

        document.getElementById('btn-close-quest').addEventListener('click', () => modal.classList.add('hidden'));
    },

    openQuestViewModal(questId) {
        const mod = this.getActiveMod();
        const quest = mod.quests.find(q => q.id === questId);
        if (!quest) return;

        const modal = document.getElementById('quest-view-modal');
        
        let iconStr = '';
        if (quest.icon) iconStr = quest.icon;
        else if (quest.reqs && quest.reqs.length > 0) iconStr = quest.reqs[0].item.image;
        
        document.getElementById('view-quest-icon').innerHTML = iconStr ? `<img src="${ItemsDB.getImageUrl(iconStr)}" style="width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated;">` : '';
        document.getElementById('view-quest-title').innerHTML = ItemsDB.formatMC(quest.title);
        document.getElementById('view-quest-desc').innerHTML = ItemsDB.formatMC(quest.desc || 'Нет описания.');

        const reqsBox = document.getElementById('view-reqs-list');
        reqsBox.innerHTML = '';
        if (quest.reqs && quest.reqs.length > 0) {
            quest.reqs.forEach(r => {
                const consumeText = (r.taskType !== 'hunt' && r.taskType !== 'block_break') 
                    ? (r.consume !== false ? '<span style="color:#ff5555;">[Забирается]</span>' : '<span style="color:#aaaaaa;">[Только наличие]</span>')
                    : '';
                reqsBox.innerHTML += `
                    <div class="view-item-row">
                        <div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item.image)}"></div>
                        <div class="item-info">
                            <span class="item-name">${r.count}x ${this.getTaskLabel(r)}</span>
                            <span class="item-meta">${consumeText}</span>
                        </div>
                    </div>
                `;
            });
        } else {
            reqsBox.innerHTML = '<div style="padding: 15px; color: #aaa; font-size: 16px;">Нет требований</div>';
        }

        const rewsBox = document.getElementById('view-rewards-list');
        rewsBox.innerHTML = '';
        if (quest.rewards && quest.rewards.length > 0) {
            quest.rewards.forEach(r => {
                const choiceText = r.isChoice ? '<span style="color:#ffff55;">[На выбор]</span>' : '<span style="color:#55ff55;">[Гарантировано]</span>';
                rewsBox.innerHTML += `
                    <div class="view-item-row">
                        <div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item.image)}"></div>
                        <div class="item-info">
                            <span class="item-name">${r.count}x ${ItemsDB.formatMC(r.customName || r.item.name)}</span>
                            <span class="item-meta">${choiceText}</span>
                        </div>
                    </div>
                `;
            });
        } else {
            rewsBox.innerHTML = '<div style="padding: 15px; color: #aaa; font-size: 16px;">Нет наград</div>';
        }

        modal.classList.remove('hidden');
    },

    openQuestModal(questId = null) {
        this.editingNodeId = questId;
        const modal = document.getElementById('quest-edit-modal');
        document.getElementById('btn-delete-quest').style.display = questId ? 'inline-block' : 'none';

        if (questId) {
            const q = this.getActiveMod().quests.find(q => q.id === questId);
            document.getElementById('quest-title').value = q.title || '';
            document.getElementById('quest-desc').value = q.desc || '';
            document.getElementById('quest-size').value = getSafeSize(q.size);
            this.tempQuestIcon = q.icon || null;
            
            let reqs = q.reqs || [];
            if (q.req && reqs.length === 0) reqs = [q.req]; 
            
            this.tempReqs = JSON.parse(JSON.stringify(reqs));
            this.tempRewards = q.rewards ? JSON.parse(JSON.stringify(q.rewards)) : [];
        } else {
            document.getElementById('quest-title').value = '';
            document.getElementById('quest-desc').value = '';
            document.getElementById('quest-size').value = 'x1';
            this.tempQuestIcon = null;
            this.tempReqs = []; this.tempRewards = [];
        }
        
        document.getElementById('quest-icon-preview').innerHTML = this.tempQuestIcon ? `<img src="${ItemsDB.getImageUrl(this.tempQuestIcon)}" style="width: 32px; height: 32px; image-rendering: pixelated;">` : '';
        
        this.renderQuestEditForm();
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
            
            const targetInputHtml = tType === 'hunt' 
                ? `<input type="text" id="req-target-${idx}" class="mc-input custom-name-input" value="${r.target || r.customName || ''}" placeholder="Моб (напр. Creeper)">`
                : `<input type="text" id="req-name-${idx}" class="mc-input custom-name-input" value="${r.customName || ''}" placeholder="Название">`;

            const showConsume = (tType === 'hunt' || tType === 'block_break') ? 'display:none;' : '';

            div.innerHTML = `
                <div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item.image)}" width="24" height="24"></div>
                
                <select id="req-type-${idx}" class="mc-input task-type-select">
                    <option value="retrieval" ${tType === 'retrieval' ? 'selected' : ''}>Принести</option>
                    <option value="crafting" ${tType === 'crafting' ? 'selected' : ''}>Создать</option>
                    <option value="block_break" ${tType === 'block_break' ? 'selected' : ''}>Сломать</option>
                    <option value="hunt" ${tType === 'hunt' ? 'selected' : ''}>Убить</option>
                </select>

                <input type="number" id="req-count-${idx}" class="mc-input" value="${r.count}" title="Количество">
                
                ${targetInputHtml}

                <label class="mc-checkbox" title="Забирать предмет при сдаче квеста?" style="${showConsume}">
                    <input type="checkbox" id="req-consume-${idx}" ${isChecked}> Забрать
                </label>
                <button class="mc-button danger" data-idx="${idx}">X</button>
            `;
            
            div.querySelector('.task-type-select').addEventListener('change', (e) => {
                this.saveTempState(); 
                this.tempReqs[idx].taskType = e.target.value;
                this.renderQuestEditForm(); 
            });

            div.querySelector('.danger').addEventListener('click', () => { this.tempReqs.splice(idx, 1); this.renderQuestEditForm(); });
            reqBox.appendChild(div);
        });

        const rewBox = document.getElementById('rewards-list');
        rewBox.innerHTML = '';
        this.tempRewards.forEach((r, idx) => {
            const div = document.createElement('div');
            div.className = 'reward-row';
            const isChoice = r.isChoice ? 'checked' : '';
            div.innerHTML = `
                <div class="mc-slot"><img src="${ItemsDB.getImageUrl(r.item.image)}" width="24" height="24"></div>
                <input type="number" id="rew-count-${idx}" class="mc-input" value="${r.count}" title="Количество">
                <input type="text" id="rew-name-${idx}" class="mc-input custom-name-input" value="${r.customName}" title="Название">
                <label class="mc-checkbox" title="Предлагать этот предмет на выбор?">
                    <input type="checkbox" id="rew-choice-${idx}" ${isChoice}> На выбор
                </label>
                <button class="mc-button danger" data-idx="${idx}">X</button>
            `;
            div.querySelector('.danger').addEventListener('click', () => { this.tempRewards.splice(idx, 1); this.renderQuestEditForm(); });
            rewBox.appendChild(div);
        });
    },

    deleteQuest(questId) {
        const mod = this.getActiveMod();
        const quest = mod.quests.find(q => q.id === questId);
        mod.quests = mod.quests.filter(q => q.id !== questId);
        mod.quests.forEach(q => { if(q.parents) q.parents = q.parents.filter(id => id !== questId); });
        DB.logAction(`Удалил квест: ${quest.title}`);
        this.triggerAutoSave();
        this.renderCanvas();
    },

    bindItemPickerEvents() {
        const modal = document.getElementById('item-picker-modal');
        const filterMod = document.getElementById('picker-mod-filter');
        const searchInp = document.getElementById('picker-search');
        
        const resultsContainer = document.getElementById('picker-results');
        const favContainer = document.getElementById('picker-fav-results');

        let currentSearchData = [];
        let itemsLimit = 50;

        const createItemElement = (item) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            const isFav = ItemsDB.favorites.includes(item.item_key);
            div.innerHTML = `<span class="fav-star ${isFav ? 'active' : ''}" data-key="${item.item_key}">★</span><img src="${ItemsDB.getImageUrl(item.image)}" width="32" height="32"><span>${ItemsDB.formatMC(item.name)} <small style="color:#888;">[${item.mod}]</small></span>`;
            
            div.querySelector('.fav-star').addEventListener('click', (e) => { 
                e.stopPropagation(); 
                ItemsDB.toggleFavorite(item.item_key); 
                updateBothLists(); 
            });
            div.addEventListener('click', () => { 
                modal.classList.add('hidden'); 
                if (this.pickerCallback) this.pickerCallback(item); 
            });
            return div;
        };

        const renderMainResults = () => {
            resultsContainer.innerHTML = '';
            const slice = currentSearchData.slice(0, itemsLimit);
            slice.forEach(item => resultsContainer.appendChild(createItemElement(item)));
        };

        const renderFavResults = () => {
            favContainer.innerHTML = '';
            const favs = ItemsDB.getFavorites();
            favs.forEach(item => favContainer.appendChild(createItemElement(item)));
        };

        const updateBothLists = () => {
            renderMainResults();
            renderFavResults();
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
            this.pickerCallback = cb;
            if (filterMod.options.length <= 1) {
                filterMod.innerHTML = '<option value="">Все моды</option>';
                ItemsDB.mods.forEach(m => filterMod.innerHTML += `<option value="${m}">${m}</option>`);
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
            this.editingModId = null; this.tempModIcon = null;
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
                const mod = this.data.mods.find(m => m.id === this.editingModId);
                mod.name = name; mod.icon = this.tempModIcon;
                DB.logAction(`Изменил ветку: ${name}`);
            } else {
                const id = 'mod_' + Date.now();
                this.data.mods.push({ id, name, icon: this.tempModIcon, quests: [] });
                this.activeModId = id;
                DB.logAction(`Создал ветку: ${name}`);
            }
            
            this.triggerAutoSave();
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
                <div class="mod-item-actions admin-only">
                    <button class="mod-btn edit" title="Редактировать">✏️</button>
                    <button class="mod-btn delete" title="Удалить">❌</button>
                </div>
            `;
            
            li.querySelector('.mod-item-content').addEventListener('click', () => {
                this.activeModId = mod.id;
                this.renderSidebar(); this.renderCanvas(); 
                this.centerCanvas(); 
            });

            if (Auth.user) {
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
                        this.renderSidebar(); this.renderCanvas();
                    }
                });
            }
            list.appendChild(li);
        });
    },

    getActiveMod() { return this.data.mods.find(m => m.id === this.activeModId); }
};
