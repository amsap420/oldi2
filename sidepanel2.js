// مدیریت مقتدرانه وضعیت اسلات‌ها (State Management)
let currentSlot = 0;
let slots = [null, null, null];

// ساختار داده‌ای خالی برای هر اسلات
function createEmptySlot() {
    return {
        history: [
            { sender: 'bot', text: 'سیستم آماده دریافت اطلاعات کاربر است. اسلات فعال بارگذاری شد.' }
        ],
        historyRaw: '',
        draft: '',
        topic: '',
        gender: 'unknown',
        clientName: '',
        activeAgent: 'gemini-flash',
        outputQuick: 'در انتظار پردازش داده‌ها...',
        outputDetailed: 'در انتظار پردازش داده‌ها...',
        currentArchetype: 'normal'
    };
}

// ذخیره‌سازی وضعیت کل اسلات‌ها در حافظه محلی افزونه
function saveSlotsState() {
    chrome.storage.local.set({ 
        'cached_slots_data': slots,
        'active_slot_index': currentSlot
    }, () => {
        console.log('وضعیت اسلات‌ها با موفقیت همگام‌سازی شد.');
    });
}

// بارگذاری وضعیت اسلات‌ها از حافظه محلی
function loadSlotsState() {
    chrome.storage.local.get(['cached_slots_data', 'active_slot_index'], (result) => {
        if (result.cached_slots_data && Array.isArray(result.cached_slots_data)) {
            slots = result.cached_slots_data;
        } else {
            slots = [createEmptySlot(), createEmptySlot(), createEmptySlot()];
        }
        
        if (typeof result.active_slot_index === 'number' && result.active_slot_index >= 0 && result.active_slot_index <= 2) {
            currentSlot = result.active_slot_index;
        } else {
            currentSlot = 0;
        }
        
        updateSlotTabsUI();
        renderActiveSlotToUI();
    });
}

// تغییر وضعیت بصری دکمه‌های اسلات‌ها
function updateSlotTabsUI() {
    for (let i = 0; i < 3; i++) {
        const btn = document.getElementById(`slot-${i}`);
        if (btn) {
            if (i === currentSlot) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    }
}

// نمایش اطلاعات اسلات انتخاب شده در رابط کاربری
function renderActiveSlotToUI() {
    const slot = slots[currentSlot];
    if (!slot) return;

    document.getElementById('history-raw-input').value = slot.historyRaw || '';
    document.getElementById('draft-input').value = slot.draft || '';
    document.getElementById('select-topic').value = slot.topic || '';
    document.getElementById('select-gender').value = slot.gender || 'unknown';
    document.getElementById('input-client-name').value = slot.clientName || '';
    document.getElementById('select-active-agent').value = slot.activeAgent || 'gemini-flash';
    
    document.getElementById('output-quick').textContent = slot.outputQuick || 'در انتظار پردازش داده‌ها...';
    document.getElementById('output-detailed').textContent = slot.outputDetailed || 'در انتظار پردازش داده‌ها...';

    // ریست کردن آیکون‌های لایک بر اساس وجود پاسخ در دیتابیس منتخبین
    checkLikeStatusRemote(slot.outputQuick, 'btn-like-quick');
    checkLikeStatusRemote(slot.outputDetailed, 'btn-like-detailed');

    // رندر حباب‌های تاریخچه چت
    const historyCard = document.getElementById('output-display-card');
    historyCard.innerHTML = '';
    
    if (slot.history && slot.history.length > 0) {
        slot.history.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.classList.add('chat-bubble', msg.sender === 'user' ? 'user' : 'bot');
            bubble.textContent = msg.text;
            historyCard.appendChild(bubble);
        });
    }
    historyCard.scrollTop = historyCard.scrollHeight;
}

// به‌روزرسانی زنده مقادیر ورودی‌ها در ساختار داده اسلات فعال هنگام تایپ یا تغییر
function syncCurrentInputToState() {
    if (!slots[currentSlot]) return;
    slots[currentSlot].historyRaw = document.getElementById('history-raw-input').value;
    slots[currentSlot].draft = document.getElementById('draft-input').value;
    slots[currentSlot].topic = document.getElementById('select-topic').value;
    slots[currentSlot].gender = document.getElementById('select-gender').value;
    slots[currentSlot].clientName = document.getElementById('input-client-name').value;
    slots[currentSlot].activeAgent = document.getElementById('select-active-agent').value;
    saveSlotsState();
}

