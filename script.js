import { config } from 'config';

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const uploadContainer = document.getElementById('upload-container');
    const fileInput = document.getElementById('file-input');
    const optionsSection = document.getElementById('options-section');
    const fileNameElement = document.getElementById('file-name');
    const translateButton = document.getElementById('translate-button');
    const progressSection = document.getElementById('progress-section');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const previewSection = document.getElementById('preview-section');
    const previewContainer = document.getElementById('preview-container');
    const downloadButton = document.getElementById('download-button');
    const newTranslationButton = document.getElementById('new-translation-button');
    
    // State
    let currentFile = null;
    let subtitles = [];
    let translatedSubtitles = [];
    let targetLanguage = '';
    
    // Set up event listeners
    setupEventListeners();
    
    function setupEventListeners() {
        // File upload via button
        fileInput.addEventListener('change', handleFileSelection);
        
        // File upload via drag and drop
        uploadContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadContainer.classList.add('upload-highlight');
        });
        
        uploadContainer.addEventListener('dragleave', () => {
            uploadContainer.classList.remove('upload-highlight');
        });
        
        uploadContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadContainer.classList.remove('upload-highlight');
            
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                handleFileSelection();
            }
        });
        
        uploadContainer.addEventListener('click', () => {
            fileInput.click();
        });
        
        // Translation
        translateButton.addEventListener('click', startTranslation);
        
        // Download
        downloadButton.addEventListener('click', downloadTranslatedSrt);
        
        // New translation
        newTranslationButton.addEventListener('click', resetApplication);
    }
    
    function handleFileSelection() {
        if (fileInput.files.length === 0) return;
        
        const file = fileInput.files[0];
        
        if (!file.name.endsWith('.srt')) {
            alert('Please upload a valid SRT file.');
            return;
        }
        
        currentFile = file;
        fileNameElement.textContent = file.name;
        
        // Read the file
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            subtitles = parseSrtFile(content);
            
            if (subtitles.length === 0) {
                alert('No subtitles found in the file or the file format is invalid.');
                return;
            }
            
            // Show options section
            document.querySelector('.upload-section').classList.add('hidden');
            optionsSection.classList.remove('hidden');
        };
        
        reader.readAsText(file);
    }
    
    function parseSrtFile(content) {
        // Split by double newline to get subtitle blocks
        const blocks = content.trim().split(/\r?\n\r?\n/);
        const parsedSubtitles = [];
        
        for (const block of blocks) {
            const lines = block.split(/\r?\n/);
            
            if (lines.length < 3) continue;
            
            // First line is the index
            const index = parseInt(lines[0]);
            
            // Second line is the timestamp
            const timestamp = lines[1];
            
            // Remaining lines are the subtitle text
            const text = lines.slice(2).join('\n');
            
            parsedSubtitles.push({
                index,
                timestamp,
                text
            });
        }
        
        return parsedSubtitles;
    }
    
    async function startTranslation() {
        targetLanguage = document.getElementById('target-language').value;
        
        // Show progress section
        optionsSection.classList.add('hidden');
        progressSection.classList.remove('hidden');
        
        // Reset progress
        progressBar.style.width = '0%';
        progressText.textContent = 'Translating subtitles: 0%';
        
        // Start translation in batches
        await translateSubtitles();
        
        // Show preview section
        progressSection.classList.add('hidden');
        previewSection.classList.remove('hidden');
        
        // Generate preview
        displayPreview();
    }
    
    async function translateSubtitles() {
        translatedSubtitles = [];
        const batchSize = config.BATCH_SIZE;
        const totalBatches = Math.ceil(subtitles.length / batchSize);
        
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * batchSize;
            const end = Math.min(start + batchSize, subtitles.length);
            const batch = subtitles.slice(start, end);
            
            try {
                const translatedBatch = await translateBatch(batch);
                translatedSubtitles.push(...translatedBatch);
                
                // Update progress
                const progress = Math.floor((end / subtitles.length) * 100);
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `Translating subtitles: ${progress}%`;
                
                // Short delay to allow UI to update
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('Translation error:', error);
                alert(`Error translating batch ${batchIndex + 1}: ${error.message}`);
                // Continue with next batch despite error
            }
        }
    }
    
    async function translateBatch(batch) {
        // Prepare the prompt for the AI
        const batchTexts = batch.map(sub => sub.text);
        const languageName = getLanguageName(targetLanguage);
        
        const prompt = `Translate the following subtitles from their original language to ${languageName}. Keep the translation concise and natural. Preserve the meaning and tone. Return ONLY the translations in the same order, with each translation on a separate line:

${batchTexts.join('\n\n')}`;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`);
            }
            
            const data = await response.json();
            
            if (config.DEBUG) {
                console.log('API Response:', data);
            }
            
            // Extract the translations from the response
            const translationText = data.candidates[0].content.parts[0].text;
            const translations = translationText.split('\n\n').filter(t => t.trim() !== '');
            
            if (translations.length !== batch.length) {
                console.warn(`Warning: Received ${translations.length} translations for ${batch.length} subtitles`);
            }
            
            // Combine original subtitles with translations
            return batch.map((subtitle, index) => ({
                ...subtitle,
                translatedText: index < translations.length ? translations[index].trim() : '(Translation error)'
            }));
        } catch (error) {
            console.error('API Error:', error);
            // Return the batch with error message as translation
            return batch.map(subtitle => ({
                ...subtitle,
                translatedText: '(Translation failed)'
            }));
        }
    }
    
    function getLanguageName(languageCode) {
        const languages = {
            'ar': 'Arabic',
            'zh': 'Chinese',
            'en': 'English',
            'fr': 'French',
            'de': 'German',
            'hi': 'Hindi',
            'it': 'Italian',
            'ja': 'Japanese',
            'ko': 'Korean',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'es': 'Spanish'
        };
        
        return languages[languageCode] || languageCode;
    }
    
    function displayPreview() {
        previewContainer.innerHTML = '';
        
        // Display a sample of the translations (first 10)
        const samplesToShow = Math.min(10, translatedSubtitles.length);
        
        for (let i = 0; i < samplesToShow; i++) {
            const subtitle = translatedSubtitles[i];
            const entryElement = document.createElement('div');
            entryElement.className = 'subtitle-entry';
            
            entryElement.innerHTML = `
                <div class="subtitle-time">${subtitle.timestamp}</div>
                <div class="subtitle-original">${subtitle.text}</div>
                <div class="subtitle-translated">${subtitle.translatedText}</div>
            `;
            
            previewContainer.appendChild(entryElement);
        }
        
        // Show remaining count if there are more
        if (translatedSubtitles.length > samplesToShow) {
            const remainingElement = document.createElement('p');
            remainingElement.textContent = `... and ${translatedSubtitles.length - samplesToShow} more entries`;
            remainingElement.style.textAlign = 'center';
            remainingElement.style.fontStyle = 'italic';
            previewContainer.appendChild(remainingElement);
        }
    }
    
    function downloadTranslatedSrt() {
        // Create SRT content
        let srtContent = '';
        
        translatedSubtitles.forEach((subtitle, index) => {
            // Add index (1-based)
            srtContent += (index + 1) + '\n';
            // Add timestamp
            srtContent += subtitle.timestamp + '\n';
            // Add translated text
            srtContent += subtitle.translatedText + '\n\n';
        });
        
        // Create filename
        const originalName = currentFile.name.replace('.srt', '');
        const languageCode = targetLanguage;
        const newFileName = `${originalName}_${languageCode}.srt`;
        
        // Create and download the file
        const blob = new Blob([srtContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = newFileName;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    function resetApplication() {
        // Reset state
        currentFile = null;
        subtitles = [];
        translatedSubtitles = [];
        
        // Reset UI
        fileInput.value = '';
        previewSection.classList.add('hidden');
        document.querySelector('.upload-section').classList.remove('hidden');
    }
});

