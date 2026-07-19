const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const moods = {
    "😢": 1,
    "😐": 2.5,
    "🙂": 3.5,
    "😃": 4.5,
    "🤩": 5
};
const defaultMood = "🙂";
const defaultSleep = 7;

function tryLockLandscape() {
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(err => {
            console.warn("Screen orientation lock failed:", err);
        });
    }
}

// Default habits list
const defaultHabits = [];

// App State
let state = {
    habits: [...defaultHabits],
    records: {},
    updatedAt: Date.now()
};

let currentYear = 2026;
let currentMonth = 2; // March (0-indexed)
let daysInMonth = 31;
let currentKey = "2026-02";

// Firebase integration globals
let db = null;
let isDemoMode = false;
let firebaseInitialized = false;

// Selection/Modal states
let tempHabits = [];

// Load state from LocalStorage (for Demo/Offline mode)
function loadStateFromLocalStorage() {
    const saved = localStorage.getItem('habitTrackerState_v2');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && Array.isArray(parsed.habits) && parsed.records) {
                state = parsed;
                if (!state.habits) {
                    state.habits = [...defaultHabits];
                }
                return;
            }
        } catch (e) {
            console.error("Error parsing local state, resetting.", e);
        }
    }
    state = {
        habits: [...defaultHabits],
        records: {},
        updatedAt: Date.now()
    };
    saveStateToLocalStorage();
}

function saveStateToLocalStorage() {
    state.updatedAt = Date.now();
    localStorage.setItem('habitTrackerState_v2', JSON.stringify(state));
}

function getActiveRecord() {
    const key = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    currentKey = key;
    daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    if (!state.records[key]) {
        state.records[key] = {
            grid: {},
            mood: Array(daysInMonth).fill(defaultMood),
            sleep: Array(daysInMonth).fill(defaultSleep)
        };
    }

    state.habits.forEach(h => {
        if (!state.records[key].grid[h.id] || state.records[key].grid[h.id].length !== daysInMonth) {
            state.records[key].grid[h.id] = Array(daysInMonth).fill(false);
        }
    });

    return state.records[key];
}

// Unified Sync Data (Saves to Firestore and always updates LocalStorage cache)
function syncData() {
    state.updatedAt = Date.now();
    saveStateToLocalStorage();
    
    if (!isDemoMode && db && firebase.auth().currentUser) {
        const uid = firebase.auth().currentUser.uid;
        db.collection('users').doc(uid).set({
            state: JSON.stringify(state)
        }).then(() => {
            // Restore normal sync status text
            const roleEl = document.getElementById('user-display-role');
            if (roleEl) {
                roleEl.textContent = "Cloud Storage Sync Active";
                roleEl.style.color = "";
            }
        }).catch(err => {
            console.error("Firestore database sync error: ", err);
            // Dynamic warning inside sidebar profile section
            const roleEl = document.getElementById('user-display-role');
            if (roleEl) {
                let details = "DB Error";
                if (err && err.message) {
                    if (err.message.toLowerCase().includes("permission")) {
                        details = "Rules Denied";
                    } else if (err.message.toLowerCase().includes("not enabled") || err.message.toLowerCase().includes("initialize")) {
                        details = "Database Missing";
                    } else {
                        details = err.message.substring(0, 20);
                    }
                }
                roleEl.textContent = `⚠️ Sync Failed: ${details}`;
                roleEl.style.color = "#f43f5e";
            }
        });
    }
}

function createCell(className, textContent) {
    let div = document.createElement('div');
    div.className = className;
    div.textContent = textContent;
    return div;
}

