const STORAGE_KEY = "potencia_da_guerra_profiles_v1";
const CURRENT_PROFILE_KEY = "potencia_da_guerra_current_profile";

const BUILDINGS = {
  townHall: { name: "Town Hall", icon: "TH", cost: { gold: 0, energy: 0 }, production: { gold: 0, energy: 0 }, hp: 400 },
  goldMine: { name: "Gold Mine", icon: "GM", cost: { gold: 120, energy: 25 }, production: { gold: 14, energy: 0 }, hp: 120 },
  energyPlant: { name: "Energy Plant", icon: "EP", cost: { gold: 90, energy: 30 }, production: { gold: 0, energy: 13 }, hp: 120 },
  barracks: { name: "Barracks", icon: "BR", cost: { gold: 180, energy: 90 }, production: { gold: 0, energy: 0 }, hp: 170 },
  storage: { name: "Storage", icon: "ST", cost: { gold: 120, energy: 55 }, production: { gold: 0, energy: 0 }, hp: 150 },
  defense: { name: "Defense", icon: "DF", cost: { gold: 140, energy: 90 }, production: { gold: 0, energy: 0 }, hp: 190 }
};

const GRID_SIZE = 10;
const SAVE_INTERVAL_MS = 5000;
const TICK_INTERVAL_MS = 1000;

let selectedBuildType = null;
let selectedBuildingId = null;
let selectedEnemy = null;
let profileId = null;
let state = null;

const els = {
  playerName: document.getElementById("playerName"),
  playerLevel: document.getElementById("playerLevel"),
  playerXp: document.getElementById("playerXp"),
  playerTrophies: document.getElementById("playerTrophies"),
  goldCount: document.getElementById("goldCount"),
  energyCount: document.getElementById("energyCount"),
  buildMenu: document.getElementById("buildMenu"),
  buildHint: document.getElementById("buildHint"),
  grid: document.getElementById("grid"),
  selectedCard: document.getElementById("selectedCard"),
  upgradeBtn: document.getElementById("upgradeBtn"),
  findEnemyBtn: document.getElementById("findEnemyBtn"),
  attackBtn: document.getElementById("attackBtn"),
  enemyCard: document.getElementById("enemyCard"),
  leaderboard: document.getElementById("leaderboard"),
  log: document.getElementById("log"),
  profileModal: document.getElementById("profileModal"),
  profileNameInput: document.getElementById("profileNameInput"),
  startGameBtn: document.getElementById("startGameBtn")
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function loadProfiles() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
}

function saveProfiles(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function createInitialState(name) {
  const now = Date.now();
  return {
    id: uid(),
    name,
    level: 1,
    xp: 0,
    trophies: 100,
    gold: 650,
    energy: 450,
    buildings: [
      { id: uid(), type: "townHall", x: 4, y: 4, level: 1 },
      { id: uid(), type: "goldMine", x: 2, y: 2, level: 1 },
      { id: uid(), type: "energyPlant", x: 6, y: 2, level: 1 },
      { id: uid(), type: "barracks", x: 3, y: 7, level: 1 },
      { id: uid(), type: "defense", x: 6, y: 6, level: 1 }
    ],
    lastTick: now,
    updatedAt: now
  };
}

function saveCurrentState() {
  const profiles = loadProfiles();
  state.updatedAt = Date.now();
  profiles[profileId] = state;
  saveProfiles(profiles);
}

function calculateLevel(xp) {
  return Math.floor(Math.sqrt(xp / 80)) + 1;
}

function buildingAt(x, y) {
  return state.buildings.find((b) => b.x === x && b.y === y);
}

function getBuildingStats(building) {
  const data = BUILDINGS[building.type];
  const levelFactor = 1 + (building.level - 1) * 0.45;
  return {
    hp: Math.floor(data.hp * levelFactor),
    productionGold: Math.floor(data.production.gold * levelFactor),
    productionEnergy: Math.floor(data.production.energy * levelFactor)
  };
}

function getStorageCaps() {
  let goldCap = 1200;
  let energyCap = 1100;
  state.buildings.forEach((b) => {
    if (b.type === "townHall") {
      goldCap += 500 * b.level;
      energyCap += 500 * b.level;
    }
    if (b.type === "storage") {
      goldCap += 900 * b.level;
      energyCap += 900 * b.level;
    }
  });
  return { goldCap, energyCap };
}

function collectProduction(deltaSeconds) {
  let perMinuteGold = 0;
  let perMinuteEnergy = 0;
  state.buildings.forEach((building) => {
    const s = getBuildingStats(building);
    perMinuteGold += s.productionGold;
    perMinuteEnergy += s.productionEnergy;
  });

  const gainedGold = (perMinuteGold / 60) * deltaSeconds;
  const gainedEnergy = (perMinuteEnergy / 60) * deltaSeconds;
  const caps = getStorageCaps();
  state.gold = clamp(state.gold + gainedGold, 0, caps.goldCap);
  state.energy = clamp(state.energy + gainedEnergy, 0, caps.energyCap);
}

function upgradeCost(building) {
  const base = BUILDINGS[building.type].cost;
  const mult = 1 + building.level * 0.75;
  return {
    gold: Math.floor(base.gold * mult + 45),
    energy: Math.floor(base.energy * mult + 30)
  };
}

function addLog(msg) {
  const item = document.createElement("div");
  item.className = "log-item";
  item.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  els.log.prepend(item);
  while (els.log.children.length > 40) {
    els.log.removeChild(els.log.lastChild);
  }
}

function renderTop() {
  const caps = getStorageCaps();
  els.playerName.textContent = state.name;
  els.playerLevel.textContent = `${state.level}`;
  els.playerXp.textContent = `${Math.floor(state.xp)}`;
  els.playerTrophies.textContent = `${state.trophies}`;
  els.goldCount.textContent = `${Math.floor(state.gold)} / ${caps.goldCap}`;
  els.energyCount.textContent = `${Math.floor(state.energy)} / ${caps.energyCap}`;
}

function renderBuildMenu() {
  els.buildMenu.innerHTML = "";
  Object.entries(BUILDINGS).forEach(([key, b]) => {
    if (key === "townHall") return;
    const el = document.createElement("button");
    el.className = `build-card${selectedBuildType === key ? " active" : ""}`;
    el.innerHTML = `<strong>${b.name}</strong><br />${b.cost.gold}G / ${b.cost.energy}E`;
    el.onclick = () => {
      selectedBuildType = selectedBuildType === key ? null : key;
      renderBuildMenu();
      els.buildHint.textContent = selectedBuildType
        ? `${BUILDINGS[selectedBuildType].name} selected. Tap an empty tile.`
        : "Select a building, then tap an empty tile.";
    };
    els.buildMenu.appendChild(el);
  });
}

function renderGrid() {
  els.grid.innerHTML = "";
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const cell = document.createElement("button");
      const b = buildingAt(x, y);
      cell.className = `cell${b ? " occupied" : ""}${b && b.id === selectedBuildingId ? " selected" : ""}`;
      cell.innerHTML = b ? `${BUILDINGS[b.type].icon}<br/>Lv${b.level}` : "";
      cell.onclick = () => onCellClick(x, y);
      els.grid.appendChild(cell);
    }
  }
}

