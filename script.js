const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let currentPhotoBase64 = "";

const app = {
    handleImage(input) {
        const file = input.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => { currentPhotoBase64 = reader.result; };
            reader.readAsDataURL(file);
        }
    },

    init() {
        db.collection('produtos').orderBy('name').onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => list.push({id: doc.id, ...doc.data()}));
            this.renderProducts(list);
        });
    },

    renderProducts(items) {
        const tbody = document.getElementById('stock-list');
        tbody.innerHTML = '';
        items.forEach(item => {
            tbody.innerHTML += `
                <tr>
                    <td><img src="${item.photo || 'https://via.placeholder.com/50'}" class="img-thumb"></td>
                    <td><strong>${item.name}</strong></td>
                    <td>${item.category}</td>
                    <td><h2 style="color:#2563eb">${item.qty || 0}</h2></td>
                    <td>
                        <div class="action-group">
                            <button class="btn-in" onclick="ui.openMove('${item.id}', '${item.name}', 'ENTRADA')">📥 Entrada</button>
                            <button class="btn-out" onclick="ui.openMove('${item.id}', '${item.name}', 'SAIDA')">📤 Saída</button>
                            <button class="btn-log" onclick="app.showHistory('${item.id}')">📜</button>
                            <button class="btn-icon" onclick="app.deleteProduct('${item.id}')" style="color:#ef4444">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    },

    async addProduct(e) {
        e.preventDefault();
        const data = {
            name: document.getElementById('p-name').value,
            category: document.getElementById('p-category').value,
            photo: currentPhotoBase64,
            qty: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('produtos').add(data);
        ui.closeModal('product');
        currentPhotoBase64 = "";
    },

    async processMove(e) {
        e.preventDefault();
        const pid = document.getElementById('move-product-id').value;
        const type = document.getElementById('move-type').value;
        const qtyMove = parseInt(document.getElementById('move-qty').value);
        
        // Dados opcionais para Entrada, obrigatórios para Saída
        const sector = document.getElementById('move-sector').value || "REPOSIÇÃO";
        const employee = document.getElementById('move-employee').value || "SISTEMA";

        if (type === 'SAIDA' && (!document.getElementById('move-sector').value || !document.getElementById('move-employee').value)) {
            return alert("Para saídas, o Setor e Colaborador são obrigatórios!");
        }

        try {
            const productRef = db.collection('produtos').doc(pid);
            const doc = await productRef.get();
            const currentQty = doc.data().qty || 0;
            const newQty = type === 'ENTRADA' ? currentQty + qtyMove : currentQty - qtyMove;
            
            if (newQty < 0) return alert("Saldo insuficiente!");

            await productRef.update({ qty: newQty });

            await db.collection('historico').add({
                productId: pid,
                type,
                qty: qtyMove,
                sector,
                employee,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            ui.closeModal('move');
        } catch (err) {
            alert("Erro: " + err.message);
        }
    },

    async showHistory(pid) {
        const historyContent = document.getElementById('history-content');
        historyContent.innerHTML = 'Carregando...';
        ui.openModal('history');

        const logs = await db.collection('historico')
            .where('productId', '==', pid)
            .orderBy('timestamp', 'desc').get();

        historyContent.innerHTML = '';
        logs.forEach(doc => {
            const d = doc.data();
            const date = d.timestamp ? d.timestamp.toDate().toLocaleString('pt-BR') : 'Agora';
            historyContent.innerHTML += `
                <div class="log-item">
                    <div class="log-header">
                        <span class="${d.type === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${d.type}: ${d.qty} un.</span>
                        <small>${date}</small>
                    </div>
                    <div style="font-size:12px">Setor: ${d.sector} | Resp: ${d.employee}</div>
                </div>
            `;
        });
    },

    async deleteProduct(id) {
        if(confirm("Excluir permanentemente?")) await db.collection('produtos').doc(id).delete();
    }
};

const ui = {
    openModal(id) { document.getElementById(`modal-${id}`).classList.remove('hidden'); },
    closeModal(id) { document.getElementById(`modal-${id}`).classList.add('hidden'); },
    
    openMove(id, name, type) {
        document.getElementById('move-product-id').value = id;
        document.getElementById('move-type').value = type;
        document.getElementById('move-title').innerText = type === 'ENTRADA' ? `Reposição: ${name}` : `Retirada: ${name}`;
        
        const extraFields = document.getElementById('extra-fields');
        const btn = document.getElementById('btn-confirm-move');

        if (type === 'ENTRADA') {
            extraFields.classList.add('hidden');
            btn.style.background = "#10b981";
        } else {
            extraFields.classList.remove('hidden');
            btn.style.background = "#f59e0b";
        }
        
        this.openModal('move');
    }
};

document.getElementById('form-product').addEventListener('submit', (e) => app.addProduct(e));
document.getElementById('form-move').addEventListener('submit', (e) => app.processMove(e));
app.init();