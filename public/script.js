document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
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
    let sessionId = localStorage.getItem('active_session_id') || crypto.randomUUID();
    localStorage.setItem('active_session_id', sessionId);

    // --- Utility Functions ---
    const addMessageToUI = (sender, text) => { /* ... (sama seperti sebelumnya) ... */ };
    const showLoading = (show) => { /* ... (sama seperti sebelumnya) ... */ };

    // --- UI/UX Event Listeners ---
    menuToggleBtn.addEventListener('click', () => sidebar.classList.toggle('active'));
    newChatBtn.addEventListener('click', () => {
        localStorage.setItem('active_session_id', crypto.randomUUID());
        window.location.reload();
    });
    sessionList.addEventListener('click', (e) => {
        const target = e.target.closest('.nav-list-item');
        if (target && target.dataset.sessionId) {
            localStorage.setItem('active_session_id', target.dataset.sessionId);
            window.location.reload();
        }
    });

    // --- Core Application Logic ---
    async function loadSessions() {
        try {
            const response = await fetch('/api/get-sessions');
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
        } catch (error) { console.error('Gagal memuat riwayat:', error); }
    }

    async function loadDocuments() { /* ... (sama seperti sebelumnya) ... */ }

    // Alur Upload Modern dan Cepat
    async function handleFileUpload(file, forSessionId = null) {
        if (!file) return;
        addMessageToUI('model', `Mempersiapkan unggahan untuk ${file.name}...`);
        try {
            const urlResponse = await fetch('/api/create-upload-url', { method: 'POST', body: JSON.stringify({ fileName: file.name }) });
            const urlData = await urlResponse.json();
            if (urlData.error) throw new Error(urlData.error);

            await fetch(urlData.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
            addMessageToUI('model', `Mengunggah...`);

            const processResponse = await fetch('/api/process-document', { method: 'POST', body: JSON.stringify({ storagePath: urlData.path, fileName: file.name, fileType: file.type, sessionId: forSessionId }) });
            const processData = await processResponse.json();
            if (processData.error) throw new Error(processData.error);

            addMessageToUI('model', processData.message);
            if (!forSessionId) await loadDocuments(); // Refresh list KB jika bukan kontekstual

        } catch (error) { addMessageToUI('model', `Gagal total: ${error.message}`); }
    }

    kbUploadInput.addEventListener('change', (e) => handleFileUpload(e.target.files[0], null));
    contextUploadBtn.addEventListener('click', () => contextUploadInput.click());
    contextUploadInput.addEventListener('change', (e) => handleFileUpload(e.target.files[0], sessionId));

    async function handleSendMessage() { /* ... (sama seperti sebelumnya) ... */ }
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