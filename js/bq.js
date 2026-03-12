import { ItemsDB } from './items.js';
import { DB } from './db.js';

export const BQ = {
    ENCHANTS: {
        0: "Защита", 1: "Огнеупорность", 2: "Невесомость", 3: "Взрывоустойчивость", 4: "Защита от снарядов",
        5: "Подводное дыхание", 6: "Подводник", 7: "Шипы", 8: "Печать души",
        16: "Острота", 17: "Небесная кара", 18: "Бич членистоногих", 19: "Отбрасывание", 20: "Заговор огня", 21: "Добыча",
        32: "Эффективность", 33: "Шелковое касание", 34: "Прочность", 35: "Удача",
        45: "Опыт", 48: "Сила", 49: "Откидывание", 50: "Воспламенение", 51: "Бесконечность",
        61: "Удача (Море)", 62: "Приманка", 100: "Урон (Кровь)", 101: "Яд", 102: "Замешательство", 103: "Бесконечность (Кровь)",
        104: "Вместимость", 105: "Мультивыстрел", 180: "Жнец", 211: "Взрыв (OB)", 212: "Последний рывок", 213: "Флим-Флам"
    },
    
    FLUIDS: {
        "water": "Вода", "lava": "Лава", "ender": "Жидкий эндериум", "redstone": "Дестабилизированный красный камень", 
        "liquidnitrogen": "Жидкий азот", "sewage": "Нечистоты", "milk": "Молоко", "liquiddna": "Жидкая ДНК", 
        "mutagen": "Мутаген", "aerotheum": "Зефирный аэротэум", "cryotheum": "Тектоновый криотэум", 
        "for.honey": "Мёд", "meat": "Мясной сок", "protein": "Протеин", "pyrotheum": "Пылающий пиротеум", 
        "chocolatemilk": "Шоколадное молоко", "poison": "Яд", "short.mead": "Медовуха", "juice": "Фруктовый сок", 
        "ice": "Лед", "mushroomsoup": "Грибной суп", "rocket_fuel": "Ракетное топливо", "bioethanol": "Биоэтанол", 
        "cloud_seed": "Облачное семя", "biofuel": "Биотопливо", "coal": "Жидкий уголь", "fire_water": "Огненная вода", 
        "cloud_seed_concentrated": "Конц. облачное семя", "turpentine": "Скипидар", "pinkslime": "Розовая слизь", 
        "biomass": "Биомасса", "glowstone": "Энергизированный светокамень", "hootch": "Самогон", 
        "mobessence": "Эссенция мобов", "acid": "Кислота", "resin": "Смола", "nutrient_distillation": "Питательный дистиллят", 
        "petrotheum": "Тектонический петротеум"
    },

    toRoman(num) {
        if (num > 100) return num.toString();
        const lookup = {M:1000, CM:900, D:500, CD:400, C:100, XC:90, L:50, XL:40, X:10, IX:9, V:5, IV:4, I:1};
        let roman = '';
        for (let i in lookup) { while (num >= lookup[i]) { roman += i; num -= lookup[i]; } }
        return roman || "0";
    },

    getRawValue(obj, keyPrefix) {
        if(!obj || typeof obj !== 'object') return null;
        for(let k in obj) { if (k === keyPrefix || k.startsWith(keyPrefix + ':')) return obj[k]; }
        return null;
    },

    getCustomName(foundItem, tag) {
        let name = foundItem.name; 
        if (!tag) return name;

        // 1. ЧИТАЕМ display -> Name (СОХРАНЯЕМ ФОРМАТИРОВАНИЕ §)
        const display = this.getRawValue(tag, 'display');
        if (display) {
            const customName = this.getRawValue(display, 'Name');
            if (customName) {
                // Больше не удаляем §! Убираем только артефакты кодировки ğ, если они есть
                name = customName.trim().replace(/ğ/g, '');
            }
        }

        // 2. ЗАЧАРОВАНИЯ
        const enchs = this.getRawValue(tag, 'ench') || this.getRawValue(tag, 'StoredEnchantments');
        if (enchs && typeof enchs === 'object') {
            const firstEnch = Object.values(enchs)[0];
            if (firstEnch) {
                const id = this.getRawValue(firstEnch, 'id');
                const lvl = this.getRawValue(firstEnch, 'lvl') || 1;
                const roman = this.toRoman(lvl);
                const enchTitle = this.ENCHANTS[id] || `Чары:${id}`;
                if (foundItem.item_key.includes('enchanted_book')) name = `§eКнига:§r ${enchTitle} ${roman}`;
                else name += ` §7[${enchTitle} ${roman}]§r`;
            }
        }

        // 3. СОДЕРЖИМОЕ ТАЙНИКОВ
        const innerItem = this.getRawValue(tag, 'Item');
        if (innerItem) {
            const innerId = this.getRawValue(innerItem, 'id');
            const innerCount = this.getRawValue(innerItem, 'Count') || 1;
            const innerFound = ItemsDB.findItemByBQ(innerId, 0);
            const innerName = innerFound.name !== innerId ? innerFound.name : `ID:${innerId}`;
            name += ` §8(${innerName} x${innerCount})§r`;
        }
        return name;
    },

    parseLootData(jsonString, editor) {
        try {
            const rawData = JSON.parse(jsonString);
            const clean = (obj) => {
                if (Array.isArray(obj)) return obj.map(clean);
                if (obj !== null && typeof obj === 'object') {
                    const c = {};
                    for (let k in obj) { c[k.split(':')[0]] = clean(obj[k]); }
                    return c;
                }
                return obj;
            };
            const data = clean(rawData);
            if (!editor.lootGroups) editor.lootGroups = {};
            if (data.groups) {
                Object.values(data.groups).forEach(g => { editor.lootGroups[g.ID] = g.name; });
            }
        } catch(e) {}
    },

    parseData(jsonString, editor) {
        try {
            const rawData = JSON.parse(jsonString);
            const cleanKeys = (obj) => {
                if (Array.isArray(obj)) return obj.map(cleanKeys);
                if (obj !== null && typeof obj === 'object') {
                    const cleaned = {};
                    for (let key in obj) {
                        const cleanKey = key.split(':')[0];
                        if (['tag', 'nbt', 'targetNBT'].includes(cleanKey)) cleaned[cleanKey] = obj[key]; 
                        else cleaned[cleanKey] = cleanKeys(obj[key]);
                    }
                    return cleaned;
                }
                return obj;
            };
            const data = cleanKeys(rawData);
            const questsMap = {};

            if (data.questDatabase) {
                Object.entries(data.questDatabase).forEach(([qKey, q]) => {
                    let actualId = String(q.questID !== undefined ? q.questID : qKey).split(':')[0];
                    let reqs = []; let rewards = [];
                    if (q.tasks) {
                        Object.values(q.tasks).forEach(task => {
                            if (task.requiredItems && (task.taskID === 'bq_standard:retrieval' || task.taskID === 'bq_standard:crafting')) {
                                Object.values(task.requiredItems).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    reqs.push({ item: foundItem, count: item.Count || 1, customName: this.getCustomName(foundItem, item.tag), consume: task.consume || false, taskType: task.taskID.split(':')[1], nbtTag: item.tag });
                                });
                            } else if (task.blocks && task.taskID === 'bq_standard:block_break') {
                                Object.values(task.blocks).forEach(block => {
                                    const foundItem = ItemsDB.findItemByBQ(block.blockID || block.id, block.meta || block.Damage);
                                    reqs.push({ item: foundItem, count: block.amount || 1, customName: this.getCustomName(foundItem, block.nbt), consume: false, taskType: 'block_break', nbtTag: block.nbt });
                                });
                            } else if (task.taskID === 'bq_standard:hunt') {
                                 reqs.push({ item: { item_key: `mob_${task.target}`, name: task.target, image: 'skull.png', mod: 'Мобы' }, count: task.required || 1, target: task.target, customName: task.target, consume: false, taskType: 'hunt', nbtTag: task.targetNBT });
                            } else if (task.taskID === 'bq_standard:fluid') {
                                Object.values(task.requiredFluids || {}).forEach(f => {
                                    reqs.push({ item: { item_key: `f_${f.FluidName}`, name: this.FLUIDS[f.FluidName] || f.FluidName, image: 'fluid_bucket.png', mod: 'Жидкость' }, count: f.Amount || 1000, target: f.FluidName, customName: this.FLUIDS[f.FluidName] || f.FluidName, consume: task.consume || false, taskType: 'fluid' });
                                });
                            } else if (task.taskID === 'bq_standard:checkbox') {
                                reqs.push({ item: { item_key: 'checkbox', name: 'Галочка', image: 'checkbox.png', mod: 'Задачи' }, count: 1, customName: 'Нажать галочку', consume: false, taskType: 'checkbox' });
                            } else if (task.taskID === 'bq_standard:xp') {
                                reqs.push({ item: { item_key: 'xp', name: 'Опыт', image: 'experience_bottle.png', mod: 'Система' }, count: task.amount || 1, customName: 'Уровни опыта', consume: task.consume || false, taskType: 'xp' });
                            } else if (task.taskID === 'bq_npc_integration:npc_dialog') {
                                reqs.push({ item: { item_key: 'npc_dialog', name: 'Диалог NPC', image: 'oak_sign.png', mod: 'Задачи' }, count: 1, customName: `Диалог NPC (ID: ${task.npcDialogID})`, consume: false, taskType: 'retrieval', nbtTag: { "npcDialogID:3": task.npcDialogID || 0 } });
                            }
                        });
                    }
                    if (q.rewards) {
                        Object.values(q.rewards).forEach(rew => {
                            if ((rew.rewardID === 'bq_standard:item' && rew.rewards) || (rew.rewardID === 'bq_standard:choice' && rew.choices)) {
                                const list = rew.rewards || rew.choices;
                                Object.values(list).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    rewards.push({ item: foundItem, count: item.Count || 1, customName: this.getCustomName(foundItem, item.tag), isChoice: rew.rewardID === 'bq_standard:choice', taskType: 'item', damage: item.Damage, nbtTag: item.tag });
                                });
                            } else if (rew.rewardID === 'bq_standard:command') {
                                rewards.push({ item: { item_key: 'command', name: 'Команда', image: 'command_block.png', mod: 'Система' }, count: 1, customName: 'Команда', isChoice: false, taskType: 'command', command: rew.command });
                            } else if (rew.rewardID === 'bq_standard:xp') {
                                rewards.push({ item: { item_key: 'xp', name: 'Опыт', image: 'experience_bottle.png', mod: 'Система' }, count: rew.amount || 1, customName: 'Уровни опыта', isChoice: false, taskType: 'xp' });
                            }
                        });
                    }
                    questsMap[actualId] = {
                        id: 'bq_' + actualId, title: q.properties?.betterquesting?.name || 'Безымянный квест',
                        desc: q.properties?.betterquesting?.desc || '', icon: '', parents: (Array.isArray(q.preRequisites) ? q.preRequisites : Object.values(q.preRequisites || {})).map(p => 'bq_' + String(p).split(':')[0]), reqs, rewards
                    };
                });
            }
            const newMods = [];
            if (data.questLines) {
                Object.keys(data.questLines).forEach(key => {
                    const ql = data.questLines[key]; const lineQuests = []; const addedIds = new Set();
                    if (ql.quests) {
                        Object.values(ql.quests).forEach(pos => {
                            let qIdStr = String(pos.id !== undefined ? pos.id : (pos.questID !== undefined ? pos.questID : "")).split(':')[0]; 
                            if (!qIdStr || addedIds.has(qIdStr)) return; addedIds.add(qIdStr);
                            const baseQ = questsMap[qIdStr];
                            if (baseQ) lineQuests.push({ ...JSON.parse(JSON.stringify(baseQ)), x: (pos.x || 0) * 3, y: (pos.y || 0) * 3, size: pos.sizeX > 24 ? 'x2' : 'x1' });
                        });
                    }
                    newMods.push({ id: 'bq_mod_' + key, name: ql.properties?.betterquesting?.name || 'Ветка ' + key, icon: '', quests: lineQuests });
                });
            }
            editor.originalData = JSON.parse(JSON.stringify(editor.data.mods)); editor.isImportMode = true;
            editor.data.mods = newMods; editor.activeModId = newMods[0]?.id;
            document.getElementById('import-mode-bar').classList.remove('hidden');
            document.body.classList.add('import-mode');
            editor.renderSidebar(); editor.renderCanvas(); editor.centerCanvas();
        } catch (e) { console.error(e); }
    },

    exportData(mods) {
        const bqData = { "build:8": "3.0.328", "format:8": "2.0.0", "questDatabase:9": {}, "questLines:9": {} };
        let questNumericId = 0; const idMap = {}; 
        mods.forEach(mod => { mod.quests.forEach(q => { if(idMap[q.id] === undefined) idMap[q.id] = questNumericId++; }); });

        mods.forEach(mod => {
            mod.quests.forEach(q => {
                const bqId = idMap[q.id];
                const preReqs = (q.parents || []).map(p => idMap[p]).filter(p => p !== undefined);
                const tasks = {}; let taskIdx = 0;
                
                const createItemsDict = (arr) => {
                    const dict = {};
                    arr.forEach((req, idx) => {
                        let sysId = req.item.string_id || req.item.item_key || "minecraft:stone";
                        let damage = req.damage !== undefined ? req.damage : (req.item.damage !== undefined ? req.item.damage : 0);
                        const dictObj = { "id:8": sysId, "Count:3": parseInt(req.count) || 1, "Damage:2": damage, "OreDict:8": "" };
                        if (req.nbtTag) dictObj["tag:10"] = req.nbtTag;
                        dict[`${idx}:10`] = dictObj;
                    });
                    return dict;
                };

                const groups = { retrieval: [], crafting: [], block_break: [], hunt: [], fluid: [], checkbox: [], xp: [] };
                (q.reqs || []).forEach(r => { groups[r.taskType || 'retrieval'].push(r); });

                if (groups.retrieval.length) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:retrieval", "consume:1": groups.retrieval[0].consume ? 1 : 0, "requiredItems:9": createItemsDict(groups.retrieval) };
                if (groups.crafting.length) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:crafting", "allowCraft:1": 1, "requiredItems:9": createItemsDict(groups.crafting) };
                if (groups.xp.length) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:xp", "amount:3": parseInt(groups.xp[0].count), "isLevels:1": 1, "consume:1": groups.xp[0].consume ? 1 : 0 };
                
                bqData["questDatabase:9"][`${bqId}:10`] = {
                    "questID:3": bqId, "preRequisites:11": preReqs,
                    "properties:10": { "betterquesting:10": { "name:8": q.title, "desc:8": q.desc || "" } },
                    "tasks:9": tasks, "rewards:9": {}
                };
            });
        });

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bqData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "QuestDatabase_Export.json");
        downloadAnchorNode.click();
    }
};
