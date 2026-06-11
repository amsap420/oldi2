// ============================================================================
// 🧠 هسته فرماندهی دستیار (sidepanel.js) - نسخه ۸.۹.۵ (تکامل ارگونومی خط اول)
// مجهز به مهار هویت پویا، پایش مقدمات تیکت صرافی (سقف ۱۲ خط) و موتور شلیک موشک آنی
// ============================================================================

const MAX_SLOTS = 3;
let activeSlotIndex = 0;
let cachedKnowledgeShelf = [];

function createEmptySlot(index) {
    return {
        id: index,
        history: [], 
        rawHistoryInput: '', 
        draftInput: '', 
        customerName: '',
        customerGender: 'male', 
        selectedModel: 'gemini-3.1-flash-lite',
        lastQuickOutput: 'منتظر دریافت اطلاعات...',
        lastDetailedOutput: 'منتظر دریافت اطلاعات...',
        activeTab: 'detailed'
    };
}

let slots = [createEmptySlot(0), createEmptySlot(1), createEmptySlot(2)];
function getActiveSlot() { return slots[activeSlotIndex]; }

function saveSlotsState() {
    chrome.storage.local.set({ appSlotsState: slots });
}

function loadSlotsState(callback) {
    chrome.storage.local.get(['appSlotsState'], (res) => {
        if (res.appSlotsState && res.appSlotsState.length === MAX_SLOTS) {
            slots = res.appSlotsState;
        }
        if (callback) callback();
    });
}

function cleanCRMHistory(rawText) {
    if (!rawText) return '';
    const timeStampRegex = /(فروردین|اردیبهشت|خرداد|خرد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)\s+\d{1,2}[،,]\s+\d{1,2}:\d{2}\s*(ق\.ظ\.|ب\.ظ\.|ق\.ظ|ب\.ظ|AM|PM)?/g;
    const standardTimeRegex = /\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?/g;
    
    let cleaned = rawText.replace(timeStampRegex, '');
    cleaned = cleaned.replace(standardTimeRegex, '');
    cleaned = cleaned.replace(/^\s*[\r\n]/gm, '').trim(); 
    return cleaned;
}

