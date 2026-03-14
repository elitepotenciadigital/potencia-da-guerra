const STORAGE_KEY = "pdg_profiles_v2";
const CURRENT_KEY = "pdg_current_profile_v2";

const GRID_SIZE = 10;
const SAVE_INTERVAL = 5000;
const TICK_INTERVAL = 1000;

const BUILDINGS = {
  townHall: {
    id: "townHall",
    name: "Centro",
    short: "CT",
    tileClass: "townhall",
    cost: { gold: 0, energy: 0 },
    hp: 500,
    production: { gold: 0, energy: 0 },
    defense: 20
  },
  goldMine: {
    id: "goldMine",
    name: "Mina de Ouro",
    short: "MO",
    tileClass: "mine",
    cost: { gold: 120, energy: 35 },
    hp: 140,
    production: { gold: 18, energy: 0 },
    defense: 3
  },
  energyPlant: {
    id: "energyPlant",
    name: "Gerador",
    short: "GE",
    tileClass: "energy",
    cost: { gold: 95, energy: 30 },
    hp: 140,
    production: { gold: 0, energy: 17 },
    defense: 3
  },
  barracks: {
    id: "barracks",
    name: "Quartel",
    short: "QT",
    tileClass: "barracks",
    cost: { gold: 185, energy: 95 },
    hp: 180,
    production: { gold: 0, energy: 0 },
    defense: 8
  },
  storage: {
    id: "storage",
    name: "Armazem",
    short: "AR",
    tileClass: "storage",
    cost: { gold: 140, energy: 70 },
    hp: 170,
    production: { gold: 0, energy: 0 },
    defense: 6
  },
  defenseTower: {
    id: "defenseTower",
    name: "Torre",
    short: "TD",
    tileClass: "defense",
    cost: { gold: 170, energy: 105 },
    hp: 210,
    production: { gold: 0, energy: 0 },
    defense: 30
  }
};

const BUILD_MENU_KEYS = ["goldMine", "energyPlant", "barracks", "storage", "defenseTower"];

let selectedBuildType = null;
let selectedBuildingId = null;
let selectedEnemy = null;
let profileId = null;
let state = null;

const ui = {
  playerName: document.getElementById("uiPlayerName"),
  level: document.getElementById("uiLevel"),
  xp: document.getElementById("uiXp"),
  trophies: document.getElementById("uiTrophies"),
  gold: document.getElementById("uiGold"),
  energy: document.getElementById("uiEnergy"),
  troops: document.getElementById("uiTroops"),
  buildTip: document.getElementById("buildTip"),
  baseGrid: document.getElementById("baseGrid"),
  buildMenu: document.getElementById("buildMenu"),
  selectedInfo: document.getElementById("selectedInfo"),
  enemyInfo: document.getElementById("enemyInfo"),
  leaderboard: document.getElementById("leaderboard"),
  battleLog: document.getElementById("battleLog"),
  btnUpgrade: document.getElementById("btnUpgrade"),
  btnTrain1: document.getElementById("btnTrain1"),
  btnTrain5: document.getElementById("btnTrain5"),
  btnScout: document.getElementById("btnScout"),
  btnAttack: document.getElementById("btnAttack"),
  modalProfile: document.getElementById("modalProfile"),
  inputProfileName: document.getElementById("inputProfileName"),
  btnStart: document.getElementById("btnStart")
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadProfiles() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
}

