function getLocalTimeString() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function logWithTime(message) {
  console.log(`[${getLocalTimeString()} p] ${message}`);
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const elements = {
      dictionarySelect: document.getElementById('dictionarySelect'),
      keywordCount: document.getElementById('keyword-count'),
      saveSettings: document.getElementById('saveSettings'),
      closePopup: document.getElementById('closePopup'),
      extensionEnabled: document.getElementById('extensionEnabled'),
      clearCache: document.getElementById('clearCache'),
	  checkUpdates: document.getElementById('checkUpdates'),
      status: document.getElementById('status')
    };

    // Проверка всех необходимых элементов
    for (const [name, element] of Object.entries(elements)) {
      if (!element) {
        throw new Error(`Элемент ${name} не найден`);
      }
    }

    loadAvailableDictionaries();
    loadData();
    
    elements.saveSettings.addEventListener('click', saveSettings);
    elements.closePopup.addEventListener('click', closePopup);
    elements.extensionEnabled.addEventListener('change', toggleExtension);
    elements.clearCache.addEventListener('click', clearCache);
    elements.dictionarySelect.addEventListener('change', changeDictionary);
	elements.checkUpdates.addEventListener('click', checkForUpdates);

    logWithTime('Popup инициализирован');
  } catch (error) {
    logWithTime(`Ошибка инициализации: ${error.message}`);
  }
});

function loadData() {
  try {
    const manifest = chrome.runtime.getManifest();
    document.getElementById('extension-version').textContent = manifest.version;
	  
    chrome.storage.local.get(['keywords'], (result) => {
      const keywordCountElement = document.getElementById('keyword-count');
      if (keywordCountElement) {
        keywordCountElement.textContent = Object.keys(result.keywords || {}).length;
        logWithTime(`Загружено ключевых слов: ${Object.keys(result.keywords || {}).length}`);
      }
    });

    chrome.storage.sync.get([
      'checkInterval', 'popupFontFamily', 'popupFontSize', 
      'extensionEnabled', 'popupTextColor', 'popupBgColor', 
      'highlightTextColor', 'highlightBgColor'
    ], (result) => {
      try {
        document.getElementById('checkInterval').value = result.checkInterval || 1500;
        
        document.getElementById('popupFontFamily').value = 
          result.popupFontFamily || 'Arial, sans-serif';
        document.getElementById('popupFontSize').value = 
          result.popupFontSize || '12px';
        
        const isEnabled = result.extensionEnabled !== false;
        document.getElementById('extensionEnabled').checked = isEnabled;
        updateExtensionStatusLabel(isEnabled);

        document.getElementById('popupTextColor').value = result.popupTextColor || '#000000';
        document.getElementById('popupBgColor').value = result.popupBgColor || '#ffffff';
        document.getElementById('highlightTextColor').value = result.highlightTextColor || '#0066cc';
        
        const isTransparent = result.highlightBgColor === 'transparent';
        document.getElementById('transparentBgCheckbox').checked = isTransparent;
        if (!isTransparent && result.highlightBgColor) {
          document.getElementById('highlightBgColor').value = result.highlightBgColor;
        }

        logWithTime('Настройки загружены из storage.sync');
      } catch (error) {
        logWithTime(`Ошибка загрузки настроек: ${error}`);
      }
    });
  } catch (error) {
    logWithTime(`Ошибка в loadData: ${error}`);
  }
}

function loadAvailableDictionaries() {
  chrome.runtime.getPackageDirectoryEntry((root) => {
    root.createReader().readEntries((entries) => {
      const dictionaries = entries.filter(entry => 
        entry.name.startsWith('keywords_') && entry.name.endsWith('.json')
      ).map(entry => entry.name);
      
      const select = document.getElementById('dictionarySelect');
      select.innerHTML = '';
      
      dictionaries.forEach(dict => {
        const option = document.createElement('option');
        option.value = dict;
        option.textContent = dict.replace('keywords_', '').replace('.json', '');
        select.appendChild(option);
      });
      
      chrome.storage.sync.get(['selectedDictionary'], (result) => {
        const defaultDict = dictionaries.includes('keywords_VNPZ.json') 
          ? 'keywords_VNPZ.json' 
          : (dictionaries.length > 0 ? dictionaries[0] : null);
        
        if (result.selectedDictionary && dictionaries.includes(result.selectedDictionary)) {
          select.value = result.selectedDictionary;
        } else if (defaultDict) {
          select.value = defaultDict;
          chrome.storage.sync.set({ selectedDictionary: defaultDict });
        }
      });
    });
  });
}

function changeDictionary() {
  const selectedDictionary = document.getElementById('dictionarySelect').value;
  chrome.storage.sync.set({ selectedDictionary }, () => {
    showStatus(`Загрузка словаря: ${selectedDictionary}`);
    document.getElementById('keyword-count').textContent = '0';
    
    chrome.runtime.sendMessage({action: "reloadKeywords"}, (response) => {
      if (response?.success) {
        saveSettings();
		loadData();
        showStatus(`Словарь загружен: ${selectedDictionary}`);
      } else {
        showStatus('Ошибка загрузки словаря');
      }
    });
  });
}

