const STORAGE_KEY = "yardPlantCare.v1";

const defaultState = {
    plants: [
    {
        id: crypto.randomUUID(),
        name: "Braided hibiscus",
        type: "Hibiscus",
        icon: "🌺",
        location: "Patio / sunny spot",
        light: "Full sun",
        waterInterval: 3,
        waterAmount: "Keep evenly moist; water deeply when top inch is dry",
        lastWatered: toISODate(new Date()),
        notes: "Bring in or protect if nights get cold. Prune lightly to shape.",
        x: 28,
        y: 70
    },
    {
        id: crypto.randomUUID(),
        name: "Shade hostas",
        type: "Hosta",
        icon: "🌿",
        location: "Side yard shade bed",
        light: "Shade",
        waterInterval: 7,
        waterAmount: "Deep soak weekly if rain is low",
        lastWatered: toISODate(new Date(Date.now() - 5 * 86400000)),
        notes: "Watch for slugs and deer browsing.",
        x: 76,
        y: 52
    }
    ],
    photoDataUrl: "",
    lastNotificationDate: ""
};

let state = loadState();
let draggingId = null;
let plantCareLibrary = [];

const els = {
    tabs: document.querySelectorAll(".tab-btn"),
    sections: document.querySelectorAll("main section"),
    todaySummary: document.getElementById("todaySummary"),
    dueList: document.getElementById("dueList"),
    totalPlants: document.getElementById("totalPlants"),
    dueCount: document.getElementById("dueCount"),
    mappedCount: document.getElementById("mappedCount"),
    plantForm: document.getElementById("plantForm"),
    plantList: document.getElementById("plantList"),
    formTitle: document.getElementById("formTitle"),
    plantId: document.getElementById("plantId"),
    plantName: document.getElementById("plantName"),
    plantNameSuggestions: document.getElementById("plantNameSuggestions"),
    plantIcon: document.getElementById("plantIcon"),
    plantType: document.getElementById("plantType"),
    plantLocation: document.getElementById("plantLocation"),
    plantLight: document.getElementById("plantLight"),
    waterInterval: document.getElementById("waterInterval"),
    waterAmount: document.getElementById("waterAmount"),
    lastWatered: document.getElementById("lastWatered"),
    plantNotes: document.getElementById("plantNotes"),
    resetForm: document.getElementById("resetForm"),
    selectedPlant: document.getElementById("selectedPlant"),
    yardMap: document.getElementById("yardMap"),
    photoUpload: document.getElementById("photoUpload"),
    clearPhoto: document.getElementById("clearPhoto"),
    mapNotice: document.getElementById("mapNotice"),
    enableNotifications: document.getElementById("enableNotifications"),
    downloadIcs: document.getElementById("downloadIcs"),
    exportJson: document.getElementById("exportJson"),
    importJson: document.getElementById("importJson"),
    installHintBtn: document.getElementById("installHintBtn")
};

function toISODate(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

function parseDate(dateString) {
    if (!dateString) return null;
    return new Date(dateString + "T12:00:00");
}

function daysBetween(a, b) {
    const ms = 86400000;
    const start = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const end = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.floor((end - start) / ms);
}

function nextWaterDate(plant) {
    const last = parseDate(plant.lastWatered);
    if (!last) return new Date();
    const next = new Date(last);
    next.setDate(last.getDate() + Number(plant.waterInterval || 7));
    return next;
}

function waterStatus(plant) {
    const today = parseDate(toISODate(new Date()));
    const next = nextWaterDate(plant);
    const diff = daysBetween(today, next);
    if (diff < 0) return { label: `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`, className: "overdue", sort: diff };
    if (diff === 0) return { label: "Due today", className: "due", sort: 0 };
    return { label: `Due in ${diff} day${diff === 1 ? "" : "s"}`, className: "ok", sort: diff };
}

function loadState() {
    try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(defaultState), ...parsed, plants: parsed.plants || [] };
    } catch (err) {
    console.warn("Could not load saved state", err);
    return structuredClone(defaultState);
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
    saveState();
    renderDashboard();
    renderPlantList();
    renderPlantSelect();
    renderMap();
}

