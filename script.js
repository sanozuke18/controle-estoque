// Substitua pelo seu config do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentPhotoBase64 = "";

const app = {
    // Converte arquivo de imagem para Base64 para salvar no banco
    handleImage(input) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onloadend = () => { currentPhotoBase64 = reader.result; };
        if (file) reader.readAsDataURL(file);
    },

    init() {
        // Observer em tempo real para os produtos
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
                    <td><h2>${item.qty || 0}</h2></td>
                    <td>
                        <button class="btn-action" onclick="ui.openMove('${item.id}', '${item.name}')">📦 Mover</button>
                        <button class="btn-action" onclick="app.showHistory('${item.id}')">📜 Log</button>
                        <button class="btn-action" onclick="app.deleteProduct('${item.id}')" style="color:red">🗑️</button>
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
            photo: currentPhotoBase64 || document.getElementById('p-photo').value,
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
        const sector = document.getElementById('move-sector').value;
        const employee = document.getElementById('move-employee').value;

        const productRef = db.collection('produtos').doc(pid);
        const doc = await productRef.get();
        const currentQty = doc.data().qty || 0;
        
        let newQty = type === 'ENTRADA' ? currentQty + qtyMove : currentQty - qtyMove;
        
        if (newQty < 0) return alert("Saldo insuficiente para esta saída!");

        // 1. Atualiza Saldo
        await productRef.update({ qty: newQty });

        // 2. Registra Log
        await db.collection('historico').add({
            productId: pid,
            type,
            qty: qtyMove,
            sector,
            employee,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        ui.closeModal('move');
    },

    async showHistory(pid) {
        const historyContent = document.getElementById('history-content');
        historyContent.innerHTML = 'Carregando logs...';
        ui.openModal('history');

        const logs = await db.collection('historico')
            .where('productId', '==', pid)
            .orderBy('timestamp', 'desc')
            .get();

        historyContent.innerHTML = '';
        logs.forEach(doc => {
            const data = doc.data();
            const date = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Recent';
            historyContent.innerHTML += `
                <div class="log-item">
                    <div class="log-header">
                        <span class="${data.type === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${data.type} de ${data.qty} un.</span>
                        <small>${date}</small>
                    </div>
                    <div><strong>Local:</strong> ${data.sector} | <strong>Resp:</strong> ${data.employee}</div>
                </div>
            `;
        });
        if (logs.empty) historyContent.innerHTML = '<p style="padding:20px">Nenhuma movimentação registrada.</p>';
    },

    async deleteProduct(id) {
        if(confirm("Excluir produto e todo seu histórico?")) {
            await db.collection('produtos').doc(id).delete();
            // Opcional: deletar logs relacionados aqui
        }
    }
};

const ui = {
    openModal(id) { document.getElementById(`modal-${id}`).classList.remove('hidden'); },
    closeModal(id) { 
        document.getElementById(`modal-${id}`).classList.add('hidden');
        if(id !== 'history') document.querySelector(`#modal-${id} form`).reset();
    },
    openMove(id, name) {
        document.getElementById('move-product-id').value = id;
        document.getElementById('move-title').innerText = `Movimentar: ${name}`;
        this.openModal('move');
    }
};

document.getElementById('form-product').addEventListener('submit', (e) => app.addProduct(e));
document.getElementById('form-move').addEventListener('submit', (e) => app.processMove(e));

app.init();