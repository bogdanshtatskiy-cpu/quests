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

        const display = this.getRawValue(tag, 'display');
        if (display) {
            const customName = this.getRawValue(display, 'Name');
            if (customName) name = customName.trim().replace(/ğ/g, ''); 
        }

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
            
            // Сохраняем глобальные настройки сервера без изменений (чтобы не потерялись)
            const qsKey = Object.keys(rawData).find(k => k.startsWith('questSettings'));
            if (qsKey) {
                editor.questSettings = { key: qsKey, data: rawData[qsKey] };
            } else {
                editor.questSettings = null;
            }

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
                    
                    let originalTasks = rawData["questDatabase:9"][qKey] ? rawData["questDatabase:9"][qKey]["tasks:9"] : null;
                    
                    if (q.tasks) {
                        Object.values(q.tasks).forEach((task, idx) => {
                            let rawTask = originalTasks ? originalTasks[Object.keys(originalTasks)[idx]] : null;
                            
                            if (task.requiredItems && (task.taskID === 'bq_standard:retrieval' || task.taskID === 'bq_standard:crafting')) {
                                Object.values(task.requiredItems).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    reqs.push({ item: foundItem, rawId: item.id, rawDamage: item.Damage, count: item.Count !== undefined ? item.Count : 1, customName: this.getCustomName(foundItem, item.tag), consume: task.consume || false, taskType: task.taskID.split(':')[1], nbtTag: item.tag, rawTaskProps: rawTask });
                                });
                            } else if (task.blocks && task.taskID === 'bq_standard:block_break') {
                                Object.values(task.blocks).forEach(block => {
                                    const foundItem = ItemsDB.findItemByBQ(block.blockID || block.id, block.meta || block.Damage);
                                    reqs.push({ item: foundItem, rawId: block.blockID || block.id, rawDamage: block.meta !== undefined ? block.meta : block.Damage, count: block.amount !== undefined ? block.amount : (block.Count !== undefined ? block.Count : 1), customName: this.getCustomName(foundItem, block.nbt), consume: false, taskType: 'block_break', nbtTag: block.nbt, rawTaskProps: rawTask });
                                });
                            } else if (task.taskID === 'bq_standard:hunt') {
                                 reqs.push({ item: { item_key: `mob_${task.target}`, name: task.target, image: 'skull.png', mod: 'Мобы' }, count: task.required || 1, target: task.target, customName: task.target, consume: false, taskType: 'hunt', nbtTag: task.targetNBT, rawTaskProps: rawTask });
                            } else if (task.taskID === 'bq_standard:fluid') {
                                Object.values(task.requiredFluids || {}).forEach(f => {
                                    reqs.push({ item: { item_key: `f_${f.FluidName}`, name: this.FLUIDS[f.FluidName] || f.FluidName, image: 'fluid_bucket.png', mod: 'Жидкость' }, rawFluid: f.FluidName || "water", count: f.Amount || 1000, target: f.FluidName, customName: this.FLUIDS[f.FluidName] || f.FluidName, consume: task.consume || false, taskType: 'fluid', rawTaskProps: rawTask });
                                });
                            } else if (task.taskID === 'bq_standard:checkbox') {
                                reqs.push({ item: { item_key: 'checkbox', name: 'Галочка', image: 'checkbox.png', mod: 'Задачи' }, count: 1, customName: 'Нажать галочку', consume: false, taskType: 'checkbox', rawTaskProps: rawTask });
                            } else if (task.taskID === 'bq_standard:xp') {
                                reqs.push({ item: { item_key: 'xp', name: 'Опыт', image: 'experience_bottle.png', mod: 'Система' }, count: task.amount !== undefined ? task.amount : 1, customName: 'Уровни опыта', consume: task.consume || false, taskType: 'xp', rawTaskProps: rawTask });
                            } else if (task.taskID === 'bq_npc_integration:npc_dialog') {
                                reqs.push({ item: { item_key: 'npc_dialog', name: 'Диалог NPC', image: 'oak_sign.png', mod: 'Задачи' }, count: 1, customName: `Диалог NPC (ID: ${task.npcDialogID})`, consume: false, taskType: 'retrieval', nbtTag: { "npcDialogID:3": task.npcDialogID || 0 }, rawTaskProps: rawTask });
                            }
                        });
                    }
                    if (q.rewards) {
                        let originalRewards = rawData["questDatabase:9"][qKey] ? rawData["questDatabase:9"][qKey]["rewards:9"] : null;
                        
                        Object.values(q.rewards).forEach((rew, idx) => {
                            let rawRew = originalRewards ? originalRewards[Object.keys(originalRewards)[idx]] : null;
                            
                            if ((rew.rewardID === 'bq_standard:item' && rew.rewards) || (rew.rewardID === 'bq_standard:choice' && rew.choices)) {
                                const list = rew.rewards || rew.choices;
                                Object.values(list).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    rewards.push({ item: foundItem, rawId: item.id, rawDamage: item.Damage, count: item.Count !== undefined ? item.Count : 1, customName: this.getCustomName(foundItem, item.tag), isChoice: rew.rewardID === 'bq_standard:choice', taskType: 'item', damage: item.Damage, nbtTag: item.tag, rawRewProps: rawRew });
                                });
                            } else if (rew.rewardID === 'bq_standard:command') {
                                rewards.push({ item: { item_key: 'command', name: 'Команда', image: 'command_block.png', mod: 'Система' }, count: 1, customName: 'Команда', isChoice: false, taskType: 'command', command: rew.command, rawRewProps: rawRew });
                            } else if (rew.rewardID === 'bq_standard:xp') {
                                rewards.push({ item: { item_key: 'xp', name: 'Опыт', image: 'experience_bottle.png', mod: 'Система' }, count: rew.amount !== undefined ? rew.amount : 1, customName: 'Уровни опыта', isChoice: false, taskType: 'xp', rawRewProps: rawRew });
                            }
                        });
                    }
                    
                    let parents = [];
                    if (q.preRequisites) {
                        parents = (Array.isArray(q.preRequisites) ? q.preRequisites : Object.values(q.preRequisites || {})).map(p => 'bq_' + String(p).split(':')[0]);
                    }

                    let questIconStr = '';
                    let iconItemObj = null;
                    if (q.properties?.betterquesting?.icon) {
                        iconItemObj = ItemsDB.findItemByBQ(q.properties.betterquesting.icon.id, q.properties.betterquesting.icon.Damage);
                        iconItemObj.rawId = q.properties.betterquesting.icon.id;
                        iconItemObj.rawDamage = q.properties.betterquesting.icon.Damage;
                        iconItemObj.rawCount = q.properties.betterquesting.icon.Count; 
                        questIconStr = iconItemObj.image || '';
                    }

                    questsMap[actualId] = {
                        id: 'bq_' + actualId, 
                        numericId: parseInt(actualId),
                        title: q.properties?.betterquesting?.name || 'Безымянный квест',
                        desc: q.properties?.betterquesting?.desc || '', 
                        icon: questIconStr, 
                        iconItem: iconItemObj,
                        parents: parents, 
                        reqs: reqs, 
                        rewards: rewards,
                        rawProps: rawData["questDatabase:9"][qKey] ? rawData["questDatabase:9"][qKey]["properties:10"] : null
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
                    newMods.push({ 
                        id: 'bq_mod_' + key, 
                        numericId: parseInt(key), 
                        name: ql.properties?.betterquesting?.name || 'Ветка ' + key, 
                        icon: '', 
                        rawProps: rawData["questLines:9"][key] ? rawData["questLines:9"][key]["properties:10"] : null, 
                        quests: lineQuests 
                    });
                });
            }
            editor.originalData = JSON.parse(JSON.stringify(editor.data.mods)); editor.isImportMode = true;
            editor.data.mods = newMods; editor.activeModId = newMods.length > 0 ? newMods[0].id : null;
            document.getElementById('import-mode-bar').classList.remove('hidden');
            document.body.classList.add('import-mode');
            editor.renderSidebar(); editor.renderCanvas(); editor.centerCanvas();
        } catch (e) { console.error("Ошибка парсинга", e); alert('Ошибка чтения файла!'); }
    },

    exportData(mods, editor) {
        const bqData = { "build:8": "3.0.328", "format:8": "2.0.0", "questDatabase:9": {}, "questLines:9": {} };
        
        // ВОССТАНАВЛИВАЕМ ГЛОБАЛЬНЫЕ НАСТРОЙКИ СЕРВЕРА
        if (editor && editor.questSettings) {
            bqData[editor.questSettings.key] = editor.questSettings.data;
        }

        let maxQuestId = -1;
        let maxLineId = -1;

        mods.forEach(mod => {
            if (mod.numericId !== undefined && mod.numericId > maxLineId) maxLineId = mod.numericId;
            mod.quests.forEach(q => {
                if (q.numericId !== undefined && q.numericId > maxQuestId) maxQuestId = q.numericId;
            });
        });

        const idMap = {}; 
        mods.forEach(mod => {
            if (mod.numericId === undefined) mod.numericId = ++maxLineId; 
            mod.quests.forEach(q => {
                if (q.numericId === undefined) {
                    q.numericId = ++maxQuestId; 
                }
                idMap[q.id] = q.numericId;
            });
        });

        const extractItemData = (req) => {
            let rawId = req.rawId !== undefined ? req.rawId : (req.item && (req.item.string_id || req.item.item_key) ? (req.item.string_id || req.item.item_key) : "minecraft:stone");
            let rawDamage = req.rawDamage !== undefined ? req.rawDamage : (req.damage !== undefined ? req.damage : (req.item && req.item.damage !== undefined ? req.item.damage : 0));

            let sysId = String(rawId);
            let damage = parseInt(rawDamage) || 0;

            const parts = sysId.split(':');
            if (parts.length === 3) {
                sysId = parts[0] + ':' + parts[1];
                damage = parseInt(parts[2]) || damage;
            } else if (parts.length === 2 && !isNaN(parseInt(parts[1]))) {
                sysId = parts[0];
                damage = parseInt(parts[1]) || damage;
            }

            let idKey = "id:8";
            let finalId = sysId;
            if (!isNaN(parseInt(sysId)) && sysId.indexOf(':') === -1 && sysId.match(/^[0-9]+$/)) {
                idKey = "id:2";
                finalId = parseInt(sysId);
            }
            return { idKey, finalId, damage };
        };

        mods.forEach(mod => {
            mod.quests.forEach(q => {
                const bqId = idMap[q.id];
                const preReqs = (q.parents || []).map(p => idMap[p]).filter(p => p !== undefined);
                const tasks = {}; let taskIdx = 0;
                
                const createItemsDict = (arr) => {
                    const dict = {};
                    arr.forEach((req, idx) => {
                        const { idKey, finalId, damage } = extractItemData(req);
                        const dictObj = { "Count:3": parseInt(req.count) || 1, "Damage:2": damage, "OreDict:8": "" };
                        dictObj[idKey] = finalId;
                        
                        if (req.nbtTag) dictObj["tag:10"] = req.nbtTag;
                        else if (finalId === 'bq_standard:loot_chest') dictObj["tag:10"] = { "hideLootInfo:1": 1 };
                        dict[`${idx}:10`] = dictObj;
                    });
                    return dict;
                };

                const createBlocksDict = (arr) => {
                    const dict = {};
                    arr.forEach((req, idx) => {
                        const { idKey, finalId, damage } = extractItemData(req);
                        dict[`${idx}:10`] = { "blockID:8": String(finalId), "amount:3": parseInt(req.count) || 1, "meta:3": damage, "oreDict:8": "", "nbt:10": req.nbtTag || {} };
                    });
                    return dict;
                };

                const createFluidsDict = (arr) => {
                    const dict = {};
                    arr.forEach((req, idx) => {
                        let fluidName = req.rawFluid !== undefined ? req.rawFluid : (req.target || req.customName || "water");
                        dict[`${idx}:10`] = { "FluidName:8": fluidName, "Amount:3": parseInt(req.count) || 1000 };
                    });
                    return dict;
                };

                const groups = { retrieval: [], crafting: [], block_break: [], hunt: [], fluid: [], checkbox: [], xp: [] };
                const npcDialogs = [];
                (q.reqs || []).forEach(r => { 
                    if (r.item && r.item.item_key === 'npc_dialog') npcDialogs.push(r);
                    else groups[r.taskType || 'retrieval'].push(r); 
                });

                // ФУНКЦИЯ ДЛЯ ГЛУБОКОГО КОПИРОВАНИЯ НАСТРОЕК ТАСКОВ (чтобы не потерять авто-консюм и т.д.)
                const getTaskProps = (arr, defType) => {
                    let props = arr[0] && arr[0].rawTaskProps ? JSON.parse(JSON.stringify(arr[0].rawTaskProps)) : null;
                    if (!props) {
                        props = { "taskID:8": defType, "autoConsume:1": 0, "consume:1": arr[0]?.consume ? 1 : 0, "groupDetect:1": 0, "ignoreNBT:1": 1, "partialMatch:1": 1 };
                    } else {
                        // Обновляем только то, что можно менять в редакторе
                        if (arr[0] && arr[0].consume !== undefined) props["consume:1"] = arr[0].consume ? 1 : 0;
                    }
                    props["index:3"] = taskIdx++;
                    return props;
                };

                if (groups.retrieval.length) {
                    let p = getTaskProps(groups.retrieval, "bq_standard:retrieval");
                    p["requiredItems:9"] = createItemsDict(groups.retrieval);
                    tasks[`${p["index:3"]}:10`] = p;
                }
                if (groups.crafting.length) {
                    let p = getTaskProps(groups.crafting, "bq_standard:crafting");
                    p["requiredItems:9"] = createItemsDict(groups.crafting);
                    tasks[`${p["index:3"]}:10`] = p;
                }
                if (groups.block_break.length) {
                    let p = getTaskProps(groups.block_break, "bq_standard:block_break");
                    p["blocks:9"] = createBlocksDict(groups.block_break);
                    tasks[`${p["index:3"]}:10`] = p;
                }
                if (groups.fluid.length) {
                    let p = getTaskProps(groups.fluid, "bq_standard:fluid");
                    p["requiredFluids:9"] = createFluidsDict(groups.fluid);
                    tasks[`${p["index:3"]}:10`] = p;
                }
                if (groups.checkbox.length) {
                    let p = getTaskProps(groups.checkbox, "bq_standard:checkbox");
                    tasks[`${p["index:3"]}:10`] = p;
                }
                if (groups.xp.length) {
                    let p = getTaskProps(groups.xp, "bq_standard:xp");
                    p["amount:3"] = parseInt(groups.xp[0].count) || 1;
                    p["isLevels:1"] = 1;
                    tasks[`${p["index:3"]}:10`] = p;
                }
                
                groups.hunt.forEach(h => {
                    let p = h.rawTaskProps ? JSON.parse(JSON.stringify(h.rawTaskProps)) : { "taskID:8": "bq_standard:hunt", "damageType:8": "", "ignoreNBT:1": 1, "subtypes:1": 1 };
                    p["index:3"] = taskIdx++;
                    p["target:8"] = h.target || h.customName || h.item.name;
                    p["required:3"] = parseInt(h.count) || 1;
                    if (h.nbtTag) p["targetNBT:10"] = h.nbtTag;
                    tasks[`${p["index:3"]}:10`] = p;
                });

                npcDialogs.forEach(req => {
                    let dialogId = 0;
                    if (req.nbtTag && req.nbtTag['npcDialogID:3'] !== undefined) dialogId = req.nbtTag['npcDialogID:3'];
                    tasks[`${taskIdx}:10`] = { "taskID:8": "bq_npc_integration:npc_dialog", "npcDialogID:3": parseInt(dialogId) || 0, "index:3": taskIdx++ };
                });

                const rewards = {}; let rewIdx = 0;
                
                const getRewProps = (arr, defType) => {
                    let props = arr[0] && arr[0].rawRewProps ? JSON.parse(JSON.stringify(arr[0].rawRewProps)) : null;
                    if (!props) props = { "rewardID:8": defType, "ignoreNBT:1": 1 };
                    props["index:3"] = rewIdx++;
                    return props;
                }

                if (q.rewards) {
                    const standardRews = q.rewards.filter(r => (!r.taskType || r.taskType === 'item') && !r.isChoice);
                    const choiceRews = q.rewards.filter(r => (!r.taskType || r.taskType === 'item') && r.isChoice);

                    if (standardRews.length > 0) {
                        let p = getRewProps(standardRews, "bq_standard:item");
                        p["rewards:9"] = createItemsDict(standardRews);
                        rewards[`${p["index:3"]}:10`] = p;
                    }
                    if (choiceRews.length > 0) {
                        let p = getRewProps(choiceRews, "bq_standard:choice");
                        p["choices:9"] = createItemsDict(choiceRews);
                        rewards[`${p["index:3"]}:10`] = p;
                    }

                    q.rewards.forEach(r => {
                        if (r.taskType === 'command') {
                            let p = r.rawRewProps ? JSON.parse(JSON.stringify(r.rawRewProps)) : { "rewardID:8": "bq_standard:command", "hideCommand:1": 1, "viaPlayer:1": 0 };
                            p["index:3"] = rewIdx++;
                            p["command:8"] = r.command || "";
                            rewards[`${p["index:3"]}:10`] = p;
                        } else if (r.taskType === 'xp') {
                            let p = r.rawRewProps ? JSON.parse(JSON.stringify(r.rawRewProps)) : { "rewardID:8": "bq_standard:xp", "isLevels:1": 1 };
                            p["index:3"] = rewIdx++;
                            p["amount:3"] = parseInt(r.count) || 1;
                            rewards[`${p["index:3"]}:10`] = p;
                        }
                    });
                }

                // ВОССТАНАВЛИВАЕМ ОРИГИНАЛЬНЫЕ НАСТРОЙКИ КВЕСТА
                let props = q.rawProps ? JSON.parse(JSON.stringify(q.rawProps)) : { 
                    "betterquesting:10": { 
                        "autoClaim:1": 0, "globalShare:1": 0, "isMain:1": 0, "isSilent:1": 0, "lockedProgress:1": 0, 
                        "partySingleReward:1": 0, "questLogic:8": "AND", "repeatTime:3": -1, 
                        "repeat_relative:1": 1, "simultaneous:1": 0, "snd_complete:8": "minecraft:entity.player.levelup", 
                        "snd_update:8": "minecraft:entity.player.levelup", "taskLogic:8": "AND", "visibility:8": "NORMAL" 
                    } 
                };

                if (!props["betterquesting:10"]) props["betterquesting:10"] = {};
                
                props["betterquesting:10"]["name:8"] = q.title;
                props["betterquesting:10"]["desc:8"] = q.desc || "";
                
                // ВОССТАНАВЛИВАЕМ ОРИГИНАЛЬНУЮ ИКОНКУ (СО ВСЕМИ ЕЁ АТРИБУТАМИ)
                if (q.iconItem) {
                    const { idKey, finalId, damage } = extractItemData({ item: q.iconItem, rawId: q.iconItem.rawId, rawDamage: q.iconItem.rawDamage });
                    
                    let count = 1;
                    if (q.iconItem.rawCount !== undefined) {
                        count = q.iconItem.rawCount;
                    } else if (props["betterquesting:10"]["icon:10"] && props["betterquesting:10"]["icon:10"]["Count:3"] !== undefined) {
                        count = props["betterquesting:10"]["icon:10"]["Count:3"]; // Если было 64 - останется 64
                    }
                    
                    const iconDict = { "Count:3": count, "Damage:2": damage, "OreDict:8": "" };
                    iconDict[idKey] = finalId;
                    props["betterquesting:10"]["icon:10"] = iconDict;
                } else {
                     props["betterquesting:10"]["icon:10"] = { "id:8": "minecraft:book", "Count:3": 1, "Damage:2": 0, "OreDict:8": "" };
                }

                bqData["questDatabase:9"][`${bqId}:10`] = {
                    "questID:3": bqId, 
                    "preRequisites:11": preReqs,
                    "properties:10": props,
                    "tasks:9": tasks, 
                    "rewards:9": rewards
                };
            });
        });

        mods.forEach(mod => {
            const lineQuests = {};
            mod.quests.forEach(q => {
                const bqId = idMap[q.id];
                const sz = q.size === 'x2' ? 48 : 24;
                lineQuests[`${bqId}:10`] = { "x:3": Math.round(q.x / 3), "y:3": Math.round(q.y / 3), "id:3": bqId, "sizeX:3": sz, "sizeY:3": sz };
            });

            // ВОССТАНАВЛИВАЕМ НАСТРОЙКИ ВЕТОК
            let lineProps = mod.rawProps ? JSON.parse(JSON.stringify(mod.rawProps)) : {
                "betterquesting:10": {
                    "bg_image:8": "minecraft:textures/gui/presets/window.png",
                    "bg_size:3": 256,
                    "bms_complete:8": "minecraft:entity.player.levelup",
                    "bms_update:8": "minecraft:entity.player.levelup",
                    "desc:8": "Сгенерировано в редакторе",
                    "icon:10": { "Count:3": 1, "Damage:2": 0, "OreDict:8": "", "id:8": "minecraft:book" },
                    "name:8": mod.name,
                    "visibility:8": "NORMAL"
                }
            };
            
            if (lineProps["betterquesting:10"]) {
                lineProps["betterquesting:10"]["name:8"] = mod.name;
            }

            bqData["questLines:9"][`${mod.numericId}:10`] = {
                "lineID:3": mod.numericId,
                "properties:10": lineProps,
                "quests:9": lineQuests
            };
        });

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bqData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "QuestDatabase_Export.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
};
