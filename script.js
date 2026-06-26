document.addEventListener('DOMContentLoaded', () => {

    // ============================================================
    // ELEMEN DOM
    // ============================================================
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    const newChatBtn = document.getElementById('newChatBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const messagesEl = document.getElementById('messages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const voiceBtn = document.getElementById('voiceBtn');
    const themeToggle = document.getElementById('themeToggle');
    const historyList = document.getElementById('historyList');
    const modal = document.getElementById('codeModal');
    const modalCode = document.getElementById('modalCode');
    const closeModal = document.querySelector('.close-modal');
    const copyCodeBtn = document.getElementById('copyCodeBtn');

    // ============================================================
    // KONFIGURASI (dari config.js)
    // ============================================================
    const BACKEND_URL = window.BACKEND_URL || 'http://szxennofficial.qoupayid.xyz:3529';

    console.log('🔗 Backend URL:', BACKEND_URL);

    const SYSTEM_PROMPT = `Kamu adalah Zyrex AI, asisten cerdas yang dibuat oleh Ziferr.

📌 ATURAN UTAMA:
1. FOKUS: Membantu SEMUA pertanyaan (bukan hanya coding)
2. Jika user meminta kode, berikan dalam format code block dengan nama bahasa
3. Jawab dengan ramah, informatif, dan detail
4. Gunakan bahasa Indonesia

💡 Contoh format kode:
\`\`\`python
print("Hello World")
\`\`\`

INGAT: Selalu gunakan code block untuk semua kode!`;

    // ============================================================
    // STATE
    // ============================================================
    let currentChatId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    let chats = JSON.parse(localStorage.getItem('zyrexChats')) || {};
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let isProcessing = false;

    // ============================================================
    // FUNGSI UTAMA
    // ============================================================

    function renderMessages(chatId) {
        const msgs = chats[chatId] || [];
        messagesEl.innerHTML = '';

        msgs.forEach((msg) => {
            const div = document.createElement('div');
            div.className = `message ${msg.role}`;

            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            avatar.innerHTML = msg.role === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-paw"></i>';

            const bubble = document.createElement('div');
            bubble.className = 'bubble';

            let content = msg.content;

            // Code block
            content = content.replace(/```(\w+)?\s*([\s\S]*?)```/g, (match, lang, code) => {
                const langLabel = lang ? lang.trim() : '';
                const cleanCode = code.trim();
                return `<pre><code class="lang-${langLabel}">${escapeHtml(cleanCode)}</code></pre>`;
            });

            // Inline code
            content = content.replace(/`([^`]+)`/g, '<code>$1</code>');

            // Bold
            content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

            // Italic
            content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');

            // Newline
            content = content.replace(/\n/g, '<br>');

            bubble.innerHTML = content;

            // Tombol speaker untuk AI
            if (msg.role === 'assistant' && msg.content !== '⏳ Mengetik...') {
                const speakBtn = document.createElement('button');
                speakBtn.className = 'speak-btn';
                speakBtn.innerHTML = '<i class="fas fa-volume-up"></i> Suara';
                speakBtn.dataset.text = msg.content;
                speakBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    speakText(msg.content);
                });
                bubble.appendChild(speakBtn);
            }

            div.appendChild(avatar);
            div.appendChild(bubble);
            messagesEl.appendChild(div);
        });

        const container = document.getElementById('chatContainer');
        container.scrollTop = container.scrollHeight;
        renderHistory();
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    function renderHistory() {
        const keys = Object.keys(chats);
        historyList.innerHTML = '';

        if (keys.length === 0) {
            historyList.innerHTML = '<div style="padding: 12px 14px; color: #7f9bb3; font-size: 14px;">Belum ada chat</div>';
            return;
        }

        keys.slice().reverse().forEach(key => {
            const item = document.createElement('div');
            item.className = `history-item ${key === currentChatId ? 'active' : ''}`;
            const firstMsg = chats[key]?.find(m => m.role === 'user')?.content || 'Chat kosong';
            item.innerHTML = `<i class="fas fa-comment"></i> ${firstMsg.substring(0, 24)}${firstMsg.length > 24 ? '…' : ''}`;
            item.dataset.chatId = key;
            item.addEventListener('click', () => {
                currentChatId = key;
                renderMessages(currentChatId);
                if (window.innerWidth <= 700) sidebar.classList.remove('open');
            });
            historyList.appendChild(item);
        });
    }

    function saveChat(chatId, messages) {
        chats[chatId] = messages;
        localStorage.setItem('zyrexChats', JSON.stringify(chats));
        renderHistory();
    }

    function addMessage(role, content) {
        if (!chats[currentChatId]) chats[currentChatId] = [];
        chats[currentChatId].push({ role, content });
        saveChat(currentChatId, chats[currentChatId]);
        renderMessages(currentChatId);
    }

    // ============================================================
    // CEK KONEKSI KE BACKEND
    // ============================================================
    async function checkBackend() {
        try {
            console.log('🔍 Checking backend connection...');
            const response = await fetch(BACKEND_URL + '/health');
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Backend connected:', data);
                return true;
            } else {
                console.warn('⚠️ Backend response not OK:', response.status);
                return false;
            }
        } catch (error) {
            console.error('❌ Backend connection failed:', error.message);
            return false;
        }
    }

    // ============================================================
    // KIRIM PESAN KE BACKEND
    // ============================================================
    async function sendToAI(userMsg) {
        if (isProcessing) return;

        // Tambah pesan user
        addMessage('user', userMsg);
        userInput.value = '';
        userInput.focus();

        // Loading
        isProcessing = true;
        const loadingMsg = { role: 'assistant', content: '⏳ Mengetik...' };
        if (!chats[currentChatId]) chats[currentChatId] = [];
        chats[currentChatId].push(loadingMsg);
        renderMessages(currentChatId);

        try {
            // Ambil history (tanpa loading)
            const history = (chats[currentChatId] || [])
                .filter(m => m.content !== '⏳ Mengetik...')
                .map(m => ({ role: m.role, content: m.content }));

            const url = BACKEND_URL + '/api/chat';

            console.log('📡 Sending to backend:', url);
            console.log('📌 Messages count:', history.length);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        ...history
                    ],
                    max_tokens: 2048,
                    temperature: 0.7
                })
            });

            console.log('📡 Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Backend error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('✅ Response received');

            const reply = data.choices?.[0]?.message?.content || 'Maaf, saya tidak bisa menjawab.';

            // Hapus loading
            chats[currentChatId] = chats[currentChatId].filter(m => m.content !== '⏳ Mengetik...');
            chats[currentChatId].push({ role: 'assistant', content: reply });
            saveChat(currentChatId, chats[currentChatId]);
            renderMessages(currentChatId);

        } catch (error) {
            console.error('❌ AI Error:', error);
            
            // Hapus loading
            chats[currentChatId] = chats[currentChatId].filter(m => m.content !== '⏳ Mengetik...');

            let errorMsg = `❌ Maaf, terjadi kesalahan: ${error.message}`;
            
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMsg = `❌ Gagal terhubung ke server AI. Silakan coba lagi nanti.\n\n💡 Tips: Pastikan backend menyala di ${BACKEND_URL}`;
            } else if (error.message.includes('HTTP 404')) {
                errorMsg = `❌ Endpoint backend tidak ditemukan. Pastikan backend berjalan di ${BACKEND_URL}`;
            } else if (error.message.includes('HTTP 500')) {
                errorMsg = `❌ Server backend error. Cek log di server.`;
            }

            chats[currentChatId].push({ role: 'assistant', content: errorMsg });
            saveChat(currentChatId, chats[currentChatId]);
            renderMessages(currentChatId);
        } finally {
            isProcessing = false;
        }
    }

    // ============================================================
    // TEXT-TO-SPEECH (Web Speech API)
    // ============================================================
    function speakText(text) {
        if (!window.speechSynthesis) {
            alert('Browser tidak mendukung TTS.');
            return;
        }

        // Hentikan suara yang sedang diputar
        window.speechSynthesis.cancel();

        // Bersihkan teks dari markdown
        const clean = text
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/```(\w+)?\s*([\s\S]*?)```/g, '$2')
            .replace(/<[^>]*>/g, '')
            .replace(/\n/g, ' ')
            .slice(0, 500);

        if (!clean.trim()) {
            console.warn('Teks kosong, tidak bisa diucapkan');
            return;
        }

        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = 'id-ID';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onstart = () => {
            console.log('🔊 Speaking...');
        };

        utterance.onend = () => {
            console.log('✅ Speaking finished');
        };

        utterance.onerror = (e) => {
            console.error('❌ TTS Error:', e);
        };

        window.speechSynthesis.speak(utterance);
    }

    // ============================================================
    // VOICE-TO-TEXT (PAKAI BACKEND WHISPER)
    // ============================================================
    async function transcribeAudio(blob) {
        try {
            const formData = new FormData();
            formData.append('file', blob, 'voice.webm');
            formData.append('model', 'whisper-large-v3');
            formData.append('language', 'id');
            formData.append('response_format', 'text');

            const url = BACKEND_URL + '/api/transcribe';

            console.log('📡 Sending audio to backend:', url);
            console.log('📌 Audio size:', blob.size, 'bytes');

            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });

            console.log('📡 Transcribe response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Transcribe error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('✅ Transcription result:', data);

            // Handle response format
            if (typeof data === 'string') {
                return data.trim() || null;
            } else if (data.text) {
                return data.text.trim() || null;
            } else if (data.transcript) {
                return data.transcript.trim() || null;
            } else {
                return null;
            }

        } catch (error) {
            console.error('❌ Whisper Error:', error);
            return null;
        }
    }

    // ============================================================
    // VOICE RECORDING (MediaRecorder)
    // ============================================================
    async function startRecording() {
        try {
            console.log('🎤 Requesting microphone...');

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100,
                    channelCount: 1
                }
            });

            console.log('✅ Microphone granted');

            // Pilih format yang didukung
            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                mimeType = 'audio/ogg;codecs=opus';
            }

            mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType
            });

            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log('⏹️ Recording stopped');
                voiceBtn.classList.remove('recording');

                if (audioChunks.length === 0) {
                    console.warn('⚠️ No audio recorded');
                    return;
                }

                const audioBlob = new Blob(audioChunks, {
                    type: mimeType
                });

                console.log('📦 Audio blob size:', audioBlob.size, 'bytes');

                // Kirim ke backend untuk transkripsi
                const transcribedText = await transcribeAudio(audioBlob);

                if (transcribedText && transcribedText.trim()) {
                    console.log('📝 Transcribed:', transcribedText);
                    sendToAI(transcribedText);
                } else {
                    console.warn('⚠️ Transcription empty or failed');
                    addMessage('user', '🎤 (Voice note tidak terbaca)');
                    addMessage('assistant', 'Maaf, saya tidak bisa mendengar suara Anda dengan jelas. Silakan coba rekam ulang atau ketik pesan.');
                }

                // Cleanup
                stream.getTracks().forEach(t => {
                    t.stop();
                    console.log('🎤 Track stopped');
                });
                isRecording = false;
                mediaRecorder = null;
                audioChunks = [];
            };

            // Mulai rekam dengan chunk 1 detik
            mediaRecorder.start(1000);
            isRecording = true;
            voiceBtn.classList.add('recording');

            console.log('🎤 Recording started...');

            // Auto stop after 60 seconds
            setTimeout(() => {
                if (isRecording && mediaRecorder) {
                    console.log('⏰ Auto-stop after 60 seconds');
                    stopRecording();
                }
            }, 60000);

        } catch (err) {
            console.error('❌ Recording Error:', err);
            alert('Izin mikrofon diperlukan untuk merekam suara.\n\nError: ' + err.message);
        }
    }

    function stopRecording() {
        if (mediaRecorder && isRecording) {
            console.log('⏹️ Stopping recording...');
            mediaRecorder.stop();
            isRecording = false;
        } else {
            console.warn('⚠️ No recording to stop');
        }
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    // Kirim pesan (tombol)
    sendBtn.addEventListener('click', () => {
        const msg = userInput.value.trim();
        if (msg && !isProcessing) {
            sendToAI(msg);
        }
    });

    // Kirim pesan (Enter)
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const msg = userInput.value.trim();
            if (msg && !isProcessing) {
                sendToAI(msg);
            }
        }
    });

    // Voice button
    voiceBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    // Chat baru
    newChatBtn.addEventListener('click', () => {
        currentChatId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        chats[currentChatId] = [];
        saveChat(currentChatId, chats[currentChatId]);
        renderMessages(currentChatId);
        if (window.innerWidth <= 700) sidebar.classList.remove('open');
    });

    // Hapus riwayat
    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('Hapus semua riwayat chat?')) {
            chats = {};
            localStorage.removeItem('zyrexChats');
            currentChatId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            chats[currentChatId] = [];
            saveChat(currentChatId, chats[currentChatId]);
            renderMessages(currentChatId);
        }
    });

    // Toggle sidebar
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // Theme toggle
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        const icon = themeToggle.querySelector('i');
        icon.classList.toggle('fa-moon');
        icon.classList.toggle('fa-sun');
    });

    // Modal - klik pada code block untuk melihat kode
    document.addEventListener('click', (e) => {
        const target = e.target.closest('pre code');
        if (target) {
            const text = target.textContent;
            modalCode.textContent = text;
            modal.classList.remove('hidden');
        }
    });

    // Tutup modal (X)
    closeModal.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Tutup modal (klik di luar)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    // Copy kode
    copyCodeBtn.addEventListener('click', async () => {
        const text = modalCode.textContent;
        try {
            await navigator.clipboard.writeText(text);
            alert('✅ Kode berhasil disalin!');
        } catch (err) {
            // Fallback untuk browser yang tidak support clipboard API
            const range = document.createRange();
            range.selectNode(modalCode);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            alert('✅ Kode berhasil disalin!');
        }
    });

    // ============================================================
    // INIT / STARTUP
    // ============================================================

    // Cek koneksi ke backend
    checkBackend().then(connected => {
        if (!connected) {
            console.warn('⚠️ Tidak dapat terhubung ke backend!');
            // Tampilkan pesan di chat
            addMessage('assistant', `⚠️ **Gagal terhubung ke backend!**

Pastikan backend berjalan di: \`${BACKEND_URL}\`

Cara mengecek:
1. Buka \`${BACKEND_URL}/health\` di browser
2. Jika muncul JSON, backend berjalan
3. Jika tidak, restart backend Anda`);
        } else {
            console.log('✅ Backend connected successfully!');
        }
    });

    // Inisialisasi chat
    if (!chats[currentChatId]) {
        chats[currentChatId] = [];
        chats[currentChatId].push({
            role: 'assistant',
            content: `👋 Halo! Saya **Zyrex AI**, asisten cerdas buatan **Ziferr**.

📌 Saya bisa membantu:
• Coding (semua bahasa)
• Pertanyaan umum
• Penjelasan konsep
• Dan lainnya!

💡 Coba tanyakan apa saja, saya siap membantu!`
        });
        saveChat(currentChatId, chats[currentChatId]);
    }

    renderMessages(currentChatId);
    renderHistory();

    // Log startup
    console.log('='.repeat(60));
    console.log('🚀 ZYREX AI - FRONTEND');
    console.log('='.repeat(60));
    console.log('📌 Developer: Ziferr');
    console.log('🔗 Backend URL:', BACKEND_URL);
    console.log('💬 Chat ID:', currentChatId);
    console.log('📦 Chat history:', Object.keys(chats).length, 'sessions');
    console.log('='.repeat(60));
    console.log('💡 Tips:');
    console.log('  - Ketik pesan lalu Enter');
    console.log('  - Klik 🎤 untuk rekam suara');
    console.log('  - Klik kode untuk menyalin');
    console.log('  - Gunakan 🌙 untuk dark mode');
    console.log('='.repeat(60));
});