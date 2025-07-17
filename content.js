function getLocalTimeString() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function logWithTime(message) {
  console.log(`[${getLocalTimeString()} c] ${message}`);
}

logWithTime('Content script loaded');

let keywordCache = {};
let settingsCache = {
  checkInterval: 2000,
  extensionEnabled: true
};
let isProcessing = false;
let observer = null;
let eventListeners = {
  click: null
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateSettings") {
    logWithTime('Получен запрос на обновление настроек');
    loadData();
    sendResponse({success: true});
  } else if (request.action === "clearCache") {
    logWithTime('Получен запрос на очистку кэша');
    keywordCache = {};
    settingsCache = {
      checkInterval: 2000,
      extensionEnabled: true
    };
    if (observer) {
      observer.disconnect();
      logWithTime('MutationObserver отключен');
    }
    observer = null;
    loadData();
    sendResponse({success: true});
  }
  return true;
});

function initializeObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
    logWithTime('Существующий MutationObserver отключен');
  }
  
  if (!settingsCache.extensionEnabled) {
    logWithTime('Наблюдатель не инициализирован (расширение выключено)');
    return;
  }

  observer = new MutationObserver((mutations) => {
    if (isProcessing) {
      logWithTime('Пропуск обработки мутаций (уже идет обработка)');
      return;
    }
    
    const hasRelevantMutations = mutations.some(mutation => 
      mutation.addedNodes.length > 0 && 
      Array.from(mutation.addedNodes).some(node => 
        node.nodeType === Node.ELEMENT_NODE && 
        node.textContent.trim().length > 0
      )
    );
    
    if (hasRelevantMutations) {
      //logWithTime(`Обнаружены релевантные мутации (${mutations.length})`);
      clearTimeout(window.highlightDebounce);
      window.highlightDebounce = setTimeout(() => {
        highlightKeywords();
      }, settingsCache.checkInterval);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
  
  logWithTime('MutationObserver инициализирован');

  if (eventListeners.click) {
    document.body.removeEventListener('click', eventListeners.click);
    logWithTime('Старый обработчик кликов удален');
  }
  
  eventListeners.click = (e) => {
    if (!settingsCache.extensionEnabled) return;
    const keywordElement = e.target.closest('.keyword-hint');
    if (keywordElement) {
      e.preventDefault();
      e.stopPropagation();
      const keyword = keywordElement.dataset.keyword;
      logWithTime(`Клик по ключевому слову: ${keyword}`);
      showPopup(keywordElement, keywordCache[keyword]);
    }
  };
  
  document.body.addEventListener('click', eventListeners.click);
  logWithTime('Новый обработчик кликов добавлен');
}

function loadData() {
  logWithTime('Загрузка данных...');
  chrome.storage.local.get(['keywords'], (result) => {
    keywordCache = result.keywords || {};
    logWithTime(`Ключевые слова загружены в кэш: ${Object.keys(keywordCache).length} записей`);
    
    chrome.storage.sync.get(['checkInterval', 'extensionEnabled', 'highlightTextColor', 'highlightBgColor'], (result) => {
      settingsCache.checkInterval = result.checkInterval || 2000;
      settingsCache.extensionEnabled = result.extensionEnabled !== false;
      logWithTime(`Настройки загружены: ${JSON.stringify(settingsCache)}`);
      
      initializeObserver();
      
      if (settingsCache.extensionEnabled) {
        logWithTime('Расширение AUS Code Dictionary - запущено!');
        highlightKeywords();
      }
    });
  });
}

//function shouldRunOnCurrentSite() {
//  return true;
//}

function showPopup(element, text) {
  const existingPopup = document.querySelector('.keyword-hint-popup');
  if (existingPopup) {
    existingPopup.remove();
    //logWithTime('Существующее всплывающее окно удалено');
  }

  chrome.storage.sync.get(['popupFontFamily', 'popupFontSize', 'popupTextColor', 'popupBgColor'], (result) => {
    const popup = document.createElement('div');
    popup.className = 'keyword-hint-popup';
    popup.textContent = text;

    Object.assign(popup.style, {
      position: 'absolute',
      zIndex: '9999',
      backgroundColor: result.popupBgColor || 'rgba(255, 255, 255, 1)',
      color: result.popupTextColor || '#000000',
      border: '1px solid #ccc',
      borderRadius: '4px',
      padding: '6px 6px',
      boxShadow: '0 2px 2px rgba(0,0,0,0.1)',
      maxWidth: '300px',
      fontFamily: result.popupFontFamily || 'Arial, sans-serif',
      fontSize: result.popupFontSize || '14px',
      top: `${element.getBoundingClientRect().top + window.scrollY - 35}px`,
      left: `${element.getBoundingClientRect().left + window.scrollX}px`
    });

    document.body.appendChild(popup);
    //logWithTime('Всплывающее окно создано');

    setTimeout(() => {
      const clickHandler = (e) => {
        if (!popup.contains(e.target) && e.target !== element) {
          popup.remove();
          document.removeEventListener('click', clickHandler);
          //logWithTime('Всплывающее окно закрыто');
        }
      };
      document.addEventListener('click', clickHandler);
    }, 50);
  });
}

function highlightKeywords() {
  if (!settingsCache.extensionEnabled) {
    logWithTime('Подсветка пропущена (расширение выключено)');
    return;
  }
  if (isProcessing || Object.keys(keywordCache).length === 0) {
    logWithTime('Подсветка пропущена (уже идет обработка или нет ключевых слов)');
    return;
  }
  isProcessing = true;

  console.time('HighlightKeywords');
  const keywords = Object.keys(keywordCache);
  const regex = new RegExp(`(^|\\s)(${keywords.map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})(?=\\s|$)`, 'g');

  chrome.storage.sync.get(['highlightTextColor', 'highlightBgColor'], (result) => {
    const textColor = result.highlightTextColor || '#0066cc';
    const bgColor = result.highlightBgColor === 'transparent' ? 'transparent' : 
                   (result.highlightBgColor || 'transparent');

    const treeWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      { 
        acceptNode: (node) => 
          node.textContent.trim().length > 0 && 
          node.parentNode.childNodes.length === 1 && 
          !node.parentNode.classList.contains('keyword-hint') 
          ? NodeFilter.FILTER_ACCEPT 
          : NodeFilter.FILTER_REJECT 
      }
    );

    let processedCount = 0;
    const textNodes = [];
    let currentNode;

    while ((currentNode = treeWalker.nextNode())) {
      textNodes.push(currentNode);
    }

    logWithTime(`Найдено ${textNodes.length} текстовых узлов для обработки`);

    textNodes.forEach(node => {
      const text = node.textContent;
      const matches = text.match(regex);
      
      if (matches && matches.length > 0) {
        const parent = node.parentNode;
        const newHTML = text.replace(regex, (fullMatch, space, match) => 
          `${space}<span class="keyword-hint" data-keyword="${match}" 
            style="color: ${textColor}; ${bgColor !== 'transparent' ? `background-color: ${bgColor};` : ''} 
            text-decoration: underline; cursor: pointer;">${match}</span>`
        );
        
        if (newHTML !== text) {
          parent.innerHTML = newHTML;
          processedCount++;
        }
      }
    });

    console.timeEnd('HighlightKeywords');
    logWithTime(`Обработано ${processedCount} элементов с ключевыми словами`);
    isProcessing = false;
  });
}

if (document.readyState === 'complete') {
  loadData();
} else {
  window.addEventListener('load', loadData);
}