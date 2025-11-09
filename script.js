// Wait for libraries to load
        let loadAttempts = 0;
        const maxAttempts = 50;

        const checkLibraries = setInterval(() => {
            loadAttempts++;

            if (typeof JSZip !== 'undefined' && typeof saveAs !== 'undefined') {
                clearInterval(checkLibraries);
                initializeApp();
            } else if (loadAttempts >= maxAttempts) {
                clearInterval(checkLibraries);
                document.getElementById('loadingNote').innerHTML = 
                    '❌ Failed to load libraries. Please check your internet connection and refresh the page.';
                document.getElementById('loadingNote').style.background = '#ffebee';
                document.getElementById('loadingNote').style.color = '#c62828';
            }
        }, 100);

        function initializeApp() {
            document.getElementById('loadingNote').style.display = 'none';
            document.getElementById('uploadArea').style.display = 'block';
            document.getElementById('processBtn').style.display = 'block';

            const uploadArea = document.getElementById('uploadArea');
            const fileInput = document.getElementById('fileInput');
            const processBtn = document.getElementById('processBtn');
            const status = document.getElementById('status');
            const fileInfo = document.getElementById('fileInfo');
            const fileName = document.getElementById('fileName');
            const processingList = document.getElementById('processingList');

            const darkModeToggle = document.getElementById('checkbox');
            darkModeToggle.addEventListener('change', () => {
                document.body.classList.toggle('dark-mode');
                if (document.body.classList.contains('dark-mode')) {
                    localStorage.setItem('theme', 'dark');
                } else {
                    localStorage.setItem('theme', 'light');
                }
            });

            // Check for saved theme preference
            if (localStorage.getItem('theme') === 'dark') {
                document.body.classList.add('dark-mode');
                darkModeToggle.checked = true;
            }

            let selectedFile = null;

            // Click to upload
            uploadArea.addEventListener('click', () => fileInput.click());

            // Drag and drop handlers
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    handleFileSelect(files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleFileSelect(e.target.files[0]);
                }
            });

            function handleFileSelect(file) {
                if (!file.name.toLowerCase().endsWith('.zip')) {
                    showStatus('error', 'Please select a ZIP file');
                    return;
                }

                selectedFile = file;
                fileName.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
                fileInfo.classList.add('show');
                processBtn.disabled = false;
                hideStatus();
            }

            processBtn.addEventListener('click', () => processZipFile(selectedFile));

            function extractChapterName(filename) {
                const withoutLeadingNumbers = filename.replace(/^\d+_/, '');
                const match = withoutLeadingNumbers.match(/^(.+?)_([12])_?\.txt$/);
                return match ? match[1] : null;
            }

            async function processZipFile(file) {
                if (!file) return;

                processBtn.disabled = true;
                processBtn.classList.add('loading');
                showStatus('info', '⏳ Processing ZIP file...');
                processingList.innerHTML = '';
                processingList.style.display = 'none';

                try {
                    const zip = new JSZip();
                    const content = await file.arrayBuffer();
                    const loadedZip = await zip.loadAsync(content);

                    if (Object.keys(loadedZip.files).length === 0) {
                        throw new Error('The ZIP file is empty or invalid.');
                    }

                    const files = {};
                    const filesByChapter = {};
                    const processedFiles = new Set();

                    for (const [path, zipFile] of Object.entries(loadedZip.files)) {
                        if (!zipFile.dir && path.toLowerCase().endsWith('.txt')) {
                            const text = await zipFile.async('text');
                            files[path] = text;

                            const chapterName = extractChapterName(path);
                            if (chapterName) {
                                if (!filesByChapter[chapterName]) {
                                    filesByChapter[chapterName] = {};
                                }

                                if (path.includes('_1_')) {
                                    filesByChapter[chapterName].part1 = path;
                                } else if (path.includes('_2_')) {
                                    filesByChapter[chapterName].part2 = path;
                                }
                            }
                        }
                    }

                    const newZip = new JSZip();
                    const mergeLog = [];

                    for (const [chapterName, parts] of Object.entries(filesByChapter)) {
                        const { part1, part2 } = parts;

                        if (part1 && part2) {
                            let part1Text = files[part1];
                            let part2Text = files[part2];

                            part2Text = part2Text.replace(/^\s*\n/, '');
                            const mergedText = part1Text + part2Text;

                            const leadingNumber = part1.match(/^(\d+)_/)[1];
                            const outputFileName = `${leadingNumber}_${chapterName}.txt`;

                            newZip.file(outputFileName, mergedText);
                            processedFiles.add(part1);
                            processedFiles.add(part2);

                            mergeLog.push(`✓ Merged: ${part1} + ${part2} → ${outputFileName}`);
                        } else if (part1 && !part2) {
                            newZip.file(part1, files[part1]);
                            processedFiles.add(part1);
                            mergeLog.push(`⚠ Kept as-is: ${part1} (part 2 not found)`);
                        } else if (!part1 && part2) {
                            newZip.file(part2, files[part2]);
                            processedFiles.add(part2);
                            mergeLog.push(`⚠ Kept as-is: ${part2} (part 1 not found)`);
                        }
                    }

                    for (const [path, text] of Object.entries(files)) {
                        if (!processedFiles.has(path)) {
                            newZip.file(path, text);
                            mergeLog.push(`→ Kept unchanged: ${path}`);
                        }
                    }

                    for (const [path, zipFile] of Object.entries(loadedZip.files)) {
                        if (!zipFile.dir && !path.toLowerCase().endsWith('.txt')) {
                            const content = await zipFile.async('arraybuffer');
                            newZip.file(path, content);
                        }
                    }

                    const blob = await newZip.generateAsync({type: 'blob'});
                    const outputFileName = file.name.replace('.zip', '_merged.zip');
                    saveAs(blob, outputFileName);

                    showStatus('success', `✅ Success! Downloaded: ${outputFileName}`);

                    if (mergeLog.length > 0) {
                        processingList.style.display = 'block';
                        processingList.innerHTML = ''; // Clear previous logs
                        mergeLog.forEach(log => {
                            const item = document.createElement('div');
                            item.className = 'processing-item';
                            item.textContent = log;
                            processingList.appendChild(item);
                        });
                    }

                } catch (error) {
                    showStatus('error', `❌ Error: ${error.message}`);
                    console.error(error);
                } finally {
                    processBtn.disabled = false;
                    processBtn.classList.remove('loading');
                }
            }

            function showStatus(type, message) {
                status.className = `status ${type}`;
                status.textContent = message;
                status.style.display = 'block';
            }

            function hideStatus() {
                status.style.display = 'none';
            }
        }
