import { ItemsDB } from './items.js';
import { Auth } from './auth.js';

const SIZE_MAP = { x1: 52, x2: 104, x3: 156, x4: 208 };
const getSafeSize = (s) => { 
    const compat = { sm: 'x1', md: 'x1', lg: 'x2' }; 
    return compat[s] || s || 'x1'; 
};

export const EditorCanvas = {
    init(editor) {
        this.bindCanvasEvents(editor);
    },

    bindCanvasEvents(editor) {
        const container = document.getElementById('canvas-container');
        const tooltip = document.getElementById('quest-tooltip');
        const canvasMenu = document.getElementById('canvas-context-menu');
        const nodeMenu = document.getElementById('node-context-menu');
        const commentMenu = document.getElementById('comment-context-menu');

        window.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) {
                if (canvasMenu) canvasMenu.classList.add('hidden');
                if (nodeMenu) nodeMenu.classList.add('hidden');
                if (commentMenu) commentMenu.classList.add('hidden');
            }
        });

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.hideTooltip(editor);
            const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left; 
            const mouseY = e.clientY - rect.top;
            
            const canvasX = (mouseX - editor.panX) / editor.scale; 
            const canvasY = (mouseY - editor.panY) / editor.scale;

            editor.scale = Math.min(Math.max(0.1, editor.scale * zoomAmount), 3);
            editor.panX = mouseX - canvasX * editor.scale; 
            editor.panY = mouseY - canvasY * editor.scale;
            
            if (editor.activeModId) editor.viewStates[editor.activeModId] = { panX: editor.panX, panY: editor.panY, scale: editor.scale };
            this.updateTransform(editor);
        });

        container.addEventListener('mousedown', (e) => {
            if (nodeMenu) nodeMenu.classList.add('hidden');
            if (canvasMenu) canvasMenu.classList.add('hidden');
            if (commentMenu) commentMenu.classList.add('hidden');

            if (!e.target.closest('.quest-node') && !e.target.closest('.quest-comment') && !e.target.closest('.ui-element') && e.button === 0) {
                editor.isPanning = true; 
                editor.panStartX = e.clientX; 
                editor.panStartY = e.clientY;
                editor.initialPanX = editor.panX; 
                editor.initialPanY = editor.panY; 
                container.style.cursor = 'grabbing';
                this.hideTooltip(editor);
            }
        });

        container.addEventListener('mousemove', (e) => {
            if (editor.isPanning || editor.draggedQuestId || editor.draggedCommentId) {
                this.hideTooltip(editor);
            }
            
            if (editor.isPanning) {
                editor.panX = editor.initialPanX + (e.clientX - editor.panStartX);
                editor.panY = editor.initialPanY + (e.clientY - editor.panStartY);
                if (editor.activeModId) editor.viewStates[editor.activeModId] = { panX: editor.panX, panY: editor.panY, scale: editor.scale };
                this.updateTransform(editor);
            }
            
            if (editor.draggedQuestId) {
                const quest = editor.getActiveMod().quests.find(q => q.id === editor.draggedQuestId);
                const dx = (e.clientX - editor.mouseStartX) / editor.scale; 
                const dy = (e.clientY - editor.mouseStartY) / editor.scale;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) editor.hasMovedNode = true;
                quest.x = editor.nodeStartX + dx; 
                quest.y = editor.nodeStartY + dy;
                this.renderCanvas(editor, true); 
            }

            if (editor.draggedCommentId) {
                const comment = editor.getActiveMod().comments.find(c => c.id === editor.draggedCommentId);
                const dx = (e.clientX - editor.mouseStartX) / editor.scale; 
                const dy = (e.clientY - editor.mouseStartY) / editor.scale;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) editor.hasMovedNode = true;
                comment.x = editor.nodeStartX + dx; 
                comment.y = editor.nodeStartY + dy;
                this.renderCanvas(editor, true); 
            }

            const hoveredNode = e.target.closest('.quest-node');
            const hoveredComment = e.target.closest('.quest-comment');
            const isMenuHidden = (!nodeMenu || nodeMenu.classList.contains('hidden')) && 
                                 (!canvasMenu || canvasMenu.classList.contains('hidden')) && 
                                 (!commentMenu || commentMenu.classList.contains('hidden'));

            if (hoveredNode && !editor.isPanning && !editor.draggedQuestId && !editor.draggedCommentId && isMenuHidden) {
                const questId = hoveredNode.dataset.id;
                if (editor.hoveredQuestId !== questId) {
                    editor.hoveredQuestId = questId;
                    editor.hoveredCommentId = null;
                    const quest = editor.getActiveMod().quests.find(q => q.id === questId);
                    if (quest) this.showTooltip(editor, quest);
                }
                tooltip.style.left = (e.clientX + 15) + 'px'; 
                tooltip.style.top = (e.clientY + 15) + 'px';
            } 
            else if (hoveredComment && !editor.isPanning && !editor.draggedQuestId && !editor.draggedCommentId && isMenuHidden) {
                const cId = hoveredComment.dataset.id;
                if (editor.hoveredCommentId !== cId) {
                    editor.hoveredCommentId = cId;
                    editor.hoveredQuestId = null;
                    const comment = editor.getActiveMod().comments?.find(c => c.id === cId);
                    if (comment) this.showCommentTooltip(editor, comment);
                }
                tooltip.style.left = (e.clientX + 15) + 'px'; 
                tooltip.style.top = (e.clientY + 15) + 'px';
            } 
            else { 
                this.hideTooltip(editor);
            }
        });

        const stopDrag = () => {
            this.hideTooltip(editor);
            editor.isPanning = false;
            if ((editor.draggedQuestId || editor.draggedCommentId) && editor.hasMovedNode) editor.triggerAutoSave();
            editor.draggedQuestId = null;
            editor.draggedCommentId = null;
            container.style.cursor = 'default';
        };

        container.addEventListener('mouseleave', stopDrag);
        window.addEventListener('mouseup', stopDrag);

        container.addEventListener('contextmenu', (e) => {
            e.preventDefault(); 
            this.hideTooltip(editor); 
            
            if (!Auth.user) return; 
            if (!editor.activeModId) return alert('Сначала выберите или создайте ветку квестов!');
            if (e.target.closest('.quest-node') || e.target.closest('.quest-comment') || e.target.closest('.ui-element')) return;

            if (nodeMenu) nodeMenu.classList.add('hidden');
            if (commentMenu) commentMenu.classList.add('hidden');

            const rect = container.getBoundingClientRect();
            editor.newQuestX = (e.clientX - rect.left - editor.panX) / editor.scale - 26; 
            editor.newQuestY = (e.clientY - rect.top - editor.panY) / editor.scale - 26;

            canvasMenu.style.left = `${e.clientX}px`; 
            canvasMenu.style.top = `${e.clientY}px`;
            canvasMenu.classList.remove('hidden');
        });

        document.getElementById('menu-add-quest')?.addEventListener('click', () => { document.getElementById('canvas-context-menu').classList.add('hidden'); editor.openQuestModal(); });
        document.getElementById('menu-add-comment')?.addEventListener('click', () => { document.getElementById('canvas-context-menu').classList.add('hidden'); editor.openCommentModal(); });
        document.getElementById('menu-copy')?.addEventListener('click', () => { nodeMenu.classList.add('hidden'); editor.copyQuest(editor.contextNodeId); });
        document.getElementById('menu-delete')?.addEventListener('click', () => { nodeMenu.classList.add('hidden'); editor.deleteQuest(editor.contextNodeId); });
        document.getElementById('menu-edit')?.addEventListener('click', () => { nodeMenu.classList.add('hidden'); editor.openQuestModal(editor.contextNodeId); });
        document.getElementById('menu-link')?.addEventListener('click', () => { nodeMenu.classList.add('hidden'); editor.linkingFromNodeId = editor.contextNodeId; this.renderCanvas(editor); });
        document.getElementById('menu-edit-comment')?.addEventListener('click', () => { commentMenu.classList.add('hidden'); editor.openCommentModal(editor.contextCommentId); });
        document.getElementById('menu-delete-comment')?.addEventListener('click', () => {
            commentMenu.classList.add('hidden');
            if (confirm('Удалить комментарий?')) {
                const mod = editor.getActiveMod();
                mod.comments = mod.comments.filter(c => c.id !== editor.contextCommentId);
                editor.triggerAutoSave(); 
                this.renderCanvas(editor);
            }
        });
    },

    updateTransform(editor) { 
        document.getElementById('quest-canvas').style.transform = `translate(${editor.panX}px, ${editor.panY}px) scale(${editor.scale})`; 
    },

    hideTooltip(editor) {
        const tooltip = document.getElementById('quest-tooltip');
        if (tooltip) tooltip.classList.add('hidden');
        editor.hoveredQuestId = null;
        editor.hoveredCommentId = null;
    },

    centerCanvas(editor) {
        const mod = editor.getActiveMod();
        const container = document.getElementById('canvas-container');
        
        if (!mod || !mod.quests || mod.quests.length === 0) {
            editor.scale = 1; editor.panX = container.clientWidth / 2 - 26; editor.panY = container.clientHeight / 2 - 26;
            this.updateTransform(editor); return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        mod.quests.forEach(q => {
            const size = SIZE_MAP[getSafeSize(q.size)];
            if (q.x < minX) minX = q.x; if (q.y < minY) minY = q.y;
            if (q.x + size > maxX) maxX = q.x + size; if (q.y + size > maxY) maxY = q.y + size;
        });

        const padding = 100; const boxW = maxX - minX; const boxH = maxY - minY;
        const scaleX = (container.clientWidth - padding * 2) / (boxW || 1); 
        const scaleY = (container.clientHeight - padding * 2) / (boxH || 1);
        
        editor.scale = Math.max(0.1, Math.min(scaleX, scaleY, 1.5));
        editor.panX = (container.clientWidth / 2) - (minX + boxW / 2) * editor.scale; 
        editor.panY = (container.clientHeight / 2) - (minY + boxH / 2) * editor.scale;
        
        if (editor.viewStates[mod.id]) {
            editor.panX = editor.viewStates[mod.id].panX;
            editor.panY = editor.viewStates[mod.id].panY;
            editor.scale = editor.viewStates[mod.id].scale;
        }
        this.updateTransform(editor);
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

    renderCanvas(editor, skipSave = false) {
        const nodesLayer = document.getElementById('nodes-layer');
        const linesLayer = document.getElementById('connections-layer');
        nodesLayer.innerHTML = ''; linesLayer.innerHTML = '';
        
        const mod = editor.getActiveMod();
        if (!mod) { this.updateSummary(editor); return; }

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

        if (mod.comments && mod.comments.length > 0) {
            mod.comments.forEach(c => {
                const cNode = document.createElement('div');
                cNode.className = 'quest-comment';
                cNode.style.left = `${c.x}px`; cNode.style.top = `${c.y}px`; cNode.dataset.id = c.id; cNode.innerHTML = `i`;
                cNode.addEventListener('mousedown', (e) => {
                    if (e.button === 0 && Auth.user) {
                        e.stopPropagation(); editor.draggedCommentId = c.id; editor.hasMovedNode = false;
                        editor.mouseStartX = e.clientX; editor.mouseStartY = e.clientY; editor.nodeStartX = c.x; editor.nodeStartY = c.y;
                    }
                });
                cNode.addEventListener('contextmenu', (e) => {
                    e.preventDefault(); e.stopPropagation(); this.hideTooltip(editor);
                    if (!Auth.user) return;
                    editor.contextCommentId = c.id;
                    document.getElementById('canvas-context-menu').classList.add('hidden');
                    document.getElementById('node-context-menu').classList.add('hidden');
                    const menu = document.getElementById('comment-context-menu');
                    menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`; menu.classList.remove('hidden');
                });
                nodesFragment.appendChild(cNode);
            });
        }

        mod.quests.forEach(quest => {
            const node = document.createElement('div');
            const nodeSize = getSafeSize(quest.size);
            node.className = `quest-node size-${nodeSize}`;
            
            if (editor.linkingFromNodeId === quest.id) node.classList.add('selected');
            
            node.style.left = `${quest.x}px`; 
            node.style.top = `${quest.y}px`;
            node.dataset.id = quest.id;
            
            let iconFile = quest.icon;
            if (!iconFile && quest.reqs && quest.reqs.length > 0) { if (quest.reqs[0].item && quest.reqs[0].item.image) iconFile = quest.reqs[0].item.image; }
            if (!iconFile && quest.rewards && quest.rewards.length > 0) { if (quest.rewards[0].item && quest.rewards[0].item.image) iconFile = quest.rewards[0].item.image; }
            if (!iconFile) iconFile = 'book.png';
            const iconPath = ItemsDB.getImageUrl(iconFile);

            let hasExternalParents = false;
            if (quest.parents && quest.parents.length > 0) {
                quest.parents.forEach(pId => { if (!mod.quests.find(q => q.id === pId)) hasExternalParents = true; });
            }
            const externalIndicatorHtml = hasExternalParents ? `<div style="position:absolute; top:-8px; right:-8px; background:#ffaa00; border:2px solid #333; color:#000; border-radius:50%; width:22px; height:22px; font-size:12px; display:flex; align-items:center; justify-content:center; z-index:10; box-shadow: 1px 1px 3px rgba(0,0,0,0.5);" title="Зависит от квестов из других веток">🔗</div>` : '';

            node.innerHTML = `<img src="${iconPath}" loading="lazy"><div class="node-title">${ItemsDB.formatMC(quest.title)}</div>${externalIndicatorHtml}`;

            node.addEventListener('mousedown', (e) => {
                if (e.button === 0 && Auth.user) {
                    if (e.shiftKey || editor.linkingFromNodeId) {
                        e.stopPropagation();
                        if (!editor.linkingFromNodeId) { editor.linkingFromNodeId = quest.id; } 
                        else {
                            if (editor.linkingFromNodeId !== quest.id) {
                                if (!quest.parents) quest.parents = [];
                                const idx = quest.parents.indexOf(editor.linkingFromNodeId);
                                if (idx > -1) quest.parents.splice(idx, 1); else quest.parents.push(editor.linkingFromNodeId);
                                editor.triggerAutoSave(); 
                            }
                            editor.linkingFromNodeId = null;
                        }
                        this.renderCanvas(editor);
                    } else {
                        e.stopPropagation(); editor.draggedQuestId = quest.id; editor.hasMovedNode = false;
                        editor.mouseStartX = e.clientX; editor.mouseStartY = e.clientY; editor.nodeStartX = quest.x; editor.nodeStartY = quest.y;
                    }
                }
            });

            node.addEventListener('click', (e) => {
                this.hideTooltip(editor); 
                if (e.button !== 0 || (e.shiftKey && Auth.user) || editor.hasMovedNode) return; 
                editor.openQuestViewModal(quest.id);
            });

            node.addEventListener('contextmenu', (e) => {
                e.preventDefault(); e.stopPropagation(); this.hideTooltip(editor); 
                if (!Auth.user) return; 
                editor.contextNodeId = quest.id;
                document.getElementById('canvas-context-menu').classList.add('hidden');
                document.getElementById('comment-context-menu').classList.add('hidden');
                const menu = document.getElementById('node-context-menu');
                menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`; menu.classList.remove('hidden');
            });

            nodesFragment.appendChild(node);
        });

        linesLayer.appendChild(linesFragment);
        nodesLayer.appendChild(nodesFragment);
        if (!skipSave) this.updateSummary(editor);
    },

    showCommentTooltip(editor, comment) {
        const tt = document.getElementById('quest-tooltip');
        document.getElementById('tt-title').innerHTML = "<span style='color:#ffaa00;'>Комментарий</span>";
        document.getElementById('tt-desc').innerHTML = ItemsDB.formatMC(comment.text || '');
        document.getElementById('tt-parents-container').style.display = 'none';
        document.getElementById('tt-reqs-container').style.display = 'none';
        document.getElementById('tt-rewards-container').style.display = 'none';
        tt.classList.remove('hidden');
    },

    showTooltip(editor, quest) {
        const tt = document.getElementById('quest-tooltip');
        document.getElementById('tt-title').innerHTML = ItemsDB.formatMC(quest.title);
        document.getElementById('tt-desc').innerHTML = ItemsDB.formatMC(quest.desc || '');
        document.getElementById('tt-reqs-container').style.display = 'block';
        document.getElementById('tt-rewards-container').style.display = 'block';

        const parentsContainer = document.getElementById('tt-parents-container');
        if (quest.parents && quest.parents.length > 0) {
            let pNames = [];
            quest.parents.forEach(pId => {
                let foundTitle = pId; let foundModName = "?";
                editor.data.mods.forEach(m => {
                    const found = m.quests.find(q => q.id === pId);
                    if(found) { foundTitle = found.title; foundModName = m.name; }
                });
                pNames.push(`• ${ItemsDB.formatMC(foundTitle)} <small>[${ItemsDB.formatMC(foundModName)}]</small>`);
            });
            parentsContainer.innerHTML = `<div style="color:#ffaa00; font-size:13px; margin-bottom:10px; border-bottom:1px solid #555; padding-bottom:5px;">Зависит от:<br>${pNames.join('<br>')}</div>`;
            parentsContainer.style.display = 'block';
        } else { parentsContainer.style.display = 'none'; }

        document.getElementById('tt-reqs').innerHTML = (quest.reqs || []).map(r => {
            const consumeTag = (r.taskType !== 'hunt' && r.taskType !== 'block_break' && r.taskType !== 'checkbox' && r.taskType !== 'xp') ? (r.consume !== false ? ' <span style="color:#ff5555; font-size:12px; margin-left:4px; white-space: nowrap;">[Забрать]</span>' : ' <span style="color:#aaaaaa; font-size:12px; margin-left:4px; white-space: nowrap;">[Наличие]</span>') : '';
            const imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');
            return `<div class="tt-item"><img src="${imgPath}"><div class="tt-item-text">${editor.getTaskLabel(r)} x${r.count}${consumeTag}</div></div>`;
        }).join('') || '<div style="color:#888; font-style:italic;">Нет требований</div>';

        document.getElementById('tt-rewards').innerHTML = (quest.rewards || []).map(r => {
            const choiceTag = r.isChoice ? ' <span style="color:#ffff55; font-size:12px; margin-left:4px; white-space: nowrap;">[На выбор]</span>' : '';
            const imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');
            return `<div class="tt-item"><img src="${imgPath}"><div class="tt-item-text">${editor.getRewardLabel(r)} x${r.count}${choiceTag}</div></div>`;
        }).join('') || '<div style="color:#888; font-style:italic;">Нет наград</div>';

        tt.classList.remove('hidden');
    },

    updateSummary(editor) {
        const container = document.getElementById('rewards-summary-list');
        const summaryPanel = document.getElementById('rewards-summary');
        const mod = editor.getActiveMod();
        if (!mod) { summaryPanel.classList.add('hidden'); container.innerHTML = ''; return; }

        const totals = {};
        mod.quests.forEach(q => {
            (q.rewards || []).forEach(r => {
                const name = editor.getRewardLabel(r);
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

    // --- МАГИЯ СОРТИРОВКИ (АВТО-РАССТАНОВКА) ---
    autoLayout(editor) {
        const mod = editor.getActiveMod();
        if (!mod || !mod.quests || mod.quests.length === 0) return;

        if (!confirm('Авто-расстановка переместит все квесты в этой ветке. Это действие можно отменить с помощью кнопки "↩ Отменить" (Ctrl+Z). Продолжить?')) return;

        // Расстояние между квестами (учитываем большие рамки)
        const GRID_X = 160; 
        const GRID_Y = 160; 

        const qMap = {};
        const childrenMap = {};
        const levels = {};

        // 1. Инициализация графа
        mod.quests.forEach(q => {
            qMap[q.id] = q;
            childrenMap[q.id] = [];
            levels[q.id] = 0;
        });

        // 2. Строим связи (кто чей ребенок)
        mod.quests.forEach(q => {
            if (q.parents) {
                q.parents.forEach(pId => {
                    if (childrenMap[pId]) childrenMap[pId].push(q.id);
                });
            }
        });

        // 3. Вычисляем уровни (Глубину дерева по оси Y)
        let changed = true;
        let iter = 0;
        while (changed && iter < 1000) { // Защита от бесконечного цикла, если юзер сделал круговую зависимость
            changed = false;
            iter++;
            mod.quests.forEach(q => {
                if (q.parents && q.parents.length > 0) {
                    let maxPLevel = -1;
                    q.parents.forEach(pId => {
                        if (levels[pId] !== undefined) maxPLevel = Math.max(maxPLevel, levels[pId]);
                    });
                    if (levels[q.id] <= maxPLevel) {
                        levels[q.id] = maxPLevel + 1;
                        changed = true;
                    }
                }
            });
        }

        // Группируем квесты по их уровню глубины
        const levelGroups = {};
        let maxLvl = 0;
        mod.quests.forEach(q => {
            const lvl = levels[q.id];
            if (!levelGroups[lvl]) levelGroups[lvl] = [];
            levelGroups[lvl].push(q);
            if (lvl > maxLvl) maxLvl = lvl;
        });

        // 4. Расставляем квесты по оси X (Проход сверху вниз)
        for (let i = 0; i <= maxLvl; i++) {
            if (!levelGroups[i]) continue;

            // Сортируем квесты на одном уровне: те, чьи родители левее, тоже встанут левее
            levelGroups[i].sort((a, b) => {
                const getAvg = (node) => {
                    if (!node.parents || node.parents.length === 0) return 0;
                    let sum = 0, count = 0;
                    node.parents.forEach(pId => { if (qMap[pId]) { sum += qMap[pId].x; count++; } });
                    return count > 0 ? sum / count : 0;
                };
                return getAvg(a) - getAvg(b);
            });

            let currentX = 0;
            levelGroups[i].forEach(q => {
                let idealX = currentX;
                // Пытаемся поставить квест прямо под его родителями
                if (q.parents && q.parents.length > 0) {
                    let sum = 0, count = 0;
                    q.parents.forEach(pId => { if (qMap[pId]) { sum += qMap[pId].x; count++; } });
                    if (count > 0) {
                        idealX = Math.round((sum / count) / GRID_X) * GRID_X;
                    }
                }

                // Запрещаем квесту наезжать на предыдущий квест на этом же уровне
                q.x = Math.max(currentX, idealX);
                q.y = i * GRID_Y;
                
                // Следующий квест на этом уровне должен стоять минимум на GRID_X правее
                currentX = q.x + GRID_X;
            });
        }

        // 5. Финальное центрирование всей ветки (чтобы она не улетала далеко в координаты 10000)
        let minX = Infinity, minY = Infinity;
        mod.quests.forEach(q => {
            if (q.x < minX) minX = q.x;
            if (q.y < minY) minY = q.y;
        });

        mod.quests.forEach(q => {
            q.x -= minX;
            q.y -= minY;
        });

        // Сохраняем состояние для Ctrl+Z и рендерим
        editor.triggerAutoSave();
        this.renderCanvas(editor);
        this.centerCanvas(editor);
    }
};
