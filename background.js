chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "FETCH_SUGGESTIONS") {
        const query = request.query;
        const targetUrl = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;

        fetch(targetUrl)
            .then(response => response.json())
            .then(data => sendResponse({ success: true, data: data[1] || [] }))
            .catch(error => sendResponse({ success: false, error: error.message }));

        return true; // Keep channel open
    }

    if (request.action === "PROXY_FETCH") {
        fetch(request.url)
            .then(async response => {
                if (!response.ok) throw new Error(response.statusText);
                const text = await response.text();
                sendResponse({ success: true, data: text });
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});