function renderSelected() {
  const b = state.buildings.find((i) => i.id === selectedBuildingId);
  if (!b) {
    els.selectedCard.textContent = "No building selected.";
    return;
  }
  const stats = getBuildingStats(b);
  const cost = upgradeCost(b);
  els.selectedCard.innerHTML = `
    <strong>${BUILDINGS[b.type].name} (Lv ${b.level})</strong><br/>
    HP ${stats.hp} | +${stats.productionGold}G/min | +${stats.productionEnergy}E/min<br/>
    Upgrade: ${cost.gold}G / ${cost.energy}E
  `;
}

function offensePower() {
  const barracksLevel = state.buildings.filter((b) => b.type === "barracks").reduce((a, b) => a + b.level, 0);
  const levelBonus = state.level * 10;
  return 80 + barracksLevel * 45 + levelBonus;
}

function defensePower() {
  let defense = 70;
  state.buildings.forEach((b) => {
    if (b.type === "defense") defense += 55 * b.level;
    if (b.type === "townHall") defense += 45 * b.level;
  });
  return defense;
}

function buildEnemyFromLeaderboard() {
  const profiles = Object.values(loadProfiles()).filter((p) => p.id !== state.id);
  if (profiles.length > 0) {
    const pick = profiles[Math.floor(Math.random() * profiles.length)];
    return {
      id: pick.id,
      name: pick.name,
      level: pick.level,
      trophies: pick.trophies,
      power: 70 + pick.level * 20 + Math.floor(Math.random() * 65),
      rewardGold: 80 + pick.level * 25,
      rewardEnergy: 70 + pick.level * 25
    };
  }
  const botLevel = clamp(state.level + Math.floor(Math.random() * 3) - 1, 1, 99);
  return {
    id: `bot-${uid()}`,
    name: `Bot Lv${botLevel}`,
    level: botLevel,
    trophies: 100 + botLevel * 12,
    power: 75 + botLevel * 22 + Math.floor(Math.random() * 70),
    rewardGold: 120 + botLevel * 35,
    rewardEnergy: 100 + botLevel * 30
  };
}

function renderEnemy() {
  if (!selectedEnemy) {
    els.enemyCard.textContent = "No enemy selected.";
    return;
  }
  els.enemyCard.innerHTML = `
    <strong>${selectedEnemy.name}</strong><br/>
    Level ${selectedEnemy.level} | Trophies ${selectedEnemy.trophies}<br/>
    Estimated defense: ${selectedEnemy.power}
  `;
}

