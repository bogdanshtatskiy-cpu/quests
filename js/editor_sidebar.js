import { ItemsDB } from './items.js';
import { DB } from './db.js';
import { Auth } from './auth.js';

export const EditorSidebar = {
    init(editor) {
        this.bindModModalEvents(editor);
        
        // Кнопка сворачивания сайдбара
        document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });
    },

    bindModModalEvents(editor) {
        const modal = document.getElementById('add-mod-modal');

        document.getElementById('btn-add-mod').addEventListener('click', () => {
            editor.hideTooltip();
            editor.editingModId = null; 
            editor.tempModIcon = null;
            document.getElementById('new-mod-name').value = '';
            document.getElementById('mod-icon-preview').innerHTML = '';
            document.getElementById('mod-modal-title').innerText = 'Новая ветка';
            modal.classList.remove('hidden');
        });

        document.getElementById('btn-close-mod').addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        document.getElementById('btn-select-mod-icon').addEventListener('click', () => {
            editor.openItemPicker((item) => {
                editor.tempModIcon = item.image;
                document.getElementById('mod-icon-preview').innerHTML = `<div class="mc-slot"><img src="${ItemsDB.getImageUrl(item.image)}" width="32" height="32"></div>`;
            });
        });

        document.getElementById('btn-save-mod').addEventListener('click', () => {
            const name = document.getElementById('new-mod-name').value;
            if (!name || !editor.tempModIcon) return alert('Введите название и выберите иконку!');
            
            if (editor.editingModId) {
                const mod = editor.data.mods.find(m => m.id === editor.editingModId);
                mod.name = name; 
                mod.icon = editor.tempModIcon;
                DB.logAction(`Изменил ветку: ${name}`);
            } else {
                const id = 'mod_' + Date.now();
                editor.data.mods.push({ id, name, icon: editor.tempModIcon, quests: [] });
                editor.activeModId = id;
                DB.logAction(`Создал ветку: ${name}`);
            }
            
            editor.triggerAutoSave();
            modal.classList.add('hidden');
            editor.renderSidebar(); 
            editor.renderCanvas();
        });
    },

    renderSidebar(editor) {
        const list = document.getElementById('mod-list');
        list.innerHTML = '';
        
        let draggedIndex = null;
        let draggedLi = null;

        const fragment = document.createDocumentFragment(); 

        editor.data.mods.forEach((mod, index) => {
            const li = document.createElement('li');
            li.className = 'mod-item';
            if (editor.activeModId === mod.id) {
                li.classList.add('active');
            }
            
            li.innerHTML = `
                <div class="mod-item-content">
                    <img src="${ItemsDB.getImageUrl(mod.icon)}" width="24" height="24" loading="lazy">
                    <span>${ItemsDB.formatMC(mod.name)}</span>
                </div>
                <div class="mod-item-actions admin-only">
                    <button class="mod-btn edit" title="Редактировать">✏️</button>
                    <button class="mod-btn delete" title="Удалить">❌</button>
                </div>
            `;
            
            li.querySelector('.mod-item-content').addEventListener('click', () => {
                editor.activeModId = mod.id;
                editor.renderSidebar(); 
                editor.renderCanvas(); 
                editor.centerCanvas(); 
            });

            if (Auth.user) {
                li.draggable = true;

                li.addEventListener('dragstart', (e) => {
                    draggedLi = li; 
                    draggedIndex = index; 
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => li.style.opacity = '0.5', 0); 
                });

                li.addEventListener('dragover', (e) => {
                    e.preventDefault(); 
                    if (draggedIndex === index) return;
                    const rect = li.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) { 
                        li.classList.add('drag-top'); 
                        li.classList.remove('drag-bottom'); 
                    } else { 
                        li.classList.add('drag-bottom'); 
                        li.classList.remove('drag-top'); 
                    }
                });

                li.addEventListener('dragleave', () => {
                    li.classList.remove('drag-top', 'drag-bottom');
                });
                
                li.addEventListener('dragend', () => {
                    if (draggedLi) draggedLi.style.opacity = '1';
                    document.querySelectorAll('.mod-item').forEach(el => el.classList.remove('drag-top', 'drag-bottom'));
                });

                li.addEventListener('drop', (e) => {
                    e.preventDefault(); 
                    li.classList.remove('drag-top', 'drag-bottom');
                    if (draggedIndex === index || draggedIndex === null) return;

                    const rect = li.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    let newIndex = index;
                    if (e.clientY > midY) newIndex++;
                    if (draggedIndex < newIndex) newIndex--;

                    const movedItem = editor.data.mods.splice(draggedIndex, 1)[0];
                    editor.data.mods.splice(newIndex, 0, movedItem);

                    DB.logAction(`Изменил порядок веток: ${movedItem.name}`);
                    editor.triggerAutoSave();
                    editor.renderSidebar();
                });

                li.querySelector('.edit').addEventListener('click', (e) => {
                    e.stopPropagation();
                    editor.editingModId = mod.id; 
                    editor.tempModIcon = mod.icon;
                    document.getElementById('new-mod-name').value = mod.name;
                    document.getElementById('mod-icon-preview').innerHTML = `<div class="mc-slot"><img src="${ItemsDB.getImageUrl(mod.icon)}" width="32" height="32"></div>`;
                    document.getElementById('mod-modal-title').innerText = 'Редактировать ветку';
                    document.getElementById('add-mod-modal').classList.remove('hidden');
                });

                li.querySelector('.delete').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Удалить ветку "${mod.name}" со всеми квестами?`)) {
                        editor.data.mods = editor.data.mods.filter(m => m.id !== mod.id);
                        if (editor.activeModId === mod.id) editor.activeModId = null;
                        DB.logAction(`Удалил ветку: ${mod.name}`);
                        editor.triggerAutoSave();
                        editor.renderSidebar(); 
                        editor.renderCanvas();
                    }
                });
            }
            fragment.appendChild(li);
        });
        
        list.appendChild(fragment); 
    }
};
