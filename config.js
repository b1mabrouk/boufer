export const config = {
    // الترجمة API
    geminiApiKey: "AIzaSyDyGRH9aDkGUsLdh1qmrt3EecYOGMM0Pv4", // مفتاح API للترجمة
    
    // اللغات المدعومة
    languages: {
        "ar": "العربية",
        "en": "الإنجليزية",
        "fr": "الفرنسية",
        "es": "الإسبانية",
        "de": "الألمانية",
        "ru": "الروسية",
        "zh": "الصينية",
        "ja": "اليابانية",
        "tr": "التركية"
    },
    
    // خيارات الترجمة
    batchSize: 1, // ترجمة واحدة في كل مرة للحصول على أقصى دقة
    delayBetweenBatches: 1500, // التأخير بين الدفعات (مللي ثانية)
    maxRetries: 3, // الحد الأقصى لمحاولات إعادة المحاولة لكل ترجمة
    
    // رسائل النظام
    messages: {
        dragAndDrop: "اسحب ملف SRT هنا أو",
        chooseFile: "اختر ملف",
        translating: "جاري الترجمة...",
        completed: "اكتملت الترجمة بنجاح",
        error: "حدث خطأ أثناء الترجمة"
    }
};