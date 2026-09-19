class ApiClient {
    // Specific Profile URLs
    static URL_DOLLAR = "https://www.tgju.org/profile/price_dollar_rl";
    static URL_GOLD = "https://www.tgju.org/profile/geram18";

    // Proxies & Fallback
    // Native Background Proxy is now the primary method.
    static FALLBACK_API = "https://brsapi.ir/FreeTether/latest";

    // --- Helper: Fetch via Background Script ---
    static async fetchViaBackground(url) {
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(
                    { action: "PROXY_FETCH", url: url },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.warn("BG Proxy Error:", chrome.runtime.lastError);
                            reject(chrome.runtime.lastError);
                            return;
                        }
                        if (response && response.success) {
                            resolve(response.data);
                        } else {
                            reject(new Error(response.error || "Unknown Error"));
                        }
                    }
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    // --- Price Logic ---

    static async fetchNews() {
        // ... (News logic is fine, logic error fixed previously)
        const rssUrl = 'http://rss.cnn.com/rss/cnn_topstories.rss';
        const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

        try {
            // Use Background Fetch
            const responseText = await this.fetchViaBackground(apiUrl);
            const data = JSON.parse(responseText);

            if (data.status === 'ok' && data.items && data.items.length > 0) {
                const cutoff = Date.now() - (34 * 60 * 60 * 1000);
                const recentItem = data.items.find(item => {
                    if (!item.pubDate) return false;
                    let dateStr = item.pubDate.replace(' ', 'T');
                    if (!dateStr.endsWith('Z')) dateStr += 'Z';
                    return new Date(dateStr).getTime() > cutoff;
                });

                if (recentItem) return { title: recentItem.title, url: recentItem.link };
            }
        } catch (e) {
            console.warn("News Fetch Failed", e);
        }
        return null;
    }

    static async fetchSuggestions(query) {
        if (!query) return [];

        return new Promise((resolve) => {
            // Send to background script (Bypasses CORS)
            try {
                // Keep existing specialized handler
                chrome.runtime.sendMessage(
                    { action: "FETCH_SUGGESTIONS", query: query },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.warn("Background Error:", chrome.runtime.lastError);
                            resolve([]);
                            return;
                        }
                        if (response && response.success) {
                            resolve(response.data);
                        } else {
                            resolve([]);
                        }
                    }
                );
            } catch (e) {
                console.warn("Extension Context Invalidated?", e);
                resolve([]);
            }
        });
    }


    static async fetchPrices() {
        // Fetch Parallel
        const [usdData, goldData] = await Promise.all([
            this.fetchProfileData(this.URL_DOLLAR),
            this.fetchProfileData(this.URL_GOLD)
        ]);

        // If both failed, try fallback API
        if (usdData.price === 'Error' && goldData.price === 'Error') {
            return this.fetchFallbackApi();
        }

        return { usd: usdData, gold: goldData };
    }

    static async fetchProfileData(url) {
        try {
            // Direct Background Fetch (No External Proxy needed, Extension has permissions)
            const html = await this.fetchViaBackground(url);
            return this.parseProfilePage(html);
        } catch (e) {
            // console.warn("Direct BG Fetch failed for", url, e);
        }
        return { price: 'Error', trend: 'flat' };
    }

    static parseProfilePage(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Selectors for TGJU Profile Page
            // 1. "Current Rate" Value inside info-price-left
            let el = doc.querySelector('.info-price-left .value');
            if (el) return { price: this.cleanPrice(el.innerText), trend: 'flat' };

            // 2. Generic Price Tags
            el = doc.querySelector('.price');
            if (el && el.innerText.match(/\d/)) return { price: this.cleanPrice(el.innerText), trend: 'flat' };

            // 3. Table scrape fallback
            const rows = doc.querySelectorAll('tr');
            for (let row of rows) {
                if (row.innerText.includes('نرخ فعلی') || row.innerText.includes('Current')) {
                    const val = row.querySelector('td:nth-child(2), .value');
                    if (val) return { price: this.cleanPrice(val.innerText), trend: 'flat' };
                }
            }
        } catch (e) {
            // console.warn("Scraping error for HTML", e);
        }
        return { price: 'Error', trend: 'flat' };
    }

    // Kept for backward compat referencing, but logic moved to parseProfilePage
    static async scrapeProfilePage(url) { return 'Error'; }

    static async fetchFallbackApi() {
        try {
            console.log("Using Fallback API via BG...");
            const responseText = await this.fetchViaBackground(this.FALLBACK_API);
            const json = JSON.parse(responseText);
            const usdPrice = json.usd?.price || json.currency?.find(c => c.name === 'usd')?.price;
            const goldPrice = json.gold?.price || json.currency?.find(c => c.name === 'gold')?.price;
            return {
                usd: { price: parseFloat(usdPrice).toLocaleString() || 'Error', trend: 'flat' },
                gold: { price: goldPrice ? parseFloat(goldPrice).toLocaleString() : 'Error', trend: 'flat' }
            };
        } catch (e) { console.warn("Fallback Failed", e); }
        return { usd: { price: 'Error', trend: 'flat' }, gold: { price: 'Error', trend: 'flat' } };
    }

    static cleanPrice(text) {
        const match = text.match(/[\d,]+/);
        return match ? match[0] : 'Error';
    }

    // --- Google Favicon Logic (Replaces Noun Project) ---
    // User requested to "delete it" if it's broken. Google Favicon is robust.
    static getFavicon(url) {
        try {
            const domain = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?sz=128&domain_url=${domain}`;
        } catch (e) {
            return `https://ui-avatars.com/api/?name=?&background=333&color=fff&size=128`;
        }
    }
}
