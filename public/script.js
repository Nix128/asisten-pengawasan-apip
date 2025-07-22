document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const fileUploadInput = document.getElementById('file-upload-input');
    const documentList = document.getElementById('document-list');
    const loadingIndicator = document.getElementById('loading-indicator');

    let sessionId = localStorage.getItem('chat_session_id') || crypto.randomUUID();
    localStorage.setItem('chat_session_id', sessionId);

    // --- UTILITY FUNCTIONS ---
    function addMessageToUI(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        messageDiv.innerHTML = text.replace(/\n/g, '<br>'); // Render newlines
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return messageDiv;
    }

    function showLoading(show) {
        loadingIndicator.style.display = show ? 'flex' : 'none';
        sendBtn.disabled = show;
        chatInput.disabled = show;
    }

    // --- KNOWLEDGE BASE FUNCTIONS ---
    async function loadDocuments() {
        try {
            const response = await fetch('/api/get-documents');
            const docs = await response.json();
            documentList.innerHTML = '';
            if (docs.error) throw new Error(docs.error);
            docs.forEach(doc => {
                const item = document.createElement('div');
                item.className = 'document-item';
                item.innerHTML = `
                    <div class="doc-info">
                        <p>${doc.file_name}</p>
                        <span>${new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                    <button class="delete-doc-btn" data-id="${doc.id}"><i class="fas fa-trash-alt"></i></button>
                `;
                documentList.appendChild(item);
            });
        } catch (error) {
            console.error('Error loading documents:', error);
            documentList.innerHTML = '<p style="color: var(--danger-color);">Gagal memuat dokumen.</p>';
        }
    }

    async function handleUpload(file) {
        if (!file) return;
        addMessageToUI('model', `Mengunggah ${file.name}...`);

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64Data = reader.result.split(',')[1];
            try {
                const response = await fetch('/api/upload-document', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fileName: file.name,
                        fileType: file.type,
                        fileData: base64Data
                    })
                });
                const result = await response.json();
                if (result.error) throw new Error(result.error);
                addMessageToUI('model', result.message);
                await loadDocuments(); // Refresh list
            } catch (error) {
                addMessageToUI('model', `Gagal mengunggah file: ${error.message}`);
            }
        };
    }

    async function handleDeleteDocument(docId) {
        if (!confirm('Apakah Anda yakin ingin menghapus dokumen ini dari Knowledge Base?')) return;
        try {
            const response = await fetch('/api/delete-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: docId })
            });
            const result = await response.json();
            if (result.error) throw new Error(result.error);
            addMessageToUI('model', result.message);
            await loadDocuments();
        } catch(error) {
            addMessageToUI('model', `Gagal menghapus dokumen: ${error.message}`);
        }
    }


    // --- CHAT FUNCTIONS ---
    async function handleSendMessage() {
        const messageText = chatInput.value.trim();
        if (!messageText) return;

        addMessageToUI('user', messageText);
        chatInput.value = '';
        chatInput.style.height = 'auto'; // Reset height
        showLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: messageText, sessionId: sessionId })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Terjadi kesalahan jaringan.');
            }

            const data = await response.json();
            addMessageToUI('model', data.reply);

        } catch (error) {
            addMessageToUI('model', `Maaf, terjadi kesalahan: ${error.message}`);
        } finally {
            showLoading(false);
            chatInput.focus();
        }
    }

    // --- EVENT LISTENERS ---
    sendBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    });

    fileUploadInput.addEventListener('change', (e) => handleUpload(e.target.files[0]));

    documentList.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.delete-doc-btn');
        if (deleteButton) {
            handleDeleteDocument(deleteButton.dataset.id);
        }
    });

    // --- INITIAL LOAD ---
    loadDocuments();
});