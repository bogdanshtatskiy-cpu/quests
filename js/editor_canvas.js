import { ItemsDB } from './items.js';
import { Auth } from './auth.js';

// Актуальные размеры для центрирования линий
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
            editor.hideTooltip();
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
            editor.updateTransform();
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
                editor.hideTooltip();
            }
        });

        container.addEventListener('mousemove', (e) => {
            if (editor.isPanning || editor.draggedQuestId || editor.draggedCommentId) editor.hideTooltip();
            
            if (editor.isPanning) {
                editor.panX = editor.initialPanX + (e.clientX - editor.panStartX);
                editor.panY = editor.initialPanY + (e.clientY - editor.panStartY);
                if (editor.activeModId) editor.viewStates[editor.activeModId] = { panX: editor.panX, panY: editor.panY, scale: editor.scale };
                editor.updateTransform();
            }
            
            if (editor.draggedQuestId) {
                const quest = editor.getActiveMod().quests.find(q => q.id === editor.draggedQuestId);
                const dx = (e.clientX - editor.mouseStartX) / editor.scale; 
                const dy = (e.clientY - editor.mouseStartY) / editor.scale;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) editor.hasMovedNode = true;
                quest.x = editor.nodeStartX + dx; 
                quest.y = editor.nodeStartY + dy;
                editor.renderCanvas(true); 
            }

            if (editor.draggedCommentId) {
                const comment = editor.getActiveMod().comments.find(c => c.id === editor.draggedCommentId);
                const dx = (e.clientX - editor.mouseStartX) / editor.scale; 
                const dy = (e.clientY - editor.mouseStartY) / editor.scale;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) editor.hasMovedNode = true;
                comment.x = editor.nodeStartX + dx; 
                comment.y = editor.nodeStartY + dy;
                editor.renderCanvas(true); 
            }

            const hoveredNode = e.target.closest('.quest-node');
            const hoveredComment = e.target.closest('.quest-comment');
            const isMenuHidden = (!nodeMenu || nodeMenu.classList.contains('hidden')) && (!canvasMenu || canvasMenu.classList.contains('hidden')) && (!commentMenu || commentMenu.classList.contains('hidden'));

            if (hoveredNode && !editor.isPanning && !editor.draggedQuestId && !editor.draggedCommentId && isMenuHidden) {
                const questId = hoveredNode.dataset.id;
                if (editor.hoveredQuestId !== questId) {
                    editor.hoveredQuestId = questId;
                    editor.hoveredCommentId = null;
                    const quest = editor.getActiveMod().quests.find(q => q.id === questId);
                    if (quest) editor.showTooltip(quest);
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
                    if (comment) editor.showCommentTooltip(comment);
                }
                tooltip.style.left = (e.clientX + 15) + 'px'; 
                tooltip.style.top = (e.clientY + 15) + 'px';
            } 
            else { 
                editor.hideTooltip();
            }
        });

        const stopDrag = () => {
            editor.hideTooltip();
            editor.isPanning = false;
            if ((editor.draggedQuestId || editor.draggedCommentId) && editor.hasMovedNode) editor.triggerAutoSave();
            editor.draggedQuestId = null;
            editor.draggedCommentId = null;
            container.style.cursor = 'default';
        };

        container.addEventListener('mouseleave', stopDrag);
        window.addEventListener('mouseup', stopDrag);

        container.addEventListener('contextmenu', (e) => {
            e.preventDefault(); editor.hideTooltip(); 
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
        document.getElementById('menu-link')?.addEventListener('click', () => { nodeMenu.classList.add('hidden'); editor.linkingFromNodeId = editor.contextNodeId; editor.renderCanvas(); });
        document.getElementById('menu-edit-comment')?.addEventListener('click', () => { commentMenu.classList.add('hidden'); editor.openCommentModal(editor.contextCommentId); });
        document.getElementById('menu-delete-comment')?.addEventListener('click', () => {
            commentMenu.classList.add('hidden');
            if (confirm('Удалить комментарий?')) {
                const mod = editor.getActiveMod();
                mod.comments = mod.comments.filter(c => c.id !== editor.contextCommentId);
                editor.triggerAutoSave(); editor.renderCanvas();
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
            editor.updateTransform(); return;
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
        editor.updateTransform();
    },

    // Исправление: Линии всегда по центру иконок 
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
        if (!mod) { editor.updateSummary(); return; }

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
                    e.preventDefault(); e.stopPropagation(); editor.hideTooltip();
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
                        editor.renderCanvas();
                    } else {
                        e.stopPropagation(); editor.draggedQuestId = quest.id; editor.hasMovedNode = false;
                        editor.mouseStartX = e.clientX; editor.mouseStartY = e.clientY; editor.nodeStartX = quest.x; editor.nodeStartY = quest.y;
                    }
                }
            });

            node.addEventListener('click', (e) => {
                editor.hideTooltip(); 
                if (e.button !== 0 || (e.shiftKey && Auth.user) || editor.hasMovedNode) return; 
                editor.openQuestViewModal(quest.id);
            });

            node.addEventListener('contextmenu', (e) => {
                e.preventDefault(); e.stopPropagation(); editor.hideTooltip(); 
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
        if (!skipSave) editor.updateSummary();
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
                if (!totals[key]) totals[key] = { count: 0, item: r.item, name: name, isChoice: r.isChoice };
                totals[key].count += parseInt(r.count || 1);
            });
        });

        if (Object.keys(totals).length > 0) {
            summaryPanel.classList.remove('hidden');
            container.innerHTML = Object.values(totals).map(t => `<div class="summary-item"><img src="${t.item && t.item.image ? ItemsDB.getImageUrl(t.item.image) : ItemsDB.getImageUrl('book.png')}"> ${t.count}x ${t.name}${t.isChoice ? ' <span style="color:#ffff55; font-size:12px; margin-left:4px;">[На выбор]</span>' : ''}</div>`).join('');
        } else {
            summaryPanel.classList.add('hidden'); container.innerHTML = '';
        }
    }
};