function renderGrid() {
    const grid = document.getElementById('main-sheet-grid');
    grid.innerHTML = '';
    
    const record = getActiveRecord();
    const startDay = new Date(currentYear, currentMonth, 1).getDay();

    grid.style.gridTemplateColumns = `var(--habit-col-width) repeat(${daysInMonth}, var(--cell-size)) var(--col-goal-width) var(--col-actual-width) var(--col-left-width) var(--col-progress-width)`;

    // Row 1: Weeks
    let weekHeaderLabel = createCell('sheet-cell header sticky-left row-week-header sticky-top-1', 'My Habits');
    grid.appendChild(weekHeaderLabel);

    let currentWeek = 1;
    for (let d = 1; d <= daysInMonth; d++) {
        if (d === 1 || (d - 1 + startDay) % 7 === 0) {
            const currentDayOfWeek = (startDay + d - 1) % 7;
            const span = Math.min(7 - currentDayOfWeek, daysInMonth - d + 1);
            let cell = createCell('sheet-cell header row-week-header sticky-top-1', `Wk ${currentWeek}`);
            cell.style.gridColumn = `span ${span}`;
            grid.appendChild(cell);
            currentWeek++;
            d += span - 1;
        }
    }
    
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-goal row-week-header sticky-top-1', 'Goal'));
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-actual row-week-header sticky-top-1', 'Act'));
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-left row-week-header sticky-top-1', 'Left'));
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-progress row-week-header sticky-top-1', 'Progress'));

    // Row 2: Day Names
    let dayNameHeaderEmpty = createCell('sheet-cell header sticky-left row-day-header sticky-top-2', '');
    grid.appendChild(dayNameHeaderEmpty);
    
    for (let d = 0; d < daysInMonth; d++) {
        let name = dayNames[(startDay + d) % 7];
        let cell = createCell('sheet-cell header row-day-header sticky-top-2 col-' + d, name);
        bindCrosshairHover(cell, d, -1);
        grid.appendChild(cell);
    }
    
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-goal row-day-header sticky-top-2', ''));
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-actual row-day-header sticky-top-2', ''));
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-left row-day-header sticky-top-2', ''));
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-progress row-day-header sticky-top-2', ''));

    // Row 3: Dates
    let dateHeaderEmpty = createCell('sheet-cell header sticky-left row-date-header sticky-top-3', '');
    grid.appendChild(dateHeaderEmpty);

    for (let d = 1; d <= daysInMonth; d++) {
        let cell = createCell('sheet-cell header row-date-header sticky-top-3 col-' + (d - 1), d);
        bindCrosshairHover(cell, d - 1, -1);
        grid.appendChild(cell);
    }
    
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-goal row-date-header sticky-top-3', ''));
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-actual row-date-header sticky-top-3', ''));
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-left row-date-header sticky-top-3', ''));
    grid.appendChild(createCell('sheet-cell header sticky-right sticky-right-progress row-date-header sticky-top-3', ''));

    // Habits Rows
    state.habits.forEach((habit, hIndex) => {
        let rowClass = hIndex % 2 === 0 ? 'grid-row-even' : 'grid-row-odd';

        let labelCell = createCell(`sheet-cell sticky-left row-${hIndex} ${rowClass}`, '');
        labelCell.innerHTML = `
            <div class="habit-label">
                <span class="habit-emoji">${habit.emoji}</span>
                <span class="habit-text">${habit.name}</span>
            </div>
        `;
        bindCrosshairHover(labelCell, -1, hIndex);
        grid.appendChild(labelCell);

        const habitGrid = record.grid[habit.id] || Array(daysInMonth).fill(false);
        for (let d = 0; d < daysInMonth; d++) {
            let cell = createCell(`sheet-cell col-${d} row-${hIndex} ${rowClass}`, '');
            if (habitGrid[d]) cell.classList.add('checked-active');

            let label = document.createElement('label');
            label.className = 'checkbox-wrap';
            let cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'square-checkbox';
            cb.checked = habitGrid[d] || false;

            cb.addEventListener('change', () => {
                record.grid[habit.id][d] = cb.checked;
                if (cb.checked) {
                    cell.classList.add('checked-active');
                } else {
                    cell.classList.remove('checked-active');
                }
                syncData();
                updateCalculations();
            });
            
            label.appendChild(cb);
            cell.appendChild(label);
            bindCrosshairHover(cell, d, hIndex);
            grid.appendChild(cell);
        }

        let goalCell = createCell(`sheet-cell sticky-right sticky-right-goal font-mono row-${hIndex} ${rowClass}`, daysInMonth);
        bindCrosshairHover(goalCell, -1, hIndex);
        grid.appendChild(goalCell);

        let actualCell = createCell(`sheet-cell sticky-right sticky-right-actual font-mono row-${hIndex} ${rowClass}`, '0');
        actualCell.id = `habit-actual-${habit.id}`;
        bindCrosshairHover(actualCell, -1, hIndex);
        grid.appendChild(actualCell);

        let leftCell = createCell(`sheet-cell sticky-right sticky-right-left font-mono row-${hIndex} ${rowClass}`, daysInMonth);
        leftCell.id = `habit-left-${habit.id}`;
        bindCrosshairHover(leftCell, -1, hIndex);
        grid.appendChild(leftCell);

        let progressCell = createCell(`sheet-cell sticky-right sticky-right-progress row-${hIndex} ${rowClass}`, '');
        progressCell.id = `habit-progress-${habit.id}`;
        bindCrosshairHover(progressCell, -1, hIndex);
        grid.appendChild(progressCell);
    });

    // Mood Row
    let moodLabel = createCell('sheet-cell sticky-left wellness-cell', '');
    moodLabel.innerHTML = `
        <div class="habit-label">
            <span class="habit-emoji">😐</span>
            <span class="habit-text">Mood</span>
        </div>
    `;
    grid.appendChild(moodLabel);

    for (let d = 0; d < daysInMonth; d++) {
        let cell = createCell('sheet-cell wellness-cell col-' + d, '');
        let select = document.createElement('select');
        select.className = 'sheet-input';
        Object.keys(moods).forEach(m => {
            let opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m === record.mood[d]) opt.selected = true;
            select.appendChild(opt);
        });
        select.addEventListener('change', () => {
            record.mood[d] = select.value;
            syncData();
            drawWellnessChart();
        });
        cell.appendChild(select);
        bindCrosshairHover(cell, d, -1);
        grid.appendChild(cell);
    }
    grid.appendChild(createCell('sheet-cell sticky-right sticky-right-goal wellness-cell', ''));
    grid.appendChild(createCell('sheet-cell sticky-right sticky-right-actual wellness-cell', ''));
    grid.appendChild(createCell('sheet-cell sticky-right sticky-right-left wellness-cell', ''));
    grid.appendChild(createCell('sheet-cell sticky-right sticky-right-progress wellness-cell', ''));

    // Sleep Row
    let sleepLabel = createCell('sheet-cell sticky-left wellness-cell', '');
    sleepLabel.innerHTML = `
        <div class="habit-label">
            <span class="habit-emoji">🛌</span>
            <span class="habit-text">Sleep (hrs)</span>
        </div>
    `;
    grid.appendChild(sleepLabel);

    for (let d = 0; d < daysInMonth; d++) {
        let cell = createCell('sheet-cell wellness-cell font-mono col-' + d, '');
        let input = document.createElement('input');
        input.type = 'number';
        input.className = 'sheet-input';
        input.value = record.sleep[d] !== undefined ? record.sleep[d] : defaultSleep;
        input.min = 0;
        input.max = 24;
        input.addEventListener('change', () => {
            record.sleep[d] = parseFloat(input.value) || 0;
            syncData();
            drawWellnessChart();
        });
        cell.appendChild(input);
        bindCrosshairHover(cell, d, -1);
        grid.appendChild(cell);
    }
    grid.appendChild(createCell('sheet-cell sticky-right sticky-right-goal wellness-cell', ''));
    grid.appendChild(createCell('sheet-cell sticky-right sticky-right-actual wellness-cell', ''));
    grid.appendChild(createCell('sheet-cell sticky-right sticky-right-left wellness-cell', ''));
    grid.appendChild(createCell('sheet-cell sticky-right sticky-right-progress wellness-cell', ''));
}