function renderLeaderboard() {
  const profiles = Object.values(loadProfiles()).sort((a, b) => b.trophies - a.trophies || b.level - a.level);
  els.leaderboard.innerHTML = "";
  profiles.slice(0, 12).forEach((p, i) => {
    const item = document.createElement("div");
    item.className = "rank-item";
    item.textContent = `#${i + 1} ${p.name} | Lv ${p.level} | ${p.trophies} trophies`;
    els.leaderboard.appendChild(item);
  });
}

function rerender() {
  renderTop();
  renderBuildMenu();
  renderGrid();
  renderSelected();
  renderEnemy();
  renderLeaderboard();
}

function spend(cost) {
  if (state.gold < cost.gold || state.energy < cost.energy) return false;
  state.gold -= cost.gold;
  state.energy -= cost.energy;
  return true;
}

function gainXp(v) {
  state.xp += v;
  const old = state.level;
  state.level = calculateLevel(state.xp);
  if (state.level > old) addLog(`Level up! You are now level ${state.level}.`);
}

function onCellClick(x, y) {
  const existing = buildingAt(x, y);
  if (existing) {
    selectedBuildingId = existing.id;
    selectedBuildType = null;
    rerender();
    return;
  }
  if (!selectedBuildType) return;

  const cfg = BUILDINGS[selectedBuildType];
  if (!spend(cfg.cost)) {
    addLog(`Not enough resources to build ${cfg.name}.`);
    return;
  }
  state.buildings.push({ id: uid(), type: selectedBuildType, x, y, level: 1 });
  gainXp(25);
  addLog(`${cfg.name} was built at (${x + 1}, ${y + 1}).`);
  selectedBuildType = null;
  selectedBuildingId = null;
  saveCurrentState();
  rerender();
}

function handleUpgrade() {
  const b = state.buildings.find((i) => i.id === selectedBuildingId);
  if (!b) return;
  const cost = upgradeCost(b);
  if (!spend(cost)) {
    addLog("Not enough resources for upgrade.");
    return;
  }
  b.level += 1;
  gainXp(35 + b.level * 3);
  addLog(`${BUILDINGS[b.type].name} upgraded to Lv ${b.level}.`);
  saveCurrentState();
  rerender();
}

function handleFindEnemy() {
  selectedEnemy = buildEnemyFromLeaderboard();
  addLog(`Enemy spotted: ${selectedEnemy.name} (power ${selectedEnemy.power}).`);
  rerender();
}

function handleAttack() {
  if (!selectedEnemy) {
    addLog("Find an enemy first.");
    return;
  }
  const myPower = Math.floor(offensePower() * (0.85 + Math.random() * 0.35));
  const enemyPower = Math.floor(selectedEnemy.power * (0.8 + Math.random() * 0.45));
  const won = myPower >= enemyPower;
  if (won) {
    const goldLoot = Math.floor(selectedEnemy.rewardGold * (0.8 + Math.random() * 0.5));
    const energyLoot = Math.floor(selectedEnemy.rewardEnergy * (0.8 + Math.random() * 0.5));
    state.gold += goldLoot;
    state.energy += energyLoot;
    state.trophies += 11;
    gainXp(60);
    addLog(`Victory against ${selectedEnemy.name}! +${goldLoot}G +${energyLoot}E +11 trophies.`);
  } else {
    state.trophies = Math.max(0, state.trophies - 7);
    gainXp(18);
    addLog(`Defeat against ${selectedEnemy.name}. -7 trophies.`);
  }
  saveCurrentState();
  rerender();
}

function tick() {
  const now = Date.now();
  const delta = (now - state.lastTick) / 1000;
  state.lastTick = now;
  collectProduction(delta);
  rerender();
}

function chooseProfile() {
  const remembered = localStorage.getItem(CURRENT_PROFILE_KEY);
  const profiles = loadProfiles();
  if (remembered && profiles[remembered]) {
    profileId = remembered;
    state = profiles[profileId];
    return;
  }
  els.profileModal.classList.add("show");
}

function startWithName() {
  const name = els.profileNameInput.value.trim();
  if (name.length < 3) return;
  state = createInitialState(name);
  profileId = state.id;
  const profiles = loadProfiles();
  profiles[profileId] = state;
  saveProfiles(profiles);
  localStorage.setItem(CURRENT_PROFILE_KEY, profileId);
  els.profileModal.classList.remove("show");
  rerender();
  addLog(`Welcome, ${state.name}. Your kingdom begins now.`);
}

function init() {
  chooseProfile();
  if (!state) {
    els.startGameBtn.onclick = startWithName;
    els.profileNameInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") startWithName();
    });
    return;
  }
  rerender();
}

els.upgradeBtn.onclick = handleUpgrade;
els.findEnemyBtn.onclick = handleFindEnemy;
els.attackBtn.onclick = handleAttack;

window.addEventListener("beforeunload", saveCurrentState);
setInterval(() => {
  if (!state) return;
  saveCurrentState();
}, SAVE_INTERVAL_MS);
setInterval(() => {
  if (!state) return;
  tick();
}, TICK_INTERVAL_MS);

init();
