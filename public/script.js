document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    // Mengambil semua elemen interaktif dari DOM untuk digunakan
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

    // --- Session Management ---
    // Mengambil ID sesi aktif dari penyimpanan lokal, atau membuat yang baru jika tidak ada.
    let sessionId = localStorage.getItem('active_session_id') || crypto.randomUUID();
    localStorage.setItem('active_session_id', sessionId);

    // --- Utility Functions ---
    // Fungsi untuk menambahkan pesan ke jendela chat dengan gaya yang sesuai.
    const addMessageToUI = (sender, text) => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        // Mengubah baris baru (\n) menjadi tag <br> agar tampil di HTML
        messageDiv.innerHTML = text.replace(/\n/g, '<br>');
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight; // Auto-scroll ke bawah
        return messageDiv;
    };

    // Fungsi untuk menampilkan atau menyembunyikan indikator loading.
    const showLoading = (show) => {
        loadingIndicator.style.display = show ? 'flex' : 'none';
        sendBtn.disabled = show;
        chatInput.disabled = show;
    };

    // --- UI/UX Event Listeners ---
    menuToggleBtn.addEventListener('click', () => sidebar.classList.toggle('active'));

    newChatBtn.addEventListener('click', () => {
        localStorage.setItem('active_session_id', crypto.randomUUID());
        window.location.reload(); // Cara termudah untuk memulai sesi baru
    });

    sessionList.addEventListener('click', (e) => {
        const target = e.target.closest('.nav-list-item');
        if (target && target.dataset.sessionId) {
            localStorage.setItem('active_session_id', target.dataset.sessionId);
            window.location.reload();
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = `${chatInput.scrollHeight}px`;
    });


    // --- Core Application Logic ---
    // Mengambil dan menampilkan daftar riwayat percakapan.
    async function loadSessions() {
        try {
            const response = await fetch('/api/get-sessions');
            if (!response.ok) throw new Error('Gagal mengambil data sesi dari server.');
            const sessions = await response.json();

            sessionList.innerHTML = '';
            if (sessions.error) throw new Error(sessions.error);

            sessions.forEach(session => {
                const item = document.createElement('div');
                item.className = 'nav-list-item';
                item.textContent = session.title || 'Percakapan Tanpa Judul';
                item.dataset.sessionId = session.session_id;
                if (session.session_id === sessionId) {
                    item.classList.add('active');
                    chatWindowTitle.textContent = session.title || 'Percakapan Lama';
                }
                sessionList.appendChild(item);
            });
        } catch (error) {
            console.error('Gagal memuat riwayat:', error);
            sessionList.innerHTML = '<p style="color: var(--error-color); padding: 0.5rem;">Gagal memuat riwayat</p>';
        }
    }

    // Mengambil dan menampilkan daftar dokumen di Knowledge Base.
    async function loadDocuments() { /* ... (Fungsi ini tidak berubah dari versi sebelumnya) ... */ }

    // Alur Upload Modern dan Cepat dengan Feedback yang Jelas
    async function handleFileUpload(file, forSessionId = null) {
        if (!file) return;

        // Fungsi helper untuk notifikasi upload di chat
        const addStatusMessage = (text, type = 'status') => {
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', 'status', type);
            messageDiv.textContent = text;
            chatWindow.appendChild(messageDiv);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        };

        try {
            addStatusMessage(`Mempersiapkan unggahan untuk ${file.name}...`);

            const urlResponse = await fetch('/api/create-upload-url', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ fileName: file.name }) });
            if (!urlResponse.ok) throw new Error('Server menolak permintaan izin upload.');
            const urlData = await urlResponse.json();
            if (urlData.error) throw new Error(urlData.error);

            addStatusMessage(`Mengunggah file ke penyimpanan aman...`);
            const uploadFetch = await fetch(urlData.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
            if (!uploadFetch.ok) throw new Error('Gagal saat mengunggah file ke penyimpanan.');

            addStatusMessage(`Memproses dokumen di server...`);
            const processResponse = await fetch('/api/process-document', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ storagePath: urlData.path, fileName: file.name, fileType: file.type, sessionId: forSessionId }) });
            if (!processResponse.ok) throw new Error('Server gagal memproses dokumen.');
            const processData = await processResponse.json();
            if (processData.error) throw new Error(processData.error);

            addStatusMessage(processData.message, 'success'); // Pesan sukses!

            if (!forSessionId) await loadDocuments();

        } catch (error) {
            addStatusMessage(`Terjadi kesalahan: ${error.message}`, 'error'); // Pesan Gagal!
        }
    }

    // Event listener untuk tombol upload
    kbUploadInput.addEventListener('change', (e) => handleFileUpload(e.target.files[0], null)); // Upload untuk KB
    contextUploadBtn.addEventListener('click', () => contextUploadInput.click());
    contextUploadInput.addEventListener('change', (e) => handleFileUpload(e.target.files[0], sessionId)); // Upload untuk sesi ini


    // Fungsi untuk mengirim pesan chat
    async function handleSendMessage() {
        const messageText = chatInput.value.trim();
        if (!messageText) return;

        addMessageToUI('user', messageText);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        showLoading(true);

        try {
            const response = await fetch('/api/chat', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: messageText, sessionId: sessionId }) });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Respon jaringan tidak baik.');
            }

            const data = await response.json();
            addMessageToUI('model', data.reply);

            // Jika ini pesan pertama, muat ulang riwayat untuk menampilkan judul baru
            if(document.querySelectorAll('.message').length <= 4) { // Cek jika ini interaksi pertama
                loadSessions();
            }

        } catch (error) {
            addMessageToUI('model', `Maaf, terjadi kesalahan: ${error.message}`);
        } finally {
            showLoading(false);
            chatInput.focus();
        }
    }

    sendBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } });

    // --- Initial Load ---
    async function initializeApp() {
        // TODO: Buat fungsi backend untuk memuat pesan dari sesi yang dipilih
        // saat ini, hanya memuat riwayat sesi dan dokumen
        await Promise.all([loadSessions(), loadDocuments()]);
    }

    initializeApp();
});