function bindCrosshairHover(cell, colIndex, rowIndex) {
    cell.addEventListener('mouseenter', () => {
        if (colIndex !== -1) {
            document.querySelectorAll(`.col-${colIndex}`).forEach(el => el.classList.add('highlight-col'));
        }
        if (rowIndex !== -1) {
            document.querySelectorAll(`.row-${rowIndex}`).forEach(el => el.classList.add('highlight-row'));
        }
    });
    cell.addEventListener('mouseleave', () => {
        if (colIndex !== -1) {
            document.querySelectorAll(`.col-${colIndex}`).forEach(el => el.classList.remove('highlight-col'));
        }
        if (rowIndex !== -1) {
            document.querySelectorAll(`.row-${rowIndex}`).forEach(el => el.classList.remove('highlight-row'));
        }
    });
}

function updateCalculations() {
    const record = getActiveRecord();
    let totalCompleted = 0;
    const totalGoal = state.habits.length * daysInMonth;

    let habitStats = state.habits.map((h) => ({
        id: h.id,
        name: h.name,
        emoji: h.emoji,
        completed: 0,
        goal: daysInMonth
    }));

    let dailyCompleted = Array(daysInMonth).fill(0);

    state.habits.forEach((habit, hIdx) => {
        const habitGrid = record.grid[habit.id] || Array(daysInMonth).fill(false);
        for (let d = 0; d < daysInMonth; d++) {
            if (habitGrid[d]) {
                totalCompleted++;
                habitStats[hIdx].completed++;
                dailyCompleted[d]++;
            }
        }
    });

    const completionRate = totalGoal > 0 ? (totalCompleted / totalGoal) : 0;
    document.getElementById('overall-donut-pct').textContent = Math.round(completionRate * 100) + '%';
    document.getElementById('stat-completed').textContent = totalCompleted;
    document.getElementById('stat-left').textContent = Math.max(0, totalGoal - totalCompleted);

    const donutFill = document.getElementById('overall-donut-fill');
    if (donutFill) {
        const radius = 42;
        const circ = 2 * Math.PI * radius;
        donutFill.style.strokeDasharray = circ;
        donutFill.style.strokeDashoffset = circ - (completionRate * circ);
    }

    habitStats.forEach(stat => {
        const actualEl = document.getElementById(`habit-actual-${stat.id}`);
        const leftEl = document.getElementById(`habit-left-${stat.id}`);
        const progressEl = document.getElementById(`habit-progress-${stat.id}`);

        const leftDays = Math.max(0, stat.goal - stat.completed);
        const pct = Math.round((stat.completed / stat.goal) * 100);

        if (actualEl) actualEl.textContent = stat.completed;
        if (leftEl) leftEl.textContent = leftDays;
        if (progressEl) {
            progressEl.innerHTML = `
                <div class="sheet-progress-wrapper">
                    <span class="sheet-progress-text">${pct}%</span>
                    <div class="sheet-progress-bar">
                        <div class="sheet-progress-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }
    });

    const dailyContainer = document.getElementById('daily-bars-container');
    if (dailyContainer) {
        dailyContainer.innerHTML = '';
        for (let d = 0; d < daysInMonth; d++) {
            const pct = state.habits.length > 0 ? (dailyCompleted[d] / state.habits.length) * 100 : 0;
            
            let container = document.createElement('div');
            container.className = 'chart-bar-container';

            let fill = document.createElement('div');
            fill.className = 'chart-bar-fill';
            fill.style.height = `${pct}%`;

            let label = document.createElement('div');
            label.className = 'chart-bar-label';
            label.textContent = d + 1;

            container.appendChild(fill);
            container.appendChild(label);
            dailyContainer.appendChild(container);
        }
    }

    const leaderboardBody = document.getElementById('leaderboard-body');
    if (leaderboardBody) {
        leaderboardBody.innerHTML = '';
        habitStats.sort((a, b) => b.completed - a.completed);
        habitStats.slice(0, 10).forEach((stat, rank) => {
            let pct = Math.round((stat.completed / stat.goal) * 100);
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align: center;"><span class="rank-badge">${rank + 1}</span></td>
                <td><span style="font-weight: 600;">${stat.emoji} ${stat.name}</span></td>
                <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent-emerald);">${pct}%</td>
            `;
            leaderboardBody.appendChild(tr);
        });
    }
}

