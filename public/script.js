document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const chatWindow = document.getElementById('chatWindow');

    const documentNameInput = document.getElementById('documentNameInput');
    const documentFileInput = document.getElementById('documentFileInput'); // Elemen input file
    const documentContentInput = document.getElementById('documentContentInput'); // Elemen textarea
    const uploadDocumentButton = document.getElementById('uploadDocumentButton');
    const uploadStatus = document.getElementById('uploadStatus');

    function addMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.classList.add(sender === 'user' ? 'user-message' : 'ai-message');
        messageDiv.textContent = text;
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight; // Gulir ke bawah
    }

    sendButton.addEventListener('click', async () => {
        const prompt = chatInput.value.trim();
        if (prompt === '') return;

        addMessage('user', prompt);
        chatInput.value = '';

        try {
            const response = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt: prompt }),
            });

            const data = await response.json();
            if (response.ok) {
                addMessage('ai', data.response);
            } else {
                addMessage('ai', `Error: ${data.error || 'Terjadi kesalahan.'}`);
            }
        } catch (error) {
            console.error('Error calling Netlify Function:', error);
            addMessage('ai', 'Error: Tidak dapat menghubungi server.');
        }
    });

    // Mengaktifkan pengiriman dengan tombol Enter
    chatInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault(); // Mencegah baris baru di input
            sendButton.click();
        }
    });

    uploadDocumentButton.addEventListener('click', async () => {
        const documentName = documentNameInput.value.trim();
        const documentFile = documentFileInput.files[0]; // Dapatkan file yang dipilih (jika ada)
        const documentContent = documentContentInput.value.trim(); // Dapatkan teks dari textarea

        if (documentName === '') {
            uploadStatus.textContent = 'Nama dokumen tidak boleh kosong.';
            uploadStatus.style.color = 'red';
            return;
        }

        // Pastikan setidaknya ada file yang diunggah ATAU konten teks yang dimasukkan
        if (!documentFile && documentContent === '') {
            uploadStatus.textContent = 'Mohon unggah file atau tempel konten dokumen.';
            uploadStatus.style.color = 'red';
            return;
        }

        // Siapkan FormData untuk mengirim file dan/atau teks
        const formData = new FormData();
        formData.append('documentName', documentName);

        if (documentFile) {
            formData.append('documentFile', documentFile); // Tambahkan file ke FormData
        } else if (documentContent !== '') {
            formData.append('documentContent', documentContent); // Tambahkan teks ke FormData
        }

        uploadStatus.textContent = 'Mengunggah dokumen...';
        uploadStatus.style.color = 'blue';

        try {
            // Penting: Saat menggunakan FormData, JANGAN set 'Content-Type' header secara manual.
            // Browser akan mengaturnya secara otomatis dengan 'multipart/form-data' dan boundary yang benar.
            const response = await fetch('/.netlify/functions/upload-document', {
                method: 'POST',
                body: formData, // Kirim objek FormData
            });

            const data = await response.json();
            if (response.ok) {
                uploadStatus.textContent = data.message;
                uploadStatus.style.color = 'green';
                // Reset input setelah sukses
                documentNameInput.value = '';
                documentFileInput.value = ''; // Mengatur ulang input file
                documentContentInput.value = ''; // Mengatur ulang textarea
            } else {
                uploadStatus.textContent = `Gagal mengunggah: ${data.error || 'Terjadi kesalahan.'}`;
                uploadStatus.style.color = 'red';
            }
        } catch (error) {
            console.error('Error calling upload function:', error);
            uploadStatus.textContent = 'Error: Tidak dapat menghubungi server atau memproses unggahan.';
            uploadStatus.style.color = 'red';
        }
    });
});
