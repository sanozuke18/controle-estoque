// Configuração que você forneceu
const firebaseConfig = {
    apiKey: "AIzaSyD37ZAe9afx70HjjiGQzxbUkrhtYSqVVms",
    authDomain: "estoque-master-ba8d3.firebaseapp.com",
    projectId: "estoque-master-ba8d3",
    storageBucket: "estoque-master-ba8d3.firebasestorage.app",
    messagingSenderId: "541199550434",
    appId: "1:541199550434:web:90083885daa8a9756fdbbb"
};

// Inicialização (Modo Compatibilidade para rodar direto no navegador)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const collectionRef = db.collection('produtos');

// Referências da Interface
const stockList = document.getElementById('stock-list');
const totalQtyEl = document.getElementById('total-qty');
const totalValueEl = document.getElementById('total-value');
const productForm = document.getElementById('product-form');

// --- Lógica de Sincronização em Tempo Real ---

// Esta função observa o banco de dados. Se alguém mudar algo em outro PC,
// sua tela atualiza sozinha sem refresh.
collectionRef.orderBy('updatedAt', 'desc').onSnapshot((snapshot) => {
    let items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    render(items);
}, (error) => {
    console.error("Erro ao sincronizar:", error);
    document.getElementById('sync-text').innerText = "Erro de Conexão";
    document.getElementById('sync-indicator').style.background = "red";
});

function render(items) {
    stockList.innerHTML = '';
    let globalQty = 0;
    let globalValue = 0;

    items.forEach(item => {
        const subtotal = item.qty * item.price;
        globalQty += Number(item.qty);
        globalValue += subtotal;

        const row = `
            <tr>
                <td><small>${item.code}</small></td>
                <td><strong>${item.name}</strong></td>
                <td><span class="badge">${item.category}</span></td>
                <td>${item.qty}</td>
                <td>R$ ${Number(item.price).toFixed(2)}</td>
                <td><strong>R$ ${subtotal.toFixed(2)}</strong></td>
                <td>
                    <button onclick="ui.editMode('${item.id}', '${item.code}', '${item.name}', '${item.category}', ${item.qty}, ${item.price})" class="btn-icon">📝</button>
                    <button onclick="actions.deleteItem('${item.id}')" class="btn-icon">🗑️</button>
                </td>
            </tr>
        `;
        stockList.innerHTML += row;
    });

    totalQtyEl.innerText = globalQty;
    totalValueEl.innerText = globalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- Ações de Banco de Dados ---

const actions = {
    async save(e) {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        
        const data = {
            code: document.getElementById('p-code').value,
            name: document.getElementById('p-name').value,
            category: document.getElementById('p-category').value,
            qty: parseInt(document.getElementById('p-qty').value),
            price: parseFloat(document.getElementById('p-price').value),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            if (id) {
                await collectionRef.doc(id).update(data);
            } else {
                await collectionRef.add(data);
            }
            ui.closeModal();
        } catch (err) {
            alert("Erro ao salvar dados. Verifique as Regras do Firestore.");
        }
    },

    async deleteItem(id) {
        if (confirm("Remover este produto permanentemente?")) {
            await collectionRef.doc(id).delete();
        }
    }
};

// --- Controle de Interface ---

const ui = {
    openModal() {
        document.getElementById('modal').classList.remove('hidden');
    },
    closeModal() {
        document.getElementById('modal').classList.add('hidden');
        productForm.reset();
        document.getElementById('edit-id').value = "";
        document.getElementById('modal-title').innerText = "Novo Produto";
    },
    editMode(id, code, name, cat, qty, price) {
        document.getElementById('edit-id').value = id;
        document.getElementById('p-code').value = code;
        document.getElementById('p-name').value = name;
        document.getElementById('p-category').value = cat;
        document.getElementById('p-qty').value = qty;
        document.getElementById('p-price').value = price;
        document.getElementById('modal-title').innerText = "Editar Produto";
        this.openModal();
    }
};

productForm.addEventListener('submit', actions.save);