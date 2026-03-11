import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { Auth } from './auth.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const DB = {
    async saveQuestsSilent(modsData) {
        if (!Auth.user) return;
        try { await setDoc(doc(db, "quests", "main"), { mods: modsData }); } catch (e) {}
    },

    async loadQuests() {
        try {
            const docSnap = await getDoc(doc(db, "quests", "main"));
            if (docSnap.exists()) return docSnap.data().mods;
            return [];
        } catch (e) { return []; }
    },

    async getUsers() {
        try {
            const docSnap = await getDoc(doc(db, "quests", "users_registry"));
            if (docSnap.exists()) return docSnap.data().users || [];
            return [];
        } catch (e) { return []; }
    },

    async addUser(login) {
        let users = await this.getUsers();
        if (!users.includes(login)) {
            users.push(login);
            await setDoc(doc(db, "quests", "users_registry"), { users });
        }
    },

    async removeUser(login) {
        let users = await this.getUsers();
        users = users.filter(u => u !== login);
        await setDoc(doc(db, "quests", "users_registry"), { users });
        this.logAction(`Отозвал доступ у пользователя: ${login}`);
    },

    async logAction(actionDesc) {
        if (!Auth.user) return;
        try {
            await addDoc(collection(db, "logs"), {
                username: Auth.user.username, action: actionDesc, timestamp: new Date().toISOString() 
            });
        } catch (e) {}
    },

    async getLogs() {
        if (!Auth.user) return [];
        const q = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        const logs = [];
        querySnapshot.forEach((doc) => logs.push(doc.data()));
        return logs;
    },

    async saveCustomItem(itemName, base64Image) {
        if (!Auth.user) return null;
        try {
            const newItem = {
                item_key: `custom_${Date.now()}`,
                name: itemName,
                image: base64Image,
                mod: "Custom (Свои)",
                item_id: 99999
            };

            await addDoc(collection(db, "custom_items"), newItem);
            this.logAction(`Добавил свою иконку: ${itemName}`);
            return newItem;
        } catch (e) {
            console.error("Ошибка сохранения иконки:", e);
            alert("Не удалось сохранить иконку в базу данных.");
            return null;
        }
    },

    async loadCustomItems() {
        try {
            const q = query(collection(db, "custom_items"));
            const snap = await getDocs(q);
            const items = [];
            snap.forEach(doc => items.push(doc.data()));
            return items;
        } catch (e) { return []; }
    }
};
