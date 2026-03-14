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
            let safeJson = jsonString.replace(/([:\[,]\s*)([-]?\d+\.\d+|[-]?\d{15,})(?=\s*[,}\]])/g, '$1"__BQ_NUM__$2"');

            const rawData = JSON.parse(safeJson);
            
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

            if (rawData["questDatabase:9"]) {
                Object.entries(rawData["questDatabase:9"]).forEach(([rawQKey, rawQ]) => {
                    let cleanQKey = rawQKey.split(':')[0];
                    let q = data.questDatabase[cleanQKey];
                    if (!q) return;

                    let actualId = String(q.questID !== undefined ? q.questID : cleanQKey).split(':')[0];
                    let reqs = []; let rewards = [];
                    
                    let rawTasks = rawQ["tasks:9"] || {};
                    let rawRewards = rawQ["rewards:9"] || {};
                    
                    if (q.tasks) {
                        Object.entries(q.tasks).forEach(([tKey, task]) => {
                            let rawTKey = Object.keys(rawTasks).find(k => k.startsWith(tKey + ':') || k === tKey);
                            let rawTaskProps = rawTKey ? rawTasks[rawTKey] : null;
                            
                            if (!task.taskID) return; 
                            const tType = task.taskID.replace('bq_standard:', '').replace('bq_npc_integration:', '');
                            let req = { taskType: tType, rawTaskProps: rawTaskProps, nbtTag: task.targetNBT || null };
                            
                            if (tType === 'retrieval' || tType === 'crafting') {
                                Object.values(task.requiredItems || {}).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    reqs.push({ ...req, item: foundItem, rawId: item.id, rawDamage: item.Damage, count: item.Count !== undefined ? item.Count : 1, customName: this.getCustomName(foundItem, item.tag), consume: task.consume || 0, nbtTag: item.tag });
                                });
                            } else if (tType === 'block_break') {
                                Object.values(task.blocks || {}).forEach(block => {
                                    const foundItem = ItemsDB.findItemByBQ(block.blockID || block.id, block.meta !== undefined ? block.meta : block.Damage);
                                    reqs.push({ ...req, item: foundItem, rawId: block.blockID || block.id, rawDamage: block.meta !== undefined ? block.meta : block.Damage, count: block.amount !== undefined ? block.amount : (block.Count !== undefined ? block.Count : 1), customName: this.getCustomName(foundItem, block.nbt), consume: false, nbtTag: block.nbt });
                                });
                            } else if (tType === 'hunt') {
                                req.target = task.target || 'Zombie';
                                req.count = task.required || 1;
                                reqs.push(req);
                            } else if (tType === 'fluid') {
                                Object.values(task.requiredFluids || {}).forEach(f => {
                                    reqs.push({ ...req, target: f.FluidName, count: f.Amount || 1000, consume: task.consume || 0 });
                                });
                            } else if (tType === 'checkbox') {
                                reqs.push(req);
                            } else if (tType === 'xp') {
                                req.count = task.amount !== undefined ? task.amount : 1;
                                reqs.push(req);
                            } else if (tType === 'npc_dialog') {
                                req.dialogId = task.npcDialogID || 0;
                                req.desc = task.description || '';
                                reqs.push(req);
                            } else if (tType === 'npc_faction') {
                                req.factionId = task.factionID || 0;
                                req.operation = task.operation || 'MORE_OR_EQUAL';
                                req.targetValue = task.target || 1;
                                reqs.push(req);
                            } else if (tType === 'npc_quest') {
                                req.questId = task.npcQuestID || 0;
                                reqs.push(req);
                            } else if (tType === 'interact_entity') {
                                req.target = task.targetID || 'Villager';
                                req.onHit = task.onHit || 0;
                                req.onInteract = task.onInteract || 0;
                                req.count = task.requiredUses !== undefined ? task.requiredUses : 1;
                                let i = task.item || {};
                                if (i.id && i.id !== "minecraft:air") {
                                    const foundItem = ItemsDB.findItemByBQ(i.id, i.Damage);
                                    req.item = foundItem; req.rawId = i.id; req.rawDamage = i.Damage; req.nbtTag = i.tag;
                                } else {
                                    req.item = { item_key: 'minecraft:air', name: 'Пустая рука', image: 'book.png', mod: 'Система' };
                                    req.rawId = "minecraft:air"; req.rawDamage = 0;
                                }
                                reqs.push(req);
                            } else if (tType === 'interact_item') {
                                req.onHit = task.onHit || 0;
                                req.onInteract = task.onInteract || 0;
                                let i = task.item || {};
                                if (i.id) {
                                    const foundItem = ItemsDB.findItemByBQ(i.id, i.Damage);
                                    req.item = foundItem; req.rawId = i.id; req.rawDamage = i.Damage; req.nbtTag = i.tag;
                                }
                                reqs.push(req);
                            } else if (tType === 'location') {
                                req.name = task.name || '';
                                req.posX = task.posX || 0;
                                req.posY = task.posY || 0;
                                req.posZ = task.posZ || 0;
                                req.dimension = task.dimension || 0;
                                req.range = task.range || -1;
                                reqs.push(req);
                            } else if (tType === 'meeting') {
                                req.target = task.target || 'Villager';
                                req.count = task.amount || 1;
                                req.range = task.range || 4;
                                reqs.push(req);
                            } else if (tType === 'scoreboard') {
                                req.scoreName = task.scoreName || '';
                                req.scoreDisp = task.scoreDisp || '';
                                req.operation = task.operation || 'MORE_OR_EQUAL';
                                req.targetValue = task.target || 1;
                                reqs.push(req);
                            }
                        });
                    }

                    if (q.rewards) {
                        Object.entries(q.rewards).forEach(([rKey, rew]) => {
                            let rawRKey = Object.keys(rawRewards).find(k => k.startsWith(rKey + ':') || k === rKey);
                            let rawRewProps = rawRKey ? rawRewards[rawRKey] : null;
                            
                            if (!rew.rewardID) return; 
                            const rType = rew.rewardID.replace('bq_standard:', '').replace('bq_npc_integration:', '');
                            let reward = { taskType: rType, rawRewProps: rawRewProps };

                            if (rType === 'item' || rType === 'choice') {
                                const list = rew.rewards || rew.choices || {};
                                Object.values(list).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    rewards.push({ ...reward, item: foundItem, rawId: item.id, rawDamage: item.Damage, count: item.Count !== undefined ? item.Count : 1, customName: this.getCustomName(foundItem, item.tag), isChoice: rType === 'choice', damage: item.Damage, nbtTag: item.tag });
                                });
                            } else if (rType === 'command') {
                                reward.command = rew.command || '';
                                rewards.push(reward);
                            } else if (rType === 'xp') {
                                reward.count = rew.amount !== undefined ? rew.amount : 1;
                                rewards.push(reward);
                            } else if (rType === 'npc_faction') {
                                reward.factionId = rew.factionID || 0;
                                reward.targetValue = rew.value !== undefined ? rew.value : 1;
                                rewards.push(reward);
                            } else if (rType === 'npc_mail') {
                                reward.sender = rew.Sender || '';
                                reward.subject = rew.Subject || '';
                                reward.message = (rew.Message && rew.Message.pages && rew.Message.pages["0"]) ? rew.Message.pages["0"] : '';
                                rewards.push(reward);
                            } else if (rType === 'scoreboard') {
                                reward.scoreName = rew.score || '';
                                reward.targetValue = rew.value !== undefined ? rew.value : 1;
                                rewards.push(reward);
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
                        iconItemObj.nbtTag = q.properties.betterquesting.icon.tag || null;
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
                        rawProps: rawQ["properties:10"] ? JSON.parse(JSON.stringify(rawQ["properties:10"])) : null
                    };
                });
            }
            
            const newMods = [];
            if (rawData["questLines:9"]) {
                Object.entries(rawData["questLines:9"]).forEach(([rawLKey, rawL]) => {
                    let cleanLKey = rawLKey.split(':')[0];
                    let ql = data.questLines[cleanLKey];
                    if (!ql) return;

                    const lineQuests = []; const addedIds = new Set();
                    if (ql.quests) {
                        Object.values(ql.quests).forEach(pos => {
                            let qIdStr = String(pos.id !== undefined ? pos.id : (pos.questID !== undefined ? pos.questID : "")).split(':')[0]; 
                            if (!qIdStr || addedIds.has(qIdStr)) return; addedIds.add(qIdStr);
                            const baseQ = questsMap[qIdStr];
                            if (baseQ) lineQuests.push({ ...JSON.parse(JSON.stringify(baseQ)), x: (pos.x || 0) * 3, y: (pos.y || 0) * 3, size: pos.sizeX > 24 ? 'x2' : 'x1' });
                        });
                    }
                    
                    newMods.push({ 
                        id: 'bq_mod_' + cleanLKey, 
                        numericId: parseInt(cleanLKey), 
                        name: ql.properties?.betterquesting?.name || 'Ветка ' + cleanLKey, 
                        icon: '', 
                        rawProps: rawL["properties:10"] ? JSON.parse(JSON.stringify(rawL["properties:10"])) : null, 
                        quests: lineQuests 
                    });
                });
            }
            editor.originalData = JSON.parse(JSON.stringify(editor.data.mods)); editor.isImportMode = true;
            editor.data.mods = newMods; editor.activeModId = newMods.length > 0 ? newMods[0].id : null;
            document.getElementById('import-mode-bar').classList.remove('hidden');
            document.body.classList.add('import-mode');
            editor.renderSidebar(); editor.renderCanvas(); editor.centerCanvas();
        } catch (e) { 
            console.error("Ошибка парсинга файла: ", e); 
            alert('Ошибка чтения файла! Подробности в консоли (F12). Убедитесь, что это корректный QuestDatabase.json'); 
        }
    },

    exportData(mods, editor) {
        const bqData = { "build:8": "3.0.328", "format:8": "2.0.0", "questDatabase:9": {}, "questLines:9": {} };
        
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
                if (q.numericId === undefined) q.numericId = ++maxQuestId; 
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
                const tasks = {}; 
                
                let maxTaskIdx = -1;
                (q.reqs || []).forEach(r => {
                    if (r.rawTaskProps && r.rawTaskProps["index:3"] !== undefined) {
                        if (r.rawTaskProps["index:3"] > maxTaskIdx) maxTaskIdx = r.rawTaskProps["index:3"];
                    }
                });
                let taskIdx = maxTaskIdx + 1;

                let maxRewIdx = -1;
                (q.rewards || []).forEach(r => {
                    if (r.rawRewProps && r.rawRewProps["index:3"] !== undefined) {
                        if (r.rawRewProps["index:3"] > maxRewIdx) maxRewIdx = r.rawRewProps["index:3"];
                    }
                });
                let rewIdx = maxRewIdx + 1;
                
                const createItemsDict = (arr) => {
                    const dict = {};
                    arr.forEach((req, idx) => {
                        const { idKey, finalId, damage } = extractItemData(req);
                        const dictObj = { "Count:3": parseInt(req.count) || 1, "Damage:2": damage, "OreDict:8": "" };
                        dictObj[idKey] = finalId;
                        
                        let nbt = req.nbtTag ? JSON.parse(JSON.stringify(req.nbtTag)) : null;
                        
                        if (req.customName && req.item && req.customName !== req.item.name && req.customName !== "Нажать галочку" && req.customName !== "Уровни опыта" && req.customName !== "Команда") {
                            let formattedName = req.customName; 
                            if (!nbt) nbt = {};
                            if (!nbt["display:10"]) nbt["display:10"] = {};
                            nbt["display:10"]["Name:8"] = formattedName;
                        }
                        
                        if (nbt) dictObj["tag:10"] = nbt;
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

                const taskGroups = { retrieval: [], crafting: [], block_break: [], fluid: [] };
                const ungroupedTasks = [];

                (q.reqs || []).forEach(r => {
                    let type = r.taskType || 'retrieval';
                    if (taskGroups[type]) taskGroups[type].push(r);
                    else ungroupedTasks.push(r);
                });

                const getTaskProps = (arr, defType) => {
                    let props = arr[0] && arr[0].rawTaskProps ? JSON.parse(JSON.stringify(arr[0].rawTaskProps)) : null;
                    if (!props) {
                        props = { "taskID:8": defType, "autoConsume:1": 0, "consume:1": arr[0]?.consume ? 1 : 0, "groupDetect:1": 0, "ignoreNBT:1": 1, "partialMatch:1": 1 };
                        props["index:3"] = taskIdx++;
                    } else {
                        if (arr[0] && arr[0].consume !== undefined) props["consume:1"] = arr[0].consume ? 1 : 0;
                        if (props["index:3"] === undefined) props["index:3"] = taskIdx++;
                    }
                    return props;
                };

                let tDictIdx = 0;

                if (taskGroups.retrieval.length) {
                    let p = getTaskProps(taskGroups.retrieval, "bq_standard:retrieval");
                    p["requiredItems:9"] = createItemsDict(taskGroups.retrieval);
                    tasks[`${tDictIdx++}:10`] = p;
                }
                if (taskGroups.crafting.length) {
                    let p = getTaskProps(taskGroups.crafting, "bq_standard:crafting");
                    p["requiredItems:9"] = createItemsDict(taskGroups.crafting);
                    tasks[`${tDictIdx++}:10`] = p;
                }
                if (taskGroups.block_break.length) {
                    let p = getTaskProps(taskGroups.block_break, "bq_standard:block_break");
                    p["blocks:9"] = createBlocksDict(taskGroups.block_break);
                    tasks[`${tDictIdx++}:10`] = p;
                }
                if (taskGroups.fluid.length) {
                    let p = getTaskProps(taskGroups.fluid, "bq_standard:fluid");
                    p["requiredFluids:9"] = createFluidsDict(taskGroups.fluid);
                    tasks[`${tDictIdx++}:10`] = p;
                }

                ungroupedTasks.forEach(t => {
                    let p = t.rawTaskProps ? JSON.parse(JSON.stringify(t.rawTaskProps)) : {};
                    if (p["index:3"] === undefined) p["index:3"] = taskIdx++;
                    let tType = t.taskType;
                    
                    if (tType === 'hunt') {
                        p["taskID:8"] = "bq_standard:hunt";
                        p["target:8"] = t.target || "Zombie";
                        p["required:3"] = parseInt(t.count) || 1;
                        if (t.nbtTag) p["targetNBT:10"] = t.nbtTag;
                    } else if (tType === 'checkbox') {
                        p["taskID:8"] = "bq_standard:checkbox";
                    } else if (tType === 'xp') {
                        p["taskID:8"] = "bq_standard:xp";
                        p["amount:3"] = parseInt(t.count) || 1;
                        p["isLevels:1"] = 1;
                    } else if (tType === 'npc_dialog') {
                        p["taskID:8"] = "bq_npc_integration:npc_dialog";
                        p["npcDialogID:3"] = parseInt(t.dialogId) || 0;
                        p["description:8"] = t.desc || "";
                    } else if (tType === 'npc_faction') {
                        p["taskID:8"] = "bq_npc_integration:npc_faction";
                        p["factionID:3"] = parseInt(t.factionId) || 0;
                        p["operation:8"] = t.operation || "MORE_OR_EQUAL";
                        p["target:3"] = parseInt(t.targetValue) || 1;
                    } else if (tType === 'npc_quest') {
                        p["taskID:8"] = "bq_npc_integration:npc_quest";
                        p["npcQuestID:3"] = parseInt(t.questId) || 0;
                    } else if (tType === 'interact_entity') {
                        p["taskID:8"] = "bq_standard:interact_entity";
                        p["targetID:8"] = t.target || "Villager";
                        p["onHit:1"] = t.onHit ? 1 : 0;
                        p["onInteract:1"] = t.onInteract ? 1 : 0;
                        p["requiredUses:3"] = parseInt(t.count) || 1;
                        
                        let rawId = t.rawId !== undefined ? t.rawId : (t.item ? (t.item.string_id || t.item.item_key) : "minecraft:air");
                        if (rawId === 'mob') rawId = 'minecraft:air'; 
                        
                        if (rawId !== "minecraft:air") {
                            const { idKey, finalId, damage } = extractItemData({ ...t, rawId });
                            p["item:10"] = { "Count:3": 1, "Damage:2": damage, "OreDict:8": "" };
                            p["item:10"][idKey] = finalId;
                            if (t.nbtTag) p["item:10"]["tag:10"] = t.nbtTag;
                            p["ignoreItemNBT:1"] = t.nbtTag ? 0 : 1;
                        } else {
                            p["item:10"] = { "Count:3": 1, "Damage:2": 0, "OreDict:8": "", "id:8": "minecraft:air" };
                            p["ignoreItemNBT:1"] = 1;
                        }
                        p["partialItemMatch:1"] = 0;
                        p["targetSubtypes:1"] = 1;
                        p["ignoreTargetNBT:1"] = 1;
                        p["targetNBT:10"] = {};

                    } else if (tType === 'interact_item') {
                        p["taskID:8"] = "bq_standard:interact_item";
                        p["onHit:1"] = t.onHit ? 1 : 0;
                        p["onInteract:1"] = t.onInteract ? 1 : 0;
                        if (t.item) {
                            const { idKey, finalId, damage } = extractItemData(t);
                            p["item:10"] = { "Count:3": 1, "Damage:2": damage, "OreDict:8": "" };
                            p["item:10"][idKey] = finalId;
                            if (t.nbtTag) p["item:10"]["tag:10"] = t.nbtTag;
                        } else {
                            p["item:10"] = {};
                        }
                    } else if (tType === 'location') {
                        p["taskID:8"] = "bq_standard:location";
                        p["name:8"] = t.name || "";
                        p["posX:3"] = parseInt(t.posX) || 0;
                        p["posY:3"] = parseInt(t.posY) || 0;
                        p["posZ:3"] = parseInt(t.posZ) || 0;
                        p["dimension:3"] = parseInt(t.dimension) || 0;
                        p["range:3"] = parseInt(t.range) || -1;
                    } else if (tType === 'meeting') {
                        p["taskID:8"] = "bq_standard:meeting";
                        p["target:8"] = t.target || "Villager";
                        p["amount:3"] = parseInt(t.count) || 1;
                        p["range:3"] = parseInt(t.range) || 4;
                    } else if (tType === 'scoreboard') {
                        p["taskID:8"] = "bq_standard:scoreboard";
                        p["scoreName:8"] = t.scoreName || "";
                        p["scoreDisp:8"] = t.scoreDisp || "";
                        p["operation:8"] = t.operation || "MORE_OR_EQUAL";
                        p["target:3"] = parseInt(t.targetValue) || 1;
                        p["type:8"] = "dummy";
                    }
                    tasks[`${tDictIdx++}:10`] = p;
                });

                const rewards = {};
                const rewardGroups = { item: [], choice: [] };
                const ungroupedRewards = [];
                let rDictIdx = 0;

                (q.rewards || []).forEach(r => {
                    let type = r.taskType || 'item';
                    if (rewardGroups[type]) rewardGroups[type].push(r);
                    else ungroupedRewards.push(r);
                });

                const getRewProps = (arr, defType) => {
                    let props = arr[0] && arr[0].rawRewProps ? JSON.parse(JSON.stringify(arr[0].rawRewProps)) : null;
                    if (!props) {
                        props = { "rewardID:8": defType, "ignoreNBT:1": 1 };
                        props["index:3"] = rewIdx++;
                    } else {
                        if (props["index:3"] === undefined) props["index:3"] = rewIdx++;
                    }
                    return props;
                }

                if (rewardGroups.item.length) {
                    let p = getRewProps(rewardGroups.item, "bq_standard:item");
                    p["rewards:9"] = createItemsDict(rewardGroups.item);
                    rewards[`${rDictIdx++}:10`] = p;
                }
                if (rewardGroups.choice.length) {
                    let p = getRewProps(rewardGroups.choice, "bq_standard:choice");
                    p["choices:9"] = createItemsDict(rewardGroups.choice);
                    rewards[`${rDictIdx++}:10`] = p;
                }

                ungroupedRewards.forEach(r => {
                    let p = r.rawRewProps ? JSON.parse(JSON.stringify(r.rawRewProps)) : {};
                    if (p["index:3"] === undefined) p["index:3"] = rewIdx++;
                    let rType = r.taskType;

                    if (rType === 'command') {
                        p["rewardID:8"] = "bq_standard:command";
                        p["command:8"] = r.command || "";
                    } else if (rType === 'xp') {
                        p["rewardID:8"] = "bq_standard:xp";
                        p["amount:3"] = parseInt(r.count) || 1;
                        p["isLevels:1"] = 1;
                    } else if (rType === 'npc_faction') {
                        p["rewardID:8"] = "bq_npc_integration:npc_faction";
                        p["factionID:3"] = parseInt(r.factionId) || 0;
                        p["value:3"] = parseInt(r.targetValue) || 1;
                    } else if (rType === 'npc_mail') {
                        p["rewardID:8"] = "bq_npc_integration:npc_mail";
                        p["Sender:8"] = r.sender || "Anonymous";
                        p["Subject:8"] = r.subject || "Reward";
                        p["Message:10"] = { "pages:9": { "0:8": r.message || "" } };
                    } else if (rType === 'scoreboard') {
                        p["rewardID:8"] = "bq_standard:scoreboard";
                        p["score:8"] = r.scoreName || "";
                        p["value:3"] = parseInt(r.targetValue) || 1;
                        p["type:8"] = "dummy";
                    }
                    rewards[`${rDictIdx++}:10`] = p;
                });

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
                
                if (q.iconItem) {
                    const { idKey, finalId, damage } = extractItemData({ item: q.iconItem, rawId: q.iconItem.rawId, rawDamage: q.iconItem.rawDamage });
                    let count = 1;
                    if (q.iconItem.rawCount !== undefined) {
                        count = q.iconItem.rawCount;
                    } else if (props["betterquesting:10"]["icon:10"] && props["betterquesting:10"]["icon:10"]["Count:3"] !== undefined) {
                        count = props["betterquesting:10"]["icon:10"]["Count:3"]; 
                    }
                    const iconDict = { "Count:3": count, "Damage:2": damage, "OreDict:8": "" };
                    iconDict[idKey] = finalId;
                    if (q.iconItem.nbtTag) iconDict["tag:10"] = q.iconItem.nbtTag;
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

            let lineProps = mod.rawProps ? JSON.parse(JSON.stringify(mod.rawProps)) : {
                "betterquesting:10": {
                    "bg_image:8": "", 
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

        let outStr = JSON.stringify(bqData, null, 2);
        
        outStr = outStr.replace(/"__BQ_NUM__([-]?\d+\.\d+|[-]?\d{15,})"/g, '$1');

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(outStr);
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "QuestDatabase_Export.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
};