function drawWellnessChart() {
    const record = getActiveRecord();
    const svg = document.getElementById('wellness-line-chart');
    if (!svg) return;

    const elementsToRemove = svg.querySelectorAll('path, line, circle');
    elementsToRemove.forEach(el => el.remove());

    const width = 1000;
    const height = 180;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const paddingX = 40;
    const paddingY = 20;
    const stepX = (width - paddingX * 2) / (daysInMonth - 1);

    let moodPoints = [];
    let sleepPoints = [];

    for (let d = 0; d < daysInMonth; d++) {
        const x = paddingX + d * stepX;

        const moodVal = moods[record.mood[d]] || 2.5;
        const yMood = height - paddingY - ((moodVal - 1) / 4) * (height - paddingY * 2);
        moodPoints.push({ x, y: yMood });

        const sleepVal = record.sleep[d] !== undefined ? record.sleep[d] : defaultSleep;
        const ySleep = height - paddingY - (sleepVal / 12) * (height - paddingY * 2);
        sleepPoints.push({ x, y: ySleep });
    }

    for (let i = 0; i <= 4; i++) {
        let y = paddingY + (i / 4) * (height - paddingY * 2);
        let line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', paddingX);
        line.setAttribute('y1', y);
        line.setAttribute('x2', width - paddingX);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', 'var(--border-subtle)');
        line.setAttribute('stroke-dasharray', '5 5');
        svg.appendChild(line);
    }

    let drawArea = (points, gradId) => {
        let pathD = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            pathD += ` L ${points[i].x} ${points[i].y}`;
        }
        pathD += ` L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;
        let areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        areaPath.setAttribute('d', pathD);
        areaPath.setAttribute('fill', `url(#${gradId})`);
        svg.appendChild(areaPath);
    };

    drawArea(moodPoints, 'moodAreaGrad');
    drawArea(sleepPoints, 'sleepAreaGrad');

    let drawLine = (points, strokeColor) => {
        let pathD = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            pathD += ` L ${points[i].x} ${points[i].y}`;
        }
        let linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        linePath.setAttribute('d', pathD);
        linePath.setAttribute('stroke', strokeColor);
        linePath.setAttribute('stroke-width', '2.5');
        linePath.setAttribute('fill', 'none');
        linePath.setAttribute('stroke-linecap', 'round');
        linePath.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(linePath);
    };

    drawLine(moodPoints, '#10b981');
    drawLine(sleepPoints, '#6366f1');
}

