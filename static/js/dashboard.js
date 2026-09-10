// ==========================================
// 1. Wait for DOM and Chart.js to be ready
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    console.log('DOM ready – initializing charts');

    // --- Timeline Line Chart (empty state with fake grey data) ---
    const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
    const timelineChart = new Chart(ctxTimeline, {
        type: 'line',
        data: {
            labels: ['10:00', '10:01', '10:02', '10:03', '10:04'],
            datasets: [{
                label: 'Total Alerts',
                data: [2, 3, 1, 4, 2],
                borderColor: '#999999',
                backgroundColor: 'rgba(150,150,150,0.2)',
                fill: true,
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#999999'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: '#21262d' },
                    ticks: { color: '#8b949e' }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#21262d' },
                    ticks: { color: '#8b949e', stepSize: 1 }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            hover: { mode: null }
        }
    });
    console.log('Timeline chart created');

    // --- Violation Ratio Donut Chart (empty state with 3 grey slices) ---
    const ctxPie = document.getElementById('violationPieChart').getContext('2d');
    const violationPieChart = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: ['No Hardhat', 'No Vest', 'Other'],
            datasets: [{
                data: [70, 20, 10],
                backgroundColor: ['#666666', '#777777', '#888888'],
                borderColor: ['#444444', '#444444', '#444444'],
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            cutout: '65%',
            hover: { mode: null }
        }
    });
    console.log('Donut chart created');

    // ==========================================
    // 2. Apply empty-state styling & overlays (also resets charts)
    // ==========================================

    function applyEmptyState(processing = false) {
        const donutWrapper = document.querySelector('.donut-chart-wrapper');
        const timelineWrapper = document.querySelector('.chart-container');
        const donutOverlay = document.getElementById('donut-empty-overlay');
        const timelineOverlay = document.getElementById('timeline-empty-overlay');

        // Always apply grey/blur class
        if (donutWrapper) donutWrapper.classList.add('no-data');
        if (timelineWrapper) timelineWrapper.classList.add('no-data');

        // Reset chart data to grey placeholders if not processing
        if (!processing) {
            // Donut: 3 grey slices
            violationPieChart.data.datasets[0].data = [70, 20, 10];
            violationPieChart.data.datasets[0].backgroundColor = ['#666666', '#777777', '#888888'];
            violationPieChart.data.datasets[0].borderColor = ['#444444', '#444444', '#444444'];
            violationPieChart.options.plugins.tooltip.enabled = false;
            violationPieChart.options.hover.mode = null;
            violationPieChart.update('none');

            // Timeline: grey fake data
            timelineChart.data.labels = ['10:00', '10:01', '10:02', '10:03', '10:04'];
            timelineChart.data.datasets[0].data = [2, 3, 1, 4, 2];
            timelineChart.data.datasets[0].borderColor = '#999999';
            timelineChart.data.datasets[0].backgroundColor = 'rgba(150,150,150,0.2)';
            timelineChart.data.datasets[0].pointBackgroundColor = '#999999';
            timelineChart.options.plugins.tooltip.enabled = false;
            timelineChart.options.hover.mode = null;
            timelineChart.update('none');
        }

        // Overlay text
        const msg = processing ? 'Processing' : 'No data to display. Upload a video to start.';
        const overlayHtml = processing
            ? `<span class="processing-overlay-text">Processing<span class="dots"><span>.</span><span>.</span><span>.</span></span></span>`
            : msg;

        if (donutOverlay) {
            donutOverlay.style.display = 'block';
            donutOverlay.innerHTML = overlayHtml;
        }
        if (timelineOverlay) {
            timelineOverlay.style.display = 'block';
            timelineOverlay.innerHTML = overlayHtml;
        }
    }

    // Initial empty state (not processing) – immediately after charts created
    applyEmptyState(false);
    renderEventLog([], false);

    // ==========================================
    // 3. UI Update Function (called when real data arrives)
    // ==========================================

    window.updateDashboardUI = function (data) {
        console.log('updateDashboardUI called with data:', data);
        const stats = data.stats || {};
        const totalViolations = stats.total_violations || 0;
        const missingHats = stats.missing_hats || 0;
        const missingVests = stats.missing_vests || 0;
        const timelineData = data.timeline_data || [];
        const events = data.events || stats.recent_events || [];

        // Update counters
        document.getElementById('stat-total').innerText = totalViolations;
        document.getElementById('stat-hats').innerText = missingHats;
        document.getElementById('stat-vests').innerText = missingVests;

        // Show/hide snapshot button based on events having snapshots
        const snapshotBtn = document.getElementById('snapshot-gallery-btn');
        if (snapshotBtn) {
            const hasSnapshots = events.some(e => e.snapshot);
            if (hasSnapshots) {
                snapshotBtn.classList.remove('hidden');
            } else {
                snapshotBtn.classList.add('hidden');
            }
        }

        // --- Donut ---
        const donutWrapper = document.querySelector('.donut-chart-wrapper');
        const donutOverlay = document.getElementById('donut-empty-overlay');
        if (totalViolations === 0) {
            // Keep grey empty state
            violationPieChart.data.datasets[0].data = [70, 20, 10];
            violationPieChart.data.datasets[0].backgroundColor = ['#666666', '#777777', '#888888'];
            violationPieChart.data.datasets[0].borderColor = ['#444444', '#444444', '#444444'];
            violationPieChart.options.plugins.tooltip.enabled = false;
            violationPieChart.options.hover.mode = null;
            if (donutOverlay) {
                donutOverlay.style.display = 'block';
                donutOverlay.innerText = 'No data to display. Upload a video to start.';
            }
            if (donutWrapper) donutWrapper.classList.add('no-data');
        } else {
            violationPieChart.data.datasets[0].data = [missingHats, missingVests];
            violationPieChart.data.datasets[0].backgroundColor = ['rgba(16, 131, 173, 0.5)', 'rgba(17, 178, 223, 0.5)'];
            violationPieChart.data.datasets[0].borderColor = ['#1083ad', '#11b2df'];
            violationPieChart.options.plugins.tooltip.enabled = true;
            violationPieChart.options.hover.mode = 'index';
            if (donutOverlay) donutOverlay.style.display = 'none';
            if (donutWrapper) donutWrapper.classList.remove('no-data');
        }
        violationPieChart.update('none');

        // --- Timeline ---
        const timelineWrapper = document.querySelector('.chart-container');
        const timelineOverlay = document.getElementById('timeline-empty-overlay');
        if (timelineData.length > 0) {
            timelineChart.data.labels = timelineData.map(item => item.time);
            timelineChart.data.datasets[0].data = timelineData.map(item => item.count);
            timelineChart.data.datasets[0].borderColor = '#dab00a';
            timelineChart.data.datasets[0].backgroundColor = 'rgba(218, 176, 10, 0.15)';
            timelineChart.data.datasets[0].pointBackgroundColor = '#dab00a';
            timelineChart.options.plugins.tooltip.enabled = true;
            timelineChart.options.hover.mode = 'index';
            if (timelineOverlay) timelineOverlay.style.display = 'none';
            if (timelineWrapper) timelineWrapper.classList.remove('no-data');
        } else {
            // Keep grey demo data
            timelineChart.data.labels = ['10:00', '10:01', '10:02', '10:03', '10:04'];
            timelineChart.data.datasets[0].data = [2, 3, 1, 4, 2];
            timelineChart.data.datasets[0].borderColor = '#999999';
            timelineChart.data.datasets[0].backgroundColor = 'rgba(150,150,150,0.2)';
            timelineChart.data.datasets[0].pointBackgroundColor = '#999999';
            timelineChart.options.plugins.tooltip.enabled = false;
            timelineChart.options.hover.mode = null;
            if (timelineOverlay) {
                timelineOverlay.style.display = 'block';
                timelineOverlay.innerText = 'No data to display. Upload a video to start.';
            }
            if (timelineWrapper) timelineWrapper.classList.add('no-data');
        }
        timelineChart.update('none');

        renderEventLog(events, false);
    };

    // ==========================================
    // 4. Render Event Log
    // ==========================================

    function renderEventLog(events, processing = false) {
        const eventList = document.getElementById('event-list');
        if (!eventList) return;

        if (processing) {
            eventList.innerHTML = `
                <div class="log-placeholder-wrapper placeholder-log">
                    <div class="log-placeholder-items">
                        <div class="event-item">
                            <span class="event-time">--:--</span>
                            <span class="event-desc">Sample detection</span>
                        </div>
                        <div class="event-item">
                            <span class="event-time">--:--</span>
                            <span class="event-desc">Sample detection</span>
                        </div>
                        <div class="event-item">
                            <span class="event-time">--:--</span>
                            <span class="event-desc">Sample detection</span>
                        </div>
                    </div>
                    <div class="log-processing-overlay">
                        <span class="processing-overlay-text">Processing<span class="dots"><span>.</span><span>.</span><span>.</span></span></span>
                    </div>
                </div>
            `;
            return;
        }

        if (!events || events.length === 0) {
            eventList.innerHTML = `
                <div class="log-placeholder-wrapper placeholder-log">
                    <div class="log-placeholder-items">
                        <div class="event-item">
                            <span class="event-time">--:--</span>
                            <span class="event-desc">Sample detection</span>
                        </div>
                        <div class="event-item">
                            <span class="event-time">--:--</span>
                            <span class="event-desc">Sample detection</span>
                        </div>
                        <div class="event-item">
                            <span class="event-time">--:--</span>
                            <span class="event-desc">Sample detection</span>
                        </div>
                    </div>
                    <div class="log-empty-overlay">No data to display. Upload a video to start.</div>
                </div>
            `;
            return;
        }

        // Real events – render normally
        eventList.innerHTML = events.map(event => `
            <div class="event-item real ${event.type || 'warning'}">
                ${event.snapshot ? `<img src="${event.snapshot}" alt="Snapshot" class="event-snapshot-img" />` : ''}
                <div class="event-detail">
                    <span class="event-time">Event #${event.event_id || ''} at ${event.time}</span>
                    <span class="event-desc">${event.desc}</span>
                </div>
            </div>
        `).join('');
    }

    // ==========================================
    // 5. Event Listeners & Drag-Drop
    // ==========================================

    // Upload Elements
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('video-file-input');
    const browseBtn = document.getElementById('browse-btn');
    const processBtn = document.getElementById('process-btn');
    const fileNameDisplay = document.getElementById('selected-file-name');
    const errorMsg = document.getElementById('upload-error');
    const uploadForm = document.getElementById('upload-form');

    const uploadZone = document.getElementById('upload-zone');
    const loaderZone = document.getElementById('processing-loader-zone');
    const activeStreamZone = document.getElementById('active-stream-zone');
    const processedVideoPlayer = document.getElementById('processed-video-player');
    const resetUploadBtn = document.getElementById('reset-upload-btn');
    const snapshotBtn = document.getElementById('snapshot-gallery-btn');

    const ALLOWED_EXTENSIONS = ['mp4', 'avi', 'mov', 'mkv', 'webm'];

    function validateAndSetFile(file) {
        errorMsg.innerText = '';
        if (!file) {
            processBtn.disabled = true;
            fileNameDisplay.innerText = '';
            return false;
        }

        const ext = file.name.split('.').pop().toLowerCase();
        const isVideoType = file.type.startsWith('video/') || ALLOWED_EXTENSIONS.includes(ext);

        if (!isVideoType) {
            errorMsg.innerText = 'Invalid file format! Please upload a video file.';
            processBtn.disabled = true;
            fileNameDisplay.innerText = '';
            fileInput.value = '';
            return false;
        }

        fileNameDisplay.innerText = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        processBtn.disabled = false;
        return true;
    }

    if (browseBtn && fileInput) {
        browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
        dropArea.addEventListener('click', () => fileInput.click());
    }

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            validateAndSetFile(e.target.files[0]);
        }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropArea.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropArea.classList.remove('dragover');
        }, false);
    });

    dropArea.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            validateAndSetFile(files[0]);
        }
    });

    // Snapshot gallery button – download ZIP
    if (snapshotBtn) {
        snapshotBtn.addEventListener('click', () => {
            // Trigger download of the snapshots ZIP
            window.location.href = '/download_snapshots';
        });
    }

    // Reset button – call reset endpoint and reset UI
    if (resetUploadBtn) {
        resetUploadBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/reset', { method: 'POST' });
                if (response.ok) {
                    resetUploadUI();
                    // Reset charts to empty state (without processing)
                    applyEmptyState(false);
                    renderEventLog([], false);
                    // Hide snapshot button
                    if (snapshotBtn) snapshotBtn.classList.add('hidden');
                    // Reset counters to 0
                    document.getElementById('stat-total').innerText = '0';
                    document.getElementById('stat-hats').innerText = '0';
                    document.getElementById('stat-vests').innerText = '0';
                } else {
                    console.error('Reset failed');
                }
            } catch (err) {
                console.error('Reset error:', err);
            }
        });
    }

    // Form Processing
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = fileInput.files[0];
            if (!file || !validateAndSetFile(file)) return;

            // Show processing loader, hide upload zone
            uploadZone.classList.add('hidden');
            loaderZone.classList.remove('hidden');

            // Update overlays to "Processing..."
            applyEmptyState(true);
            renderEventLog([], true); // show Processing in log

            const formData = new FormData();
            formData.append('video_file', file);

            try {
                const response = await fetch('/upload_video', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (response.ok && result.status === 'success') {
                    // Hide loader, show video
                    loaderZone.classList.add('hidden');
                    activeStreamZone.classList.remove('hidden');
                    if (resetUploadBtn) resetUploadBtn.classList.remove('hidden');

                    processedVideoPlayer.pause();
                    while (processedVideoPlayer.firstChild) {
                        processedVideoPlayer.removeChild(processedVideoPlayer.firstChild);
                    }
                    processedVideoPlayer.src = result.video_url;
                    const newSource = document.createElement('source');
                    newSource.id = 'video-source';
                    newSource.src = result.video_url;
                    newSource.type = 'video/mp4';
                    processedVideoPlayer.appendChild(newSource);
                    processedVideoPlayer.load();

                    // Update dashboard with real data
                    window.updateDashboardUI(result);
                } else {
                    alert(result.error || 'Pipeline processing failed.');
                    resetUploadUI();
                }
            } catch (err) {
                console.error(err);
                alert('Connection error while communicating with the server.');
                resetUploadUI();
            }
        });
    }

    function resetUploadUI() {
        uploadZone.classList.remove('hidden');
        loaderZone.classList.add('hidden');
        activeStreamZone.classList.add('hidden');
        if (resetUploadBtn) resetUploadBtn.classList.add('hidden');
        if (snapshotBtn) snapshotBtn.classList.add('hidden');

        fileInput.value = '';
        fileNameDisplay.innerText = '';
        processBtn.disabled = true;

        processedVideoPlayer.pause();
        processedVideoPlayer.src = '';
        while (processedVideoPlayer.firstChild) {
            processedVideoPlayer.removeChild(processedVideoPlayer.firstChild);
        }

        // Reset overlays to "No data..." and reset chart data
        applyEmptyState(false);
        renderEventLog([], false);
        // Reset counters to 0
        document.getElementById('stat-total').innerText = '0';
        document.getElementById('stat-hats').innerText = '0';
        document.getElementById('stat-vests').innerText = '0';
    }

}); // end DOMContentLoaded