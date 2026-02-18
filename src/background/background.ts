chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getMediaStreamId") {
    const tabId = sender.tab?.id;

    if (!tabId) {
      sendResponse({ error: "No tab ID found" });
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
