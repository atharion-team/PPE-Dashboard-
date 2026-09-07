// ==========================================
// 1. Chart.js Initialization
// ==========================================

// Timeline Line Chart
const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
const timelineChart = new Chart(ctxTimeline, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Total Alerts',
            data: [],
            borderColor: '#dab00a',
            backgroundColor: 'rgba(218, 176, 10, 0.15)',
            fill: true,
            tension: 0.3,
            borderWidth: 2
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
        plugins: { legend: { display: false } }
    }
});

// Violation Ratio Donut Chart
const ctxPie = document.getElementById('violationPieChart').getContext('2d');
const violationPieChart = new Chart(ctxPie, {
    type: 'doughnut',
    data: {
        labels: ['No Hardhat', 'No Vest'],
        datasets: [{
            data: [0, 0],
            backgroundColor: ['rgba(16, 131, 173, 0.5)', 'rgba(17, 178, 223, 0.5)'],
            borderColor: ['#1083ad', '#11b2df'],
            borderWidth: 3
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        cutout: '65%'
    }
});

// ==========================================
// 2. UI Update Functions
// ==========================================

function updateDashboardUI(data) {
    const stats = data.stats || {};
    const totalViolations = stats.total_violations || 0;
    const missingHats = stats.missing_hats || 0;
    const missingVests = stats.missing_vests || 0;
    const timelineData = data.timeline_data || [];
    const events = data.events || stats.recent_events || [];

    // Update Text Counters
    document.getElementById('stat-total').innerText = totalViolations;
    document.getElementById('stat-hats').innerText = missingHats;
    document.getElementById('stat-vests').innerText = missingVests;

    // Toast Alert
    if (totalViolations > 0) {
        triggerAlertToast();
    }

    // Update Donut Chart
    const donutOverlay = document.getElementById('donut-empty-overlay');
    if (totalViolations === 0) {
        violationPieChart.data.datasets[0].data = [1];
        violationPieChart.data.datasets[0].backgroundColor = ['#2d2d2d'];
        violationPieChart.data.datasets[0].borderColor = ['#3a3a3a'];
        if (donutOverlay) donutOverlay.style.display = 'block';
    } else {
        violationPieChart.data.datasets[0].data = [missingHats, missingVests];
        violationPieChart.data.datasets[0].backgroundColor = ['rgba(16, 131, 173, 0.5)', 'rgba(17, 178, 223, 0.5)'];
        violationPieChart.data.datasets[0].borderColor = ['#1083ad', '#11b2df'];
        if (donutOverlay) donutOverlay.style.display = 'none';
    }
    violationPieChart.update('none');

    // Update Timeline Chart
    const timelineOverlay = document.getElementById('timeline-empty-overlay');
    if (timelineData.length > 0) {
        timelineChart.data.labels = timelineData.map(item => item.time);
        timelineChart.data.datasets[0].data = timelineData.map(item => item.count);
        if (timelineOverlay) timelineOverlay.style.display = 'none';
    } else {
        timelineChart.data.labels = ['--:--'];
        timelineChart.data.datasets[0].data = [0];
        if (timelineOverlay) timelineOverlay.style.display = 'block';
    }
    timelineChart.update('none');

    // Render Recent Log Events
    renderEventLog(events);
}

function renderEventLog(events) {
    const eventList = document.getElementById('event-list');
    if (!eventList) return;

    if (!events || events.length === 0) {
        eventList.innerHTML = `
            <div class="empty-state" style="padding: 12px; color: #8b949e; text-align: center;">
                <span>No violations detected in video</span>
            </div>
        `;
        return;
    }

    eventList.innerHTML = events.map(event => `
        <div class="event-item ${event.type || 'warning'}" style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            ${event.snapshot ? `<img src="${event.snapshot}" alt="Snapshot" style="width: 64px; height: 48px; object-op: cover; border-radius: 4px; border: 1px solid #333;" />` : ''}
            <div style="display: flex; flex-direction: column;">
                <span class="event-time" style="font-size: 0.8rem; color: #8b949e;">Event #${event.event_id || ''} at ${event.time}</span>
                <span class="event-desc" style="font-weight: 600;">${event.desc}</span>
            </div>
        </div>
    `).join('');
}

function triggerAlertToast() {
    const toast = document.getElementById('alert-toast');
    if (toast) {
        toast.classList.remove('hidden');
        setTimeout(() => { toast.classList.add('hidden'); }, 3500);
    }
}

// ==========================================
// 3. Event Listeners & Drag-Drop Handling
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggle-btn');
    const toggleIcon = document.getElementById('toggle-icon');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            if (sidebar.classList.contains('collapsed')) {
                toggleIcon.classList.remove('fa-chevron-left');
                toggleIcon.classList.add('fa-chevron-right');
            } else {
                toggleIcon.classList.remove('fa-chevron-right');
                toggleIcon.classList.add('fa-chevron-left');
            }
        });
    }

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

    // File Picker Triggers
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

    // Drag-and-Drop Effects
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

    // Form Processing (Batch Request)
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = fileInput.files[0];
            if (!file || !validateAndSetFile(file)) return;

            // Step 1: Hide Upload Zone, Show Processing Spinner
            uploadZone.classList.add('hidden');
            if (loaderZone) loaderZone.classList.remove('hidden');

            const formData = new FormData();
            formData.append('video_file', file);

            try {
                const response = await fetch('/upload_video', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (response.ok && result.status === 'success') {
                    // Step 2: Hide Loader, Display Processed Video Player
                    if (loaderZone) loaderZone.classList.add('hidden');
                    activeStreamZone.classList.remove('hidden');
                    if (resetUploadBtn) resetUploadBtn.classList.remove('hidden');

                    // Step 3: Load Output Video (Dynamic Replacement & Direct Source Assignment)
                    processedVideoPlayer.pause();
                    
                    // Clear old sources to prevent caching or sync issues
                    while (processedVideoPlayer.firstChild) {
                        processedVideoPlayer.removeChild(processedVideoPlayer.firstChild);
                    }

                    // Assign source directly to the video element and recreate the source node
                    processedVideoPlayer.src = result.video_url;
                    
                    const newSource = document.createElement('source');
                    newSource.id = 'video-source';
                    newSource.src = result.video_url;
                    newSource.type = 'video/mp4';
                    processedVideoPlayer.appendChild(newSource);

                    processedVideoPlayer.load();

                    // Step 4: Render Charts & KPI Stats from JSON Response
                    updateDashboardUI(result);
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

    // Reset UI to Process Another Video
    if (resetUploadBtn) {
        resetUploadBtn.addEventListener('click', resetUploadUI);
    }

    function resetUploadUI() {
        uploadZone.classList.remove('hidden');
        if (loaderZone) loaderZone.classList.add('hidden');
        activeStreamZone.classList.add('hidden');
        if (resetUploadBtn) resetUploadBtn.classList.add('hidden');
        
        // Reset inputs
        fileInput.value = '';
        fileNameDisplay.innerText = '';
        processBtn.disabled = true;
        
        // Pause and clear video source
        processedVideoPlayer.pause();
        processedVideoPlayer.src = '';
        while (processedVideoPlayer.firstChild) {
            processedVideoPlayer.removeChild(processedVideoPlayer.firstChild);
        }
    }
});