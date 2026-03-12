import { ItemsDB } from './items.js';
import { Auth } from './auth.js';
import { DB } from './db.js';
import { Editor } from './editor.js';
import { LootEditor } from './loot.js';

// Глобальное состояние приложения (Профили/Воркспейсы)
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
    
    // 1. Инициализация UI
    Auth.init();
    Editor.init();
    LootEditor.init(); 
    
    // 2. Убираем черный экран блокировки
    loader.classList.add('hidden');
    setTimeout(() => {
        loader.style.display = 'none';
    }, 500);

    // 3. Настраиваем список Профилей
    const wsSelect = document.getElementById('workspace-select');
    
    const renderWsSelect = () => {
        wsSelect.innerHTML = '';
        AppState.workspaces.forEach(ws => {
            const option = document.createElement('option');
            option.value = ws;
            option.innerText = ws;
            if (ws === AppState.activeWorkspace) {
                option.selected = true;
            }
            wsSelect.appendChild(option);
        });
    };
    
    renderWsSelect();
    DB.currentWorkspace = AppState.activeWorkspace; 

    // Показываем фоновый статус
    indicator.classList.remove('hidden');
    indicator.style.color = "#ffaa00";
    indicator.innerText = "⏳ Синхронизация данных...";

    // 4. ПАРАЛЛЕЛЬНАЯ ЗАГРУЗКА
    const loadItemsTask = ItemsDB.load().then(async () => {
        const customItems = await DB.loadCustomItems();
        ItemsDB.addCustomItems(customItems);
    });

    const loadQuestsTask = DB.loadQuests();

    Promise.all([loadItemsTask, loadQuestsTask]).then(([_, savedQuests]) => {
        if (savedQuests && savedQuests.length > 0) {
            // Восстановление старых форматов
            savedQuests.forEach(mod => {
                mod.quests.forEach(q => {
                    if (q.req && !q.reqs) q.reqs = [q.req];
                    if (!q.reqs) q.reqs = [];
                    if (!q.rewards) q.rewards = [];
                });
            });
            Editor.data.mods = savedQuests;
            Editor.activeModId = savedQuests[0].id; 
        } else {
            Editor.data.mods = [];
            Editor.activeModId = null;
        }
        
        Editor.renderSidebar();
        Editor.renderCanvas();
        Editor.centerCanvas();
        
        indicator.style.color = "#55ff55";
        indicator.innerText = "✔ Готово!";
        setTimeout(() => {
            indicator.classList.add('hidden');
        }, 2000);
    }).catch(err => {
        console.error("Ошибка при загрузке данных:", err);
        indicator.style.color = "#ff5555";
        indicator.innerText = "❌ Ошибка соединения";
    });

    // --- СОБЫТИЯ ПРОФИЛЕЙ ---
    
    wsSelect.addEventListener('change', async (e) => {
        AppState.activeWorkspace = e.target.value;
        AppState.saveWorkspaces();
        DB.currentWorkspace = AppState.activeWorkspace; 
        
        indicator.classList.remove('hidden');
        indicator.style.color = "#ffaa00";
        indicator.innerText = `⏳ Загрузка профиля: ${AppState.activeWorkspace}...`;

        const savedQuests = await DB.loadQuests();
        if (savedQuests && savedQuests.length > 0) {
            savedQuests.forEach(mod => {
                mod.quests.forEach(q => {
                    if (q.req && !q.reqs) q.reqs = [q.req];
                    if (!q.reqs) q.reqs = [];
                    if (!q.rewards) q.rewards = [];
                });
            });
            Editor.data.mods = savedQuests;
            Editor.activeModId = savedQuests[0].id; 
        } else {
            Editor.data.mods = [];
            Editor.activeModId = null;
        }
        
        Editor.renderSidebar();
        Editor.renderCanvas();
        Editor.centerCanvas();

        indicator.style.color = "#55ff55";
        indicator.innerText = "✔ Профиль загружен!";
        setTimeout(() => {
            indicator.classList.add('hidden');
        }, 2000);
    });

    document.getElementById('btn-add-workspace').addEventListener('click', () => {
        const name = prompt("Введите название нового профиля (например: Тестовый сервер):");
        if (name && name.trim() !== '') {
            if (AppState.workspaces.includes(name.trim())) {
                return alert("Такой профиль уже существует!");
            }
            AppState.workspaces.push(name.trim());
            AppState.activeWorkspace = name.trim();
            AppState.saveWorkspaces();
            renderWsSelect();
            wsSelect.dispatchEvent(new Event('change')); 
        }
    });

    document.getElementById('btn-delete-workspace').addEventListener('click', () => {
        if (AppState.workspaces.length <= 1) {
            return alert("Нельзя удалить единственный профиль!");
        }
        if (confirm(`Вы уверены, что хотите навсегда удалить профиль "${AppState.activeWorkspace}" и все его квесты?`)) {
            if(DB.deleteWorkspaceQuests) {
                DB.deleteWorkspaceQuests(AppState.activeWorkspace);
            }

            AppState.workspaces = AppState.workspaces.filter(ws => ws !== AppState.activeWorkspace);
            AppState.activeWorkspace = AppState.workspaces[0];
            AppState.saveWorkspaces();
            renderWsSelect();
            wsSelect.dispatchEvent(new Event('change'));
        }
    });

    // ==========================================
    // ЛОГИКА АДМИН-ПАНЕЛИ
    // ==========================================
    document.getElementById('btn-open-admin').addEventListener('click', async () => {
        document.getElementById('admin-modal').classList.remove('hidden');
        const logsContainer = document.getElementById('logs-tbody');
        logsContainer.innerHTML = '<tr><td colspan="3">Загрузка...</td></tr>';
        
        const logs = await DB.getLogs();
        logsContainer.innerHTML = '';
        
        logs.forEach(l => {
            let d = new Date(l.timestamp);
            if (isNaN(d.getTime())) d = new Date(); 
            
            const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second:'2-digit' });
            const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${date} ${time}</td>
                <td><b style="color:#55ffff;">${l.username}</b></td>
                <td>${l.action}</td>
            `;
            logsContainer.appendChild(tr);
        });
        
        renderUsersTable();
    });

    async function renderUsersTable() {
        const usersTbody = document.getElementById('users-tbody');
        usersTbody.innerHTML = '<tr><td colspan="2">Загрузка...</td></tr>';
        
        const users = await DB.getUsers();
        usersTbody.innerHTML = '';
        
        users.forEach(u => {
            const tr = document.createElement('tr');
            if(u.toLowerCase() === 'desoope') {
                tr.innerHTML = `<td><b style="color:#ffaa00;">${u} (Создатель)</b></td><td>-</td>`;
            } else {
                tr.innerHTML = `
                    <td>${u}</td>
                    <td>
                        <button class="mc-button danger btn-delete-user" data-user="${u}" style="font-size:12px; padding:2px 5px;">Удалить</button>
                    </td>
                `;
            }
            usersTbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const login = e.target.getAttribute('data-user');
                if (confirm(`Запретить доступ пользователю ${login}?`)) {
                    await DB.removeUser(login);
                    renderUsersTable(); 
                }
            });
        });
    }

    document.getElementById('btn-close-admin').addEventListener('click', () => {
        document.getElementById('admin-modal').classList.add('hidden');
    });

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