function saveProfiles(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function makeNewProfile(name) {
  const now = Date.now();
  return {
    id: uid(),
    name,
    level: 1,
    xp: 0,
    trophies: 100,
    gold: 700,
    energy: 500,
    troops: 8,
    buildings: [
      { id: uid(), type: "townHall", x: 4, y: 4, level: 1 },
      { id: uid(), type: "goldMine", x: 2, y: 2, level: 1 },
      { id: uid(), type: "energyPlant", x: 6, y: 2, level: 1 },
      { id: uid(), type: "barracks", x: 2, y: 6, level: 1 },
      { id: uid(), type: "defenseTower", x: 6, y: 6, level: 1 }
    ],
    lastTick: now,
    updatedAt: now
  };
}

function buildingAt(x, y) {
  return state.buildings.find((b) => b.x === x && b.y === y) || null;
}

function getBuildingState(id) {
  return state.buildings.find((b) => b.id === id) || null;
}

function buildingLevelFactor(level) {
  return 1 + (level - 1) * 0.45;
}

function buildingStats(building) {
  const cfg = BUILDINGS[building.type];
  const f = buildingLevelFactor(building.level);
  return {
    hp: Math.floor(cfg.hp * f),
    prodGold: Math.floor(cfg.production.gold * f),
    prodEnergy: Math.floor(cfg.production.energy * f),
    defense: Math.floor(cfg.defense * f)
  };
}

function capacity() {
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

function perMinuteProduction() {
  let gold = 0;
  let energy = 0;
  state.buildings.forEach((b) => {
    const s = buildingStats(b);
    gold += s.prodGold;
    energy += s.prodEnergy;
  });
  return { gold, energy };
}

function totalDefense() {
  return state.buildings.reduce((sum, b) => sum + buildingStats(b).defense, 0);
}

function totalOffense() {
  let barracks = 0;
  state.buildings.forEach((b) => {
    if (b.type === "barracks") barracks += b.level;
  });
  return 70 + state.troops * 11 + barracks * 42 + state.level * 9;
}

function addXp(value) {
  state.xp += value;
  const old = state.level;
  state.level = Math.floor(Math.sqrt(state.xp / 90)) + 1;
  if (state.level > old) {
    log(`Subiu de nivel! Agora voce e nivel ${state.level}.`);
  }
}

function spend(cost) {
  if (state.gold < cost.gold || state.energy < cost.energy) return false;
  state.gold -= cost.gold;
  state.energy -= cost.energy;
  return true;
}

function upgradeCost(building) {
  const base = BUILDINGS[building.type].cost;
  const m = 1 + building.level * 0.82;
  return {
    gold: Math.floor(base.gold * m + 55),
    energy: Math.floor(base.energy * m + 35)
  };
}

function trainCost(amount) {
  return {
    gold: amount * 28,
    energy: amount * 22
  };
}

function syncProduction(deltaSeconds) {
  const prod = perMinuteProduction();
  const caps = capacity();
  state.gold = clamp(state.gold + (prod.gold / 60) * deltaSeconds, 0, caps.goldCap);
  state.energy = clamp(state.energy + (prod.energy / 60) * deltaSeconds, 0, caps.energyCap);
}

function saveCurrent() {
  const profiles = loadProfiles();
  state.updatedAt = Date.now();
  profiles[profileId] = state;
  saveProfiles(profiles);
}

function log(message) {
  const line = document.createElement("div");
  line.className = "battle-line";
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  ui.battleLog.prepend(line);
  while (ui.battleLog.children.length > 45) {
    ui.battleLog.removeChild(ui.battleLog.lastChild);
  }
}

function renderHeader() {
  const caps = capacity();
  ui.playerName.textContent = state.name;
  ui.level.textContent = String(state.level);
  ui.xp.textContent = String(Math.floor(state.xp));
  ui.trophies.textContent = String(state.trophies);
  ui.gold.textContent = `${Math.floor(state.gold)} / ${caps.goldCap}`;
  ui.energy.textContent = `${Math.floor(state.energy)} / ${caps.energyCap}`;
  ui.troops.textContent = String(state.troops);
}

function renderBuildMenu() {
  ui.buildMenu.innerHTML = "";
  BUILD_MENU_KEYS.forEach((key) => {
    const b = BUILDINGS[key];
    const el = document.createElement("button");
    el.className = `build-item${selectedBuildType === key ? " active" : ""}`;
    el.innerHTML = `<strong>${b.name}</strong><span>${b.cost.gold} ouro / ${b.cost.energy} energia</span>`;
    el.onclick = () => {
      selectedBuildType = selectedBuildType === key ? null : key;
      renderBuildMenu();
      ui.buildTip.textContent = selectedBuildType
        ? `Modo construcao: ${BUILDINGS[selectedBuildType].name}. Toque em um tile vazio.`
        : "Selecione uma construção e toque em um tile vazio.";
    };
    ui.buildMenu.appendChild(el);
  });
}

function tileText(b) {
  return `${BUILDINGS[b.type].short}\nLv${b.level}`;
}

function renderGrid() {
  ui.baseGrid.innerHTML = "";
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const b = buildingAt(x, y);
      const tile = document.createElement("button");
      tile.className = `tile${b ? " occupied " + BUILDINGS[b.type].tileClass : ""}${b && b.id === selectedBuildingId ? " sel" : ""}`;
      tile.textContent = b ? tileText(b) : "";
      tile.onclick = () => handleTileClick(x, y);
      ui.baseGrid.appendChild(tile);
    }
  }
}