// ========================================================
// HABIT CONFIGURATION MODAL CONTROLS (Bug Fixed)
// ========================================================
function openModal() {
    document.getElementById('habits-modal').classList.add('active');
    // BUG FIX: Load tempHabits ONCE when opening modal
    tempHabits = JSON.parse(JSON.stringify(state.habits));
    renderModalHabits();
}

function closeModal() {
    document.getElementById('habits-modal').classList.remove('active');
}

function renderModalHabits() {
    const container = document.getElementById('modal-habits-list');
    container.innerHTML = '';
    // BUG FIX: Do NOT overwrite tempHabits from state inside this render loop anymore!

    tempHabits.forEach((h, idx) => {
        let row = document.createElement('div');
        row.className = 'modal-habit-row';

        let emojiIn = document.createElement('input');
        emojiIn.type = 'text';
        emojiIn.className = 'form-input emoji-input';
        emojiIn.value = h.emoji;
        emojiIn.addEventListener('input', (e) => { tempHabits[idx].emoji = e.target.value; });

        let nameIn = document.createElement('input');
        nameIn.type = 'text';
        nameIn.className = 'form-input name-input';
        nameIn.value = h.name;
        nameIn.addEventListener('input', (e) => { tempHabits[idx].name = e.target.value; });

        let delBtn = document.createElement('button');
        delBtn.className = 'delete-habit-btn';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => {
            tempHabits.splice(idx, 1);
            renderModalHabits();
        });

        row.appendChild(emojiIn);
        row.appendChild(nameIn);
        row.appendChild(delBtn);
        container.appendChild(row);
    });
}

