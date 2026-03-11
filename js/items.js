export const ItemsDB = {
    items: [], mods: [],
    favorites: JSON.parse(localStorage.getItem('quest_favorites') || '[]'),

    async load() {
        try {
            const response = await fetch('./database.json');
            this.items = await response.json();
            this.updateModsList();
        } catch (error) {
            console.error('Ошибка загрузки базы:', error);
        }
    },

    addCustomItems(customItemsArray) {
        if (customItemsArray && customItemsArray.length > 0) {
            this.items = [...this.items, ...customItemsArray];
            this.updateModsList();
        }
    },

    updateModsList() {
        const modsSet = new Set();
        this.items.forEach(item => modsSet.add(item.mod));
        this.mods = Array.from(modsSet).sort();
    },

    search(query, modFilter = '') {
        let results = this.items;
        if (modFilter) results = results.filter(item => item.mod === modFilter);
        if (query) {
            const lowerQuery = query.toLowerCase();
            results = results.filter(item => 
                item.name.toLowerCase().includes(lowerQuery) || 
                item.item_key.toLowerCase().includes(lowerQuery) ||
                (item.string_id && item.string_id.toLowerCase().includes(lowerQuery))
            );
        }
        results.sort((a, b) => (a.item_id === b.item_id) ? a.damage - b.damage : a.item_id - b.item_id);
        return results; 
    },

    // Улучшенный и агрессивный поиск (решает проблему с деньгами)
    findItemByBQ(bqId, damage) {
        let dmg = damage !== undefined ? damage : 0;
        let item;
        
        // 1. Ищем по string_id с учетом урона
        item = this.items.find(i => i.string_id === bqId && (i.damage == dmg || String(i.item_key).endsWith(':' + dmg)));
        
        // 2. Если не нашли, ищем ПРОСТО по string_id (игнорируя урон - именно это спасет деньги)
        if (!item) item = this.items.find(i => i.string_id === bqId);
        
        // 3. Старый поиск по ключам
        if (!item) item = this.items.find(i => i.item_key === `${bqId}:${dmg}`);
        if (!item) item = this.items.find(i => i.item_key === bqId || i.item_id == bqId);
        
        // 4. Поиск по имени на крайний случай
        if (!item) item = this.items.find(i => i.name === bqId);
        
        if (!item) {
            return {
                item_key: `${bqId}:${dmg}`,
                name: bqId,
                image: '', 
                mod: 'Импортировано (Нет в базе)',
                string_id: bqId
            };
        }
        return item;
    },

    getFavorites() { return this.items.filter(item => this.favorites.includes(item.item_key)); },

    toggleFavorite(itemKey) {
        const index = this.favorites.indexOf(itemKey);
        if (index > -1) this.favorites.splice(index, 1);
        else this.favorites.push(itemKey);
        localStorage.setItem('quest_favorites', JSON.stringify(this.favorites));
    },

    getImageUrl(imagePath) {
        if (!imagePath) return '';
        if (imagePath.startsWith('http') || imagePath.startsWith('data:')) return imagePath;
        return `./icons/${imagePath}`;
    },

    formatMC(str) {
        if (!str) return '';
        const colorCodes = {
            '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA', '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
            '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF', 'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF'
        };
        let html = ''; let spans = 0; let parts = str.split(/([&§][0-9a-fk-or])/i);
        for (let part of parts) {
            if (/^[&§][0-9a-fk-or]$/i.test(part)) {
                let code = part[1].toLowerCase();
                if (colorCodes[code]) { html += `<span style="color: ${colorCodes[code]}">`; spans++; } 
                else if (code === 'r') { html += '</span>'.repeat(spans); spans = 0; }
            } else { html += part; }
        }
        html += '</span>'.repeat(spans);
        return html;
    }
};