function toggleExtension() {
  try {
    const isEnabled = document.getElementById('extensionEnabled').checked;
    updateExtensionStatusLabel(isEnabled);
    chrome.storage.sync.set({ extensionEnabled: isEnabled }, () => {
      const message = isEnabled ? 'Расширение включено' : 'Расширение отключено';
      showStatus(message);
      logWithTime(message);
      updateActiveTab().catch(error => {
        logWithTime(`Не удалось обновить вкладку: ${error}`);
      });
    });
  } catch (error) {
    logWithTime(`Ошибка в toggleExtension: ${error}`);
  }
}

function updateExtensionStatusLabel(isEnabled) {
  const label = document.getElementById('extensionStatusLabel');
  if (label) {
    label.textContent = isEnabled ? 'Включено' : 'Отключено';
  }
}

function saveSettings() {
  try {
    const highlightBgColor = document.getElementById('transparentBgCheckbox')?.checked 
      ? 'transparent' 
      : document.getElementById('highlightBgColor')?.value || '#ffffff';

    const settings = {
      checkInterval: parseInt(document.getElementById('checkInterval').value) || 1500,
      popupFontFamily: document.getElementById('popupFontFamily').value,
      popupFontSize: document.getElementById('popupFontSize').value,
      popupTextColor: document.getElementById('popupTextColor').value,
      popupBgColor: document.getElementById('popupBgColor').value,
      highlightTextColor: document.getElementById('highlightTextColor').value,
      highlightBgColor: highlightBgColor,
      extensionEnabled: document.getElementById('extensionEnabled').checked
    };

    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        showStatus('Ошибка сохранения: ' + chrome.runtime.lastError.message);
        logWithTime('Ошибка сохранения: ' + chrome.runtime.lastError.message);
      } else {
        showStatus('Настройки сохранены!');
        logWithTime('Настройки сохранены: ' + JSON.stringify(settings));
        
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "updateSettings",
              settings: settings
            }).catch(err => {
              logWithTime(`Не удалось обновить настройки во вкладке: ${err}`);
            });
          }
        });
      }
    });
  } catch (error) {
    logWithTime(`Ошибка сохранения настроек: ${error}`);
    showStatus('Ошибка сохранения настроек');
  }
}

function clearCache() {
  try {
    chrome.runtime.sendMessage({action: "reloadKeywords"}, (response) => {
      if (chrome.runtime.lastError) {
        logWithTime(`Ошибка при перезагрузке keywords_.json: ${chrome.runtime.lastError.message}`);
        showStatus('Ошибка при перезагрузке словаря');
      } else {
        showStatus('Словарь перезагружен!');
        logWithTime('Keywords.json успешно перезагружен');
        loadData();
      }
    });
  } catch (error) {
    logWithTime(`Ошибка в popup.js clearCache: ${error}`);
    showStatus('Ошибка при перезагрузке');
  }
}

function closePopup() {
  try {
    window.close();
  } catch (error) {
    logWithTime(`Ошибка при закрытии popup: ${error}`);
  }
}

function showStatus(message) {
  try {
    const status = document.getElementById('status');
    if (status) {
      status.textContent = message;
      status.style.display = 'block';
      setTimeout(() => {
        if (status) {
          status.style.display = 'none';
        }
      }, 2000);
    }
  } catch (error) {
    logWithTime(`Ошибка отображения статуса: ${error}`);
  }
}

async function updateActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {action: "updateSettings"});
    }
  } catch (error) {
    logWithTime(`Ошибка обновления вкладки: ${error}`);
  }
}

function checkForUpdates() {
  try {
    showStatus('Проверка обновлений...');
    const currentVersion = document.getElementById('extension-version').textContent;
    
    fetch('https://api.github.com/repos/alex31kv/AUS-Code-Dictionary/releases/latest')
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then(data => {
        const latestVersion = data.tag_name.replace(/^v/, ''); // Удаляем 'v' из версии если есть
        logWithTime(`Текущая версия: ${currentVersion}, последняя версия: ${latestVersion}`);
        
        if (isNewerVersion(latestVersion, currentVersion)) {
          showStatus(`Доступна новая версия: ${latestVersion}`);
          if (confirm(`Доступна новая версия ${latestVersion} (у вас ${currentVersion}). Хотите перейти на страницу загрузки?`)) {
            chrome.tabs.create({ url: data.html_url });
          }
        } else {
          showStatus('Вы пользуетесь последней версией');
        }
      })
      .catch(error => {
        logWithTime(`Ошибка при проверке обновлений: ${error}`);
        showStatus('Ошибка при проверке обновлений');
      });
  } catch (error) {
    logWithTime(`Ошибка в checkForUpdates: ${error}`);
    showStatus('Ошибка при проверке обновлений');
  }
}

function isNewerVersion(latest, current) {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;
    
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  
  return false;
}