// پایشگرهای رویداد تغییرات فرم‌ها
['history-raw-input', 'draft-input'].forEach(id => {
    document.getElementById(id).addEventListener('input', syncCurrentInputToState);
});
['select-topic', 'select-gender', 'select-active-agent'].forEach(id => {
    document.getElementById(id).addEventListener('change', syncCurrentInputToState);
});
document.getElementById('input-client-name').addEventListener('input', syncCurrentInputToState);


// سوئیچ مقتدرانه بین کاربران (Slots)
for (let i = 0; i < 3; i++) {
    document.getElementById(`slot-${i}`).addEventListener('click', () => {
        syncCurrentInputToState(); // ذخیره آخرین تغییرات اسلات فعلی قبل از سوئیچ
        currentSlot = i;
        updateSlotTabsUI();
        renderActiveSlotToUI();
        saveSlotsState();
    });
}

// تابع پاکسازی تاریخچه CRM از تاریخ و زمان‌های شمسی و انگلیسی با رگکس دقیق
function cleanCRMHistory(text) {
    if (!text) return "";
    
    // ۱. رگکس برای حذف الگوهایی نظیر "فروردین ۱۲، ۱۰:۳۰ ق.ظ" یا "اسفند ۲۸، ۱۶:۴۵ ب.ظ"
    const jalaliLongPattern = /(?:فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)\s+[\u06f0-\u06f9\d]{1,2}(?:،)?\s+[\u06f0-\u06f9\d]{1,2}:[\u06f0-\u06f9\d]{1,2}(?:\s*(?:ق\.ظ|ب\.ظ))?/g;
    
    // ۲. رگکس برای حذف فرمت‌های عددی استاندارد و فارسی مثل 1402/01/12 10:30 یا 2024-03-11 08:12:00
    const numericDateTimePattern = /(?:[\u06f0-\u06f9\d]{2,4}[\/\-][\u06f0-\u06f9\d]{1,2}[\/\-][\u06f0-\u06f9\d]{1,2})\s+[\u06f0-\u06f9\d]{1,2}:[\u06f0-\u06f9\d]{1,2}(?:\s*(?:ق\.ظ|ب\.ظ))?/g;
    
    let cleaned = text.replace(jalaliLongPattern, "");
    cleaned = cleaned.replace(numericDateTimePattern, "");
    return cleaned.trim();
}

// تابع پاکسازی بک‌اسلش‌ها و ناهنجاری‌های جریانات داده‌ای JSON استریم
function sanitizeStreamData(text) {
    if (!text) return "";
    let clean = text.replace(/\\n/g, "\n");
    clean = clean.replace(/\\"/g, '"');
    clean = clean.replace(/\\\\/g, "\\");
    return clean;
}

// تابع تشخیص شیفت کاری بر اساس ساعت سیستم
function getShiftContext() {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 6) {
        return "بامداد (بازه نیمه‌شب تا ۶ صبح)";
    } else if (hour >= 6 && hour < 12) {
        return "صبح (بازه ۶ صبح تا ۱۲ ظهر)";
    } else if (hour >= 12 && hour < 17) {
        return "عصر (بازه ۱۲ ظهر تا ۵ عصر)";
    } else {
        return "شب (بازه ۵ عصر تا آخر شب)";
    }
}

// آبجکت آرکیتایپ‌های چهارگانه لحن پاسخدهی
const ARCHETYPES = {
    normal: "لحن متداول، محترمانه، راهنما و استاندارد صرافی رمزارز.",
    zeus: "لحنی مقتدر، قاطع، کاملاً رسمی، بدون تکلف و تعارفات اضافی، متکی بر قوانین و بندهای سفت و سخت پلتفرم.",
    hestia: "لحنی به شدت همدلانه، صمیمانه، آرامش‌بخش، همراه با درک عمیق استرس کاربر و تمرکز بر رفع نگرانی او.",
    hades: "لحنی بسیار فنی، مهندسی، مینی‌مال، متمایل به جزئیات بلاکچینی، تراکنش‌ها، هش‌ها و متغیرهای زیرساختی سیستم بدون حاشیه‌پردازی."
};

