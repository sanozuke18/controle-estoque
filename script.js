const app = {
    // NOVA FUNÇÃO: Redimensiona e comprima a foto antes de salvar
    handleImage(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Configura o tamanho máximo (ex: 400px de largura)
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400; 
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Converte para JPG com 60% de qualidade (fica bem leve!)
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.6);
                console.log("Foto comprimida com sucesso!");
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    init() {
        console.log("Sistema LogMaster Iniciado...");
        // Ordenamos por 'name' para evitar erro de índice se o createdAt demorar
        db.collection('produtos').orderBy('name').onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => list.push({id: doc.id, ...doc.data()}));
            this.renderProducts(list);
        }, err => {
            console.error("Erro no Firebase:", err);
            if(err.message.includes("index")) {
                alert("O Firebase está criando um índice. Aguarde 1 minuto.");
            }
        });
    },

    // ... restante das funções (renderProducts, processMove, etc) continuam iguais
    
    async addProduct(e) {
        e.preventDefault();
        
        // Validação extra de segurança
        if (currentPhotoBase64.length > 800000) {
            return alert("A foto ainda está muito grande. Tente outra imagem.");
        }

        const data = {
            name: document.getElementById('p-name').value,
            category: document.getElementById('p-category').value,
            photo: currentPhotoBase64 || "",
            qty: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection('produtos').add(data);
            ui.closeModal('product');
            currentPhotoBase64 = "";
            alert("Produto cadastrado!");
        } catch (err) {
            console.error("Erro ao salvar:", err);
            alert("Erro: " + err.message);
        }
    }
};