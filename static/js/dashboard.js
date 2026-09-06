// 1. Initialize Chart.js Area/Line Chart (Timeline)
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

// 2. Initialize Chart.js Donut Chart (Violation Ratio)
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

let lastViolationCount = 0;

// 3. Fetch Real Stats Data from Flask Backend
// 3. Fetch Real Stats Data from Flask Backend
async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) return;
        const data = await response.json();

        const totalViolations = data.total_violations || 0;
        const missingHats = data.missing_hats || 0;
        const missingVests = data.missing_vests || 0;
        const timelineData = data.timeline_data || [];
        const recentEvents = data.recent_events || [];

        // Update Text Counters
        document.getElementById('stat-total').innerText = totalViolations;
        document.getElementById('stat-hats').innerText = missingHats;
        document.getElementById('stat-vests').innerText = missingVests;

        // Trigger Toast on New Violation
        if (totalViolations > lastViolationCount) {
            lastViolationCount = totalViolations;
            triggerAlertToast();
        }

        // --- Donut Chart Empty State ---
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
        
        // REPLACED: Added 'none' to disable full animation rebuilds on every 1-second poll
        violationPieChart.update('none');

        // --- Timeline Line Chart Empty State ---
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
        
        // REPLACED: Added 'none' here as well
        timelineChart.update('none');

        // --- Event Log Empty State ---
        renderEventLog(recentEvents);

    } catch (err) {
        console.error("Error fetching live stats:", err);
    }
}

// 4. Render Event Stream Items or Empty State
function renderEventLog(events) {
    const eventList = document.getElementById('event-list');
    if (!eventList) return;

    if (!events || events.length === 0) {
        eventList.innerHTML = `
            <div class="empty-state">
                <span>No violations detected yet</span>
            </div>
        `;
        return;
    }

    eventList.innerHTML = events.map(event => `
        <div class="event-item ${event.type || 'warning'}" style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            ${event.snapshot ? `<img src="${event.snapshot}" alt="Snapshot" style="width: 64px; height: 48px; object-fit: cover; border-radius: 4px; border: 1px solid #333;" />` : ''}
            <div style="display: flex; flex-direction: column;">
                <span class="event-time" style="font-size: 0.8rem; color: #8b949e;">Event #${event.event_id || ''} at ${event.time}</span>
                <span class="event-desc" style="font-weight: 600;">${event.desc}</span>
            </div>
        </div>
    `).join('');
}

// 5. Trigger Toast Function
function triggerAlertToast() {
    const toast = document.getElementById('alert-toast');
    if (toast) {
        toast.classList.remove('hidden');
        setTimeout(() => { toast.classList.add('hidden'); }, 3000);
    }
}

// 6. Polling Interval
setInterval(fetchStats, 1000);

// 7. DOM Listeners for Sidebar Toggle
document.addEventListener('DOMContentLoaded', () => {
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

    // Initial Fetch on Load
    fetchStats();
});

document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('video-file-input');
    const browseBtn = document.getElementById('browse-btn');
    const processBtn = document.getElementById('process-btn');
    const fileNameDisplay = document.getElementById('selected-file-name');
    const errorMsg = document.getElementById('upload-error');
    const uploadForm = document.getElementById('upload-form');

    const uploadZone = document.getElementById('upload-zone');
    const activeStreamZone = document.getElementById('active-stream-zone');
    const streamFrame = document.getElementById('stream-frame');

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
            errorMsg.innerText = 'Invalid file type! Please select a valid video file.';
            processBtn.disabled = true;
            fileNameDisplay.innerText = '';
            fileInput.value = '';
            return false;
        }

        fileNameDisplay.innerText = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        processBtn.disabled = false;
        return true;
    }

    // Trigger file picker
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

    // Drag and Drop Events
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
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length > 0) {
            fileInput.files = files;
            validateAndSetFile(files[0]);
        }
    });

    // Process Form Submit
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = fileInput.files[0];
            if (!file || !validateAndSetFile(file)) return;

            processBtn.innerText = 'Uploading...';
            processBtn.disabled = true;

            const formData = new FormData();
            formData.append('video_file', file);

            try {
                const response = await fetch('/upload_video', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // Switch UI from Upload Zone to Live Video Stream
                    uploadZone.classList.add('hidden');
                    activeStreamZone.classList.remove('hidden');
                    streamFrame.src = "/video_feed";
                } else {
                    errorMsg.innerText = result.error || 'Failed to upload video.';
                    processBtn.innerText = 'Process';
                    processBtn.disabled = false;
                }
            } catch (err) {
                console.error(err);
                errorMsg.innerText = 'Error uploading video to server.';
                processBtn.innerText = 'Process';
                processBtn.disabled = false;
            }
        });
    }
});