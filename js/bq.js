import { ItemsDB } from './items.js';
import { DB } from './db.js';

export const BQ = {
    parseLootData(jsonString, editor) {
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
            
            if (!editor.lootGroups) editor.lootGroups = {};
            
            if (data.groups) {
                Object.values(data.groups).forEach(group => {
                    editor.lootGroups[group.ID] = group.name;
                });
                alert('База лутбоксов (Loot Groups) успешно загружена! Теперь в квестах будут их настоящие названия.');
            } else {
                alert('Группы лутбоксов не найдены в файле!');
            }
        } catch(e) {
            console.error(e);
            alert('Ошибка чтения QuestLoot.json');
        }
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
                    let actualId = q.questID !== undefined ? q.questID : qKey;
                    actualId = String(actualId).split(':')[0];
                    
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
                                 editor.addMobToDatalist(target);
                                 reqs.push({ item: { item_key: `mob_${target}`, name: target, image: '', mod: 'Мобы' }, count: task.required || 1, target: target, customName: target, consume: false, taskType: 'hunt' });
                            }
                            else if (task.requiredFluids && task.taskID === 'bq_standard:fluid') {
                                Object.values(task.requiredFluids).forEach(fluid => {
                                    reqs.push({ item: { item_key: `fluid_${fluid.FluidName}`, name: fluid.FluidName, image: '', mod: 'Жидкость' }, count: fluid.Amount || 1000, target: fluid.FluidName, customName: fluid.FluidName, consume: task.consume || false, taskType: 'fluid' });
                                });
                            }
                            else if (task.taskID === 'bq_standard:checkbox') {
                                reqs.push({ item: { item_key: 'checkbox', name: 'Галочка', image: '', mod: 'Задачи' }, count: 1, customName: 'Нажать галочку (Прочтение)', consume: false, taskType: 'checkbox' });
                            }
                        });
                    }
                    
                    if (q.rewards) {
                        Object.values(q.rewards).forEach(rew => {
                            if (rew.rewards) {
                                Object.values(rew.rewards).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    rewards.push({ item: foundItem, count: item.Count || 1, customName: foundItem.name === item.id ? item.id : foundItem.name, isChoice: false, damage: item.Damage });
                                });
                            }
                            if (rew.choices) {
                                Object.values(rew.choices).forEach(item => {
                                    const foundItem = ItemsDB.findItemByBQ(item.id, item.Damage);
                                    rewards.push({ item: foundItem, count: item.Count || 1, customName: foundItem.name === item.id ? item.id : foundItem.name, isChoice: true, damage: item.Damage });
                                });
                            }
                        });
                    }

                    let parents = [];
                    if (q.preRequisites) {
                        if (Array.isArray(q.preRequisites)) {
                            parents = q.preRequisites.map(p => 'bq_' + String(p).split(':')[0]);
                        } else {
                            parents = Object.values(q.preRequisites).map(p => 'bq_' + String(p).split(':')[0]);
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
                            let qIdStr = pos.id !== undefined ? pos.id : (pos.questID !== undefined ? pos.questID : "");
                            qIdStr = String(qIdStr).split(':')[0]; 
                            if (!qIdStr || addedIds.has(qIdStr)) return;
                            addedIds.add(qIdStr);

                            const baseQ = questsMap[qIdStr];
                            if (baseQ) {
                                lineQuests.push({ ...JSON.parse(JSON.stringify(baseQ)), x: (pos.x || 0) * 3, y: (pos.y || 0) * 3, size: pos.sizeX > 24 ? 'x2' : 'x1' });
                            }
                        });
                    }
                    newMods.push({ id: 'bq_mod_' + key, name: ql.properties?.betterquesting?.name || 'Ветка ' + key, icon: '', quests: lineQuests });
                });
            }

            editor.originalData = JSON.parse(JSON.stringify(editor.data.mods)); 
            editor.isImportMode = true;
            editor.data.mods = newMods;
            editor.activeModId = newMods.length > 0 ? newMods[0].id : null;
            
            document.getElementById('import-mode-bar').classList.remove('hidden');
            document.body.classList.add('import-mode');
            
            editor.renderSidebar(); 
            editor.renderCanvas(); 
            editor.centerCanvas();
        } catch (e) {
            console.error(e);
            alert('Ошибка парсинга файла! Убедитесь, что это QuestDatabase.json');
        }
    },

    exportData(mods) {
        const bqData = {
            "build:8": "3.0.328",
            "format:8": "2.0.0",
            "questDatabase:9": {},
            "questLines:9": {}
        };

        let questNumericId = 0;
        const idMap = {}; 

        mods.forEach(mod => { mod.quests.forEach(q => { if(idMap[q.id] === undefined) idMap[q.id] = questNumericId++; }); });

        mods.forEach(mod => {
            mod.quests.forEach(q => {
                const bqId = idMap[q.id];
                const preReqs = (q.parents || []).map(p => idMap[p]).filter(p => p !== undefined);

                const tasks = {};
                let taskIdx = 0;

                const retrievals = [];
                const craftings = [];
                const blockBreaks = [];
                const hunts = [];
                const fluids = [];
                const checkboxes = [];

                if (q.reqs) {
                    q.reqs.forEach(req => {
                        let tType = req.taskType || 'retrieval';
                        if (tType === 'hunt') hunts.push(req);
                        else if (tType === 'block_break') blockBreaks.push(req);
                        else if (tType === 'crafting') craftings.push(req);
                        else if (tType === 'fluid') fluids.push(req);
                        else if (tType === 'checkbox') checkboxes.push(req);
                        else retrievals.push(req);
                    });
                }

                const createItemsDict = (arr) => {
                    const dict = {};
                    arr.forEach((req, idx) => {
                        let sysId = req.item.string_id || req.item.item_key || "minecraft:stone";
                        let damage = req.damage !== undefined ? req.damage : (req.item.damage !== undefined ? req.item.damage : 0);
                        if (!req.item.string_id && sysId.includes(':') && !sysId.match(/[a-zA-Z]/)) {
                            const parts = sysId.split(':');
                            sysId = parts[0]; damage = req.damage !== undefined ? req.damage : (parseInt(parts[1]) || 0);
                        }
                        
                        if (sysId === 'bq_standard:loot_chest') {
                            dict[`${idx}:10`] = { "id:8": sysId, "Count:3": parseInt(req.count) || 1, "Damage:2": damage, "OreDict:8": "", "tag:10": { "hideLootInfo:1": 1 } };
                        } else {
                            dict[`${idx}:10`] = { "id:8": sysId, "Count:3": parseInt(req.count) || 1, "Damage:2": damage, "OreDict:8": "" };
                        }
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

                const createFluidsDict = (arr) => {
                    const dict = {};
                    arr.forEach((req, idx) => {
                        let fluidName = req.target || req.customName || req.item.name || "water";
                        dict[`${idx}:10`] = { "FluidName:8": fluidName, "Amount:3": parseInt(req.count) || 1000 };
                    });
                    return dict;
                };

                if (retrievals.length > 0) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:retrieval", "consume:1": retrievals[0].consume ? 1 : 0, "requiredItems:9": createItemsDict(retrievals) };
                if (craftings.length > 0) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:crafting", "allowAnvil:1": 0, "allowSmelt:1": 0, "allowCraft:1": 1, "requiredItems:9": createItemsDict(craftings) };
                if (blockBreaks.length > 0) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:block_break", "blocks:9": createBlocksDict(blockBreaks) };
                if (fluids.length > 0) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:fluid", "consume:1": fluids[0].consume ? 1 : 0, "requiredFluids:9": createFluidsDict(fluids) };
                if (checkboxes.length > 0) tasks[`${taskIdx++}:10`] = { "taskID:8": "bq_standard:checkbox", "index:3": 0 };
                
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
        mods.forEach(mod => {
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
    }
};
