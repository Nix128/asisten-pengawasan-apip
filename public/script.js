document.addEventListener('DOMContentLoaded', () => {
    // Check login state
    const isLoggedIn = localStorage.getItem('apip_user') !== null;
    if (isLoggedIn) {
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('loginScreen').classList.add('hidden');
        initApp();
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
    }

    // Login Form Handler
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/.netlify/functions/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('apip_user', JSON.stringify(data.user));
                document.getElementById('mainApp').classList.remove('hidden');
                document.getElementById('loginScreen').classList.add('hidden');
                initApp();
            } else {
                alert(data.error || 'Login gagal');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Terjadi kesalahan saat login');
        }
    });

    // Initialize app after login
    function initApp() {
        // Navigation Menu
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPage = item.getAttribute('data-page');

                // Update active menu item
                document.querySelectorAll('.menu-item').forEach(i => {
                    i.classList.remove('active');
                });
                item.classList.add('active');

                // Show target page
                document.querySelectorAll('.page').forEach(page => {
                    page.classList.remove('active');
                });
                document.getElementById(`${targetPage}Page`).classList.add('active');

                // Load page-specific data
                if (targetPage === 'history') {
                    loadConversationHistory();
                } else if (targetPage === 'knowledge') {
                    loadKnowledgeDocuments();
                }
            });
        });

        // Logout Button
        document.getElementById('logoutButton').addEventListener('click', () => {
            localStorage.removeItem('apip_user');
            document.getElementById('mainApp').classList.add('hidden');
            document.getElementById('loginScreen').classList.remove('hidden');
        });

        // Chat Functionality
        initChat();

        // Knowledge Base Management
        initKnowledgeBase();
    }

    function initChat() {
        const chatInput = document.getElementById('chatInput');
        const sendButton = document.getElementById('sendButton');
        const chatWindow = document.getElementById('chatWindow');
        const fileInput = document.getElementById('fileInput');
        const filePreview = document.getElementById('filePreview');

        const filesToUpload = [];

        // Handle file selection
        fileInput.addEventListener('change', (e) => {
            Array.from(e.target.files).forEach(file => {
                filesToUpload.push(file);
                addFilePreview(file);
            });
            fileInput.value = '';
        });

        function addFilePreview(file) {
            const fileElement = document.createElement('div');
            fileElement.className = 'file-preview';
            fileElement.innerHTML = `
                <span>${file.name}</span>
                <span class="remove-file" data-filename="${file.name}">×</span>
            `;
            filePreview.appendChild(fileElement);

            // Add remove file handler
            fileElement.querySelector('.remove-file').addEventListener('click', (e) => {
                const filename = e.target.getAttribute('data-filename');
                const index = filesToUpload.findIndex(f => f.name === filename);
                if (index !== -1) {
                    filesToUpload.splice(index, 1);
                }
                fileElement.remove();
            });
        }

        // Send message handler
        sendButton.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        async function sendMessage() {
            const message = chatInput.value.trim();
            if (!message && filesToUpload.length === 0) return;

            // Add user message to chat
            addMessage('user', message);
            chatInput.value = '';

            // Handle file uploads if any
            if (filesToUpload.length > 0) {
                await uploadFilesForAnalysis(filesToUpload);
                filesToUpload.length = 0;
                filePreview.innerHTML = '';
            }

            // Send to AI
            try {
                const response = await fetch('/.netlify/functions/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        prompt: message,
                        files: filesToUpload.map(f => f.name) 
                    })
                });

                const data = await response.json();
                if (response.ok) {
                    addMessage('ai', data.response);
                } else {
                    addMessage('ai', `Error: ${data.error || 'Terjadi kesalahan.'}`);
                }
            } catch (error) {
                console.error('Error calling chat function:', error);
                addMessage('ai', 'Error: Tidak dapat menghubungi server.');
            }
        }

        function addMessage(sender, text) {
            if (!text) return;

            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message');
            messageDiv.classList.add(`message-${sender}`);
            messageDiv.textContent = text;
            chatWindow.appendChild(messageDiv);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }

        async function uploadFilesForAnalysis(files) {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });

            try {
                const response = await fetch('/.netlify/functions/upload-document', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                if (!response.ok) {
                    console.error('File upload error:', data.error);
                    addMessage('ai', `Error: Gagal mengunggah file untuk analisis.`);
                }
            } catch (error) {
                console.error('File upload error:', error);
                addMessage('ai', 'Error: Gagal mengunggah file untuk analisis.');
            }
        }
    }

    function initKnowledgeBase() {
        const uploadDocButton = document.getElementById('uploadDocumentButton');
        const docNameInput = document.getElementById('documentName');
        const docFileInput = document.getElementById('documentFile');
        const docContentInput = document.getElementById('documentContent');
        const uploadStatus = document.getElementById('uploadStatus');

        uploadDocButton.addEventListener('click', async () => {
            const docName = docNameInput.value.trim();
            if (!docName) {
                uploadStatus.textContent = 'Nama dokumen harus diisi';
                uploadStatus.className = 'upload-error';
                return;
            }

            const files = Array.from(docFileInput.files);
            const content = docContentInput.value.trim();

            if (files.length === 0 && !content) {
                uploadStatus.textContent = 'Unggah file atau tempel konten teks';
                uploadStatus.className = 'upload-error';
                return;
            }

            uploadStatus.textContent = 'Mengunggah dokumen...';
            uploadStatus.className = '';

            try {
                const formData = new FormData();
                formData.append('documentName', docName);

                if (files.length > 0) {
                    files.forEach(file => {
                        formData.append('files', file);
                    });
                } else {
                    formData.append('content', content);
                }

                const response = await fetch('/.netlify/functions/upload-document', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                if (response.ok) {
                    uploadStatus.textContent = data.message;
                    uploadStatus.className = 'upload-success';

                    // Reset form
                    docNameInput.value = '';
                    docFileInput.value = '';
                    docContentInput.value = '';

                    // Reload documents list
                    loadKnowledgeDocuments();
                } else {
                    uploadStatus.textContent = data.error || 'Gagal mengunggah dokumen';
                    uploadStatus.className = 'upload-error';
                }
            } catch (error) {
                console.error('Upload error:', error);
                uploadStatus.textContent = 'Terjadi kesalahan saat mengunggah';
                uploadStatus.className = 'upload-error';
            }
        });

        // Load documents on knowledge base page
        loadKnowledgeDocuments();
    }

    async function loadConversationHistory() {
        try {
            const response = await fetch('/.netlify/functions/get-history');
            const history = await response.json();
            renderHistoryTable(history);
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    function renderHistoryTable(history) {
        const tbody = document.querySelector('#historyTable tbody');
        tbody.innerHTML = '';

        history.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(item.created_at).toLocaleString()}</td>
                <td>${item.prompt}</td>
                <td>${item.response.substring(0, 100)}...</td>
                <td class="action-buttons">
                    <button class="btn-action btn-edit" data-id="${item.id}">Edit</button>
                    <button class="btn-action btn-delete" data-id="${item.id}">Hapus</button>
                </td>
            `;
            tbody.appendChild(tr);

            // Add edit handler
            tr.querySelector('.btn-edit').addEventListener('click', () => {
                openEditModal('history', item.id, item.response);
            });

            // Add delete handler
            tr.querySelector('.btn-delete').addEventListener('click', async () => {
                if (confirm('Apakah Anda yakin ingin menghapus riwayat ini?')) {
                    try {
                        await fetch(`/.netlify/functions/delete-history?id=${item.id}`, {
                            method: 'DELETE'
                        });
                        loadConversationHistory();
                    } catch (error) {
                        console.error('Delete error:', error);
                    }
                }
            });
        });
    }

    async function loadKnowledgeDocuments() {
        try {
            const response = await fetch('/.netlify/functions/get-documents');
            const documents = await response.json();
            renderDocumentsList(documents);
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    }

    function renderDocumentsList(documents) {
        const container = document.getElementById('documentsList');
        const grid = container.querySelector('.document-grid') || document.createElement('div');
        grid.className = 'document-grid';
        grid.innerHTML = '';

        documents.forEach(doc => {
            const card = document.createElement('div');
            card.className = 'document-card';
            card.innerHTML = `
                <div class="document-header">
                    <div class="document-title">${doc.document_name}</div>
                    <div class="document-actions">
                        <button class="btn-icon edit-doc" data-id="${doc.id}">
                            <svg class="icon">
                                <use href="assets/icons/edit.svg#icon"></use>
                            </svg>
                        </button>
                        <button class="btn-icon delete-doc" data-id="${doc.id}">
                            <svg class="icon">
                                <use href="assets/icons/delete.svg#icon"></use>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="document-meta">
                    ${new Date(doc.created_at).toLocaleDateString()} • 
                    ${doc.chunk_count} bagian
                </div>
                <div class="document-content">
                    ${doc.content.substring(0, 200)}...
                </div>
            `;
            grid.appendChild(card);

            // Add edit handler
            card.querySelector('.edit-doc').addEventListener('click', () => {
                openEditModal('document', doc.id, doc.content);
            });

            // Add delete handler
            card.querySelector('.delete-doc').addEventListener('click', async () => {
                if (confirm('Apakah Anda yakin ingin menghapus dokumen ini?')) {
                    try {
                        await fetch(`/.netlify/functions/delete-document?id=${doc.id}`, {
                            method: 'DELETE'
                        });
                        loadKnowledgeDocuments();
                    } catch (error) {
                        console.error('Delete error:', error);
                    }
                }
            });
        });

        if (!container.querySelector('.document-grid')) {
            container.appendChild(grid);
        }
    }

    function openEditModal(type, id, content) {
        const modal = document.getElementById('editModal');
        const modalTitle = document.getElementById('modalTitle');
        const editContent = document.getElementById('editContent');
        const saveButton = document.getElementById('saveEdit');

        modalTitle.textContent = type === 'history' ? 'Edit Jawaban' : 'Edit Konten Dokumen';
        editContent.value = content;
        modal.classList.remove('hidden');

        // Clear previous event listeners
        const newSaveButton = saveButton.cloneNode(true);
        saveButton.parentNode.replaceChild(newSaveButton, saveButton);

        // Add new save handler
        newSaveButton.addEventListener('click', async () => {
            const updatedContent = editContent.value.trim();

            try {
                let endpoint, body;
                if (type === 'history') {
                    endpoint = '/.netlify/functions/update-history';
                    body = { id, response: updatedContent };
                } else {
                    endpoint = '/.netlify/functions/update-document';
                    body = { id, content: updatedContent };
                }

                const response = await fetch(endpoint, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                if (response.ok) {
                    modal.classList.add('hidden');

                    // Reload data
                    if (type === 'history') {
                        loadConversationHistory();
                    } else {
                        loadKnowledgeDocuments();
                    }
                } else {
                    const data = await response.json();
                    alert(data.error || 'Gagal menyimpan perubahan');
                }
            } catch (error) {
                console.error('Update error:', error);
                alert('Terjadi kesalahan saat menyimpan');
            }
        });

        // Close modal handler
        document.querySelector('.close-modal').addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }
});