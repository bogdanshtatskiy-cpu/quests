import { ItemsDB } from './items.js';
import { Auth } from './auth.js';
import { DB } from './db.js';
import { Editor } from './editor.js';
import { LootEditor } from './loot.js';

export const AppState = {
    workspaces: JSON.parse(localStorage.getItem('bq_workspaces')) || ['Основной'],
    activeWorkspace: localStorage.getItem('bq_active_workspace') || 'Основной',
    saveWorkspaces() {
        localStorage.setItem('bq_workspaces', JSON.stringify(this.workspaces));
        localStorage.setItem('bq_active_workspace', this.activeWorkspace);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('global-loader');
    const indicator = document.getElementById('save-indicator');
    
    Auth.init();
    Editor.init();
    LootEditor.init(); 
    
    loader.classList.add('hidden');
    setTimeout(() => loader.style.display = 'none', 500);

    const wsSelect = document.getElementById('workspace-select');
    const renderWsSelect = () => {
        wsSelect.innerHTML = AppState.workspaces.map(ws => 
            `<option value="${ws}" ${ws === AppState.activeWorkspace ? 'selected' : ''}>${ws}</option>`
        ).join('');
    };
    renderWsSelect();
    DB.currentWorkspace = AppState.activeWorkspace; 

    // Загрузка
    const loadItemsTask = ItemsDB.load().then(async () => {
        const customItems = await DB.loadCustomItems();
        ItemsDB.addCustomItems(customItems);
    });
    const loadQuestsTask = DB.loadQuests();

    Promise.all([loadItemsTask, loadQuestsTask]).then(([_, savedQuests]) => {
        if (savedQuests && savedQuests.length > 0) {
            Editor.data.mods = savedQuests;
            Editor.activeModId = savedQuests[0].id; 
        }
        Editor.renderSidebar();
        Editor.renderCanvas();
        Editor.centerCanvas();
    });

    // Переключение профиля
    wsSelect.addEventListener('change', async (e) => {
        AppState.activeWorkspace = e.target.value;
        AppState.saveWorkspaces();
        DB.currentWorkspace = AppState.activeWorkspace;
        const savedQuests = await DB.loadQuests();
        Editor.data.mods = savedQuests || [];
        Editor.activeModId = savedQuests?.[0]?.id || null;
        Editor.renderSidebar();
        Editor.renderCanvas();
        Editor.centerCanvas();
    });

    // Добавление профиля
    document.getElementById('btn-add-workspace').addEventListener('click', () => {
        const name = prompt("Название нового профиля:");
        if (name && !AppState.workspaces.includes(name)) {
            AppState.workspaces.push(name);
            AppState.activeWorkspace = name;
            AppState.saveWorkspaces();
            renderWsSelect();
            wsSelect.dispatchEvent(new Event('change'));
        }
    });

    // Удаление профиля
    document.getElementById('btn-delete-workspace').addEventListener('click', () => {
        if (AppState.workspaces.length <= 1) return;
        if (confirm(`Удалить профиль "${AppState.activeWorkspace}"?`)) {
            DB.deleteWorkspaceQuests(AppState.activeWorkspace);
            AppState.workspaces = AppState.workspaces.filter(ws => ws !== AppState.activeWorkspace);
            AppState.activeWorkspace = AppState.workspaces[0];
            AppState.saveWorkspaces();
            renderWsSelect();
            wsSelect.dispatchEvent(new Event('change'));
        }
    });

    // Админ-панель
    document.getElementById('btn-open-admin').addEventListener('click', async () => {
        document.getElementById('admin-modal').classList.remove('hidden');
        const logs = await DB.getLogs();
        document.getElementById('logs-tbody').innerHTML = logs.map(l => `<tr><td>${l.timestamp}</td><td>${l.username}</td><td>${l.action}</td></tr>`).join('');
    });
    document.getElementById('btn-close-admin').addEventListener('click', () => document.getElementById('admin-modal').classList.add('hidden'));
});
