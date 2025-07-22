document.addEventListener('DOMContentLoaded', () => {
    // Element Selectors
    const sidebar = document.getElementById('sidebar');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const sessionList = document.getElementById('session-list');
    const documentList = document.getElementById('document-list');
    const chatWindowTitle = document.getElementById('chat-title');
    const chatWindow = document.getElementById('chat-window');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const loadingIndicator = document.getElementById('loading-indicator');
    const kbUploadInput = document.getElementById('kb-upload-input');
    const contextUploadBtn = document.getElementById('context-upload-btn');
    const contextUploadInput = document.getElementById('context-upload-input');

    // Session Management
    let sessionId = localStorage.getItem('active_session_id') || crypto.randomUUID();
    localStorage.setItem('active_session_id', sessionId);

    // Utility Functions
    const addMessageToUI = (sender, text) => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        messageDiv.innerHTML = text.replace(/\n/g, '<br>');
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return messageDiv;
    };

    const showLoading = (show) => {
        loadingIndicator.style.display = show ? 'flex' : 'none';
        sendBtn.disabled = show;
        chatInput.disabled = show;
    };

    // Event Listeners
    menuToggleBtn.addEventListener('click', () => sidebar.classList.toggle('active'));

    newChatBtn.addEventListener('click', () => {
        sessionId = crypto.randomUUID();
        localStorage.setItem('active_session_id', sessionId);
        chatWindowTitle.textContent = "Percakapan Baru";
        chatWindow.innerHTML = '<div class="message model"><p>Halo! Saya adalah Asisten AI untuk Pengawasan. Silakan ajukan pertanyaan atau lampirkan dokumen untuk kita diskusikan.</p></div>';
    });

    sessionList.addEventListener('click', (e) => {
        const target = e.target.closest('.nav-list-item');
        if (target && target.dataset.sessionId) {
            sessionId = target.dataset.sessionId;
            localStorage.setItem('active_session_id', sessionId);
            loadChatHistory();
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = `${chatInput.scrollHeight}px`;
    });

    // Core Functions
    async function loadSessions() {
        try {
            const response = await fetch('/.netlify/functions/get-sessions');
            if (!response.ok) throw new Error('Gagal mengambil data sesi');
            const sessions = await response.json();

            sessionList.innerHTML = '';
            sessions.forEach(session => {
                const item = document.createElement('div');
                item.className = 'nav-list-item';
                item.textContent = session.title || 'Percakapan Tanpa Judul';
                item.dataset.sessionId = session.session_id;
                if (session.session_id === sessionId) {
                    item.classList.add('active');
                    chatWindowTitle.textContent = session.title || 'Percakapan Baru';
                }
                sessionList.appendChild(item);
            });
        } catch (error) {
            console.error('Gagal memuat riwayat:', error);
            sessionList.innerHTML = '<p class="error">Gagal memuat riwayat</p>';
        }
    }

    async function loadDocuments() {
        try {
            const response = await fetch('/.netlify/functions/get-documents');
            if (!response.ok) throw new Error('Gagal mengambil dokumen');
            const documents = await response.json();

            documentList.innerHTML = '';
            documents.forEach(doc => {
                const item = document.createElement('div');
                item.className = 'document-item';
                item.innerHTML = `
                    <span>${doc.file_name}</span>
                    <button class="delete-doc-btn" data-id="${doc.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
                documentList.appendChild(item);
            });

            // Tambahkan event listener untuk tombol hapus
            document.querySelectorAll('.delete-doc-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const docId = btn.dataset.id;
                    if (confirm('Apakah Anda yakin ingin menghapus dokumen ini?')) {
                        try {
                            const response = await fetch('/.netlify/functions/delete-document', {
                                method: 'POST',
                                headers: {'Content-Type': 'application/json'},
                                body: JSON.stringify({ id: docId })
                            });
                            if (!response.ok) throw new Error('Gagal menghapus dokumen.');
                            await loadDocuments();
                        } catch (error) {
                            alert(`Gagal menghapus: ${error.message}`);
                        }
                    }
                });
            });
        } catch (error) {
            console.error('Gagal memuat dokumen:', error);
            documentList.innerHTML = '<p class="error">Gagal memuat dokumen</p>';
        }
    }

    async function loadChatHistory() {
        try {
            const response = await fetch(`/.netlify/functions/get-chat-history?sessionId=${sessionId}`);
            if (!response.ok) throw new Error('Gagal memuat riwayat chat');
            const history = await response.json();

            chatWindow.innerHTML = '';
            history.forEach(msg => {
                addMessageToUI(msg.role, msg.content);
            });

            // Update judul
            const sessionItem = document.querySelector(`.nav-list-item[data-session-id="${sessionId}"]`);
            if (sessionItem) {
                chatWindowTitle.textContent = sessionItem.textContent;
            }
        } catch (error) {
            console.error('Gagal memuat riwayat chat:', error);
            chatWindow.innerHTML = '<div class="message model"><p>Halo! Saya adalah Asisten AI untuk Pengawasan. Silakan ajukan pertanyaan atau lampirkan dokumen untuk kita diskusikan.</p></div>';
        }
    }

    async function handleFileUpload(file, forSessionId = null) {
        if (!file) return;

        const addStatusMessage = (text, type = 'status') => {
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', 'status', type);
            messageDiv.textContent = text;
            chatWindow.appendChild(messageDiv);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        };

        try {
            addStatusMessage(`Mempersiapkan unggahan untuk ${file.name}...`);

            const urlResponse = await fetch('/.netlify/functions/create-upload-url', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ fileName: file.name })
            });

            if (!urlResponse.ok) throw new Error('Server menolak permintaan izin upload.');
            const urlData = await urlResponse.json();
            if (urlData.error) throw new Error(urlData.error);

            addStatusMessage(`Mengunggah file ke penyimpanan aman...`);
            const uploadFetch = await fetch(urlData.signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file
            });

            if (!uploadFetch.ok) throw new Error('Gagal saat mengunggah file ke penyimpanan.');

            addStatusMessage(`Memproses dokumen di server...`);
            const processResponse = await fetch('/.netlify/functions/process-document', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    storagePath: urlData.path, 
                    fileName: file.name, 
                    fileType: file.type, 
                    sessionId: forSessionId 
                })
            });

            if (!processResponse.ok) throw new Error('Server gagal memproses dokumen.');
            const processData = await processResponse.json();
            if (processData.error) throw new Error(processData.error);

            addStatusMessage(processData.message, 'success');
            if (!forSessionId) await loadDocuments();

        } catch (error) {
            addStatusMessage(`Terjadi kesalahan: ${error.message}`, 'error');
        }
    }

    async function handleSendMessage() {
        const messageText = chatInput.value.trim();
        if (!messageText) return;

        addMessageToUI('user', messageText);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        showLoading(true);

        try {
            const response = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ message: messageText, sessionId: sessionId })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Respon jaringan tidak baik.');
            }

            const data = await response.json();
            addMessageToUI('model', data.reply);
            await loadSessions(); // Refresh daftar sesi

        } catch (error) {
            addMessageToUI('model', `Maaf, terjadi kesalahan: ${error.message}`);
        } finally {
            showLoading(false);
            chatInput.focus();
        }
    }

    // Event Listeners untuk upload
    kbUploadInput.addEventListener('change', (e) => handleFileUpload(e.target.files[0], null));
    contextUploadBtn.addEventListener('click', () => contextUploadInput.click());
    contextUploadInput.addEventListener('change', (e) => handleFileUpload(e.target.files[0], sessionId));

    // Event Listeners untuk chat
    sendBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Initial Load
    async function initializeApp() {
        await loadSessions();
        await loadDocuments();
        await loadChatHistory();
    }

    initializeApp();
});