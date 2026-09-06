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
        cutout: '45%'
    }
});

let lastViolationCount = 0;

// 3. Mock/Fetch Stats Data Function
function fetchStats() {
    // Replace with your real fetch('/api/stats') endpoint when ready
    const data = {
        total_violations: 12,
        missing_hats: 7,
        missing_vests: 5,
        timeline_data: [
            { time: '12:00', count: 2 },
            { time: '12:05', count: 5 },
            { time: '12:10', count: 3 },
            { time: '12:15', count: 8 },
            { time: '12:20', count: 6 },
            { time: '12:25', count: 11 }
        ],
        recent_events: [
            { time: '10:42:15', type: 'danger', desc: 'Missing Hardhat' },
            { time: '10:40:02', type: 'warning', desc: 'Missing Safety Vest' },
            { time: '10:35:50', type: 'danger', desc: 'Missing Hardhat' }
        ]
    };

    // Update Text Counters
    document.getElementById('stat-total').innerText = data.total_violations;
    document.getElementById('stat-hats').innerText = data.missing_hats;
    document.getElementById('stat-vests').innerText = data.missing_vests;

    // Trigger Toast on New Violation
    if (data.total_violations > lastViolationCount) {
        lastViolationCount = data.total_violations;
        triggerAlertToast();
    }

    // Update Timeline Line Chart
    if (data.timeline_data.length > 0) {
        timelineChart.data.labels = data.timeline_data.map(item => item.time);
        timelineChart.data.datasets[0].data = data.timeline_data.map(item => item.count);
        timelineChart.update();
    }

    // Update Donut Chart
    violationPieChart.data.datasets[0].data = [data.missing_hats, data.missing_vests];
    violationPieChart.update();

    // Render Event Stream Log
    renderEventLog(data.recent_events);
}

// 4. Render Event Stream Items
function renderEventLog(events) {
    const eventList = document.getElementById('event-list');
    if (!eventList || !events) return;

    eventList.innerHTML = events.map(event => `
        <div class="event-item ${event.type}">
            <span class="event-time">${event.time}</span>
            <span class="event-desc">${event.desc}</span>
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

// 6. Fullscreen Video Stream Handler
// function openFullscreen() {
//     const streamImg = document.getElementById('stream-frame');
//     if (streamImg) {
//         if (streamImg.requestFullscreen) {
//             streamImg.requestFullscreen();
//         } else if (streamImg.webkitRequestFullscreen) {
//             streamImg.webkitRequestFullscreen();
//         } else if (streamImg.msRequestFullscreen) {
//             streamImg.msRequestFullscreen();
//         }
//     }
// }

// 7. Polling Interval
setInterval(fetchStats, 1000);

// 8. DOM Listeners for Sidebar Toggle
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