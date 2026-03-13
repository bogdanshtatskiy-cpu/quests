import { ItemsDB } from './items.js';
import { DB } from './db.js';
import { BQ } from './bq.js';

export const EditorModals = {
    init(editor) {
        this.bindNbtModalEvents(editor);
        this.bindCommentModalEvents(editor);
        this.bindQuestModalEvents(editor);
    },

    bindNbtModalEvents(editor) {
        document.getElementById('btn-close-nbt').addEventListener('click', () => { 
            document.getElementById('nbt-editor-modal').classList.add('hidden'); 
            editor.tempNbtTarget = null; 
        });

        document.getElementById('btn-save-nbt').addEventListener('click', () => {
            const text = document.getElementById('nbt-editor-textarea').value;
            const errDiv = document.getElementById('nbt-editor-error');
            try {
                const parsed = text.trim() === '' || text.trim() === '{}' ? null : JSON.parse(text);
                if (editor.tempNbtTarget) {
                    editor.tempNbtTarget.nbtTag = parsed;
                    if (editor.tempNbtTarget.item) {
                        editor.tempNbtTarget.customName = BQ.getCustomName(editor.tempNbtTarget.item, parsed);
                    }
                }
                document.getElementById('nbt-editor-modal').classList.add('hidden'); 
                errDiv.innerText = ''; 
                this.renderQuestEditForm(editor); 
            } catch(e) { 
                errDiv.innerText = 'Ошибка JSON! Проверьте скобки и запятые. Подробно: ' + e.message; 
            }
        });
    },

    bindCommentModalEvents(editor) {
        const modal = document.getElementById('comment-edit-modal');
        document.getElementById('btn-close-comment').addEventListener('click', () => { modal.classList.add('hidden'); });
        
        document.getElementById('btn-save-comment').addEventListener('click', () => {
            const text = document.getElementById('comment-text').value;
            const mod = editor.getActiveMod();
            if (!mod.comments) mod.comments = [];
            
            if (editor.editingCommentId) {
                const c = mod.comments.find(item => item.id === editor.editingCommentId);
                if (c) c.text = text;
            } else {
                mod.comments.push({ id: 'c_' + Date.now(), x: editor.newQuestX + 13, y: editor.newQuestY + 13, text: text });
            }
            editor.triggerAutoSave(); 
            modal.classList.add('hidden'); 
            editor.renderCanvas();
        });
    },

    openCommentModal(editor, commentId = null) {
        editor.editingCommentId = commentId;
        const modal = document.getElementById('comment-edit-modal');
        if (commentId) {
            const c = editor.getActiveMod().comments.find(item => item.id === commentId);
            document.getElementById('comment-text').value = c ? (c.text || '') : '';
        } else { 
            document.getElementById('comment-text').value = ''; 
        }
        modal.classList.remove('hidden');
        setTimeout(() => document.getElementById('comment-text').focus(), 50);
    },

    saveTempState(editor) {
        const getValue = (id, def) => { const el = document.getElementById(id); return el ? el.value : def; };
        const getCheck = (id, def) => { const el = document.getElementById(id); return el ? el.checked : def; };

        editor.tempReqs.forEach((r, idx) => {
            r.taskType = getValue(`req-type-${idx}`, r.taskType);
            r.count = getValue(`req-count-${idx}`, r.count);
            r.target = getValue(`req-target-${idx}`, r.target);
            r.consume = getCheck(`req-consume-${idx}`, r.consume);
            r.dialogId = getValue(`req-dialog-${idx}`, r.dialogId);
            r.desc = getValue(`req-desc-${idx}`, r.desc);
            r.factionId = getValue(`req-faction-${idx}`, r.factionId);
            r.operation = getValue(`req-operation-${idx}`, r.operation);
            r.targetValue = getValue(`req-targetValue-${idx}`, r.targetValue);
            r.questId = getValue(`req-quest-${idx}`, r.questId);
            r.onHit = getCheck(`req-onHit-${idx}`, r.onHit);
            r.onInteract = getCheck(`req-onInteract-${idx}`, r.onInteract);
            r.name = getValue(`req-locname-${idx}`, r.name);
            r.posX = getValue(`req-x-${idx}`, r.posX);
            r.posY = getValue(`req-y-${idx}`, r.posY);
            r.posZ = getValue(`req-z-${idx}`, r.posZ);
            r.dimension = getValue(`req-dim-${idx}`, r.dimension);
            r.range = getValue(`req-range-${idx}`, r.range);
            r.scoreName = getValue(`req-scoreName-${idx}`, r.scoreName);
            r.scoreDisp = getValue(`req-scoreDisp-${idx}`, r.scoreDisp);
            
            if (r.taskType === 'fluid' && r.target) {
                r.customName = BQ.FLUIDS[r.target] || r.target;
            } else if (r.taskType === 'hunt') {
                r.customName = r.target;
            } else if (r.taskType !== 'xp' && r.taskType !== 'checkbox') {
                r.customName = getValue(`req-name-${idx}`, r.customName);
            }
        });
        
        editor.tempRewards.forEach((r, idx) => {
            r.taskType = getValue(`rew-type-${idx}`, r.taskType);
            r.count = getValue(`rew-count-${idx}`, r.count);
            r.customName = getValue(`rew-name-${idx}`, r.customName);
            r.isChoice = getCheck(`rew-choice-${idx}`, r.isChoice);
            r.command = getValue(`rew-command-${idx}`, r.command);
            r.factionId = getValue(`rew-faction-${idx}`, r.factionId);
            r.targetValue = getValue(`rew-targetValue-${idx}`, r.targetValue);
            r.sender = getValue(`rew-sender-${idx}`, r.sender);
            r.subject = getValue(`rew-subject-${idx}`, r.subject);
            r.message = getValue(`rew-message-${idx}`, r.message);
            r.scoreName = getValue(`rew-scoreName-${idx}`, r.scoreName);
            r.damage = getValue(`rew-tier-${idx}`, r.damage);
        });
    },

    copyQuest(editor, questId) {
        const mod = editor.getActiveMod();
        const originalQuest = mod.quests.find(q => q.id === questId);
        if (!originalQuest) return;

        const newQuest = {
            id: 'q_' + Date.now(), x: originalQuest.x + 60, y: originalQuest.y + 60, 
            title: originalQuest.title + ' (Копия)', desc: originalQuest.desc, size: originalQuest.size, 
            icon: originalQuest.icon, iconItem: originalQuest.iconItem,
            reqs: JSON.parse(JSON.stringify(originalQuest.reqs || [])), 
            rewards: JSON.parse(JSON.stringify(originalQuest.rewards || [])), 
            parents: [] 
        };
        mod.quests.push(newQuest); 
        DB.logAction(`Скопировал квест: ${originalQuest.title}`);
        editor.triggerAutoSave(); 
        editor.renderCanvas();
    },

    deleteQuest(editor, questId) {
        const mod = editor.getActiveMod();
        mod.quests = mod.quests.filter(q => q.id !== questId);
        editor.data.mods.forEach(m => { m.quests.forEach(q => { if (q.parents) q.parents = q.parents.filter(pId => pId !== questId); }); });
        editor.triggerAutoSave(); 
        editor.renderCanvas();
    },

    // Умное добавление зависимостей (Ветка -> Квест)
    populateParentsSelect(editor) {
        const modSelect = document.getElementById('parent-mod-select');
        const questSelect = document.getElementById('parent-quest-select');
        
        modSelect.innerHTML = '<option value="">-- Выберите Ветку --</option>';
        editor.data.mods.forEach(mod => {
            const opt = document.createElement('option');
            opt.value = mod.id;
            opt.textContent = ItemsDB.formatMC(mod.name).replace(/[§&][0-9a-fk-or]/gi, '');
            modSelect.appendChild(opt);
        });

        modSelect.onchange = () => {
            questSelect.innerHTML = '<option value="">-- Выберите Квест --</option>';
            if (!modSelect.value) {
                questSelect.disabled = true;
                return;
            }
            questSelect.disabled = false;
            const selectedMod = editor.data.mods.find(m => m.id === modSelect.value);
            if (selectedMod) {
                selectedMod.quests.forEach(q => {
                    if (q.id !== editor.editingNodeId && !editor.tempParents.includes(q.id)) {
                        const opt = document.createElement('option');
                        opt.value = q.id;
                        opt.textContent = (q.title || 'Безымянный квест').replace(/[§&][0-9a-fk-or]/gi, '');
                        questSelect.appendChild(opt);
                    }
                });
            }
        };
    },

    renderParentsList(editor) {
        const container = document.getElementById('parents-list');
        container.innerHTML = '';
        editor.tempParents.forEach((pId, idx) => {
            let pQuest = null; let pMod = null;
            editor.data.mods.forEach(m => { const found = m.quests.find(q => q.id === pId); if (found) { pQuest = found; pMod = m; } });
            const title = pQuest ? pQuest.title : `Неизвестный ID: ${pId}`;
            const modName = pMod ? pMod.name : '?';
            const div = document.createElement('div');
            div.className = 'reward-row'; div.style.backgroundColor = '#1a1a1a';
            div.innerHTML = `<span style="flex:1; color:#fff;">🔗 ${ItemsDB.formatMC(title)} <small style="color:#aaa;">[${ItemsDB.formatMC(modName)}]</small></span>
                <button class="mc-button danger btn-del-parent" data-idx="${idx}" style="padding: 2px 6px;">X</button>`;
            div.querySelector('.btn-del-parent').addEventListener('click', () => { 
                editor.tempParents.splice(idx, 1); 
                this.renderParentsList(editor); 
                this.populateParentsSelect(editor); 
            });
            container.appendChild(div);
        });
    },

    bindQuestModalEvents(editor) {
        const modal = document.getElementById('quest-edit-modal');
        
        document.getElementById('btn-close-view').addEventListener('click', () => { document.getElementById('quest-view-modal').classList.add('hidden'); });
        
        document.getElementById('btn-toggle-all-consume').addEventListener('click', () => {
            this.saveTempState(editor); 
            const targetState = editor.tempReqs.some(r => r.consume === false);
            editor.tempReqs.forEach(r => r.consume = targetState); 
            this.renderQuestEditForm(editor);
        });

        document.getElementById('btn-select-quest-icon').addEventListener('click', () => {
            this.saveTempState(editor);
            editor.openItemPicker((item) => {
                editor.tempQuestIcon = item.image; editor.tempQuestIconItem = item; 
                document.getElementById('quest-icon-preview').innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" style="width: 32px; height: 32px; image-rendering: pixelated;">`;
            });
        });

        // Умное добавление задачи (сразу нужного типа)
        document.getElementById('btn-add-req-type').addEventListener('click', () => {
            this.saveTempState(editor);
            const type = document.getElementById('new-req-type-select').value;
            
            // Если нужен предмет, открываем пикер
            if (type === 'retrieval' || type === 'crafting' || type === 'block_break' || type === 'interact_item') {
                editor.openItemPicker((item) => { 
                    editor.tempReqs.push({ taskType: type, item: item, rawId: item.string_id || item.item_key, rawDamage: item.damage !== undefined ? item.damage : 0, count: 1, customName: BQ.getCustomName(item, null), consume: true, nbtTag: null }); 
                    this.renderQuestEditForm(editor); 
                });
            } else {
                // Иначе добавляем дефолтную заглушку для этого типа
                let newItem = { item_key: 'minecraft:stone', name: 'Система', image: 'stone.png' };
                if (type === 'xp') newItem = { item_key: 'xp', name: 'Опыт', image: 'experience_bottle.png' };
                if (type === 'checkbox') newItem = { item_key: 'checkbox', name: 'Галочка', image: 'checkbox.png' };
                if (type === 'fluid') newItem = { item_key: 'fluid', name: 'Жидкость', image: 'fluid_bucket.png' };
                if (type === 'hunt' || type === 'meeting' || type === 'interact_entity') newItem = { item_key: 'mob', name: 'Моб', image: 'skull.png' };
                if (type === 'npc_dialog' || type === 'npc_faction' || type === 'npc_quest') newItem = { item_key: 'npc', name: 'NPC', image: 'oak_sign.png' };
                
                editor.tempReqs.push({
                    taskType: type, item: newItem, rawId: newItem.item_key, rawDamage: 0, count: 1, 
                    customName: type === 'fluid' ? 'water' : '', 
                    target: (type === 'hunt' || type === 'meeting' || type === 'interact_entity') ? 'Zombie' : '', 
                    consume: false, nbtTag: null 
                });
                this.renderQuestEditForm(editor);
            }
        });

        // Умное добавление награды
        document.getElementById('btn-add-rew-type').addEventListener('click', () => {
            this.saveTempState(editor);
            const type = document.getElementById('new-rew-type-select').value;
            
            if (type === 'item' || type === 'choice') {
                editor.openItemPicker((item) => { 
                    editor.tempRewards.push({ taskType: type, item: item, rawId: item.string_id || item.item_key, rawDamage: item.damage !== undefined ? item.damage : 0, count: 1, customName: BQ.getCustomName(item, null), isChoice: type === 'choice', damage: item.damage || 0, nbtTag: null }); 
                    this.renderQuestEditForm(editor); 
                });
            } else {
                let newItem = { item_key: 'minecraft:stone', name: 'Система', image: 'stone.png' };
                if (type === 'xp') newItem = { item_key: 'xp', name: 'Опыт', image: 'experience_bottle.png' };
                if (type === 'command') newItem = { item_key: 'command', name: 'Команда', image: 'command_block.png' };
                if (type === 'npc_faction' || type === 'npc_mail') newItem = { item_key: 'npc', name: 'NPC', image: 'oak_sign.png' };
                
                editor.tempRewards.push({
                    taskType: type, item: newItem, rawId: newItem.item_key, rawDamage: 0, count: 1, 
                    customName: '', isChoice: false, damage: 0, nbtTag: null 
                });
                this.renderQuestEditForm(editor);
            }
        });

        document.getElementById('btn-add-parent').addEventListener('click', () => {
            const select = document.getElementById('parent-quest-select');
            const val = select.value;
            if (val && !editor.tempParents.includes(val)) { 
                editor.tempParents.push(val); 
                this.renderParentsList(editor); 
                this.populateParentsSelect(editor); 
            }
        });

        document.getElementById('btn-save-quest').addEventListener('click', () => {
            this.saveTempState(editor); 
            const mod = editor.getActiveMod();
            const title = document.getElementById('quest-title').value || 'Новый квест';
            const desc = document.getElementById('quest-desc').value;
            const size = document.getElementById('quest-size').value;

            if (editor.editingNodeId) {
                const q = mod.quests.find(item => item.id === editor.editingNodeId);
                q.title = title; q.desc = desc; q.size = size; q.icon = editor.tempQuestIcon; q.iconItem = editor.tempQuestIconItem; 
                q.reqs = [...editor.tempReqs]; q.rewards = [...editor.tempRewards]; q.parents = [...editor.tempParents]; 
                DB.logAction(`Отредактировал квест: ${title}`);
            } else {
                mod.quests.push({
                    id: 'q_' + Date.now(), x: editor.newQuestX, y: editor.newQuestY, title: title, desc: desc, size: size, 
                    icon: editor.tempQuestIcon, iconItem: editor.tempQuestIconItem, reqs: [...editor.tempReqs], rewards: [...editor.tempRewards], parents: [...editor.tempParents]
                });
                DB.logAction(`Создал квест: ${title}`);
            }
            editor.triggerAutoSave(); modal.classList.add('hidden'); editor.renderCanvas();
        });

        document.getElementById('btn-delete-quest').addEventListener('click', () => {
            if(editor.editingNodeId && confirm('Удалить квест?')) { this.deleteQuest(editor, editor.editingNodeId); modal.classList.add('hidden'); }
        });

        document.getElementById('btn-close-quest').addEventListener('click', () => { modal.classList.add('hidden'); });
    },

    openQuestViewModal(editor, questId) {
        editor.hideTooltip(); 
        const mod = editor.getActiveMod();
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
            pList.innerHTML = quest.parents.map(pId => {
                let pQuest = null; let pMod = null;
                editor.data.mods.forEach(m => { const f = m.quests.find(q => q.id === pId); if (f) { pQuest = f; pMod = m; } });
                const t = pQuest ? pQuest.title : `Скрытый квест: ${pId}`;
                const m = pMod ? pMod.name : '?';
                return `<div style="color:#fff; font-size:16px; margin-bottom:6px;">🔗 ${ItemsDB.formatMC(t)} <span style="color:#aaa; font-size:14px;">[${ItemsDB.formatMC(m)}]</span></div>`;
            }).join('');
        } else { pContainer.classList.add('hidden'); }

        document.getElementById('view-reqs-list').innerHTML = (quest.reqs && quest.reqs.length > 0) ? quest.reqs.map(r => {
            const consumeText = (r.taskType !== 'hunt' && r.taskType !== 'block_break' && r.taskType !== 'checkbox' && r.taskType !== 'xp') ? (r.consume !== false ? '<span style="color:#ff5555;">[Забирается]</span>' : '<span style="color:#aaaaaa;">[Только наличие]</span>') : '';
            const imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');
            return `<div class="view-item-row"><div class="mc-slot"><img src="${imgPath}"></div><div class="item-info"><span class="item-name">${r.count}x ${editor.getTaskLabel(r)}</span><span class="item-meta">${consumeText}</span></div></div>`;
        }).join('') : '<div style="padding: 15px; color: #aaa; font-size: 16px;">Нет требований</div>';

        document.getElementById('view-rewards-list').innerHTML = (quest.rewards && quest.rewards.length > 0) ? quest.rewards.map(r => {
            const choiceText = r.isChoice ? '<span style="color:#ffff55;">[На выбор]</span>' : '<span style="color:#55ff55;">[Гарантировано]</span>';
            const imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');
            return `<div class="view-item-row"><div class="mc-slot"><img src="${imgPath}"></div><div class="item-info"><span class="item-name">${r.count}x ${editor.getRewardLabel(r)}</span><span class="item-meta">${choiceText}</span></div></div>`;
        }).join('') : '<div style="padding: 15px; color: #aaa; font-size: 16px;">Нет наград</div>';

        modal.classList.remove('hidden');
    },

    openQuestModal(editor, questId = null) {
        editor.hideTooltip(); 
        editor.editingNodeId = questId;
        const modal = document.getElementById('quest-edit-modal');
        document.getElementById('btn-delete-quest').style.display = questId ? 'inline-block' : 'none';

        if (questId) {
            const q = editor.getActiveMod().quests.find(item => item.id === questId);
            document.getElementById('quest-title').value = q.title || '';
            document.getElementById('quest-desc').value = q.desc || '';
            const s = q.size || 'x1';
            const compat = { sm: 'x1', md: 'x1', lg: 'x2' }; 
            document.getElementById('quest-size').value = compat[s] || s || 'x1';
            
            editor.tempQuestIcon = q.icon || null; 
            editor.tempQuestIconItem = q.iconItem || null;
            let reqs = q.reqs || []; if (q.req && reqs.length === 0) reqs = [q.req]; 
            editor.tempReqs = JSON.parse(JSON.stringify(reqs)); 
            editor.tempRewards = q.rewards ? JSON.parse(JSON.stringify(q.rewards)) : []; 
            editor.tempParents = q.parents ? JSON.parse(JSON.stringify(q.parents)) : [];
        } else {
            document.getElementById('quest-title').value = '';
            document.getElementById('quest-desc').value = '';
            document.getElementById('quest-size').value = 'x1';
            editor.tempQuestIcon = null; editor.tempQuestIconItem = null; editor.tempReqs = []; editor.tempRewards = []; editor.tempParents = [];
        }
        
        document.getElementById('quest-icon-preview').innerHTML = editor.tempQuestIcon ? `<img src="${ItemsDB.getImageUrl(editor.tempQuestIcon)}" style="width: 32px; height: 32px; image-rendering: pixelated;">` : '';
        this.renderQuestEditForm(editor); 
        this.renderParentsList(editor); 
        
        // Сброс списков выбора
        document.getElementById('parent-quest-select').disabled = true;
        this.populateParentsSelect(editor);
        
        modal.classList.remove('hidden');
    },

    renderQuestEditForm(editor) {
        const reqBox = document.getElementById('reqs-list');
        reqBox.innerHTML = editor.tempReqs.map((r, idx) => {
            let t = r.taskType || 'retrieval';
            let html = `<div class="reward-row">`;
            let imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');
            
            if (t !== 'checkbox') html += `<div class="mc-slot item-icon-btn" data-idx="${idx}" title="Изменить иконку" style="cursor: pointer; flex-shrink:0;"><img src="${imgPath}" width="24" height="24"></div>`;
            
            html += `<select id="req-type-${idx}" class="mc-input task-type-select" data-idx="${idx}" style="width:160px; flex-shrink:0;">
                        <option value="retrieval" ${t==='retrieval'?'selected':''}>Принести</option>
                        <option value="crafting" ${t==='crafting'?'selected':''}>Создать</option>
                        <option value="block_break" ${t==='block_break'?'selected':''}>Сломать</option>
                        <option value="fluid" ${t==='fluid'?'selected':''}>Жидкость</option>
                        <option value="hunt" ${t==='hunt'?'selected':''}>Убить</option>
                        <option value="meeting" ${t==='meeting'?'selected':''}>Встретить</option>
                        <option value="interact_entity" ${t==='interact_entity'?'selected':''}>Клик по мобу</option>
                        <option value="interact_item" ${t==='interact_item'?'selected':''}>Клик по предм.</option>
                        <option value="location" ${t==='location'?'selected':''}>Локация</option>
                        <option value="npc_dialog" ${t==='npc_dialog'?'selected':''}>Диалог NPC</option>
                        <option value="npc_faction" ${t==='npc_faction'?'selected':''}>Репутация NPC</option>
                        <option value="npc_quest" ${t==='npc_quest'?'selected':''}>Квест NPC</option>
                        <option value="scoreboard" ${t==='scoreboard'?'selected':''}>Scoreboard</option>
                        <option value="xp" ${t==='xp'?'selected':''}>Сдать опыт</option>
                        <option value="checkbox" ${t==='checkbox'?'selected':''}>Галочка</option>
                    </select>`;

            if (['retrieval', 'crafting', 'block_break'].includes(t)) {
                html += `<input type="number" id="req-count-${idx}" class="mc-input" value="${r.count||1}" style="width:60px;" title="Кол-во">`;
                html += `<input type="text" id="req-name-${idx}" class="mc-input custom-name-input" value="${r.customName||''}" placeholder="Имя (&6Цвет)">`;
                if (t === 'retrieval') html += `<label class="mc-checkbox"><input type="checkbox" id="req-consume-${idx}" ${r.consume!==false?'checked':''}> Забрать</label>`;
            } else if (['hunt', 'meeting', 'interact_entity'].includes(t)) {
                let mobOpts = Object.entries(editor.MOB_LIST).map(([k,v]) => `<option value="${k}" ${r.target===k?'selected':''}>${v}</option>`).join('');
                html += `<select id="req-target-${idx}" class="mc-input custom-name-input" style="flex:1;">${mobOpts}</select>`;
                if (t === 'hunt') html += `<input type="number" id="req-count-${idx}" class="mc-input" value="${r.count||1}" style="width:60px;" title="Кол-во">`;
                if (t === 'meeting') {
                    html += `<input type="number" id="req-count-${idx}" class="mc-input" value="${r.count||1}" style="width:60px;" title="Кол-во">`;
                    html += `<input type="number" id="req-range-${idx}" class="mc-input" value="${r.range||4}" style="width:60px;" title="Радиус">`;
                }
                if (t === 'interact_entity') {
                    html += `<label class="mc-checkbox"><input type="checkbox" id="req-onHit-${idx}" ${r.onHit?'checked':''}> Удар</label>`;
                    html += `<label class="mc-checkbox"><input type="checkbox" id="req-onInteract-${idx}" ${r.onInteract?'checked':''}> Клик</label>`;
                }
            } else if (t === 'fluid') {
                html += `<input type="text" id="req-target-${idx}" class="mc-input custom-name-input" value="${r.target||'water'}" placeholder="ID (water)">`;
                html += `<input type="number" id="req-count-${idx}" class="mc-input" value="${r.count||1000}" style="width:80px;" title="mB">`;
                html += `<label class="mc-checkbox"><input type="checkbox" id="req-consume-${idx}" ${r.consume!==false?'checked':''}> Забрать</label>`;
            } else if (t === 'interact_item') {
                html += `<label class="mc-checkbox"><input type="checkbox" id="req-onHit-${idx}" ${r.onHit?'checked':''}> Удар</label>`;
                html += `<label class="mc-checkbox"><input type="checkbox" id="req-onInteract-${idx}" ${r.onInteract?'checked':''}> Клик</label>`;
            } else if (t === 'location') {
                html += `<input type="text" id="req-locname-${idx}" class="mc-input" value="${r.name||''}" placeholder="Имя" style="flex:1;">`;
                html += `<input type="number" id="req-x-${idx}" class="mc-input" value="${r.posX||0}" style="width:50px;" title="X">`;
                html += `<input type="number" id="req-y-${idx}" class="mc-input" value="${r.posY||0}" style="width:50px;" title="Y">`;
                html += `<input type="number" id="req-z-${idx}" class="mc-input" value="${r.posZ||0}" style="width:50px;" title="Z">`;
                html += `<input type="number" id="req-dim-${idx}" class="mc-input" value="${r.dimension||0}" style="width:40px;" title="Dim">`;
                html += `<input type="number" id="req-range-${idx}" class="mc-input" value="${r.range||-1}" style="width:50px;" title="Range">`;
            } else if (t === 'scoreboard') {
                html += `<input type="text" id="req-scoreName-${idx}" class="mc-input" value="${r.scoreName||''}" placeholder="Score ID" style="width:90px;">`;
                html += `<input type="text" id="req-scoreDisp-${idx}" class="mc-input" value="${r.scoreDisp||''}" placeholder="Отобр. Имя">`;
                html += `<select id="req-operation-${idx}" class="mc-input" style="width:50px;">
                            <option value="EQUAL" ${r.operation==='EQUAL'?'selected':''}>=</option>
                            <option value="MORE_OR_EQUAL" ${r.operation==='MORE_OR_EQUAL'?'selected':''}>&gt;=</option>
                            <option value="LESS_OR_EQUAL" ${r.operation==='LESS_OR_EQUAL'?'selected':''}>&lt;=</option>
                         </select>`;
                html += `<input type="number" id="req-targetValue-${idx}" class="mc-input" value="${r.targetValue||1}" style="width:60px;" title="Значение">`;
            } else if (t === 'npc_dialog') {
                html += `<input type="number" id="req-dialog-${idx}" class="mc-input" value="${r.dialogId||0}" style="width:70px;" title="Dialog ID">`;
                html += `<input type="text" id="req-desc-${idx}" class="mc-input custom-name-input" value="${r.desc||''}" placeholder="Описание в книге">`;
            } else if (t === 'npc_faction') {
                html += `<input type="number" id="req-faction-${idx}" class="mc-input" value="${r.factionId||0}" style="width:60px;" title="Faction ID">`;
                html += `<select id="req-operation-${idx}" class="mc-input" style="width:50px;">
                            <option value="EQUAL" ${r.operation==='EQUAL'?'selected':''}>=</option>
                            <option value="MORE_OR_EQUAL" ${r.operation==='MORE_OR_EQUAL'?'selected':''}>&gt;=</option>
                            <option value="LESS_OR_EQUAL" ${r.operation==='LESS_OR_EQUAL'?'selected':''}>&lt;=</option>
                         </select>`;
                html += `<input type="number" id="req-targetValue-${idx}" class="mc-input" value="${r.targetValue||1}" style="width:60px;" title="Значение">`;
            } else if (t === 'npc_quest') {
                html += `<input type="number" id="req-quest-${idx}" class="mc-input" value="${r.questId||0}" style="width:100px;" title="Quest ID">`;
            } else if (t === 'xp') {
                html += `<input type="number" id="req-count-${idx}" class="mc-input" value="${r.count||1}" style="width:80px;" title="Уровни">`;
            }

            let nbtBtnStyle = r.nbtTag ? 'color: #55ffff; border-color: #55ffff;' : '';
            html += `<button class="mc-button btn-nbt" data-idx="${idx}" style="padding: 4px; font-size:12px; margin-left:5px; ${nbtBtnStyle}" title="NBT Данные">[NBT]</button>`;
            html += `<button class="mc-button danger btn-del" data-idx="${idx}">X</button>`;
            html += `</div>`;
            return html;
        }).join('');

        const rewBox = document.getElementById('rewards-list');
        rewBox.innerHTML = editor.tempRewards.map((r, idx) => {
            let t = r.taskType || 'item';
            let html = `<div class="reward-row">`;
            let imgPath = r.item && r.item.image ? ItemsDB.getImageUrl(r.item.image) : ItemsDB.getImageUrl('book.png');
            
            html += `<div class="mc-slot item-icon-btn" data-idx="${idx}" title="Изменить иконку" style="cursor: pointer; flex-shrink:0;"><img src="${imgPath}" width="24" height="24"></div>`;
                     
            html += `<select id="rew-type-${idx}" class="mc-input task-type-select" data-idx="${idx}" style="width:150px; flex-shrink:0;">
                <option value="item" ${t==='item'?'selected':''}>Выдать предмет</option>
                <option value="choice" ${t==='choice'?'selected':''}>На выбор</option>
                <option value="command" ${t==='command'?'selected':''}>Команда</option>
                <option value="xp" ${t==='xp'?'selected':''}>Опыт</option>
                <option value="npc_faction" ${t==='npc_faction'?'selected':''}>Репутация NPC</option>
                <option value="npc_mail" ${t==='npc_mail'?'selected':''}>Письмо NPC</option>
                <option value="scoreboard" ${t==='scoreboard'?'selected':''}>Scoreboard</option>
            </select>`;

            if (t === 'item' || t === 'choice') {
                const isLootBox = (r.item && (r.item.string_id === 'bq_standard:loot_chest' || r.item.item_key === 'bq_standard:loot_chest'));
                if (isLootBox) {
                    const groups = editor.lootGroups || {};
                    const options = Object.entries(groups).map(([id, name]) => `<option value="${id}" ${r.damage == id ? 'selected' : ''}>${name}</option>`).join('');
                    const fallbackOption = !(r.damage in groups) ? `<option value="${r.damage || 0}" selected>Тир ${r.damage || 0}</option>` : '';
                    html += `<select id="rew-tier-${idx}" class="mc-input" style="width: 140px;">${options}${fallbackOption}</select>`;
                }
                html += `<input type="number" id="rew-count-${idx}" class="mc-input" value="${r.count||1}" style="width:60px;" title="Количество">`;
                html += `<input type="text" id="rew-name-${idx}" class="mc-input custom-name-input" value="${r.customName||''}" placeholder="Имя (&6Цвет)">`;
            } else if (t === 'command') {
                html += `<input type="text" id="rew-command-${idx}" class="mc-input custom-name-input" value="${r.command||''}" placeholder="/команда">`;
            } else if (t === 'xp') {
                html += `<input type="number" id="rew-count-${idx}" class="mc-input" value="${r.count||1}" style="width:100px;" title="Уровни">`;
            } else if (t === 'npc_faction') {
                html += `<input type="number" id="rew-faction-${idx}" class="mc-input" value="${r.factionId||0}" style="width:80px;" title="Faction ID" placeholder="Faction ID">`;
                html += `<input type="number" id="rew-targetValue-${idx}" class="mc-input" value="${r.targetValue||1}" style="width:80px;" title="Значение" placeholder="Значение">`;
            } else if (t === 'npc_mail') {
                html += `<input type="text" id="rew-sender-${idx}" class="mc-input" value="${r.sender||'Anonymous'}" style="width:100px;" placeholder="Отправитель">`;
                html += `<input type="text" id="rew-subject-${idx}" class="mc-input" value="${r.subject||'Reward'}" style="width:100px;" placeholder="Тема">`;
                html += `<input type="text" id="rew-message-${idx}" class="mc-input custom-name-input" value="${r.message||''}" placeholder="Текст письма">`;
            } else if (t === 'scoreboard') {
                html += `<input type="text" id="rew-scoreName-${idx}" class="mc-input" value="${r.scoreName||''}" style="width:100px;" placeholder="Score ID">`;
                html += `<input type="number" id="rew-targetValue-${idx}" class="mc-input" value="${r.targetValue||1}" style="width:80px;" title="Значение" placeholder="Значение">`;
            }

            let nbtBtnStyle = r.nbtTag ? 'color: #55ffff; border-color: #55ffff;' : '';
            html += `<button class="mc-button btn-nbt" data-idx="${idx}" style="padding: 4px; font-size:12px; margin-left:5px; ${nbtBtnStyle}" title="NBT Данные">[NBT]</button>`;
            html += `<button class="mc-button danger btn-del" data-idx="${idx}">X</button>`;
            html += `</div>`;
            return html;
        }).join('');

        const bindEvents = (container, list) => {
            container.querySelectorAll('.item-icon-btn').forEach(b => b.addEventListener('click', () => {
                this.saveTempState(editor);
                editor.openItemPicker((pickedItem) => { 
                    list[b.dataset.idx].item = pickedItem; 
                    list[b.dataset.idx].rawId = pickedItem.string_id || pickedItem.item_key;
                    list[b.dataset.idx].rawDamage = pickedItem.damage || 0;
                    list[b.dataset.idx].customName = BQ.getCustomName(pickedItem, list[b.dataset.idx].nbtTag);
                    this.renderQuestEditForm(editor); 
                });
            }));
            container.querySelectorAll('.task-type-select').forEach(b => b.addEventListener('change', (e) => {
                this.saveTempState(editor); 
                list[b.dataset.idx].taskType = e.target.value;
                
                // Дефолтные предметы-заглушки для новых типов при переключении
                if(e.target.value === 'xp') list[b.dataset.idx].item = { item_key: 'xp', name: 'Опыт', image: 'experience_bottle.png', mod: 'Система' };
                else if(e.target.value === 'checkbox') list[b.dataset.idx].item = { item_key: 'checkbox', name: 'Галочка', image: 'checkbox.png', mod: 'Система' };
                else if(e.target.value === 'command') list[b.dataset.idx].item = { item_key: 'command', name: 'Команда', image: 'command_block.png', mod: 'Система' };
                else if(e.target.value === 'fluid') list[b.dataset.idx].item = { item_key: 'fluid', name: 'Жидкость', image: 'fluid_bucket.png', mod: 'Система' };
                else if(['hunt', 'meeting', 'interact_entity'].includes(e.target.value)) list[b.dataset.idx].item = { item_key: 'mob', name: 'Моб', image: 'skull.png', mod: 'Система' };
                else if(['npc_dialog', 'npc_faction', 'npc_quest', 'npc_mail'].includes(e.target.value)) list[b.dataset.idx].item = { item_key: 'npc', name: 'NPC', image: 'oak_sign.png', mod: 'Система' };
                else if(e.target.value === 'scoreboard') list[b.dataset.idx].item = { item_key: 'scoreboard', name: 'Счетчик', image: 'oak_sign.png', mod: 'Система' };
                
                this.renderQuestEditForm(editor); 
            }));
            container.querySelectorAll('.btn-nbt').forEach(b => b.addEventListener('click', () => {
                this.saveTempState(editor);
                editor.tempNbtTarget = list[b.dataset.idx];
                const currentNbt = editor.tempNbtTarget.nbtTag ? JSON.stringify(editor.tempNbtTarget.nbtTag, null, 2) : "";
                document.getElementById('nbt-editor-textarea').value = currentNbt;
                document.getElementById('nbt-editor-error').innerText = '';
                document.getElementById('nbt-editor-modal').classList.remove('hidden');
            }));
            container.querySelectorAll('.btn-del').forEach(b => b.addEventListener('click', () => { 
                list.splice(b.dataset.idx, 1); 
                this.renderQuestEditForm(editor); 
            }));
        };

        bindEvents(reqBox, editor.tempReqs);
        bindEvents(rewBox, editor.tempRewards);
    }
};