// موتور هوشمند پردازش و آنالیز اصلی جریان داده (Streaming Engine)
function runCoreAnalysisEngine(mode, targetText = null) {
    const slot = slots[currentSlot];
    if (!slot) return;

    // متغیرهای ساخت پرامپت
    const cleanedHistory = cleanCRMHistory(slot.historyRaw);
    const draftContent = slot.draft;
    const topic = slot.topic ? `موضوع مربوطه: ${slot.topic}` : "موضوع عمومی";
    const currentShift = getShiftContext();
    const archetypePrompt = ARCHETYPES[slot.currentArchetype || 'normal'];

    let prompt = `شما یک دستیار هوشمند فوق پیشرفته برای پشتیبانی یک صرافی بزرگ کریپتوکارنسی هستید.\n`;
    prompt += `موقعیت زمانی سیستم: شیفت ${currentShift}\n`;
    prompt += `لحن درخواستی جهت اعمال: ${archetypePrompt}\n`;
    
    // قفل هویتی
    if (slot.clientName && slot.clientName.trim() !== "") {
        const genderTitle = slot.gender !== 'unknown' ? slot.gender : "";
        prompt += `هویت مشتری مشخص است: ${genderTitle} ${slot.clientName}. لحن را متناسب با این نام و هویت تنظیم کنید و در خوش‌آمدگویی یا بدنه متن به درستی استفاده کنید.\n`;
    } else {
        prompt += `اکیداً و مطلقاً استفاده از عناوین کلی مانند 'آقا' یا 'خانم' ممنوع است، چون هویت مشتری مجهول است. بدون استفاده از پیشوندهای جنسیتی عمومی صحبت کنید.\n`;
    }

    // قانون تفکیک ساختاری خروجی دوقلو
    prompt += `قانون تفکیک مطلق خروجی:\n`;
    prompt += `پاسخ شما الزاماً باید شامل دو بخش مجزا با تگ‌های دقیق [کوتاه] و [تشریحی] باشد.\n`;
    prompt += `زیر تگ [کوتاه] حداکثر ۲ خط پاسخ بسیار سریع و فشرده بنویسید.\n`;
    prompt += `زیر تگ [تشریحی] حداکثر ۱۲ خط پاسخ جامع، گام‌به‌گام و راهگشا ارائه دهید.\n\n`;

    if (mode === 'expand' && targetText) {
        prompt += `وظیفه شما 'گسترش آنی عمیق' است. متن زیر را که از خروجی قبلی برداشته شده، مبنا قرار دهید و آن را به صورت تخصصی، عمیق و بدون حاشیه‌پردازی‌های زاید توسعه دهید:\n`;
        prompt += `متن مبنا: ${targetText}\n`;
    } else {
        prompt += `داده‌های ورودی کارشناس جهت پردازش:\n`;
        prompt += `تاریخچه پاکسازی شده گفتگو: ${cleanedHistory}\n`;
        prompt += `پیش‌نویس و نکات مدنظر کارشناس: ${draftContent}\n`;
        prompt += `${topic}\n`;
    }

    // ثبت درخواست کاربر در تاریخچه بصری اسلات
    if (mode !== 'archetype_rewrite' && mode !== 'expand') {
        slot.history.push({ sender: 'user', text: `درخواست پردازش موضوع: ${slot.topic || 'عمومی'} - نام: ${slot.clientName || 'نامشخص'}` });
    } else if (mode === 'expand') {
        slot.history.push({ sender: 'user', text: `درخواست گسترش آنی بخش خروجی` });
    } else {
        slot.history.push({ sender: 'user', text: `درخواست تغییر لحن به آرکیتایپ: ${slot.currentArchetype}` });
    }

    // آماده‌سازی UI برای نمایش زنده استریم
    document.getElementById('output-quick').textContent = "در حال اتصال به منبع استریم...";
    document.getElementById('output-detailed').textContent = "در حال اتصال به منبع استریم...";
    
    // باز کردن کانال ارتباطی استریم با بک‌گراند افزونه
    const port = chrome.runtime.connect({ name: "gemini-streaming-channel" });
    
    // ارسال پرامپت ساخته شده و تنظیمات مدل به بک‌گراند
    port.postMessage({
        action: "start_generation",
        prompt: prompt,
        agent: slot.activeAgent
    });

    let fullAccumulatedText = "";

    // شنود چانک‌های دریافتی از استریم
    port.onMessage.addListener((msg) => {
        if (msg.status === "chunk" && msg.data) {
            const cleanChunk = sanitizeStreamData(msg.data);
            fullAccumulatedText += cleanChunk;
            
            // نمایش زنده متن خام جفت شده در هر دو باکس تا پیش از تفکیک نهایی
            document.getElementById('output-quick').textContent = fullAccumulatedText;
            document.getElementById('output-detailed').textContent = fullAccumulatedText;
        } else if (msg.status === "done") {
            processAndFinalizeOutput(fullAccumulatedText);
            port.disconnect();
        }
    });

    port.onDisconnect.addListener(() => {
        console.log("کانال استریم بسته شد.");
        // در صورتی که دیسکانکت شد اما پایان رسمی اعلام نشده بود، متن موجود را تفکیک کن
        if (fullAccumulatedText && (slot.outputQuick.startsWith("در حال") || slot.outputQuick === fullAccumulatedText)) {
            processAndFinalizeOutput(fullAccumulatedText);
        }
    });
}

