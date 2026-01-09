// CONFIGURAÇÃO DO FIREBASE ( Jefferson, use estas credenciais que você enviou )
const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

// Inicialização segura
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
let currentPhotoBase64 = "";

const app = {
    // COMPRESSOR DE IMAGENS (Resolve o erro de 1MB do Firebase)
    handleImage(input) {
        const file = input.files[0];
        if (!file) return;

        const btn = document.getElementById('btn-save-product');
        btn.disabled = true;
        btn.innerText = "Processando Foto...";

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400; // Miniatura otimizada
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Qualidade 0.5 para garantir que o arquivo fique minúsculo
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.5);
                
                btn.disabled = false;
                btn.innerText = "Salvar Produto";
                console.log("Imagem pronta.");
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    init() {
        console.log("Conectando ao banco de dados...");
        // Escuta os produtos e ordena por nome
        db.collection('produtos').orderBy('name', 'asc').onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            this.renderProducts(list);
        }, err => console.error("Erro Firebase:", err));
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
                    <td><span class="badge">${item.category}</span></td>
                    <td><h2 style="color:#2563eb">${item.qty || 0}</h2></td>
                    <td>
                        <div class="action-group">
                            <button class="btn-in" onclick="ui.openMove('${item.id}', '${item.name}', 'ENTRADA')">Entrada</button>
                            <button class="btn-out" onclick="ui.openMove('${item.id}', '${item.name}', 'SAIDA')">Saída</button>
                            <button class="btn-log" onclick="app.showHistory('${item.id}')">📜</button>
                            <button class="btn-delete" onclick="app.deleteProduct('${item.id}')">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    },

    async addProduct(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-save-product');
        btn.disabled = true;

        const data = {
            name: document.getElementById('p-name').value.trim(),
            category: document.getElementById('p-category').value.trim(),
            photo: currentPhotoBase64,
            qty: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection('produtos').add(data);
            currentPhotoBase64 = ""; 
            ui.closeModal('product');
            alert("Sucesso: Produto cadastrado!");
        } catch (err) {
            alert("Erro ao cadastrar: " + err.message);
        } finally {
            btn.disabled = false;
        }
    },

    async processMove(e) {
        e.preventDefault();
        const pid = document.getElementById('move-product-id').value;
        const type = document.getElementById('move-type').value;
        const qtyMove = parseInt(document.getElementById('move-qty').value);
        
        const sector = type === 'ENTRADA' ? "REPOSIÇÃO" : document.getElementById('move-sector').value;
        const employee = type === 'ENTRADA' ? "SISTEMA" : document.getElementById('move-employee').value;

        if (type === 'SAIDA' && (!sector || !employee)) {
            return alert("Informe o Setor e o Colaborador para saídas!");
        }

        try {
            const productRef = db.collection('produtos').doc(pid);
            const doc = await productRef.get();
            const currentQty = doc.data().qty || 0;
            const newQty = type === 'ENTRADA' ? currentQty + qtyMove : currentQty - qtyMove;
            
            if (newQty < 0) return alert("Erro: Saldo insuficiente!");

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
        const content = document.getElementById('history-content');
        content.innerHTML = 'Buscando logs...';
        ui.openModal('history');

        try {
            const logs = await db.collection('historico')
                .where('productId', '==', pid)
                .orderBy('timestamp', 'desc').get();

            content.innerHTML = '';
            logs.forEach(doc => {
                const d = doc.data();
                const date = d.timestamp ? d.timestamp.toDate().toLocaleString('pt-BR') : 'Agora';
                content.innerHTML += `
                    <div class="log-item">
                        <strong>${d.type === 'ENTRADA' ? '📥 ENTRADA' : '📤 SAÍDA'} (${d.qty} un)</strong>
                        <br><small>${date}</small>
                        <div style="font-size:12px; color: #666">Setor: ${d.sector} | Resp: ${d.employee}</div>
                    </div>
                `;
            });
            if (logs.empty) content.innerHTML = '<p style="padding:20px">Sem histórico.</p>';
        } catch (err) {
            content.innerHTML = 'Erro ao carregar: ' + err.message;
        }
    },

    async deleteProduct(id) {
        if (confirm("Excluir este item permanentemente?")) {
            await db.collection('produtos').doc(id).delete();
        }
    }
};

const ui = {
    openModal(id) { 
        document.getElementById(`modal-${id}`).classList.remove('hidden'); 
    },
    closeModal(id) { 
        document.getElementById(`modal-${id}`).classList.add('hidden');
        const form = document.querySelector(`#modal-${id} form`);
        if(form) form.reset();
    },
    openMove(id, name, type) {
        document.getElementById('move-product-id').value = id;
        document.getElementById('move-type').value = type;
        document.getElementById('move-title').innerText = type === 'ENTRADA' ? `Entrada: ${name}` : `Saída: ${name}`;
        
        const extra = document.getElementById('extra-fields');
        const btn = document.getElementById('btn-confirm-move');

        if (type === 'ENTRADA') {
            extra.classList.add('hidden');
            btn.style.background = "#10b981";
        } else {
            extra.classList.remove('hidden');
            btn.style.background = "#f59e0b";
        }
        this.openModal('move');
    }
};

// VINCULAÇÃO DOS EVENTOS (Garante que o botão funcione)
document.addEventListener('DOMContentLoaded', () => {
    const fProd = document.getElementById('form-product');
    const fMove = document.getElementById('form-move');

    if (fProd) fProd.addEventListener('submit', (e) => app.addProduct(e));
    if (fMove) fMove.addEventListener('submit', (e) => app.processMove(e));
    
    app.init();
});