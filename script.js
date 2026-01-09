// ... (mantenha seu firebaseConfig e inicialização do db)

let currentPhotoBase64 = ""; // Variável global para a foto temporária

const app = {
    handleImage(input) {
        const file = input.files[0];
        if (!file) return;

        // Feedback visual: desativa o botão enquanto processa a imagem
        const btnSave = document.querySelector('#form-product .btn-primary');
        btnSave.disabled = true;
        btnSave.innerText = "Processando foto...";

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Redimensionamos para um tamanho padrão de miniatura
                const MAX_WIDTH = 400; 
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Comprimimos para 50% de qualidade para garantir que seja muito leve
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.5);
                
                console.log("Foto pronta e comprimida.");
                btnSave.disabled = false;
                btnSave.innerText = "Salvar";
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    async addProduct(e) {
        e.preventDefault();
        
        const btnSave = e.submitter; // Pega o botão que disparou o envio
        btnSave.disabled = true;
        btnSave.innerText = "Cadastrando...";

        const data = {
            name: document.getElementById('p-name').value,
            category: document.getElementById('p-category').value,
            photo: currentPhotoBase64 || "", // Se não tiver foto, salva vazio
            qty: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            // O Firestore gera um ID ÚNICO automaticamente aqui (.add)
            // Isso impede qualquer conflito de duplicidade
            await db.collection('produtos').add(data);
            
            // --- LIMPEZA CRUCIAL ---
            currentPhotoBase64 = ""; // Limpa a variável global
            document.getElementById('p-file').value = ""; // Limpa o campo de arquivo
            ui.closeModal('product');
            
            alert("Produto cadastrado com sucesso!");
        } catch (err) {
            console.error("Erro detalhado:", err);
            alert("Erro ao salvar: " + err.message);
        } finally {
            btnSave.disabled = false;
            btnSave.innerText = "Salvar";
        }
    },

    // ... (restante das funções: init, renderProducts, processMove)
};

// ... (restante do código: ui e listeners)