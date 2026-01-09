// CONFIGURAÇÃO DO SEU FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

// Inicialização (Modo Compatibilidade para rodar em qualquer navegador)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Variável global para armazenar a foto temporariamente antes do upload
let currentPhotoBase64 = "";

const app = {
    // 1. PROCESSADOR DE IMAGEM COM COMPRESSÃO
    handleImage(input) {
        const file = input.files[0];
        if (!file) return;

        const btnSave = document.querySelector('#form-product .btn-primary');
        btnSave.disabled = true;
        btnSave.innerText = "Processando foto...";

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Redimensiona para no máximo 400px de largura (ideal para miniaturas)
                const MAX_WIDTH = 400; 
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Converte para JPG com 50% de qualidade (Leve e rápido)
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.5);
                
                console.log("Foto comprimida e pronta para o banco.");
                btnSave.disabled = false;
                btnSave.innerText = "Salvar";
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    // 2. INICIALIZAÇÃO E SINCRONIZAÇÃO EM TEMPO REAL
    init() {
        console.log("LogMaster: Sincronizando com Niterói/Cloud...");
        
        // Escuta a coleção de produtos ordenada por nome
        db.collection('produtos').orderBy('name', 'asc').onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() });
            });
            this.renderProducts(list);
        }, err => {
            console.error("Erro no Firebase:", err);
            if (err.code === 'failed-precondition') {
                alert("Erro de Índice: Verifique o console (F12) para criar o índice necessário.");
            }
        });
    },

    // 3. RENDERIZAÇÃO DA TABELA
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
                            <button class="btn-in" onclick="ui.openMove('${item.id}', '${item.name}', 'ENTRADA')">📥 Entrada</button>
                            <button class="btn-out" onclick="ui.openMove('${item.id}', '${item.name}', 'SAIDA')">📤 Saída</button>
                            <button class="btn-log" title="Ver Histórico" onclick="app.showHistory('${item.id}')">📜</button>
                            <button class="btn-icon" title="Excluir" onclick="app.deleteProduct('${item.id}')" style="color:#ef4444; margin-left:10px">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    },

    // 4. CADASTRO DE NOVO PRODUTO
    async addProduct(e) {
        e.preventDefault();
        const btnSave = e.submitter;
        btnSave.disabled = true;

        const data = {
            name: document.getElementById('p-name').value.trim(),
            category: document.getElementById('p-category').value.trim(),
            photo: currentPhotoBase64, // Já comprimida pelo handleImage
            qty: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection('produtos').add(data);
            
            // LIMPANDO TUDO PARA O PRÓXIMO CADASTRO
            currentPhotoBase64 = ""; 
            document.getElementById('form-product').reset();
            ui.closeModal('product');
            alert("Produto cadastrado!");
        } catch (err) {
            console.error("Erro ao salvar:", err);
            alert("Erro: " + err.message);
        } finally {
            btnSave.disabled = false;
        }
    },

    // 5. MOVIMENTAÇÃO DE ESTOQUE (IN/OUT)
    async processMove(e) {
        e.preventDefault();
        const pid = document.getElementById('move-product-id').value;
        const type = document.getElementById('move-type').value;
        const qtyMove = parseInt(document.getElementById('move-qty').value);
        
        // Se for entrada, preenchemos com valores padrão
        const sector = type === 'ENTRADA' ? "REPOSIÇÃO" : document.getElementById('move-sector').value;
        const employee = type === 'ENTRADA' ? "SISTEMA" : document.getElementById('move-employee').value;

        if (type === 'SAIDA' && (!sector || !employee)) {
            return alert("Para saídas, o Setor e Colaborador são obrigatórios!");
        }

        try {
            const productRef = db.collection('produtos').doc(pid);
            const doc = await productRef.get();
            const currentQty = doc.data().qty || 0;
            
            let newQty = type === 'ENTRADA' ? currentQty + qtyMove : currentQty - qtyMove;
            
            if (newQty < 0) return alert("Saldo insuficiente!");

            // Atualiza Saldo e Grava Log simultaneamente
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

    // 6. EXIBIÇÃO DO LOG DE HISTÓRICO
    async showHistory(pid) {
        const historyContent = document.getElementById('history-content');
        historyContent.innerHTML = '<p style="padding:20px">Buscando logs...</p>';
        ui.openModal('history');

        try {
            const logs = await db.collection('historico')
                .where('productId', '==', pid)
                .orderBy('timestamp', 'desc')
                .limit(50) // Mostra as últimas 50 movimentações
                .get();

            historyContent.innerHTML = '';
            logs.forEach(doc => {
                const d = doc.data();
                const date = d.timestamp ? d.timestamp.toDate().toLocaleString('pt-BR') : 'Processando...';
                historyContent.innerHTML += `
                    <div class="log-item">
                        <div class="log-header">
                            <span class="${d.type === 'ENTRADA' ? 'badge-in' : 'badge-out'}">
                                ${d.type === 'ENTRADA' ? '📥 ENTRADA' : '📤 SAÍDA'} de ${d.qty} un.
                            </span>
                            <small>${date}</small>
                        </div>
                        <div style="margin-top:5px; color:#4b5563">
                            Setor: <strong>${d.sector}</strong> | Responsável: <strong>${d.employee}</strong>
                        </div>
                    </div>
                `;
            });

            if (logs.empty) {
                historyContent.innerHTML = '<p style="padding:20px; color:#999">Nenhuma movimentação para este produto.</p>';
            }
        } catch (err) {
            console.error(err);
            historyContent.innerHTML = '<p style="padding:20px; color:red">Erro ao carregar histórico: ' + err.message + '</p>';
        }
    },

    // 7. EXCLUSÃO
    async deleteProduct(id) {
        if (confirm("Deseja excluir este produto e todos os seus registros de histórico permanentemente?")) {
            try {
                await db.collection('produtos').doc(id).delete();
                // Opcional: Aqui você poderia deletar os logs também em um loop,
                // mas para apps simples, deletar o produto já resolve a visualização.
            } catch (err) {
                alert("Erro ao excluir: " + err.message);
            }
        }
    }
};

// --- FUNÇÕES DE INTERFACE (UI) ---
const ui = {
    openModal(id) {
        const modal = document.getElementById(`modal-${id}`);
        if (modal) modal.classList.remove('hidden');
    },
    closeModal(id) {
        const modal = document.getElementById(`modal-${id}`);
        if (modal) {
            modal.classList.add('hidden');
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    },
    openMove(id, name, type) {
        document.getElementById('move-product-id').value = id;
        document.getElementById('move-type').value = type;
        document.getElementById('move-title').innerText = type === 'ENTRADA' ? `Reposição: ${name}` : `Retirada: ${name}`;
        
        const extraFields = document.getElementById('extra-fields');
        const btn = document.getElementById('btn-confirm-move');

        if (type === 'ENTRADA') {
            extraFields.classList.add('hidden');
            btn.style.background = "#10b981"; // Verde
            btn.innerText = "Confirmar Entrada";
        } else {
            extraFields.classList.remove('hidden');
            btn.style.background = "#f59e0b"; // Laranja
            btn.innerText = "Confirmar Saída";
        }
        
        this.openModal('move');
    }
};

// --- LISTENERS DE INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    const formProduct = document.getElementById('form-product');
    const formMove = document.getElementById('form-move');

    if (formProduct) formProduct.addEventListener('submit', (e) => app.addProduct(e));
    if (formMove) formMove.addEventListener('submit', (e) => app.processMove(e));
    
    app.init();
});