function sanitizeStreamData(rawText) {
    if (!rawText) return '';
    let clean = rawText.trim();
    clean = clean.replace(/^\{"success"\s*:\s*true\s*,\s*"reply"\s*:\s*"/g, '');
    clean = clean.replace(/"\s*\}\s*$/g, '');
    clean = clean.replace(/\\n/g, '\n');
    clean = clean.replace(/\\"|""/g, '"');
    clean = clean.replace(/\\r/g, '');
    clean = clean.replace(/\\/g, '');
    if (clean.startsWith('"')) clean = clean.substring(1);
    if (clean.endsWith('"')) clean = clean.substring(0, clean.length - 1);
    return clean.trim();
}

function getShiftContext() {
    const hour = new Date().getHours();
    let shift = "بامداد";
    if (hour >= 6 && hour < 12) shift = "صبح";
    else if (hour >= 12 && hour < 18) shift = "عصر";
    else if (hour >= 18 && hour < 24) shift = "شب";
    return `🕒 [زمان آگاهی سیستم]: اکنون زمان شیفت "${shift}" صرافی است. احوال‌پرسی‌ها را با این اتمسفر هماهنگ کن.`;
}

const ARCHETYPES = {
    normal: 'پاسخ قبلی را به یک لحن کاملا استاندارد، پیش‌فرض، خنثی و بدون هیچ‌گونه مبالغه روانی یا قاطعیتِ بیش از حد تبدیل کن.',
    zeus: 'پاسخ قبلی را بازنویسی کن. لحن تو باید کاملاً مدرن، خنثی، اما به شدت قاطع، رسمی، محکم و مقتدر باشد. تمام تعارفات سنتی اداری، ادبیات بروکراسی دولتی و کلمات قلمبه‌سلمبه را کاملاً حذف کن. کوتاه، محکم و قفل روی بندهای قوانین صرافی بیت‌پین بدون یک گام عقب‌نشینی.',
    hestia: 'پاسخ قبلی را بازنویسی کن با لحن به شدت صمیمی، همدلانه، پذیرنده و آرام‌بخش تا تنش روانی مشتری شاکی کاملاً خنثی شود.',
    hades: 'پاسخ قبلی را بازنویسی کن. لحن تو باید کاملاً فنی، مهندسی، گام‌به‌گام و مینی‌مال باشد. از حاشیه‌پردازی‌های فلسفی بی‌ربط و ایجاد ابهام بیهوده اکیداً خودداری کن. تمام تمرکز پاسخ را منحصراً روی فاکتورهای قطعی شبکه بلاکچین (مانند کدهای هش تایید TXID، وضعیت کانفرمیشن نودها، بررسی تایید ممو و کارمزد شبکه) بگذار.'
};

document.addEventListener('DOMContentLoaded', () => {

    const tabButtons       = document.querySelectorAll('.slot-tab');
    const historyInput     = document.getElementById('history-raw-input');
    const draftInput       = document.getElementById('draft-input');
    const customerName     = document.getElementById('customer-name-input');
    const customerGender   = document.getElementById('customer-gender-select');
    const issueTagSelect   = document.getElementById('issue-tag-select');
    
    const analyzeBtn       = document.getElementById('btn-trigger-analysis');
    const outputCard       = document.getElementById('output-display-card');
    const modelSelect      = document.getElementById('select-active-agent');
    const wipeSlotBtn      = document.getElementById('btn-wipe-current-slot');
    const openDatabaseBtn  = document.getElementById('btn-open-database');
    
    const tabQuick         = document.getElementById('tab-quick');
    const tabDetailed      = document.getElementById('tab-detailed');
    const containerQuick   = document.getElementById('container-quick');
    const containerDetailed= document.getElementById('container-detailed');
    
    const copyQuickBtn     = document.getElementById('btn-copy-quick');
    const copyDetailedBtn  = document.getElementById('btn-copy-detailed');
    const likeQuickBtn     = document.getElementById('btn-like-quick');
    const likeDetailedBtn  = document.getElementById('btn-like-detailed');
    
    // سنسورهای جدید موشک جهت شلیک گسترش آنی
    const extendQuickBtn   = document.getElementById('btn-extend-quick');
    const extendDetailedBtn= document.getElementById('btn-extend-detailed');
    const archetypeBtns    = document.querySelectorAll('.archetype-btn');

    let accumulatedStreamText = ""; 

    function loadStorageDatabase() {
        chrome.storage.local.get(['knowledgeShelfDatabase'], (result) => {
            cachedKnowledgeShelf = result.knowledgeShelfDatabase || [];
        });
    }
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.knowledgeShelfDatabase) loadStorageDatabase();
    });

    if (openDatabaseBtn) {
        openDatabaseBtn.addEventListener('click', () => { 
            chrome.runtime.sendMessage({ action: 'openDatabaseWindow' });
        });
    }

    historyInput.addEventListener('input', () => { getActiveSlot().rawHistoryInput = historyInput.value; saveSlotsState(); });
    draftInput.addEventListener('input', () => { getActiveSlot().draftInput = draftInput.value; saveSlotsState(); });
    customerName.addEventListener('input', () => { getActiveSlot().customerName = customerName.value; saveSlotsState(); });
    customerGender.addEventListener('change', () => { getActiveSlot().customerGender = customerGender.value; saveSlotsState(); });
    if(modelSelect) modelSelect.addEventListener('change', () => { getActiveSlot().selectedModel = modelSelect.value; saveSlotsState(); });

    if (issueTagSelect) {
        issueTagSelect.addEventListener('change', () => {
            if (issueTagSelect.value) {
                const tagText = `[موضوع چت: ${issueTagSelect.value}]`;
                if (!draftInput.value.includes(tagText)) {
                    draftInput.value = (draftInput.value + ' ' + tagText).trim();
                    getActiveSlot().draftInput = draftInput.value;
                    saveSlotsState();
                }
                issueTagSelect.value = ""; 
            }
        });
    }

    function loadSlotState(index) {
        const slot = slots[index];
        historyInput.value = slot.rawHistoryInput || '';
        draftInput.value = slot.draftInput || '';
        customerName.value = slot.customerName || '';
        customerGender.value = slot.customerGender || 'male'; 
        if (modelSelect) modelSelect.value = slot.selectedModel || 'gemini-3.1-flash-lite';
        
        const currentQuickBox = document.getElementById('output-quick');
        const currentDetailedBox = document.getElementById('output-detailed');
        if (currentQuickBox) currentQuickBox.innerHTML = slot.lastQuickOutput || 'منتظر دریافت اطلاعات...';
        if (currentDetailedBox) currentDetailedBox.innerHTML = slot.lastDetailedOutput || 'منتظر دریافت اطلاعات...';
        
        if (slot.activeTab === 'quick' && tabQuick) tabQuick.click();
        if (slot.activeTab === 'detailed' && tabDetailed) tabDetailed.click();
        
        if (likeQuickBtn) lilyCheckLikedState(slot.lastQuickOutput, likeQuickBtn);
        if (likeDetailedBtn) lilyCheckLikedState(slot.lastDetailedOutput, likeDetailedBtn);

        renderHistoryList(slot);
    }

    function renderHistoryList(slot) {
        if (!outputCard) return;
        if (slot.history.length === 0) {
            outputCard.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 15px;">حافظه این صندلی پاک و آماده است.</div>`;
            return;
        }

        let html = '';
        slot.history.forEach(item => {
            const isBot = item.role === 'model';
            const bubbleClass = isBot ? 'chat-bubble-bot' : 'chat-bubble-user';
            const roleLabel = isBot ? '🤖 خروجی دستیار' : '👤 کانتکست چت ثبت‌شده';
            html += `
                <div class="${bubbleClass}">
                    <strong style="color: ${isBot ? 'var(--accent-blue)' : 'var(--accent-green)'}; font-size: 10px;">${roleLabel}:</strong>
                    <div style="white-space: pre-wrap; margin-top: 3px;">${item.parts}</div>
                </div>
            `;
        });
        outputCard.innerHTML = html;
        outputCard.scrollTop = outputCard.scrollHeight; 
    }

    tabButtons.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            tabButtons.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeSlotIndex = index;
            loadSlotState(index);
        });
    });

    if (wipeSlotBtn) {
        wipeSlotBtn.addEventListener('click', () => {
            slots[activeSlotIndex] = createEmptySlot(activeSlotIndex);
            saveSlotsState();
            loadSlotState(activeSlotIndex);
        });
    }

    // ============================================================================
    // 📡 موتور تحلیل و استریم مرکزی (مجهز به مدول توسعه آنی و تصحیح تفکیک لوپ)
    // ============================================================================
    function runCoreAnalysisEngine(isDirectExpansion = false, textToExpand = "") {
        const slot = getActiveSlot();
        const rawHist = historyInput.value.trim();
        const rawDraft = draftInput.value.trim();
        const cName = customerName.value.trim();
        const cGender = customerGender.value;

        if (!rawHist && !rawDraft && !isDirectExpansion) return;

        const cleanedHistory = cleanCRMHistory(rawHist);
        const isRefinementMode = !cleanedHistory && rawDraft && !isDirectExpansion;

        let masterInstruction = "شما دستیار ارشد پشتیبانی صرافی رمزارز بیت‌پین هستید.\n";
        const currentTag = rawDraft.includes("[موضوع چت: تعهدی]") ? "تعهدی" : "";
        
        cachedKnowledgeShelf.forEach(doc => {
            if (doc.scope === 'تعهدی' && currentTag !== 'تعهدی') return;
            if (!doc.scope || doc.scope === 'عمومی' || (doc.scope === 'تعهدی' && currentTag === 'تعهدی')) {
                masterInstruction += `[سند قوانین: ${doc.name}]\n${doc.content}\n---\n`;
            }
        });
        
        masterInstruction += getShiftContext() + "\n";
        
        // 🛠️ حل باگ قفل هویتی: صرفاً زمانی که اسم وارد شده باشد از پسوند/پیشوند جنسیت استفاده کن
        if (cName) {
            const genderFa = cGender === 'male' ? 'آقا' : cGender === 'female' ? 'خانم' : '';
            masterInstruction += `🚨 [قفل هویتی مشتری]: نام مشتری دقیقاً "${genderFa} ${cName}".trim() است. در طول مکالمه لحن را محترمانه بر اساس این هویت تنظیم کن.\n`;
        } else {
            masterInstruction += `🚨 [قفل هویتی مشتری]: نام مشتری اعلام نشده است. اکیداً ممنوع است که از کلمات خالی "آقا" یا "خانم" به صورت تنها و بدون اسم استفاده کنید. مکالمه را بدون خطاب قرار دادن نام یا جنسیت جلو ببرید.\n`;
        }

        // 🚨 اصلاح استراتژیک قانون تفکیک کادر کوتاه و تشریحی (رفع باگ نصف شدن پیام و تنظیم سقف ۱۲ خط)
        let lengthRule = `🚨 قانون مطلق ساختار پاسخ:
- نسخه [کوتاه]: باید یک خلاصه کامل، فشرده و کارآمد از کل پاسخ و کلید حل مشکل باشد (نباید فقط بخش اول یا ابتدای پیام را شامل شود). حداکثر ۲ خط.
- نسخه [تشریحی]: پاسخ اصلی، کامل، واضح و جامع است. محدودیت خطوط تشریحی به ۱۰ خط افزایش یافته است. اولویت تو این باشد که بین ۶ الی ۸ خط تمام مقدمات لازم (مانند سلام وقت بخیر، درک نگرانی کاربر) و راه‌حل فنی را جمع‌بندی کنی، اما حداکثر تا ۱۲ خط مجاز هستی تا جملات به دلیل کمبود فضا سانسور و فیلتر نشوند.`;

        analyzeBtn.disabled = true;
        analyzeBtn.textContent = '⏳ در حال استریم زنده کلمات...';
        
        const currentQuickBox = document.getElementById('output-quick');
        const currentDetailedBox = document.getElementById('output-detailed');
        if (currentQuickBox) currentQuickBox.innerHTML = "در حال فراخوانی مغز پردازشی...";
        if (currentDetailedBox) currentDetailedBox.innerHTML = "در حال فراخوانی مغز پردازشی...";
        accumulatedStreamText = ""; 

        let promptPayload = "";
        
        if (isDirectExpansion) {
            // 🚀 بدنه مدول گسترش آنی موشک: توسعه منطقی بدون بافتن حواشی اشتباه
            promptPayload += `🚨 دستور توسعه و گسترش عمیق: متن پاسخ زیر را به طور کامل، تخصصی و عمیق منبسط کن. 
قانون صلب و حیاتی: اگر موضوعی را بلد نیستی یا اطلاعات کافی در اسناد قوانین نداری، به هیچ وجه مطالب حاشیه‌ای، اضافی، حدسی و بی‌ربط (Fluff/Hallucination) اضافه نکن. منحصراً روی اطلاعات کمک‌کننده، واقعی و مرتبط تمرکز کن تا موضوع کاملاً برای کارشناس شفاف شود.\n\nمتن پاسخ جهت گسترش و عمق‌بخشی:\n${textToExpand}`;
            
            lengthRule = `- نسخه [کوتاه]: خلاصه فشرده از پاسخ گسترش یافته.\n- نسخه [تشریحی]: بدون حاشیه رفتن بیهوده، پاسخ را به همراه تمام پیش‌فرض‌های عمیق فنی و تشریح کدهای شبکه باز کن (سقف تشریحی آزاد تا ۱۲ خط مجاز است).`;
        } 
        else if (isRefinementMode) {
            const lastModelResponse = [...slot.history].reverse().find(h => h.role === 'model');
            const lastAssistantReply = lastModelResponse ? lastModelResponse.parts : "";
            promptPayload += `🚨 دستور اصلاحی کارشناس: ${rawDraft}\n\nمتن پاسخ قبلی دستیار که باید بر اساس این دستور ویرایش و اصلاح شود:\n${lastAssistantReply}`;
        } 
        else {
            if (cleanedHistory) promptPayload += `تاریخچه مکالمه با کاربر:\n${cleanedHistory}\n\n`;
            if (rawDraft) promptPayload += `پیش‌نویس یا ایده خام کارشناس برای بسط دادن:\n${rawDraft}\n\n`;
        }
        
        promptPayload += `\n\n🚨 ساختار خروجی الزامی:
${lengthRule}
تگ‌های [کوتاه] و [تشریحی] جهت تفکیک الزامی است.`;

        const activeStreamPort = chrome.runtime.connect({ name: "gemini-streaming-channel" });

        activeStreamPort.onMessage.addListener((msg) => {
            const liveQuickBox = document.getElementById('output-quick');
            const liveDetailedBox = document.getElementById('output-detailed');

            if (msg.status === "chunk") {
                accumulatedStreamText += msg.value;
                const polishedText = sanitizeStreamData(accumulatedStreamText);
                const { quickVersion, detailedVersion } = parseDoubleOutput(polishedText);
                
                if (liveQuickBox) liveQuickBox.innerHTML = quickVersion;
                if (liveDetailedBox) liveDetailedBox.innerHTML = detailedVersion;
            } 
            else if (msg.status === "done") {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = '🚀 تحلیل و فرمول‌بندی پاسخ';
                
                const polishedText = sanitizeStreamData(accumulatedStreamText);
                const { quickVersion, detailedVersion } = parseDoubleOutput(polishedText);
                
                slot.lastQuickOutput = quickVersion;
                slot.lastDetailedOutput = detailedVersion;
                
                let contextStr = '';
                if (isDirectExpansion) contextStr += `[توسعه رگباری با موشک]`;
                else if (isRefinementMode) contextStr += `[اصلاحیه]: ` + rawDraft;
                else {
                    if (cleanCRMHistory(historyInput.value)) contextStr += cleanCRMHistory(historyInput.value) + '\n';
                    if (draftInput.value.trim()) contextStr += draftInput.value.trim();
                }
                
                slot.history.push({ role: 'user', parts: contextStr.trim() });
                slot.history.push({ role: 'model', parts: polishedText });
                clearInputs(slot);
                
                if (tabDetailed) tabDetailed.click(); 
                renderHistoryList(slot);
                activeStreamPort.disconnect(); 
            } 
            else if (msg.status === "error") {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = '🚀 تحلیل و فرمول‌بندی پاسخ';
                if (liveDetailedBox) liveDetailedBox.innerHTML = `<span style="color: var(--accent-red)">❌ خطا: ${escapeHTML(msg.error)}</span>`;
                activeStreamPort.disconnect();
            }
        });

        const trimmedHistory = slot.history.slice(-10).map(h => ({ role: h.role, parts: h.parts }));

        activeStreamPort.postMessage({
            action: 'startStreaming',
            modelId: slot.selectedModel,
            prompt: promptPayload,
            knowledgeBase: masterInstruction,
            history: trimmedHistory
        });
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => { runCoreAnalysisEngine(false, ""); });
    }

    // 🚀 سنسورهای دکمه موشک: شلیک مستقیم فرآیند گسترش آنی متن همان کادر بدون نیاز به کلیک روی دکمه تحلیل
    if (extendQuickBtn) {
        extendQuickBtn.addEventListener('click', () => {
            const currentTxt = document.getElementById('output-quick')?.textContent || "";
            if (currentTxt && !currentTxt.startsWith("منتظر دریافت") && !currentTxt.startsWith("در حال فراخوانی")) {
                runCoreAnalysisEngine(true, currentTxt);
            }
        });
    }

    if (extendDetailedBtn) {
        extendDetailedBtn.addEventListener('click', () => {
            const currentTxt = document.getElementById('output-detailed')?.textContent || "";
            if (currentTxt && !currentTxt.startsWith("منتظر دریافت") && !currentTxt.startsWith("در حال فراخوانی")) {
                runCoreAnalysisEngine(true, currentTxt);
            }
        });
    }

    // ============================================================================
    // 📋 سنسور دکمه‌های کپی مینی‌مال
    // ============================================================================
    if (copyQuickBtn) {
        copyQuickBtn.addEventListener('click', async () => {
            const payload = document.getElementById('output-quick')?.textContent || "";
            if (payload && !payload.startsWith("منتظر دریافت") && !payload.startsWith("در حال فراخوانی")) {
                await navigator.clipboard.writeText(payload.trim());
                copyQuickBtn.classList.add('copied');
                setTimeout(() => { copyQuickBtn.classList.remove('copied'); }, 1200);
            }
        });
    }

    if (copyDetailedBtn) {
        copyDetailedBtn.addEventListener('click', async () => {
            const payload = document.getElementById('output-detailed')?.textContent || "";
            if (payload && !payload.startsWith("منتظر دریافت") && !payload.startsWith("در حال فراخوانی")) {
                await navigator.clipboard.writeText(payload.trim());
                copyDetailedBtn.classList.add('copied');
                setTimeout(() => { copyDetailedBtn.classList.remove('copied'); }, 1200);
            }
        });
    }

    // ============================================================================
    // 💜 سنسور لایک هوشمند با مدیریت وضعیت قلب بنفش توخالی و توپر
    // ============================================================================
    if (likeQuickBtn) { likeQuickBtn.addEventListener('click', () => lilyTriggerLikeProcessor('output-quick', likeQuickBtn, '⚡ کوتاه')); }
    if (likeDetailedBtn) { likeDetailedBtn.addEventListener('click', () => lilyTriggerLikeProcessor('output-detailed', likeDetailedBtn, '🔧 تشریحی')); }

    function lilyTriggerLikeProcessor(boxId, btnEl, responseType) {
        const textPayload = document.getElementById(boxId)?.textContent || "";
        if (!textPayload || textPayload.startsWith("منتظر دریافت") || textPayload.startsWith("در حال فراخوانی")) return;
        
        const slot = getActiveSlot();
        chrome.storage.local.get(['curatedResponsesDatabase'], (res) => {
            let vault = res.curatedResponsesDatabase || [];
            const existingIdx = vault.findIndex(v => v.text === textPayload.trim());
            
            if (existingIdx === -1) {
                vault.push({
                    text: textPayload.trim(),
                    customerName: slot.customerName || "کاربر نامشخص",
                    issueTag: responseType,
                    timestamp: Date.now()
                });
                btnEl.textContent = "💜"; btnEl.classList.add('liked');
            } else {
                vault.splice(existingIdx, 1);
                btnEl.textContent = "🖤"; btnEl.classList.remove('liked');
            }
            chrome.storage.local.set({ curatedResponsesDatabase: vault });
        });
    }

    function lilyCheckLikedState(text, btnEl) {
        if(!text || text.startsWith("منتظر دریافت")) { btnEl.textContent = "🖤"; btnEl.classList.remove('liked'); return; }
        chrome.storage.local.get(['curatedResponsesDatabase'], (res) => {
            const vault = res.curatedResponsesDatabase || [];
            const exists = vault.some(v => v.text === text.trim());
            if (exists) { btnEl.textContent = "💜"; btnEl.classList.add('liked'); }
            else { btnEl.textContent = "🖤"; btnEl.classList.remove('liked'); }
        });
    }

    // ============================================================================
    // 🎭 دکمه‌های کالیبراسیون لحن
    // ============================================================================
    archetypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const archKey = btn.dataset.archetype;
            const promptModifier = ARCHETYPES[archKey];
            const slot = getActiveSlot();
            if (!promptModifier || slot.history.length === 0) return;

            const lastModelIdx = [...slot.history].reverse().findIndex(h => h.role === 'model');
            if (lastModelIdx === -1) return;
            const actualIdx = slot.history.length - 1 - lastModelIdx;
            const textToRewrite = slot.history[actualIdx].parts;

            const originalText = btn.textContent;
            btn.textContent = '⏳...'; btn.disabled = true;

            const fullPrompt = `${promptModifier}\n\nمتن پاسخ فعلی جهت دگرگونی لحن:\n${textToRewrite}`;
            let masterInstruction = "شما دستیار پشتیبانی صرافی بیت‌پین هستید.\n" + getShiftContext();

            const activeRewritePort = chrome.runtime.connect({ name: "gemini-streaming-channel" });

            activeRewritePort.onMessage.addListener((msg) => {
                const liveQuickBox = document.getElementById('output-quick');
                const liveDetailedBox = document.getElementById('output-detailed');

                if (msg.status === "chunk") {
                    accumulatedStreamText += msg.value;
                    const polishedText = sanitizeStreamData(accumulatedStreamText);
                    const { quickVersion, detailedVersion } = parseDoubleOutput(polishedText);
                    if (liveQuickBox) liveQuickBox.innerHTML = quickVersion;
                    if (liveDetailedBox) liveDetailedBox.innerHTML = detailedVersion;
                }
                else if (msg.status === "done") {
                    btn.textContent = originalText; btn.disabled = false;
                    
                    const polishedText = sanitizeStreamData(accumulatedStreamText);
                    const { quickVersion, detailedVersion } = parseDoubleOutput(polishedText);
                    
                    slot.lastQuickOutput = quickVersion;
                    slot.lastDetailedOutput = detailedVersion;
                    slot.history[actualIdx].parts = polishedText;
                    
                    saveSlotsState();
                    renderHistoryList(slot);
                    activeRewritePort.disconnect();
                }
                else if (msg.status === "error") {
                    btn.textContent = originalText; btn.disabled = false;
                    activeRewritePort.disconnect();
                }
            });

            activeRewritePort.postMessage({
                action: 'startStreaming',
                modelId: slot.selectedModel,
                prompt: fullPrompt,
                knowledgeBase: masterInstruction,
                history: [] 
            });
        });
    });

    function smokyToggleFix() {
        if (tabQuick && tabDetailed) {
            tabQuick.addEventListener('click', () => { 
                tabQuick.classList.add('active'); tabDetailed.classList.remove('active'); 
                containerQuick.classList.add('visible'); containerDetailed.classList.remove('visible'); 
                getActiveSlot().activeTab = 'quick'; saveSlotsState();
            });
            tabDetailed.addEventListener('click', () => { 
                tabDetailed.classList.add('active'); tabQuick.classList.remove('active'); 
                containerDetailed.classList.add('visible'); containerQuick.classList.remove('visible'); 
                getActiveSlot().activeTab = 'detailed'; saveSlotsState();
            });
        }
    }
    smokyToggleFix();

    function clearInputs(slot) {
        historyInput.value = ''; slot.rawHistoryInput = '';
        draftInput.value = ''; slot.draftInput = '';
        saveSlotsState();
        renderHistoryList(slot);
    }

    function parseDoubleOutput(fullReply) {
        let quickVersion = fullReply; let detailedVersion = fullReply;
        const shortMatch = fullReply.match(/\[کوتاه\]([\s\S]*?)(?=\[تشریحی\]|$)/);
        const longMatch = fullReply.match(/\[تشریحی\]([\s\S]*?)$/);
        if (shortMatch && shortMatch[1]) quickVersion = shortMatch[1].trim();
        if (longMatch && longMatch[1]) detailedVersion = longMatch[1].trim();
        return { quickVersion, detailedVersion };
    }

    function escapeHTML(str) { if (!str) return ''; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

    loadStorageDatabase();
    loadSlotsState(() => { loadSlotState(0); });
});
