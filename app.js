import { createApp, ref, computed } from 'vue';
import { config } from './config.js';

createApp({
    setup() {
        const selectedFile = ref(null);
        const isDragging = ref(false);
        const sourceLanguage = ref('auto');
        const targetLanguage = ref('ar');
        const isTranslating = ref(false);
        const progress = ref('0%');
        const translatedContent = ref([]);
        const originalSrtContent = ref([]);
        
        // For debugging
        const debugMessage = ref('');
        
        // معالجة رفع الملف عبر واجهة الرفع
        const handleFileUpload = (event) => {
            const file = event.target.files[0];
            if (file && file.name.endsWith('.srt')) {
                selectedFile.value = file;
                readSrtFile(file);
            } else {
                alert('يرجى اختيار ملف بامتداد .srt');
            }
        };
        
        // معالجة رفع الملف عبر السحب والإفلات
        const handleFileDrop = (event) => {
            isDragging.value = false;
            const file = event.dataTransfer.files[0];
            if (file && file.name.endsWith('.srt')) {
                selectedFile.value = file;
                readSrtFile(file);
            } else {
                alert('يرجى اختيار ملف بامتداد .srt');
            }
        };
        
        // قراءة محتوى ملف SRT
        const readSrtFile = (file) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                originalSrtContent.value = parseSrtFile(content);
            };
            reader.readAsText(file);
        };
        
        // تحليل محتوى ملف SRT
        const parseSrtFile = (content) => {
            const lines = content.split('\n');
            const subtitles = [];
            let subtitle = {};
            let textAccumulator = '';
            let index = 0;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Skip empty lines at beginning of file
                if (line === '' && Object.keys(subtitle).length === 0) {
                    continue;
                }
                
                // Handle subtitle index (just a number)
                if (/^\d+$/.test(line) && !subtitle.number) {
                    // If we already had a subtitle in progress, save it first
                    if (subtitle.timeCode && textAccumulator) {
                        subtitle.text = textAccumulator.trim();
                        subtitles.push({...subtitle});
                        subtitle = {};
                        textAccumulator = '';
                    }
                    
                    subtitle.number = line;
                    index = 1;
                    continue;
                }
                
                // Handle timecode (contains --> or similar time format)
                if ((line.includes('-->') || /^\d{2}:\d{2}:\d{2}[,.]\d{2,3}\s+\-\->\s+\d{2}:\d{2}:\d{2}[,.]\d{2,3}/.test(line)) && index === 1) {
                    subtitle.timeCode = line;
                    index = 2;
                    continue;
                }
                
                // Handle text lines
                if (index >= 2) {
                    if (line === '') {
                        // Empty line after text - complete current subtitle
                        if (textAccumulator) {
                            subtitle.text = textAccumulator.trim();
                            subtitles.push({...subtitle});
                            subtitle = {};
                            textAccumulator = '';
                            index = 0;
                        }
                    } else {
                        // Add to text accumulator
                        textAccumulator += (textAccumulator ? '\n' : '') + line;
                    }
                }
            }
            
            // Add the last subtitle if needed
            if (subtitle.number && subtitle.timeCode && textAccumulator) {
                subtitle.text = textAccumulator.trim();
                subtitles.push({...subtitle});
            }
            
            // Handle unconventional SRT format (some examples from user)
            if (subtitles.length === 0) {
                // Try parsing alternate format (number timecode text all on one line)
                const alternateSubtitles = parseAlternateFormat(content);
                if (alternateSubtitles.length > 0) {
                    return alternateSubtitles;
                }
            }
            
            return subtitles;
        };
        
        // Parse alternative SRT format where everything is on a single line
        const parseAlternateFormat = (content) => {
            const lines = content.split('\n');
            const subtitles = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === '') continue;
                
                // Try to match pattern like: "1 00:00:01:01 00:00:04:21 Text here"
                // or "00:00:05:04 00:00:06:04 Text here"
                const timeCodePattern = /\d{2}:\d{2}:\d{2}[,:]\d{2}\s+\d{2}:\d{2}:\d{2}[,:]\d{2}/;
                const timeCodeMatch = line.match(timeCodePattern);
                
                if (timeCodeMatch) {
                    const timeCode = timeCodeMatch[0];
                    const parts = line.split(timeCode);
                    let number = parts[0].trim();
                    // If number is not a valid subtitle index, generate one
                    if (!/^\d+$/.test(number)) {
                        number = (subtitles.length + 1).toString();
                    }
                    
                    // Extract text (everything after the timecode)
                    const text = line.substring(line.indexOf(timeCode) + timeCode.length).trim();
                    
                    subtitles.push({
                        number: number,
                        timeCode: timeCode,
                        text: text
                    });
                }
            }
            
            return subtitles;
        };
        
        // ترجمة سطر واحد
        const translateSubtitle = async (subtitle, targetLang) => {
            try {
                const sourceLang = sourceLanguage.value === 'auto' ? '' : `من اللغة ${getLanguageName(sourceLanguage.value)}`;
                const prompt = `أنت مترجم محترف. ترجم النص التالي ${sourceLang} إلى اللغة ${getLanguageName(targetLang)} بدقة عالية واحترافية:
        
النص: "${subtitle.text}"

قدم الترجمة فقط دون أي تعليقات أو نص إضافي. حافظ على التنسيق الأصلي.`;
                
                console.log(`Translating: "${subtitle.text.substring(0, 30)}..." to ${targetLang}`);
                
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: prompt }]
                        }],
                        generationConfig: {
                            temperature: 0.2,
                            topK: 40,
                            topP: 0.95,
                            maxOutputTokens: 1024
                        }
                    })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('API error response:', errorText);
                    throw new Error(`فشل API: ${response.status} - ${errorText}`);
                }
                
                const data = await response.json();
                console.log('API response:', data);
                
                if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
                    // Check first for candidates structure (Gemini API format)
                    console.error('Unexpected API response structure:', data);
                    
                    // Try alternate response structure
                    if (data.contents && data.contents[0] && data.contents[0].parts && data.contents[0].parts[0]) {
                        const translatedText = data.contents[0].parts[0].text || '';
                        return {
                            number: subtitle.number,
                            timeCode: subtitle.timeCode,
                            text: translatedText.trim()
                        };
                    }
                    
                    throw new Error('هيكل استجابة API غير متوقع');
                }
                
                const translatedText = data.candidates[0].content.parts[0].text || '';
                console.log(`Translation result: "${translatedText.substring(0, 30)}..."`);
                
                return {
                    number: subtitle.number,
                    timeCode: subtitle.timeCode,
                    text: translatedText.trim()
                };
            } catch (error) {
                console.error('خطأ في ترجمة سطر:', error);
                // إرجاع النص الأصلي في حالة فشل الترجمة
                return {
                    number: subtitle.number,
                    timeCode: subtitle.timeCode,
                    text: subtitle.text + ' [فشل الترجمة: ' + error.message + ']'
                };
            }
        };
        
        // الحصول على اسم اللغة
        const getLanguageName = (langCode) => {
            return config.languages[langCode] || langCode;
        };
        
        // ترجمة ملف SRT
        const translateSrt = async () => {
            if (!selectedFile.value) {
                alert('يرجى اختيار ملف SRT صالح أولاً');
                return;
            }
            
            if (originalSrtContent.value.length === 0) {
                alert('الملف المحدد فارغ أو غير صالح. يرجى اختيار ملف SRT صالح.');
                return;
            }
            
            if (!config.geminiApiKey) {
                alert('مفتاح API غير متوفر، يرجى التحقق من ملف التكوين');
                return;
            }
            
            isTranslating.value = true;
            translatedContent.value = [];
            const totalSubtitles = originalSrtContent.value.length;
            debugMessage.value = '';
            
            try {
                console.log(`Starting translation of ${totalSubtitles} subtitles to ${targetLanguage.value}`);
                
                // ترجمة كل سطر عن طريق API
                const batchSize = config.batchSize;
                const batches = Math.ceil(totalSubtitles / batchSize);
                let retryCount = 0;
                
                for (let i = 0; i < batches; i++) {
                    const start = i * batchSize;
                    const end = Math.min(start + batchSize, totalSubtitles);
                    const batch = originalSrtContent.value.slice(start, end);
                    
                    console.log(`Processing batch ${i+1}/${batches}, items ${start+1}-${end} of ${totalSubtitles}`);
                    
                    // ترجمة هذه الدفعة
                    let batchTranslated = false;
                    let attempts = 0;
                    
                    while (!batchTranslated && attempts < 3) {
                        try {
                            const translatedBatch = await Promise.all(
                                batch.map(subtitle => translateSubtitle(subtitle, targetLanguage.value))
                            );
                            
                            translatedContent.value.push(...translatedBatch);
                            batchTranslated = true;
                        } catch (batchError) {
                            console.error(`Error in batch (attempt ${attempts + 1}):`, batchError);
                            attempts++;
                            // إضافة تأخير قبل المحاولة مرة أخرى
                            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
                        }
                    }
                    
                    if (!batchTranslated) {
                        // إذا فشلت كل المحاولات، استمر مع النص الأصلي
                        translatedContent.value.push(...batch.map(subtitle => ({
                            number: subtitle.number,
                            timeCode: subtitle.timeCode,
                            text: subtitle.text + ' [فشل الترجمة بعد عدة محاولات]'
                        })));
                        retryCount++;
                    }
                    
                    // تحديث التقدم
                    progress.value = `${Math.round((end / totalSubtitles) * 100)}%`;
                    
                    // الانتظار قليلاً بين الدفعات لتجنب تجاوز حدود API
                    if (i < batches - 1) {
                        await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatches));
                    }
                }
                
                progress.value = '100%';
                debugMessage.value = 'تمت الترجمة بنجاح';
            } catch (error) {
                console.error('خطأ في الترجمة:', error);
                alert('حدث خطأ أثناء الترجمة: ' + error.message);
                debugMessage.value = 'فشل في الترجمة: ' + error.message;
            } finally {
                isTranslating.value = false;
            }
        };
        
        // تنزيل ملف SRT المترجم
        const downloadTranslatedSrt = () => {
            if (translatedContent.value.length === 0) {
                alert('لا يوجد محتوى مترجم للتنزيل');
                return;
            }
            
            // تحويل المحتوى المترجم إلى تنسيق SRT
            let srtContent = '';
            
            translatedContent.value.forEach((subtitle, index) => {
                const number = (index + 1).toString();
                srtContent += number + '\n';
                srtContent += subtitle.timeCode + '\n';
                srtContent += subtitle.text + '\n\n';
            });
            
            // إنشاء ملف للتنزيل
            const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `translated_${selectedFile.value.name}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
        
        return {
            selectedFile,
            isDragging,
            sourceLanguage,
            targetLanguage,
            isTranslating,
            progress,
            translatedContent,
            originalSrtContent,
            handleFileUpload,
            handleFileDrop,
            translateSrt,
            downloadTranslatedSrt,
            config,
            debugMessage
        };
    }
}).mount('#app');