function setupModalActions() {
    const addBtn = document.getElementById('add-habit-btn');
    const newEmoji = document.getElementById('new-habit-emoji');
    const newName = document.getElementById('new-habit-name');
    const saveBtn = document.getElementById('save-habits-btn');

    addBtn.addEventListener('click', () => {
        const emojiVal = newEmoji.value.trim() || "⭐";
        const nameVal = newName.value.trim();
        if (!nameVal) return;

        tempHabits.push({
            id: 'h-' + Date.now(),
            name: nameVal,
            emoji: emojiVal
        });

        newEmoji.value = '';
        newName.value = '';
        renderModalHabits();
    });

    saveBtn.addEventListener('click', () => {
        const oldIds = state.habits.map(h => h.id);
        const newIds = tempHabits.map(h => h.id);
        const deletedIds = oldIds.filter(id => !newIds.includes(id));

        state.habits = tempHabits;

        Object.keys(state.records).forEach(key => {
            deletedIds.forEach(id => {
                if (state.records[key].grid[id]) {
                    delete state.records[key].grid[id];
                }
            });
        });

        syncData();
        renderGrid();
        updateCalculations();
        closeModal();
    });

    document.getElementById('open-habits-modal-btn').addEventListener('click', openModal);
    document.getElementById('sidebar-manage-btn').addEventListener('click', openModal);
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
}

// ========================================================
// FIREBASE CONFIGURATION & INITIALIZATION
// ========================================================
// Paste your Firebase web configuration credentials here:
const firebaseConfig = {
    apiKey: "AIzaSyB4breQOdJkkQ7yz6Lr_TVChkTSb5ZxMOM",
  authDomain: "dailytask-df666.firebaseapp.com",
  projectId: "dailytask-df666",
  storageBucket: "dailytask-df666.firebasestorage.app",
  messagingSenderId: "250111424937",
  appId: "1:250111424937:web:6eb3766cd8d6ca07e86cb8"
};

function setupFirebase() {
    // If the config keys are placeholders, run in offline demo mode automatically
    if (firebaseConfig.apiKey === "YOUR_API_KEY" || !firebaseConfig.apiKey) {
        console.warn("Firebase config is not set. Running in Offline Demo Mode.");
        isDemoMode = true;
        
        // Hide authentication overlays, setup demo profile UI
        document.getElementById('firebase-auth-modal').classList.remove('active');
        document.getElementById('sidebar-signout-btn').style.display = 'none';
        
        document.getElementById('user-display-name').textContent = "Demo User";
        document.getElementById('user-display-role').textContent = "Offline / Local Mode";
        document.getElementById('user-avatar-initials').textContent = "DM";
        
        loadStateFromLocalStorage();
        renderGrid();
        updateCalculations();
        drawWellnessChart();
        return;
    }

    // Otherwise, initialize Firebase app
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        firebaseInitialized = true;
        
        // Listen to Auth State Changes
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                isDemoMode = false;
                document.getElementById('firebase-auth-modal').classList.remove('active');
                
                const signoutBtn = document.getElementById('sidebar-signout-btn');
                signoutBtn.innerHTML = '<span class="nav-icon">🚪</span> Sign Out';
                signoutBtn.style.display = 'flex';
                
                const email = user.email;
                document.getElementById('user-display-name').textContent = email;
                document.getElementById('user-display-role').textContent = "Cloud Storage Sync Active";
                
                const initials = email.substring(0, 2).toUpperCase();
                document.getElementById('user-avatar-initials').textContent = initials;
                
                loadUserFirestoreData(user.uid);
            } else {
                if (isDemoMode) {
                    document.getElementById('firebase-auth-modal').classList.remove('active');
                    
                    const signoutBtn = document.getElementById('sidebar-signout-btn');
                    signoutBtn.innerHTML = '<span class="nav-icon">🚪</span> Exit Demo Mode';
                    signoutBtn.style.display = 'flex';
                    
                    document.getElementById('user-display-name').textContent = "Demo User";
                    document.getElementById('user-display-role').textContent = "Offline / Local Mode";
                    document.getElementById('user-avatar-initials').textContent = "DM";
                    
                    loadStateFromLocalStorage();
                    renderGrid();
                    updateCalculations();
                    drawWellnessChart();
                } else {
                    document.getElementById('firebase-auth-modal').classList.add('active');
                    document.getElementById('sidebar-signout-btn').style.display = 'none';
                }
            }
        });
    } catch (err) {
        console.error("Firebase Initialization Failure:", err);
        // Fallback to demo mode so app doesn't break
        isDemoMode = true;
        document.getElementById('firebase-auth-modal').classList.remove('active');
        loadStateFromLocalStorage();
        renderGrid();
        updateCalculations();
        drawWellnessChart();
    }
}