async function loadPlantCareLibrary() {
    try {
        const response = await fetch("./plant-care.csv", { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not load plant-care.csv: ${response.status}`);

        const csvText = await response.text();

        plantCareLibrary = parseCsv(csvText)
            .map(normalizePlantCareRow)
            .filter(row => row.name);

        renderPlantNameSuggestions();

        console.info(`Loaded ${plantCareLibrary.length} plant care library entries.`);
    } catch (err) {
        console.info("No plant-care.csv library loaded yet. Add plant-care.csv next to index.html to enable autofill.", err);
    }
}

function renderPlantNameSuggestions() {
    if (!els.plantNameSuggestions) return;

    els.plantNameSuggestions.innerHTML = "";

    plantCareLibrary
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(row => {
            const option = document.createElement("option");
            option.value = row.name;
            option.label = row.type
                ? `${row.className || "Plant"} · ${row.type}`
                : (row.className || "Plant");

            els.plantNameSuggestions.appendChild(option);
        });
}

function normalizePlantCareRow(row) {
    return {
        name: row["Name"] || "",
        className: row["Class"] || "",
        type: row["Type/Variety"] || "",
        light: row["Sun Need"] || "",
        waterInterval: parseWaterEvery(row["Water Every"] || ""),
        waterAmount: row["Water Amount"] || "",
        notes: row["Care Notes"] || ""
    };
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === "\"" && inQuotes && next === "\"") {
            cell += "\"";
            i++;
        } else if (char === "\"") {
            inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
            row.push(cell.trim());
            cell = "";
        } else if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && next === "\n") i++;

            row.push(cell.trim());

            if (row.some(value => value !== "")) {
                rows.push(row);
            }

            row = [];
            cell = "";
        } else {
            cell += char;
        }
    }

    row.push(cell.trim());

    if (row.some(value => value !== "")) {
        rows.push(row);
    }

    if (!rows.length) return [];

    const headers = rows[0].map(header => header.replace(/^\uFEFF/, "").trim());

    return rows.slice(1).map(values => {
        const object = {};

        headers.forEach((header, index) => {
            object[header] = values[index] || "";
        });

        return object;
    });
}

function parseWaterEvery(value) {
    const text = String(value).trim().toLowerCase();

    if (!text) return "";
    if (text === "daily" || text === "every day") return 1;
    if (text.includes("weekly")) return 7;
    if (text.includes("biweekly") || text.includes("every other week")) return 14;
    if (text.includes("monthly")) return 30;

    const match = text.match(/[0-9]+([.][0-9]+)?/);
    const number = match ? Number(match[0]) : NaN;

    if (!Number.isFinite(number)) return "";

    if (text.includes("week")) return Math.round(number * 7);
    if (text.includes("month")) return Math.round(number * 30);

    return Math.round(number);
}

function normalizeLookupName(value) {
    return String(value || "").trim().toLowerCase();
}

function autofillPlantFromLibrary() {
    // Only autofill when creating a new plant.
    // Do not overwrite existing saved plants while editing.
    if (els.plantId.value) return;

    const typedName = normalizeLookupName(els.plantName.value);
    if (!typedName) return;

    const match = plantCareLibrary.find(row => normalizeLookupName(row.name) === typedName);
    if (!match) return;

    if (match.type) els.plantType.value = match.type;
    if (match.light) setSelectValue(els.plantLight, match.light);
    if (match.waterInterval) setSelectValue(els.waterInterval, String(match.waterInterval));
    if (match.waterAmount) els.waterAmount.value = match.waterAmount;
    if (match.notes) els.plantNotes.value = match.notes;
    if (match.className) els.plantIcon.value = iconForPlantClass(match.className);
}

function setSelectValue(select, value) {
    const normalizedValue = String(value).trim().toLowerCase();

    const existingOption = [...select.options].find(option => {
        return option.value.toLowerCase() === normalizedValue ||
            option.textContent.trim().toLowerCase() === normalizedValue;
    });

    if (existingOption) {
        select.value = existingOption.value;
        return;
    }

    // This allows CSV values like "5 days" to become a new dropdown option.
    if (select === els.waterInterval) {
        const parsedInterval = parseWaterEvery(value);

        if (parsedInterval) {
            const option = document.createElement("option");
            option.value = String(parsedInterval);
            option.textContent = `${parsedInterval} day${parsedInterval === 1 ? "" : "s"}`;
            select.appendChild(option);
            select.value = String(parsedInterval);
        }
    }
}

function iconForPlantClass(className) {
    const text = String(className).toLowerCase();

    if (text.includes("flower")) return "🌺";
    if (text.includes("tree") || text.includes("shrub")) return "🌳";
    if (text.includes("succulent") || text.includes("cactus")) return "🌵";
    if (text.includes("vegetable")) return "🍅";
    if (text.includes("berry") || text.includes("fruit")) return "🫐";
    if (text.includes("potted") || text.includes("indoor")) return "🪴";
    if (text.includes("new")) return "🌱";

    return "🌿";
}

function renderDashboard() {
    const plants = [...state.plants].sort((a, b) => waterStatus(a).sort - waterStatus(b).sort);
    const due = plants.filter(p => waterStatus(p).sort <= 0);
    els.totalPlants.textContent = String(plants.length);
    els.dueCount.textContent = String(due.length);
    els.mappedCount.textContent = String(plants.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).length);
    els.todaySummary.textContent = due.length
    ? `${due.length} plant${due.length === 1 ? " is" : "s are"} due for water.`
    : "Nothing is due today. Nice.";

    els.dueList.innerHTML = "";
    if (!plants.length) {
    els.dueList.innerHTML = `<div class="empty-state">Add your first plant to start tracking watering.</div>`;
    return;
    }

    const focusPlants = due.length ? due : plants.slice(0, 4);
    focusPlants.forEach(plant => els.dueList.appendChild(createPlantCard(plant, { compact: true })));
}

function renderPlantList() {
    els.plantList.innerHTML = "";
    if (!state.plants.length) {
    els.plantList.innerHTML = `<div class="empty-state">No plants yet. Add one using the form.</div>`;
    return;
    }
    [...state.plants]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(plant => els.plantList.appendChild(createPlantCard(plant)));
}

function createPlantCard(plant, options = {}) {
    const status = waterStatus(plant);
    const card = document.createElement("article");
    card.className = "plant-card";
    card.innerHTML = `
    <div class="plant-icon" aria-hidden="true">${escapeHtml(plant.icon || "🌿")}</div>
    <div>
        <h3>${escapeHtml(plant.name || "Unnamed plant")}</h3>
        <div class="small muted">${escapeHtml(plant.type || "Unknown type")} · ${escapeHtml(plant.location || "No location set")}</div>
        <div class="plant-meta">
        <span class="pill ${status.className}">💧 ${status.label}</span>
        <span class="pill">☀️ ${escapeHtml(plant.light || "Unknown light")}</span>
        <span class="pill">🔁 every ${Number(plant.waterInterval || 7)} day${Number(plant.waterInterval || 7) === 1 ? "" : "s"}</span>
        </div>
        ${plant.waterAmount ? `<p class="small"><strong>Water:</strong> ${escapeHtml(plant.waterAmount)}</p>` : ""}
        ${!options.compact && plant.notes ? `<p class="small muted">${escapeHtml(plant.notes)}</p>` : ""}
        <div class="actions">
        <button class="primary" type="button" data-action="water" data-id="${plant.id}">Watered today</button>
        <button class="secondary" type="button" data-action="edit" data-id="${plant.id}">Edit</button>
        ${!options.compact ? `<button class="ghost" type="button" data-action="place" data-id="${plant.id}">Place on map</button><button class="danger" type="button" data-action="delete" data-id="${plant.id}">Delete</button>` : ""}
        </div>
    </div>
    `;
    return card;
}

function renderPlantSelect() {
    const previous = els.selectedPlant.value;
    els.selectedPlant.innerHTML = "";
    if (!state.plants.length) {
    els.selectedPlant.innerHTML = `<option value="">Add a plant first</option>`;
    return;
    }
    state.plants.forEach(plant => {
    const option = document.createElement("option");
    option.value = plant.id;
    option.textContent = `${plant.icon || "🌿"} ${plant.name}`;
    els.selectedPlant.appendChild(option);
    });
    if (previous && state.plants.some(p => p.id === previous)) els.selectedPlant.value = previous;
}

function renderMap() {
    const photo = state.photoDataUrl;
    els.yardMap.querySelectorAll(".pin").forEach(pin => pin.remove());
    els.yardMap.classList.toggle("has-photo", Boolean(photo));
    if (photo) {
    els.yardMap.style.backgroundImage = `url(${photo})`;
    els.yardMap.querySelectorAll(".map-label").forEach(el => el.classList.add("hidden"));
    const help = els.yardMap.querySelector(".map-help");
    help.textContent = "Tap to place the selected plant. Drag pins to fine-tune.";
    } else {
    els.yardMap.style.backgroundImage = "";
    els.yardMap.querySelectorAll(".map-label").forEach(el => el.classList.remove("hidden"));
    const help = els.yardMap.querySelector(".map-help");
    help.textContent = "No photo yet: use this as a rough yard layout, or upload a picture of the outside area.";
    }

    state.plants.forEach(plant => {
    if (!Number.isFinite(plant.x) || !Number.isFinite(plant.y)) return;
    const pin = document.createElement("button");
    pin.className = "pin";
    pin.type = "button";
    pin.dataset.id = plant.id;
    pin.style.left = `${plant.x}%`;
    pin.style.top = `${plant.y}%`;
    pin.innerHTML = `${escapeHtml(plant.icon || "🌿")}<span class="pin-label">${escapeHtml(plant.name)}</span>`;
    if (plant.id === els.selectedPlant.value) pin.classList.add("selected");
    pin.addEventListener("pointerdown", startDrag);
    pin.addEventListener("click", (event) => {
        event.stopPropagation();
        els.selectedPlant.value = plant.id;
        renderMap();
    });
    els.yardMap.appendChild(pin);
    });
}

function startDrag(event) {
    draggingId = event.currentTarget.dataset.id;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
}

function moveDrag(event) {
    if (!draggingId) return;
    placePlantAtPointer(draggingId, event);
}

function endDrag() {
    draggingId = null;
}

function placePlantAtPointer(id, event) {
    const rect = els.yardMap.getBoundingClientRect();
    const x = Math.max(1, Math.min(99, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(1, Math.min(99, ((event.clientY - rect.top) / rect.height) * 100));
    state.plants = state.plants.map(plant => plant.id === id ? { ...plant, x, y } : plant);
    saveState();
    renderMap();
}

function escapeHtml(value) {
    return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetForm() {
    els.formTitle.textContent = "Add a plant";
    els.plantId.value = "";
    els.plantName.value = "";
    els.plantIcon.value = "🌺";
    els.plantType.value = "";
    els.plantLocation.value = "";
    els.plantLight.value = "Full sun";
    els.waterInterval.value = "3";
    els.waterAmount.value = "";
    els.lastWatered.value = toISODate(new Date());
    els.plantNotes.value = "";
}

function editPlant(id) {
    const plant = state.plants.find(p => p.id === id);
    if (!plant) return;
    els.formTitle.textContent = "Edit plant";
    els.plantId.value = plant.id;
    els.plantName.value = plant.name || "";
    els.plantIcon.value = plant.icon || "🌿";
    els.plantType.value = plant.type || "";
    els.plantLocation.value = plant.location || "";
    els.plantLight.value = plant.light || "Unknown / look up later";
    els.waterInterval.value = String(plant.waterInterval || 7);
    els.waterAmount.value = plant.waterAmount || "";
    els.lastWatered.value = plant.lastWatered || toISODate(new Date());
    els.plantNotes.value = plant.notes || "";
    switchTab("plants");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function savePlantFromForm(event) {
    event.preventDefault();
    const id = els.plantId.value || crypto.randomUUID();
    const existing = state.plants.find(p => p.id === id) || {};
    const plant = {
    ...existing,
    id,
    name: els.plantName.value.trim(),
    icon: els.plantIcon.value,
    type: els.plantType.value.trim(),
    location: els.plantLocation.value.trim(),
    light: els.plantLight.value,
    waterInterval: Number(els.waterInterval.value),
    waterAmount: els.waterAmount.value.trim(),
    lastWatered: els.lastWatered.value || toISODate(new Date()),
    notes: els.plantNotes.value.trim()
    };
    if (!existing.id) {
    plant.x = 50;
    plant.y = 50;
    state.plants.push(plant);
    } else {
    state.plants = state.plants.map(p => p.id === id ? plant : p);
    }
    resetForm();
    render();
}

function waterPlant(id) {
    state.plants = state.plants.map(plant => plant.id === id ? { ...plant, lastWatered: toISODate(new Date()) } : plant);
    render();
}

function deletePlant(id) {
    const plant = state.plants.find(p => p.id === id);
    if (!plant) return;
    const ok = confirm(`Delete ${plant.name}?`);
    if (!ok) return;
    state.plants = state.plants.filter(p => p.id !== id);
    render();
}

function switchTab(tabId) {
    els.tabs.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
    els.sections.forEach(section => section.classList.toggle("active", section.id === tabId));
}

async function handlePhotoUpload(file) {
    if (!file) return;
    const dataUrl = await resizeImage(file, 1600, 0.82);
    state.photoDataUrl = dataUrl;
    render();
}

function resizeImage(file, maxSide = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => { img.src = reader.result; };
    img.onerror = reject;
    img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
    };
    reader.readAsDataURL(file);
    });
}

function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `yard-plant-care-backup-${toISODate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
    try {
        const imported = JSON.parse(reader.result);
        if (!Array.isArray(imported.plants)) throw new Error("Backup file does not include plants.");
        state = { ...structuredClone(defaultState), ...imported };
        saveState();
        render();
        alert("Backup imported.");
    } catch (err) {
        alert("Could not import that backup file.");
        console.error(err);
    }
    };
    reader.readAsText(file);
}

async function enableNotifications() {
    if (!("Notification" in window)) {
    alert("This browser does not support web notifications.");
    return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
    alert("Notifications enabled. The app will notify you about due plants when it is open or recently active.");
    checkDueAndNotify(true);
    } else {
    alert("Notifications were not enabled. You can still use the in-app due list and calendar reminders.");
    }
}

function checkDueAndNotify(force = false) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const today = toISODate(new Date());
    if (!force && state.lastNotificationDate === today) return;
    const due = state.plants.filter(p => waterStatus(p).sort <= 0);
    if (!due.length) return;
    state.lastNotificationDate = today;
    saveState();
    const title = due.length === 1 ? `${due[0].name} needs water` : `${due.length} plants need water`;
    const body = due.map(p => `${p.icon || "🌿"} ${p.name}`).slice(0, 5).join(", ");
    new Notification(title, { body });
}

function makeIcsDate(dateString) {
    return dateString.replaceAll("-", "");
}

function downloadCalendarReminders() {
    if (!state.plants.length) {
    alert("Add plants first, then download calendar reminders.");
    return;
    }
    const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SproutScout//Plant Reminders//EN",
    "CALSCALE:GREGORIAN"
    ];
    state.plants.forEach(plant => {
    const start = makeIcsDate(plant.lastWatered || toISODate(new Date()));
    const interval = Number(plant.waterInterval || 7);
    lines.push(
        "BEGIN:VEVENT",
        `UID:${plant.id}@yard-plant-care`,
        `DTSTART;VALUE=DATE:${start}`,
        `RRULE:FREQ=DAILY;INTERVAL=${interval}`,
        `SUMMARY:Water ${icsEscape(plant.name)}`,
        `DESCRIPTION:${icsEscape(`${plant.icon || ""} ${plant.name}\nWater: ${plant.waterAmount || "Check soil and water as needed."}\nLight: ${plant.light || "Unknown"}\nLocation: ${plant.location || "Unknown"}`)}`,
        "END:VEVENT"
    );
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "yard-plant-watering-reminders.ics";
    link.click();
    URL.revokeObjectURL(url);
}

function icsEscape(text) {
    return String(text)
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function showPhoneTips() {
    alert("Phone setup:\n\n1. Publish this file on GitHub Pages.\n2. Open the github.io link on your phone.\n3. Add it to your home screen from your browser share/menu button.\n4. Use Backup > Export backup before changing phones or clearing browser data.");
}

els.tabs.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
els.plantForm.addEventListener("submit", savePlantFromForm);
els.plantName.addEventListener("input", autofillPlantFromLibrary);
els.plantName.addEventListener("change", autofillPlantFromLibrary);
els.resetForm.addEventListener("click", resetForm);
els.plantList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "water") waterPlant(id);
    if (action === "edit") editPlant(id);
    if (action === "delete") deletePlant(id);
    if (action === "place") {
    els.selectedPlant.value = id;
    switchTab("map");
    renderMap();
    }
});
els.dueList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "water") waterPlant(button.dataset.id);
    if (button.dataset.action === "edit") editPlant(button.dataset.id);
});
els.selectedPlant.addEventListener("change", renderMap);
els.yardMap.addEventListener("click", (event) => {
    if (event.target.closest(".pin")) return;
    const id = els.selectedPlant.value;
    if (!id) return;
    placePlantAtPointer(id, event);
});
els.yardMap.addEventListener("pointermove", moveDrag);
els.yardMap.addEventListener("pointerup", endDrag);
els.yardMap.addEventListener("pointercancel", endDrag);
els.photoUpload.addEventListener("change", event => handlePhotoUpload(event.target.files[0]));
els.clearPhoto.addEventListener("click", () => { state.photoDataUrl = ""; render(); });
els.enableNotifications.addEventListener("click", enableNotifications);
els.downloadIcs.addEventListener("click", downloadCalendarReminders);
els.exportJson.addEventListener("click", exportBackup);
els.importJson.addEventListener("change", event => importBackup(event.target.files[0]));
els.installHintBtn.addEventListener("click", showPhoneTips);

resetForm();
render();
loadPlantCareLibrary();
setInterval(() => checkDueAndNotify(false), 60 * 60 * 1000);