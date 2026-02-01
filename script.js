document.addEventListener('DOMContentLoaded', () => {

    // --- SPOTLIGHT THEMES ---
    // User wants: "the first gray you used" (Static Background)
    // And "only that purple color that we had before should change" (Spotlight/Accent)
    // We will apply a static dark background and a dynamic radial spotlight.

    const spotlights = [
        { name: 'Purple', color: 'rgba(120, 50, 200, 0.15)', text: '#d8b4fe' },
        { name: 'Blue', color: 'rgba(41, 151, 255, 0.15)', text: '#7dcfff' },
        { name: 'Teal', color: 'rgba(50, 200, 180, 0.15)', text: '#5eead4' },
        { name: 'Rose', color: 'rgba(230, 50, 100, 0.15)', text: '#fda4af' },
        { name: 'Gold', color: 'rgba(230, 180, 50, 0.15)', text: '#fde047' },
        { name: 'Lime', color: 'rgba(132, 204, 22, 0.15)', text: '#a3e635' },
        { name: 'Orange', color: 'rgba(251, 146, 60, 0.15)', text: '#fdba74' },
        { name: 'Cyan', color: 'rgba(34, 211, 238, 0.15)', text: '#67e8f9' },
        { name: 'Magenta', color: 'rgba(232, 121, 249, 0.15)', text: '#f0abfc' },
        { name: 'Silver', color: 'rgba(255, 255, 255, 0.12)', text: '#e5e7eb' }
    ];

    // Pick Random Spotlight
    const currentSpotlight = spotlights[Math.floor(Math.random() * spotlights.length)];

    // Static dark gray base + Dynamic Spotlight
    document.body.style.backgroundColor = '#050505'; // Almost Black
    document.body.style.backgroundImage = `radial-gradient(circle at 50% 30%, ${currentSpotlight.color} 0%, transparent 60%)`;

    // --- Clock ---
    const updateTime = () => {
        const now = new Date();
        document.getElementById('time-display').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

        const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', dateOptions);
        const dateEl = document.getElementById('date-display');
        if (dateEl) dateEl.textContent = dateStr;
    };
    setInterval(updateTime, 1000);
    updateTime();

    // --- Search ---
    const searchInput = document.getElementById('search-input');
    const suggestionsEl = document.getElementById('search-suggestions');
    let debounceTimer;

    const performSearch = (query) => {
        if (query) {
            window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        }
    };

    if (searchInput && suggestionsEl) {
        // Input Event: Fetch Suggestions
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();

            // Auto-RTL Detection (Persian/Arabic range)
            const isPersian = /[\u0600-\u06FF]/.test(query);
            searchInput.style.direction = isPersian ? 'rtl' : 'ltr';
            searchInput.style.textAlign = isPersian ? 'right' : 'left';

            clearTimeout(debounceTimer);

            if (query.length < 2) {
                suggestionsEl.classList.remove('visible');
                return;
            }

            debounceTimer = setTimeout(async () => {
                console.log("Fetching suggestions for:", query); // Debug
                const results = await ApiClient.fetchSuggestions(query);
                console.log("Results:", results); // Debug
                const topResults = results.slice(0, 3); // Max 3

                if (topResults.length > 0) {
                    suggestionsEl.innerHTML = topResults.map(text => `
                        <div class="suggestion-item" data-val="${text}">${text}</div>
                    `).join('');
                    suggestionsEl.classList.add('visible');

                    // Click Logic
                    document.querySelectorAll('.suggestion-item').forEach(item => {
                        item.addEventListener('click', () => {
                            performSearch(item.getAttribute('data-val'));
                        });
                    });
                } else {
                    suggestionsEl.classList.remove('visible');
                }
            }, 10); // Instant (10ms)
        });

        // Enter Key
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch(searchInput.value);
            }
        });

        // Click Outside to Close
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsEl.contains(e.target)) {
                suggestionsEl.classList.remove('visible');
            }
        });

        // Hide on Focus if empty? No, standard behavior is fine.
    }

    // --- References ---
    const shortcutsGrid = document.getElementById('shortcuts-grid');
    const addShortcutBtn = document.getElementById('add-shortcut-trigger');
    const modal = document.getElementById('shortcut-modal');
    const closeModal = document.getElementById('close-modal');
    const saveShortcutBtn = document.getElementById('save-shortcut');

    // Settings Refs
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const reloadBtn = document.getElementById('reload-extension');
    const clockStyleSelect = document.getElementById('clock-style-select'); // Kept hidden/legacy if needed
    const clockContainer = document.getElementById('clock-container');

    // --- Shortcuts Logic (Text Only) ---
    const loadShortcuts = () => {
        chrome.storage.local.get(['shortcuts'], (result) => {
            const shortcuts = result.shortcuts || [];
            renderShortcuts(shortcuts);
        });
    };

    const renderShortcuts = (shortcuts) => {
        // Clear grid but keep the Add button
        Array.from(shortcutsGrid.children).forEach(child => {
            if (!child.classList.contains('add-shortcut-btn')) {
                shortcutsGrid.removeChild(child);
            }
        });

        shortcuts.forEach((shortcut, index) => {
            let finalUrl = shortcut.url || '';
            if (finalUrl && !finalUrl.startsWith('http')) {
                finalUrl = 'https://' + finalUrl;
            }

            const card = document.createElement('a');
            card.className = 'shortcut-pill';
            card.href = finalUrl;
            card.target = "_self";

            // Subtle dynamic tint based on spotlight
            card.style.borderColor = currentSpotlight.text + '30';
            // Optional: text color match? Use white for clean look, border for accent
            // card.style.color = currentSpotlight.text; 

            card.innerHTML = `
                <span class="shortcut-text">${shortcut.title}</span>
                <button class="delete-btn"></button>
            `;

            // Delete Logic
            const delBtn = card.querySelector('.delete-btn');
            delBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                removeShortcut(index);
            });

            shortcutsGrid.insertBefore(card, addShortcutBtn);
        });
    };

    const removeShortcut = (index) => {
        chrome.storage.local.get(['shortcuts'], (result) => {
            const shortcuts = result.shortcuts || [];
            shortcuts.splice(index, 1);
            chrome.storage.local.set({ shortcuts }, loadShortcuts);
        });
    };

    // Add Shortcut Modal
    if (addShortcutBtn) addShortcutBtn.addEventListener('click', () => modal.style.display = 'flex');
    if (closeModal) closeModal.addEventListener('click', () => modal.style.display = 'none');

    // Remove old icon preview logic completely
    const urlInput = document.getElementById('shortcut-url');
    const iconPreview = document.getElementById('icon-results');
    if (urlInput && iconPreview) {
        iconPreview.innerHTML = '';
    }

    // Save Shortcut
    if (saveShortcutBtn) {
        saveShortcutBtn.addEventListener('click', () => {
            const titleInput = document.getElementById('shortcut-title');
            let urlVal = document.getElementById('shortcut-url').value;

            if (urlVal) {
                if (!urlVal.startsWith('http')) urlVal = 'https://' + urlVal;

                // If title is empty, generate from domain
                let title = (titleInput && titleInput.value) ? titleInput.value : new URL(urlVal).hostname.replace('www.', '').split('.')[0];
                title = title.charAt(0).toUpperCase() + title.slice(1);

                chrome.storage.local.get(['shortcuts'], (result) => {
                    const shortcuts = result.shortcuts || [];
                    shortcuts.push({ title, url: urlVal });
                    chrome.storage.local.set({ shortcuts }, () => {
                        modal.style.display = 'none';
                        if (titleInput) titleInput.value = '';
                        document.getElementById('shortcut-url').value = '';
                        loadShortcuts();
                    });
                });
            }
        });
    }

    // Settings Modal
    // Settings Modal (Settings Button Removed)
    // if (settingsBtn) { ... } removed

    if (closeSettings) {
        closeSettings.addEventListener('click', () => {
            if (settingsModal) settingsModal.style.display = 'none';
        });
    }
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            chrome.runtime.reload();
        });
    }

    // Click Outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
        if (e.target === settingsModal) settingsModal.style.display = 'none';
    });

    // --- Price Ticker (NO EMOJIS) ---
    const updatePrices = async () => {
        const usdEl = document.getElementById('price-usd');
        const goldEl = document.getElementById('price-gold');

        if (!usdEl || !goldEl) return;

        if (usdEl.innerText.includes('Loading')) usdEl.innerText = 'Updating...';

        const data = await ApiClient.fetchPrices();
        if (data) {
            const formatToman = (priceStr) => {
                if (priceStr === 'Error' || priceStr === 'Unavailable') return 'Unavailable';
                const num = parseInt(priceStr.replace(/,/g, ''));
                if (isNaN(num)) return priceStr;
                return (num / 10).toLocaleString();
            };

            const usdVal = formatToman(data.usd.price);
            // No Emojis, just clean text
            usdEl.innerHTML = `<span style="font-weight:600;">${usdVal}</span> <span style="font-size: 0.8em; opacity: 0.7;">Toman</span>`;
            usdEl.className = `price-value trend-${data.usd.trend}`;

            const goldVal = formatToman(data.gold.price);
            goldEl.innerHTML = `<span style="font-weight:600;">${goldVal}</span> <span style="font-size: 0.8em; opacity: 0.7;">Toman</span>`;
            goldEl.className = `price-value trend-${data.gold.trend}`;
        }
    };

    // --- News Widget ---
    const updateNews = async () => {
        const newsEl = document.getElementById('news-widget');
        const headlineEl = document.getElementById('news-headline');

        if (!newsEl || !headlineEl) return;

        const article = await ApiClient.fetchNews();
        if (article) {
            headlineEl.textContent = article.title;
            newsEl.href = article.url;
        } else {
            headlineEl.textContent = "No breaking news available.";
        }
    };

    // --- Sticky Notes System ---
    const notesContainer = document.getElementById('notes-container');
    const addNoteBtn = document.getElementById('add-note-btn');
    let notes = []; // { id, x, y, text }

    // Load Notes
    chrome.storage.local.get(['stickyNotes'], (result) => {
        if (result.stickyNotes) {
            notes = result.stickyNotes;
            notes.forEach(noteData => createNoteElement(noteData, false));
        }
    });

    const saveNotes = () => {
        chrome.storage.local.set({ stickyNotes: notes });
    };

    const autoResize = (textarea) => {
        textarea.style.height = 'auto'; // Reset to shrink if needed
        const newHeight = textarea.scrollHeight;
        textarea.style.height = `${newHeight}px`;
    };

    const createNoteElement = (noteData, isNew = false) => {
        const noteEl = document.createElement('div');
        noteEl.className = 'sticky-note';
        noteEl.style.left = `${noteData.x}px`;
        noteEl.style.top = `${noteData.y}px`;

        noteEl.innerHTML = `
            <div class="note-header">
                <button class="note-close"></button>
            </div>
            <textarea class="note-content" placeholder="Note...">${noteData.text}</textarea>
        `;

        notesContainer.appendChild(noteEl);

        const textarea = noteEl.querySelector('.note-content');
        const closeBtn = noteEl.querySelector('.note-close');
        const header = noteEl.querySelector('.note-header');

        // Init Height
        if (noteData.text) setTimeout(() => autoResize(textarea), 0);

        // Update Text & Size
        textarea.addEventListener('input', () => {
            autoResize(textarea);
            noteData.text = textarea.value;
            saveNotes();
        });

        // Delete Note
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notes = notes.filter(n => n.id !== noteData.id);
            noteEl.remove();
            saveNotes();
        });

        // Drag Logic
        header.addEventListener('mousedown', (e) => {
            e.preventDefault();
            let startX = e.clientX;
            let startY = e.clientY;
            let startLeft = noteEl.offsetLeft;
            let startTop = noteEl.offsetTop;

            const onMouseMove = (ev) => {
                const deltaX = ev.clientX - startX;
                const deltaY = ev.clientY - startY;
                noteEl.style.left = `${startLeft + deltaX}px`;
                noteEl.style.top = `${startTop + deltaY}px`;
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                noteData.x = parseInt(noteEl.style.left);
                noteData.y = parseInt(noteEl.style.top);
                saveNotes();
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        if (isNew) {
            textarea.focus();
        }
    };

    // Spawn Note Button
    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', () => {
            const newNote = {
                id: Date.now(),
                x: 100, // Default spawn position
                y: 100,
                text: ''
            };
            notes.push(newNote);
            createNoteElement(newNote, true);
            saveNotes();
        });
    }

    // Initialize
    // Initialize
    try {
        if (typeof ApiClient === 'undefined') {
            document.getElementById('news-headline').textContent = "Error: ApiClient missing.";
            console.error("ApiClient is not defined. Check api.js syntax.");
        } else {
            loadShortcuts();
            updatePrices();
            updateNews();
            setInterval(updatePrices, 300000); // 5 mins
            setInterval(updateNews, 900000); // 15 mins for news
        }
    } catch (e) {
        console.error("Init Failed:", e);
    }
});
