// CONFIGURAÇÃO DO SEU PROJETO
const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

// Inicialização correta para Scripts simples (Compat Mode)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

let currentPhotoBase64 = "";

const app = {
    // Processa a imagem selecionada pelo colaborador
    handleImage(input) {
        const file = input.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => { 
                currentPhotoBase64 = reader.result;
                console.log("Foto processada com sucesso");
            };
            reader.readAsDataURL(file);
        }
    },

    init() {
        console.log("Sistema LogMaster Iniciado...");
        // Escuta os produtos em tempo real
        db.collection('produtos').orderBy('name').onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => list.push({id: doc.id, ...doc.data()}));
            this.renderProducts(list);
        }, err => console.error("Erro no Snapshot:", err));
    },

    renderProducts(items) {
        const tbody = document.getElementById('stock-list');
        if (!tbody) return;
        tbody.innerHTML = '';
        items.forEach(item => {
            tbody.innerHTML += `
                <tr>
                    <td><img src="${item.photo || 'https://via.placeholder.com/50'}" class="img-thumb"></td>
                    <td><strong>${item.name}</strong></td>
                    <td>${item.category}</td>
                    <td><h2 style="color:var(--primary)">${item.qty || 0}</h2></td>
                    <td>
                        <button class="btn-action" onclick="ui.openMove('${item.id}', '${item.name}')">📦 Mover</button>
                        <button class="btn-action" onclick="app.showHistory('${item.id}')">📜 Log</button>
                        <button class="btn-action" onclick="app.deleteProduct('${item.id}')" style="color:#ef4444">🗑️</button>
                    </td>
                </tr>
            `;
        });
    },

    async addProduct(e) {
        e.preventDefault();
        console.log("Tentando cadastrar produto...");
        
        const data = {
            name: document.getElementById('p-name').value,
            category: document.getElementById('p-category').value,
            photo: currentPhotoBase64 || document.getElementById('p-photo').value || "",
            qty: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection('produtos').add(data);
            ui.closeModal('product');
            currentPhotoBase64 = ""; // Limpa a foto para o próximo
            alert("Produto cadastrado com sucesso!");
        } catch (err) {
            console.error("Erro ao adicionar:", err);
            alert("Erro ao salvar no banco: " + err.message);
        }
    },

    async processMove(e) {
        e.preventDefault();
        const pid = document.getElementById('move-product-id').value;
        const type = document.getElementById('move-type').value;
        const qtyMove = parseInt(document.getElementById('move-qty').value);
        const sector = document.getElementById('move-sector').value;
        const employee = document.getElementById('move-employee').value;

        try {
            const productRef = db.collection('produtos').doc(pid);
            const doc = await productRef.get();
            const currentQty = doc.data().qty || 0;
            
            let newQty = type === 'ENTRADA' ? currentQty + qtyMove : currentQty - qtyMove;
            
            if (newQty < 0) return alert("Saldo insuficiente!");

            await productRef.update({ qty: newQty });

            await db.collection('historico').add({
                productId: pid,
                productName: doc.data().name,
                type,
                qty: qtyMove,
                sector,
                employee,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            ui.closeModal('move');
        } catch (err) {
            alert("Erro na movimentação: " + err.message);
        }
    },

    async showHistory(pid) {
        const historyContent = document.getElementById('history-content');
        historyContent.innerHTML = 'Carregando logs...';
        ui.openModal('history');

        try {
            const logs = await db.collection('historico')
                .where('productId', '==', pid)
                .orderBy('timestamp', 'desc')
                .get();

            historyContent.innerHTML = '';
            logs.forEach(doc => {
                const data = doc.data();
                const date = data.timestamp ? data.timestamp.toDate().toLocaleString('pt-BR') : 'Agora';
                historyContent.innerHTML += `
                    <div class="log-item">
                        <div class="log-header">
                            <span class="${data.type === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${data.type} de ${data.qty} un.</span>
                            <small>${date}</small>
                        </div>
                        <div>Setor: <strong>${data.sector}</strong> | Por: <strong>${data.employee}</strong></div>
                    </div>
                `;
            });
            if (logs.empty) historyContent.innerHTML = '<p style="padding:20px">Sem movimentações.</p>';
        } catch (err) {
            historyContent.innerHTML = 'Erro ao carregar histórico: ' + err.message;
        }
    },

    async deleteProduct(id) {
        if(confirm("Deseja excluir permanentemente?")) {
            await db.collection('produtos').doc(id).delete();
        }
    }
};

const ui = {
    openModal(id) { 
        const m = document.getElementById(`modal-${id}`);
        if(m) m.classList.remove('hidden'); 
    },
    closeModal(id) { 
        const m = document.getElementById(`modal-${id}`);
        if(m) {
            m.classList.add('hidden');
            const form = m.querySelector('form');
            if(form) form.reset();
        }
    },
    openMove(id, name) {
        document.getElementById('move-product-id').value = id;
        document.getElementById('move-title').innerText = `Movimentar: ${name}`;
        this.openModal('move');
    }
};

// Listeners Globais
document.addEventListener('DOMContentLoaded', () => {
    const formProduct = document.getElementById('form-product');
    const formMove = document.getElementById('form-move');

    if(formProduct) formProduct.addEventListener('submit', (e) => app.addProduct(e));
    if(formMove) formMove.addEventListener('submit', (e) => app.processMove(e));
    
    app.init();
});