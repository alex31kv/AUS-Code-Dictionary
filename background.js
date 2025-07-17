function getLocalTimeString() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function logWithTime(message) {
  console.log(`[${getLocalTimeString()} bg] ${message}`);
}

function loadKeywords() {
  fetch(chrome.runtime.getURL('keywords.json'))
    .then(response => response.json())
    .then(data => {
      chrome.storage.local.set({ keywords: data }, () => {
        logWithTime(`Ключевые слова загружены и сохранены: ${Object.keys(data).length} записей`);
      });
    })
    .catch(error => {
      logWithTime(`Ошибка загрузки ключевых слов: ${error}`);
    });
}

chrome.runtime.onInstalled.addListener(() => {
  logWithTime('Расширение установлено');
  chrome.storage.sync.set({ extensionEnabled: true });
  logWithTime('Установлено состояние по умолчанию (включено)');
  loadKeywords();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "reloadKeywords") {
    loadKeywords();
    sendResponse({success: true});
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.extensionEnabled) {
    logWithTime(`Обнаружено изменение состояния расширения: ${changes.extensionEnabled.newValue}`);
    chrome.tabs.query({}, (tabs) => {
      logWithTime(`Отправка обновлений в ${tabs.length} вкладок`);
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: "updateSettings"
          }).catch(err => {
            logWithTime(`Ошибка отправки сообщения вкладке ${tab.id}: ${err}`);
          });
        }
      });
    });
  }
});