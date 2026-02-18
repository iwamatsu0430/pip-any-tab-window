// Handle messages from popup for tabCapture
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "getMediaStreamId") {
    const tabId = message.tabId;

    if (!tabId) {
      sendResponse({ error: "No tab ID provided" });
      return true;
    }

    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId, consumerTabId: tabId }, (streamId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ streamId });
      }
    });

    return true; // Keep the message channel open for async response
  }
});
