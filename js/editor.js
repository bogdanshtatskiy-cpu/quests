import { ItemsDB } from './items.js';
import { DB } from './db.js';
import { Auth } from './auth.js';
import { BQ } from './bq.js';

import { EditorCanvas } from './editor_canvas.js';
import { EditorSidebar } from './editor_sidebar.js';
import { EditorModals } from './editor_modals.js';
import { EditorPicker } from './editor_picker.js';

export const MOB_LIST = {
    'Basalz': 'Базальз', 'Bat': 'Летучая мышь', 'Blaze': 'Ифрит', 'Blizz': 'Близз',
    'CaveSpider': 'Пещерный паук', 'Chicken': 'Курица', 'Cow': 'Корова', 'Creeper': 'Крипер',
    'DraconicEvolution.EnderDragon': 'Эндер Дракон', 'Enderman': 'Эндермен', 'Ghast': 'Гаст',
    'MineFactoryReloaded.mfrEntityPinkSlime': 'Розовая слизь', 'MushroomCow': 'Грибная корова',
    'Ozelot': 'Оцелот', 'Pig': 'Свинья', 'PigZombie': 'Зомби-свиночеловек', 'Sheep': 'Овца',
    'SnowMan': 'Снеговик', 'Spider': 'Паук', 'Squid': 'Спрут', 'Villager': 'Житель',
    'VillagerGolem': 'Железный голем', 'Witch': 'Ведьма', 'WitherBoss': 'Иссушитель',
    'Wolf': 'Волк', 'Zombie': 'Зомби', 'wildmobsmod.Bison': 'Бизон', 
    'wildmobsmod.Deer': 'Олень', 'witherSkeleton': 'Скелет-иссушитель'
};