function loadUserFirestoreData(uid) {
    db.collection('users').doc(uid).get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            if (data.state) {
                try {
                    const cloudState = JSON.parse(data.state);
                    
                    // Compare timestamps. If local state has newer changes, sync them UP to cloud and keep them!
                    if (cloudState && cloudState.updatedAt && state && state.updatedAt) {
                        if (state.updatedAt > cloudState.updatedAt) {
                            console.log("Local state is newer than cloud. Syncing local state UP.");
                            syncData();
                            return;
                        }
                    }
                    
                    state = cloudState;
                    if (!state.habits) {
                        state.habits = [...defaultHabits];
                    }
                    renderGrid();
                    updateCalculations();
                    drawWellnessChart();
                    return;
                } catch(e) {
                    console.error("Error parsing DB state", e);
                }
            }
        }
        // First time logging in (new online user)
        // Sync their current local state (from offline / local edits) to their new Firestore account
        syncData();
        renderGrid();
        updateCalculations();
        drawWellnessChart();
    }).catch((err) => {
        console.error("Firestore Loading error:", err);
        // Fallback to local storage (data won't be lost)
        loadStateFromLocalStorage();
        renderGrid();
        updateCalculations();
        drawWellnessChart();
        
        // Show status warning
        const roleEl = document.getElementById('user-display-role');
        if (roleEl) {
            let details = "DB Offline";
            if (err && err.message) {
                if (err.message.toLowerCase().includes("permission")) {
                    details = "Rules Denied";
                } else if (err.message.toLowerCase().includes("not enabled") || err.message.toLowerCase().includes("initialize")) {
                    details = "Database Missing";
                } else {
                    details = err.message.substring(0, 20);
                }
            }
            roleEl.textContent = `⚠️ Sync Offline: ${details}`;
            roleEl.style.color = "#f43f5e";
        }
    });
}

