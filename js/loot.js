import { ItemsDB } from './items.js';
import { DB } from './db.js';
import { Editor } from './editor.js';

export const LootEditor = {
    data: { "groups:9": {} },
    activeGroupId: null,

    init() {
        // Открытие и закрытие модального окна
        document.getElementById('btn-open-loot-editor').addEventListener('click', () => {
            document.getElementById('loot-editor-modal').classList.remove('hidden');
            this.renderGroups();
        });
        
        document.getElementById('btn-close-loot').addEventListener('click', () => {
            document.getElementById('loot-editor-modal').classList.add('hidden');
            // Обновляем названия лутбоксов в главном редакторе квестов
            Editor.lootGroups = {};
            Object.values(this.data['groups:9'] || {}).forEach(g => { 
                Editor.lootGroups[g['ID:3']] = g['name:8']; 
            });
            if (!document.getElementById('quest-edit-modal').classList.contains('hidden')) {
                Editor.renderQuestEditForm(); 
            }
        });
        
        // Импорт и экспорт
        const fileInput = document.getElementById('loot-file-input');
        document.getElementById('btn-loot-import').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                this.data = JSON.parse(event.target.result);
                this.activeGroupId = null;
                this.renderGroups();
                alert('База лутбоксов успешно загружена!');
            };
            reader.readAsText(file);
        });
        
        document.getElementById('btn-loot-export').addEventListener('click', () => this.exportLoot());
        
        // Добавление групп и наград
        document.getElementById('btn-add-loot-group').addEventListener('click', () => this.addGroup());
        document.getElementById('btn-add-loot-reward').addEventListener('click', () => this.addReward());
        
        // Обновление имени и веса текущей группы
        document.getElementById('loot-group-name').addEventListener('input', (e) => {
            if(this.activeGroupId !== null) { 
                this.getActiveGroup()['name:8'] = e.target.value; 
                this.renderGroups(); 
            }
        });
        document.getElementById('loot-group-weight').addEventListener('input', (e) => {
            if(this.activeGroupId !== null) { 
                this.getActiveGroup()['weight:3'] = parseInt(e.target.value) || 1; 
                this.renderGroups(); 
            }
        });
    },

    getActiveGroup() { 
        return Object.values(this.data['groups:9']).find(g => g['ID:3'] === this.activeGroupId); 
    },

    renderGroups() {
        const list = document.getElementById('loot-groups-list');
        list.innerHTML = '';
        Object.entries(this.data['groups:9'] || {}).forEach(([key, g]) => {
            const div = document.createElement('div');
            div.className = `loot-group-item ${this.activeGroupId === g['ID:3'] ? 'active' : ''}`;
            div.innerHTML = `<span style="flex:1;">${g['name:8']} <small style="color:#aaa;">(Вес: ${g['weight:3']})</small></span> <button class="mc-button danger" style="padding: 2px 6px; font-size:12px;">X</button>`;
            
            div.addEventListener('click', () => { 
                this.activeGroupId = g['ID:3']; 
                this.renderGroups(); 
                this.renderRewards(); 
            });
            
            div.querySelector('.danger').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Удалить эту группу лутбокса?')) {
                    delete this.data['groups:9'][key];
                    if (this.activeGroupId === g['ID:3']) this.activeGroupId = null;
                    this.renderGroups(); 
                    this.renderRewards();
                }
            });
            list.appendChild(div);
        });

        if (this.activeGroupId !== null) {
            document.getElementById('loot-group-settings').classList.remove('hidden');
            document.getElementById('btn-add-loot-reward').classList.remove('hidden');
            document.getElementById('loot-group-name').value = this.getActiveGroup()['name:8'];
            document.getElementById('loot-group-weight').value = this.getActiveGroup()['weight:3'];
            document.getElementById('loot-selected-group-name').innerText = `Настройки рулетки: ${this.getActiveGroup()['name:8']}`;
        } else {
            document.getElementById('loot-group-settings').classList.add('hidden');
            document.getElementById('btn-add-loot-reward').classList.add('hidden');
            document.getElementById('loot-selected-group-name').innerText = 'Выберите группу слева';
            document.getElementById('loot-rewards-list').innerHTML = '';
        }
    },

    renderRewards() {
        const list = document.getElementById('loot-rewards-list');
        list.innerHTML = '';
        const group = this.getActiveGroup();
        if(!group) return;

        if (!group['rewards:9']) group['rewards:9'] = {};

        Object.entries(group['rewards:9']).forEach(([rKey, r]) => {
            const card = document.createElement('div');
            card.className = 'loot-reward-card';
            
            const itemsHtml = Object.entries(r['items:9'] || {}).map(([iKey, i]) => {
                let id = i['id:8']; let dmg = i['Damage:2'] || 0; let count = i['Count:3'] || 1;
                let found = ItemsDB.findItemByBQ(id, dmg);
                
                // Проверка на NBT
                let nbtHtml = i['tag:10'] ? `<span style="color:#55ffff; font-size:10px; margin-left:5px;">[+NBT]</span>` : '';

                return `
                    <div class="loot-item-row">
                        <img src="${ItemsDB.getImageUrl(found.image)}" width="24" height="24" style="image-rendering:pixelated;">
                        <span style="color:#fff; flex:1;">${count}x ${ItemsDB.formatMC(found.name)}${nbtHtml}</span>
                        <button class="mc-button danger btn-del-item" data-rkey="${rKey}" data-ikey="${iKey}" style="padding:2px 6px;">X</button>
                    </div>
                `;
            }).join('');

            card.innerHTML = `
                <div class="loot-reward-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="color:#aaa;">Шанс дропа (Вес):</span>
                        <input type="number" class="mc-input reward-weight-input" value="${r['weight:3']}" data-rkey="${rKey}" style="width:60px; padding:4px;">
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button class="mc-button btn-add-item" data-rkey="${rKey}" style="padding:4px 8px; font-size:12px;">+ Предмет</button>
                        <button class="mc-button danger btn-del-reward" data-rkey="${rKey}" style="padding:4px 8px; font-size:12px;">Удалить вариант</button>
                    </div>
                </div>
                <div class="loot-items-list">${itemsHtml || '<span style="color:#666;">Нет предметов в дропе</span>'}</div>
            `;
            list.appendChild(card);
        });

        list.querySelectorAll('.reward-weight-input').forEach(inp => {
            inp.addEventListener('change', (e) => { 
                group['rewards:9'][e.target.dataset.rkey]['weight:3'] = parseInt(e.target.value) || 1; 
            });
        });
        
        list.querySelectorAll('.btn-del-reward').forEach(btn => {
            btn.addEventListener('click', (e) => { 
                delete group['rewards:9'][e.target.dataset.rkey]; 
                this.renderRewards(); 
            });
        });

        list.querySelectorAll('.btn-del-item').forEach(btn => {
            btn.addEventListener('click', (e) => { 
                delete group['rewards:9'][e.target.dataset.rkey]['items:9'][e.target.dataset.ikey]; 
                this.renderRewards(); 
            });
        });

        list.querySelectorAll('.btn-add-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                Editor.openItemPicker((item) => {
                    const r = group['rewards:9'][e.target.dataset.rkey];
                    if (!r['items:9']) r['items:9'] = {};
                    
                    let maxId = -1; 
                    Object.keys(r['items:9']).forEach(k => { const n = parseInt(k.split(':')[0]); if(n > maxId) maxId = n; });
                    const newIKey = (maxId + 1) + ":10";
                    
                    let count = prompt("Количество предметов в этом дропе:", "1");
                    let sysId = item.string_id || item.item_key || "minecraft:stone";
                    let damage = item.damage !== undefined ? item.damage : 0;
                    
                    if (!item.string_id && sysId.includes(':') && !sysId.match(/[a-zA-Z]/)) {
                        const parts = sysId.split(':'); 
                        sysId = parts[0]; 
                        damage = parseInt(parts[1]) || 0;
                    }
                    
                    const newItem = { "id:8": sysId, "Count:3": parseInt(count) || 1, "Damage:2": damage, "OreDict:8": "" };
                    
                    // Если это зачарованная книга или тайник, спрашиваем NBT
                    if (sysId === 'minecraft:enchanted_book' || sysId.includes('ThermalExpansion:Cache') || sysId.includes('ThermalExpansion:Strongbox')) {
                        const nbtStr = prompt("Этот предмет требует NBT тег (Например, для чар). Вставьте JSON-код NBT (или оставьте пустым):", "{}");
                        if (nbtStr && nbtStr !== "{}") {
                            try {
                                newItem["tag:10"] = JSON.parse(nbtStr);
                            } catch (err) {
                                alert("Ошибка парсинга JSON NBT!");
                            }
                        }
                    }

                    r['items:9'][newIKey] = newItem;
                    this.renderRewards();
                });
            });
        });
    },

    addGroup() {
        let maxId = -1; 
        Object.values(this.data['groups:9'] || {}).forEach(g => { if(g['ID:3'] > maxId) maxId = g['ID:3']; });
        const newId = maxId + 1;
        
        let maxKey = -1; 
        Object.keys(this.data['groups:9'] || {}).forEach(k => { const n = parseInt(k.split(':')[0]); if(n > maxKey) maxKey = n; });
        const newKey = (maxKey + 1) + ":10";
        
        this.data['groups:9'][newKey] = { "name:8": "Новый Лутбокс", "weight:3": 1, "ID:3": newId, "rewards:9": {} };
        this.activeGroupId = newId; 
        this.renderGroups(); 
        this.renderRewards();
    },

    addReward() {
        const group = this.getActiveGroup();
        if(!group) return;
        if (!group['rewards:9']) group['rewards:9'] = {};
        
        let maxId = -1; 
        Object.values(group['rewards:9']).forEach(r => { if(r['ID:3'] > maxId) maxId = r['ID:3']; });
        const newId = maxId + 1;
        
        let maxKey = -1; 
        Object.keys(group['rewards:9']).forEach(k => { const n = parseInt(k.split(':')[0]); if(n > maxKey) maxKey = n; });
        const newKey = (maxKey + 1) + ":10";
        
        group['rewards:9'][newKey] = { "weight:3": 1, "ID:3": newId, "items:9": {} };
        this.renderRewards();
    },

    exportLoot() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "QuestLoot.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click(); 
        downloadAnchorNode.remove();
        DB.logAction('Сделал экспорт QuestLoot.json');
    }
};