export const Editor = {
    data: { mods: [] }, 
    history: [], historyIndex: -1, activeModId: null, originalData: null, 
    isImportMode: false, lootGroups: {}, questSettings: null, viewStates: {},
    
    scale: 1, panX: 0, panY: 0, isPanning: false, panStartX: 0, panStartY: 0, initialPanX: 0, initialPanY: 0,
    draggedQuestId: null, draggedCommentId: null, mouseStartX: 0, mouseStartY: 0, nodeStartX: 0, nodeStartY: 0, hasMovedNode: false, linkingFromNodeId: null, 
    contextNodeId: null, contextCommentId: null, editingNodeId: null, editingCommentId: null, hoveredQuestId: null, hoveredCommentId: null, 
    pickerCallback: null, tempReqs: [], tempRewards: [], tempParents: [], tempQuestIcon: null, tempQuestIconItem: null, editingModId: null, tempModIcon: null, saveTimeout: null, tempNbtTarget: null,

    MOB_LIST: MOB_LIST,

    init() {
        EditorCanvas.init(this);
        EditorSidebar.init(this);
        EditorModals.init(this);
        EditorPicker.init(this);
        this.bindTopBarEvents();
        this.bindHistoryEvents();
    },

    saveHistoryState() {
        if (this.historyIndex < this.history.length - 1) this.history = this.history.slice(0, this.historyIndex + 1);
        const state = JSON.stringify(this.data.mods);
        if (this.history.length === 0 || this.history[this.history.length - 1] !== state) {
            this.history.push(state);
            this.historyIndex++;
            if (this.history.length > 50) { this.history.shift(); this.historyIndex--; }
        }
    },

    bindHistoryEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') {
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    this.data.mods = JSON.parse(this.history[this.historyIndex]);
                    this.triggerAutoSave(true); this.renderSidebar(); this.renderCanvas();
                }
            }
            if (e.ctrlKey && e.key === 'y') {
                if (this.historyIndex < this.history.length - 1) {
                    this.historyIndex++;
                    this.data.mods = JSON.parse(this.history[this.historyIndex]);
                    this.triggerAutoSave(true); this.renderSidebar(); this.renderCanvas();
                }
            }
        });
    },

    addMobToDatalist(mobName) {
        const datalist = document.getElementById('mob-list');
        if (!datalist) return;
        const exists = Array.from(datalist.options).some(opt => opt.value === mobName);
        if (!exists) { const opt = document.createElement('option'); opt.value = mobName; datalist.appendChild(opt); }
    },

    bindTopBarEvents() {
        document.getElementById('btn-toggle-titles').addEventListener('click', () => { document.body.classList.toggle('show-titles'); });
        const btnToggleSummary = document.getElementById('btn-toggle-summary-size');
        const summaryPanel = document.getElementById('rewards-summary');
        
        btnToggleSummary.addEventListener('click', () => {
            summaryPanel.classList.toggle('minimized');
            btnToggleSummary.innerText = summaryPanel.classList.contains('minimized') ? '▲' : '▼';
        });

        const fileInput = document.getElementById('bq-file-input');
        document.getElementById('btn-import-bq').addEventListener('click', () => { this.hideTooltip(); fileInput.click(); });
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => { BQ.parseData(event.target.result, this); fileInput.value = ''; };
            reader.readAsText(file);
        });

        document.getElementById('btn-cancel-import').addEventListener('click', () => {
            if (confirm('Отменить импорт? Все текущие незагруженные изменения пропадут.')) {
                this.isImportMode = false;
                this.data.mods = JSON.parse(JSON.stringify(this.originalData)); 
                this.activeModId = this.data.mods.length > 0 ? this.data.mods[0].id : null;
                document.getElementById('import-mode-bar').classList.add('hidden');
                document.body.classList.remove('import-mode');
                this.renderSidebar(); this.renderCanvas(); this.centerCanvas();
            }
        });

        document.getElementById('btn-apply-import').addEventListener('click', async () => {
            if (confirm('ВНИМАНИЕ! Это полностью перезапишет базу квестов. Вы уверены?')) {
                this.isImportMode = false;
                document.getElementById('import-mode-bar').classList.add('hidden');
                document.body.classList.remove('import-mode');
                await DB.saveQuestsSilent(this.data.mods);
                DB.logAction('Выполнил импорт базы BetterQuesting');
                alert('База успешно сохранена!');
            }
        });

        document.getElementById('btn-export-bq').addEventListener('click', () => { this.hideTooltip(); BQ.exportData(this.data.mods, this); });
    },

    triggerAutoSave(skipHistory = false) {
        if (!Auth.user || this.isImportMode) return; 
        if (!skipHistory) this.saveHistoryState();
        
        const indicator = document.getElementById('save-indicator');
        indicator.classList.remove('hidden'); 
        indicator.innerText = "Сохранение..."; 
        indicator.style.color = "#ffaa00";

        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            await DB.saveQuestsSilent(this.data.mods);
            indicator.innerText = "Сохранено ✔"; 
            indicator.style.color = "#55ff55";
            setTimeout(() => { indicator.classList.add('hidden'); }, 2000);
        }, 1500);
    },

    getActiveMod() { return this.data.mods.find(m => m.id === this.activeModId); },

    getTaskLabel(r) {
        const t = r.taskType || 'retrieval';
        let name = r.customName || (r.item ? r.item.name : 'Предмет');
        
        if (t === 'hunt') return `Убить: ${ItemsDB.formatMC(MOB_LIST[r.target] || r.target || name)}`;
        if (t === 'block_break') return `Сломать: ${ItemsDB.formatMC(name)}`;
        if (t === 'crafting') return `Создать: ${ItemsDB.formatMC(name)}`;
        if (t === 'fluid') return `Жидкость: ${ItemsDB.formatMC(BQ.FLUIDS[r.target] || r.target || name)}`;
        if (t === 'checkbox') return `Галочка (Прочтение)`;
        if (t === 'xp') return `Сдать опыт (Уровни)`;
        if (t === 'npc_dialog') return `Диалог с NPC (ID: ${r.dialogId})`;
        if (t === 'npc_faction') return `Репутация фракции (ID: ${r.factionId})`;
        if (t === 'npc_quest') return `Выполнить квест NPC (ID: ${r.questId})`;
        if (t === 'interact_entity') return `Взаимодействие: ${ItemsDB.formatMC(MOB_LIST[r.target] || r.target)}`;
        if (t === 'interact_item') return `Взаимодействие: ${ItemsDB.formatMC(name)}`;
        if (t === 'location') return `Найти локацию: ${r.name}`;
        if (t === 'meeting') return `Встретить: ${ItemsDB.formatMC(MOB_LIST[r.target] || r.target)}`;
        if (t === 'scoreboard') return `Очки: ${r.scoreDisp || r.scoreName}`;
        
        return ItemsDB.formatMC(name);
    },

    getRewardLabel(r) {
        const t = r.taskType || 'item';
        if (t === 'command') return `Команда: /${r.command || '...'}`;
        if (t === 'xp') return `Опыт (Уровни)`;
        if (t === 'npc_faction') return `Репутация фракции (ID: ${r.factionId})`;
        if (t === 'npc_mail') return `Письмо от: ${r.sender}`;
        if (t === 'scoreboard') return `Дать очки: ${r.scoreName}`;
        
        let name = r.customName || (r.item ? r.item.name : 'Награда');
        if (r.item && (r.item.string_id === 'bq_standard:loot_chest' || r.item.item_key === 'bq_standard:loot_chest')) {
            const tierName = this.lootGroups && this.lootGroups[r.damage] ? this.lootGroups[r.damage] : `Тир ${r.damage||0}`;
            return `🎁 Лутбокс [${tierName}]`;
        }
        return ItemsDB.formatMC(name);
    },

    // ДЕЛЕГИРОВАНИЕ ФУНКЦИЙ К ПОДМОДУЛЯМ
    renderSidebar() { EditorSidebar.renderSidebar(this); },
    renderCanvas(skipSave) { EditorCanvas.renderCanvas(this, skipSave); },
    centerCanvas() { EditorCanvas.centerCanvas(this); },
    updateTransform() { EditorCanvas.updateTransform(this); },
    updateSummary() { EditorCanvas.updateSummary(this); },
    hideTooltip() { EditorCanvas.hideTooltip(this); },
    
    openQuestModal(id) { EditorModals.openQuestModal(this, id); },
    openQuestViewModal(id) { EditorModals.openQuestViewModal(this, id); },
    openCommentModal(id) { EditorModals.openCommentModal(this, id); },
    renderQuestEditForm() { EditorModals.renderQuestEditForm(this); },
    copyQuest(id) { EditorModals.copyQuest(this, id); },
    deleteQuest(id) { EditorModals.deleteQuest(this, id); },

    openItemPicker(cb) { EditorPicker.openItemPicker(this, cb); }
};
