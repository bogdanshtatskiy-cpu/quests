// js/items.js
export const ItemsDB = {
    items: [],

    async load() {
        try {
            // Загружаем файл из корня репозитория GitHub Pages
            const response = await fetch('./database.json');
            this.items = await response.json();
            console.log(`Загружено ${this.items.length} предметов из базы.`);
        } catch (error) {
            console.error('Ошибка загрузки базы предметов:', error);
        }
    },

    search(query) {
        if (!query) return [];
        const lowerQuery = query.toLowerCase();
        // Ищем по названию, моду или id
        return this.items.filter(item => 
            item.name.toLowerCase().includes(lowerQuery) || 
            item.mod.toLowerCase().includes(lowerQuery)
        ).slice(0, 50); // Отдаем только 50 результатов, чтобы браузер не завис
    },

    // Метод для получения правильного пути к картинке
    getImageUrl(imageName) {
        return `./icons/${imageName}`;
    }
};
