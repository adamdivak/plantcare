// PlantCare/app.js

import { getAll, get, put, del } from './db.js';

// ===== STATE =====

let plants = [];
let selectedIds = new Set();
let lastUsedRoom = '';
let editingPlantId = null; // null = adding new

// ===== EMOJI SET =====

const PLANT_EMOJIS = [
  '🪴','🌿','🌵','🌸','🍀','🌱','🌶️','🪻','🌻','🌺',
  '🌾','🍃','🌳','🌴','🎋','🎍','🌹','🌷','🌼','💐',
  '🪷','🌲','🎄','🍁','🍂','🌽','🍅','🍓','🫐','🥑',
];

// ===== HELPERS =====

function generateId() {
  return crypto.randomUUID();
}

function defaultSeasons() {
  return [
    { name: 'Summer', startMonth: 4, startDay: 1, endMonth: 9, endDay: 30, waterDays: 7, fertilizerDays: 14 },
    { name: 'Winter', startMonth: 10, startDay: 1, endMonth: 3, endDay: 31, waterDays: 14, fertilizerDays: 0 },
  ];
}

function newPlant(roomName) {
  return {
    id: generateId(),
    name: '',
    icon: '🪴',
    roomName: roomName || '',
    seasons: defaultSeasons(),
    lastWatered: null,
    lastFertilized: null,
    createdAt: new Date().toISOString(),
  };
}

function getActiveSeason(plant) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  for (const s of plant.seasons) {
    if (dateInSeason(month, day, s)) return s;
  }
  return plant.seasons[0];
}

function dateInSeason(month, day, season) {
  const cur = month * 100 + day;
  const start = season.startMonth * 100 + season.startDay;
  const end = season.endMonth * 100 + season.endDay;
  if (start <= end) {
    return cur >= start && cur <= end;
  }
  // wraps around year (e.g., Oct-Mar)
  return cur >= start || cur <= end;
}