function renderSelected() {
  const b = getBuildingState(selectedBuildingId);
  if (!b) {
    ui.selectedInfo.textContent = "Nenhum edificio selecionado.";
    return;
  }
  const s = buildingStats(b);
  const c = upgradeCost(b);
  ui.selectedInfo.innerHTML = `
    <strong>${BUILDINGS[b.type].name} (Lv ${b.level})</strong><br>
    HP: ${s.hp} | Defesa: ${s.defense}<br>
    Producao: +${s.prodGold} ouro/min e +${s.prodEnergy} energia/min<br>
    Upgrade: ${c.gold} ouro / ${c.energy} energia
  `;
}

function renderEnemy() {
  if (!selectedEnemy) {
    ui.enemyInfo.textContent = "Nenhum alvo encontrado.";
    return;
  }
  ui.enemyInfo.innerHTML = `
    <strong>${selectedEnemy.name}</strong><br>
    Nivel ${selectedEnemy.level} | Trofeus ${selectedEnemy.trophies}<br>
    Defesa estimada: ${selectedEnemy.defense}
  `;
}

function renderLeaderboard() {
  const profiles = Object.values(loadProfiles()).sort((a, b) => b.trophies - a.trophies || b.level - a.level);
  ui.leaderboard.innerHTML = "";
  profiles.slice(0, 12).forEach((p, idx) => {
    const item = document.createElement("div");
    item.className = "rank";
    item.textContent = `#${idx + 1} ${p.name} | Nv ${p.level} | ${p.trophies} trofeus`;
    ui.leaderboard.appendChild(item);
  });
}

function renderAll() {
  renderHeader();
  renderBuildMenu();
  renderGrid();
  renderSelected();
  renderEnemy();
  renderLeaderboard();
}

function handleTileClick(x, y) {
  const existing = buildingAt(x, y);
  if (existing) {
    selectedBuildingId = existing.id;
    selectedBuildType = null;
    renderAll();
    return;
  }
  if (!selectedBuildType) return;

  const cfg = BUILDINGS[selectedBuildType];
  if (!spend(cfg.cost)) {
    log(`Recursos insuficientes para ${cfg.name}.`);
    return;
  }

  state.buildings.push({
    id: uid(),
    type: selectedBuildType,
    x,
    y,
    level: 1
  });
  addXp(24);
  log(`${cfg.name} construido em (${x + 1}, ${y + 1}).`);
  selectedBuildType = null;
  selectedBuildingId = null;
  saveCurrent();
  renderAll();
}

function onUpgrade() {
  const b = getBuildingState(selectedBuildingId);
  if (!b) {
    log("Selecione um edificio primeiro.");
    return;
  }
  const c = upgradeCost(b);
  if (!spend(c)) {
    log("Recursos insuficientes para upgrade.");
    return;
  }
  b.level += 1;
  addXp(34 + b.level * 4);
  log(`${BUILDINGS[b.type].name} melhorado para Lv ${b.level}.`);
  saveCurrent();
  renderAll();
}

function onTrain(amount) {
  const hasBarracks = state.buildings.some((b) => b.type === "barracks");
  if (!hasBarracks) {
    log("Voce precisa de um Quartel para treinar tropas.");
    return;
  }
  const c = trainCost(amount);
  if (!spend(c)) {
    log("Recursos insuficientes para treinar tropas.");
    return;
  }
  state.troops += amount;
  addXp(6 * amount);
  log(`Treinamento concluido: +${amount} tropas.`);
  saveCurrent();
  renderAll();
}