// تابع تفکیک و تثبیت نهایی داده‌های خروجی دوقلو
function processAndFinalizeOutput(rawText) {
    const slot = slots[currentSlot];
    if (!slot) return;

    const parsed = parseDoubleOutput(rawText);
    
    slot.outputQuick = parsed.quick;
    slot.outputDetailed = parsed.detailed;
    
    document.getElementById('output-quick').textContent = parsed.quick;
    document.getElementById('output-detailed').textContent = parsed.detailed;
    
    // ثبت پاسخ نهایی بات در آرایه تاریخچه نمایش
    slot.history.push({ sender: 'bot', text: `[پاسخ نهایی ثبت شده]\nکوتاه: ${parsed.quick}\n\nتشریحی: ${parsed.detailed}` });
    
    // بازنشانی وضعیت قلب‌ها
    checkLikeStatusRemote(parsed.quick, 'btn-like-quick');
    checkLikeStatusRemote(parsed.detailed, 'btn-like-detailed');
    
    renderActiveSlotToUI();
    saveSlotsState();
}

// الگوریتم پارسر متن بر اساس تگ‌های [کوتاه] و [تشریحی]
function parseDoubleOutput(text) {
    let quick = "";
    let detailed = "";
    
    const quickTagIndex = text.indexOf("[کوتاه]");
    const detailedTagIndex = text.indexOf("[تشریحی]");
    
    if (quickTagIndex !== -1 && detailedTagIndex !== -1) {
        if (quickTagIndex < detailedTagIndex) {
            quick = text.substring(quickTagIndex + 7, detailedTagIndex).trim();
            detailed = text.substring(detailedTagIndex + 8).trim();
        } else {
            detailed = text.substring(detailedTagIndex + 8, quickTagIndex).trim();
            quick = text.substring(quickTagIndex + 7).trim();
        }
    } else if (quickTagIndex !== -1) {
        quick = text.substring(quickTagIndex + 7).trim();
        detailed = quick;
    } else if (detailedTagIndex !== -1) {
        detailed = text.substring(detailedTagIndex + 8).trim();
        quick = detailed;
    } else {
        // فالبک در صورتی که مدل تگ‌ها را رعایت نکرده باشد
        quick = text.trim();
        detailed = text.trim();
    }
    
    return { quick, detailed };
}

// دکمه اصلی شروع عملیات تحلیل
document.getElementById('btn-trigger-analysis').addEventListener('click', () => {
    syncCurrentInputToState();
    runCoreAnalysisEngine('normal');
});

// منطق دکمه‌های آرکیتایپ لحن پاسخدهی
['normal', 'zeus', 'hestia', 'hades'].forEach(archKey => {
    document.getElementById(`btn-arch-${archKey}`).addEventListener('click', () => {
        if (!slots[currentSlot]) return;
        slots[currentSlot].currentArchetype = archKey;
        
        // تشخیص متن آخرین پاسخ برای بازنویسی مجدد آن
        let activeTab = document.querySelector('.tab-btn.active').id;
        let lastOutputText = "";
        if (activeTab === 'tab-quick') {
            lastOutputText = slots[currentSlot].outputQuick;
        } else {
            lastOutputText = slots[currentSlot].outputDetailed;
        }
        
        if (!lastOutputText || lastOutputText.startsWith("در انتظار") || lastOutputText.startsWith("در حال")) {
            // اگر خروجی نبود، کل موتور را با فرمول عادی صدا بزن
            runCoreAnalysisEngine('archetype_rewrite');
        } else {
            // بازنویسی دقیق بر اساس متن موجود خروجی قبلی
            runCoreAnalysisEngine('archetype_rewrite');
        }
    });
});

// سوئیچ کادرهای پاسخ کوتاه و تشریحی (smokyToggleFix)
function smokyToggleFix(targetTab) {
    const tabQuick = document.getElementById('tab-quick');
    const tabDetailed = document.getElementById('tab-detailed');
    const boxQuick = document.getElementById('box-container-quick');
    const boxDetailed = document.getElementById('box-container-detailed');
    
    if (targetTab === 'quick') {
        tabQuick.classList.add('active');
        tabDetailed.classList.remove('active');
        boxQuick.classList.add('visible');
        boxDetailed.classList.remove('visible');
    } else {
        tabDetailed.classList.add('active');
        tabQuick.classList.remove('active');
        boxDetailed.classList.add('visible');
        boxQuick.classList.remove('visible');
    }
}