function daysUntilDue(lastDate, freqDays, createdAt) {
  if (freqDays <= 0) return null;
  // If never watered/fertilized, count from creation date
  const refDate = lastDate || createdAt;
  if (!refDate) return null;
  const ref = new Date(refDate);
  const due = new Date(ref);
  due.setDate(due.getDate() + freqDays);
  const now = new Date();
  now.setHours(0,0,0,0);
  due.setHours(0,0,0,0);
  const diff = Math.round((due - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function getPlantStatus(plant) {
  const season = getActiveSeason(plant);
  const waterDue = daysUntilDue(plant.lastWatered, season.waterDays, plant.createdAt);
  const fertDue = daysUntilDue(plant.lastFertilized, season.fertilizerDays, plant.createdAt);

  let mostUrgent = null;
  let type = null;

  if (waterDue !== null && fertDue !== null) {
    if (waterDue <= fertDue) { mostUrgent = waterDue; type = 'water'; }
    else { mostUrgent = fertDue; type = 'fertilizer'; }
  } else if (waterDue !== null) {
    mostUrgent = waterDue; type = 'water';
  } else if (fertDue !== null) {
    mostUrgent = fertDue; type = 'fertilizer';
  }

  return { daysLeft: mostUrgent, type };
}

function formatCountdown(days) {
  if (days === null) return { text: '—', cssClass: 'countdown-gray' };
  if (days === 0) return { text: 'today', cssClass: 'countdown-amber' };
  if (days < 0) return { text: `−${Math.abs(days)}d`, cssClass: 'countdown-red' };
  if (days <= 3) return { text: `${days}d`, cssClass: 'countdown-amber' };
  if (days >= 14) return { text: `${Math.round(days/7)}w`, cssClass: 'countdown-green' };
  return { text: `${days}d`, cssClass: 'countdown-green' };
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ===== RENDERING =====

function groupByRoom(plants) {
  const rooms = new Map();
  for (const p of plants) {
    const room = p.roomName || 'Uncategorized';
    if (!rooms.has(room)) rooms.set(room, []);
    rooms.get(room).push(p);
  }
  return rooms;
}

function renderHome() {
  const grid = document.getElementById('plant-grid');
  const emptyState = document.getElementById('empty-state');

  if (plants.length === 0) {
    grid.hidden = true;
    emptyState.hidden = false;
    updateActionBar();
    return;
  }

  grid.hidden = false;
  emptyState.hidden = true;
  grid.innerHTML = '';

  const rooms = groupByRoom(plants);
  for (const [roomName, roomPlants] of rooms) {
    const section = document.createElement('div');
    section.className = 'room-section';

    const header = document.createElement('div');
    header.className = 'room-header';
    header.textContent = roomName;
    header.addEventListener('click', () => toggleRoomSelection(roomName, roomPlants));
    section.appendChild(header);

    const roomGrid = document.createElement('div');
    roomGrid.className = 'room-grid';

    for (const plant of roomPlants) {
      const tile = createPlantTile(plant);
      roomGrid.appendChild(tile);
    }

    section.appendChild(roomGrid);
    grid.appendChild(section);
  }

  updateActionBar();
}

function createPlantTile(plant) {
  const status = getPlantStatus(plant);
  const countdown = formatCountdown(status.daysLeft);
  const isOverdue = status.daysLeft !== null && status.daysLeft < 0;
  const isSelected = selectedIds.has(plant.id);

  const tile = document.createElement('div');
  tile.className = 'plant-tile' + (isSelected ? ' selected' : '') + (isOverdue ? ' overdue' : '');
  tile.dataset.id = plant.id;

  tile.innerHTML = `
    <div class="plant-tile-inner">
      <div class="select-check">✓</div>
      ${isOverdue ? '<div class="plant-badge">⚠️</div>' : ''}
      <span class="plant-icon">${plant.icon}</span>
      <span class="plant-countdown ${countdown.cssClass}">${countdown.text}</span>
    </div>
    <div class="plant-name">${plant.name || 'Unnamed'}</div>
  `;

  tile.addEventListener('click', () => toggleSelection(plant.id));

  return tile;
}

// ===== SELECTION =====

function toggleSelection(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  renderHome();
}

function toggleRoomSelection(roomName, roomPlants) {
  const roomIds = roomPlants.map(p => p.id);
  const allSelected = roomIds.every(id => selectedIds.has(id));
  if (allSelected) {
    roomIds.forEach(id => selectedIds.delete(id));
  } else {
    roomIds.forEach(id => selectedIds.add(id));
  }
  renderHome();
}

function clearSelection() {
  selectedIds.clear();
}

function updateActionBar() {
  const count = selectedIds.size;
  const btnWater = document.getElementById('btn-water');
  const btnFert = document.getElementById('btn-fertilize');
  const btnEdit = document.getElementById('btn-edit');

  btnWater.disabled = count === 0;
  btnFert.disabled = count === 0;
  btnEdit.disabled = count !== 1;

  const waterLabel = btnWater.querySelector('.action-label');
  const fertLabel = btnFert.querySelector('.action-label');
  waterLabel.textContent = count > 0 ? `Water (${count})` : 'Water';
  fertLabel.textContent = count > 0 ? `Fertilize (${count})` : 'Fertilize';
}

// ===== ACTIONS =====

async function waterSelected() {
  const now = new Date().toISOString();
  const wateredIds = [...selectedIds];
  for (const id of wateredIds) {
    const plant = plants.find(p => p.id === id);
    if (plant) {
      plant.lastWatered = now;
      await put(plant);
    }
  }
  clearSelection();
  plants = await getAll();
  renderHome();
  showWateredFeedback(wateredIds);
}

async function fertilizeSelected() {
  const now = new Date().toISOString();
  for (const id of selectedIds) {
    const plant = plants.find(p => p.id === id);
    if (plant) {
      plant.lastFertilized = now;
      await put(plant);
    }
  }
  clearSelection();
  plants = await getAll();
  renderHome();
}

function showWateredFeedback(ids) {
  for (const id of ids) {
    const tile = document.querySelector(`.plant-tile[data-id="${id}"]`);
    if (!tile) continue;
    const inner = tile.querySelector('.plant-tile-inner');
    const badge = document.createElement('div');
    badge.className = 'plant-badge badge-watered';
    badge.textContent = '💧';
    inner.appendChild(badge);
  }
}

// ===== EDIT SCREEN =====

function openEditScreen(plantId) {
  editingPlantId = plantId;
  const plant = plantId ? plants.find(p => p.id === plantId) : newPlant(lastUsedRoom);

  document.getElementById('edit-title').textContent = plantId ? 'Edit Plant' : 'New Plant';
  document.getElementById('edit-icon-display').textContent = plant.icon;
  document.getElementById('edit-name').value = plant.name;
  document.getElementById('edit-room').value = plant.roomName;

  // Populate room suggestions
  const datalist = document.getElementById('room-suggestions');
  datalist.innerHTML = '';
  const rooms = [...new Set(plants.map(p => p.roomName).filter(Boolean))];
  for (const room of rooms) {
    const opt = document.createElement('option');
    opt.value = room;
    datalist.appendChild(opt);
  }

  // Populate seasons
  populateSeasonInputs(plant.seasons);

  // Populate history
  renderHistory(plant);

  // Show/hide delete + duplicate for new plants
  document.getElementById('btn-delete').style.display = plantId ? '' : 'none';
  document.getElementById('btn-duplicate').style.display = plantId ? '' : 'none';
  document.getElementById('btn-water-now').style.display = plantId ? '' : 'none';
  document.getElementById('btn-fert-now').style.display = plantId ? '' : 'none';

  document.getElementById('edit-screen').hidden = false;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_IN_MONTH = [31,29,31,30,31,30,31,31,30,31,30,31]; // use 29 for Feb to allow leap years

function initMonthDaySelects() {
  const monthSelects = document.querySelectorAll('.monthday-input[id$="-month"]');
  for (const sel of monthSelects) {
    sel.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = MONTH_NAMES[m - 1];
      sel.appendChild(opt);
    }
  }
  const daySelects = document.querySelectorAll('.monthday-input[id$="-day"]');
  for (const sel of daySelects) {
    populateDaySelect(sel, 31);
  }
}

function populateDaySelect(sel, maxDays) {
  const current = parseInt(sel.value, 10) || 1;
  sel.innerHTML = '';
  for (let d = 1; d <= maxDays; d++) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    sel.appendChild(opt);
  }
  sel.value = Math.min(current, maxDays);
}

function updateDaySelectForMonth(monthSelectId) {
  const monthSel = document.getElementById(monthSelectId);
  const daySelId = monthSelectId.replace('-month', '-day');
  const daySel = document.getElementById(daySelId);
  const month = parseInt(monthSel.value, 10);
  populateDaySelect(daySel, DAYS_IN_MONTH[month - 1]);
}

function setMonthDay(prefix, month, day) {
  document.getElementById(prefix + '-month').value = month;
  const daySel = document.getElementById(prefix + '-day');
  populateDaySelect(daySel, DAYS_IN_MONTH[month - 1]);
  daySel.value = day;
}

function getMonthDay(prefix) {
  return {
    month: parseInt(document.getElementById(prefix + '-month').value, 10),
    day: parseInt(document.getElementById(prefix + '-day').value, 10),
  };
}

function populateSeasonInputs(seasons) {
  const summer = seasons.find(s => s.name === 'Summer') || seasons[0];
  const winter = seasons.find(s => s.name === 'Winter') || seasons[1];

  setMonthDay('summer-start', summer.startMonth, summer.startDay);
  setMonthDay('summer-end', summer.endMonth, summer.endDay);
  document.getElementById('summer-water').value = summer.waterDays;
  document.getElementById('summer-fert').value = summer.fertilizerDays;

  setMonthDay('winter-start', winter.startMonth, winter.startDay);
  setMonthDay('winter-end', winter.endMonth, winter.endDay);
  document.getElementById('winter-water').value = winter.waterDays;
  document.getElementById('winter-fert').value = winter.fertilizerDays;
}

function formatMonthDay(month, day) {
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

function nextDay(month, day) {
  const d = new Date(2024, month - 1, day);
  d.setDate(d.getDate() + 1);
  return { month: d.getMonth() + 1, day: d.getDate() };
}

function collectPlantFromForm() {
  const existing = editingPlantId ? plants.find(p => p.id === editingPlantId) : null;
  const plant = existing ? { ...existing } : newPlant(lastUsedRoom);

  plant.name = document.getElementById('edit-name').value.trim();
  plant.icon = document.getElementById('edit-icon-display').textContent;
  plant.roomName = document.getElementById('edit-room').value.trim();

  const summerStart = getMonthDay('summer-start');
  const summerEnd = getMonthDay('summer-end');
  const winterStart = getMonthDay('winter-start');
  const winterEnd = getMonthDay('winter-end');

  plant.seasons = [
    {
      name: 'Summer',
      startMonth: summerStart.month,
      startDay: summerStart.day,
      endMonth: summerEnd.month,
      endDay: summerEnd.day,
      waterDays: parseInt(document.getElementById('summer-water').value, 10) || 0,
      fertilizerDays: parseInt(document.getElementById('summer-fert').value, 10) || 0,
    },
    {
      name: 'Winter',
      startMonth: winterStart.month,
      startDay: winterStart.day,
      endMonth: winterEnd.month,
      endDay: winterEnd.day,
      waterDays: parseInt(document.getElementById('winter-water').value, 10) || 0,
      fertilizerDays: parseInt(document.getElementById('winter-fert').value, 10) || 0,
    },
  ];

  return plant;
}

async function savePlant() {
  const plant = collectPlantFromForm();
  if (plant.roomName) lastUsedRoom = plant.roomName;
  await put(plant);
  plants = await getAll();
  closeEditScreen();
  clearSelection();
  renderHome();
}

function closeEditScreen() {
  editingPlantId = null;
  document.getElementById('edit-screen').hidden = true;
}

function renderHistory(plant) {
  const list = document.getElementById('history-list');
  const season = getActiveSeason(plant);
  const waterDue = daysUntilDue(plant.lastWatered, season.waterDays, plant.createdAt);
  const fertDue = daysUntilDue(plant.lastFertilized, season.fertilizerDays, plant.createdAt);

  const nextWaterText = waterDue !== null
    ? `${formatNextDate(plant.lastWatered || plant.createdAt, season.waterDays)} (${formatCountdown(waterDue).text})`
    : '—';
  const nextFertText = fertDue !== null
    ? `${formatNextDate(plant.lastFertilized || plant.createdAt, season.fertilizerDays)} (${formatCountdown(fertDue).text})`
    : '—';

  list.innerHTML = `
    <div class="history-row">
      <span class="history-label">💧 Last watered</span>
      <span class="history-value">${formatDate(plant.lastWatered)}</span>
    </div>
    <div class="history-row">
      <span class="history-label">💧 Next watering</span>
      <span class="history-value">${nextWaterText}</span>
    </div>
    <div class="history-row">
      <span class="history-label">🧪 Last fertilized</span>
      <span class="history-value">${formatDate(plant.lastFertilized)}</span>
    </div>
    <div class="history-row">
      <span class="history-label">🧪 Next fertilizer</span>
      <span class="history-value">${nextFertText}</span>
    </div>
  `;
}

function formatNextDate(lastDate, freqDays) {
  if (!lastDate || freqDays <= 0) return '—';
  const d = new Date(lastDate);
  d.setDate(d.getDate() + freqDays);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ===== EMOJI PICKER =====

function openEmojiPicker() {
  const grid = document.getElementById('emoji-grid');
  grid.innerHTML = '';
  for (const emoji of PLANT_EMOJIS) {
    const btn = document.createElement('button');
    btn.className = 'emoji-option';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      document.getElementById('edit-icon-display').textContent = emoji;
      closeEmojiPicker();
    });
    grid.appendChild(btn);
  }
  document.getElementById('emoji-picker').hidden = false;
}

function closeEmojiPicker() {
  document.getElementById('emoji-picker').hidden = true;
}

// ===== SEASON AUTO-ADJUST =====

function prevDay(month, day) {
  const d = new Date(2024, month - 1, day);
  d.setDate(d.getDate() - 1);
  return { month: d.getMonth() + 1, day: d.getDate() };
}

function setupSeasonListeners() {
  // Update day options when month changes
  for (const id of ['summer-start-month','summer-end-month','winter-start-month','winter-end-month']) {
    document.getElementById(id).addEventListener('change', () => updateDaySelectForMonth(id));
  }

  // Summer end changed → adjust winter start to next day
  const summerEndChanged = () => {
    const { month, day } = getMonthDay('summer-end');
    const next = nextDay(month, day);
    setMonthDay('winter-start', next.month, next.day);
  };
  document.getElementById('summer-end-month').addEventListener('change', summerEndChanged);
  document.getElementById('summer-end-day').addEventListener('change', summerEndChanged);

  // Winter end changed → adjust summer start to next day
  const winterEndChanged = () => {
    const { month, day } = getMonthDay('winter-end');
    const next = nextDay(month, day);
    setMonthDay('summer-start', next.month, next.day);
  };
  document.getElementById('winter-end-month').addEventListener('change', winterEndChanged);
  document.getElementById('winter-end-day').addEventListener('change', winterEndChanged);

  // Summer start changed → adjust winter end to previous day
  const summerStartChanged = () => {
    const { month, day } = getMonthDay('summer-start');
    const prev = prevDay(month, day);
    setMonthDay('winter-end', prev.month, prev.day);
  };
  document.getElementById('summer-start-month').addEventListener('change', summerStartChanged);
  document.getElementById('summer-start-day').addEventListener('change', summerStartChanged);

  // Winter start changed → adjust summer end to previous day
  const winterStartChanged = () => {
    const { month, day } = getMonthDay('winter-start');
    const prev = prevDay(month, day);
    setMonthDay('summer-end', prev.month, prev.day);
  };
  document.getElementById('winter-start-month').addEventListener('change', winterStartChanged);
  document.getElementById('winter-start-day').addEventListener('change', winterStartChanged);
}

// ===== DUPLICATE & DELETE =====

async function duplicatePlant() {
  const plant = collectPlantFromForm();
  const dup = { ...plant, id: generateId(), name: plant.name + ' (copy)', lastWatered: null, lastFertilized: null, createdAt: new Date().toISOString() };
  await put(dup);
  plants = await getAll();
  closeEditScreen();
  clearSelection();
  renderHome();
}

async function deletePlant() {
  if (!editingPlantId) return;
  if (!confirm('Delete this plant?')) return;
  await del(editingPlantId);
  plants = await getAll();
  closeEditScreen();
  clearSelection();
  renderHome();
}

async function waterNow() {
  if (!editingPlantId) return;
  const plant = plants.find(p => p.id === editingPlantId);
  if (!plant) return;
  plant.lastWatered = new Date().toISOString();
  await put(plant);
  plants = await getAll();
  renderHistory(plant);
}

async function fertilizeNow() {
  if (!editingPlantId) return;
  const plant = plants.find(p => p.id === editingPlantId);
  if (!plant) return;
  plant.lastFertilized = new Date().toISOString();
  await put(plant);
  plants = await getAll();
  renderHistory(plant);
}

// ===== EVENT WIRING =====

function init() {
  // Initialize month/day dropdowns
  initMonthDaySelects();

  // Action bar
  document.getElementById('btn-water').addEventListener('click', waterSelected);
  document.getElementById('btn-fertilize').addEventListener('click', fertilizeSelected);
  document.getElementById('btn-edit').addEventListener('click', () => {
    if (selectedIds.size === 1) {
      openEditScreen([...selectedIds][0]);
    }
  });
  document.getElementById('btn-add').addEventListener('click', () => openEditScreen(null));
  document.getElementById('empty-add-btn').addEventListener('click', () => openEditScreen(null));

  // Edit screen
  document.getElementById('btn-back').addEventListener('click', closeEditScreen);
  document.getElementById('btn-save').addEventListener('click', savePlant);
  document.getElementById('edit-icon-btn').addEventListener('click', openEmojiPicker);
  document.getElementById('btn-duplicate').addEventListener('click', duplicatePlant);
  document.getElementById('btn-delete').addEventListener('click', deletePlant);
  document.getElementById('btn-water-now').addEventListener('click', waterNow);
  document.getElementById('btn-fert-now').addEventListener('click', fertilizeNow);

  // Emoji picker
  document.getElementById('emoji-picker-backdrop').addEventListener('click', closeEmojiPicker);

  // Season auto-adjust
  setupSeasonListeners();
}

// ===== BOOT =====

async function boot() {
  init();
  plants = await getAll();
  renderHome();
}

boot();