function randomEnemy() {
  const others = Object.values(loadProfiles()).filter((p) => p.id !== state.id);
  if (others.length > 0) {
    const p = others[Math.floor(Math.random() * others.length)];
    return {
      id: p.id,
      name: p.name,
      level: p.level,
      trophies: p.trophies,
      defense: 80 + p.level * 18 + Math.floor(Math.random() * 60),
      lootGold: 130 + p.level * 35,
      lootEnergy: 110 + p.level * 33
    };
  }
  const lvl = clamp(state.level + Math.floor(Math.random() * 3) - 1, 1, 99);
  return {
    id: `bot-${uid()}`,
    name: `Bot ${lvl}`,
    level: lvl,
    trophies: 100 + lvl * 10,
    defense: 90 + lvl * 20 + Math.floor(Math.random() * 75),
    lootGold: 150 + lvl * 38,
    lootEnergy: 130 + lvl * 34
  };
}

function onScout() {
  selectedEnemy = randomEnemy();
  log(`Alvo encontrado: ${selectedEnemy.name} (defesa ${selectedEnemy.defense}).`);
  renderAll();
}

function onAttack() {
  if (!selectedEnemy) {
    log("Procure um alvo antes de atacar.");
    return;
  }
  if (state.troops <= 0) {
    log("Voce nao tem tropas. Treine antes de atacar.");
    return;
  }

  const usedTroops = Math.max(1, Math.floor(state.troops * 0.5));
  const attack = Math.floor(totalOffense() * (0.85 + Math.random() * 0.35));
  const defense = Math.floor(selectedEnemy.defense * (0.8 + Math.random() * 0.45));
  const win = attack >= defense;

  if (win) {
    const goldLoot = Math.floor(selectedEnemy.lootGold * (0.75 + Math.random() * 0.5));
    const energyLoot = Math.floor(selectedEnemy.lootEnergy * (0.75 + Math.random() * 0.5));
    state.gold += goldLoot;
    state.energy += energyLoot;
    state.trophies += 12;
    addXp(70);
    log(`Vitoria! +${goldLoot} ouro, +${energyLoot} energia, +12 trofeus.`);
  } else {
    state.trophies = Math.max(0, state.trophies - 8);
    addXp(20);
    log(`Derrota. Voce perdeu 8 trofeus.`);
  }

  state.troops = Math.max(0, state.troops - usedTroops);
  log(`Tropas usadas no ataque: ${usedTroops}.`);
  selectedEnemy = null;
  saveCurrent();
  renderAll();
}

function gameTick() {
  const now = Date.now();
  const delta = (now - state.lastTick) / 1000;
  state.lastTick = now;
  syncProduction(delta);
  renderHeader();
}

function chooseOrCreateProfile() {
  const remembered = localStorage.getItem(CURRENT_KEY);
  const profiles = loadProfiles();
  if (remembered && profiles[remembered]) {
    profileId = remembered;
    state = profiles[remembered];
    return;
  }
  ui.modalProfile.classList.add("show");
}

function startProfile() {
  const name = ui.inputProfileName.value.trim();
  if (name.length < 3) return;
  state = makeNewProfile(name);
  profileId = state.id;
  const profiles = loadProfiles();
  profiles[profileId] = state;
  saveProfiles(profiles);
  localStorage.setItem(CURRENT_KEY, profileId);
  ui.modalProfile.classList.remove("show");
  log(`Bem-vindo, ${state.name}. Seu reino comecou.`);
  renderAll();
}

function wireEvents() {
  ui.btnUpgrade.onclick = onUpgrade;
  ui.btnTrain1.onclick = () => onTrain(1);
  ui.btnTrain5.onclick = () => onTrain(5);
  ui.btnScout.onclick = onScout;
  ui.btnAttack.onclick = onAttack;
  ui.btnStart.onclick = startProfile;
  ui.inputProfileName.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") startProfile();
  });
  window.addEventListener("beforeunload", () => {
    if (state) saveCurrent();
  });
}

function init() {
  wireEvents();
  chooseOrCreateProfile();
  if (!state) return;
  renderAll();
  const prod = perMinuteProduction();
  log(`Produzindo ${prod.gold} ouro/min e ${prod.energy} energia/min.`);
}

setInterval(() => {
  if (!state) return;
  gameTick();
}, TICK_INTERVAL);

setInterval(() => {
  if (!state) return;
  saveCurrent();
}, SAVE_INTERVAL);

init();