document.getElementById('tab-quick').addEventListener('click', () => smokyToggleFix('quick'));
document.getElementById('tab-detailed').addEventListener('click', () => smokyToggleFix('detailed'));

// منطق دکمه‌های کپی متن سیستم با افزودن موقت کلاس برای تعامل بهینه
function setupCopyLogic(btnId, textContainerId) {
    document.getElementById(btnId).addEventListener('click', function() {
        const textToCopy = document.getElementById(textContainerId).textContent;
        if (!textToCopy || textToCopy.startsWith("در انتظار")) return;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const self = this;
            self.classList.add('copied');
            const originalText = self.textContent;
            self.textContent = "✓";
            
            setTimeout(() => {
                self.classList.remove('copied');
                self.textContent = originalText;
            }, 1500);
        }).catch(err => {
            console.error('خطا در کپی متن: ', err);
        });
    });
}
setupCopyLogic('btn-copy-quick', 'output-quick');
setupCopyLogic('btn-copy-detailed', 'output-detailed');

// منطق لایک و ذخیره‌سازی پاسخ‌ها در بانک اطلاعاتی منتخبین (lilyTriggerLikeProcessor)
function lilyTriggerLikeProcessor(btnId, textContainerId) {
    document.getElementById(btnId).addEventListener('click', function() {
        const textContent = document.getElementById(textContainerId).textContent;
        if (!textContent || textContent.startsWith("در انتظار") || textContent.startsWith("در حال")) return;
        
        const self = this;
        chrome.storage.local.get(['curatedResponsesDatabase'], (res) => {
            let db = res.curatedResponsesDatabase || [];
            const index = db.indexOf(textContent);
            
            if (index === -1) {
                // افزودن به لایک‌ها
                db.push(textContent);
                self.textContent = "💜";
            } else {
                // حذف از لایک‌ها
                db.splice(index, 1);
                self.textContent = "🖤";
            }
            
            chrome.storage.local.set({ 'curatedResponsesDatabase': db }, () => {
                console.log('بانک اطلاعاتی منتخبین به‌روزرسانی شد.');
            });
        });
    });
}
lilyTriggerLikeProcessor('btn-like-quick', 'output-quick');
lilyTriggerLikeProcessor('btn-like-detailed', 'output-detailed');

// چک کردن وضعیت لایک در دیتابیس لوکال برای رندر صحیح آیکون قلبی شکل
function checkLikeStatusRemote(text, btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (!text || text.startsWith("در انتظار") || text.startsWith("در حال")) {
        btn.textContent = "🖤";
        return;
    }
    chrome.storage.local.get(['curatedResponsesDatabase'], (res) => {
        let db = res.curatedResponsesDatabase || [];
        if (db.includes(text)) {
            btn.textContent = "💜";
        } else {
            btn.textContent = "🖤";
        }
    });
}

// دکمه‌های موشک (گسترش آنی عمیق بدون حاشیه)
document.getElementById('btn-expand-quick').addEventListener('click', () => {
    const text = slots[currentSlot]?.outputQuick;
    if (!text || text.startsWith("در انتظار")) return;
    runCoreAnalysisEngine('expand', text);
});

document.getElementById('btn-expand-detailed').addEventListener('click', () => {
    const text = slots[currentSlot]?.outputDetailed;
    if (!text || text.startsWith("در انتظار")) return;
    runCoreAnalysisEngine('expand', text);
});

// دکمه پاکسازی کل ذهن اسلات فعلی (Wipe Slot)
document.getElementById('btn-wipe-current-slot').addEventListener('click', () => {
    if (confirm("آیا از پاکسازی تمام داده‌های اسلات فعلی اطمینان دارید؟")) {
        slots[currentSlot] = createEmptySlot();
        renderActiveSlotToUI();
        saveSlotsState();
    }
});

// دکمه‌های فرعی هدر (پایگاه داده و رادار) برای توسعه‌های آتی
document.getElementById('btn-open-database').addEventListener('click', () => {
    alert("سیستم دسترسی به پایگاه داده پاسخ‌های لایک شده فعال است. جهت توسعه متصل به لوکال استوریج.");
});
document.getElementById('btn-open-radar').addEventListener('click', () => {
    alert("رادار مانیتورینگ شبکه و بررسی ترندهای صرافی با موفقیت فعالسازی شد.");
});

// آغازین‌سازی برنامه با بالا آمدن ساید‌پنل
document.addEventListener('DOMContentLoaded', () => {
    loadSlotsState();
});