function setupAuthForms() {
    const form = document.getElementById('auth-form');
    const emailIn = document.getElementById('auth-email');
    const passIn = document.getElementById('auth-password');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleLink = document.getElementById('auth-toggle-link');
    const toggleText = document.getElementById('auth-toggle-text');
    const errorMsg = document.getElementById('auth-error-msg');
    
    let isRegisterState = false;

    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isRegisterState = !isRegisterState;
        
        if (isRegisterState) {
            document.getElementById('auth-title').textContent = "Create Account";
            document.getElementById('auth-subtitle').textContent = "Sign up with email to secure your productivity goals.";
            submitBtn.textContent = "Register";
            toggleText.textContent = "Already have an account?";
            toggleLink.textContent = "Sign In";
        } else {
            document.getElementById('auth-title').textContent = "Welcome Back";
            document.getElementById('auth-subtitle').textContent = "Sign in to sync your habits and productivity progress.";
            submitBtn.textContent = "Sign In";
            toggleText.textContent = "Don't have an account?";
            toggleLink.textContent = "Create Account";
        }
        errorMsg.textContent = "";
    });

    submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        tryLockLandscape();
        const email = emailIn.value.trim();
        const password = passIn.value.trim();
        if (!email || !password) {
            errorMsg.textContent = "Please fill in all credentials.";
            return;
        }

        errorMsg.textContent = "Processing...";
        
        const handleAuthError = (err) => {
            console.error("Firebase Auth Error:", err);
            let msg = err.message;
            if (err.code === "auth/configuration-not-found" || err.code === "auth/operation-not-allowed") {
                msg = "Email/Password sign-in is disabled. Please go to Firebase Console -> Authentication -> Sign-in method and Enable 'Email/Password'!";
            } else if (err.code === "auth/email-already-in-use") {
                msg = "This email is already registered. Please sign in instead.";
            } else if (err.code === "auth/weak-password") {
                msg = "Password should be at least 6 characters.";
            } else if (err.code === "auth/invalid-email") {
                msg = "Invalid email format. Please verify and try again.";
            } else if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
                msg = "Invalid email or password. Please check your credentials.";
            }
            errorMsg.textContent = msg;
        };

        if (isRegisterState) {
            // Register user
            firebase.auth().createUserWithEmailAndPassword(email, password)
                .catch(handleAuthError);
        } else {
            // Sign in user
            firebase.auth().signInWithEmailAndPassword(email, password)
                .catch(handleAuthError);
        }
    });

    // Offline mode bypass
    document.getElementById('auth-demo-btn').addEventListener('click', () => {
        tryLockLandscape();
        isDemoMode = true;
        document.getElementById('firebase-auth-modal').classList.remove('active');
        
        // Show Exit Demo Mode button
        const signoutBtn = document.getElementById('sidebar-signout-btn');
        signoutBtn.innerHTML = '<span class="nav-icon">🚪</span> Exit Demo Mode';
        signoutBtn.style.display = 'flex';

        document.getElementById('user-display-name').textContent = "Demo User";
        document.getElementById('user-display-role').textContent = "Offline / Local Mode";
        document.getElementById('user-avatar-initials').textContent = "DM";
        
        loadStateFromLocalStorage();
        renderGrid();
        updateCalculations();
        drawWellnessChart();
    });

    // Sign out & Exit Demo logic
    document.getElementById('sidebar-signout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        if (firebaseInitialized && firebase.auth().currentUser) {
            firebase.auth().signOut().then(() => {
                isDemoMode = false;
                document.getElementById('firebase-auth-modal').classList.add('active');
                document.getElementById('sidebar-signout-btn').style.display = 'none';
            });
        } else {
            // Exit Demo Mode
            isDemoMode = false;
            document.getElementById('firebase-auth-modal').classList.add('active');
            document.getElementById('sidebar-signout-btn').style.display = 'none';
            
            document.getElementById('user-display-name').textContent = "Sign In Required";
            document.getElementById('user-display-role').textContent = "Not Connected";
            document.getElementById('user-avatar-initials').textContent = "??";
        }
    });
}

function setupCalendarSync() {
    document.getElementById('year-select').addEventListener('change', (e) => {
        currentYear = parseInt(e.target.value);
        renderGrid();
        updateCalculations();
        drawWellnessChart();
    });

    document.getElementById('month-select').addEventListener('change', (e) => {
        currentMonth = parseInt(e.target.value);
        renderGrid();
        updateCalculations();
        drawWellnessChart();
    });
}

window.addEventListener('resize', () => {
    drawWellnessChart();
});

function setupThemeController() {
    const toggleBtn = document.getElementById('theme-toggle-btn');
    
    // Load preference
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    }
    
    toggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme);
        
        // Re-draw wellness trend chart to align SVG boundaries
        drawWellnessChart();
    });
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Load local storage cache immediately so they see their data instantly on refresh
    loadStateFromLocalStorage();
    renderGrid();
    updateCalculations();
    drawWellnessChart();

    // Set up form components
    setupModalActions();
    setupCalendarSync();
    setupAuthForms();
    setupFirebase();
    setupThemeController();
});
