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
    
    Auth.init(); Editor.init(); LootEditor.init(); 
    
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

    indicator.classList.remove('hidden');
    indicator.style.color = "#ffaa00";
    indicator.innerText = "⏳ Синхронизация...";

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
        Editor.renderSidebar(); Editor.renderCanvas(); Editor.centerCanvas();
        indicator.style.color = "#55ff55"; indicator.innerText = "✔ Готово!";
        setTimeout(() => indicator.classList.add('hidden'), 2000);
    });

    wsSelect.addEventListener('change', async (e) => {
        AppState.activeWorkspace = e.target.value;
        AppState.saveWorkspaces();
        DB.currentWorkspace = AppState.activeWorkspace;
        indicator.classList.remove('hidden'); indicator.innerText = "⏳ Меняем профиль...";
        const savedQuests = await DB.loadQuests();
        Editor.data.mods = savedQuests || [];
        Editor.activeModId = savedQuests?.[0]?.id || null;
        Editor.renderSidebar(); Editor.renderCanvas(); Editor.centerCanvas();
        indicator.innerText = "✔ Профиль загружен";
        setTimeout(() => indicator.classList.add('hidden'), 1500);
    });

    document.getElementById('btn-add-workspace').addEventListener('click', () => {
        const name = prompt("Название нового профиля:");
        if (name && !AppState.workspaces.includes(name.trim())) {
            AppState.workspaces.push(name.trim());
            AppState.activeWorkspace = name.trim();
            AppState.saveWorkspaces(); renderWsSelect();
            wsSelect.dispatchEvent(new Event('change'));
        }
    });

    document.getElementById('btn-delete-workspace').addEventListener('click', () => {
        if (AppState.workspaces.length <= 1) return;
        if (confirm(`Удалить профиль "${AppState.activeWorkspace}"?`)) {
            DB.deleteWorkspaceQuests(AppState.activeWorkspace);
            AppState.workspaces = AppState.workspaces.filter(ws => ws !== AppState.activeWorkspace);
            AppState.activeWorkspace = AppState.workspaces[0];
            AppState.saveWorkspaces(); renderWsSelect();
            wsSelect.dispatchEvent(new Event('change'));
        }
    });

    document.getElementById('btn-open-admin').addEventListener('click', async () => {
        document.getElementById('admin-modal').classList.remove('hidden');
        const logsContainer = document.getElementById('logs-tbody');
        logsContainer.innerHTML = '<tr><td colspan="3">Загрузка...</td></tr>';
        const logs = await DB.getLogs();
        logsContainer.innerHTML = logs.map(l => {
            const d = new Date(l.timestamp);
            const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            return `<tr><td>${date} ${time}</td><td><b style="color:#55ffff;">${l.username}</b></td><td>${l.action}</td></tr>`;
        }).join('');
        renderUsersTable();
    });

    async function renderUsersTable() {
        const usersTbody = document.getElementById('users-tbody');
        usersTbody.innerHTML = '<tr><td colspan="2">Загрузка...</td></tr>';
        const users = await DB.getUsers();
        usersTbody.innerHTML = users.map(u => `<tr><td>${u === 'desoope' ? '<b style="color:#ffaa00;">'+u+' (Создатель)</b>' : u}</td><td>${u === 'desoope' ? '-' : '<button class="mc-button danger btn-delete-user" data-user="'+u+'" style="font-size:12px; padding:2px 5px;">Удалить</button>'}</td></tr>`).join('');
        document.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const login = e.target.getAttribute('data-user');
                if (confirm(`Удалить доступ для ${login}?`)) { await DB.removeUser(login); renderUsersTable(); }
            });
        });
    }

    document.getElementById('btn-close-admin').addEventListener('click', () => document.getElementById('admin-modal').classList.add('hidden'));
    document.getElementById('btn-create-user').addEventListener('click', () => {
        const login = document.getElementById('new-user-login').value;
        const pass = document.getElementById('new-user-pass').value;
        if (login && pass) {
            Auth.registerNewUser(login, pass).then(() => {
                document.getElementById('new-user-login').value = '';
                document.getElementById('new-user-pass').value = '';
                renderUsersTable();
            });
        }
    });
});
