// js/items.js
export const ItemsDB = {
    items: [],
    mods: [],
    favorites: JSON.parse(localStorage.getItem('quest_favorites') || '[]'),

    async load() {
        try {
            const response = await fetch('./database.json');
            this.items = await response.json();
            
            // Собираем уникальные моды и сортируем алфавитно
            const modsSet = new Set();
            this.items.forEach(item => modsSet.add(item.mod));
            this.mods = Array.from(modsSet).sort();
            
            console.log(`Загружено ${this.items.length} предметов из базы.`);
        } catch (error) {
            console.error('Ошибка загрузки базы:', error);
        }
    },

    search(query, modFilter = '', favOnly = false) {
        let results = this.items;

        if (favOnly) {
            results = results.filter(item => this.favorites.includes(item.item_key));
        }
        if (modFilter) {
            results = results.filter(item => item.mod === modFilter);
        }
        if (query) {
            const lowerQuery = query.toLowerCase();
            results = results.filter(item => 
                item.name.toLowerCase().includes(lowerQuery) || 
                item.item_key.toLowerCase().includes(lowerQuery)
            );
        }
        
        // Сортировка по ID внутри результатов
        results.sort((a, b) => {
            if (a.item_id === b.item_id) return a.damage - b.damage;
            return a.item_id - b.item_id;
        });

        return results.slice(0, 100); // Отдаем 100 шт, чтобы не лагало
    },

    toggleFavorite(itemKey) {
        const index = this.favorites.indexOf(itemKey);
        if (index > -1) {
            this.favorites.splice(index, 1);
        } else {
            this.favorites.push(itemKey);
        }
        localStorage.setItem('quest_favorites', JSON.stringify(this.favorites));
    },

    getImageUrl(imageName) {
        return `./icons/${imageName}`;
    },

    // Конвертация кодов &6 и §6 в цветной HTML
    formatMC(str) {
        if (!str) return '';
        const colorCodes = {
            '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
            '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
            '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
            'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF'
        };
        
        let html = '';
        let spans = 0;
        let parts = str.split(/([&§][0-9a-fk-or])/i);
        
        for (let part of parts) {
            if (/^[&§][0-9a-fk-or]$/i.test(part)) {
                let code = part[1].toLowerCase();
                if (colorCodes[code]) {
                    html += `<span style="color: ${colorCodes[code]}">`;
                    spans++;
                } else if (code === 'r') {
                    html += '</span>'.repeat(spans);
                    spans = 0;
                }
            } else {
                html += part;
            }
        }
        html += '</span>'.repeat(spans);
        return html;
    }
};
