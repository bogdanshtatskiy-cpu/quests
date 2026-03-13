import { ItemsDB } from './items.js';
import { DB } from './db.js';

export const EditorPicker = {
    init(editor) {
        this.bindItemPickerEvents(editor);
    },

    bindItemPickerEvents(editor) {
        const modal = document.getElementById('item-picker-modal');
        const filterMod = document.getElementById('picker-mod-filter');
        const searchInp = document.getElementById('picker-search');
        
        const resultsContainer = document.getElementById('picker-results');
        const favContainer = document.getElementById('picker-fav-results');
        const lootContainer = document.getElementById('picker-loot-results');

        let currentSearchData = [];
        let itemsLimit = 50;

        const createItemElement = (item, isLootbox = false) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            
            if (isLootbox) {
                div.innerHTML = `<img src="${ItemsDB.getImageUrl(item.image)}" width="32" height="32" loading="lazy"><span>🎁 ${item.name} <small style="color:#888;">[Лутбокс]</small></span>`;
            } else {
                const isFav = ItemsDB.favorites.includes(item.item_key);
                div.innerHTML = `<span class="fav-star ${isFav ? 'active' : ''}" data-key="${item.item_key}">★</span><img src="${ItemsDB.getImageUrl(item.image)}" width="32" height="32" loading="lazy"><span>${ItemsDB.formatMC(item.name)} <small style="color:#888;">[${item.mod}]</small></span>`;
                
                div.querySelector('.fav-star').addEventListener('click', (e) => { 
                    e.stopPropagation(); 
                    ItemsDB.toggleFavorite(item.item_key); 
                    updateBothLists(); 
                });
            }
            
            div.addEventListener('click', () => { 
                modal.classList.add('hidden'); 
                if (editor.pickerCallback) editor.pickerCallback(item); 
            });
            return div;
        };

        const renderMainResults = () => {
            resultsContainer.innerHTML = '';
            const fragment = document.createDocumentFragment(); 
            currentSearchData.slice(0, itemsLimit).forEach(item => {
                fragment.appendChild(createItemElement(item));
            });
            resultsContainer.appendChild(fragment);
        };

        const renderFavResults = () => {
            favContainer.innerHTML = '';
            const fragment = document.createDocumentFragment();
            ItemsDB.getFavorites().forEach(item => {
                fragment.appendChild(createItemElement(item));
            });
            favContainer.appendChild(fragment);
        };

        const renderLootResults = () => {
            if (!lootContainer) return;
            lootContainer.innerHTML = '';
            
            if (Object.keys(editor.lootGroups || {}).length === 0) {
                lootContainer.innerHTML = '<div style="padding:10px; color:#666; font-size:14px; text-align:center;">База лутбоксов не загружена</div>';
                return;
            }

            const fragment = document.createDocumentFragment();
            Object.entries(editor.lootGroups).forEach(([id, name]) => {
                const mockLootItem = {
                    item_key: 'bq_standard:loot_chest',
                    string_id: 'bq_standard:loot_chest',
                    name: name,
                    image: 'chest.png',
                    damage: parseInt(id),
                    mod: 'Лутбоксы'
                };
                fragment.appendChild(createItemElement(mockLootItem, true));
            });
            lootContainer.appendChild(fragment);
        };

        const updateBothLists = () => {
            renderMainResults();
            renderFavResults();
            renderLootResults();
        };

        const triggerSearch = () => {
            currentSearchData = ItemsDB.search(searchInp.value, filterMod.value);
            itemsLimit = 50; 
            resultsContainer.scrollTop = 0;
            updateBothLists();
        };

        searchInp.addEventListener('input', triggerSearch);
        filterMod.addEventListener('change', triggerSearch);
        
        resultsContainer.addEventListener('scroll', () => {
            if (resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - 20) {
                if (itemsLimit < currentSearchData.length) {
                    itemsLimit += 50;
                    renderMainResults();
                }
            }
        });

        document.getElementById('btn-picker-cancel').addEventListener('click', () => modal.classList.add('hidden'));

        document.getElementById('btn-upload-custom-item').addEventListener('click', () => {
            const fileInput = document.getElementById('custom-item-file');
            const nameInput = document.getElementById('custom-item-name');
            const file = fileInput.files[0];
            const name = nameInput.value.trim();

            if (!file) return alert("Выберите картинку!");
            if (!name) return alert("Введите название предмета!");

            alert("Внимание: Свои картинки отображаются только в веб-редакторе! Сама игра Minecraft не умеет скачивать картинки из интернета.");

            const btn = document.getElementById('btn-upload-custom-item');
            btn.innerText = "Грузим...";
            btn.disabled = true;

            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = async function() {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 64; 
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                    } else {
                        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const base64String = canvas.toDataURL('image/png');
                    const newItem = await DB.saveCustomItem(name, base64String);

                    btn.innerText = "Добавить";
                    btn.disabled = false;
                    fileInput.value = '';
                    nameInput.value = '';

                    if (newItem) {
                        ItemsDB.addCustomItems([newItem]);
                        searchInp.value = name;
                        triggerSearch(); 
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    openItemPicker(editor, cb) {
        editor.hideTooltip();
        editor.pickerCallback = cb;
        
        const filterMod = document.getElementById('picker-mod-filter');
        const searchInp = document.getElementById('picker-search');
        
        if (filterMod.options.length <= 1) {
            filterMod.innerHTML = '<option value="">Все моды</option>';
            ItemsDB.mods.forEach(m => {
                filterMod.innerHTML += `<option value="${m}">${m}</option>`;
            });
        }
        
        searchInp.value = '';
        searchInp.dispatchEvent(new Event('input'));
        
        document.getElementById('item-picker-modal').classList.remove('hidden');
        setTimeout(() => searchInp.focus(), 50); 
    }
};
